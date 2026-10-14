import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSenha } from '../../lib/senha';

const { prismaFalso } = vi.hoisted(() => ({
  prismaFalso: { usuario: { findUnique: vi.fn() } },
}));

vi.mock('../../lib/prisma', () => ({ prisma: prismaFalso }));

const { construirApp } = await import('../../app');
const { autenticarUsuario } = await import('../../plugins/autenticar-usuario');

const SENHA = 'senha-segura-123';
const app = construirApp({ logger: false });
// Rota só dos testes, para exercitar o plugin.
app.get('/teste/eu', { preHandler: autenticarUsuario }, async (request) => request.usuario);

let senhaHash: string;

beforeAll(async () => {
  senhaHash = await hashSenha(SENHA);
  await app.ready();
});

beforeEach(() => {
  prismaFalso.usuario.findUnique.mockReset();
});

const login = (payload: object) => app.inject({ method: 'POST', url: '/auth/login', payload });
const eu = (authorization?: string) =>
  app.inject({
    method: 'GET',
    url: '/teste/eu',
    ...(authorization ? { headers: { authorization } } : {}),
  });

describe('POST /auth/login', () => {
  it('responde 200 com token e usuário, e o token leva só o sub', async () => {
    prismaFalso.usuario.findUnique.mockResolvedValue({
      id: 5,
      nome: 'Maria',
      email: 'maria@exemplo.com',
      senhaHash,
    });
    const resposta = await login({ email: 'maria@exemplo.com', senha: SENHA });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(Object.keys(corpo).sort()).toEqual(['token', 'usuario']);
    expect(corpo.usuario).toEqual({ id: 5, nome: 'Maria', email: 'maria@exemplo.com' });

    const payload = app.jwt.decode<Record<string, unknown>>(corpo.token)!;
    expect(payload['sub']).toBe('5');
    // Além do sub, só as datas padrão (iat e exp): nada de e-mail, nome ou CEP.
    expect(Object.keys(payload).filter((k) => !['sub', 'iat', 'exp'].includes(k))).toEqual([]);
    expect(payload['exp']).toBeTypeOf('number');
  });

  it('responde 401 com senha errada e com e-mail inexistente, com a mesma mensagem', async () => {
    prismaFalso.usuario.findUnique.mockResolvedValueOnce({
      id: 5,
      nome: 'Maria',
      email: 'maria@exemplo.com',
      senhaHash,
    });
    const errada = await login({ email: 'maria@exemplo.com', senha: 'senha-errada-123' });

    prismaFalso.usuario.findUnique.mockResolvedValueOnce(null);
    const inexistente = await login({ email: 'ninguem@exemplo.com', senha: SENHA });

    expect(errada.statusCode).toBe(401);
    expect(inexistente.statusCode).toBe(401);
    expect(errada.json()).toEqual({ erro: 'E-mail ou senha incorretos' });
    expect(inexistente.json()).toEqual(errada.json());
  });

  it('responde 400 com dados inválidos', async () => {
    expect((await login({ email: 'nao-e-email' })).statusCode).toBe(400);
  });
});

describe('plugin autenticarUsuario', () => {
  it('responde 401 sem o cabeçalho Authorization', async () => {
    expect((await eu()).statusCode).toBe(401);
  });

  it('responde 401 com token inválido', async () => {
    expect((await eu('Bearer isto-nao-e-um-jwt')).statusCode).toBe(401);
  });

  it('responde 401 com token assinado por outro segredo', async () => {
    const { default: Fastify } = await import('fastify');
    const { default: fastifyJwt } = await import('@fastify/jwt');
    const outro = Fastify();
    await outro.register(fastifyJwt, { secret: 'outro-segredo-com-mais-de-32-caracteres-xx' });
    await outro.ready();
    const token = outro.jwt.sign({ sub: '5' });
    expect((await eu(`Bearer ${token}`)).statusCode).toBe(401);
  });

  it('responde 401 com token expirado', async () => {
    const token = app.jwt.sign({ sub: '5' }, { expiresIn: '1s' });
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 60_000 });
    try {
      expect((await eu(`Bearer ${token}`)).statusCode).toBe(401);
    } finally {
      vi.useRealTimers();
    }
    // Falhou na assinatura/validade, antes de consultar o banco.
    expect(prismaFalso.usuario.findUnique).not.toHaveBeenCalled();
  });

  it('responde 401 quando o usuário do token não existe mais', async () => {
    prismaFalso.usuario.findUnique.mockResolvedValue(null);
    const token = app.jwt.sign({ sub: '999' });
    expect((await eu(`Bearer ${token}`)).statusCode).toBe(401);
  });

  it('aceita um token válido e disponibiliza o usuário, sem o hash da senha', async () => {
    prismaFalso.usuario.findUnique.mockResolvedValue({
      id: 5,
      nome: 'Maria',
      email: 'maria@exemplo.com',
    });
    const token = app.jwt.sign({ sub: '5' });
    const resposta = await eu(`Bearer ${token}`);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ id: 5, nome: 'Maria', email: 'maria@exemplo.com' });
    expect(prismaFalso.usuario.findUnique).toHaveBeenCalledWith({
      where: { id: 5 },
      select: { id: true, nome: true, email: true },
    });
  });
});
