/**
 * Fatia os segmentos de rio (um por way do OSM, depois de aliases e absorção) em TRECHOS curtos.
 *
 * Por quê: a unidade de monitoramento e de exposição era o way inteiro, e um way pode ter
 * quilômetros. Uma estação a 1 km de um ponto do way "monitorava" o way todo, o que inflava a
 * cobertura. Com trechos de no máximo TRECHO_MAX_M, o estado de uma estação vale só para os
 * trechos que ela de fato alcança.
 *
 * Regras: n = ceil(comprimento / TRECHO_MAX_M) trechos iguais (comprimento / n cada), cortando a
 * polilinha por interpolação em projeção plana local, com o sentido do fluxo preservado. Trechos
 * consecutivos compartilham o ponto de corte. Segmentos curtos (n = 1) ficam como estão. Os ids
 * são novos e sequenciais, na ordem rio, osmWayId e posição dentro do way.
 */
import { TRECHO_MAX_M } from './config';
import { ProjecaoLocal } from './geo';
import type { SegmentoRio } from './rios';

export interface TrechoRio extends SegmentoRio {
  /** Posição dentro do way (0, 1, 2...). */
  indice: number;
}

const arredondar6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Corta uma polilinha [lat, lon] em `n` partes de mesmo comprimento (no plano local). */
export function cortarPolilinha(
  geometria: readonly (readonly [number, number])[],
  n: number,
): [number, number][][] {
  const primeiro = geometria[0]!;
  const proj = new ProjecaoLocal(primeiro[0], primeiro[1]);
  const xs = geometria.map((g) => proj.x(g[1]));
  const ys = geometria.map((g) => proj.y(g[0]));
  const acumulado = [0];
  for (let i = 1; i < geometria.length; i++) {
    acumulado.push(acumulado[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!));
  }
  const total = acumulado[acumulado.length - 1]!;

  const pontoEm = (d: number): [number, number] => {
    let i = 1;
    while (i < acumulado.length - 1 && acumulado[i]! < d) i++;
    const comp = acumulado[i]! - acumulado[i - 1]!;
    const t = comp === 0 ? 0 : (d - acumulado[i - 1]!) / comp;
    const x = xs[i - 1]! + t * (xs[i]! - xs[i - 1]!);
    const y = ys[i - 1]! + t * (ys[i]! - ys[i - 1]!);
    return [arredondar6(proj.lat(y)), arredondar6(proj.lon(x))];
  };

  // Pontos de corte calculados UMA vez: o fim de um trecho é exatamente o início do seguinte.
  const cortes: [number, number][] = [];
  for (let k = 1; k < n; k++) cortes.push(pontoEm((total * k) / n));

  const partes: [number, number][][] = [];
  for (let k = 0; k < n; k++) {
    const d0 = (total * k) / n;
    const d1 = (total * (k + 1)) / n;
    const inicio: [number, number] =
      k === 0 ? [geometria[0]![0], geometria[0]![1]] : cortes[k - 1]!;
    const ultimo = geometria[geometria.length - 1]!;
    const fim: [number, number] = k === n - 1 ? [ultimo[0], ultimo[1]] : cortes[k]!;
    const meio: [number, number][] = [];
    for (let i = 1; i < geometria.length - 1; i++) {
      if (acumulado[i]! > d0 && acumulado[i]! < d1) meio.push([geometria[i]![0], geometria[i]![1]]);
    }
    partes.push([inicio, ...meio, fim]);
  }
  return partes;
}

/** Fatia todos os segmentos. A entrada deve estar ordenada por rio e osmWayId (como sai de extrairRios). */
export function fatiarSegmentos(
  segmentos: readonly SegmentoRio[],
  trechoMaxM: number = TRECHO_MAX_M,
): TrechoRio[] {
  const ordenados = [...segmentos].sort(
    (a, b) => a.rio.localeCompare(b.rio) || a.osmWayId - b.osmWayId || a.id - b.id,
  );
  const saida: TrechoRio[] = [];
  for (const s of ordenados) {
    const n = Math.max(1, Math.ceil(s.comprimentoM / trechoMaxM));
    const partes = n === 1 ? [s.geometria] : cortarPolilinha(s.geometria, n);
    partes.forEach((geometria, indice) => {
      saida.push({
        ...s,
        id: saida.length,
        indice,
        comprimentoM: n === 1 ? s.comprimentoM : s.comprimentoM / n,
        geometria: geometria.map(([a, b]) => [a, b] as [number, number]),
      });
    });
  }
  return saida;
}
