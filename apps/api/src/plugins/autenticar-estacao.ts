/**
 * Autenticação das estações (ESP32).
 *
 * Cada estação envia: Authorization: Bearer <token>
 * Comparamos o hash do token com o salvo no banco.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Estacao } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { hashToken } from '../lib/token';

declare module 'fastify' {
  interface FastifyRequest {
    estacao?: Estacao;
  }
}

export async function autenticarEstacao(request: FastifyRequest, reply: FastifyReply) {
  const cabecalho = request.headers.authorization;
  const token = cabecalho?.startsWith('Bearer ') ? cabecalho.slice(7).trim() : null;

  if (!token) {
    return reply.code(401).send({ erro: 'Envie o token da estação no cabeçalho Authorization' });
  }

  const estacao = await prisma.estacao.findUnique({ where: { tokenHash: hashToken(token) } });

  if (!estacao || !estacao.ativa) {
    return reply.code(401).send({ erro: 'Token de estação inválido ou estação desativada' });
  }

  request.estacao = estacao;
}
