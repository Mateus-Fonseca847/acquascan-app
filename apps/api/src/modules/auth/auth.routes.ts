import {
  cadastroEntradaSchema,
  excluirContaEntradaSchema,
  loginEntradaSchema,
} from '@acquascan/shared';
import type { FastifyInstance } from 'fastify';
import { limites } from '../../config/limites';
import { autenticarUsuario } from '../../plugins/autenticar-usuario';
import { chavePorIp, chavePorIpEEmail, limitarTentativas } from '../../plugins/limitar-tentativas';
import { autenticarCredenciais, cadastrarUsuario, excluirConta } from './auth.service';

/**
 * Cadastro, login e exclusão da conta.
 * Ver docs/requisitos.md, RF01, RF02 e RNF02, e docs/privacidade.md.
 */
export async function authRoutes(app: FastifyInstance, opcoes: { limitar: boolean }) {
  const { limitar } = opcoes;

  const limiteCadastro = limitarTentativas(
    app,
    [{ ...limites.cadastroPorIp, chave: chavePorIp }],
    limitar,
  );
  const limiteLogin = limitarTentativas(
    app,
    [
      { ...limites.loginPorIpEEmail, chave: chavePorIpEEmail },
      { ...limites.loginPorIp, chave: chavePorIp },
    ],
    limitar,
  );
  const limiteExclusao = limitarTentativas(
    app,
    [{ ...limites.exclusaoPorIp, chave: chavePorIp }],
    limitar,
  );

  app.post('/auth/cadastro', { preHandler: limiteCadastro }, async (request, reply) => {
    const entrada = cadastroEntradaSchema.parse(request.body);
    const usuario = await cadastrarUsuario(entrada);
    return reply.code(201).send(usuario);
  });

  app.post('/auth/login', { preHandler: limiteLogin }, async (request) => {
    const entrada = loginEntradaSchema.parse(request.body);
    const usuario = await autenticarCredenciais(entrada);
    // O token leva só o id (sub): nada de e-mail ou nome.
    const token = app.jwt.sign({ sub: String(usuario.id) });
    return { token, usuario };
  });

  /** Exclui a conta de quem está logado. O corpo { senha } confirma a identidade. */
  app.delete(
    '/auth/conta',
    { preHandler: [limiteExclusao, autenticarUsuario] },
    async (request, reply) => {
      const { senha } = excluirContaEntradaSchema.parse(request.body);
      await excluirConta(request.usuario!.id, senha);
      return reply.code(204).send();
    },
  );
}
