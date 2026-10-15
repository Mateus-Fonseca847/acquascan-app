import {
  cadastroEntradaSchema,
  excluirContaEntradaSchema,
  loginEntradaSchema,
} from '@acquascan/shared';
import type { FastifyInstance } from 'fastify';
import { autenticarUsuario } from '../../plugins/autenticar-usuario';
import { autenticarCredenciais, cadastrarUsuario, excluirConta } from './auth.service';

/**
 * Cadastro, login e exclusão da conta.
 * Ver docs/requisitos.md, RF01, RF02 e RNF02, e docs/privacidade.md.
 */
export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/cadastro', async (request, reply) => {
    const entrada = cadastroEntradaSchema.parse(request.body);
    const usuario = await cadastrarUsuario(entrada);
    return reply.code(201).send(usuario);
  });

  app.post('/auth/login', async (request) => {
    const entrada = loginEntradaSchema.parse(request.body);
    const usuario = await autenticarCredenciais(entrada);
    // O token leva só o id (sub): nada de e-mail ou nome.
    const token = app.jwt.sign({ sub: String(usuario.id) });
    return { token, usuario };
  });

  /** Exclui a conta de quem está logado. O corpo { senha } confirma a identidade. */
  app.delete('/auth/conta', { preHandler: autenticarUsuario }, async (request, reply) => {
    const { senha } = excluirContaEntradaSchema.parse(request.body);
    await excluirConta(request.usuario!.id, senha);
    return reply.code(204).send();
  });
}
