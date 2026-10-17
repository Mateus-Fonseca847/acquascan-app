import { describe, expect, it } from 'vitest';
import {
  COMO_REGERAR,
  conferirConsistencia,
  mensagemDeInconsistencia,
  montarVersaoDados,
} from './dados-app';

const bom = {
  exposicao: { grafo: { nos: 10, arestas: 20, sha256: 'g1' }, rios: { sha256: 'r1' } },
  shaGrafo: 'g1',
  shaRios: 'r1',
  arestasDoGrafo: 20,
};

describe('conferirConsistencia', () => {
  it('arquivos da mesma geração: sem problemas', () => {
    expect(conferirConsistencia(bom)).toEqual([]);
    expect(mensagemDeInconsistencia([])).toBe('');
  });

  it('grafo com outro hash', () => {
    const p = conferirConsistencia({ ...bom, shaGrafo: 'outro' });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/grafo.*sha256.*não bate/);
  });

  it('rios com outro hash', () => {
    const p = conferirConsistencia({ ...bom, shaRios: 'outro' });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/rios.*sha256.*não bate/);
  });

  it('número de arestas diferente', () => {
    const p = conferirConsistencia({ ...bom, arestasDoGrafo: 21 });
    expect(p).toEqual(['A exposição foi calculada para 20 arestas, mas o grafo tem 21.']);
  });

  it('exposição de versão antiga, sem os hashes', () => {
    const p = conferirConsistencia({ ...bom, exposicao: { grafo: { arestas: 20 } } });
    expect(p).toHaveLength(2);
    expect(p.join(' ')).toMatch(/sha256 do grafo/);
    expect(p.join(' ')).toMatch(/sha256 dos rios/);
    expect(conferirConsistencia({ ...bom, exposicao: {} })).toHaveLength(3);
  });

  it('a mensagem lista os problemas e manda regerar os três, em sequência', () => {
    const msg = mensagemDeInconsistencia(
      conferirConsistencia({ ...bom, shaGrafo: 'x', arestasDoGrafo: 1 }),
    );
    expect(msg).toContain('não são da mesma geração');
    expect(msg).toContain('pnpm grafo:construir, pnpm grafo:rios e pnpm grafo:exposicao');
    expect(msg).toContain(COMO_REGERAR);
    expect(msg.split('\n- ')).toHaveLength(3); // cabeçalho + 2 problemas
  });
});

describe('montarVersaoDados', () => {
  it('traz os três hashes, os totais do grafo e a data', () => {
    expect(
      montarVersaoDados({
        geradoEm: new Date('2026-10-16T12:00:00Z'),
        grafo: { sha256: 'g', nos: 5, arestas: 7 },
        shaRios: 'r',
        shaExposicao: 'e',
      }),
    ).toEqual({
      geradoEm: '2026-10-16T12:00:00.000Z',
      grafo: { sha256: 'g', nos: 5, arestas: 7 },
      rios: { sha256: 'r' },
      exposicao: { sha256: 'e' },
    });
  });
});
