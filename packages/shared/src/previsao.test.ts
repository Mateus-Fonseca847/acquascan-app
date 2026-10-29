import { describe, expect, it } from 'vitest';
import { ErroFormatoPrevisao, lerPrevisao } from './previsao';

/** Dia exatamente como GET /previsao devolve hoje (sem `condicao`). */
const diaDeHoje = {
  data: '2026-10-30',
  chuvaMm: 12.5,
  probabilidadeChuvaPct: 80,
  temperaturaMinC: 17,
  temperaturaMaxC: 25,
  risco: 'MODERADO',
};

const atualValido = { temperaturaC: 22, sensacaoC: 23, condicao: 'CHUVOSO' };

describe('lerPrevisao: forma de hoje (array de dias)', () => {
  it('devolve os dias, sem temperatura atual e sem condição (nada é inventado)', () => {
    const lida = lerPrevisao([diaDeHoje, { ...diaDeHoje, data: '2026-10-31' }]);
    expect(lida.atual).toBeNull();
    expect(lida.dias).toHaveLength(2);
    expect(lida.dias[0]).toEqual({ ...diaDeHoje, condicao: null });
  });

  it('aceita lista vazia', () => {
    expect(lerPrevisao([])).toEqual({ atual: null, dias: [] });
  });

  it('probabilidade ausente ou nula vira null', () => {
    const { probabilidadeChuvaPct: _removida, ...semProbabilidade } = diaDeHoje;
    expect(lerPrevisao([semProbabilidade]).dias[0]?.probabilidadeChuvaPct).toBeNull();
    expect(
      lerPrevisao([{ ...diaDeHoje, probabilidadeChuvaPct: null }]).dias[0]?.probabilidadeChuvaPct,
    ).toBeNull();
  });
});

describe('lerPrevisao: forma nova do C4 ({ atual, dias })', () => {
  it('lê a temperatura atual e os dias com condição', () => {
    const lida = lerPrevisao({
      atual: atualValido,
      dias: [{ ...diaDeHoje, condicao: 'CHUVOSO' }],
    });
    expect(lida.atual).toEqual(atualValido);
    expect(lida.dias).toEqual([{ ...diaDeHoje, condicao: 'CHUVOSO' }]);
  });

  it('as duas formas dão o mesmo resultado quando os dados são os mesmos', () => {
    const daLista = lerPrevisao([diaDeHoje]);
    const doPacote = lerPrevisao({ dias: [diaDeHoje] });
    expect(doPacote).toEqual(daLista);
  });

  it.each([
    ['ausente', undefined],
    ['nula', null],
    ['sem a sensação térmica', { temperaturaC: 22, condicao: 'CHUVOSO' }],
    ['com temperatura em texto', { ...atualValido, temperaturaC: '22' }],
    ['com condição desconhecida', { ...atualValido, condicao: 'NEVANDO' }],
    ['que não é um objeto', 22],
  ])('temperatura atual %s vira null e os dias continuam válidos', (_nome, atual) => {
    const lida = lerPrevisao({ atual, dias: [diaDeHoje] });
    expect(lida.atual).toBeNull();
    expect(lida.dias).toHaveLength(1);
  });

  it('condição desconhecida em um dia vira null, sem derrubar o dia', () => {
    const lida = lerPrevisao({ atual: atualValido, dias: [{ ...diaDeHoje, condicao: 'NEVANDO' }] });
    expect(lida.dias[0]?.condicao).toBeNull();
    expect(lida.dias[0]?.chuvaMm).toBe(12.5);
  });

  it('aceita lista de dias vazia', () => {
    expect(lerPrevisao({ atual: atualValido, dias: [] })).toEqual({
      atual: atualValido,
      dias: [],
    });
  });
});

describe('lerPrevisao: respostas que não dá para entender', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['texto', 'previsão'],
    ['número', 7],
    ['objeto sem dias', {}],
    ['objeto só com a temperatura atual', { atual: atualValido }],
    ['dias que não é lista', { atual: atualValido, dias: 'x' }],
    ['dias nulo', { atual: atualValido, dias: null }],
  ])('recusa %s com ErroFormatoPrevisao', (_nome, resposta) => {
    expect(() => lerPrevisao(resposta)).toThrow(ErroFormatoPrevisao);
  });

  it.each([
    ['sem a data', { ...diaDeHoje, data: undefined }],
    ['com data vazia', { ...diaDeHoje, data: '' }],
    ['com chuva em texto', { ...diaDeHoje, chuvaMm: '12' }],
    ['sem a mínima', { ...diaDeHoje, temperaturaMinC: undefined }],
    ['sem a máxima', { ...diaDeHoje, temperaturaMaxC: undefined }],
    ['com risco desconhecido', { ...diaDeHoje, risco: 'APOCALIPTICO' }],
    ['que não é um objeto', 'dia'],
  ])('um dia %s derruba a leitura toda (não mostra previsão incompleta)', (_nome, dia) => {
    expect(() => lerPrevisao([diaDeHoje, dia])).toThrow(ErroFormatoPrevisao);
    expect(() => lerPrevisao({ atual: atualValido, dias: [dia] })).toThrow(ErroFormatoPrevisao);
  });

  it('a mensagem do erro é em português e não expõe o conteúdo recebido', () => {
    try {
      lerPrevisao({ segredo: 'conteudo-da-resposta' });
      expect.unreachable();
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroFormatoPrevisao);
      expect((erro as Error).message).toMatch(/formato que o app não entende/);
      expect((erro as Error).message).not.toMatch(/conteudo-da-resposta/);
    }
  });
});
