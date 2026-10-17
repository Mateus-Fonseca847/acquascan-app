/**
 * Polimento dos textos (R3): tabela de preposições ampliada, fusão de travessias curtas e curvas
 * em via sem nome. Os testes antigos de passos.test.ts continuam valendo sem ajuste: nenhum deles
 * dependia dos textos que mudaram (todos usam ruas com nome nas curvas, e as travessias deles têm
 * 100 m ou mais).
 */
import { describe, expect, it } from 'vitest';
import { montarGrafo, pontoEmMetros, type DefinicaoAresta } from '../test/auxiliares';
import { gerarPassos } from './passos';
import { criarRoteador } from './roteador';
import { TIPOS_DE_VIA, comPreposicao, generoDoNome, referenciaDaVia } from './textos';

type Ponto = [number, number];

function percurso(nos: Ponto[], arestas: DefinicaoAresta[], origem: Ponto, destino: Ponto) {
  const roteador = criarRoteador(montarGrafo(nos, arestas));
  const r = roteador.rotear(pontoEmMetros(...origem), pontoEmMetros(...destino));
  if (r.status !== 'ok') throw new Error(`sem rota: ${r.status}`);
  return { rota: r, passos: gerarPassos(r, roteador) };
}

const andar = ([x, y]: Ponto, graus: number, d: number): Ponto => [
  x + d * Math.sin((graus * Math.PI) / 180),
  y + d * Math.cos((graus * Math.PI) / 180),
];

describe('tabela de preposições', () => {
  const femininos = [
    ['Rua', 'Rua do Imperador'],
    ['Avenida', 'Avenida Koeler'],
    ['Travessa', 'Travessa Dois'],
    ['Alameda', 'Alameda Sol'],
    ['Estrada', 'Estrada da Saudade'],
    ['Praça', 'Praça da Liberdade'],
    ['Ladeira', 'Ladeira Alta'],
    ['Servidão', 'Servidão Geralda'],
    ['Rodovia', 'Rodovia BR-040'],
    ['Via', 'Via Expressa'],
    ['Passarela', 'Passarela Norte'],
    ['Ponte', 'Ponte Branca'],
    ['Vila', 'Vila Miguel Krauss'],
    ['Viela', 'Viela Estreita'],
    ['Vereda', 'Vereda do Sol'],
    ['Trilha', 'Trilha da Pedra'],
    ['Passagem', 'Passagem Coberta'],
    ['Escadaria', 'Escadaria Sul'],
    ['Rampa', 'Rampa Leste'],
    ['Marginal', 'Marginal do Rio'],
    ['Linha', 'Linha Velha'],
  ] as const;
  const masculinos = [
    ['Beco', 'Beco do Sol'],
    ['Caminho', 'Caminho Velho'],
    ['Largo', 'Largo da Matriz'],
    ['Viaduto', 'Viaduto Alto'],
    ['Túnel', 'Túnel Novo'],
    ['Parque', 'Parque Municipal'],
    ['Jardim', 'Jardim Botânico'],
    ['Acesso', 'Acesso ao mirante'],
    ['Corredor', 'Corredor Verde'],
    ['Pátio', 'Pátio Central'],
    ['Morro', 'Morro do Brito'],
    ['Campo', 'Campo Grande'],
  ] as const;

  it.each(femininos)('"%s" é feminino (na, pela, à)', (_tipo, nome) => {
    const ref = referenciaDaVia(nome, 'residential');
    expect(generoDoNome(nome)).toBe('f');
    expect(comPreposicao('em', ref)).toBe(`na ${nome}`);
    expect(comPreposicao('por', ref)).toBe(`pela ${nome}`);
    expect(comPreposicao('a', ref)).toBe(`a ${nome}`);
    expect(comPreposicao('de', ref)).toBe(`da ${nome}`);
  });

  it.each(masculinos)('"%s" é masculino (no, pelo)', (_tipo, nome) => {
    const ref = referenciaDaVia(nome, 'residential');
    expect(generoDoNome(nome)).toBe('m');
    expect(comPreposicao('em', ref)).toBe(`no ${nome}`);
    expect(comPreposicao('por', ref)).toBe(`pelo ${nome}`);
    expect(comPreposicao('de', ref)).toBe(`do ${nome}`);
  });

  it('com e sem acento, e em qualquer caixa', () => {
    expect(generoDoNome('PRAÇA central')).toBe('f');
    expect(generoDoNome('praca central')).toBe('f');
    expect(generoDoNome('SERVIDÃO b')).toBe('f');
    expect(generoDoNome('servidao b')).toBe('f');
    expect(generoDoNome('TÚNEL novo')).toBe('m');
    expect(generoDoNome('tunel novo')).toBe('m');
    expect(generoDoNome('PÁTIO do sol')).toBe('m');
    expect(generoDoNome('patio do sol')).toBe('m');
    expect(generoDoNome('  rua   com espaços')).toBe('f');
  });

  it('só vale a PRIMEIRA palavra: "Bosque da Rua" e "Ruas" não casam', () => {
    expect(generoDoNome('Bosque da Rua Alta')).toBe('n');
    expect(generoDoNome('Ruas Unidas')).toBe('n');
    expect(generoDoNome('Pontevedra')).toBe('n');
  });

  it('nome desconhecido usa "em" e "por"', () => {
    const ref = referenciaDaVia('Condomínio Chácara Flora', 'residential');
    expect(comPreposicao('em', ref)).toBe('em Condomínio Chácara Flora');
    expect(comPreposicao('por', ref)).toBe('por Condomínio Chácara Flora');
  });

  it('a tabela é única e só tem chaves normalizadas (sem acento nem maiúsculas)', () => {
    for (const chave of Object.keys(TIPOS_DE_VIA)) {
      expect(chave).toBe(chave.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
    }
    expect(Object.keys(TIPOS_DE_VIA)).toHaveLength(33);
  });
});

describe('travessia curta é fundida no passo seguinte', () => {
  const nos: Ponto[] = [
    [0, 0],
    [0, 100],
    [0, 110],
    [0, 210],
  ];

  it('"Atravesse a ponte" de 10 m seguido de outra rua: o texto do seguinte permanece e os avisos se somam', () => {
    const { passos, rota } = percurso(
      nos,
      [
        { de: 0, para: 1, nome: 'Rua A' },
        { de: 1, para: 2, nome: 'Ponte Velha', ponte: true },
        { de: 2, para: 3, nome: 'Praça Y', classe: 'path' },
      ],
      nos[0]!,
      nos[3]!,
    );
    expect(passos.map((p) => p.tipo)).toEqual(['partida', 'travessia', 'chegada']);
    expect(passos[1]!.texto).toBe('Continue pela Praça Y');
    expect(passos[1]!.avisos).toEqual(['PONTE', 'TRILHA']);
    expect(passos[1]!.acumuladaM).toBeCloseTo(110, 0);
    // a distância da ponte passou para o passo anterior; a soma não muda
    expect(passos[0]!.distanciaM).toBeCloseTo(110, 0);
    expect(
      Math.abs(passos.reduce((s, p) => s + p.distanciaM, 0) - rota.distanciaRedeM),
    ).toBeLessThan(1);
  });

  it('a travessia curta que é o último passo antes da chegada fica', () => {
    const { passos } = percurso(
      nos.slice(0, 3),
      [
        { de: 0, para: 1, nome: 'Rua A' },
        { de: 1, para: 2, nome: 'Ponte Velha', ponte: true },
      ],
      nos[0]!,
      nos[2]!,
    );
    expect(passos.map((p) => p.tipo)).toEqual(['partida', 'travessia', 'chegada']);
    expect(passos[1]!.texto).toBe('Atravesse a ponte');
    expect(passos[1]!.distanciaM).toBeCloseTo(10, 0);
  });

  it('a travessia de 15 m ou mais não é fundida', () => {
    const { passos } = percurso(
      [
        [0, 0],
        [0, 100],
        [0, 120],
        [0, 220],
      ],
      [
        { de: 0, para: 1, nome: 'Rua A' },
        { de: 1, para: 2, nome: 'Ponte Velha', ponte: true },
        { de: 2, para: 3, nome: 'Rua B' },
      ],
      [0, 0],
      [0, 220],
    );
    expect(passos.map((p) => p.texto)).toEqual([
      'Siga para o norte pela Rua A',
      'Atravesse a ponte',
      'Continue pela Rua B',
      'Você chegou: seu destino',
    ]);
  });

  it('a fusão acumula avisos de uma sequência de travessias curtas', () => {
    // ponte (10 m), escadaria (10 m) e depois uma rua normal
    const { passos, rota } = percurso(
      [
        [0, 0],
        [0, 100],
        [0, 110],
        [0, 120],
        [0, 220],
      ],
      [
        { de: 0, para: 1, nome: 'Rua A' },
        { de: 1, para: 2, nome: 'Ponte Velha', ponte: true },
        { de: 2, para: 3, nome: 'Escadaria Sul', classe: 'steps', escada: true },
        { de: 3, para: 4, nome: 'Rua B' },
      ],
      [0, 0],
      [0, 220],
    );
    expect(passos.map((p) => p.tipo)).toEqual(['partida', 'travessia', 'chegada']);
    expect(passos[1]!.texto).toBe('Continue pela Rua B');
    expect(passos[1]!.avisos).toEqual(['PONTE', 'ESCADA']);
    expect(
      Math.abs(passos.reduce((s, p) => s + p.distanciaM, 0) - rota.distanciaRedeM),
    ).toBeLessThan(1);
    for (let i = 1; i < passos.length; i++) {
      expect(passos[i]!.indiceNaLinha).toBeGreaterThan(passos[i - 1]!.indiceNaLinha);
    }
  });

  it('a regra de manobras a menos de 15 m continua valendo', () => {
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
  });
});

describe('curva em via sem nome', () => {
  function curva(giro: number) {
    const A: Ponto = [0, 0];
    const B: Ponto = [0, 100];
    const C = andar(B, giro, 100);
    return percurso(
      [A, B, C],
      [
        { de: 0, para: 1, nome: 'Rua A' },
        { de: 1, para: 2, classe: 'footway' },
      ],
      A,
      C,
    ).passos[1]!;
  }

  it.each([
    [40, 'leve_direita', 'Siga levemente à direita'],
    [-40, 'leve_esquerda', 'Siga levemente à esquerda'],
    [90, 'direita', 'Vire à direita'],
    [-90, 'esquerda', 'Vire à esquerda'],
    [140, 'fechada_direita', 'Faça a curva fechada à direita'],
    [-140, 'fechada_esquerda', 'Faça a curva fechada à esquerda'],
  ])('%d graus sem nome: %s', (giro, manobra, texto) => {
    const p = curva(giro);
    expect(p.manobra).toBe(manobra);
    expect(p.texto).toBe(texto);
    expect(p.rua).toBeNull();
  });

  it('o retorno sem nome usa o texto da classe (há "siga")', () => {
    const A: Ponto = [0, 0];
    const B: Ponto = [0, 100];
    const { passos } = percurso(
      [A, B, [3, 0]],
      [
        { de: 0, para: 1, nome: 'Rua A' },
        { de: 1, para: 2, classe: 'footway' },
      ],
      A,
      [3, 0],
    );
    expect(passos[1]!.texto).toBe('Retorne e siga pela passagem de pedestres');
  });

  it('"siga" e "continue" continuam com o texto por classe', () => {
    const nos: Ponto[] = [
      [0, 0],
      [0, 100],
      [0, 200],
    ];
    const casos: [string, string][] = [
      ['footway', 'Continue pela passagem de pedestres'],
      ['steps', 'Pegue a escadaria'], // escada é travessia, com texto próprio
      ['path', 'Continue pelo caminho'],
      ['service', 'Continue pela via de serviço'],
    ];
    for (const [classe, texto] of casos) {
      const { passos } = percurso(
        nos,
        [
          { de: 0, para: 1, nome: 'Rua A' },
          { de: 1, para: 2, classe },
        ],
        nos[0]!,
        nos[2]!,
      );
      expect(passos[1]!.texto).toBe(texto);
    }
  });

  it('com nome o texto não muda: "Vire levemente à direita na Rua B"', () => {
    const A: Ponto = [0, 0];
    const B: Ponto = [0, 100];
    const C = andar(B, 40, 100);
    const { passos } = percurso(
      [A, B, C],
      [
        { de: 0, para: 1, nome: 'Rua A' },
        { de: 1, para: 2, nome: 'Rua B' },
      ],
      A,
      C,
    );
    expect(passos[1]!.texto).toBe('Vire levemente à direita na Rua B');
  });
});
