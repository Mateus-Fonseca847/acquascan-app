import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buscarEstacao, listarEstacoes, listarHistorico } from './estacoes.service';

const paramsId = z.object({ id: z.coerce.number().int().positive() });
const queryHistorico = z.object({ horas: z.coerce.number().int().min(1).max(168).default(24) });

export async function estacoesRoutes(app: FastifyInstance) {
  app.get('/estacoes', async () => listarEstacoes());

  app.get('/estacoes/:id', async (request) => {
    const { id } = paramsId.parse(request.params);
    return buscarEstacao(id);
  });

  app.get('/estacoes/:id/leituras', async (request) => {
    const { id } = paramsId.parse(request.params);
    const { horas } = queryHistorico.parse(request.query);
    return listarHistorico(id, horas);
  });
}
