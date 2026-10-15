/**
 * Monta a aplicação Fastify (sem iniciar o servidor).
 * Separado de server.ts para que os testes possam criar a app sem abrir porta.
 */
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { env } from './config/env';
import { ErroHttp } from './lib/erros';
import { serializarRequisicao } from './lib/log';
import { alertasRoutes } from './modules/alertas/alertas.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { cidadesRoutes } from './modules/cidades/cidades.routes';
import { estacoesRoutes } from './modules/estacoes/estacoes.routes';
import { leiturasRoutes } from './modules/leituras/leituras.routes';
import { pontosApoioRoutes } from './modules/pontos-apoio/pontos-apoio.routes';
import { pushTokensRoutes } from './modules/push-tokens/push-tokens.routes';
import { previsaoRoutes } from './modules/previsao/previsao.routes';
import { riosRoutes } from './modules/rios/rios.routes';
import { ruasRoutes } from './modules/ruas/ruas.routes';
import { saudeRoutes } from './modules/saude/saude.routes';
import { usuariosRoutes } from './modules/usuarios/usuarios.routes';

export interface OpcoesApp {
  logger?: boolean;
  /**
   * Liga o limite de tentativas das rotas de conta. Por padrão fica ligado, menos quando
   * NODE_ENV=test: os testes fazem muitas requisições do mesmo IP. Os testes do limite
   * passam `true` de propósito.
   */
  limitarTentativas?: boolean;
  /** Para onde vai o log. Só os testes usam, para conferir que nada sigiloso é registrado. */
  saidaLog?: NodeJS.WritableStream;
}

export function construirApp(opcoes: OpcoesApp = {}) {
  const app = Fastify({
    // Log sem IP, host nem query string (ver lib/log.ts).
    logger:
      (opcoes.logger ?? true)
        ? {
            serializers: { req: serializarRequisicao },
            ...(opcoes.saidaLog ? { stream: opcoes.saidaLog } : {}),
          }
        : false,
    // O Fastify aceita também um número (de proxies confiáveis), mas os tipos dele não o listam.
    trustProxy: env.TRUST_PROXY as boolean | string,
  });
  const limitar = opcoes.limitarTentativas ?? env.NODE_ENV !== 'test';

  app.setErrorHandler((erro, _request, reply) => {
    if (erro instanceof ZodError) {
      return reply.code(400).send({ erro: 'Dados inválidos', detalhes: erro.issues });
    }
    if (erro instanceof ErroHttp) {
      return reply.code(erro.status).send({ erro: erro.message });
    }
    // Erros do próprio Fastify causados pelo cliente (JSON malformado, corpo vazio, tipo
    // de conteúdo errado). A mensagem é fixa porque a original pode citar trechos do corpo.
    if (
      erro instanceof Error &&
      'statusCode' in erro &&
      typeof erro.statusCode === 'number' &&
      erro.statusCode >= 400 &&
      erro.statusCode < 500
    ) {
      return reply.code(erro.statusCode).send({ erro: 'Requisição inválida' });
    }
    app.log.error(erro);
    return reply.code(500).send({ erro: 'Erro interno do servidor' });
  });

  app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { algorithm: 'HS256', expiresIn: env.JWT_EXPIRA_EM },
    verify: { algorithms: ['HS256'] },
  });

  // global: false = nada é limitado automaticamente; cada rota escolhe suas regras.
  app.register(fastifyRateLimit, { global: false });

  app.register(saudeRoutes);
  app.register(authRoutes, { limitar });
  app.register(usuariosRoutes);
  app.register(pushTokensRoutes);
  app.register(cidadesRoutes);
  app.register(riosRoutes);
  app.register(estacoesRoutes);
  app.register(leiturasRoutes);
  app.register(alertasRoutes);
  app.register(ruasRoutes);
  app.register(pontosApoioRoutes);
  app.register(previsaoRoutes);

  return app;
}
