import { describe, expect, it } from 'vitest';
import { montarGrafo, multiplicadores, pontoEmMetros } from '../test/auxiliares';
import { criarRoteador } from './index';
import type { LatLng, ResultadoRota, RotaEncontrada } from './index';

const p = pontoEmMetros;

function ok(r: ResultadoRota): RotaEncontrada {
  if (r.status !== 'ok') throw new Error(`esperava ok, veio ${r.status}`);
  return r;
}

/** Compara um LatLng com um ponto dado em metros (tolerância de ~0,3 m). */
function expectPerto(real: LatLng, x: number, y: number) {
  const esperado = p(x, y);
  expect(real.latitude).toBeCloseTo(esperado.latitude, 5);
  expect(real.longitude).toBeCloseTo(esperado.longitude, 5);
}

describe('rotear: caminho único', () => {
  //  A(0,0) --e0-- B(100,0)
  //                  |
  //                  e1
  //                  |
  //  D(200,100) --e2-- C(100,100)
  const grafo = montarGrafo(
    [
      [0, 0],
      [100, 0],
      [100, 100],
      [200, 100],
    ],
    [
      { de: 0, para: 1, nome: 'Rua A', classe: 'residential' },
      { de: 1, para: 2, nome: 'Rua B', classe: 'footway' },
      { de: 2, para: 3, classe: 'steps', escada: true },
    ],
  );
  const roteador = criarRoteador(grafo);

  it('soma as partes: parcial na primeira e na última aresta, inteira no meio', () => {
    const r = ok(roteador.rotear(p(30, 0), p(150, 100)));

    expect(r.distanciaRedeM).toBeCloseTo(70 + 100 + 50, 0);
    expect(r.encaixeOrigemM).toBeLessThan(0.3);
    expect(r.encaixeDestinoM).toBeLessThan(0.3);
    expect(r.trechos.map((t) => t.arestaId)).toEqual([0, 1, 2]);
    expect(r.trechos.map((t) => t.sentido)).toEqual(['direto', 'direto', 'direto']);
    expect(r.trechos[0]!.comprimentoM).toBeCloseTo(70, 0);
    expect(r.trechos[1]!.comprimentoM).toBeCloseTo(100, 0);
    expect(r.trechos[2]!.comprimentoM).toBeCloseTo(50, 0);
    expect(r.trechos.map((t) => t.nome)).toEqual(['Rua A', 'Rua B', null]);
    expect(r.trechos.map((t) => t.classe)).toEqual(['residential', 'footway', 'steps']);
    expect(r.custo).toBeCloseTo(r.distanciaRedeM, 9); // multiplicadores 1
    expect(r.trechos.every((t) => t.multiplicador === 1)).toBe(true);
    expect(r.tempoS).toBeCloseTo(r.distanciaRedeM / 1.25, 6); // 4,5 km/h = 1,25 m/s
  });

  it('a velocidade muda só o tempo', () => {
    const lenta = ok(roteador.rotear(p(30, 0), p(150, 100), { velocidadeKmH: 3.6 }));
    expect(lenta.tempoS).toBeCloseTo(lenta.distanciaRedeM, 6); // 3,6 km/h = 1 m/s
  });

  it('no sentido contrário os trechos são "inverso" e os pontos vêm orientados', () => {
    const r = ok(roteador.rotear(p(150, 100), p(30, 0)));

    expect(r.trechos.map((t) => t.arestaId)).toEqual([2, 1, 0]);
    expect(r.trechos.map((t) => t.sentido)).toEqual(['inverso', 'inverso', 'inverso']);
    expect(r.distanciaRedeM).toBeCloseTo(220, 0);

    // A linha completa começa na origem e termina no destino.
    expectPerto(r.pontos[0]!, 150, 100);
    expectPerto(r.pontos[r.pontos.length - 1]!, 30, 0);
    // Cada trecho está orientado no sentido do percurso.
    expectPerto(r.trechos[1]!.pontos[0]!, 100, 100); // e1 percorrida de C para B
    expectPerto(r.trechos[1]!.pontos[r.trechos[1]!.pontos.length - 1]!, 100, 0);
  });

  it('os trechos das pontas são cortados no ponto de encaixe', () => {
    const r = ok(roteador.rotear(p(30, 0), p(150, 100)));
    expectPerto(r.trechos[0]!.pontos[0]!, 30, 0);
    expectPerto(r.trechos[0]!.pontos[r.trechos[0]!.pontos.length - 1]!, 100, 0);
    expectPerto(r.trechos[2]!.pontos[0]!, 100, 100);
    expectPerto(r.trechos[2]!.pontos[r.trechos[2]!.pontos.length - 1]!, 150, 100);
  });

  it('o encaixe da origem e do destino conta a distância até a rede', () => {
    const r = ok(roteador.rotear(p(30, 40), p(150, 130)));
    expect(r.encaixeOrigemM).toBeCloseTo(40, 0);
    expect(r.encaixeDestinoM).toBeCloseTo(30, 0);
    expect(r.distanciaRedeM).toBeCloseTo(220, 0); // o encaixe não entra na distância da rede
  });

  it('expõe os atributos das arestas (somente leitura) e o total', () => {
    expect(roteador.totalArestas).toBe(3);
    expect(roteador.atributos(0)).toMatchObject({
      nome: 'Rua A',
      classe: 'residential',
      escada: false,
    });
    expect(roteador.atributos(2)).toMatchObject({
      nome: null,
      classe: 'steps',
      escada: true,
      ponte: false,
      tunel: false,
    });
    expect(() => roteador.atributos(3)).toThrow(/fora do intervalo/);
    expect(() => roteador.atributos(-1)).toThrow(/fora do intervalo/);
  });
});

describe('rotear: escolha entre caminhos', () => {
  //   P(-50,0) --e3-- A(0,0) ------e0 (100 m)------ B(100,0) --e4-- Q(150,0)
  //                      \                             /
  //                     e1 (94 m)   C(50,80)   e2 (94 m)
  const grafo = montarGrafo(
    [
      [0, 0],
      [100, 0],
      [50, 80],
      [-50, 0],
      [150, 0],
    ],
    [
      { de: 0, para: 1 }, // e0, o caminho curto (100 m)
      { de: 0, para: 2 }, // e1
      { de: 2, para: 1 }, // e2
      { de: 3, para: 0 }, // e3
      { de: 1, para: 4 }, // e4
    ],
  );
  const roteador = criarRoteador(grafo);
  const origem = p(-30, 0);
  const destino = p(130, 0);

  it('com dois caminhos escolhe o mais curto', () => {
    const r = ok(roteador.rotear(origem, destino));
    expect(r.trechos.map((t) => t.arestaId)).toEqual([3, 0, 4]);
    expect(r.distanciaRedeM).toBeCloseTo(30 + 100 + 30, 0);
  });

  it('multiplicador 3 na aresta curta faz o desvio compensar', () => {
    const r = ok(
      roteador.rotear(origem, destino, { multiplicadorPorAresta: multiplicadores(5, { 0: 3 }) }),
    );
    expect(r.trechos.map((t) => t.arestaId)).toEqual([3, 1, 2, 4]);
    expect(r.distanciaRedeM).toBeCloseTo(30 + 94.3 + 94.3 + 30, 0);
  });

  it('multiplicador 1,5 ainda não compensa o desvio (150 contra ~189 na aresta)', () => {
    const r = ok(
      roteador.rotear(origem, destino, { multiplicadorPorAresta: multiplicadores(5, { 0: 1.5 }) }),
    );
    expect(r.trechos.map((t) => t.arestaId)).toEqual([3, 0, 4]);
    expect(r.custo).toBeCloseTo(30 + 100 * 1.5 + 30, 0);
    expect(r.trechos[1]!.multiplicador).toBe(1.5);
  });

  it('Infinity na aresta curta, havendo alternativa, usa a alternativa', () => {
    const r = ok(
      roteador.rotear(origem, destino, {
        multiplicadorPorAresta: multiplicadores(5, { 0: Infinity }),
      }),
    );
    expect(r.trechos.map((t) => t.arestaId)).toEqual([3, 1, 2, 4]);
    expect(Number.isFinite(r.custo)).toBe(true);
  });

  it('a mesma rota duas vezes dá o mesmo resultado (a área de trabalho é reaproveitada sem vazar estado)', () => {
    const a = ok(roteador.rotear(origem, destino));
    ok(roteador.rotear(destino, origem, { multiplicadorPorAresta: multiplicadores(5, { 0: 50 }) }));
    const b = ok(roteador.rotear(origem, destino));
    expect(b.trechos.map((t) => t.arestaId)).toEqual(a.trechos.map((t) => t.arestaId));
    expect(b.custo).toBe(a.custo);
  });
});

describe('rotear: multiplicadores altos e bloqueio', () => {
  //  A(0,0) --e0-- B(100,0) --e1 (ponte)-- C(200,0) --e2-- D(300,0)
  const grafo = montarGrafo(
    [
      [0, 0],
      [100, 0],
      [200, 0],
      [300, 0],
    ],
    [
      { de: 0, para: 1 },
      { de: 1, para: 2, ponte: true, classe: 'footway' },
      { de: 2, para: 3 },
    ],
  );
  const roteador = criarRoteador(grafo);

  it('multiplicador 1000 numa aresta única ainda devolve a rota, com custo alto e o multiplicador no trecho', () => {
    const r = ok(
      roteador.rotear(p(50, 0), p(250, 0), {
        multiplicadorPorAresta: multiplicadores(3, { 1: 1000 }),
      }),
    );
    expect(r.trechos.map((t) => t.arestaId)).toEqual([0, 1, 2]);
    expect(r.trechos[1]!.multiplicador).toBe(1000);
    expect(r.trechos[0]!.multiplicador).toBe(1);
    expect(r.distanciaRedeM).toBeCloseTo(200, 0);
    expect(r.custo).toBeCloseTo(50 + 100 * 1000 + 50, -1); // o x1000 amplifica o erro de 0,1 m do haversine
  });

  it('o chamador pode calcular a exposição a partir do multiplicador de cada trecho', () => {
    const r = ok(
      roteador.rotear(p(50, 0), p(250, 0), {
        multiplicadorPorAresta: multiplicadores(3, { 1: 1000 }),
      }),
    );
    const metrosEmRisco = r.trechos
      .filter((t) => t.multiplicador > 1)
      .reduce((s, t) => s + t.comprimentoM, 0);
    expect(metrosEmRisco).toBeCloseTo(100, 0);
  });

  it('Infinity numa ponte única: sem_caminho', () => {
    const r = roteador.rotear(p(50, 0), p(250, 0), {
      multiplicadorPorAresta: multiplicadores(3, { 1: Infinity }),
    });
    expect(r.status).toBe('sem_caminho');
  });

  it('Infinity na aresta da origem: sem_caminho; no mesmo lado da ponte, ainda dá para andar', () => {
    const bloqueada = multiplicadores(3, { 1: Infinity });
    expect(
      roteador.rotear(p(150, 0), p(250, 0), { multiplicadorPorAresta: bloqueada }).status,
    ).toBe('sem_caminho');
    const r = ok(roteador.rotear(p(50, 0), p(80, 0), { multiplicadorPorAresta: bloqueada }));
    expect(r.distanciaRedeM).toBeCloseTo(30, 0);
  });
});

describe('rotear: origem e destino na mesma aresta', () => {
  //  A(0,0) ------------- e0 (200 m) ------------- B(200,0)
  const grafo = montarGrafo(
    [
      [0, 0],
      [200, 0],
    ],
    [{ de: 0, para: 1 }],
  );
  const roteador = criarRoteador(grafo);

  it('no sentido da aresta: um trecho direto e parcial', () => {
    const r = ok(roteador.rotear(p(30, 0), p(80, 0)));
    expect(r.trechos).toHaveLength(1);
    expect(r.trechos[0]).toMatchObject({ arestaId: 0, sentido: 'direto' });
    expect(r.trechos[0]!.comprimentoM).toBeCloseTo(50, 0);
    expect(r.distanciaRedeM).toBeCloseTo(50, 0);
    expectPerto(r.pontos[0]!, 30, 0);
    expectPerto(r.pontos[r.pontos.length - 1]!, 80, 0);
  });

  it('no sentido contrário: inverso, com os pontos orientados', () => {
    const r = ok(roteador.rotear(p(80, 0), p(30, 0)));
    expect(r.trechos).toHaveLength(1);
    expect(r.trechos[0]).toMatchObject({ arestaId: 0, sentido: 'inverso' });
    expect(r.distanciaRedeM).toBeCloseTo(50, 0);
    expectPerto(r.pontos[0]!, 80, 0);
    expectPerto(r.pontos[r.pontos.length - 1]!, 30, 0);
  });

  it('origem igual ao destino: distância 0 e status ok', () => {
    const r = ok(roteador.rotear(p(50, 0), p(50, 0)));
    expect(r.distanciaRedeM).toBe(0);
    expect(r.custo).toBe(0);
    expect(r.tempoS).toBe(0);
    expect(r.trechos).toEqual([]);
    expect(r.pontos).toHaveLength(1);
    expectPerto(r.pontos[0]!, 50, 0);
  });

  it('pontos diferentes que encaixam no mesmo lugar também dão distância 0', () => {
    const r = ok(roteador.rotear(p(50, 10), p(50, -20)));
    expect(r.distanciaRedeM).toBe(0);
    expect(r.encaixeOrigemM).toBeCloseTo(10, 0);
    expect(r.encaixeDestinoM).toBeCloseTo(20, 0);
  });
});

describe('rotear: o trajeto direto concorre com sair pelas pontas e voltar', () => {
  //  A(0,0) ============= e0 (1000 m, multiplicador alto) ============= B(1000,0)
  //     \                                                                /
  //     e1 (510 m)                  C(500,100)                    e2 (510 m)
  const grafo = montarGrafo(
    [
      [0, 0],
      [1000, 0],
      [500, 100],
    ],
    [
      { de: 0, para: 1 },
      { de: 0, para: 2 },
      { de: 2, para: 1 },
    ],
  );
  const roteador = criarRoteador(grafo);

  it('com multiplicador 1 o direto vence', () => {
    const r = ok(roteador.rotear(p(100, 0), p(900, 0)));
    expect(r.trechos).toHaveLength(1);
    expect(r.distanciaRedeM).toBeCloseTo(800, 0);
  });

  it('com multiplicador 10 na aresta, sai pela ponta, dá a volta e retorna', () => {
    const r = ok(
      roteador.rotear(p(100, 0), p(900, 0), {
        multiplicadorPorAresta: multiplicadores(3, { 0: 10 }),
      }),
    );

    expect(r.trechos.map((t) => [t.arestaId, t.sentido])).toEqual([
      [0, 'inverso'], // da origem até A
      [1, 'direto'], // A até C
      [2, 'direto'], // C até B
      [0, 'inverso'], // de B até o destino
    ]);
    // 100 m x 10, mais A->C->B, mais 100 m x 10 (o direto custaria 800 x 10 = 8000)
    expect(r.custo).toBeCloseTo(100 * 10 + 2 * 509.9 + 100 * 10, -1);
    expect(r.custo).toBeLessThan(8000);
    // A linha percorre o desvio inteiro e depois volta pela aresta 0
    expectPerto(r.pontos[0]!, 100, 0);
    expectPerto(r.pontos[r.pontos.length - 1]!, 900, 0);
  });

  it('com a aresta bloqueada (Infinity) não há trajeto direto nem volta: sem_caminho', () => {
    const r = roteador.rotear(p(100, 0), p(900, 0), {
      multiplicadorPorAresta: multiplicadores(3, { 0: Infinity }),
    });
    expect(r.status).toBe('sem_caminho');
  });
});

describe('rotear: sentido único (oneway:foot)', () => {
  //  P(-100,0) --e1-- A(0,0) ==e0 (só de A para B)== B(200,0) --e2-- Q(300,0)
  const grafo = montarGrafo(
    [
      [0, 0],
      [200, 0],
      [-100, 0],
      [300, 0],
    ],
    [
      { de: 0, para: 1, sentidoUnico: true },
      { de: 2, para: 0 },
      { de: 1, para: 3 },
    ],
  );
  const roteador = criarRoteador(grafo);

  it('anda a favor do sentido', () => {
    const r = ok(roteador.rotear(p(-50, 0), p(250, 0)));
    expect(r.trechos.map((t) => t.arestaId)).toEqual([1, 0, 2]);
  });

  it('contra o sentido não passa', () => {
    expect(roteador.rotear(p(250, 0), p(-50, 0)).status).toBe('sem_caminho');
  });

  it('na mesma aresta de sentido único: a favor vai, contra não', () => {
    expect(ok(roteador.rotear(p(50, 0), p(150, 0))).distanciaRedeM).toBeCloseTo(100, 0);
    expect(roteador.rotear(p(150, 0), p(50, 0)).status).toBe('sem_caminho');
  });
});

describe('rotear: origem longe, destino longe, ilhas', () => {
  // Duas ilhas: A-B perto da origem e C-D a 5 km dali.
  const grafo = montarGrafo(
    [
      [0, 0],
      [200, 0],
      [5000, 0],
      [5200, 0],
    ],
    [
      { de: 0, para: 1 },
      { de: 2, para: 3 },
    ],
  );
  const roteador = criarRoteador(grafo);

  it('origem além do limite de encaixe: origem_longe', () => {
    expect(roteador.rotear(p(100, 1000), p(100, 0)).status).toBe('origem_longe');
  });

  it('destino além do limite de encaixe: destino_longe', () => {
    expect(roteador.rotear(p(100, 0), p(100, 1000)).status).toBe('destino_longe');
  });

  it('o limite de encaixe é configurável', () => {
    expect(roteador.rotear(p(100, 400), p(100, 0)).status).toBe('origem_longe');
    expect(
      ok(roteador.rotear(p(100, 400), p(100, 0), { maxEncaixeM: 500 })).encaixeOrigemM,
    ).toBeCloseTo(400, 0);
  });

  it('grafo com duas ilhas: sem_caminho entre elas', () => {
    expect(roteador.rotear(p(100, 0), p(5100, 0)).status).toBe('sem_caminho');
  });

  it('dentro de cada ilha a rota existe', () => {
    expect(ok(roteador.rotear(p(5050, 0), p(5150, 0))).distanciaRedeM).toBeCloseTo(100, 0);
  });
});

describe('rotear: pontos de junção e geometrias com vários vértices', () => {
  //  A(0,0) --e0 (curva)-- B(100,100) --e1 (curva)-- C(200,0)
  const grafo = montarGrafo(
    [
      [0, 0],
      [100, 100],
      [200, 0],
    ],
    [
      {
        de: 0,
        para: 1,
        via: [
          [50, 0],
          [100, 50],
        ],
      },
      {
        de: 1,
        para: 2,
        via: [
          [100, 60],
          [150, 30],
        ],
      },
    ],
  );
  const roteador = criarRoteador(grafo);

  it('a linha completa não repete o vértice da junção', () => {
    const r = ok(roteador.rotear(p(0, 0), p(200, 0)));

    const total = r.trechos.reduce((s, t) => s + t.pontos.length, 0);
    expect(r.pontos).toHaveLength(total - (r.trechos.length - 1));
    for (let i = 1; i < r.pontos.length; i++) {
      const a = r.pontos[i - 1]!;
      const b = r.pontos[i]!;
      expect(a.latitude !== b.latitude || a.longitude !== b.longitude).toBe(true);
    }
    // A junção (nó B) aparece uma vez só.
    const b = p(100, 100);
    const ocorrencias = r.pontos.filter(
      (q) => Math.abs(q.latitude - b.latitude) < 1e-9 && Math.abs(q.longitude - b.longitude) < 1e-9,
    );
    expect(ocorrencias).toHaveLength(1);
  });

  it('a primeira e a última coordenada são os pontos de encaixe', () => {
    const r = ok(roteador.rotear(p(25, 0), p(175, 15)));
    const origem = roteador.encaixar(p(25, 0))!;
    const destino = roteador.encaixar(p(175, 15))!;
    const primeiro = r.pontos[0]!;
    const ultimo = r.pontos[r.pontos.length - 1]!;
    expect(primeiro.latitude).toBeCloseTo(origem.ponto.latitude, 9);
    expect(primeiro.longitude).toBeCloseTo(origem.ponto.longitude, 9);
    expect(ultimo.latitude).toBeCloseTo(destino.ponto.latitude, 9);
    expect(ultimo.longitude).toBeCloseTo(destino.ponto.longitude, 9);
  });

  it('o corte no meio da aresta mantém os vértices intermediários certos', () => {
    const r = ok(roteador.rotear(p(75, 0), p(100, 80)));
    // A geometria de e0 é (0,0)-(50,0)-(100,50)-(100,100). A origem encaixa no segundo trecho
    // e o destino, (100,80), está no último (e também em e1; o desempate é a aresta de menor id).
    expect(r.trechos).toHaveLength(1);
    const trecho = r.trechos[0]!;
    expect(trecho.arestaId).toBe(0);
    expect(trecho.pontos).toHaveLength(3); // ponto cortado, vértice (100,50), ponto cortado
    expectPerto(trecho.pontos[1]!, 100, 50);
    expectPerto(trecho.pontos[2]!, 100, 80);
  });
});

describe('rotear: validação das opções (erro de programação)', () => {
  const grafo = montarGrafo(
    [
      [0, 0],
      [100, 0],
      [200, 0],
    ],
    [
      { de: 0, para: 1 },
      { de: 1, para: 2 },
    ],
  );
  const roteador = criarRoteador(grafo);
  const a = p(10, 0);
  const b = p(190, 0);

  it('multiplicador menor que 1 lança erro claro', () => {
    expect(() =>
      roteador.rotear(a, b, { multiplicadorPorAresta: multiplicadores(2, { 1: 0.5 }) }),
    ).toThrow(/multiplicadorPorAresta\[1\] = 0\.5.*>= 1 ou Infinity/);
  });

  it('multiplicador NaN lança erro claro', () => {
    expect(() =>
      roteador.rotear(a, b, { multiplicadorPorAresta: multiplicadores(2, { 0: NaN }) }),
    ).toThrow(/multiplicadorPorAresta\[0\] = NaN/);
  });

  it('multiplicador 0 ou negativo lança erro', () => {
    expect(() =>
      roteador.rotear(a, b, { multiplicadorPorAresta: multiplicadores(2, { 0: 0 }) }),
    ).toThrow();
    expect(() =>
      roteador.rotear(a, b, { multiplicadorPorAresta: multiplicadores(2, { 0: -3 }) }),
    ).toThrow();
  });

  it('tamanho errado lança erro claro', () => {
    expect(() =>
      roteador.rotear(a, b, { multiplicadorPorAresta: new Float32Array(5).fill(1) }),
    ).toThrow(/5 valores, mas o grafo tem 2 arestas/);
  });

  it('velocidade e limite de encaixe inválidos lançam erro', () => {
    expect(() => roteador.rotear(a, b, { velocidadeKmH: 0 })).toThrow(/velocidadeKmH/);
    expect(() => roteador.rotear(a, b, { velocidadeKmH: NaN })).toThrow(/velocidadeKmH/);
    expect(() => roteador.rotear(a, b, { maxEncaixeM: -1 })).toThrow(/maxDistanciaM/);
  });

  it('o erro de validação sai mesmo que a origem esteja longe', () => {
    expect(() =>
      roteador.rotear(p(0, 5000), b, { multiplicadorPorAresta: multiplicadores(2, { 0: 0.1 }) }),
    ).toThrow(/multiplicadorPorAresta/);
  });

  it('Infinity é aceito', () => {
    expect(() =>
      roteador.rotear(a, b, { multiplicadorPorAresta: multiplicadores(2, { 0: Infinity }) }),
    ).not.toThrow();
  });

  it('coordenadas inválidas lançam erro', () => {
    expect(() => roteador.rotear({ latitude: NaN, longitude: 0 }, b)).toThrow(/Ponto inválido/);
  });
});
