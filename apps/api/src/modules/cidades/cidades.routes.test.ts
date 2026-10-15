import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaFalso } = vi.hoisted(() => ({
  prismaFalso: { cidade: { findMany: vi.fn() } },
}));

vi.mock('../../lib/prisma', () => ({ prisma: prismaFalso }));

const { construirApp } = await import('../../app');
const app = construirApp({ logger: false });

beforeAll(() => app.ready());
beforeEach(() => prismaFalso.cidade.findMany.mockReset());

describe('GET /cidades', () => {
  it('devolve a lista no formato do contrato, pedindo ordem por nome', async () => {
    const cidades = [
      { id: 2, nome: 'Nova Friburgo', uf: 'RJ', latitude: -22.2819, longitude: -42.5311 },
      { id: 1, nome: 'Petrópolis', uf: 'RJ', latitude: -22.505, longitude: -43.17861 },
    ];
    prismaFalso.cidade.findMany.mockResolvedValue(cidades);

    const resposta = await app.inject({ method: 'GET', url: '/cidades' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual(cidades);
    expect(Object.keys(resposta.json()[0]).sort()).toEqual([
      'id',
      'latitude',
      'longitude',
      'nome',
      'uf',
    ]);
    expect(prismaFalso.cidade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { nome: 'asc' } }),
    );
  });

  it('devolve [] quando não há cidades', async () => {
    prismaFalso.cidade.findMany.mockResolvedValue([]);
    const resposta = await app.inject({ method: 'GET', url: '/cidades' });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([]);
  });

  it('é público: não exige token', async () => {
    prismaFalso.cidade.findMany.mockResolvedValue([]);
    const resposta = await app.inject({ method: 'GET', url: '/cidades' });
    expect(resposta.statusCode).not.toBe(401);
  });
});
