import { describe, expect, it } from 'vitest';
import { AGORA, leitura, mundoPonte } from '../test/auxiliares';

const { desvio } = mundoPonte();
const efetivo = (l: Parameters<typeof desvio.estadosEfetivos>[0]) =>
  desvio.estadosEfetivos(l, AGORA).get(1)!;

describe('estadosEfetivos', () => {
  it('leitura fresca vale como está', () => {
    expect(efetivo([leitura(1, 'CRITICO', 5)])).toMatchObject({
      estado: 'CRITICO',
      origem: 'medido',
      idadeMin: 5,
    });
    expect(efetivo([leitura(1, 'ESTAVEL', 5)])).toMatchObject({
      estado: 'ESTAVEL',
      origem: 'medido',
    });
  });

  it('crítico antigo é mantido por falha segura até a retenção e liberado depois', () => {
    expect(efetivo([leitura(1, 'CRITICO', 3 * 60)])).toMatchObject({
      estado: 'CRITICO',
      origem: 'falha_segura',
    });
    expect(efetivo([leitura(1, 'ATENCAO', 3 * 60)])).toMatchObject({
      estado: 'ATENCAO',
      origem: 'falha_segura',
    });
    expect(efetivo([leitura(1, 'CRITICO', 8 * 60)])).toMatchObject({
      estado: 'DESCONHECIDO',
      origem: 'desatualizado',
    });
  });

  it('ESTAVEL antigo vira DESCONHECIDO (não é retido)', () => {
    expect(efetivo([leitura(1, 'ESTAVEL', 60)])).toMatchObject({
      estado: 'DESCONHECIDO',
      origem: 'desatualizado',
    });
  });

  it('sem leitura ou com campos nulos é DESCONHECIDO', () => {
    expect(efetivo([])).toMatchObject({
      estado: 'DESCONHECIDO',
      origem: 'sem_leitura',
      idadeMin: null,
    });
    expect(efetivo([leitura(1, null)])).toMatchObject({
      estado: 'DESCONHECIDO',
      origem: 'sem_leitura',
    });
  });

  it('data inválida ou do futuro nunca é fresca: estado ruim é mantido, o resto vira desconhecido', () => {
    const invalida = (estado: 'CRITICO' | 'ESTAVEL') => ({
      estacaoId: 1,
      estado,
      medidoEm: 'ontem',
    });
    expect(efetivo([invalida('CRITICO')])).toMatchObject({
      estado: 'CRITICO',
      origem: 'falha_segura',
      idadeMin: null,
    });
    expect(efetivo([invalida('ESTAVEL')])).toMatchObject({
      estado: 'DESCONHECIDO',
      origem: 'desatualizado',
    });
    const futuro = (estado: 'ATENCAO' | 'ESTAVEL') => leitura(1, estado, -30);
    expect(efetivo([futuro('ATENCAO')])).toMatchObject({
      estado: 'ATENCAO',
      origem: 'falha_segura',
      idadeMin: null,
    });
    expect(efetivo([futuro('ESTAVEL')])).toMatchObject({ estado: 'DESCONHECIDO' });
  });

  it('limites exatos: 20 min ainda é fresca, 20 min e 1 s não; 6 h ainda retém, 6 h e 1 s não', () => {
    const em = (segundos: number, estado: 'CRITICO' | 'ESTAVEL' = 'CRITICO') => ({
      estacaoId: 1,
      estado,
      medidoEm: new Date(AGORA.getTime() - segundos * 1000).toISOString(),
    });
    expect(efetivo([em(20 * 60)]).origem).toBe('medido');
    expect(efetivo([em(20 * 60 + 1)]).origem).toBe('falha_segura');
    expect(efetivo([em(6 * 3600)]).origem).toBe('falha_segura');
    expect(efetivo([em(6 * 3600 + 1)]).origem).toBe('desatualizado');
    expect(efetivo([em(20 * 60 + 1, 'ESTAVEL')]).estado).toBe('DESCONHECIDO');
  });

  it('respeita a política informada', () => {
    const { desvio: d } = mundoPonte({ contorno: true, politica: { frescoMin: 5, retencaoH: 1 } });
    const ef = (min: number) => d.estadosEfetivos([leitura(1, 'CRITICO', min)], AGORA).get(1)!;
    expect(ef(5).origem).toBe('medido');
    expect(ef(6).origem).toBe('falha_segura');
    expect(ef(61).origem).toBe('desatualizado');
  });
});
