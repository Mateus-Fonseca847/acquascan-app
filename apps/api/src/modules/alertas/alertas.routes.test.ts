import { beforeAll, describe, expect, it, vi } from 'vitest';

const { prismaFalso } = vi.hoisted(() => ({
  prismaFalso: { alerta: { findMany: vi.fn() } },
}));

vi.mock('../../lib/prisma', () => ({ prisma: prismaFalso }));

const { construirApp } = await import('../../app');
const app = construirApp({ logger: false });

beforeAll(() => app.ready());

const alerta = (id: number, suprimido: boolean) => ({
  id,
  estacaoId: 7,
  estadoAnterior: 'ESTAVEL' as const,
  estadoNovo: 'ATENCAO' as const,
  criadoEm: new Date(`2026-10-15T12:0${id}:00.000Z`),
  enviadoEm: suprimido ? null : new Date(`2026-10-15T12:0${id}:30.000Z`),
  pushSuprimidoEm: suprimido ? new Date(`2026-10-15T12:0${id}:30.000Z`) : null,
  estacao: { nome: 'Estação Centro' },
});

describe('GET /alertas', () => {
  it('lista também os alertas cujo push foi suprimido pelo cooldown', async () => {
    prismaFalso.alerta.findMany.mockResolvedValue([
      alerta(3, false),
      alerta(2, true),
      alerta(1, false),
    ]);

    const resposta = await app.inject({ method: 'GET', url: '/alertas' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().map((a: { id: number }) => a.id)).toEqual([3, 2, 1]);
    // A consulta não filtra por envio nem por supressão: todo alerta aparece.
    const where = prismaFalso.alerta.findMany.mock.calls[0]![0].where;
    expect(Object.keys(where)).toEqual(['criadoEm']);
  });
});
