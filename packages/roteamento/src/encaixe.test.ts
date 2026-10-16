import { describe, expect, it } from 'vitest';
import { montarGrafo, mulberry32, pontoEmMetros } from '../test/auxiliares';
import { haversineM, ProjecaoLocal } from './geo';
import { criarRoteador } from './index';

/**
 *   A(0,0) ---e0--- B(200,0)
 *                    |
 *                   e1
 *                    |
 *                  C(200,200)
 */
const grafo = montarGrafo(
  [
    [0, 0],
    [200, 0],
    [200, 200],
  ],
  [
    { de: 0, para: 1 },
    { de: 1, para: 2 },
  ],
);
const roteador = criarRoteador(grafo);

describe('encaixar', () => {
  it('ponto sobre a aresta: distância ~0 e posição ao longo dela', () => {
    const e = roteador.encaixar(pontoEmMetros(50, 0))!;
    expect(e.arestaId).toBe(0);
    expect(e.posicaoM).toBeCloseTo(50, 0);
    expect(e.distanciaM).toBeLessThan(0.3);
    expect(e.ponto.latitude).toBeCloseTo(pontoEmMetros(50, 0).latitude, 7);
    expect(e.ponto.longitude).toBeCloseTo(pontoEmMetros(50, 0).longitude, 7);
  });

  it('ponto ao lado da aresta: a distância é a perpendicular', () => {
    const e = roteador.encaixar(pontoEmMetros(50, 20))!;
    expect(e.arestaId).toBe(0);
    expect(e.posicaoM).toBeCloseTo(50, 0);
    expect(e.distanciaM).toBeCloseTo(20, 0);
    expect(e.ponto.latitude).toBeCloseTo(pontoEmMetros(50, 0).latitude, 7);
  });

  it('ponto perto de um nó, antes da ponta: encaixa no nó (posição 0)', () => {
    const e = roteador.encaixar(pontoEmMetros(-10, 5))!;
    expect(e.arestaId).toBe(0);
    expect(e.posicaoM).toBe(0);
    expect(e.distanciaM).toBeCloseTo(Math.hypot(10, 5), 0);
  });

  it('na ponta da aresta, a posição é exatamente o comprimento', () => {
    const e = roteador.encaixar(pontoEmMetros(260, 0))!;
    expect(e.arestaId).toBe(0);
    expect(e.posicaoM).toBe(grafo.arestas[0]!.comprimentoM);
    expect(e.posicaoM + (grafo.arestas[0]!.comprimentoM - e.posicaoM)).toBe(
      grafo.arestas[0]!.comprimentoM,
    );
  });

  it('entre duas arestas, escolhe a mais próxima', () => {
    const e = roteador.encaixar(pontoEmMetros(190, 60))!;
    expect(e.arestaId).toBe(1);
    expect(e.posicaoM).toBeCloseTo(60, 0);
    expect(e.distanciaM).toBeCloseTo(10, 0);
  });

  it('em um nó compartilhado, o resultado é determinístico (menor id de aresta)', () => {
    const e = roteador.encaixar(pontoEmMetros(200, 0))!;
    expect(e.arestaId).toBe(0);
    expect(e.posicaoM).toBeCloseTo(grafo.arestas[0]!.comprimentoM, 3);
  });

  it('além do limite devolve null; com limite maior, encaixa', () => {
    expect(roteador.encaixar(pontoEmMetros(50, -300))).toBeNull(); // padrão: 250 m
    expect(roteador.encaixar(pontoEmMetros(50, -300), 400)!.distanciaM).toBeCloseTo(300, 0);
    expect(roteador.encaixar(pontoEmMetros(50, -300), 299)).toBeNull();
  });

  it('longe de tudo (quilômetros) devolve null sem varrer nada', () => {
    expect(roteador.encaixar(pontoEmMetros(50_000, 50_000), 250)).toBeNull();
    expect(roteador.encaixar(pontoEmMetros(-50_000, -50_000), 250)).toBeNull();
  });

  it('rejeita pontos e limites inválidos', () => {
    expect(() => roteador.encaixar({ latitude: NaN, longitude: 0 })).toThrow(/Ponto inválido/);
    expect(() => roteador.encaixar(pontoEmMetros(0, 0), 0)).toThrow(/maxDistanciaM/);
  });
});

describe('encaixar: posição pela fração da geometria simplificada', () => {
  // Geometria em L: (0,0) -> (100,0) -> (100,100). A polilinha mede 200 m, mas o comprimento
  // da aresta (da polilinha ORIGINAL, antes de simplificar) é 250 m.
  const em_L = montarGrafo(
    [
      [0, 0],
      [100, 100],
    ],
    [{ de: 0, para: 1, via: [[100, 0]], comprimentoM: 250 }],
  );
  const r = criarRoteador(em_L);

  it('a fração da geometria multiplica o comprimento da aresta', () => {
    expect(r.encaixar(pontoEmMetros(50, 0))!.posicaoM).toBeCloseTo(62.5, 0); // 1/4 da geometria
    expect(r.encaixar(pontoEmMetros(100, 0))!.posicaoM).toBeCloseTo(125, 0); // a esquina: metade
    expect(r.encaixar(pontoEmMetros(100, 50))!.posicaoM).toBeCloseTo(187.5, 0); // 3/4
  });

  it('no fim da aresta a posição é exatamente comprimentoM (soma exata)', () => {
    const fim = r.encaixar(pontoEmMetros(100, 100))!;
    expect(fim.posicaoM).toBe(250);
    const inicio = r.encaixar(pontoEmMetros(0, 0))!;
    expect(inicio.posicaoM).toBe(0);
  });
});

describe('encaixar: o índice em grade acha o mesmo que a busca por força bruta', () => {
  // Polilinhas aleatórias numa área de 3 km x 3 km; 400 consultas, algumas fora do limite.
  const sorteio = mulberry32(2026);
  const nos: [number, number][] = [];
  const arestas: { de: number; para: number; via: [number, number][] }[] = [];
  for (let i = 0; i < 60; i++) {
    const x = sorteio() * 3000;
    const y = sorteio() * 3000;
    nos.push([x, y], [x + (sorteio() - 0.5) * 600, y + (sorteio() - 0.5) * 600]);
    const via: [number, number][] = Array.from({ length: 1 + Math.floor(sorteio() * 4) }, () => [
      x + (sorteio() - 0.5) * 500,
      y + (sorteio() - 0.5) * 500,
    ]);
    arestas.push({ de: 2 * i, para: 2 * i + 1, via });
  }
  const g = montarGrafo(nos, arestas);
  const r = criarRoteador(g);
  const plano = new ProjecaoLocal(g.nos[0]!.lat, g.nos[0]!.lon);

  function forcaBruta(lat: number, lon: number): number {
    const px = plano.x(lon);
    const py = plano.y(lat);
    let melhor = Infinity;
    for (const a of g.arestas) {
      for (let k = 1; k < a.geometria.length; k++) {
        const ax = plano.x(a.geometria[k - 1]![1]);
        const ay = plano.y(a.geometria[k - 1]![0]);
        const bx = plano.x(a.geometria[k]![1]);
        const by = plano.y(a.geometria[k]![0]);
        const c2 = (bx - ax) ** 2 + (by - ay) ** 2;
        const t =
          c2 === 0
            ? 0
            : Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / c2));
        melhor = Math.min(melhor, Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))));
      }
    }
    return melhor;
  }

  it('distância e decisão de "dentro do limite" coincidem com a força bruta', () => {
    let achados = 0;
    let nulos = 0;
    for (let i = 0; i < 400; i++) {
      const p = pontoEmMetros(-300 + sorteio() * 3600, -300 + sorteio() * 3600);
      const esperado = forcaBruta(p.latitude, p.longitude);
      const e = r.encaixar(p, 250);
      if (esperado <= 249.9) {
        expect(e).not.toBeNull();
        expect(e!.distanciaM).toBeCloseTo(esperado, 1);
        // e o ponto devolvido está mesmo a essa distância do ponto consultado
        expect(
          haversineM(p.latitude, p.longitude, e!.ponto.latitude, e!.ponto.longitude),
        ).toBeCloseTo(esperado, 0);
        achados++;
      } else if (esperado > 250.1) {
        expect(e).toBeNull();
        nulos++;
      }
    }
    expect(achados).toBeGreaterThan(50);
    expect(nulos).toBeGreaterThan(5);
  });
});
