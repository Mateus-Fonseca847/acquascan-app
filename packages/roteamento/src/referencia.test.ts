/**
 * O A* contra um Dijkstra ingênuo (test/auxiliares.ts): o custo tem de ser IGUAL em todos os
 * pares. Primeiro em grades aleatórias com pesos e multiplicadores aleatórios (inclusive
 * Infinity), depois no grafo REAL de Petrópolis, se o arquivo gerado por tools/grafo existir.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  custoDeReferencia,
  montarGrafo,
  mulberry32,
  pontoNaAresta,
  type PosicaoNaRede,
} from '../test/auxiliares';
import { criarRoteador, type GrafoBruto, type LatLng, type Roteador } from './index';

const TOLERANCIA = 1e-6;

/** O custo do A* tem de bater com o da referência (ou ambos sem caminho). */
function compararComReferencia(
  roteador: Roteador,
  grafo: GrafoBruto,
  mult: Float32Array,
  origem: LatLng,
  destino: LatLng,
  posOrigem: PosicaoNaRede,
  posDestino: PosicaoNaRede,
): 'ok' | 'sem_caminho' {
  const esperado = custoDeReferencia(grafo, mult, posOrigem, posDestino);
  const r = roteador.rotear(origem, destino, { multiplicadorPorAresta: mult });

  if (esperado === Infinity) {
    expect(r.status).toBe('sem_caminho');
    return 'sem_caminho';
  }
  expect(r.status).toBe('ok');
  if (r.status !== 'ok') throw new Error('inalcançável');
  expect(Math.abs(r.custo - esperado)).toBeLessThanOrEqual(TOLERANCIA + 1e-12 * esperado);
  return 'ok';
}

// ---------------------------------------------------------------------------------------------

function gradeAleatoria(semente: number, lado: number) {
  const sorteio = mulberry32(semente);
  const nos: [number, number][] = [];
  for (let j = 0; j < lado; j++) for (let i = 0; i < lado; i++) nos.push([i * 100, j * 100]);

  const definicoes: { de: number; para: number }[] = [];
  for (let j = 0; j < lado; j++) {
    for (let i = 0; i < lado; i++) {
      const id = j * lado + i;
      if (i + 1 < lado && sorteio() < 0.92) definicoes.push({ de: id, para: id + 1 });
      if (j + 1 < lado && sorteio() < 0.92) definicoes.push({ de: id, para: id + lado });
    }
  }
  const grafo = montarGrafo(nos, definicoes);
  // Comprimentos "reais" maiores que a reta (ruas tortas): de 0% a 50% a mais.
  for (const a of grafo.arestas) a.comprimentoM *= 1 + sorteio() * 0.5;

  const mult = new Float32Array(grafo.arestas.length);
  const opcoes = [1, 1, 1, 1, 1, 1.5, 2, 3, 10, 1000];
  for (let e = 0; e < mult.length; e++) {
    const r = sorteio();
    mult[e] = r < 0.04 ? Infinity : opcoes[Math.floor(sorteio() * opcoes.length)]!;
  }
  return { grafo, mult, sorteio };
}

describe('A* contra Dijkstra de referência: grades aleatórias de 30x30', () => {
  it.each([11, 22, 33])(
    'semente %i: 100 pares com origem e destino no meio de arestas',
    (semente) => {
      const { grafo, mult, sorteio } = gradeAleatoria(semente, 30);
      const roteador = criarRoteador(grafo);
      const n = grafo.arestas.length;

      let ok = 0;
      let semCaminho = 0;
      for (let i = 0; i < 100; i++) {
        const eo = Math.floor(sorteio() * n);
        // 20% dos pares ficam na mesma aresta, para exercitar o trajeto direto.
        const ed = i % 5 === 0 ? eo : Math.floor(sorteio() * n);
        const fo = 0.03 + sorteio() * 0.94;
        const fd = 0.03 + sorteio() * 0.94;

        const resultado = compararComReferencia(
          roteador,
          grafo,
          mult,
          pontoNaAresta(grafo, eo, fo),
          pontoNaAresta(grafo, ed, fd),
          { arestaId: eo, posicaoM: fo * grafo.arestas[eo]!.comprimentoM },
          { arestaId: ed, posicaoM: fd * grafo.arestas[ed]!.comprimentoM },
        );
        if (resultado === 'ok') ok++;
        else semCaminho++;
      }
      // O teste não pode ser vazio: há rotas de verdade e há casos sem caminho.
      expect(ok).toBeGreaterThan(50);
      expect(semCaminho).toBeGreaterThan(0);
    },
  );

  it('sem nenhum multiplicador (tudo 1) o A* também iguala o Dijkstra', () => {
    const { grafo, sorteio } = gradeAleatoria(44, 30);
    const roteador = criarRoteador(grafo);
    const todosUm = new Float32Array(grafo.arestas.length).fill(1);
    const n = grafo.arestas.length;

    for (let i = 0; i < 100; i++) {
      const eo = Math.floor(sorteio() * n);
      const ed = Math.floor(sorteio() * n);
      const fo = 0.05 + sorteio() * 0.9;
      const fd = 0.05 + sorteio() * 0.9;
      compararComReferencia(
        roteador,
        grafo,
        todosUm,
        pontoNaAresta(grafo, eo, fo),
        pontoNaAresta(grafo, ed, fd),
        { arestaId: eo, posicaoM: fo * grafo.arestas[eo]!.comprimentoM },
        { arestaId: ed, posicaoM: fd * grafo.arestas[ed]!.comprimentoM },
      );
    }
  });
});

// ---------------------------------------------------------------------------------------------

const caminhoGrafoReal = fileURLToPath(
  new URL('../../../tools/grafo/saida/grafo-petropolis.json', import.meta.url),
);

/** Pula quando o arquivo não foi gerado (o CI não roda tools/grafo). */
describe.skipIf(!existsSync(caminhoGrafoReal))(
  'grafo REAL de Petrópolis (tools/grafo/saida)',
  () => {
    let grafo: GrafoBruto;
    let roteador: Roteador;
    const sorteio = mulberry32(1500);

    /** Um ponto aleatório SOBRE a geometria de uma aresta aleatória. */
    function pontoAleatorio(): LatLng {
      const e = Math.floor(sorteio() * grafo.arestas.length);
      return pontoNaAresta(grafo, e, sorteio());
    }

    beforeAll(() => {
      grafo = JSON.parse(readFileSync(caminhoGrafoReal, 'utf8')) as GrafoBruto;
      roteador = criarRoteador(grafo);
    });

    it('200 pares: o custo do A* é igual ao do Dijkstra e nenhum fica sem caminho', () => {
      const todosUm = new Float32Array(grafo.arestas.length).fill(1);
      let somaM = 0;
      for (let i = 0; i < 200; i++) {
        const origem = pontoAleatorio();
        const destino = pontoAleatorio();
        const eo = roteador.encaixar(origem)!;
        const ed = roteador.encaixar(destino)!;

        const esperado = custoDeReferencia(grafo, todosUm, eo, ed);
        const r = roteador.rotear(origem, destino);

        expect(r.status).toBe('ok'); // o grafo é um único componente
        if (r.status !== 'ok') return;
        expect(Math.abs(r.custo - esperado)).toBeLessThanOrEqual(TOLERANCIA);
        somaM += r.distanciaRedeM;
      }
      console.info(
        `[grafo real] 200 pares conferidos; distância média na rede: ${(somaM / 200).toFixed(0)} m`,
      );
    });

    it('100 pares com multiplicadores aleatórios (1 a 3, e alguns 1000): custo igual ao do Dijkstra', () => {
      const mult = new Float32Array(grafo.arestas.length);
      for (let e = 0; e < mult.length; e++) {
        const r = sorteio();
        mult[e] = r < 0.02 ? 1000 : r < 0.3 ? 1 + Math.floor(sorteio() * 3) : 1;
      }
      for (let i = 0; i < 100; i++) {
        const origem = pontoAleatorio();
        const destino = pontoAleatorio();
        const eo = roteador.encaixar(origem)!;
        const ed = roteador.encaixar(destino)!;
        const esperado = custoDeReferencia(grafo, mult, eo, ed);
        const r = roteador.rotear(origem, destino, { multiplicadorPorAresta: mult });
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(Math.abs(r.custo - esperado)).toBeLessThanOrEqual(TOLERANCIA + 1e-12 * esperado);
      }
    });
  },
);
