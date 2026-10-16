import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../test/auxiliares';
import { haversineM, ProjecaoLocal } from './geo';

describe('haversineM', () => {
  it('1 grau de latitude vale cerca de 111,2 km', () => {
    expect(haversineM(0, 0, 1, 0)).toBeCloseTo(111_195, -1);
  });

  it('a longitude encolhe com a latitude', () => {
    expect(haversineM(60, 0, 60, 1)).toBeCloseTo(111_195 / 2, -1);
  });

  it('é simétrica e vale zero para o mesmo ponto', () => {
    expect(haversineM(-22.5, -43.17, -22.51, -43.18)).toBeCloseTo(
      haversineM(-22.51, -43.18, -22.5, -43.17),
      6,
    );
    expect(haversineM(-22.5, -43.17, -22.5, -43.17)).toBe(0);
  });
});

describe('ProjecaoLocal: a base da heurística do A*', () => {
  // A heurística usa a distância no plano local vezes 0,99. Para continuar admissível, o plano
  // não pode errar (para mais) em mais de 1% em relação ao haversine, na área de Petrópolis.
  const projecao = new ProjecaoLocal(-22.505, -43.18);
  const sorteio = mulberry32(7);
  const pares = Array.from({ length: 2000 }, () => ({
    lat1: -22.58 + sorteio() * 0.17,
    lon1: -43.27 + sorteio() * 0.2,
    lat2: -22.58 + sorteio() * 0.17,
    lon2: -43.27 + sorteio() * 0.2,
  })).filter((p) => haversineM(p.lat1, p.lon1, p.lat2, p.lon2) > 100);

  it('o erro em relação ao haversine é minúsculo (menos de 0,2%) em toda a área', () => {
    let maiorErro = 0;
    for (const p of pares) {
      const real = haversineM(p.lat1, p.lon1, p.lat2, p.lon2);
      const plana = Math.hypot(
        projecao.x(p.lon2) - projecao.x(p.lon1),
        projecao.y(p.lat2) - projecao.y(p.lat1),
      );
      maiorErro = Math.max(maiorErro, Math.abs(plana - real) / real);
    }
    expect(maiorErro).toBeLessThan(0.002);
  });

  it('0,99 x distância plana nunca passa do haversine (heurística admissível)', () => {
    for (const p of pares) {
      const real = haversineM(p.lat1, p.lon1, p.lat2, p.lon2);
      const plana = Math.hypot(
        projecao.x(p.lon2) - projecao.x(p.lon1),
        projecao.y(p.lat2) - projecao.y(p.lat1),
      );
      expect(0.99 * plana).toBeLessThanOrEqual(real);
    }
  });
});
