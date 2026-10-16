import { describe, expect, it } from 'vitest';
import { TRECHO_MAX_M } from './config';
import { comprimentoPolilinha, haversine, type Ponto } from './geo';
import type { SegmentoRio } from './rios';
import { cortarPolilinha, fatiarSegmentos } from './trechos';

const LAT0 = -22.5;
const LON0 = -43.17;
const M_LAT = 111_195;
const ponto = (x: number, y: number): [number, number] => [
  LAT0 + y / M_LAT,
  LON0 + x / (M_LAT * Math.cos((LAT0 * Math.PI) / 180)),
];

function segmento(
  id: number,
  osmWayId: number,
  rio: string,
  caminho: [number, number][],
  extra: Partial<SegmentoRio> = {},
): SegmentoRio {
  const geometria = caminho.map(([x, y]) => ponto(x, y));
  return {
    id,
    osmWayId,
    rio,
    nomeOsm: rio,
    alias: false,
    inferido: false,
    waterway: 'river',
    coberto: false,
    tunnel: null,
    covered: null,
    canal: false,
    comprimentoM: comprimentoPolilinha(geometria),
    geometria,
    ...extra,
  };
}

describe('fatiarSegmentos', () => {
  // Uma polilinha com curva, 980 m: 4 trechos de 250 m.
  const longo = segmento(0, 20, 'Piabanha', [
    [0, 0],
    [400, 0],
    [400, 580],
  ]);

  it('trechos com no máximo TRECHO_MAX_M e soma dos comprimentos preservada', () => {
    const trechos = fatiarSegmentos([longo]);
    expect(TRECHO_MAX_M).toBe(250);
    expect(trechos).toHaveLength(4);
    for (const t of trechos) expect(t.comprimentoM).toBeLessThanOrEqual(TRECHO_MAX_M + 1e-9);
    const soma = trechos.reduce((s, t) => s + t.comprimentoM, 0);
    expect(soma).toBeCloseTo(longo.comprimentoM, 6);
    // a geometria de cada trecho também mede ~comprimento/n
    for (const t of trechos) {
      expect(comprimentoPolilinha(t.geometria)).toBeCloseTo(longo.comprimentoM / 4, -0.5);
    }
  });

  it('preserva o sentido: começa no início do original e termina no fim', () => {
    const trechos = fatiarSegmentos([longo]);
    expect(trechos[0]!.geometria[0]).toEqual(longo.geometria[0]);
    expect(trechos.at(-1)!.geometria.at(-1)).toEqual(longo.geometria.at(-1));
    // x só cresce no primeiro trecho (o original anda para leste primeiro)
    const primeiro = trechos[0]!.geometria;
    expect(primeiro.at(-1)![1]).toBeGreaterThan(primeiro[0]![1]);
    // e o último sobe (norte)
    const ultimo = trechos.at(-1)!.geometria;
    expect(ultimo.at(-1)![0]).toBeGreaterThan(ultimo[0]![0]);
  });

  it('segmento curto fica intacto', () => {
    const curto = segmento(0, 5, 'Piabanha', [
      [0, 0],
      [100, 0],
      [200, 30],
    ]);
    const [t] = fatiarSegmentos([curto]);
    expect(fatiarSegmentos([curto])).toHaveLength(1);
    expect(t!.geometria).toEqual(curto.geometria);
    expect(t!.comprimentoM).toBe(curto.comprimentoM);
    expect(t!.indice).toBe(0);
  });

  it('continuidade: o fim de um trecho é o início do seguinte (mesmo ponto)', () => {
    const trechos = fatiarSegmentos([longo]);
    for (let i = 1; i < trechos.length; i++) {
      expect(trechos[i]!.geometria[0]).toEqual(trechos[i - 1]!.geometria.at(-1));
    }
  });

  it('os vértices originais intermediários ficam no trecho certo', () => {
    // a curva em (400, 0) está a 400 m: dentro do 2º trecho (250 a 500 m)
    const trechos = fatiarSegmentos([longo]);
    const curva = ponto(400, 0);
    const contem = trechos.map((t) =>
      t.geometria.some((p) => p[0] === curva[0] && p[1] === curva[1]),
    );
    expect(contem).toEqual([false, true, false, false]);
  });

  it('ids sequenciais e estáveis, ordenados por rio, osmWayId e posição', () => {
    const entrada = [
      segmento(0, 30, 'Quitandinha', [
        [0, 100],
        [600, 100],
      ]),
      segmento(1, 10, 'Piabanha', [
        [0, 0],
        [300, 0],
      ]),
      segmento(2, 5, 'Piabanha', [
        [0, 50],
        [100, 50],
      ]),
    ];
    const a = fatiarSegmentos(entrada);
    const b = fatiarSegmentos([...entrada].reverse());
    expect(a.map((t) => t.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(a.map((t) => [t.rio, t.osmWayId, t.indice])).toEqual([
      ['Piabanha', 5, 0],
      ['Piabanha', 10, 0],
      ['Piabanha', 10, 1],
      ['Quitandinha', 30, 0],
      ['Quitandinha', 30, 1],
      ['Quitandinha', 30, 2],
    ]);
    expect(b).toEqual(a);
  });

  it('herda os metadados do segmento', () => {
    const s = segmento(
      0,
      77,
      'Quitandinha',
      [
        [0, 0],
        [800, 0],
      ],
      {
        coberto: true,
        canal: true,
        alias: true,
        inferido: true,
        nomeOsm: 'Quintandinha',
        waterway: 'canal',
      },
    );
    for (const t of fatiarSegmentos([s])) {
      expect(t).toMatchObject({
        osmWayId: 77,
        rio: 'Quitandinha',
        coberto: true,
        canal: true,
        alias: true,
        inferido: true,
        nomeOsm: 'Quintandinha',
        waterway: 'canal',
      });
    }
  });

  it('exatamente TRECHO_MAX_M não é fatiado; um pouco mais vira 2', () => {
    const exato = segmento(0, 1, 'Piabanha', [
      [0, 0],
      [250, 0],
    ]);
    expect(fatiarSegmentos([{ ...exato, comprimentoM: 250 }])).toHaveLength(1);
    expect(fatiarSegmentos([{ ...exato, comprimentoM: 250.5 }])).toHaveLength(2);
  });
});

describe('cortarPolilinha', () => {
  it('corta no meio de um segmento reto', () => {
    const g: Ponto[] = [ponto(0, 0), ponto(100, 0)];
    const [a, b] = cortarPolilinha(g, 2);
    expect(haversine(a![0]!, a!.at(-1)!)).toBeCloseTo(50, 0);
    expect(a!.at(-1)).toEqual(b![0]);
  });
});
