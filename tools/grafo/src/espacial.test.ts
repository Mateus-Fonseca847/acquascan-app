import { describe, expect, it } from 'vitest';
import { aproximacao, distPontoSegmento, distSegmentos, IndiceSegmentos } from './espacial';
import { haversine, ProjecaoLocal } from './geo';

describe('distPontoSegmento', () => {
  it('perpendicular, ponta e segmento degenerado', () => {
    expect(distPontoSegmento(5, 3, 0, 0, 10, 0)).toBeCloseTo(3, 9);
    expect(distPontoSegmento(13, 4, 0, 0, 10, 0)).toBeCloseTo(5, 9); // até a ponta (10,0)
    expect(distPontoSegmento(3, 4, 0, 0, 0, 0)).toBeCloseTo(5, 9);
  });
});

describe('distSegmentos: cruzamento e distância mínima', () => {
  it('em X: se cruzam, distância 0', () => {
    expect(distSegmentos(-10, 0, 10, 0, 0, -10, 0, 10)).toBe(0);
  });

  it('toque na ponta: uma ponta encosta no meio do outro segmento', () => {
    expect(distSegmentos(-10, 0, 10, 0, 0, 0, 0, 10)).toBeCloseTo(0, 9);
  });

  it('quase tocando: a ponta fica a 0,3 m', () => {
    expect(distSegmentos(-10, 0, 10, 0, 0, 0.3, 0, 10)).toBeCloseTo(0.3, 9);
  });

  it('paralelos não se cruzam: a distância é a de uma linha à outra', () => {
    expect(distSegmentos(0, 0, 100, 0, 0, 7, 100, 7)).toBeCloseTo(7, 9);
  });

  it('paralelos sobrepostos só em projeção, e segmentos separados na mesma reta', () => {
    expect(distSegmentos(0, 0, 10, 0, 15, 0, 25, 0)).toBeCloseTo(5, 9);
  });

  it('ao longo da mesma reta, encostando na ponta', () => {
    expect(distSegmentos(0, 0, 10, 0, 10, 0, 20, 0)).toBeCloseTo(0, 9);
  });

  it('oblíquos que não chegam a se cruzar', () => {
    // AB termina em (10, 0); CD começa em (12, 1)
    expect(distSegmentos(0, 0, 10, 0, 12, 1, 20, 9)).toBeCloseTo(Math.hypot(2, 1), 9);
  });
});

describe('aproximacao: onde as linhas chegam mais perto', () => {
  it('no cruzamento, devolve o ponto de interseção', () => {
    const a = aproximacao(0, 0, 100, 0, 40, -20, 40, 20);
    expect(a.distancia).toBe(0);
    expect(a.x).toBeCloseTo(40, 9);
    expect(a.y).toBeCloseTo(0, 9);
  });

  it('sem cruzar, devolve o ponto do primeiro segmento mais perto do segundo', () => {
    // CD é vertical em x = 50, de y = 5 a y = 50; o ponto de AB mais perto é (50, 0).
    const a = aproximacao(0, 0, 100, 0, 50, 5, 50, 50);
    expect(a.distancia).toBeCloseTo(5, 9);
    expect(a.x).toBeCloseTo(50, 9);
    expect(a.y).toBeCloseTo(0, 9);
  });
});

describe('IndiceSegmentos', () => {
  const indice = new IndiceSegmentos(
    Float64Array.from([0, 1000, 0]),
    Float64Array.from([0, 0, 500]),
    Float64Array.from([100, 1100, 100]),
    Float64Array.from([0, 0, 500]),
  );

  it('devolve só os segmentos das células perto, sem repetir', () => {
    const saida: number[] = [];
    indice.consultar(10, -5, 20, 5, 0, saida);
    expect(saida).toEqual([0]);
    indice.consultar(1050, -5, 1060, 5, 30, saida);
    expect(saida).toEqual([1]);
  });

  it('a margem amplia a busca, e uma caixa grande pega vários', () => {
    const saida: number[] = [];
    indice.consultar(0, 0, 1100, 500, 0, saida);
    expect(saida.sort()).toEqual([0, 1, 2]);
    indice.consultar(50, 300, 60, 310, 250, saida);
    expect(saida).toContain(2);
  });

  it('segmento longo é achado a partir de qualquer ponto da caixa dele', () => {
    const longo = new IndiceSegmentos(
      Float64Array.from([0]),
      Float64Array.from([0]),
      Float64Array.from([5000]),
      Float64Array.from([3000]),
    );
    const saida: number[] = [];
    longo.consultar(2500, 1500, 2501, 1501, 0, saida);
    expect(saida).toEqual([0]);
  });

  it('funciona com coordenadas negativas', () => {
    const neg = new IndiceSegmentos(
      Float64Array.from([-500]),
      Float64Array.from([-300]),
      Float64Array.from([-400]),
      Float64Array.from([-300]),
    );
    const saida: number[] = [];
    neg.consultar(-450, -310, -440, -290, 0, saida);
    expect(saida).toEqual([0]);
  });
});

describe('ProjecaoLocal: erro contra o haversine', () => {
  // Uma pequena semente determinística (para o teste não depender de sorte).
  let semente = 99;
  const sorteio = () => {
    semente = (semente * 1664525 + 1013904223) >>> 0;
    return semente / 4294967296;
  };
  const projecao = new ProjecaoLocal(-22.505, -43.18);

  it('abaixo de 0,2% em toda a área de Petrópolis (pares de 100 m a 40 km)', () => {
    let maiorErro = 0;
    let pares = 0;
    for (let i = 0; i < 3000; i++) {
      const a: [number, number] = [-22.58 + sorteio() * 0.17, -43.27 + sorteio() * 0.2];
      const b: [number, number] = [-22.58 + sorteio() * 0.17, -43.27 + sorteio() * 0.2];
      const real = haversine(a, b);
      if (real < 100) continue;
      const plana = Math.hypot(
        projecao.x(b[1]) - projecao.x(a[1]),
        projecao.y(b[0]) - projecao.y(a[0]),
      );
      maiorErro = Math.max(maiorErro, Math.abs(plana - real) / real);
      pares++;
    }
    expect(pares).toBeGreaterThan(2000);
    expect(maiorErro).toBeLessThan(0.002);
  });

  it('a projeção inversa devolve o ponto original', () => {
    const x = projecao.x(-43.19);
    const y = projecao.y(-22.51);
    expect(projecao.lon(x)).toBeCloseTo(-43.19, 9);
    expect(projecao.lat(y)).toBeCloseTo(-22.51, 9);
  });
});
