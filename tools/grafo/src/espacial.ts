/**
 * Geometria plana (em metros) e um índice em grade para comparar muitas linhas com muitas linhas
 * sem comparar tudo com tudo. Só lógica pura.
 */

/** Distância de um ponto a um segmento. */
export function distPontoSegmento(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const c2 = abx * abx + aby * aby;
  const t = c2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / c2));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

const orientacao = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/** Os segmentos AB e CD se cruzam de verdade (no meio dos dois)? */
function seCruzam(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const o1 = orientacao(ax, ay, bx, by, cx, cy);
  const o2 = orientacao(ax, ay, bx, by, dx, dy);
  const o3 = orientacao(cx, cy, dx, dy, ax, ay);
  const o4 = orientacao(cx, cy, dx, dy, bx, by);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** Distância mínima entre os segmentos AB e CD (0 se eles se cruzam). */
export function distSegmentos(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): number {
  if (seCruzam(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    distPontoSegmento(ax, ay, cx, cy, dx, dy),
    distPontoSegmento(bx, by, cx, cy, dx, dy),
    distPontoSegmento(cx, cy, ax, ay, bx, by),
    distPontoSegmento(dx, dy, ax, ay, bx, by),
  );
}

export interface Aproximacao {
  distancia: number;
  /** O ponto de AB onde os dois segmentos chegam mais perto (ou onde se cruzam). */
  x: number;
  y: number;
}

/** Como `distSegmentos`, mas também diz onde, sobre AB, está o ponto mais perto de CD. */
export function aproximacao(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): Aproximacao {
  if (seCruzam(ax, ay, bx, by, cx, cy, dx, dy)) {
    // Ponto de interseção das retas.
    const rx = bx - ax;
    const ry = by - ay;
    const sx = dx - cx;
    const sy = dy - cy;
    const t = ((cx - ax) * sy - (cy - ay) * sx) / (rx * sy - ry * sx);
    return { distancia: 0, x: ax + t * rx, y: ay + t * ry };
  }
  let melhor: Aproximacao = { distancia: distPontoSegmento(ax, ay, cx, cy, dx, dy), x: ax, y: ay };
  const dB = distPontoSegmento(bx, by, cx, cy, dx, dy);
  if (dB < melhor.distancia) melhor = { distancia: dB, x: bx, y: by };
  for (const [qx, qy] of [
    [cx, cy],
    [dx, dy],
  ] as const) {
    const d = distPontoSegmento(qx, qy, ax, ay, bx, by);
    if (d < melhor.distancia) {
      const abx = bx - ax;
      const aby = by - ay;
      const c2 = abx * abx + aby * aby;
      const t = c2 === 0 ? 0 : Math.max(0, Math.min(1, ((qx - ax) * abx + (qy - ay) * aby) / c2));
      melhor = { distancia: d, x: ax + t * abx, y: ay + t * aby };
    }
  }
  return melhor;
}

/**
 * Índice em grade de segmentos. Cada segmento é registrado em todas as células que a caixa dele
 * toca; a consulta devolve os segmentos das células de uma caixa (com possíveis falsos positivos,
 * que quem chama descarta medindo a distância).
 */
export class IndiceSegmentos {
  readonly total: number;
  private readonly celula: number;
  private readonly celulas = new Map<number, number[]>();
  private readonly visto: Uint32Array;
  private geracao = 0;

  constructor(
    readonly ax: Float64Array,
    readonly ay: Float64Array,
    readonly bx: Float64Array,
    readonly by: Float64Array,
    celulaM = 100,
  ) {
    this.total = ax.length;
    this.celula = celulaM;
    this.visto = new Uint32Array(this.total);
    for (let i = 0; i < this.total; i++) {
      const [c0, c1, r0, r1] = this.intervalo(
        Math.min(ax[i]!, bx[i]!),
        Math.min(ay[i]!, by[i]!),
        Math.max(ax[i]!, bx[i]!),
        Math.max(ay[i]!, by[i]!),
      );
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const chave = this.chave(c, r);
          const lista = this.celulas.get(chave);
          if (lista) lista.push(i);
          else this.celulas.set(chave, [i]);
        }
      }
    }
  }

  private intervalo(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): [number, number, number, number] {
    return [
      Math.floor(x0 / this.celula),
      Math.floor(x1 / this.celula),
      Math.floor(y0 / this.celula),
      Math.floor(y1 / this.celula),
    ];
  }

  private chave(c: number, r: number): number {
    // Cabe em um inteiro seguro para coordenadas de dezenas de km.
    return (c + 100_000) * 200_000 + (r + 100_000);
  }

  /** Índices (sem repetição) dos segmentos nas células da caixa, ampliada por `margemM`. */
  consultar(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    margemM: number,
    saida: number[],
  ): void {
    saida.length = 0;
    this.geracao++;
    const [c0, c1, r0, r1] = this.intervalo(x0 - margemM, y0 - margemM, x1 + margemM, y1 + margemM);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const lista = this.celulas.get(this.chave(c, r));
        if (!lista) continue;
        for (const i of lista) {
          if (this.visto[i] === this.geracao) continue;
          this.visto[i] = this.geracao;
          saida.push(i);
        }
      }
    }
  }
}
