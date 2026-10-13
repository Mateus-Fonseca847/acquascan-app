import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listarAlertasRecentes } from './alertas.service';

const query = z.object({ horas: z.coerce.number().int().min(1).max(168).default(24) });

export async function alertasRoutes(app: FastifyInstance) {
  app.get('/alertas', async (request) => {
    const { horas } = query.parse(request.query);
    return listarAlertasRecentes(horas);
  });
}
