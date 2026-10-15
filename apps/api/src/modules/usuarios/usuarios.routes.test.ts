import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaFalso } = vi.hoisted(() => ({
  prismaFalso: { usuario: { findUnique: vi.fn(), delete: vi.fn() } },
}));

vi.mock('../../lib/prisma', () => ({ prisma: prismaFalso }));

const { construirApp } = await import('../../app');
const app = construirApp({ logger: false });

beforeAll(() => app.ready());

const cidade = { id: 1, nome: 'Petrópolis', uf: 'RJ', latitude: -22.505, longitude: -43.17861 };
const registro = {
  id: 5,
  nome: 'Maria',
  email: 'maria@exemplo.com',
  consentimentoEm: new Date('2026-10-01T12:00:00.000Z'),
  criadoEm: new Date('2026-10-01T12:00:01.000Z'),
  cidade,
};

beforeEach(() => {
  // O plugin busca { id, nome, email }; o serviço pede também a cidade.
  prismaFalso.usuario.findUnique.mockReset().mockImplementation(async (args) => {
    return args.select.cidade ? registro : { id: 5, nome: 'Maria', email: 'maria@exemplo.com' };
  });
});

const perfil = (authorization?: string) =>
  app.inject({
    method: 'GET',
    url: '/usuarios/me',
    ...(authorization ? { headers: { authorization } } : {}),
  });
const token = () => `Bearer ${app.jwt.sign({ sub: '5' })}`;

describe('GET /usuarios/me', () => {
  it('devolve o perfil com a cidade e as datas em ISO', async () => {
    const resposta = await perfil(token());

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      id: 5,
      nome: 'Maria',
      email: 'maria@exemplo.com',
      consentimentoEm: '2026-10-01T12:00:00.000Z',
      criadoEm: '2026-10-01T12:00:01.000Z',
      cidade,
    });
  });

  it('responde 401 sem token', async () => {
    const resposta = await perfil();
    expect(resposta.statusCode).toBe(401);
    expect(prismaFalso.usuario.findUnique).not.toHaveBeenCalled();
  });

  it('responde 401 com token inválido', async () => {
    expect((await perfil('Bearer isto-nao-e-um-jwt')).statusCode).toBe(401);
  });

  it('nunca devolve senhaHash nem pede o campo ao banco', async () => {
    // Mesmo que o banco devolvesse o hash, ele não pode aparecer na resposta.
    prismaFalso.usuario.findUnique.mockImplementation(async (args) =>
      args.select.cidade
        ? { ...registro, senhaHash: 'scrypt$32768$8$3$segredo$segredo' }
        : { id: 5, nome: 'Maria', email: 'maria@exemplo.com' },
    );
    const resposta = await perfil(token());

    expect(resposta.statusCode).toBe(200);
    expect(resposta.body).not.toContain('scrypt');
    expect(resposta.json()).not.toHaveProperty('senhaHash');
    for (const [args] of prismaFalso.usuario.findUnique.mock.calls) {
      expect(args.select).not.toHaveProperty('senhaHash');
    }
  });
});
