/**
 * Geometria sobre a esfera e no plano local. Só números: sem dependências de plataforma.
 */

const RAIO_TERRA_M = 6_371_008.8;
const PARA_RAD = Math.PI / 180;

/** Distância em metros entre dois pontos (haversine). */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * PARA_RAD;
  const dLon = (lon2 - lon1) * PARA_RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * PARA_RAD) * Math.cos(lat2 * PARA_RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Projeção plana local (equiretangular) em metros, em volta de um ponto de referência. Para
 * uma cidade (dezenas de km) o erro de distância fica abaixo de 0,1%, e é bem mais barata que
 * o haversine na busca espacial e na heurística do A*.
 */
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
