import { describe, expect, it } from 'vitest';
import {
  comprimentoPolilinha,
  distanciaPontoSegmentoM,
  douglasPeucker,
  haversine,
  type Ponto,
} from './geo';

describe('haversine', () => {
  it('1 grau de latitude vale cerca de 111,2 km', () => {
    expect(haversine([0, 0], [1, 0])).toBeCloseTo(111_195, -1);
  });

  it('1 grau de longitude no equador também vale cerca de 111,2 km', () => {
    expect(haversine([0, 10], [0, 11])).toBeCloseTo(111_195, -1);
  });

  it('a longitude encolhe com a latitude (cos 60° = 0,5)', () => {
    expect(haversine([60, 0], [60, 1])).toBeCloseTo(111_195 / 2, -1);
  });

  it('distância entre pontos conhecidos: Rio de Janeiro e São Paulo, perto de 360 km', () => {
    const rio: Ponto = [-22.9068, -43.1729];
    const saoPaulo: Ponto = [-23.5505, -46.6333];
    const km = haversine(rio, saoPaulo) / 1000;
    expect(km).toBeGreaterThan(355);
    expect(km).toBeLessThan(365);
  });

  it('é simétrica e vale zero para o mesmo ponto', () => {
    const a: Ponto = [-22.5, -43.17];
    const b: Ponto = [-22.51, -43.18];
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 6);
    expect(haversine(a, a)).toBe(0);
  });
});

describe('comprimentoPolilinha', () => {
  it('soma os trechos', () => {
    const a: Ponto = [0, 0];
    const b: Ponto = [0, 1];
    const c: Ponto = [1, 1];
    expect(comprimentoPolilinha([a, b, c])).toBeCloseTo(haversine(a, b) + haversine(b, c), 6);
    expect(comprimentoPolilinha([a])).toBe(0);
  });
});

describe('distanciaPontoSegmentoM', () => {
  it('mede a distância perpendicular a um segmento', () => {
    // 0,00001 grau de latitude ≈ 1,11 m
    const d = distanciaPontoSegmentoM([0.00001, 0.0005], [0, 0], [0, 0.001]);
    expect(d).toBeCloseTo(1.11, 1);
  });

  it('fora do segmento, a distância é até a ponta mais próxima', () => {
    const d = distanciaPontoSegmentoM([0, 0.002], [0, 0], [0, 0.001]);
    expect(d).toBeCloseTo(haversine([0, 0.001], [0, 0.002]), 0);
  });

  it('segmento de comprimento zero não quebra', () => {
    expect(distanciaPontoSegmentoM([0.00001, 0], [0, 0], [0, 0])).toBeCloseTo(1.11, 1);
  });
});

describe('douglasPeucker', () => {
  it('mantém os dois extremos e remove pontos colineares', () => {
    const reta: Ponto[] = [0, 1, 2, 3, 4].map((i) => [0, i * 0.001] as const);
    const simplificada = douglasPeucker(reta, 3);
    expect(simplificada).toEqual([reta[0], reta[4]]);
  });

  it('mantém uma esquina que foge mais que a tolerância', () => {
    const l: Ponto[] = [
      [0, 0],
      [0, 0.002],
      [0.002, 0.002],
    ];
    expect(douglasPeucker(l, 3)).toEqual(l);
  });

  it('remove um desvio menor que a tolerância (1 m contra 3 m)', () => {
    const quaseReta: Ponto[] = [
      [0, 0],
      [0.00001, 0.0005], // ≈ 1,1 m fora da reta
      [0, 0.001],
    ];
    expect(douglasPeucker(quaseReta, 3)).toEqual([quaseReta[0], quaseReta[2]]);
    // e mantém quando a tolerância é menor que o desvio
    expect(douglasPeucker(quaseReta, 0.5)).toEqual(quaseReta);
  });

  it('com 2 pontos ou menos devolve a mesma linha', () => {
    expect(douglasPeucker([], 3)).toEqual([]);
    expect(douglasPeucker([[1, 2]], 3)).toEqual([[1, 2]]);
    expect(
      douglasPeucker(
        [
          [1, 2],
          [3, 4],
        ],
        3,
      ),
    ).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('não altera a lista original e aguenta linhas longas', () => {
    const longa: Ponto[] = Array.from({ length: 50_000 }, (_, i) => [0, i * 0.00001] as const);
    const copia = [...longa];
    const resultado = douglasPeucker(longa, 3);
    expect(longa).toEqual(copia);
    expect(resultado).toHaveLength(2);
  });
});
