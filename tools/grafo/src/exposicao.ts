/**
 * Exposição de cada rua (aresta do grafo) aos rios alvo: dados ESTÁTICOS, calculados uma vez.
 * O estado dos rios (dinâmico) entra depois, na política de desvio; aqui só se mede a geometria.
 *
 * Para cada par (aresta, segmento de rio) guardamos:
 *  - `cruza`: a geometria da aresta cruza (ou encosta, a até 0,5 m) a do segmento;
 *  - `distMinM`: a menor distância entre as duas geometrias;
 *  - `f15`, `f30`, `f50`: a fração do comprimento da aresta que fica a até 15, 30 e 50 m do rio.
 *
 * As frações vêm de AMOSTRAS: a geometria da aresta é amostrada a cada 5 m (com os extremos) e
 * cada amostra é atribuída ao segmento de rio MAIS PRÓXIMO dela (se estiver a até 50 m). Assim,
 * as frações de todos os segmentos de uma aresta nunca somam mais que 1. Cada amostra vale o
 * pedaço da aresta que ela representa (regra do ponto médio), então uma aresta toda exposta dá 1.
 *
 * Distâncias numa projeção plana local (erro abaixo de 0,2% nesta escala).
 */
import { createHash } from 'node:crypto';
import { FAIXAS_EXPOSICAO_M, PASSO_AMOSTRA_M, TOLERANCIA_TOQUE_M } from './config';
import type { Grafo } from './construir';
import { aproximacao, distPontoSegmento, distSegmentos, IndiceSegmentos } from './espacial';
import { ProjecaoLocal, type Ponto } from './geo';

export interface SegmentoParaExposicao {
  id: number;
  rio: string;
  osmWayId: number;
  coberto: boolean;
  /** [lat, lon], no sentido do fluxo. */
  pontos: readonly Ponto[];
}

export interface EntradaExposicao {
  arestaId: number;
  segmentoId: number;
  cruza: boolean;
  /** Arredondada a 0,1 m. */
  distMinM: number;
  /** Frações do comprimento da aresta, arredondadas a 0,01. */
  f15: number;
  f30: number;
  f50: number;
  /** Onde a aresta chega mais perto do rio, [lat, lon]. Só nas entradas com `cruza`; não vai para o arquivo. */
  ponto?: [number, number];
}

export interface OpcoesExposicao {
  passoM?: number;
  faixasM?: readonly [number, number, number];
  toqueM?: number;
}

export interface ResultadoExposicao {
  entradas: EntradaExposicao[];
  passoM: number;
  faixasM: readonly [number, number, number];
}

type GrafoParaExposicao = Pick<Grafo, 'nos' | 'arestas'>;

const arredondar = (valor: number, casas: number) => {
  const f = 10 ** casas;
  return Math.round(valor * f) / f;
};

interface Amostras {
  x: Float64Array;
  y: Float64Array;
  /** O pedaço da aresta (em metros) que cada amostra representa; a soma é o comprimento. */
  peso: Float64Array;
  comprimento: number;
}

/** Amostra a polilinha a cada `passo` metros, incluindo os dois extremos. */
function amostrar(px: Float64Array, py: Float64Array, passo: number): Amostras | null {
  const n = px.length;
  const acumulado = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    acumulado[i] = acumulado[i - 1]! + Math.hypot(px[i]! - px[i - 1]!, py[i]! - py[i - 1]!);
  }
  const comprimento = acumulado[n - 1]!;
  if (!(comprimento > 0)) return null;

  const posicoes: number[] = [];
  for (let j = 0; j * passo < comprimento - 1e-9; j++) posicoes.push(j * passo);
  posicoes.push(comprimento);

  const m = posicoes.length;
  const x = new Float64Array(m);
  const y = new Float64Array(m);
  const peso = new Float64Array(m);
  let p = 0;
  for (let j = 0; j < m; j++) {
    const s = posicoes[j]!;
    while (p < n - 2 && acumulado[p + 1]! < s) p++;
    const trecho = acumulado[p + 1]! - acumulado[p]!;
    const t = trecho > 0 ? Math.min(1, Math.max(0, (s - acumulado[p]!) / trecho)) : 0;
    x[j] = px[p]! + t * (px[p + 1]! - px[p]!);
    y[j] = py[p]! + t * (py[p + 1]! - py[p]!);
    const antes = j === 0 ? posicoes[0]! : (posicoes[j - 1]! + s) / 2;
    const depois = j === m - 1 ? s : (s + posicoes[j + 1]!) / 2;
    peso[j] = depois - antes;
  }
  return { x, y, peso, comprimento };
}

export function projecaoDoGrafo(nos: readonly { lat: number; lon: number }[]): ProjecaoLocal {
  if (nos.length === 0) return new ProjecaoLocal(0, 0);
  let lat = 0;
  let lon = 0;
  for (const no of nos) {
    lat += no.lat;
    lon += no.lon;
  }
  return new ProjecaoLocal(lat / nos.length, lon / nos.length);
}

export function calcularExposicao(
  grafo: GrafoParaExposicao,
  segmentos: readonly SegmentoParaExposicao[],
  opcoes: OpcoesExposicao = {},
): ResultadoExposicao {
  const passoM = opcoes.passoM ?? PASSO_AMOSTRA_M;
  const faixasM = opcoes.faixasM ?? FAIXAS_EXPOSICAO_M;
  const toqueM = opcoes.toqueM ?? TOLERANCIA_TOQUE_M;
  const raioMax = faixasM[2];
  const proj = projecaoDoGrafo(grafo.nos);

  // Os pedaços (segmentos de reta) de todos os rios, num índice em grade.
  const rax: number[] = [];
  const ray: number[] = [];
  const rbx: number[] = [];
  const rby: number[] = [];
  const dono: number[] = []; // índice em `segmentos`
  segmentos.forEach((s, i) => {
    for (let k = 1; k < s.pontos.length; k++) {
      rax.push(proj.x(s.pontos[k - 1]![1]));
      ray.push(proj.y(s.pontos[k - 1]![0]));
      rbx.push(proj.x(s.pontos[k]![1]));
      rby.push(proj.y(s.pontos[k]![0]));
      dono.push(i);
    }
  });
  const indice = new IndiceSegmentos(
    Float64Array.from(rax),
    Float64Array.from(ray),
    Float64Array.from(rbx),
    Float64Array.from(rby),
  );

  const entradas: EntradaExposicao[] = [];
  const candidatos: number[] = [];

  grafo.arestas.forEach((aresta, arestaId) => {
    const n = aresta.geometria.length;
    const px = new Float64Array(n);
    const py = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      px[i] = proj.x(aresta.geometria[i]![1]);
      py[i] = proj.y(aresta.geometria[i]![0]);
    }

    // 1. cruza e distância mínima, por segmento de rio.
    const doPar = new Map<number, { dist: number; cruza: boolean; ponto?: [number, number] }>();
    const proximos = new Set<number>(); // pedaços de rio a até raioMax de algum pedaço da aresta
    for (let k = 1; k < n; k++) {
      const x0 = Math.min(px[k - 1]!, px[k]!);
      const y0 = Math.min(py[k - 1]!, py[k]!);
      const x1 = Math.max(px[k - 1]!, px[k]!);
      const y1 = Math.max(py[k - 1]!, py[k]!);
      indice.consultar(x0, y0, x1, y1, raioMax, candidatos);
      for (const j of candidatos) {
        const d = distSegmentos(
          px[k - 1]!,
          py[k - 1]!,
          px[k]!,
          py[k]!,
          rax[j]!,
          ray[j]!,
          rbx[j]!,
          rby[j]!,
        );
        if (d > raioMax) continue;
        proximos.add(j);
        const seg = dono[j]!;
        const atual = doPar.get(seg) ?? { dist: Infinity, cruza: false };
        if (d < atual.dist) {
          atual.dist = d;
          if (d <= toqueM) {
            const ap = aproximacao(
              px[k - 1]!,
              py[k - 1]!,
              px[k]!,
              py[k]!,
              rax[j]!,
              ray[j]!,
              rbx[j]!,
              rby[j]!,
            );
            atual.ponto = [proj.lat(ap.y), proj.lon(ap.x)];
          }
        }
        if (d <= toqueM) atual.cruza = true;
        doPar.set(seg, atual);
      }
    }

    // 2. Frações: cada amostra vai para o segmento de rio mais próximo (a até raioMax).
    const fracoes = new Map<number, [number, number, number]>();
    const amostras = proximos.size > 0 ? amostrar(px, py, passoM) : null;
    if (amostras) {
      const pedacos = [...proximos].sort((a, b) => a - b);
      for (let s = 0; s < amostras.x.length; s++) {
        let melhorDist = Infinity;
        let melhorSeg = -1;
        for (const j of pedacos) {
          const d = distPontoSegmento(
            amostras.x[s]!,
            amostras.y[s]!,
            rax[j]!,
            ray[j]!,
            rbx[j]!,
            rby[j]!,
          );
          if (d < melhorDist) {
            melhorDist = d;
            melhorSeg = dono[j]!;
          }
        }
        if (melhorSeg === -1 || melhorDist > raioMax) continue;
        const f = fracoes.get(melhorSeg) ?? [0, 0, 0];
        for (let b = 0; b < 3; b++) if (melhorDist <= faixasM[b]!) f[b]! += amostras.peso[s]!;
        fracoes.set(melhorSeg, f);
      }
    }

    // 3. Guarda os pares com cruza ou f50 > 0.
    const segmentosDaAresta = [...new Set([...doPar.keys(), ...fracoes.keys()])].sort(
      (a, b) => segmentos[a]!.id - segmentos[b]!.id,
    );
    for (const seg of segmentosDaAresta) {
      const par = doPar.get(seg);
      const f = fracoes.get(seg) ?? [0, 0, 0];
      const comprimento = amostras?.comprimento ?? 1;
      const cruza = par?.cruza ?? false;
      if (!cruza && !(f[2]! > 0)) continue;
      const entrada: EntradaExposicao = {
        arestaId,
        segmentoId: segmentos[seg]!.id,
        cruza,
        distMinM: arredondar(par?.dist ?? Infinity, 1),
        f15: arredondar(Math.min(1, f[0]! / comprimento), 2),
        f30: arredondar(Math.min(1, f[1]! / comprimento), 2),
        f50: arredondar(Math.min(1, f[2]! / comprimento), 2),
      };
      if (cruza && par?.ponto)
        entrada.ponto = [arredondar(par.ponto[0], 6), arredondar(par.ponto[1], 6)];
      entradas.push(entrada);
    }
  });

  return { entradas, passoM, faixasM };
}

// ---------- Arquivo de saída ----------

export type EntradaCompacta = [
  arestaId: number,
  segmentoId: number,
  cruza: 0 | 1,
  distMinM: number,
  f15: number,
  f30: number,
  f50: number,
];

export interface ArquivoExposicao {
  versao: 1;
  geradoEm: string;
  grafo: { nos: number; arestas: number; sha256: string };
  /** Hash do rios-petropolis.geojson usado: os ids dos segmentos só valem para ele. */
  rios: { sha256: string };
  parametros: { passoM: number; faixasM: readonly number[] };
  segmentos: { id: number; rio: string; osmWayId: number; coberto: boolean }[];
  entradas: EntradaCompacta[];
}

export function sha256Hex(conteudo: Uint8Array | string): string {
  return createHash('sha256').update(conteudo).digest('hex');
}

/** O formato compacto do arquivo: cada entrada é uma lista de números, na ordem do cabeçalho. */
export function montarArquivoExposicao(dados: {
  geradoEm: Date;
  grafo: { nos: number; arestas: number; sha256: string };
  rios: { sha256: string };
  segmentos: readonly SegmentoParaExposicao[];
  resultado: ResultadoExposicao;
}): ArquivoExposicao {
  return {
    versao: 1,
    geradoEm: dados.geradoEm.toISOString(),
    grafo: dados.grafo,
    rios: dados.rios,
    parametros: { passoM: dados.resultado.passoM, faixasM: dados.resultado.faixasM },
    segmentos: dados.segmentos.map((s) => ({
      id: s.id,
      rio: s.rio,
      osmWayId: s.osmWayId,
      coberto: s.coberto,
    })),
    entradas: dados.resultado.entradas.map((e) => [
      e.arestaId,
      e.segmentoId,
      e.cruza ? 1 : 0,
      e.distMinM,
      e.f15,
      e.f30,
      e.f50,
    ]),
  };
}

// ---------- Leitura dos rios (GeoJSON gerado por pnpm grafo:rios) ----------

interface FeatureRio {
  properties?: { id?: unknown; rio?: unknown; osmWayId?: unknown; coberto?: unknown };
  geometry?: { type?: unknown; coordinates?: unknown };
}

/** Lê o GeoJSON dos rios. As coordenadas do GeoJSON são [lon, lat]; aqui viram [lat, lon]. */
export function lerSegmentosGeoJson(geojson: unknown): SegmentoParaExposicao[] {
  const features = (geojson as { features?: FeatureRio[] } | null)?.features;
  if (!Array.isArray(features)) {
    throw new Error(
      'O arquivo dos rios não é um GeoJSON FeatureCollection. Rode `pnpm grafo:rios`.',
    );
  }
  return features.map((f, i) => {
    const p = f.properties;
    const coordenadas = f.geometry?.coordinates;
    if (typeof p?.id !== 'number') {
      throw new Error(
        `O segmento ${i} do arquivo dos rios não tem "id" (arquivo de uma versão antiga). Rode \`pnpm grafo:rios\` de novo.`,
      );
    }
    if (
      f.geometry?.type !== 'LineString' ||
      !Array.isArray(coordenadas) ||
      coordenadas.length < 2
    ) {
      throw new Error(`O segmento ${p.id} do arquivo dos rios não é um LineString válido.`);
    }
    return {
      id: p.id,
      rio: String(p.rio),
      osmWayId: Number(p.osmWayId),
      coberto: p.coberto === true,
      pontos: (coordenadas as [number, number][]).map(([lon, lat]) => [lat, lon] as const),
    };
  });
}
