/**
 * A exposição de uma rua é a SOMA das frações dos trechos de rio (partes separadas da rua), não o
 * maior valor. Cada amostra da rua pertence a um só trecho, então a soma nunca passa de 1.
 */
import { describe, expect, it } from 'vitest';
import { AGORA, criarMundo, leitura, p } from '../test/auxiliares';

const L = (...pares: [number, 'CRITICO' | 'ATENCAO' | 'ESTAVEL'][]) =>
  pares.map(([id, estado]) => leitura(id, estado, 2));

describe('soma das frações de trechos diferentes', () => {
  // Uma rua de 200 m paralela a dois trechos do mesmo rio (metade cada um), a 30 m deles.
  const duasMetades = () =>
    criarMundo({
      nos: [
        [0, 30],
        [200, 30],
      ],
      arestas: [{ de: 0, para: 1 }],
      rios: [
        {
          rio: 'Piabanha',
          pontos: [
            [-100, 0],
            [100, 0],
          ],
        },
        {
          rio: 'Piabanha',
          pontos: [
            [100, 0],
            [300, 0],
          ],
        },
      ],
      estacoes: [{ id: 1, rio: 'Piabanha', x: 100, y: 0 }],
    });

  it('rua dividida em dois trechos críticos (0,5 + 0,5) recebe 1 + 49', () => {
    const m = duasMetades();
    const fs = m.exposicao.entradas.map((e) => e[6]!);
    expect(fs).toHaveLength(2);
    expect(fs[0]).toBeGreaterThan(0.4);
    expect(fs[0]).toBeLessThan(0.6);
    const r = m.desvio.rotear(p(0, 30), p(200, 30), L([1, 'CRITICO']), AGORA);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.recomendada.rota.trechos[0]!.multiplicador).toBeCloseTo(50, 6);
    // Com o máximo (o comportamento antigo) daria 1 + 49 x 0,5 = 25,5.
  });

  it('a exposição crítica usa a soma e o comprimento PARCIAL percorrido', () => {
    const m = duasMetades();
    const r = m.desvio.rotear(p(100, 30), p(200, 30), L([1, 'CRITICO']), AGORA);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.recomendada.exposicaoCriticaM).toBeCloseTo(100, 0); // 100 m percorridos x FC = 1
    const inteira = m.desvio.rotear(p(0, 30), p(200, 30), L([1, 'CRITICO']), AGORA);
    if (inteira.status !== 'ok') throw new Error(inteira.status);
    expect(inteira.recomendada.exposicaoCriticaM).toBeCloseTo(200, 0);
  });

  it('a soma é limitada a 1 (duas travessias curtas na mesma rua)', () => {
    // Rua de 40 m que cruza dois trechos: cada travessia vale min(1, 60/40) = 1; a soma seria 2.
    const m = criarMundo({
      nos: [
        [0, 20],
        [0, -20],
      ],
      arestas: [{ de: 0, para: 1 }],
      rios: [
        {
          rio: 'Piabanha',
          pontos: [
            [-100, 5],
            [100, 5],
          ],
        },
        {
          rio: 'Piabanha',
          pontos: [
            [-100, -5],
            [100, -5],
          ],
        },
      ],
      estacoes: [{ id: 1, rio: 'Piabanha', x: 0, y: 0 }],
    });
    const r = m.desvio.rotear(p(0, 20), p(0, -20), L([1, 'CRITICO']), AGORA);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.recomendada.rota.trechos[0]!.multiplicador).toBeCloseTo(50, 6);
    expect(r.recomendada.exposicaoCriticaM).toBeCloseTo(40, 0);
    expect(r.recomendada.travessiasCriticas).toBe(1); // uma rua usada = uma travessia contada
  });

  it('mistura de crítico e atenção: 1 + 49 FC + 3 FA', () => {
    // Rua a 10 m de dois trechos de rios diferentes: metade perto de A (crítico), metade de B (atenção).
    const m = criarMundo({
      nos: [
        [0, 10],
        [200, 10],
      ],
      arestas: [{ de: 0, para: 1 }],
      rios: [
        {
          rio: 'A',
          pontos: [
            [-100, 0],
            [100, 0],
          ],
        },
        {
          rio: 'B',
          pontos: [
            [100, 0],
            [300, 0],
          ],
        },
      ],
      estacoes: [
        { id: 1, rio: 'A', x: 0, y: 0 },
        { id: 2, rio: 'B', x: 200, y: 0 },
      ],
    });
    const [ea, eb] = m.exposicao.entradas;
    const fc = ea![6]!; // f50 do trecho A
    const fa = eb![4]!; // f15 do trecho B
    expect(fc + fa).toBeGreaterThan(0.9);
    const r = m.desvio.rotear(p(0, 10), p(200, 10), L([1, 'CRITICO'], [2, 'ATENCAO']), AGORA);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.recomendada.rota.trechos[0]!.multiplicador).toBeCloseTo(1 + 49 * fc + 3 * fa, 4);
    expect(r.recomendada.exposicaoCriticaM).toBeCloseTo(200 * fc, 0);
    expect(r.recomendada.exposicaoAtencaoM).toBeCloseTo(200 * fa, 0);
  });

  it('crítico + atenção nunca passam de 100% da rua: a atenção cede', () => {
    // Rua curta que cruza um trecho crítico (FC = 1) e um de atenção: FA vira 0.
    const m = criarMundo({
      nos: [
        [0, 20],
        [0, -20],
      ],
      arestas: [{ de: 0, para: 1 }],
      rios: [
        {
          rio: 'A',
          pontos: [
            [-100, 5],
            [100, 5],
          ],
        },
        {
          rio: 'B',
          pontos: [
            [-100, -5],
            [100, -5],
          ],
        },
      ],
      estacoes: [
        { id: 1, rio: 'A', x: 0, y: 0 },
        { id: 2, rio: 'B', x: 0, y: 0 },
      ],
    });
    const r = m.desvio.rotear(p(0, 20), p(0, -20), L([1, 'CRITICO'], [2, 'ATENCAO']), AGORA);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.recomendada.rota.trechos[0]!.multiplicador).toBeCloseTo(50, 6); // não 53
    expect(r.recomendada.exposicaoAtencaoM).toBeCloseTo(0, 6);
  });

  it('travessia mais trecho paralelo: soma, sem contar a mesma parte duas vezes', () => {
    // Rua vertical de 400 m: cruza o rio A em y = 0 e corre ao lado do trecho B (y de -200 a -100).
    const m = criarMundo({
      nos: [
        [0, 200],
        [0, -200],
      ],
      arestas: [{ de: 0, para: 1 }],
      rios: [
        {
          rio: 'Piabanha',
          pontos: [
            [-300, 0],
            [300, 0],
          ],
        },
        {
          rio: 'Piabanha',
          pontos: [
            [20, -200],
            [20, -100],
          ],
        },
      ],
      estacoes: [{ id: 1, rio: 'Piabanha', x: 0, y: -100 }],
      politica: { distanciaTrechoM: 1000 },
    });
    const fA = m.exposicao.entradas.find((e) => e[1] === 1)![6]!;
    const fB = m.exposicao.entradas.find((e) => e[1] === 2)![6]!;
    const piso = 60 / 400;
    expect(fA).toBeGreaterThan(0.15);
    expect(fB).toBeGreaterThan(0.15);
    const esperado = Math.min(1, Math.max(fA, piso) + Math.max(fB, 0));
    const r = m.desvio.rotear(p(0, 200), p(0, -200), L([1, 'CRITICO']), AGORA);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.recomendada.rota.trechos[0]!.multiplicador).toBeCloseTo(1 + 49 * esperado, 4);
    // fA + fB já são partes diferentes da rua (amostras de dono único): nada é somado em dobro.
    expect(esperado).toBeCloseTo(fA + fB, 6);
  });
});
