import { describe, expect, it } from 'vitest';
import { montarGrafo } from '../test/auxiliares';
import { criarRoteador } from './index';
import type { GrafoBruto } from './index';

const valido = () =>
  montarGrafo(
    [
      [0, 0],
      [100, 0],
    ],
    [{ de: 0, para: 1 }],
  );

/** Passa um grafo adulterado (de propósito fora do tipo) para criarRoteador. */
const criarCom = (adulterar: (g: Record<string, any>) => void) => {
  const g = JSON.parse(JSON.stringify(valido()));
  adulterar(g);
  return () => criarRoteador(g as GrafoBruto);
};

describe('criarRoteador: validação do grafo', () => {
  it('aceita um grafo válido e expõe os totais', () => {
    const roteador = criarRoteador(valido());
    expect(roteador.totalArestas).toBe(1);
    expect(roteador.totalNos).toBe(2);
  });

  it('aceita um grafo sem nenhuma aresta', () => {
    const roteador = criarRoteador({ versao: 1, nos: [], arestas: [] });
    expect(roteador.totalArestas).toBe(0);
    expect(roteador.encaixar({ latitude: -22.5, longitude: -43.17 })).toBeNull();
  });

  it.each([
    [
      'null',
      () => criarRoteador(null as unknown as GrafoBruto),
      /Grafo inválido: esperado um objeto/,
    ],
    [
      'versão desconhecida',
      criarCom((g) => (g['versao'] = 2)),
      /Grafo inválido: versão 2 não suportada/,
    ],
    ['sem versão', criarCom((g) => delete g['versao']), /versão undefined não suportada/],
    ['nos que não é lista', criarCom((g) => (g['nos'] = {})), /"nos" deve ser uma lista/],
    [
      'arestas que não é lista',
      criarCom((g) => (g['arestas'] = 'x')),
      /"arestas" deve ser uma lista/,
    ],
    ['nó com lat em texto', criarCom((g) => (g['nos'][0].lat = '1')), /nos\[0\]\.lat/],
    ['nó com lon fora do intervalo', criarCom((g) => (g['nos'][1].lon = 500)), /nos\[1\]\.lon/],
    [
      'aresta com "de" fora dos nós',
      criarCom((g) => (g['arestas'][0].de = 9)),
      /arestas\[0\]\.de deve ser um índice válido/,
    ],
    [
      'aresta com "para" não inteiro',
      criarCom((g) => (g['arestas'][0].para = 0.5)),
      /arestas\[0\]\.para/,
    ],
    [
      'comprimento NaN',
      criarCom((g) => (g['arestas'][0].comprimentoM = null)),
      /comprimentoM deve ser um número maior que zero/,
    ],
    ['comprimento zero', criarCom((g) => (g['arestas'][0].comprimentoM = 0)), /comprimentoM/],
    [
      'geometria com 1 ponto',
      criarCom((g) => (g['arestas'][0].geometria = [[0, 0]])),
      /geometria deve ter pelo menos 2 pontos/,
    ],
    [
      'ponto da geometria malformado',
      criarCom((g) => (g['arestas'][0].geometria[1] = [1])),
      /geometria\[1\]/,
    ],
    ['classe vazia', criarCom((g) => (g['arestas'][0].classe = '')), /classe/],
    ['nome que não é texto', criarCom((g) => (g['arestas'][0].nome = 5)), /arestas\[0\]\.nome/],
    [
      'escada que não é booleano',
      criarCom((g) => (g['arestas'][0].escada = 'sim')),
      /escada deve ser verdadeiro ou falso/,
    ],
  ])('lança erro claro: %s', (_nome, criar, mensagem) => {
    expect(criar).toThrow(mensagem);
  });
});
