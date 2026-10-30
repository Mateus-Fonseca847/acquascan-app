import { describe, expect, it } from 'vitest';
import {
  atualizarPerfilEntradaSchema,
  buscaRuaEntradaSchema,
  cadastroEntradaSchema,
  esqueciSenhaEntradaSchema,
  excluirContaEntradaSchema,
  leituraEntradaSchema,
  loginEntradaSchema,
  pushTokenEntradaSchema,
  redefinirSenhaEntradaSchema,
  trocarSenhaEntradaSchema,
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

describe('atualizarPerfilEntradaSchema (C2)', () => {
  it('aceita só os campos que mudam e ignora o e-mail', () => {
    const resultado = atualizarPerfilEntradaSchema.safeParse({
      nome: ' Maria ',
      email: 'outro@exemplo.com',
    });
    expect(resultado.success).toBe(true);
    expect(resultado.data).toEqual({ nome: 'Maria' });
  });

  it('aceita os campos do C3 (nível de alerta e estações seguidas)', () => {
    const resultado = atualizarPerfilEntradaSchema.safeParse({
      cidadeId: 1,
      nivelAlerta: 'SO_CRITICO',
      estacoesSeguidas: [1, 2],
    });
    expect(resultado.success).toBe(true);
  });

  it('aceita lista vazia de estações (deixar de seguir todas)', () => {
    expect(atualizarPerfilEntradaSchema.safeParse({ estacoesSeguidas: [] }).success).toBe(true);
  });

  it.each([
    ['nome curto', { nome: 'A' }],
    ['cidade zero', { cidadeId: 0 }],
    ['cidade fracionada', { cidadeId: 1.5 }],
    ['nível que não existe (só há duas opções)', { nivelAlerta: 'TODOS' }],
    ['estação negativa', { estacoesSeguidas: [-1] }],
    ['estação como texto', { estacoesSeguidas: ['1'] }],
    ['mais de 100 estações', { estacoesSeguidas: Array.from({ length: 101 }, (_, i) => i + 1) }],
  ])('recusa %s', (_nome, corpo) => {
    expect(atualizarPerfilEntradaSchema.safeParse(corpo).success).toBe(false);
  });
});

describe('trocarSenhaEntradaSchema (C2)', () => {
  const valido = { senhaAtual: 'a-senha-atual', novaSenha: '12345678' };

  it('aceita a troca com nova senha de 8 a 128 caracteres', () => {
    expect(trocarSenhaEntradaSchema.safeParse(valido).success).toBe(true);
    expect(
      trocarSenhaEntradaSchema.safeParse({ ...valido, novaSenha: 'a'.repeat(128) }).success,
    ).toBe(true);
  });

  it.each([
    ['sem a senha atual', { novaSenha: '12345678' }],
    ['senha atual vazia', { ...valido, senhaAtual: '' }],
    ['nova senha com 7 caracteres', { ...valido, novaSenha: '1234567' }],
    ['nova senha com 129 caracteres', { ...valido, novaSenha: 'a'.repeat(129) }],
    ['sem a nova senha', { senhaAtual: 'a-senha-atual' }],
  ])('recusa %s', (_nome, corpo) => {
    expect(trocarSenhaEntradaSchema.safeParse(corpo).success).toBe(false);
  });
});

describe('buscaRuaEntradaSchema (C6)', () => {
  it('usa limite 10 quando não informado e converte o texto da query string', () => {
    expect(buscaRuaEntradaSchema.parse({ q: 'imperador' }).limite).toBe(10);
    expect(buscaRuaEntradaSchema.parse({ q: 'imperador', limite: '20' }).limite).toBe(20);
  });

  it('remove espaços nas pontas e exige 2 caracteres', () => {
    expect(buscaRuaEntradaSchema.parse({ q: '  rua  ' }).q).toBe('rua');
    expect(buscaRuaEntradaSchema.safeParse({ q: 'a' }).success).toBe(false);
    expect(buscaRuaEntradaSchema.safeParse({ q: ' a ' }).success).toBe(false);
    expect(buscaRuaEntradaSchema.safeParse({}).success).toBe(false);
  });

  it.each(['0', '21', '1.5', 'muitos'])('recusa limite %s', (limite) => {
    expect(buscaRuaEntradaSchema.safeParse({ q: 'rua', limite }).success).toBe(false);
  });

  it('recusa busca com mais de 100 caracteres', () => {
    expect(buscaRuaEntradaSchema.safeParse({ q: 'a'.repeat(100) }).success).toBe(true);
    expect(buscaRuaEntradaSchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
  });
});

describe('recuperação de senha (C7)', () => {
  it('esqueciSenhaEntradaSchema exige e-mail válido', () => {
    expect(esqueciSenhaEntradaSchema.safeParse({ email: 'maria@exemplo.com' }).success).toBe(true);
    expect(esqueciSenhaEntradaSchema.safeParse({ email: 'maria' }).success).toBe(false);
    expect(esqueciSenhaEntradaSchema.safeParse({}).success).toBe(false);
  });

  const valido = { email: 'maria@exemplo.com', codigo: '012345', novaSenha: '12345678' };

  it('redefinirSenhaEntradaSchema aceita código de 6 dígitos (inclusive com zero à esquerda)', () => {
    expect(redefinirSenhaEntradaSchema.safeParse(valido).success).toBe(true);
  });

  it.each(['12345', '1234567', 'abcdef', '12 345', '', '١٢٣٤٥٦'])('recusa código %j', (codigo) => {
    expect(redefinirSenhaEntradaSchema.safeParse({ ...valido, codigo }).success).toBe(false);
  });

  it('recusa código numérico (tem que ser texto, para não perder o zero à esquerda)', () => {
    expect(redefinirSenhaEntradaSchema.safeParse({ ...valido, codigo: 12345 }).success).toBe(false);
  });

  it('recusa nova senha fora de 8 a 128 caracteres', () => {
    expect(redefinirSenhaEntradaSchema.safeParse({ ...valido, novaSenha: '1234567' }).success).toBe(
      false,
    );
    expect(
      redefinirSenhaEntradaSchema.safeParse({ ...valido, novaSenha: 'a'.repeat(129) }).success,
    ).toBe(false);
  });
});
