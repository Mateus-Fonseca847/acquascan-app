import type { FastifyInstance } from 'fastify';
import { buscarPrevisao } from './previsao.service';

export async function previsaoRoutes(app: FastifyInstance) {
  app.get('/previsao', async () => buscarPrevisao());
}
