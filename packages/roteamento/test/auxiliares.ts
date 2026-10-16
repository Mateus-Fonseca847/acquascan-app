/**
 * Auxiliares dos testes: monta grafos pequenos, gera números aleatórios de forma determinística e
 * traz um Dijkstra ingênuo para servir de referência ao A*. Nada disso é código de produção.
 */
import { haversineM } from '../src/geo';
import type { ArestaBruta, GrafoBruto, LatLng } from '../src/tipos';

/** PRNG determinístico (mulberry32): a mesma semente gera sempre a mesma sequência em [0, 1). */
export function mulberry32(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LAT0 = -22.5;
const LON0 = -43.17;
const METROS_POR_GRAU = 111_195;

/** Converte metros (x para leste, y para norte) a partir de um ponto fixo em coordenadas. */
export function pontoEmMetros(x: number, y: number): LatLng {
  return {
    latitude: LAT0 + y / METROS_POR_GRAU,
    longitude: LON0 + x / (METROS_POR_GRAU * Math.cos((LAT0 * Math.PI) / 180)),
  };
}

export interface DefinicaoAresta {
  de: number;
  para: number;
  /** Pontos intermediários da geometria, em metros [x, y]. */
  via?: [number, number][];
  /** Se omitido, é o comprimento da geometria. */
  comprimentoM?: number;
  nome?: string;
  classe?: string;
  escada?: boolean;
  ponte?: boolean;
  tunel?: boolean;
  sentidoUnico?: true;
}

/** Monta um GrafoBruto a partir de nós e arestas definidos em metros. */
export function montarGrafo(nos: [number, number][], arestas: DefinicaoAresta[]): GrafoBruto {
  const nosBrutos = nos.map(([x, y], i) => {
    const p = pontoEmMetros(x, y);
    return { id: 1000 + i, lat: p.latitude, lon: p.longitude };
  });

  const arestasBrutas = arestas.map((def): ArestaBruta => {
    const caminho: [number, number][] = [nos[def.de]!, ...(def.via ?? []), nos[def.para]!];
    const geometria = caminho.map(([x, y]): [number, number] => {
      const p = pontoEmMetros(x, y);
      return [p.latitude, p.longitude];
    });
    let comprimento = 0;
    for (let k = 1; k < geometria.length; k++) {
      comprimento += haversineM(
        geometria[k - 1]![0],
        geometria[k - 1]![1],
        geometria[k]![0],
        geometria[k]![1],
      );
    }
    const aresta: ArestaBruta = {
      de: def.de,
      para: def.para,
      comprimentoM: def.comprimentoM ?? comprimento,
      geometria,
      classe: def.classe ?? 'residential',
      escada: def.escada ?? false,
      ponte: def.ponte ?? false,
      tunel: def.tunel ?? false,
    };
    if (def.nome !== undefined) aresta.nome = def.nome;
    if (def.sentidoUnico) aresta.sentidoUnico = true;
    return aresta;
  });

  return { versao: 1, nos: nosBrutos, arestas: arestasBrutas };
}

export function multiplicadores(total: number, valores: Record<number, number> = {}): Float32Array {
  const m = new Float32Array(total).fill(1);
  for (const [id, valor] of Object.entries(valores)) m[Number(id)] = valor;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Dijkstra de referência (ingênuo, de propósito: só para conferir o A*)
// ---------------------------------------------------------------------------------------------

export interface PosicaoNaRede {
  arestaId: number;
  posicaoM: number;
}

/** Heap mínimo mais simples possível (array de pares), independente do heap do pacote. */
class FilaSimples {
  private itens: [number, number][] = [];
  get vazia() {
    return this.itens.length === 0;
  }
  inserir(prioridade: number, valor: number) {
    this.itens.push([prioridade, valor]);
    let i = this.itens.length - 1;
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if (this.itens[pai]![0] <= this.itens[i]![0]) break;
      [this.itens[pai], this.itens[i]] = [this.itens[i]!, this.itens[pai]!];
      i = pai;
    }
  }
  extrair(): [number, number] {
    const topo = this.itens[0]!;
    const ultimo = this.itens.pop()!;
    if (this.itens.length > 0) {
      this.itens[0] = ultimo;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let menor = i;
        if (l < this.itens.length && this.itens[l]![0] < this.itens[menor]![0]) menor = l;
        if (r < this.itens.length && this.itens[r]![0] < this.itens[menor]![0]) menor = r;
        if (menor === i) break;
        [this.itens[menor], this.itens[i]] = [this.itens[i]!, this.itens[menor]!];
        i = menor;
      }
    }
    return topo;
  }
}

/**
 * Custo mínimo entre dois pontos no meio de arestas, pelo método mais direto possível: Dijkstra
 * comum sobre os nós, com as duas pontas de cada aresta como fontes e destinos. Devolve Infinity
 * se não houver caminho.
 */
export function custoDeReferencia(
  grafo: GrafoBruto,
  mult: Float32Array,
  origem: PosicaoNaRede,
  destino: PosicaoNaRede,
): number {
  const custo = (distancia: number, m: number) => (distancia === 0 ? 0 : distancia * m);
  const ao = grafo.arestas[origem.arestaId]!;
  const ad = grafo.arestas[destino.arestaId]!;
  const mo = mult[origem.arestaId]!;
  const md = mult[destino.arestaId]!;

  let melhor = Infinity;
  if (origem.arestaId === destino.arestaId) {
    if (origem.posicaoM <= destino.posicaoM) {
      melhor = custo(destino.posicaoM - origem.posicaoM, mo);
    } else if (!ao.sentidoUnico) {
      melhor = custo(origem.posicaoM - destino.posicaoM, mo);
    }
  }

  const distancia = new Array<number>(grafo.nos.length).fill(Infinity);
  const fila = new FilaSimples();
  const semear = (no: number, valor: number) => {
    if (valor < distancia[no]!) {
      distancia[no] = valor;
      fila.inserir(valor, no);
    }
  };
  if (!ao.sentidoUnico) semear(ao.de, custo(origem.posicaoM, mo));
  semear(ao.para, custo(ao.comprimentoM - origem.posicaoM, mo));

  const saindo: { para: number; peso: number }[][] = grafo.nos.map(() => []);
  grafo.arestas.forEach((a, e) => {
    const m = mult[e]!;
    if (m === Infinity) return;
    saindo[a.de]!.push({ para: a.para, peso: a.comprimentoM * m });
    if (!a.sentidoUnico) saindo[a.para]!.push({ para: a.de, peso: a.comprimentoM * m });
  });

  while (!fila.vazia) {
    const [d, u] = fila.extrair();
    if (d > distancia[u]!) continue;
    for (const { para, peso } of saindo[u]!) semear(para, d + peso);
  }

  melhor = Math.min(melhor, distancia[ad.de]! + custo(destino.posicaoM, md));
  if (!ad.sentidoUnico) {
    melhor = Math.min(melhor, distancia[ad.para]! + custo(ad.comprimentoM - destino.posicaoM, md));
  }
  return melhor;
}

/** Um ponto sobre uma aresta, a uma fração do caminho pela geometria (interpolação em lat/lon). */
export function pontoNaAresta(grafo: GrafoBruto, arestaId: number, fracao: number): LatLng {
  const g = grafo.arestas[arestaId]!.geometria;
  // Comprimento por segmento em graus: serve só para escolher o segmento, não para medir.
  const tamanhos: number[] = [];
  let total = 0;
  for (let k = 1; k < g.length; k++) {
    const t = haversineM(g[k - 1]![0], g[k - 1]![1], g[k]![0], g[k]![1]);
    tamanhos.push(t);
    total += t;
  }
  let alvo = fracao * total;
  for (let k = 0; k < tamanhos.length; k++) {
    if (alvo <= tamanhos[k]! || k === tamanhos.length - 1) {
      const t = tamanhos[k]! > 0 ? Math.min(1, alvo / tamanhos[k]!) : 0;
      return {
        latitude: g[k]![0] + t * (g[k + 1]![0] - g[k]![0]),
        longitude: g[k]![1] + t * (g[k + 1]![1] - g[k]![1]),
      };
    }
    alvo -= tamanhos[k]!;
  }
  return { latitude: g[0]![0], longitude: g[0]![1] };
}
