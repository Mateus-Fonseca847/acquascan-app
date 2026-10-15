import type { Cidade } from '@acquascan/shared';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';

export async function cidadesRoutes(app: FastifyInstance) {
  /** Lista pública: o app usa para o usuário escolher a cidade. */
  app.get('/cidades', async (): Promise<Cidade[]> => {
    return prisma.cidade.findMany({
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, uf: true, latitude: true, longitude: true },
    });
  });
}
