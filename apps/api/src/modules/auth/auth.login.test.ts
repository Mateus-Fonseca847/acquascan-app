import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaFalso } = vi.hoisted(() => ({
  prismaFalso: { usuario: { findUnique: vi.fn() } },
}));

vi.mock('../../lib/prisma', () => ({ prisma: prismaFalso }));
vi.mock('../../lib/senha', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('../../lib/senha')>();
  return { ...original, verificarSenha: vi.fn(original.verificarSenha) };
});

const { hashSenha, verificarSenha } = await import('../../lib/senha');
const { autenticarCredenciais, HASH_FICTICIO } = await import('./auth.service');

const SENHA = 'senha-segura-123';
let senhaHash: string;

beforeAll(async () => {
  senhaHash = await hashSenha(SENHA);
});

beforeEach(() => {
  prismaFalso.usuario.findUnique.mockReset();
  vi.mocked(verificarSenha).mockClear();
});

const usuarioNoBanco = () => ({ id: 5, nome: 'Maria', email: 'maria@exemplo.com', senhaHash });

describe('autenticarCredenciais', () => {
  it('devolve o usuário (sem o hash) quando e-mail e senha conferem', async () => {
    prismaFalso.usuario.findUnique.mockResolvedValue(usuarioNoBanco());
    expect(await autenticarCredenciais({ email: 'maria@exemplo.com', senha: SENHA })).toEqual({
      id: 5,
      nome: 'Maria',
      email: 'maria@exemplo.com',
    });
  });

  it('responde 401 com senha errada', async () => {
    prismaFalso.usuario.findUnique.mockResolvedValue(usuarioNoBanco());
    await expect(
      autenticarCredenciais({ email: 'maria@exemplo.com', senha: 'senha-errada-123' }),
    ).rejects.toMatchObject({ status: 401, message: 'E-mail ou senha incorretos' });
  });

  it('responde 401 igual para e-mail inexistente e confere a senha mesmo assim', async () => {
    prismaFalso.usuario.findUnique.mockResolvedValue(null);
    await expect(
      autenticarCredenciais({ email: 'ninguem@exemplo.com', senha: SENHA }),
    ).rejects.toMatchObject({ status: 401, message: 'E-mail ou senha incorretos' });
    expect(verificarSenha).toHaveBeenCalledTimes(1);
    expect(verificarSenha).toHaveBeenCalledWith(SENHA, HASH_FICTICIO);
  });

  it('busca o e-mail sem espaços e em minúsculas', async () => {
    prismaFalso.usuario.findUnique.mockResolvedValue(usuarioNoBanco());
    await autenticarCredenciais({ email: ' MARIA@Exemplo.com ', senha: SENHA });
    expect(prismaFalso.usuario.findUnique.mock.calls[0]![0].where).toEqual({
      email: 'maria@exemplo.com',
    });
  });

  it('usa um hash fictício com os mesmos parâmetros dos hashes reais', async () => {
    const real = await hashSenha('qualquer-coisa-1');
    const parametros = (hash: string) => hash.split('$').slice(0, 4).join('$');
    expect(parametros(HASH_FICTICIO)).toBe(parametros(real));
  });
});
