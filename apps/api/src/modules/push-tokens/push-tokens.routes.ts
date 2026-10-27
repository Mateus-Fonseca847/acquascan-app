import { pushTokenEntradaSchema } from '@aquascan/shared';
import type { FastifyInstance } from 'fastify';
import { autenticarUsuario } from '../../plugins/autenticar-usuario';
import { registrarPushToken, removerPushToken } from './push-tokens.service';

/**
 * Registro dos tokens de push do app (RF08, primeira etapa: ainda não enviamos notificações).
 * Privacidade: o token não é registrado em log nem devolvido em resposta.
 */
export async function pushTokensRoutes(app: FastifyInstance) {
  app.post('/usuarios/me/push-token', { preHandler: autenticarUsuario }, async (request, reply) => {
    const { token } = pushTokenEntradaSchema.parse(request.body);
    await registrarPushToken(request.usuario!.id, token);
    return reply.code(204).send();
  });

  app.delete(
    '/usuarios/me/push-token',
    { preHandler: autenticarUsuario },
    async (request, reply) => {
      const { token } = pushTokenEntradaSchema.parse(request.body);
      await removerPushToken(request.usuario!.id, token);
      return reply.code(204).send();
    },
  );
}
