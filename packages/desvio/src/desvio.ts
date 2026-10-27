/**
 * A política de desvio de rios. Junta três coisas:
 *  - o roteador (A* sobre o grafo de ruas, com multiplicador de custo por rua);
 *  - a exposição das ruas aos rios (dados estáticos, calculados por tools/grafo);
 *  - o estado das estações (dinâmico: muda a cada minuto).
 *
 * PRINCÍPIO: o que o mapa mostra em vermelho é EXATAMENTE o que a rota evita. Por isso há uma
 * única fonte, `estadoDosSegmentos`, usada para colorir o mapa e para montar os multiplicadores.
 *
 * EXPOSIÇÃO DE UMA RUA: cada amostra da rua pertence a UM trecho de rio (o mais próximo; é como
 * tools/grafo calcula f15/f30/f50), então as frações de trechos diferentes são partes separadas
 * da mesma rua e se SOMAM: FC = min(1, soma dos trechos em CRITICO, faixa crítica) e
 * FA = min(1, soma dos trechos em ATENCAO, faixa de atenção), com FA limitada a 1 - FC.
 * Multiplicador = 1 + k.critico x FC + k.atencao x FA. Aproximação: uma amostra a 10 m de um
 * trecho em atenção e a 30 m de outro em crítico conta só para o primeiro (o mais próximo).
 *
 * Tudo aqui é lógica pura (sem relógio, sem rede, sem tela). A hora vem de quem chama.
 */
import type { Roteador } from '@aquascan/roteamento';
import { normalizarNome } from '@aquascan/shared';
import { calcularEstadoEfetivo } from './estados';
import { distPontoSegmento, haversineM, ProjecaoLocal } from './geo';
import { resolverPolitica, type Politica, type PoliticaParcial } from './politica';
import type {
  ApoioAvaliado,
  ApoioCadastro,
  Aviso,
  EstacaoCadastro,
  EstadoDoSegmento,
  EstadoEfetivo,
  EstadosAtuais,
  ExposicaoBruta,
  InfoSegmento,
  LatLng,
  LeituraEstacao,
  ModoDesvio,
  OpcoesRotaDesvio,
  ResultadoDesvio,
  ResumoCobertura,
  RiosGeoJson,
  RotaAvaliada,
  RotaEncontrada,
} from './tipos';
import { validarDados } from './validar';

const VELOCIDADE_PADRAO_KMH = 4.5;
/** Quantos apoios mais próximos pela rota mais curta entram, além dos mais próximos em linha reta. */
const APOIOS_PELA_ROTA = 2;
const COLUNA_PRIMEIRA_FRACAO = 4; // [aresta, segmento, cruza, distMin, f15, f30, f50]

export interface DadosDoDesvio {
  roteador: Roteador;
  exposicao: ExposicaoBruta;
  rios: RiosGeoJson;
}

/** Tudo o que depende das leituras e da hora: calculado uma vez por consulta. */
interface Contexto {
  estados: EstadosAtuais;
  /** Algum segmento está em CRITICO ou ATENCAO. */
  temRisco: boolean;
  temBloqueio: boolean;
  /** Multiplicadores sem Infinity (para a passada "menos exposta"). */
  multFinito: Float32Array;
  /** Multiplicadores com Infinity nas travessias críticas (passada estrita). */
  multEstrito: Float32Array;
  /** Por aresta: fração efetiva (a maior entre as entradas) em segmentos de cada estado. */
  fracCritica: Float64Array;
  fracAtencao: Float64Array;
  /** Por aresta: 1 se ela cruza algum segmento nesse estado. */
  travCritica: Uint8Array;
  travAtencao: Uint8Array;
  algumaDesconhecida: boolean;
  falhaSeguraEmUso: boolean;
}

export class Desvio {
  readonly politica: Readonly<Politica>;

  private readonly roteador: Roteador;
  private readonly estacoes: readonly EstacaoCadastro[];

  // Segmentos de rio (um por feature do GeoJSON)
  private readonly segIds: number[];
  private readonly segIndice = new Map<number, number>();
  private readonly segRio: string[];
  private readonly segKm: number[];
  /** Índice (em `estacoes`) da estação que governa o segmento, ou -1 se não é monitorado. */
  private readonly segEstacao: Int32Array;
  private readonly estacaoGoverna: number[][];
  private readonly estacaoTemAlcance: boolean[];

  // Entradas da exposição, em CSR por aresta
  private readonly entIni: Int32Array;
  private readonly entSeg: Int32Array;
  private readonly entCruza: Uint8Array;
  private readonly entFracCritica: Float64Array;
  private readonly entFracAtencao: Float64Array;
  private readonly arestasComEntrada: Int32Array;

  constructor(
    dados: DadosDoDesvio,
    estacoes: readonly EstacaoCadastro[],
    parcial?: PoliticaParcial,
  ) {
    const politica = resolverPolitica(parcial);
    this.politica = Object.freeze(politica);
    this.roteador = dados.roteador;
    const { roteador, exposicao, rios } = dados;
    const totalArestas = roteador.totalArestas;

    validarDados(exposicao, rios, totalArestas, [politica.critico.faixa, politica.atencao.faixa]);

    const ids = new Set<number>();
    for (const e of estacoes) {
      if (ids.has(e.id))
        throw new Error(`Cadastro de estações inválido: o id ${e.id} aparece mais de uma vez.`);
      ids.add(e.id);
      if (!Number.isFinite(e.latitude) || !Number.isFinite(e.longitude)) {
        throw new Error(
          `Cadastro de estações inválido: a estação ${e.id} tem latitude ou longitude inválida.`,
        );
      }
    }
    this.estacoes = [...estacoes];

    // ---------- Segmentos de rio e a estação que governa cada um ----------
    const features = rios.features;
    const nSeg = features.length;
    this.segIds = features.map((f) => f.properties.id);
    this.segRio = features.map((f) => f.properties.rio);
    this.segIds.forEach((id, i) => this.segIndice.set(id, i));

    let somaLat = 0;
    let somaLon = 0;
    let pontos = 0;
    for (const f of features) {
      for (const c of f.geometry.coordinates) {
        somaLon += c[0]!;
        somaLat += c[1]!;
        pontos++;
      }
    }
    const proj = new ProjecaoLocal(pontos ? somaLat / pontos : 0, pontos ? somaLon / pontos : 0);

    const estacaoX = this.estacoes.map((e) => proj.x(e.longitude));
    const estacaoY = this.estacoes.map((e) => proj.y(e.latitude));
    const estacaoRio = this.estacoes.map((e) => normalizarNome(e.rio));

    this.segEstacao = new Int32Array(nSeg).fill(-1);
    this.estacaoGoverna = this.estacoes.map(() => []);
    this.estacaoTemAlcance = this.estacoes.map(() => false);
    this.segKm = new Array<number>(nSeg).fill(0);

    features.forEach((f, i) => {
      const xs = f.geometry.coordinates.map((c) => proj.x(c[0]!));
      const ys = f.geometry.coordinates.map((c) => proj.y(c[1]!));
      let comprimento = 0;
      for (let k = 1; k < xs.length; k++)
        comprimento += Math.hypot(xs[k]! - xs[k - 1]!, ys[k]! - ys[k - 1]!);
      this.segKm[i] = (f.properties.comprimentoM ?? comprimento) / 1000;

      const chave = normalizarNome(f.properties.rio);
      let melhor = -1;
      let melhorDist = Infinity;
      this.estacoes.forEach((_, s) => {
        if (estacaoRio[s] !== chave) return;
        let d = Infinity;
        for (let k = 1; k < xs.length; k++) {
          d = Math.min(
            d,
            distPontoSegmento(estacaoX[s]!, estacaoY[s]!, xs[k - 1]!, ys[k - 1]!, xs[k]!, ys[k]!),
          );
        }
        if (d > politica.distanciaTrechoM) return;
        this.estacaoTemAlcance[s] = true;
        // Em empate, vence a estação de menor id (resultado determinístico).
        if (
          d < melhorDist ||
          (d === melhorDist && this.estacoes[s]!.id < this.estacoes[melhor]!.id)
        ) {
          melhorDist = d;
          melhor = s;
        }
      });
      if (melhor !== -1) {
        this.segEstacao[i] = melhor;
        this.estacaoGoverna[melhor]!.push(f.properties.id);
      }
    });

    // ---------- Entradas da exposição, indexadas por aresta ----------
    const idxCritica = exposicao.parametros.faixasM.indexOf(politica.critico.faixa);
    const idxAtencao = exposicao.parametros.faixasM.indexOf(politica.atencao.faixa);
    const entradas = [...exposicao.entradas].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    const n = entradas.length;
    this.entIni = new Int32Array(totalArestas + 1);
    this.entSeg = new Int32Array(n);
    this.entCruza = new Uint8Array(n);
    this.entFracCritica = new Float64Array(n);
    this.entFracAtencao = new Float64Array(n);

    const comprimento = new Float64Array(totalArestas);
    const arestasComEntrada: number[] = [];
    entradas.forEach((e, i) => {
      const aresta = e[0]!;
      if (this.entIni[aresta + 1] === 0 && (i === 0 || entradas[i - 1]![0] !== aresta))
        arestasComEntrada.push(aresta);
      this.entIni[aresta + 1]!++;
      if (comprimento[aresta] === 0) comprimento[aresta] = roteador.atributos(aresta).comprimentoM;

      const cruza = e[2] === 1;
      // Uma travessia tem pelo menos a largura assumida do rio, mesmo que a amostragem mal a note.
      const travessia = cruza ? Math.min(1, politica.larguraTravessiaM / comprimento[aresta]!) : 0;
      this.entSeg[i] = this.segIndice.get(e[1]!)!;
      this.entCruza[i] = cruza ? 1 : 0;
      this.entFracCritica[i] = Math.max(e[COLUNA_PRIMEIRA_FRACAO + idxCritica]!, travessia);
      this.entFracAtencao[i] = Math.max(e[COLUNA_PRIMEIRA_FRACAO + idxAtencao]!, travessia);
    });
    for (let a = 0; a < totalArestas; a++) this.entIni[a + 1]! += this.entIni[a]!;
    this.arestasComEntrada = Int32Array.from(arestasComEntrada);
  }

  // ---------------------------------------------------------------------------------------------
  // Estados
  // ---------------------------------------------------------------------------------------------

  /** O estado efetivo de cada estação do cadastro (leitura fresca, falha segura ou desconhecido). */
  estadosEfetivos(leituras: readonly LeituraEstacao[], agora: Date): Map<number, EstadoEfetivo> {
    const porEstacao = new Map<number, LeituraEstacao>();
    for (const l of leituras) porEstacao.set(l.estacaoId, l);
    const saida = new Map<number, EstadoEfetivo>();
    for (const e of this.estacoes) {
      saida.set(e.id, calcularEstadoEfetivo(porEstacao.get(e.id), agora, this.politica));
    }
    return saida;
  }

  /**
   * O estado de cada segmento de rio: o estado efetivo da estação que o governa, ou
   * SEM_MONITORAMENTO. É a ÚNICA fonte para colorir o mapa e para o desvio.
   */
  estadoDosSegmentos(leituras: readonly LeituraEstacao[], agora: Date): Map<number, InfoSegmento> {
    return this.criarContexto(leituras, agora).estados.segmentos as Map<number, InfoSegmento>;
  }

  private criarContexto(leituras: readonly LeituraEstacao[], agora: Date): Contexto {
    const estacoes = this.estadosEfetivos(leituras, agora);
    const efetivoPorIndice = this.estacoes.map((e) => estacoes.get(e.id)!);

    const segmentos = new Map<number, InfoSegmento>();
    const estadoPorSegmento: EstadoDoSegmento[] = this.segIds.map((id, i) => {
      const s = this.segEstacao[i]!;
      const info: InfoSegmento =
        s === -1
          ? { estado: 'SEM_MONITORAMENTO', estacaoId: null }
          : { estado: efetivoPorIndice[s]!.estado, estacaoId: this.estacoes[s]!.id };
      segmentos.set(id, info);
      return info.estado;
    });
    const temRisco = estadoPorSegmento.some((e) => e === 'CRITICO' || e === 'ATENCAO');

    const total = this.roteador.totalArestas;
    const multFinito = new Float32Array(total).fill(1);
    const fracCritica = new Float64Array(total);
    const fracAtencao = new Float64Array(total);
    const travCritica = new Uint8Array(total);
    const travAtencao = new Uint8Array(total);
    const bloqueadas: number[] = [];
    const { critico, atencao } = this.politica;

    if (temRisco) {
      for (const a of this.arestasComEntrada) {
        let bloqueia = false;
        // As amostras de uma rua pertencem cada uma a UM trecho de rio (o mais próximo), então as
        // frações de trechos diferentes são partes separadas da rua e se SOMAM (limitadas a 1).
        let somaCritica = 0;
        let somaAtencao = 0;
        for (let i = this.entIni[a]!; i < this.entIni[a + 1]!; i++) {
          const estado = estadoPorSegmento[this.entSeg[i]!];
          const cruza = this.entCruza[i] === 1;
          if (estado === 'CRITICO') {
            somaCritica += this.entFracCritica[i]!;
            if (cruza) travCritica[a] = 1;
            if (cruza && critico.bloqueiaTravessia) bloqueia = true;
          } else if (estado === 'ATENCAO') {
            somaAtencao += this.entFracAtencao[i]!;
            if (cruza) travAtencao[a] = 1;
            if (cruza && atencao.bloqueiaTravessia) bloqueia = true;
          }
        }
        const fc = Math.min(1, somaCritica);
        // A rua não pode ter mais de 100% exposta: o que passar de 1 é tirado da atenção.
        const fa = Math.min(1 - fc, Math.min(1, somaAtencao));
        fracCritica[a] = fc;
        fracAtencao[a] = fa;
        multFinito[a] = 1 + critico.k * fc + atencao.k * fa;
        if (bloqueia) bloqueadas.push(a);
      }
    }
    const multEstrito = multFinito.slice();
    for (const a of bloqueadas) multEstrito[a] = Infinity;

    let falhaSeguraEmUso = false;
    this.estacoes.forEach((_, s) => {
      const ef = efetivoPorIndice[s]!;
      if (ef.origem === 'falha_segura' && this.estacaoGoverna[s]!.length > 0)
        falhaSeguraEmUso = true;
    });

    return {
      estados: { estacoes, segmentos },
      temRisco,
      temBloqueio: bloqueadas.length > 0,
      multFinito,
      multEstrito,
      fracCritica,
      fracAtencao,
      travCritica,
      travAtencao,
      algumaDesconhecida: efetivoPorIndice.some((e) => e.estado === 'DESCONHECIDO'),
      falhaSeguraEmUso,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Rotas
  // ---------------------------------------------------------------------------------------------

  /** Mede a exposição de uma rota do roteador contra o estado atual dos rios. */
  avaliarRota(
    rota: RotaEncontrada,
    leituras: readonly LeituraEstacao[],
    agora: Date,
    velocidadeKmH = VELOCIDADE_PADRAO_KMH,
  ): RotaAvaliada {
    return this.avaliar(rota, this.criarContexto(leituras, agora), velocidadeKmH);
  }

  private avaliar(rota: RotaEncontrada, ctx: Contexto, velocidadeKmH: number): RotaAvaliada {
    let exposicaoCriticaM = 0;
    let exposicaoAtencaoM = 0;
    let travessiasCriticas = 0;
    let travessiasAtencao = 0;
    for (const t of rota.trechos) {
      // Comprimento PARCIAL do trecho x fração efetiva da aresta, por estado.
      exposicaoCriticaM += t.comprimentoM * ctx.fracCritica[t.arestaId]!;
      exposicaoAtencaoM += t.comprimentoM * ctx.fracAtencao[t.arestaId]!;
      travessiasCriticas += ctx.travCritica[t.arestaId]!;
      travessiasAtencao += ctx.travAtencao[t.arestaId]!;
    }
    const distanciaTotalM = rota.distanciaRedeM + rota.encaixeOrigemM + rota.encaixeDestinoM;
    return {
      rota,
      distanciaTotalM,
      tempoS: distanciaTotalM / (velocidadeKmH / 3.6),
      exposicaoCriticaM,
      exposicaoAtencaoM,
      travessiasCriticas,
      travessiasAtencao,
    };
  }

  /**
   * A rota recomendada: a mais curta se nenhum rio está em risco; senão, a mais segura. Veja o
   * README do pacote para as duas passadas.
   */
  rotear(
    origem: LatLng,
    destino: LatLng,
    leituras: readonly LeituraEstacao[],
    agora: Date,
    opcoes: OpcoesRotaDesvio = {},
  ): ResultadoDesvio {
    return this.rotearComContexto(origem, destino, this.criarContexto(leituras, agora), opcoes);
  }

  private avisosGerais(ctx: Contexto): Aviso[] {
    const avisos: Aviso[] = [];
    if (ctx.falhaSeguraEmUso) avisos.push('ESTADO_ANTIGO_EM_USO');
    if (ctx.algumaDesconhecida) avisos.push('ESTACAO_SEM_LEITURA_ATUAL');
    return avisos;
  }

  private rotearComContexto(
    origem: LatLng,
    destino: LatLng,
    ctx: Contexto,
    opcoes: OpcoesRotaDesvio,
  ): ResultadoDesvio {
    const velocidade = opcoes.velocidadeKmH ?? VELOCIDADE_PADRAO_KMH;
    const base = {
      velocidadeKmH: velocidade,
      ...(opcoes.maxEncaixeM !== undefined ? { maxEncaixeM: opcoes.maxEncaixeM } : {}),
    };
    const semRota = (
      status: 'sem_caminho' | 'origem_longe' | 'destino_longe',
    ): ResultadoDesvio => ({
      status,
      modo: null,
      recomendada: null,
      maisCurta: null,
      avisos: this.avisosGerais(ctx),
      estados: ctx.estados,
    });

    // 0. A rota mais curta, sem nenhuma penalidade.
    const curta = this.roteador.rotear(origem, destino, base);
    if (curta.status !== 'ok') return semRota(curta.status);

    // 1. Nenhum rio em risco: a mais curta é a recomendada.
    if (!ctx.temRisco) {
      return {
        status: 'ok',
        modo: 'sem_risco',
        recomendada: this.avaliar(curta, ctx, velocidade),
        maisCurta: null,
        avisos: this.avisosGerais(ctx),
        estados: ctx.estados,
      };
    }

    // 3. Passada estrita: travessias de rio crítico bloqueadas.
    let modo: ModoDesvio = 'segura';
    let escolhida = this.roteador.rotear(origem, destino, {
      ...base,
      multiplicadorPorAresta: ctx.multEstrito,
    });
    if (escolhida.status === 'sem_caminho' && ctx.temBloqueio) {
      // Sem rota segura (ou a origem/destino está sobre uma travessia bloqueada): aceita as
      // travessias, mas com a penalidade, para usar o mínimo possível.
      modo = 'menos_exposta';
      escolhida = this.roteador.rotear(origem, destino, {
        ...base,
        multiplicadorPorAresta: ctx.multFinito,
      });
    }
    if (escolhida.status !== 'ok') return semRota(escolhida.status);

    // 4. Exposição das duas rotas e avisos.
    const recomendada = this.avaliar(escolhida, ctx, velocidade);
    const avaliadaCurta = this.avaliar(curta, ctx, velocidade);
    const avisos: Aviso[] = [];
    if (recomendada.travessiasCriticas > 0) avisos.push('ATRAVESSA_RIO_CRITICO');
    if (recomendada.exposicaoCriticaM > this.politica.limiarExposicaoM)
      avisos.push('EXPOSICAO_RIO_CRITICO');
    avisos.push(...this.avisosGerais(ctx));

    // 5. A mais curta só aparece se for bem mais exposta, ou se atravessa rio crítico e a recomendada não.
    const maisExposta =
      avaliadaCurta.exposicaoCriticaM - recomendada.exposicaoCriticaM >=
      this.politica.diferencaMostrarMaisCurtaM;
    const soElaAtravessa =
      avaliadaCurta.travessiasCriticas > 0 && recomendada.travessiasCriticas === 0;

    return {
      status: 'ok',
      modo,
      recomendada,
      maisCurta: maisExposta || soElaAtravessa ? avaliadaCurta : null,
      avisos,
      estados: ctx.estados,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Pontos de apoio
  // ---------------------------------------------------------------------------------------------

  /**
   * Ordena pontos de apoio pela segurança e pela distância. Considera os `limite` mais próximos em
   * linha reta e mais 2 pelos mais próximos pela rota mais curta (sem repetir), e roteia cada um.
   * Ordem: rota segura (ou sem risco) antes de "menos exposta", antes de sem caminho; dentro de
   * cada grupo, distância total + pesoExposicaoNoRanking x exposição crítica da recomendada.
   */
  escolherApoio(
    origem: LatLng,
    apoios: readonly ApoioCadastro[],
    leituras: readonly LeituraEstacao[],
    agora: Date,
    limite = 5,
    opcoes: OpcoesRotaDesvio = {},
  ): ApoioAvaliado[] {
    if (apoios.length === 0) return [];
    const ctx = this.criarContexto(leituras, agora);
    const base = {
      ...(opcoes.velocidadeKmH !== undefined ? { velocidadeKmH: opcoes.velocidadeKmH } : {}),
    };

    const emLinhaReta = [...apoios]
      .map((a) => ({
        a,
        d: haversineM(origem.latitude, origem.longitude, a.latitude, a.longitude),
      }))
      .sort((x, y) => x.d - y.d || x.a.id - y.a.id)
      .map((x) => x.a);
    const candidatos = new Map<number, ApoioCadastro>();
    for (const a of emLinhaReta.slice(0, Math.max(1, limite))) candidatos.set(a.id, a);

    // Os mais próximos pela rota mais curta (sem desvio) que ainda não entraram.
    const pelaRota = emLinhaReta
      .filter((a) => !candidatos.has(a.id))
      .map((a) => {
        const r = this.roteador.rotear(origem, a, base);
        return {
          a,
          d: r.status === 'ok' ? r.distanciaRedeM + r.encaixeOrigemM + r.encaixeDestinoM : Infinity,
        };
      })
      .filter((x) => x.d < Infinity)
      .sort((x, y) => x.d - y.d || x.a.id - y.a.id)
      .slice(0, APOIOS_PELA_ROTA);
    for (const x of pelaRota) candidatos.set(x.a.id, x.a);

    const peso = this.politica.pesoExposicaoNoRanking;
    const avaliados = [...candidatos.values()].map((apoio) => {
      const resultado = this.rotearComContexto(origem, apoio, ctx, opcoes);
      const grupo = resultado.status !== 'ok' ? 2 : resultado.modo === 'menos_exposta' ? 1 : 0;
      const pontuacao =
        resultado.status === 'ok'
          ? resultado.recomendada.distanciaTotalM + peso * resultado.recomendada.exposicaoCriticaM
          : Infinity;
      return { apoio, resultado, grupo, pontuacao };
    });
    avaliados.sort(
      (x, y) => x.grupo - y.grupo || x.pontuacao - y.pontuacao || x.apoio.id - y.apoio.id,
    );
    return avaliados.map(({ apoio, resultado }) => ({ apoio, resultado }));
  }

  // ---------------------------------------------------------------------------------------------
  // Cobertura
  // ---------------------------------------------------------------------------------------------

  /**
   * Quanto dos rios tem estação por perto (monitorado) e quanto fica sem monitoramento (cinza no
   * mapa), por rio, e as estações do cadastro sem nenhum segmento do rio ao alcance.
   */
  resumoCobertura(): ResumoCobertura {
    const porRio = new Map<
      string,
      { rio: string; segmentos: number; monitorados: number; km: number; kmMonitorado: number }
    >();
    this.segIds.forEach((_, i) => {
      const chave = normalizarNome(this.segRio[i]!);
      const r = porRio.get(chave) ?? {
        rio: this.segRio[i]!,
        segmentos: 0,
        monitorados: 0,
        km: 0,
        kmMonitorado: 0,
      };
      r.segmentos++;
      r.km += this.segKm[i]!;
      if (this.segEstacao[i] !== -1) {
        r.monitorados++;
        r.kmMonitorado += this.segKm[i]!;
      }
      porRio.set(chave, r);
    });
    const arred = (v: number) => Math.round(v * 100) / 100;
    const rios = [...porRio.values()]
      .map((r) => ({
        rio: r.rio,
        segmentos: r.segmentos,
        segmentosMonitorados: r.monitorados,
        kmTotal: arred(r.km),
        kmMonitorado: arred(r.kmMonitorado),
        kmSemMonitoramento: arred(r.km - r.kmMonitorado),
      }))
      .sort((a, b) => a.rio.localeCompare(b.rio));
    const kmTotal = rios.reduce((s, r) => s + r.kmTotal, 0);
    const kmMonitorado = rios.reduce((s, r) => s + r.kmMonitorado, 0);
    return {
      rios,
      kmTotal: arred(kmTotal),
      kmMonitorado: arred(kmMonitorado),
      kmSemMonitoramento: arred(kmTotal - kmMonitorado),
      estacoesSemSegmento: this.estacoes.filter((_, s) => !this.estacaoTemAlcance[s]),
    };
  }
}
