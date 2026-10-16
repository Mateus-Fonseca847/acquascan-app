import { describe, expect, it } from 'vitest';
import type { Grafo } from './construir';
import { BBOX_PETROPOLIS } from './config';
import { calcularMetricas, formatarBytes, gerarRelatorio } from './relatorio';

const aresta = (de: number, para: number, comprimentoM: number, extra: object = {}) => ({
  de,
  para,
  comprimentoM,
  geometria: [
    [0, 0],
    [0, 1],
  ] as [number, number][],
  classe: 'footway',
  escada: false,
  ponte: false,
  tunel: false,
  ...extra,
});

const grafo: Grafo = {
  versao: 1,
  nos: [
    { id: 1, lat: 0, lon: 0 },
    { id: 2, lat: 0, lon: 1 },
    { id: 3, lat: 0, lon: 2 },
  ],
  arestas: [
    aresta(0, 1, 100),
    aresta(1, 2, 250.5, { classe: 'steps', escada: true }),
    aresta(1, 2, 49.5, { classe: 'residential', ponte: true, tunel: true }),
  ],
};

describe('calcularMetricas', () => {
  it('conta comprimento, classes, escadas, pontes, túneis e graus', () => {
    const m = calcularMetricas(grafo);

    expect(m.comprimentoTotalKm).toBe(0.4);
    expect(m.escadas).toBe(1);
    expect(m.pontes).toBe(1);
    expect(m.tuneis).toBe(1);
    expect(m.arestasPorClasse).toEqual([
      ['footway', 1],
      ['residential', 1],
      ['steps', 1],
    ]);
    // grau: nó 0 = 1, nó 1 = 3, nó 2 = 2
    expect(m.grauMaximo).toBe(3);
    expect(m.grauMedio).toBe(2);
  });

  it('grafo vazio não dá divisão por zero', () => {
    const m = calcularMetricas({ versao: 1, nos: [], arestas: [] });
    expect(m.grauMedio).toBe(0);
    expect(m.grauMaximo).toBe(0);
  });
});

describe('formatarBytes', () => {
  it('escolhe a unidade', () => {
    expect(formatarBytes(512)).toBe('512 B');
    expect(formatarBytes(2048)).toBe('2.0 KB');
    expect(formatarBytes(5 * 1024 * 1024)).toBe('5.00 MB');
  });
});

describe('gerarRelatorio', () => {
  it('inclui as seções pedidas e a atribuição do OSM', () => {
    const texto = gerarRelatorio({
      bbox: BBOX_PETROPOLIS,
      geradoEm: new Date('2026-10-16T12:00:00Z'),
      download: { bytes: 1024 * 1024, doCache: false },
      estatisticas: {
        vias: { total: 10, caminhaveis: 8 },
        antes: { nos: 100, arestas: 150, componentes: 3 },
        depois: { nos: 90, arestas: 140 },
        descartados: { nos: 10, arestas: 10, porcentagemNos: 10, porcentagemArestas: 6.67 },
      },
      metricas: calcularMetricas(grafo),
      saida: { bytes: 4096, bytesGzip: 1024 },
    });

    for (const trecho of [
      'Download',
      'Arestas por classe',
      'Descartados',
      'Escadas: 1',
      'JSON com gzip',
      'colaboradores do OpenStreetMap',
    ]) {
      expect(texto).toContain(trecho);
    }
  });
});
