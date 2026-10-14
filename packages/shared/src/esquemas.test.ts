import { describe, expect, it } from 'vitest';
import { cadastroEntradaSchema, leituraEntradaSchema, loginEntradaSchema } from './esquemas';

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
    cep: '25600000',
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

  it('exige CEP com 8 dígitos', () => {
    expect(cadastroEntradaSchema.safeParse({ ...valido, cep: '25600-000' }).success).toBe(false);
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
