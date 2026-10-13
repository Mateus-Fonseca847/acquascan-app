import { leituraEntradaSchema } from '@acquascan/shared';
import type { FastifyInstance } from 'fastify';
import { autenticarEstacao } from '../../plugins/autenticar-estacao';
import { registrarLeitura } from './leituras.service';

export async function leiturasRoutes(app: FastifyInstance) {
  /** Endpoint usado pelo ESP32 (e pelo simulador) para enviar medições. */
  app.post('/leituras', { preHandler: autenticarEstacao }, async (request, reply) => {
    const entrada = leituraEntradaSchema.parse(request.body);
    const resultado = await registrarLeitura(request.estacao!, entrada);
    return reply.code(201).send(resultado);
  });
}
