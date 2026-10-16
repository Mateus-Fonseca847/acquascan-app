import { describe, expect, it } from 'vitest';
import { criarDesvio } from './index';
import { AGORA, criarMundo, leitura, mundoPonte } from '../test/auxiliares';

// Rio Piabanha: 3 segmentos em fila (cada um com 1000 m), de x=0 a 3000. Quitandinha: 1 segmento.
const nos: [number, number][] = [
  [0, 500],
  [3000, 500],
];
const arestas = [{ de: 0, para: 1 }];
const piabanha = [
  {
    rio: 'Piabanha',
    pontos: [
      [0, 0],
      [1000, 0],
    ] as [number, number][],
  },
  {
    rio: 'Piabanha',
    pontos: [
      [1000, 0],
      [2000, 0],
    ] as [number, number][],
  },
  {
    rio: 'Piabanha',
    pontos: [
      [2000, 0],
      [3000, 0],
    ] as [number, number][],
  },
];
const quitandinha = {
  rio: 'Quitandinha',
  pontos: [
    [0, 3000],
    [1000, 3000],
  ] as [number, number][],
};

describe('estação que governa cada segmento', () => {
  it('a mais próxima do mesmo rio, e "Rio Piabanha" é o mesmo que "Piabanha"', () => {
    const m = criarMundo({
      nos,
      arestas,
      rios: piabanha,
      estacoes: [
        { id: 1, rio: 'Rio Piabanha', x: 100, y: 0 },
        { id: 2, rio: 'piabanha', x: 2900, y: 0 },
      ],
    });
    const seg = m.desvio.estadoDosSegmentos([], AGORA);
    expect(seg.get(1)!.estacaoId).toBe(1);
    expect(seg.get(3)!.estacaoId).toBe(2);
  });

  it('duas estações no mesmo rio governam trechos diferentes', () => {
    const m = criarMundo({
      nos,
      arestas,
      rios: piabanha,
      estacoes: [
        { id: 1, rio: 'Piabanha', x: 500, y: 0 },
        { id: 2, rio: 'Piabanha', x: 2500, y: 0 },
      ],
      politica: { distanciaTrechoM: 1500 },
    });
    const seg = m.desvio.estadoDosSegmentos([leitura(1, 'CRITICO'), leitura(2, 'ESTAVEL')], AGORA);
    expect(seg.get(1)).toEqual({ estado: 'CRITICO', estacaoId: 1 });
    expect(seg.get(3)).toEqual({ estado: 'ESTAVEL', estacaoId: 2 });
  });

  it('estação de outro rio é ignorada, mesmo muito perto', () => {
    const m = criarMundo({
      nos,
      arestas,
      rios: [...piabanha, quitandinha],
      estacoes: [{ id: 7, rio: 'Quitandinha', x: 500, y: 0 }],
    });
    const seg = m.desvio.estadoDosSegmentos([leitura(7, 'CRITICO')], AGORA);
    expect(seg.get(1)).toEqual({ estado: 'SEM_MONITORAMENTO', estacaoId: null });
    expect(seg.get(4)!.estacaoId).toBeNull(); // Quitandinha: a estação está a 3 km dele
  });

  it('além de distanciaTrechoM o segmento fica sem monitoramento', () => {
    const m = criarMundo({
      nos,
      arestas,
      rios: piabanha,
      estacoes: [{ id: 1, rio: 'Piabanha', x: 200, y: 0 }],
    });
    const seg = m.desvio.estadoDosSegmentos([leitura(1, 'CRITICO')], AGORA);
    expect(seg.get(1)!.estado).toBe('CRITICO');
    // O segmento 2 começa a 800 m da estação: dentro do alcance.
    expect(seg.get(2)!.estado).toBe('CRITICO');
    expect(seg.get(3)!.estado).toBe('SEM_MONITORAMENTO');
  });

  it('estadoDosSegmentos acompanha o estado efetivo da estação', () => {
    const { desvio } = mundoPonte();
    expect(desvio.estadoDosSegmentos([], AGORA).get(1)).toEqual({
      estado: 'DESCONHECIDO',
      estacaoId: 1,
    });
    expect(desvio.estadoDosSegmentos([leitura(1, 'ATENCAO', 2)], AGORA).get(1)!.estado).toBe(
      'ATENCAO',
    );
    expect(desvio.estadoDosSegmentos([leitura(1, 'CRITICO', 120)], AGORA).get(1)!.estado).toBe(
      'CRITICO',
    );
    expect(desvio.estadoDosSegmentos([leitura(1, 'CRITICO', 600)], AGORA).get(1)!.estado).toBe(
      'DESCONHECIDO',
    );
  });
});

describe('resumoCobertura', () => {
  it('soma km monitorados e sem monitoramento por rio', () => {
    const m = criarMundo({
      nos,
      arestas,
      rios: [...piabanha, quitandinha],
      estacoes: [{ id: 1, rio: 'Piabanha', x: 200, y: 0 }],
    });
    const r = m.desvio.resumoCobertura();
    const pia = r.rios.find((x) => x.rio === 'Piabanha')!;
    expect(pia).toMatchObject({
      segmentos: 3,
      segmentosMonitorados: 2,
      kmTotal: 3,
      kmMonitorado: 2,
      kmSemMonitoramento: 1,
    });
    const qui = r.rios.find((x) => x.rio === 'Quitandinha')!;
    expect(qui).toMatchObject({ segmentosMonitorados: 0, kmMonitorado: 0, kmTotal: 1 });
    expect(r.kmTotal).toBe(4);
    expect(r.kmMonitorado).toBe(2);
    expect(r.kmSemMonitoramento).toBe(2);
    expect(r.estacoesSemSegmento).toEqual([]);
  });

  it('aponta a estação sem nenhum segmento do rio ao alcance', () => {
    const m = criarMundo({
      nos,
      arestas,
      rios: piabanha,
      estacoes: [
        { id: 1, rio: 'Piabanha', x: 0, y: 0 },
        { id: 2, rio: 'Rio Inexistente', x: 0, y: 0 },
        { id: 3, rio: 'Piabanha', x: 0, y: 9000 },
      ],
    });
    expect(m.desvio.resumoCobertura().estacoesSemSegmento.map((e) => e.id)).toEqual([2, 3]);
  });
});

describe('criarDesvio: validação', () => {
  const m = mundoPonte();
  const dados = { roteador: m.roteador, exposicao: m.exposicao, rios: m.rios };

  it('rejeita exposição de outro grafo (número de arestas diferente)', () => {
    const outra = { ...m.exposicao, grafo: { ...m.exposicao.grafo, arestas: 3 } };
    expect(() => criarDesvio({ ...dados, exposicao: outra }, m.estacoes)).toThrow(
      /grafo de 3 arestas.*roteador tem 8/,
    );
  });

  it('rejeita segmento da exposição ausente nos rios', () => {
    const rios = { features: m.rios.features.slice(0, 0) };
    expect(() => criarDesvio({ ...dados, rios }, m.estacoes)).toThrow(
      /segmento 1 .*não está no GeoJSON/,
    );
  });

  it('rejeita versão não suportada', () => {
    expect(() =>
      criarDesvio({ ...dados, exposicao: { ...m.exposicao, versao: 2 } }, m.estacoes),
    ).toThrow(/versão 2 não suportada/);
  });

  it('rejeita estação repetida e política inválida', () => {
    expect(() => criarDesvio(dados, [m.estacoes[0]!, m.estacoes[0]!])).toThrow(/mais de uma vez/);
    expect(() => criarDesvio(dados, m.estacoes, { frescoMin: 0 })).toThrow(/Política inválida/);
    expect(() => criarDesvio(dados, m.estacoes, { critico: { faixa: 40 } })).toThrow(
      /faixa de 40 m/,
    );
  });
});
