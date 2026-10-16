/**
 * Geometria plana local, em metros. Só números: sem dependências de plataforma.
 */

const RAIO_TERRA_M = 6_371_008.8;
const PARA_RAD = Math.PI / 180;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * PARA_RAD;
  const dLon = (lon2 - lon1) * PARA_RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * PARA_RAD) * Math.cos(lat2 * PARA_RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Projeção plana local (equiretangular): erro abaixo de 0,2% nesta escala (dezenas de km). */
export class ProjecaoLocal {
  private readonly kx: number;
  private readonly ky: number;

  constructor(
    readonly lat0: number,
    readonly lon0: number,
  ) {
    this.kx = PARA_RAD * RAIO_TERRA_M * Math.cos(lat0 * PARA_RAD);
    this.ky = PARA_RAD * RAIO_TERRA_M;
  }

  x(lon: number): number {
    return (lon - this.lon0) * this.kx;
  }

  y(lat: number): number {
    return (lat - this.lat0) * this.ky;
  }
}

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
