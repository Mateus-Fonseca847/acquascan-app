import { describe, expect, it } from 'vitest';
import {
  comPreposicao,
  formatarDistancia,
  formatarDuracao,
  generoDoNome,
  referenciaDaVia,
  rumoCardeal,
} from './textos';

describe('rumoCardeal', () => {
  it.each([
    [0, 'norte'],
    [45, 'nordeste'],
    [90, 'leste'],
    [135, 'sudeste'],
    [180, 'sul'],
    [225, 'sudoeste'],
    [270, 'oeste'],
    [315, 'noroeste'],
  ])('%d graus é %s', (graus, esperado) => {
    expect(rumoCardeal(graus)).toBe(esperado);
  });

  it('fronteiras a 22,5 graus: o limite pertence ao setor seguinte', () => {
    expect(rumoCardeal(22.4)).toBe('norte');
    expect(rumoCardeal(22.5)).toBe('nordeste');
    expect(rumoCardeal(67.4)).toBe('nordeste');
    expect(rumoCardeal(67.5)).toBe('leste');
    expect(rumoCardeal(337.4)).toBe('noroeste');
    expect(rumoCardeal(337.5)).toBe('norte');
    expect(rumoCardeal(359.9)).toBe('norte');
  });

  it('aceita graus negativos e maiores que 360', () => {
    expect(rumoCardeal(-90)).toBe('oeste');
    expect(rumoCardeal(450)).toBe('leste');
  });
});

describe('formatarDistancia', () => {
  it.each([
    [0, '0 m'],
    [42, '40 m'],
    [43, '45 m'],
    [99, '100 m'],
    [100, '100 m'],
    [104, '100 m'],
    [345, '350 m'],
    [996, '1000 m'],
    [1000, '1000 m'],
    [1049, '1,0 km'],
    [1234, '1,2 km'],
    [12_340, '12,3 km'],
  ])('%d m vira "%s"', (m, texto) => {
    expect(formatarDistancia(m)).toBe(texto);
  });
});

describe('formatarDuracao', () => {
  it.each([
    [0, 'menos de 1 min'],
    [59, 'menos de 1 min'],
    [60, '1 min a pé'],
    [12 * 60, '12 min a pé'],
    [59 * 60 + 29, '59 min a pé'],
    [59 * 60 + 40, '1 h 00 min'],
    [65 * 60, '1 h 05 min'],
    [135 * 60, '2 h 15 min'],
  ])('%d s vira "%s"', (s, texto) => {
    expect(formatarDuracao(s)).toBe(texto);
  });
});

describe('preposições pelo tipo do nome', () => {
  it.each([
    'Rua do Imperador',
    'Avenida Koeler',
    'Travessa X',
    'Alameda Y',
    'Estrada União e Indústria',
    'Praça da Liberdade',
    'Ladeira Z',
    'Servidão W',
    'Rodovia BR-040',
    'Via Expressa',
    'Passarela A',
  ])('"%s" é feminino', (nome) => {
    expect(generoDoNome(nome)).toBe('f');
    expect(comPreposicao('em', referenciaDaVia(nome, 'residential'))).toBe(`na ${nome}`);
    expect(comPreposicao('por', referenciaDaVia(nome, 'residential'))).toBe(`pela ${nome}`);
  });

  it.each(['Beco do Sol', 'Caminho Velho', 'Largo da Matriz', 'Viaduto A', 'Túnel B'])(
    '"%s" é masculino',
    (nome) => {
      expect(generoDoNome(nome)).toBe('m');
      expect(comPreposicao('em', referenciaDaVia(nome, 'residential'))).toBe(`no ${nome}`);
      expect(comPreposicao('por', referenciaDaVia(nome, 'residential'))).toBe(`pelo ${nome}`);
    },
  );

  it('qualquer outro nome usa "em" e "por"', () => {
    const ref = referenciaDaVia('Bosque dos Namorados', 'residential');
    expect(generoDoNome('Bosque dos Namorados')).toBe('n');
    expect(comPreposicao('em', ref)).toBe('em Bosque dos Namorados');
    expect(comPreposicao('por', ref)).toBe('por Bosque dos Namorados');
  });

  it('ignora acento e maiúsculas na primeira palavra', () => {
    expect(generoDoNome('PRAÇA central')).toBe('f');
    expect(generoDoNome('servidão b')).toBe('f');
    expect(generoDoNome('TUNEL novo')).toBe('m');
  });

  it('sem nome, descreve pela classe', () => {
    const por = (classe: string) => comPreposicao('por', referenciaDaVia(null, classe));
    expect(por('footway')).toBe('pela passagem de pedestres');
    expect(por('steps')).toBe('pela escadaria');
    expect(por('path')).toBe('pelo caminho');
    expect(por('track')).toBe('pelo caminho');
    expect(por('service')).toBe('pela via de serviço');
    expect(por('residential')).toBe('pela via');
    expect(comPreposicao('em', referenciaDaVia('  ', 'footway'))).toBe('na passagem de pedestres');
  });
});
