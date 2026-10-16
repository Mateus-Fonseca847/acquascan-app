import { describe, expect, it } from 'vitest';
import { aresta, grafoDe, segmentoRio } from './auxiliares-teste';
import { analisarCobertura } from './cobertura';
import { BBOX_PETROPOLIS } from './config';
import { calcularExposicao } from './exposicao';
import { gerarRelatorioExposicao, resumirExposicao } from './relatorio-exposicao';

/**
 * Rio A em y = 0 (x de -1000 a 1000) e rio B em y = 1000. Ruas:
 *  0: paralela ao rio A a 10 m, 400 m, toda exposta;
 *  1: ponte que cruza o rio A;
 *  2: rua comum que cruza o rio A (sem ponte nem túnel);
 *  3: ponte longe de tudo;
 *  4: perpendicular ao rio B, só toca a faixa;
 *  5: túnel que cruza o rio B;
 *  6: rua longe de tudo.
 */
const rios = [
  segmentoRio(
    0,
    [
      [-1000, 0],
      [1000, 0],
    ],
    'Piabanha',
  ),
  segmentoRio(
    1,
    [
      [-1000, 1000],
      [1000, 1000],
    ],
    'Quitandinha',
  ),
];
const ruas = [
  aresta([
    [-200, 10],
    [200, 10],
  ]),
  aresta(
    [
      [500, -45],
      [500, 45],
    ],
    { ponte: true },
  ),
  aresta(
    [
      [700, -45],
      [700, 45],
    ],
    { nome: 'Rua do Vau', classe: 'footway' },
  ),
  aresta(
    [
      [5000, 0],
      [5100, 0],
    ],
    { ponte: true },
  ),
  aresta([
    [0, 1020],
    [0, 1120],
  ]),
  aresta(
    [
      [300, 955],
      [300, 1045],
    ],
    { tunel: true },
  ),
  aresta([
    [9000, 9000],
    [9100, 9000],
  ]),
];
const grafo = grafoDe(ruas);
const resultado = calcularExposicao(grafo, rios);
const resumo = resumirExposicao(grafo, rios, resultado.entradas);

describe('resumirExposicao', () => {
  const doRio = (nome: string) => resumo.porRio.find((x) => x.rio === nome)!;

  it('por rio: arestas que cruzam e arestas em cada faixa', () => {
    expect(doRio('Piabanha').arestasQueCruzam).toBe(2); // ruas 1 e 2
    expect(doRio('Piabanha').arestasPorFaixa).toEqual([3, 3, 3]); // ruas 0, 1 e 2
    expect(doRio('Quitandinha').arestasQueCruzam).toBe(1); // rua 5
    expect(doRio('Quitandinha').arestasPorFaixa[2]).toBe(2); // ruas 4 e 5
    expect(doRio('Quitandinha').arestasPorFaixa[0]).toBe(1); // a rua 4 começa a 20 m: só a rua 5 chega a 15 m
  });

  it('o comprimento exposto é fração x comprimento, e a % é sobre a malha', () => {
    const p = doRio('Piabanha');
    // a rua 0 inteira (400 m) + as ruas 1 e 2 (90 m cada), todas dentro da faixa de 50 m
    expect(p.kmPorFaixa[2]).toBeCloseTo(0.4 + 0.09 + 0.09, 2);
    // A malha da fixture é pequena (~1 km), então os arredondamentos do relatório pesam.
    const malhaExata = ruas.reduce((soma, r) => soma + r.comprimentoM, 0) / 1000;
    expect(p.pctMalhaPorFaixa[2]).toBeCloseTo((0.58 / malhaExata) * 100, 0);
    expect(p.kmPorFaixa[0]).toBeLessThan(p.kmPorFaixa[1]);
    expect(p.kmPorFaixa[1]).toBeLessThanOrEqual(p.kmPorFaixa[2]);
  });

  it('a linha "todos" não conta nada duas vezes', () => {
    const todos = doRio('Todos os rios alvo');
    expect(todos.kmPorFaixa[2]).toBeCloseTo(
      doRio('Piabanha').kmPorFaixa[2] + doRio('Quitandinha').kmPorFaixa[2],
      1,
    );
    expect(todos.arestasQueCruzam).toBe(3);
  });

  it('histograma da f30: a rua toda exposta cai na última faixa, e as que só tocam, nas primeiras', () => {
    expect(resumo.histogramaF30).toHaveLength(10);
    expect(resumo.histogramaF30[9]).toBeGreaterThanOrEqual(1); // a rua 0
    expect(
      resumo.histogramaF30[0]! + resumo.histogramaF30[1]! + resumo.histogramaF30[2]!,
    ).toBeGreaterThanOrEqual(1);
    expect(resumo.histogramaF30.reduce((a, b) => a + b, 0)).toBe(resumo.arestasExpostasF30);
  });

  it('lista as arestas que cruzam sem ser ponte nem túnel, com o ponto do cruzamento', () => {
    expect(resumo.cruzamSemPonteNemTunel.map((x) => x.arestaId)).toEqual([2]);
    const vau = resumo.cruzamSemPonteNemTunel[0]!;
    expect(vau).toMatchObject({ nome: 'Rua do Vau', classe: 'footway' });
    expect(vau.lat).not.toBeNull();
  });

  it('pontes: as que cruzam, as que ficam perto sem cruzar e as sem rio por perto', () => {
    expect(resumo.pontes).toEqual({
      total: 2,
      cruzamRioAlvo: 1,
      pertoSemCruzar: 0,
      semRioPorPerto: 1,
    });
  });

  it('os segmentos com mais arestas associadas vêm primeiro', () => {
    expect(resumo.segmentosMaisLigados[0]).toMatchObject({
      id: 0,
      rio: 'Piabanha',
      arestas: 3,
      cruzam: 2,
    });
  });
});

describe('gerarRelatorioExposicao', () => {
  const cobertura = analisarCobertura(grafo, [
    {
      osmWayId: 1,
      nome: 'Rio Piabanha',
      waterway: 'river',
      coberto: false,
      comprimentoM: 2000,
      pontos: rios[0]!.pontos,
      alvo: true,
    },
  ]);
  const base = {
    bbox: BBOX_PETROPOLIS,
    geradoEm: new Date('2026-10-16T12:00:00Z'),
    grafo: { nos: 1, arestas: 7, sha256: 'a'.repeat(64) },
    parametros: { passoM: 5, faixasM: [15, 30, 50] },
    resumo,
    saida: { bytes: 2048, bytesGzip: 512, entradas: resultado.entradas.length, segmentos: 2 },
  };
  const texto = gerarRelatorioExposicao({ ...base, cobertura });

  it('traz as sete seções', () => {
    for (const secao of [
      '## 1. Por rio alvo',
      '## 2. Fração f30',
      '## 3. Arestas que cruzam um rio SEM serem ponte nem túnel',
      '## 4. Pontes',
      '## 5. Segmentos de rio com mais arestas',
      '## 6. Cobertura do monitoramento',
      '## 7. Arquivo de saída',
    ]) {
      expect(texto).toContain(secao);
    }
    expect(texto).toContain('colaboradores do OpenStreetMap');
    expect(texto).toContain('Rua do Vau');
    expect(texto).toContain('JSON com gzip');
  });

  it('a seção de cobertura avisa que outros rios não terão desvio', () => {
    expect(texto).toContain('NÃO terão desvio por estado de estação');
    expect(texto).toContain('Arestas que cruzam algum waterway');
  });

  it('sem o cache dos rios, a seção de cobertura explica o que fazer', () => {
    const sem = gerarRelatorioExposicao({ ...base, cobertura: null });
    expect(sem).toContain('pnpm grafo:rios');
  });
});
