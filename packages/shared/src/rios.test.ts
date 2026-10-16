import { describe, expect, it } from 'vitest';
import { normalizarNome } from './rios';

describe('normalizarNome', () => {
  it('minúsculas, sem acento, sem o prefixo "rio "', () => {
    expect(normalizarNome('Rio Piabanha')).toBe('piabanha');
    expect(normalizarNome('Piabanha')).toBe('piabanha');
    expect(normalizarNome('RIO PIABANHÁ')).toBe('piabanha');
    expect(normalizarNome('  rio   Quitandinha  ')).toBe('quitandinha');
    expect(normalizarNome('Rio Cuiabá')).toBe('cuiaba');
    expect(normalizarNome('Córrego Açu')).toBe('corrego acu');
  });

  it('só tira o prefixo "rio " do começo, e só ele', () => {
    expect(normalizarNome('Rio do Rio Preto')).toBe('do rio preto');
    expect(normalizarNome('Ribeirão Quitandinha')).toBe('ribeirao quitandinha');
    expect(normalizarNome('Riozinho')).toBe('riozinho');
    expect(normalizarNome('Rio')).toBe('rio');
  });

  it('nomes iguais depois de normalizar são iguais; "contém" não é igual', () => {
    expect(normalizarNome('Rio Piabanha')).toBe(normalizarNome('piabanhá'));
    expect(normalizarNome('Rio Quitandinha do Sul')).not.toBe(normalizarNome('Quitandinha'));
    expect(normalizarNome('Quitandinha do Sul')).toBe('quitandinha do sul');
  });

  it('o nome que a API devolve para a estação casa com o da lista de rios alvo', () => {
    expect(normalizarNome('Rio Piabanha')).toBe(normalizarNome('Piabanha'));
    expect(normalizarNome('Rio Quitandinha')).toBe(normalizarNome('Quitandinha'));
    expect(normalizarNome('Rio Piabanha')).not.toBe(normalizarNome('Quitandinha'));
  });

  it('vazio continua vazio', () => {
    expect(normalizarNome('')).toBe('');
    expect(normalizarNome('   ')).toBe('');
  });
});
