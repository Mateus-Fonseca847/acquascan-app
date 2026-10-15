/**
 * Limite de tentativas por rota, com o @fastify/rate-limit (API manual `createRateLimit`).
 *
 * Por que manual: o login precisa de DUAS regras na mesma rota (IP + e-mail, e só IP), e o
 * plugin aceita uma regra por rota. O `preHandler` roda depois do corpo ser lido, o que
 * permite montar a chave com o e-mail. Para o DELETE, ele vem ANTES da autenticação.
 *
 * Privacidade: IP, e-mail e corpo ficam só na chave do contador, na memória. Nada é registrado em log.
 */
import { normalizeIP } from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MENSAGEM_MUITAS_TENTATIVAS } from '../config/limites';
import { ErroHttp } from '../lib/erros';

export interface Regra {
  max: number;
  janelaMs: number;
  /** Identifica quem está sendo contado. */
  chave: (request: FastifyRequest) => string;
}

type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/** IP de quem chamou (já considera o proxy quando TRUST_PROXY está ligado). */
export const chavePorIp = (request: FastifyRequest) => normalizeIP(request.ip);

const emailSchema = z.email();

/** IP + e-mail do corpo (normalizado). Sem e-mail válido, só o IP. */
export function chavePorIpEEmail(request: FastifyRequest): string {
  const ip = chavePorIp(request);
  const corpo = request.body;
  const bruto = corpo && typeof corpo === 'object' ? (corpo as { email?: unknown }).email : null;
  if (typeof bruto !== 'string') return ip;

  const email = bruto.trim().toLowerCase();
  return emailSchema.safeParse(email).success ? `${ip}|${email}` : ip;
}

/**
 * Cria o `preHandler`. Se qualquer regra estourar, responde 429 com Retry-After.
 * Todas as regras contam cada tentativa, inclusive as que dão certo.
 * Com `ativo: false` (só nos testes) não limita nada.
 */
export function limitarTentativas(
  app: FastifyInstance,
  regras: readonly Regra[],
  ativo: boolean,
): PreHandler {
  if (!ativo) return async () => {};

  // Cada limitador tem o próprio contador (store) dentro do plugin.
  const limitadores = regras.map((regra) => ({
    createRateLimit: app.createRateLimit({
      max: regra.max,
      timeWindow: regra.janelaMs,
      keyGenerator: regra.chave,
    }),
  }));

  return async (request, reply) => {
    // Cabeçalhos informativos: os da regra com menos tentativas restantes.
    let informativo: { max: number; remaining: number; ttlInSeconds: number } | null = null;

    for (const { createRateLimit } of limitadores) {
      const resultado = await createRateLimit(request);
      if (resultado.isAllowed) continue;

      if (resultado.isExceeded) {
        reply.header('x-ratelimit-limit', resultado.max);
        reply.header('x-ratelimit-remaining', 0);
        reply.header('x-ratelimit-reset', resultado.ttlInSeconds);
        reply.header('retry-after', resultado.ttlInSeconds);
        throw new ErroHttp(429, MENSAGEM_MUITAS_TENTATIVAS);
      }
      if (!informativo || resultado.remaining < informativo.remaining) informativo = resultado;
    }

    if (informativo) {
      reply.header('x-ratelimit-limit', informativo.max);
      reply.header('x-ratelimit-remaining', informativo.remaining);
      reply.header('x-ratelimit-reset', informativo.ttlInSeconds);
    }
  };
}
