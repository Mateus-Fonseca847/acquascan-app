import type { Rio } from '@aquascan/shared';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { paraEstacaoResumo } from '../estacoes/estacoes.mapper';

export async function riosRoutes(app: FastifyInstance) {
  app.get('/rios', async (): Promise<Rio[]> => {
    const rios = await prisma.rio.findMany({
      orderBy: { nome: 'asc' },
      include: {
        estacoes: {
          where: { ativa: true },
          include: { rio: true, leituras: { orderBy: { medidoEm: 'desc' }, take: 1 } },
        },
      },
    });
    return rios.map((rio) => ({
      id: rio.id,
      nome: rio.nome,
      estacoes: rio.estacoes.map(paraEstacaoResumo),
    }));
  });
}
