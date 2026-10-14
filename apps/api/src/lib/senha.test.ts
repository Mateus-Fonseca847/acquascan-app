import { describe, expect, it } from 'vitest';
import { hashSenha, verificarSenha } from './senha';

describe('senha', () => {
  it('verifica a senha correta', async () => {
    const hash = await hashSenha('senha-correta-123');
    expect(await verificarSenha('senha-correta-123', hash)).toBe(true);
  });

  it('recusa a senha errada', async () => {
    const hash = await hashSenha('senha-correta-123');
    expect(await verificarSenha('senha-errada-123', hash)).toBe(false);
  });

  it('gera hashes diferentes para a mesma senha (salt)', async () => {
    const [a, b] = await Promise.all([hashSenha('mesma-senha-1'), hashSenha('mesma-senha-1')]);
    expect(a).not.toBe(b);
  });

  it('começa com "scrypt$" e guarda os parâmetros', async () => {
    const hash = await hashSenha('qualquer-senha-1');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash.split('$').slice(0, 4)).toEqual(['scrypt', '32768', '8', '3']);
  });

  it('retorna false para hash malformado, sem lançar exceção', async () => {
    const malformados = [
      '',
      'lixo',
      'scrypt$1$2',
      'bcrypt$32768$8$3$c2FsdA==$aGFzaA==',
      'scrypt$abc$8$3$c2FsdA==$aGFzaA==',
      'scrypt$30000$8$3$c2FsdA==$aGFzaA==',
      'scrypt$1073741824$8$3$c2FsdA==$aGFzaA==',
      'scrypt$32768$8$3$$',
    ];
    for (const hash of malformados) {
      expect(await verificarSenha('qualquer', hash)).toBe(false);
    }
  });

  it('continua verificando hashes com parâmetros antigos', async () => {
    const { scryptSync, randomBytes } = await import('node:crypto');
    const salt = randomBytes(16);
    const chave = scryptSync('senha-antiga-1', salt, 32, { N: 1024, r: 8, p: 1 });
    const hash = `scrypt$1024$8$1$${salt.toString('base64')}$${chave.toString('base64')}`;
    expect(await verificarSenha('senha-antiga-1', hash)).toBe(true);
  });
});
