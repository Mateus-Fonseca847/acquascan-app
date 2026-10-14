import { cadastroEntradaSchema, loginEntradaSchema } from '@acquascan/shared';
import type { FastifyInstance } from 'fastify';
import { naoImplementado } from '../../lib/erros';
import { cadastrarUsuario } from './auth.service';

/**
 * Cadastro e login.
 *
 * TODO(v0.2.0):
 * - login: conferir senha e devolver um token de sessão (JWT)
 * - DELETE /auth/conta: excluir a conta e os dados (direito previsto na LGPD)
 * Ver docs/requisitos.md, RF01 e RF02, e docs/privacidade.md.
 */
export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/cadastro', async (request, reply) => {
    const entrada = cadastroEntradaSchema.parse(request.body);
    const usuario = await cadastrarUsuario(entrada);
    return reply.code(201).send(usuario);
  });

  app.post('/auth/login', async (request) => {
    loginEntradaSchema.parse(request.body);
    throw naoImplementado('O login', 'v0.2.0');
  });
}
