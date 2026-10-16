/**
 * Geometria sobre a esfera/plano local. Poucas linhas, sem dependência.
 */

/** Ponto como [latitude, longitude], em graus. */
export type Ponto = readonly [lat: number, lon: number];

const RAIO_TERRA_M = 6_371_008.8;
const PARA_RAD = Math.PI / 180;

/** Distância em metros entre dois pontos (fórmula de haversine). */
export function haversine(a: Ponto, b: Ponto): number {
  const dLat = (b[0] - a[0]) * PARA_RAD;
  const dLon = (b[1] - a[1]) * PARA_RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * PARA_RAD) * Math.cos(b[0] * PARA_RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Comprimento de uma polilinha, somando haversine entre pontos consecutivos. */
export function comprimentoPolilinha(pontos: readonly Ponto[]): number {
  let total = 0;
  for (let i = 1; i < pontos.length; i++) total += haversine(pontos[i - 1]!, pontos[i]!);
  return total;
}

/**
 * Distância em metros de um ponto a um segmento. Usa uma projeção plana local (equiretangular)
 * em volta do segmento, que é exata o bastante para ruas (centenas de metros).
 */
export function distanciaPontoSegmentoM(p: Ponto, a: Ponto, b: Ponto): number {
  const cosLat = Math.cos(a[0] * PARA_RAD);
  const paraXY = (q: Ponto): [number, number] => [
    (q[1] - a[1]) * PARA_RAD * cosLat * RAIO_TERRA_M,
    (q[0] - a[0]) * PARA_RAD * RAIO_TERRA_M,
  ];
  const [px, py] = paraXY(p);
  const [bx, by] = paraXY(b); // a é a origem (0, 0)

  const comprimento2 = bx * bx + by * by;
  if (comprimento2 === 0) return Math.hypot(px, py); // segmento degenerado: a distância é até o ponto
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / comprimento2));
  return Math.hypot(px - t * bx, py - t * by);
}

/**
 * Douglas-Peucker: remove pontos que ficam a menos de `toleranciaM` metros da reta entre os
 * pontos mantidos. Os dois extremos sempre ficam. Iterativo, para não estourar a pilha em
 * linhas muito longas.
 */
export function douglasPeucker<T extends Ponto>(pontos: readonly T[], toleranciaM: number): T[] {
  if (pontos.length <= 2) return [...pontos];

  const manter = new Array<boolean>(pontos.length).fill(false);
  manter[0] = true;
  manter[pontos.length - 1] = true;

  const pilha: [number, number][] = [[0, pontos.length - 1]];
  while (pilha.length > 0) {
    const [inicio, fim] = pilha.pop()!;
    let maior = -1;
    let indice = -1;
    for (let i = inicio + 1; i < fim; i++) {
      const d = distanciaPontoSegmentoM(pontos[i]!, pontos[inicio]!, pontos[fim]!);
      if (d > maior) {
        maior = d;
        indice = i;
      }
    }
    if (indice !== -1 && maior > toleranciaM) {
      manter[indice] = true;
      pilha.push([inicio, indice], [indice, fim]);
    }
  }
  return pontos.filter((_, i) => manter[i]);
}
