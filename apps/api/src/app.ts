/**
 * Monta a aplicação Fastify (sem iniciar o servidor).
 * Separado de server.ts para que os testes possam criar a app sem abrir porta.
 */
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { ErroHttp } from './lib/erros';
import { alertasRoutes } from './modules/alertas/alertas.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { estacoesRoutes } from './modules/estacoes/estacoes.routes';
import { leiturasRoutes } from './modules/leituras/leituras.routes';
import { pontosApoioRoutes } from './modules/pontos-apoio/pontos-apoio.routes';
import { previsaoRoutes } from './modules/previsao/previsao.routes';
import { riosRoutes } from './modules/rios/rios.routes';
import { ruasRoutes } from './modules/ruas/ruas.routes';
import { saudeRoutes } from './modules/saude/saude.routes';

export function construirApp(opcoes: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opcoes.logger ?? true });

  app.setErrorHandler((erro, _request, reply) => {
    if (erro instanceof ZodError) {
      return reply.code(400).send({ erro: 'Dados inválidos', detalhes: erro.issues });
    }
    if (erro instanceof ErroHttp) {
      return reply.code(erro.status).send({ erro: erro.message });
    }
    app.log.error(erro);
    return reply.code(500).send({ erro: 'Erro interno do servidor' });
  });

  app.register(saudeRoutes);
  app.register(authRoutes);
  app.register(riosRoutes);
  app.register(estacoesRoutes);
  app.register(leiturasRoutes);
  app.register(alertasRoutes);
  app.register(ruasRoutes);
  app.register(pontosApoioRoutes);
  app.register(previsaoRoutes);

  return app;
}
