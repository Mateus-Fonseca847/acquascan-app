/**
 * Auxiliares só dos testes da exposição: montam ruas e rios pequenos a partir de coordenadas em
 * metros (x para leste, y para norte), a partir de um ponto fixo. Não é código de produção.
 */
import type { ArestaGrafo, Grafo } from './construir';
import type { SegmentoParaExposicao } from './exposicao';
import { comprimentoPolilinha, type Ponto } from './geo';

export const LAT0 = -22.5;
export const LON0 = -43.17;
const METROS_POR_GRAU = 111_195;

/** Metros -> [lat, lon]. */
export const pt = (x: number, y: number): [number, number] => [
  LAT0 + y / METROS_POR_GRAU,
  LON0 + x / (METROS_POR_GRAU * Math.cos((LAT0 * Math.PI) / 180)),
];

export function aresta(
  pontosM: [number, number][],
  extras: Partial<ArestaGrafo> = {},
): ArestaGrafo {
  const geometria = pontosM.map(([x, y]) => pt(x, y));
  return {
    de: 0,
    para: 0,
    comprimentoM: comprimentoPolilinha(geometria as Ponto[]),
    geometria,
    classe: 'residential',
    escada: false,
    ponte: false,
    tunel: false,
    ...extras,
  };
}

/** Um grafo mínimo; o único nó fica na origem, o que fixa o centro da projeção plana. */
export function grafoDe(arestas: ArestaGrafo[]): Pick<Grafo, 'nos' | 'arestas'> {
  const [lat, lon] = pt(0, 0);
  return { nos: [{ id: 1, lat, lon }], arestas };
}

export function segmentoRio(
  id: number,
  pontosM: [number, number][],
  rio = 'Piabanha',
  extras: Partial<SegmentoParaExposicao> = {},
): SegmentoParaExposicao {
  return {
    id,
    rio,
    osmWayId: 1000 + id,
    coberto: false,
    pontos: pontosM.map(([x, y]) => pt(x, y)),
    ...extras,
  };
}
