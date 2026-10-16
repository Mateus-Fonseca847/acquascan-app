import { describe, expect, it } from 'vitest';
import { montarGrafo, pontoEmMetros, type DefinicaoAresta } from '../test/auxiliares';
import { classificarManobra, gerarPassos, type Passo } from './passos';
import { criarRoteador } from './roteador';

type Ponto = [number, number];

/** Roda o roteador entre dois pontos em metros e gera os passos. */
function percurso(
  nos: Ponto[],
  arestas: DefinicaoAresta[],
  origem: Ponto,
  destino: Ponto,
  nomeDestino?: string,
) {
  const roteador = criarRoteador(montarGrafo(nos, arestas));
  const r = roteador.rotear(pontoEmMetros(...origem), pontoEmMetros(...destino));
  if (r.status !== 'ok') throw new Error(`sem rota: ${r.status}`);
  const passos = gerarPassos(r, roteador, nomeDestino ? { nomeDestino } : {});
  return { rota: r, passos, roteador };
}

const textos = (p: Passo[]) => p.map((x) => x.texto);

/** Ponto a `d` metros de `de` no rumo `graus`. */
const andar = ([x, y]: Ponto, graus: number, d: number): Ponto => [
  x + d * Math.sin((graus * Math.PI) / 180),
  y + d * Math.cos((graus * Math.PI) / 180),
];

/** Uma rua reta (A) seguida de outra (B) que sai com `giro` graus à direita (negativo = esquerda). */
function curvaDe(giro: number, nomeB = 'Rua B') {
  const A: Ponto = [0, 0];
  const B: Ponto = [0, 100];
  const C = andar(B, giro, 100);
  return percurso(
    [A, B, C],
    [
      { de: 0, para: 1, nome: 'Rua A' },
      { de: 1, para: 2, nome: nomeB },
    ],
    A,
    C,
  );
}

describe('classificarManobra (tabela de ângulos)', () => {
  it.each([
    [0, 'em_frente'],
    [24.9, 'em_frente'],
    [-24.9, 'em_frente'],
    [25, 'leve_direita'],
    [-25, 'leve_esquerda'],
    [59.9, 'leve_direita'],
    [60, 'direita'],
    [-90, 'esquerda'],
    [119.9, 'direita'],
    [120, 'fechada_direita'],
    [-160, 'fechada_esquerda'],
    [160, 'fechada_direita'],
    [160.1, 'retorno'],
    [-179, 'retorno'],
    [180, 'retorno'],
  ])('%d graus é %s', (angulo, esperado) => {
    expect(classificarManobra(angulo)).toBe(esperado);
  });
});

describe('curvas', () => {
  it('90 graus à direita', () => {
    const { passos } = curvaDe(90);
    expect(passos.map((p) => p.tipo)).toEqual(['partida', 'curva', 'chegada']);
    expect(passos[1]!.manobra).toBe('direita');
    expect(textos(passos)).toEqual([
      'Siga para o norte pela Rua A',
      'Vire à direita na Rua B',
      'Você chegou: seu destino',
    ]);
    expect(passos[1]!.rua).toBe('Rua B');
    expect(passos[1]!.acumuladaM).toBeCloseTo(100, 0);
    expect(passos[1]!.distanciaM).toBeCloseTo(100, 0);
  });

  it('90 graus à esquerda', () => {
    const { passos } = curvaDe(-90);
    expect(passos[1]!.manobra).toBe('esquerda');
    expect(passos[1]!.texto).toBe('Vire à esquerda na Rua B');
  });

  it('curva leve (40 graus) à direita e à esquerda', () => {
    expect(curvaDe(40).passos[1]!.texto).toBe('Vire levemente à direita na Rua B');
    expect(curvaDe(-40).passos[1]!.manobra).toBe('leve_esquerda');
  });

  it('curva fechada (140 graus)', () => {
    const { passos } = curvaDe(140);
    expect(passos[1]!.manobra).toBe('fechada_direita');
    expect(passos[1]!.texto).toBe('Faça a curva fechada à direita na Rua B');
    expect(curvaDe(-140).passos[1]!.texto).toBe('Faça a curva fechada à esquerda na Rua B');
  });

  it('retorno (cerca de 178 graus)', () => {
    const A: Ponto = [0, 0];
    const B: Ponto = [0, 100];
    const C: Ponto = [3, 0];
    const { passos } = percurso(
      [A, B, C],
      [
        { de: 0, para: 1, nome: 'Rua A' },
        { de: 1, para: 2, nome: 'Rua B' },
      ],
      A,
      C,
    );
    expect(passos[1]!.manobra).toBe('retorno');
    expect(passos[1]!.texto).toBe('Retorne e siga pela Rua B');
  });

  it('o texto usa a preposição do tipo do nome', () => {
    expect(curvaDe(90, 'Avenida Koeler').passos[1]!.texto).toBe('Vire à direita na Avenida Koeler');
    expect(curvaDe(90, 'Beco do Sol').passos[1]!.texto).toBe('Vire à direita no Beco do Sol');
    expect(curvaDe(90, 'Bosque Alto').passos[1]!.texto).toBe('Vire à direita em Bosque Alto');
  });

  it('T e cruzamento em X: só a manobra da rota gera passo', () => {
    // X em B(0,100): sai Rua B para os dois lados e Rua A continua para o norte (D).
    const A: Ponto = [0, 0];
    const B: Ponto = [0, 100];
    const nos: Ponto[] = [A, B, [100, 100], [-100, 100], [0, 200]];
    const arestas: DefinicaoAresta[] = [
      { de: 0, para: 1, nome: 'Rua A' },
      { de: 1, para: 2, nome: 'Rua B' },
      { de: 1, para: 3, nome: 'Rua B' },
      { de: 1, para: 4, nome: 'Rua A' },
    ];
    const direita = percurso(nos, arestas, A, [100, 100]);
    expect(textos(direita.passos)[1]).toBe('Vire à direita na Rua B');
    const esquerda = percurso(nos, arestas, A, [-100, 100]);
    expect(textos(esquerda.passos)[1]).toBe('Vire à esquerda na Rua B');
    // reto, mesmo nome: nenhum passo no cruzamento
    const reto = percurso(nos, arestas, A, [0, 200]);
    expect(reto.passos.map((p) => p.tipo)).toEqual(['partida', 'chegada']);
  });
});

describe('nomes', () => {
  it('mesmo nome em frente não gera passo, e trechos de mesmo nome viram um só', () => {
    const nos: Ponto[] = [
      [0, 0],
      [0, 100],
      [0, 200],
      [0, 300],
    ];
    const { passos, rota } = percurso(
      nos,
      [
        { de: 0, para: 1, nome: 'Rua A' },
        { de: 1, para: 2, nome: 'rua a' }, // mesma rua, escrita diferente
        { de: 2, para: 3, nome: 'Rua  A' },
      ],
      nos[0]!,
      nos[3]!,
    );
    expect(rota.trechos).toHaveLength(3);
    expect(passos.map((p) => p.tipo)).toEqual(['partida', 'chegada']);
    expect(passos[0]!.distanciaM).toBeCloseTo(300, 0);
  });

  it('mudança de nome em frente vira "Continue pela Rua Y"', () => {
    const { passos } = curvaDe(5, 'Rua Y');
    expect(passos.map((p) => p.tipo)).toEqual(['partida', 'siga', 'chegada']);
    expect(passos[1]!.manobra).toBe('em_frente');
    expect(passos[1]!.texto).toBe('Continue pela Rua Y');
  });

  it('way sem nome só agrupa com outro sem nome da mesma classe', () => {
    const nos: Ponto[] = [
      [0, 0],
      [0, 100],
      [0, 200],
      [0, 300],
    ];
    const { passos } = percurso(
      nos,
      [
        { de: 0, para: 1, classe: 'footway' },
        { de: 1, para: 2, classe: 'footway' },
        { de: 2, para: 3, classe: 'service' },
      ],
      nos[0]!,
      nos[3]!,
    );
    expect(passos.map((p) => p.tipo)).toEqual(['partida', 'siga', 'chegada']);
    expect(passos[0]!.texto).toBe('Siga para o norte pela passagem de pedestres');
    expect(passos[1]!.texto).toBe('Continue pela via de serviço');
    expect(passos[1]!.rua).toBeNull();
  });

  it.each([
    ['footway', 'Siga para o norte pela passagem de pedestres'],
    ['steps', 'Siga para o norte pela escadaria'],
    ['path', 'Siga para o norte pelo caminho'],
    ['track', 'Siga para o norte pelo caminho'],
    ['service', 'Siga para o norte pela via de serviço'],
    ['residential', 'Siga para o norte pela via'],
  ])('sem nome, classe %s', (classe, esperado) => {
    const { passos } = percurso(
      [
        [0, 0],
        [0, 100],
      ],
      [{ de: 0, para: 1, classe }],
      [0, 0],
      [0, 100],
    );
    expect(passos[0]!.texto).toBe(esperado);
    expect(passos[0]!.rua).toBeNull();
  });

  it('o nome do destino entra na chegada', () => {
    const { passos } = percurso(
      [
        [0, 0],
        [0, 100],
      ],
      [{ de: 0, para: 1, nome: 'Rua A' }],
      [0, 0],
      [0, 100],
      'Abrigo da Praça',
    );
    expect(passos.at(-1)!.texto).toBe('Você chegou: Abrigo da Praça');
  });

  it('o rumo inicial dá o ponto cardeal da partida', () => {
    const casos: [number, string][] = [
      [0, 'norte'],
      [45, 'nordeste'],
      [90, 'leste'],
      [135, 'sudeste'],
      [180, 'sul'],
      [225, 'sudoeste'],
      [270, 'oeste'],
      [315, 'noroeste'],
    ];
    for (const [graus, cardeal] of casos) {
      const B = andar([0, 0], graus, 100);
      const { passos } = percurso(
        [[0, 0], B],
        [{ de: 0, para: 1, nome: 'Rua do Imperador' }],
        [0, 0],
        B,
      );
      expect(passos[0]!.texto).toBe(`Siga para o ${cardeal} pela Rua do Imperador`);
    }
  });
});

describe('suavização', () => {
  it('duas manobras a menos de 15 m viram uma só (ângulos somados)', () => {
    // 50 graus à direita, 10 m de rua, mais 50 graus à direita: 100 graus, "direita".
    const A: Ponto = [0, 0];
    const B: Ponto = [0, 100];
    const C = andar(B, 50, 10);
    const D = andar(C, 100, 100);
    const { passos } = percurso(
      [A, B, C, D],
      [
        { de: 0, para: 1, nome: 'Rua A' },
        { de: 1, para: 2, nome: 'Rua B' },
        { de: 2, para: 3, nome: 'Rua C' },
      ],
      A,
      D,
    );
    expect(passos.map((p) => p.tipo)).toEqual(['partida', 'curva', 'chegada']);
    expect(passos[1]!.manobra).toBe('direita');
    expect(passos[1]!.texto).toBe('Vire à direita na Rua C');
  });

  it('um zigue-zague que se anula vira só a mudança de nome', () => {
    const A: Ponto = [0, 0];
    const B: Ponto = [0, 100];
    const C: Ponto = [10, 100];
    const D: Ponto = [10, 200];
    const { passos } = percurso(
      [A, B, C, D],
      [
        { de: 0, para: 1, nome: 'Rua A' },
        { de: 1, para: 2, nome: 'Rua B' },
        { de: 2, para: 3, nome: 'Rua C' },
      ],
      A,
      D,
    );
    expect(passos.map((p) => p.tipo)).toEqual(['partida', 'siga', 'chegada']);
    expect(passos[1]!.texto).toBe('Continue pela Rua C');
  });

  it('manobras a 15 m ou mais continuam separadas', () => {
    const A: Ponto = [0, 0];
    const B: Ponto = [0, 100];
    const C = andar(B, 90, 30);
    const D = andar(C, 0, 100);
    const { passos } = percurso(
      [A, B, C, D],
      [
        { de: 0, para: 1, nome: 'Rua A' },
        { de: 1, para: 2, nome: 'Rua B' },
        { de: 2, para: 3, nome: 'Rua C' },
      ],
      A,
      D,
    );
    expect(passos.map((p) => p.manobra)).toEqual([null, 'direita', 'esquerda', null]);
  });
});

describe('ponte, escada, túnel e trilha', () => {
  const nos: Ponto[] = [
    [0, 0],
    [0, 100],
    [0, 200],
    [0, 300],
  ];
  const com = (meio: Partial<DefinicaoAresta>) =>
    percurso(
      nos,
      [
        { de: 0, para: 1, nome: 'Rua A' },
        { de: 1, para: 2, nome: 'Ponte Velha', ...meio },
        { de: 2, para: 3, nome: 'Rua A' },
      ],
      nos[0]!,
      nos[3]!,
    );

  it('ponte: passo de travessia no começo e no fim, com aviso', () => {
    const { passos } = com({ ponte: true });
    expect(passos.map((p) => p.tipo)).toEqual(['partida', 'travessia', 'travessia', 'chegada']);
    expect(passos[1]!.texto).toBe('Atravesse a ponte');
    expect(passos[1]!.avisos).toEqual(['PONTE']);
    expect(passos[1]!.manobra).toBeNull();
    expect(passos[2]!.texto).toBe('Continue pela Rua A');
    expect(passos[2]!.avisos).toEqual([]);
  });

  it('ponte com o mesmo nome da rua também gera os passos de travessia', () => {
    const { passos } = percurso(
      nos,
      [
        { de: 0, para: 1, nome: 'Rua A' },
        { de: 1, para: 2, nome: 'Rua A', ponte: true },
        { de: 2, para: 3, nome: 'Rua A' },
      ],
      nos[0]!,
      nos[3]!,
    );
    expect(passos.map((p) => p.tipo)).toEqual(['partida', 'travessia', 'travessia', 'chegada']);
  });

  it('escada (classe steps), túnel e trilha geram avisos', () => {
    expect(com({ classe: 'steps', escada: true }).passos[1]).toMatchObject({
      tipo: 'travessia',
      texto: 'Pegue a escadaria',
      avisos: ['ESCADA'],
    });
    expect(com({ tunel: true }).passos[1]).toMatchObject({
      texto: 'Siga pelo túnel',
      avisos: ['TUNEL'],
    });
    expect(com({ classe: 'path' }).passos[1]!.avisos).toEqual(['TRILHA']);
    expect(com({ classe: 'track' }).passos[1]!.avisos).toEqual(['TRILHA']);
  });

  it('o aviso vale também na partida', () => {
    const { passos } = percurso(
      [
        [0, 0],
        [0, 100],
      ],
      [{ de: 0, para: 1, classe: 'steps' }],
      [0, 0],
      [0, 100],
    );
    expect(passos[0]!.avisos).toEqual(['ESCADA']);
  });
});

describe('encaixes', () => {
  const nos: Ponto[] = [
    [0, 0],
    [0, 100],
    [100, 100],
  ];
  const arestas: DefinicaoAresta[] = [
    { de: 0, para: 1, nome: 'Rua A' },
    { de: 1, para: 2, nome: 'Rua B' },
  ];

  it('encaixe grande na origem e no destino ganha um passo', () => {
    const { passos, rota } = percurso(nos, arestas, [-50, 0], [100, 150]);
    expect(rota.encaixeOrigemM).toBeCloseTo(50, 0);
    expect(rota.encaixeDestinoM).toBeCloseTo(50, 0);
    expect(passos[0]!.texto).toBe('Vá até a Rua A (50 m)');
    expect(passos[0]!.distanciaM).toBeCloseTo(50, 0);
    expect(passos[1]!.tipo).toBe('partida');
    expect(passos.at(-2)!.texto).toBe('O destino fica a 50 m da Rua B');
    expect(passos.at(-1)!.tipo).toBe('chegada');
    // as distâncias dos passos de rede somam distanciaRedeM; os de encaixe levam o próprio encaixe
    const rede = passos.slice(1, -2).reduce((s, p) => s + p.distanciaM, 0);
    expect(Math.abs(rede - rota.distanciaRedeM)).toBeLessThan(1);
  });

  it('encaixe pequeno (até 30 m) não gera passo', () => {
    const { passos } = percurso(nos, arestas, [-20, 0], [100, 120]);
    expect(passos.map((p) => p.tipo)).toEqual(['partida', 'curva', 'chegada']);
  });
});

describe('invariantes', () => {
  it('soma das distâncias = distanciaRedeM e índices crescentes', () => {
    const A: Ponto = [0, 0];
    const B: Ponto = [0, 120];
    const C = andar(B, 70, 90);
    const D = andar(C, 10, 60);
    const E = andar(D, 200, 130);
    const { passos, rota } = percurso(
      [A, B, C, D, E],
      [
        { de: 0, para: 1, nome: 'Rua A' },
        { de: 1, para: 2, nome: 'Rua B' },
        { de: 2, para: 3, nome: 'Rua C', ponte: true },
        { de: 3, para: 4, nome: 'Rua C' },
      ],
      A,
      E,
    );
    const soma = passos.reduce((s, p) => s + p.distanciaM, 0);
    expect(Math.abs(soma - rota.distanciaRedeM)).toBeLessThan(1);
    for (let i = 1; i < passos.length; i++) {
      expect(passos[i]!.indiceNaLinha).toBeGreaterThan(passos[i - 1]!.indiceNaLinha);
      expect(passos[i]!.acumuladaM).toBeGreaterThanOrEqual(passos[i - 1]!.acumuladaM);
    }
    expect(passos.at(-1)!.indiceNaLinha).toBe(rota.pontos.length - 1);
    expect(passos.at(-1)!.acumuladaM).toBeCloseTo(rota.distanciaRedeM, 6);
  });
});
