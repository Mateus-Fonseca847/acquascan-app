/**
 * Autenticação do usuário do app.
 *
 * O app envia: Authorization: Bearer <token>
 * O token é o JWT devolvido por POST /auth/login e leva só o id do usuário (`sub`).
 * Privacidade: nem o token nem os dados do usuário vão para o log.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: { id: number; nome: string; email: string };
  }
}

const naoAutenticado = (reply: FastifyReply) =>
  reply.code(401).send({ erro: 'Faça login para continuar' });

export async function autenticarUsuario(request: FastifyRequest, reply: FastifyReply) {
  let sub: string;
  try {
    // Confere a assinatura e a validade; sem cabeçalho, ou com token inválido ou expirado, lança.
    ({ sub } = await request.jwtVerify<{ sub: string }>());
  } catch {
    return naoAutenticado(reply);
  }

  const id = Number(sub);
  if (!Number.isInteger(id) || id <= 0) return naoAutenticado(reply);

  // Busca de novo a cada requisição: uma conta apagada perde o acesso na hora.
  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: { id: true, nome: true, email: true },
  });
  if (!usuario) return naoAutenticado(reply);

  request.usuario = usuario;
}
