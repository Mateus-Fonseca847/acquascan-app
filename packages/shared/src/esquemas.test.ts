import { describe, expect, it } from 'vitest';
import {
  cadastroEntradaSchema,
  excluirContaEntradaSchema,
  leituraEntradaSchema,
  loginEntradaSchema,
  pushTokenEntradaSchema,
} from './esquemas';

describe('leituraEntradaSchema', () => {
  it('aceita uma leitura válida do ESP32', () => {
    expect(leituraEntradaSchema.safeParse({ distanciaCm: 180.5, vazaoLpm: 7.33 }).success).toBe(
      true,
    );
  });

  it('recusa distância negativa', () => {
    expect(leituraEntradaSchema.safeParse({ distanciaCm: -1 }).success).toBe(false);
  });

  it('recusa data em formato inválido', () => {
    expect(
      leituraEntradaSchema.safeParse({ distanciaCm: 100, medidoEm: '07/10/2026' }).success,
    ).toBe(false);
  });
});

describe('cadastroEntradaSchema', () => {
  const valido = {
    nome: 'Maria',
    email: 'maria@exemplo.com',
    cidadeId: 1,
    senha: '12345678',
    consentimento: true,
  };

  it('aceita um cadastro completo', () => {
    expect(cadastroEntradaSchema.safeParse(valido).success).toBe(true);
  });

  it('exige consentimento (LGPD)', () => {
    expect(cadastroEntradaSchema.safeParse({ ...valido, consentimento: false }).success).toBe(
      false,
    );
  });

  it('exige a cidade', () => {
    const { cidadeId: _cidadeId, ...semCidade } = valido;
    expect(cadastroEntradaSchema.safeParse(semCidade).success).toBe(false);
  });

  it.each([0, -1, 1.5, '1', null])('recusa cidadeId %j', (cidadeId) => {
    expect(cadastroEntradaSchema.safeParse({ ...valido, cidadeId }).success).toBe(false);
  });

  it('ignora o campo cep, que não faz mais parte do cadastro', () => {
    const resultado = cadastroEntradaSchema.safeParse({ ...valido, cep: '25600000' });
    expect(resultado.success).toBe(true);
    expect(resultado.data).not.toHaveProperty('cep');
  });

  it('recusa senha com mais de 128 caracteres', () => {
    expect(cadastroEntradaSchema.safeParse({ ...valido, senha: 'a'.repeat(128) }).success).toBe(
      true,
    );
    expect(cadastroEntradaSchema.safeParse({ ...valido, senha: 'a'.repeat(129) }).success).toBe(
      false,
    );
  });
});

describe('loginEntradaSchema', () => {
  it('recusa senha com mais de 128 caracteres', () => {
    const base = { email: 'maria@exemplo.com' };
    expect(loginEntradaSchema.safeParse({ ...base, senha: 'a'.repeat(128) }).success).toBe(true);
    expect(loginEntradaSchema.safeParse({ ...base, senha: 'a'.repeat(129) }).success).toBe(false);
  });
});

describe('excluirContaEntradaSchema', () => {
  it('aceita uma senha de até 128 caracteres', () => {
    expect(excluirContaEntradaSchema.safeParse({ senha: 'a'.repeat(128) }).success).toBe(true);
  });

  it.each([{}, { senha: '' }, { senha: 'a'.repeat(129) }, { senha: 123 }])('recusa %j', (corpo) => {
    expect(excluirContaEntradaSchema.safeParse(corpo).success).toBe(false);
  });
});

describe('pushTokenEntradaSchema', () => {
  it.each(['ExponentPushToken[abc-123_XYZ]', 'ExpoPushToken[abc-123_XYZ]'])(
    'aceita %s',
    (token) => {
      expect(pushTokenEntradaSchema.safeParse({ token }).success).toBe(true);
    },
  );

  it('remove espaços nas pontas', () => {
    const resultado = pushTokenEntradaSchema.safeParse({ token: '  ExpoPushToken[abc]  ' });
    expect(resultado.data?.token).toBe('ExpoPushToken[abc]');
  });

  it.each([
    ['vazio', ''],
    ['só espaços', '   '],
    ['sem colchetes', 'ExponentPushToken-abc'],
    ['com colchete sem fechar', 'ExponentPushToken[abc'],
    ['conteúdo vazio', 'ExponentPushToken[]'],
    ['com espaço dentro', 'ExponentPushToken[abc def]'],
    ['prefixo errado', 'FcmToken[abc]'],
    ['acima de 200 caracteres', `ExponentPushToken[${'a'.repeat(200)}]`],
  ])('recusa token %s', (_nome, token) => {
    expect(pushTokenEntradaSchema.safeParse({ token }).success).toBe(false);
  });

  it('aceita exatamente 200 caracteres e recusa sem o campo', () => {
    const token = `ExponentPushToken[${'a'.repeat(181)}]`;
    expect(token).toHaveLength(200);
    expect(pushTokenEntradaSchema.safeParse({ token }).success).toBe(true);
    expect(pushTokenEntradaSchema.safeParse({}).success).toBe(false);
  });
});
