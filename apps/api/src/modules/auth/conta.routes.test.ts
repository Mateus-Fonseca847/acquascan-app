import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client';

const { prismaFalso } = vi.hoisted(() => ({
  prismaFalso: { usuario: { findUnique: vi.fn(), delete: vi.fn() } },
}));

vi.mock('../../lib/prisma', () => ({ prisma: prismaFalso }));
// Espia a conferência da senha, mas deixa o scrypt real rodar.
vi.mock('../../lib/senha', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('../../lib/senha')>();
  return { ...original, verificarSenha: vi.fn(original.verificarSenha) };
});

const { hashSenha, verificarSenha } = await import('../../lib/senha');
const { construirApp } = await import('../../app');

const SENHA = 'senha-segura-123';
const app = construirApp({ logger: false });
let senhaHash: string;

beforeAll(async () => {
  senhaHash = await hashSenha(SENHA);
  await app.ready();
});

beforeEach(() => {
  // O plugin busca { id, nome, email }; a exclusão pede o senhaHash.
  prismaFalso.usuario.findUnique.mockReset().mockImplementation(async (args) => {
    return args.select.senhaHash
      ? { senhaHash }
      : { id: 5, nome: 'Maria', email: 'maria@exemplo.com' };
  });
  prismaFalso.usuario.delete.mockReset().mockResolvedValue({ id: 5 });
  vi.mocked(verificarSenha).mockClear();
});

const excluir = (payload?: object | string, comToken = true) =>
  app.inject({
    method: 'DELETE',
    url: '/auth/conta',
    headers: {
      ...(comToken ? { authorization: `Bearer ${app.jwt.sign({ sub: '5' })}` } : {}),
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(payload === undefined ? {} : { payload }),
  });

describe('DELETE /auth/conta', () => {
  it('apaga o usuário do token e responde 204 sem corpo, com a senha correta', async () => {
    const resposta = await excluir({ senha: SENHA });

    expect(resposta.statusCode).toBe(204);
    expect(resposta.body).toBe('');
    expect(verificarSenha).toHaveBeenCalledWith(SENHA, senhaHash);
    expect(prismaFalso.usuario.delete).toHaveBeenCalledTimes(1);
    expect(prismaFalso.usuario.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it('responde 403 (e não 401) com senha errada, sem apagar nada', async () => {
    const resposta = await excluir({ senha: 'senha-errada-123' });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: 'Senha incorreta' });
    expect(prismaFalso.usuario.delete).not.toHaveBeenCalled();
  });

  it('responde 400 quando o corpo não traz a senha', async () => {
    expect((await excluir({})).statusCode).toBe(400);
    expect((await excluir({ senha: '' })).statusCode).toBe(400);
    expect((await excluir({ senha: 'a'.repeat(129) })).statusCode).toBe(400);
    expect((await excluir()).statusCode).toBe(400);
    expect(prismaFalso.usuario.delete).not.toHaveBeenCalled();
  });

  it('responde 400 (e não 500) quando o JSON é malformado', async () => {
    const resposta = await excluir('{ senha: ');
    expect(resposta.statusCode).toBe(400);
    expect(prismaFalso.usuario.delete).not.toHaveBeenCalled();
  });

  it('responde 401 sem token, sem tocar no banco nem conferir senha', async () => {
    const resposta = await excluir({ senha: SENHA }, false);

    expect(resposta.statusCode).toBe(401);
    expect(prismaFalso.usuario.findUnique).not.toHaveBeenCalled();
    expect(verificarSenha).not.toHaveBeenCalled();
    expect(prismaFalso.usuario.delete).not.toHaveBeenCalled();
  });

  it('responde 204 quando o usuário já foi apagado (P2025)', async () => {
    prismaFalso.usuario.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('não encontrado', {
        code: 'P2025',
        clientVersion: 'teste',
      }),
    );
    expect((await excluir({ senha: SENHA })).statusCode).toBe(204);
  });

  it('responde 204 quando o usuário some entre a autenticação e a exclusão', async () => {
    prismaFalso.usuario.findUnique.mockImplementation(async (args) =>
      args.select.senhaHash ? null : { id: 5, nome: 'Maria', email: 'maria@exemplo.com' },
    );
    expect((await excluir({ senha: SENHA })).statusCode).toBe(204);
    expect(prismaFalso.usuario.delete).not.toHaveBeenCalled();
  });

  it('troca erros inesperados do banco por uma mensagem genérica', async () => {
    prismaFalso.usuario.delete.mockRejectedValue(new Error('falha com maria@exemplo.com'));
    const resposta = await excluir({ senha: SENHA });

    expect(resposta.statusCode).toBe(500);
    expect(resposta.body).not.toContain('maria@exemplo.com');
    expect(resposta.json()).toEqual({ erro: 'Erro interno do servidor' });
  });
});
