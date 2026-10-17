/**
 * Testa as funções puras da prova de roteamento do app (apps/mobile/src/roteamento/puro.ts).
 * O app não tem runner de testes; o vitest daqui importa o arquivo direto (ele só usa `import type`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  escolherEstacoesHipoteticas,
  escolherPares,
  estatisticas,
  formatarMs,
  leiturasComEstado,
  media,
  mulberry32,
  pontoMedio,
  pontoNoRio,
} from '../../../apps/mobile/src/roteamento/puro';
import { distanciaPontoSegmentoM } from './geo';

// Rio de teste: 4 trechos de 250 m em linha reta para leste (a partir de lon -43,2).
const LAT = -22.5;
const M_LON = 111_195 * Math.cos((LAT * Math.PI) / 180);
const lon = (x: number) => -43.2 + x / M_LON;
const trecho = (osmWayId: number, indice: number, x0: number, x1: number, rio = 'Piabanha') => ({
  properties: { id: 0, rio, osmWayId, indice, comprimentoM: x1 - x0 },
  geometry: {
    type: 'LineString',
    coordinates: [
      [lon(x0), LAT],
      [lon(x1), LAT],
    ],
  },
});
const rios = {
  features: [
    // fora de ordem de propósito: a ordem vem de osmWayId e indice
    trecho(10, 2, 500, 750),
    trecho(10, 0, 0, 250),
    trecho(10, 3, 750, 1000),
    trecho(10, 1, 250, 500),
    trecho(20, 0, 0, 400, 'Quitandinha'),
  ],
};

describe('mulberry32', () => {
  it('a mesma semente dá a mesma sequência, em [0, 1)', () => {
    const a = mulberry32(20261016);
    const b = mulberry32(20261016);
    const va = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(va);
    expect(va.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('estatisticas', () => {
  it('mediana, p95 e máximo', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(estatisticas(v)).toEqual({ n: 100, mediana: 51, p95: 96, max: 100 });
    expect(estatisticas([5, 1, 3])).toEqual({ n: 3, mediana: 3, p95: 5, max: 5 });
    expect(estatisticas([7])).toEqual({ n: 1, mediana: 7, p95: 7, max: 7 });
  });

  it('lista vazia não quebra', () => {
    expect(estatisticas([])).toEqual({ n: 0, mediana: 0, p95: 0, max: 0 });
    expect(media([])).toBe(0);
    expect(media([1, 2, 6])).toBe(3);
  });

  it('formata milissegundos com vírgula', () => {
    expect(formatarMs(12.345)).toBe('12,3 ms');
    expect(formatarMs(0.456)).toBe('0,46 ms');
  });
});

describe('escolherPares', () => {
  const nos = Array.from({ length: 50 }, (_, i) => ({ lat: -22.5 + i * 0.001, lon: -43.2 }));

  it('é determinístico, tem o tamanho pedido e nunca repete origem e destino', () => {
    const a = escolherPares(nos, 100, 20261016);
    expect(a).toHaveLength(100);
    expect(escolherPares(nos, 100, 20261016)).toEqual(a);
    expect(escolherPares(nos, 100, 1)).not.toEqual(a);
    for (const p of a) expect(p.origem).not.toEqual(p.destino);
  });

  it('com menos de 2 nós não há pares', () => {
    expect(escolherPares([], 5, 1)).toEqual([]);
    expect(escolherPares([nos[0]!], 5, 1)).toEqual([]);
  });
});

describe('pontoMedio e pontoNoRio', () => {
  it('o ponto médio de uma linha reta fica no meio', () => {
    const p = pontoMedio([
      [lon(0), LAT],
      [lon(100), LAT],
    ]);
    expect(p.longitude).toBeCloseTo(lon(50), 9);
    expect(p.latitude).toBeCloseTo(LAT, 9);
  });

  it('o ponto médio respeita o comprimento, não o número de vértices', () => {
    // 10 m + 90 m: o meio (50 m) está no segundo segmento, a 40 m do vértice
    const p = pontoMedio([
      [lon(0), LAT],
      [lon(10), LAT],
      [lon(100), LAT],
    ]);
    expect(p.longitude).toBeCloseTo(lon(50), 9);
  });

  it('escolhe o trecho da fração do comprimento do rio, na ordem osmWayId e índice', () => {
    // 25% de 1000 m = 250 m: cai no trecho 0 (0 a 250), cujo meio é 125 m
    expect(pontoNoRio(rios, 'Piabanha', 0.25)!.longitude).toBeCloseTo(lon(125), 9);
    // 75% = 750 m: cai no trecho 2 (500 a 750), cujo meio é 625 m
    expect(pontoNoRio(rios, 'Piabanha', 0.75)!.longitude).toBeCloseTo(lon(625), 9);
    // 50% = 500 m: trecho 1 (250 a 500), meio em 375 m
    expect(pontoNoRio(rios, 'Piabanha', 0.5)!.longitude).toBeCloseTo(lon(375), 9);
    expect(pontoNoRio(rios, 'Piabanha', 0)!.longitude).toBeCloseTo(lon(125), 9);
    expect(pontoNoRio(rios, 'Piabanha', 1)!.longitude).toBeCloseTo(lon(875), 9);
  });

  it('rio inexistente dá nulo', () => {
    expect(pontoNoRio(rios, 'Paraíba', 0.5)).toBeNull();
  });
});

describe('escolherEstacoesHipoteticas', () => {
  it('duas no Piabanha (25% e 75%) e uma no Quitandinha (50%), com os nomes do cadastro', () => {
    const e = escolherEstacoesHipoteticas(rios);
    expect(e.map((x) => [x.id, x.rio])).toEqual([
      [1, 'Rio Piabanha'],
      [2, 'Rio Piabanha'],
      [3, 'Rio Quitandinha'],
    ]);
    expect(e[0]!.longitude).toBeCloseTo(lon(125), 9);
    expect(e[1]!.longitude).toBeCloseTo(lon(625), 9);
    expect(e[2]!.longitude).toBeCloseTo(lon(200), 9); // Quitandinha: um trecho de 400 m
  });

  it('se faltar um rio no GeoJSON, só devolve as estações possíveis', () => {
    const so = { features: rios.features.filter((f) => f.properties.rio === 'Piabanha') };
    expect(escolherEstacoesHipoteticas(so).map((x) => x.id)).toEqual([1, 2]);
    expect(escolherEstacoesHipoteticas({ features: [] })).toEqual([]);
  });

  it('leituras: uma por estação, todas com o estado pedido e recentes', () => {
    const e = escolherEstacoesHipoteticas(rios);
    const agora = new Date('2026-10-16T12:00:00Z');
    const l = leiturasComEstado(e, 'CRITICO', agora);
    expect(l.map((x) => x.estacaoId)).toEqual([1, 2, 3]);
    expect(l.every((x) => x.estado === 'CRITICO')).toBe(true);
    expect(Date.parse(l[0]!.medidoEm!)).toBeLessThan(agora.getTime());
    expect(agora.getTime() - Date.parse(l[0]!.medidoEm!)).toBeLessThan(5 * 60_000);
  });
});

const arquivoRios = fileURLToPath(new URL('../saida/rios-petropolis.geojson', import.meta.url));

describe.skipIf(!existsSync(arquivoRios))('estações hipotéticas nos rios reais', () => {
  it('as 3 estações ficam sobre o rio (a menos de 1 m de um trecho)', () => {
    const real = JSON.parse(readFileSync(arquivoRios, 'utf8'));
    const e = escolherEstacoesHipoteticas(real);
    expect(e).toHaveLength(3);
    for (const est of e) {
      const nome = est.rio.replace('Rio ', '');
      let menor = Infinity;
      for (const f of real.features) {
        if (f.properties.rio !== nome) continue;
        const c = f.geometry.coordinates as number[][];
        for (let i = 1; i < c.length; i++) {
          menor = Math.min(
            menor,
            distanciaPontoSegmentoM(
              [est.latitude, est.longitude],
              [c[i - 1]![1]!, c[i - 1]![0]!],
              [c[i]![1]!, c[i]![0]!],
            ),
          );
        }
      }
      expect(menor).toBeLessThan(1);
    }
  });
});
