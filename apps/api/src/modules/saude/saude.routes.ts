import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';

export async function saudeRoutes(app: FastifyInstance) {
  /** A API está no ar? Usado pelo simulador e pelo deploy. */
  app.get('/saude', async () => ({ status: 'ok', horario: new Date().toISOString() }));

  /** A API consegue falar com o banco? */
  app.get('/saude/banco', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (erro) {
      app.log.error(erro);
      return reply.code(503).send({ erro: 'Banco de dados indisponível' });
    }
  });
}
