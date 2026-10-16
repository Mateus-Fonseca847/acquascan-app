import { GradeSegmentos } from './grade';
import { haversineM, ProjecaoLocal } from './geo';
import { HeapBinario } from './heap';
import type {
  ArestaBruta,
  AtributosAresta,
  Encaixe,
  GrafoBruto,
  LatLng,
  OpcoesRota,
  ResultadoRota,
  Trecho,
} from './tipos';
import { validarGrafo } from './validar';

const VELOCIDADE_PADRAO_KMH = 4.5;
const MAX_ENCAIXE_PADRAO_M = 250;

/**
 * A heurística do A* é a distância em linha reta até o destino, e nunca pode passar do custo real
 * mínimo (senão o A* pode devolver uma rota que não é a melhor). Dois cuidados:
 *  - a distância é calculada no plano local, que difere do haversine em menos de 0,1%; o fator
 *    0,99 cobre isso com folga;
 *  - os comprimentos do grafo são arredondados (0,1 m) e as coordenadas têm 6 casas (~0,1 m), então
 *    uma aresta pode ser uns 0,2 m mais curta que a reta entre suas pontas; a folga de 3 m cobre
 *    uma sequência de arestas minúsculas. Custa pouca precisão da heurística e garante a admissibilidade.
 * Como todo multiplicador é >= 1, a distância em metros continua sendo um limite inferior do custo.
 */
const FATOR_HEURISTICA = 0.99;
const FOLGA_HEURISTICA_M = 3;

/** Tolerância (em metros) ao comparar posições ao longo de uma geometria. */
const EPS_POSICAO_M = 1e-7;

const BIT_ESCADA = 1;
const BIT_PONTE = 2;
const BIT_TUNEL = 4;
const BIT_SENTIDO_UNICO = 8;

/** Custo de percorrer `distancia` numa aresta de multiplicador `m`. Distância 0 custa 0 mesmo se m = Infinity. */
const custoParcial = (distancia: number, m: number): number =>
  distancia === 0 ? 0 : distancia * m;

const comoLatLng = (lat: number, lon: number): LatLng => ({ latitude: lat, longitude: lon });

/** Resultado da busca de caminho, guardado em campos para não alocar no laço principal. */
interface ResultadoBusca {
  custo: number;
  /** 0 = o destino foi alcançado pelo nó `de` da aresta dele; 1 = pelo nó `para`. */
  fim: 0 | 1;
  expandidos: number;
}

export class Roteador {
  readonly totalNos: number;
  readonly totalArestas: number;

  private readonly projecao: ProjecaoLocal;

  // Nós
  private readonly noX: Float64Array;
  private readonly noY: Float64Array;

  // Arestas
  private readonly de: Int32Array;
  private readonly para: Int32Array;
  private readonly comprimento: Float64Array;
  private readonly flags: Uint8Array;
  private readonly nomes: (string | null)[];
  private readonly classes: string[];

  // Geometrias achatadas: os vértices da aresta e ficam em geoIni[e] .. geoIni[e + 1] - 1
  private readonly geoIni: Int32Array;
  private readonly geoLat: Float64Array;
  private readonly geoLon: Float64Array;
  /** Comprimento acumulado (metros, haversine) até cada vértice, desde o começo da aresta. */
  private readonly geoAcum: Float64Array;
  /** Comprimento total (metros) da geometria simplificada de cada aresta. */
  private readonly geoTotal: Float64Array;

  // Adjacência em CSR. Um arco é 2 * aresta (de -> para) ou 2 * aresta + 1 (para -> de).
  private readonly adjIni: Int32Array;
  private readonly adjArco: Int32Array;

  private readonly grade: GradeSegmentos;
  private readonly umPorAresta: Float32Array;

  // Área de trabalho do A*, reaproveitada entre as buscas.
  private readonly g: Float64Array;
  private readonly predArco: Int32Array;
  private readonly lado: Int8Array;
  private readonly marca: Uint32Array;
  private carimbo = 0;
  private readonly heap = new HeapBinario(4096);

  // Resultado do último encaixe interno.
  private encArestaId = -1;
  private encPosicaoM = 0;
  private encDistanciaM = 0;
  private encLat = 0;
  private encLon = 0;

  constructor(grafo: GrafoBruto) {
    const nos = grafo.nos;
    const arestas = grafo.arestas;
    const nNos = nos.length;
    const nArestas = arestas.length;
    this.totalNos = nNos;
    this.totalArestas = nArestas;

    // Referência da projeção plana: o centro dos nós.
    let latMedia = 0;
    let lonMedia = 0;
    for (const no of nos) {
      latMedia += no.lat;
      lonMedia += no.lon;
    }
    this.projecao = new ProjecaoLocal(
      nNos > 0 ? latMedia / nNos : 0,
      nNos > 0 ? lonMedia / nNos : 0,
    );

    this.noX = new Float64Array(nNos);
    this.noY = new Float64Array(nNos);
    for (let i = 0; i < nNos; i++) {
      this.noX[i] = this.projecao.x(nos[i]!.lon);
      this.noY[i] = this.projecao.y(nos[i]!.lat);
    }

    this.de = new Int32Array(nArestas);
    this.para = new Int32Array(nArestas);
    this.comprimento = new Float64Array(nArestas);
    this.flags = new Uint8Array(nArestas);
    this.nomes = new Array<string | null>(nArestas);
    this.classes = new Array<string>(nArestas);

    let totalVertices = 0;
    for (const a of arestas) totalVertices += a.geometria.length;
    this.geoIni = new Int32Array(nArestas + 1);
    this.geoLat = new Float64Array(totalVertices);
    this.geoLon = new Float64Array(totalVertices);
    this.geoAcum = new Float64Array(totalVertices);
    this.geoTotal = new Float64Array(nArestas);
    const vx = new Float64Array(totalVertices);
    const vy = new Float64Array(totalVertices);
    const arestaDoVertice = new Int32Array(totalVertices);

    let v = 0;
    const grauSaida = new Int32Array(nNos + 1);
    for (let e = 0; e < nArestas; e++) {
      const a: ArestaBruta = arestas[e]!;
      this.de[e] = a.de;
      this.para[e] = a.para;
      this.comprimento[e] = a.comprimentoM;
      this.flags[e] =
        (a.escada ? BIT_ESCADA : 0) |
        (a.ponte ? BIT_PONTE : 0) |
        (a.tunel ? BIT_TUNEL : 0) |
        (a.sentidoUnico ? BIT_SENTIDO_UNICO : 0);
      this.nomes[e] = a.nome ?? null;
      this.classes[e] = a.classe;

      this.geoIni[e] = v;
      let acumulado = 0;
      for (let k = 0; k < a.geometria.length; k++) {
        const [lat, lon] = a.geometria[k]!;
        if (k > 0) acumulado += haversineM(this.geoLat[v - 1]!, this.geoLon[v - 1]!, lat, lon);
        this.geoLat[v] = lat;
        this.geoLon[v] = lon;
        this.geoAcum[v] = acumulado;
        vx[v] = this.projecao.x(lon);
        vy[v] = this.projecao.y(lat);
        arestaDoVertice[v] = e;
        v++;
      }
      this.geoTotal[e] = acumulado;

      grauSaida[a.de]!++;
      if (!a.sentidoUnico) grauSaida[a.para]!++;
    }
    this.geoIni[nArestas] = v;

    // CSR: começo de cada nó e a lista de arcos que saem dele.
    this.adjIni = new Int32Array(nNos + 1);
    for (let n = 0; n < nNos; n++) this.adjIni[n + 1] = this.adjIni[n]! + grauSaida[n]!;
    this.adjArco = new Int32Array(this.adjIni[nNos]!);
    const cursor = this.adjIni.slice(0, nNos);
    for (let e = 0; e < nArestas; e++) {
      const deNo = this.de[e]!;
      this.adjArco[cursor[deNo]!++] = 2 * e;
      if ((this.flags[e]! & BIT_SENTIDO_UNICO) === 0) {
        const paraNo = this.para[e]!;
        this.adjArco[cursor[paraNo]!++] = 2 * e + 1;
      }
    }

    this.grade = new GradeSegmentos(vx, vy, arestaDoVertice);
    this.umPorAresta = new Float32Array(nArestas).fill(1);

    this.g = new Float64Array(nNos);
    this.predArco = new Int32Array(nNos);
    this.lado = new Int8Array(nNos);
    this.marca = new Uint32Array(nNos);
  }

  /** Tamanho aproximado, em bytes, das estruturas indexadas (typed arrays). */
  get bytesEstimados(): number {
    return (
      this.noX.byteLength +
      this.noY.byteLength +
      this.de.byteLength +
      this.para.byteLength +
      this.comprimento.byteLength +
      this.flags.byteLength +
      this.geoIni.byteLength +
      this.geoLat.byteLength +
      this.geoLon.byteLength +
      this.geoAcum.byteLength +
      this.geoTotal.byteLength +
      this.adjIni.byteLength +
      this.adjArco.byteLength +
      this.grade.bytes +
      this.umPorAresta.byteLength +
      this.g.byteLength +
      this.predArco.byteLength +
      this.lado.byteLength +
      this.marca.byteLength +
      this.heap.bytes
    );
  }

  atributos(arestaId: number): Readonly<AtributosAresta> {
    if (!Number.isInteger(arestaId) || arestaId < 0 || arestaId >= this.totalArestas) {
      throw new Error(`arestaId ${arestaId} fora do intervalo (0 a ${this.totalArestas - 1}).`);
    }
    const f = this.flags[arestaId]!;
    return {
      nome: this.nomes[arestaId]!,
      classe: this.classes[arestaId]!,
      comprimentoM: this.comprimento[arestaId]!,
      escada: (f & BIT_ESCADA) !== 0,
      ponte: (f & BIT_PONTE) !== 0,
      tunel: (f & BIT_TUNEL) !== 0,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Encaixe
  // ---------------------------------------------------------------------------------------------

  /**
   * O ponto da rede mais próximo de `ponto`, sobre QUALQUER aresta (não só nos nós), ou null se
   * ele estiver a mais de `maxDistanciaM` metros.
   */
  encaixar(ponto: LatLng, maxDistanciaM = MAX_ENCAIXE_PADRAO_M): Encaixe | null {
    if (!this.buscarEncaixe(ponto, maxDistanciaM)) return null;
    return {
      arestaId: this.encArestaId,
      posicaoM: this.encPosicaoM,
      ponto: comoLatLng(this.encLat, this.encLon),
      distanciaM: this.encDistanciaM,
    };
  }

  private buscarEncaixe(ponto: LatLng, maxDistanciaM: number): boolean {
    if (!Number.isFinite(ponto.latitude) || !Number.isFinite(ponto.longitude)) {
      throw new Error('Ponto inválido: latitude e longitude devem ser números finitos.');
    }
    if (!(maxDistanciaM > 0) || !Number.isFinite(maxDistanciaM)) {
      throw new Error(
        `maxDistanciaM deve ser um número maior que zero (recebido ${maxDistanciaM}).`,
      );
    }
    const grade = this.grade;
    if (
      !grade.buscar(
        this.projecao.x(ponto.longitude),
        this.projecao.y(ponto.latitude),
        maxDistanciaM,
      )
    ) {
      return false;
    }

    const k = grade.segmento;
    const t = grade.t;
    const e = grade.arestaEncontrada;
    const ultimoSegmento = this.geoIni[e + 1]! - 2;

    // Posição ao longo da aresta: fração da geometria simplificada vezes o comprimento da aresta,
    // para somar exatamente a `comprimentoM`.
    const total = this.geoTotal[e]!;
    const along = this.geoAcum[k]! + t * (this.geoAcum[k + 1]! - this.geoAcum[k]!);
    let posicao = total > 0 ? (along / total) * this.comprimento[e]! : 0;
    if (k === ultimoSegmento && t === 1) posicao = this.comprimento[e]!;
    if (k === this.geoIni[e]! && t === 0) posicao = 0;

    this.encArestaId = e;
    this.encPosicaoM = posicao;
    this.encDistanciaM = grade.distancia;
    this.encLat = this.geoLat[k]! + t * (this.geoLat[k + 1]! - this.geoLat[k]!);
    this.encLon = this.geoLon[k]! + t * (this.geoLon[k + 1]! - this.geoLon[k]!);
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // Rota
  // ---------------------------------------------------------------------------------------------

  rotear(origem: LatLng, destino: LatLng, opcoes: OpcoesRota = {}): ResultadoRota {
    const velocidadeKmH = opcoes.velocidadeKmH ?? VELOCIDADE_PADRAO_KMH;
    if (!(velocidadeKmH > 0) || !Number.isFinite(velocidadeKmH)) {
      throw new Error(
        `velocidadeKmH deve ser um número maior que zero (recebido ${velocidadeKmH}).`,
      );
    }
    const maxEncaixeM = opcoes.maxEncaixeM ?? MAX_ENCAIXE_PADRAO_M;
    const mult = this.validarMultiplicadores(opcoes.multiplicadorPorAresta);

    if (!this.buscarEncaixe(origem, maxEncaixeM)) return { status: 'origem_longe' };
    const eo = this.encArestaId;
    const po = this.encPosicaoM;
    const distO = this.encDistanciaM;
    const pontoO = comoLatLng(this.encLat, this.encLon);

    if (!this.buscarEncaixe(destino, maxEncaixeM)) return { status: 'destino_longe' };
    const ed = this.encArestaId;
    const pd = this.encPosicaoM;
    const distD = this.encDistanciaM;
    const pontoD = comoLatLng(this.encLat, this.encLon);

    // Origem e destino no mesmo ponto da rede: nada a andar.
    if (eo === ed && po === pd) {
      return {
        status: 'ok',
        distanciaRedeM: 0,
        encaixeOrigemM: distO,
        encaixeDestinoM: distD,
        tempoS: 0,
        custo: 0,
        trechos: [],
        pontos: [pontoO],
        nosExpandidos: 0,
      };
    }

    const unicoO = (this.flags[eo]! & BIT_SENTIDO_UNICO) !== 0;
    const unicoD = (this.flags[ed]! & BIT_SENTIDO_UNICO) !== 0;
    const mo = mult[eo]!;
    const md = mult[ed]!;
    const compO = this.comprimento[eo]!;
    const compD = this.comprimento[ed]!;

    // Trajeto direto, quando origem e destino estão na MESMA aresta. Ele concorre com o que sai
    // pelas pontas e volta (por exemplo, quando a aresta tem multiplicador alto e há um desvio).
    let custoDireto = Infinity;
    if (eo === ed) {
      if (po < pd) custoDireto = custoParcial(pd - po, mo);
      else if (!unicoO) custoDireto = custoParcial(po - pd, mo);
    }

    const busca = this.buscarCaminho(
      mult,
      eo,
      po,
      ed,
      pd,
      pontoD.latitude,
      pontoD.longitude,
      custoDireto,
    );

    const usaDireto = custoDireto <= busca.custo && custoDireto < Infinity;
    if (!usaDireto && busca.custo === Infinity) return { status: 'sem_caminho' };

    const trechos = usaDireto
      ? this.trechoDireto(eo, po, pd, mult)
      : this.montarTrechos(mult, eo, po, ed, pd, busca.fim);

    const pontos: LatLng[] = [];
    let distanciaRedeM = 0;
    let custo = 0;
    for (const trecho of trechos) {
      distanciaRedeM += trecho.comprimentoM;
      custo += trecho.comprimentoM * trecho.multiplicador;
      anexarSemDuplicar(pontos, trecho.pontos);
    }

    return {
      status: 'ok',
      distanciaRedeM,
      encaixeOrigemM: distO,
      encaixeDestinoM: distD,
      tempoS: distanciaRedeM / (velocidadeKmH / 3.6),
      custo,
      trechos,
      pontos,
      nosExpandidos: usaDireto ? 0 : busca.expandidos,
    };
  }

  private validarMultiplicadores(fornecidos: Float32Array | undefined): Float32Array {
    if (fornecidos === undefined) return this.umPorAresta;
    if (fornecidos.length !== this.totalArestas) {
      throw new Error(
        `multiplicadorPorAresta tem ${fornecidos.length} valores, mas o grafo tem ${this.totalArestas} arestas (um por aresta).`,
      );
    }
    for (let i = 0; i < fornecidos.length; i++) {
      const m = fornecidos[i]!;
      // `!(m >= 1)` também pega NaN. Infinity é permitido (bloqueia a aresta).
      if (!(m >= 1)) {
        throw new Error(
          `multiplicadorPorAresta[${i}] = ${m} é inválido: cada valor deve ser >= 1 ou Infinity.`,
        );
      }
    }
    return fornecidos;
  }

  /**
   * A* com fontes e destinos virtuais: a origem e o destino ficam no MEIO de arestas. O custo de
   * chegar a cada ponta da aresta da origem já entra como custo inicial, e o de ir de cada ponta
   * da aresta do destino até o ponto é somado ao chegar nela.
   *
   * Sem alocar objetos no laço principal: tudo em typed arrays e campos.
   */
  private buscarCaminho(
    mult: Float32Array,
    eo: number,
    po: number,
    ed: number,
    pd: number,
    latDestino: number,
    lonDestino: number,
    custoDireto: number,
  ): ResultadoBusca {
    if (this.carimbo === 0xffffffff) {
      this.marca.fill(0);
      this.carimbo = 0;
    }
    const carimbo = ++this.carimbo;
    const { g, predArco, lado, marca, heap, de, para, comprimento, adjIni, adjArco, noX, noY } =
      this;
    heap.limpar();

    const destinoX = this.projecao.x(lonDestino);
    const destinoY = this.projecao.y(latDestino);
    const heuristica = (no: number): number => {
      const dx = noX[no]! - destinoX;
      const dy = noY[no]! - destinoY;
      const h = FATOR_HEURISTICA * Math.sqrt(dx * dx + dy * dy) - FOLGA_HEURISTICA_M;
      return h > 0 ? h : 0;
    };

    // Do ponto do destino, o caminho entra pela ponta `de` (andando no sentido da aresta) ou
    // pela ponta `para` (andando ao contrário, o que um sentido único proíbe).
    const noDeD = de[ed]!;
    const noParaD = para[ed]!;
    const md = mult[ed]!;
    const caudaDe = custoParcial(pd, md);
    const caudaPara =
      (this.flags[ed]! & BIT_SENTIDO_UNICO) !== 0
        ? Infinity
        : custoParcial(this.comprimento[ed]! - pd, md);

    // Fontes virtuais: da origem até cada ponta da aresta dela.
    const mo = mult[eo]!;
    const semearFonte = (no: number, custo: number, ladoFonte: 0 | 1): void => {
      if (custo === Infinity) return;
      if (marca[no] === carimbo && custo >= g[no]!) return;
      marca[no] = carimbo;
      g[no] = custo;
      predArco[no] = -1;
      lado[no] = ladoFonte;
      heap.inserir(custo + heuristica(no), no, custo);
    };
    if ((this.flags[eo]! & BIT_SENTIDO_UNICO) === 0) semearFonte(de[eo]!, custoParcial(po, mo), 0);
    semearFonte(para[eo]!, custoParcial(comprimento[eo]! - po, mo), 1);

    let melhor = Infinity;
    let fim: 0 | 1 = 0;
    let expandidos = 0;

    while (heap.tamanho > 0) {
      // O menor f da fila é um limite inferior para qualquer rota que ainda não vimos.
      if (heap.chaveTopo >= melhor || heap.chaveTopo >= custoDireto) break;
      heap.extrair();
      const u = heap.noExtraido;
      const gu = heap.gExtraido;
      if (gu > g[u]!) continue; // entrada velha: o nó já foi melhorado depois
      expandidos++;

      if (u === noDeD && gu + caudaDe < melhor) {
        melhor = gu + caudaDe;
        fim = 0;
      }
      if (u === noParaD && gu + caudaPara < melhor) {
        melhor = gu + caudaPara;
        fim = 1;
      }

      for (let a = adjIni[u]!; a < adjIni[u + 1]!; a++) {
        const arco = adjArco[a]!;
        const e = arco >> 1;
        const m = mult[e]!;
        if (m === Infinity) continue;
        const v = (arco & 1) === 0 ? para[e]! : de[e]!;
        const ng = gu + comprimento[e]! * m;
        if (marca[v] !== carimbo || ng < g[v]!) {
          marca[v] = carimbo;
          g[v] = ng;
          predArco[v] = arco;
          heap.inserir(ng + heuristica(v), v, ng);
        }
      }
    }

    return { custo: melhor, fim, expandidos };
  }

  // ---------------------------------------------------------------------------------------------
  // Montagem dos trechos
  // ---------------------------------------------------------------------------------------------

  private montarTrechos(
    mult: Float32Array,
    eo: number,
    po: number,
    ed: number,
    pd: number,
    fim: 0 | 1,
  ): Trecho[] {
    // Volta pelos predecessores, do nó em que o destino foi alcançado até a fonte.
    const arcos: number[] = [];
    let no = fim === 0 ? this.de[ed]! : this.para[ed]!;
    while (this.predArco[no] !== -1) {
      const arco = this.predArco[no]!;
      arcos.push(arco);
      no = (arco & 1) === 0 ? this.de[arco >> 1]! : this.para[arco >> 1]!;
    }
    arcos.reverse();
    const ladoOrigem = this.lado[no]!;

    const trechos: Trecho[] = [];

    // Primeira aresta: a parte entre o ponto de encaixe da origem e a ponta por onde sai.
    const compO = this.comprimento[eo]!;
    if (ladoOrigem === 0) {
      if (po > 0) trechos.push(this.criarTrecho(eo, 'inverso', 0, po, mult));
    } else if (compO - po > 0) {
      trechos.push(this.criarTrecho(eo, 'direto', po, compO, mult));
    }

    for (const arco of arcos) {
      const e = arco >> 1;
      trechos.push(
        this.criarTrecho(e, (arco & 1) === 0 ? 'direto' : 'inverso', 0, this.comprimento[e]!, mult),
      );
    }

    // Última aresta: da ponta por onde entra até o ponto de encaixe do destino.
    const compD = this.comprimento[ed]!;
    if (fim === 0) {
      if (pd > 0) trechos.push(this.criarTrecho(ed, 'direto', 0, pd, mult));
    } else if (compD - pd > 0) {
      trechos.push(this.criarTrecho(ed, 'inverso', pd, compD, mult));
    }
    return trechos;
  }

  private trechoDireto(e: number, de: number, ate: number, mult: Float32Array): Trecho[] {
    return de < ate
      ? [this.criarTrecho(e, 'direto', de, ate, mult)]
      : [this.criarTrecho(e, 'inverso', ate, de, mult)];
  }

  /** Trecho da aresta entre as posições a < b (metros desde o nó `de`), orientado conforme o sentido. */
  private criarTrecho(
    e: number,
    sentido: 'direto' | 'inverso',
    a: number,
    b: number,
    mult: Float32Array,
  ): Trecho {
    const pontos = this.cortarGeometria(e, a, b);
    if (sentido === 'inverso') pontos.reverse();
    return {
      arestaId: e,
      nome: this.nomes[e]!,
      classe: this.classes[e]!,
      sentido,
      comprimentoM: b - a,
      multiplicador: mult[e]!,
      pontos,
    };
  }

  /**
   * Os pontos da geometria da aresta entre as posições a <= b (metros desde `de`): o ponto
   * interpolado em `a`, os vértices do meio e o interpolado em `b`. No sentido do desenho da aresta.
   */
  private cortarGeometria(e: number, a: number, b: number): LatLng[] {
    const ini = this.geoIni[e]!;
    const fim = this.geoIni[e + 1]! - 1; // último vértice
    const comp = this.comprimento[e]!;
    const total = this.geoTotal[e]!;
    // Posição na escala da geometria. As pontas são exatas para não perder vértices por arredondamento.
    const ua = a <= 0 ? 0 : a >= comp ? total : (a / comp) * total;
    const ub = b >= comp ? total : b <= 0 ? 0 : (b / comp) * total;

    const pontos: LatLng[] = [];
    const adicionar = (lat: number, lon: number): void => {
      const ultimo = pontos[pontos.length - 1];
      if (ultimo === undefined || ultimo.latitude !== lat || ultimo.longitude !== lon) {
        pontos.push(comoLatLng(lat, lon));
      }
    };
    const interpolar = (u: number): void => {
      if (u <= 0) return adicionar(this.geoLat[ini]!, this.geoLon[ini]!);
      if (u >= total) return adicionar(this.geoLat[fim]!, this.geoLon[fim]!);
      for (let k = ini; k < fim; k++) {
        const proximo = this.geoAcum[k + 1]!;
        if (u <= proximo) {
          const inicio = this.geoAcum[k]!;
          const t = proximo > inicio ? (u - inicio) / (proximo - inicio) : 0;
          return adicionar(
            this.geoLat[k]! + t * (this.geoLat[k + 1]! - this.geoLat[k]!),
            this.geoLon[k]! + t * (this.geoLon[k + 1]! - this.geoLon[k]!),
          );
        }
      }
      adicionar(this.geoLat[fim]!, this.geoLon[fim]!);
    };

    interpolar(ua);
    for (let k = ini + 1; k < fim; k++) {
      const acum = this.geoAcum[k]!;
      if (acum > ua + EPS_POSICAO_M && acum < ub - EPS_POSICAO_M)
        adicionar(this.geoLat[k]!, this.geoLon[k]!);
    }
    interpolar(ub);
    return pontos;
  }
}

/** Junta `novos` ao fim de `destino`, sem repetir o vértice em que as duas linhas se encontram. */
function anexarSemDuplicar(destino: LatLng[], novos: readonly LatLng[]): void {
  for (const p of novos) {
    const ultimo = destino[destino.length - 1];
    if (
      ultimo === undefined ||
      ultimo.latitude !== p.latitude ||
      ultimo.longitude !== p.longitude
    ) {
      destino.push(p);
    }
  }
}

/**
 * Valida o grafo (erro claro em português se o formato estiver errado) e monta as estruturas
 * indexadas: adjacência em CSR, geometrias achatadas e a grade espacial.
 */
export function criarRoteador(grafo: GrafoBruto): Roteador {
  return new Roteador(validarGrafo(grafo));
}
