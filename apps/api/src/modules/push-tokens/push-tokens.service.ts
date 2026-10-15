import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';

/** Quantos aparelhos (tokens) cada usuário pode ter. Passou disso, saem os mais antigos. */
export const MAX_TOKENS_POR_USUARIO = 10;

/**
 * Registra o token de push do aparelho para o usuário.
 *
 * - O token é único no banco. Se já existir, de qualquer usuário, passa a ser do usuário
 *   atual (o aparelho mudou de dono, por exemplo quando outra pessoa entra no mesmo celular).
 * - Registrar o mesmo token de novo só atualiza `atualizadoEm` (idempotente).
 * - Se o usuário passar de 10 tokens, os mais antigos (por `atualizadoEm`) são apagados.
 *   Tudo na mesma transação.
 *
 * Privacidade: o token nunca vai para log, resposta ou mensagem de erro. Os erros inesperados
 * do banco são trocados por uma mensagem genérica (a do Prisma pode citar os dados enviados).
 */
export async function registrarPushToken(usuarioId: number, token: string): Promise<void> {
  // Duas tentativas: se dois pedidos registrarem o mesmo token ao mesmo tempo, um deles leva
  // P2002 (token único) no create; na segunda tentativa o token já existe e vira um update.
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.pushToken.upsert({
          where: { token },
          update: { usuarioId, atualizadoEm: new Date() },
          create: { usuarioId, token },
        });

        const manter = await tx.pushToken.findMany({
          where: { usuarioId },
          orderBy: [{ atualizadoEm: 'desc' }, { id: 'desc' }],
          take: MAX_TOKENS_POR_USUARIO,
          select: { id: true },
        });
        await tx.pushToken.deleteMany({
          where: { usuarioId, id: { notIn: manter.map((linha) => linha.id) } },
        });
      });
      return;
    } catch (erro) {
      const corrida = erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
      if (corrida && tentativa < 2) continue;
      throw new Error('Falha ao registrar o token de notificação');
    }
  }
}

/**
 * Remove o token, mas só se ele for do usuário. Token inexistente ou de outro usuário dá o
 * mesmo resultado (nada acontece, sem erro), para não revelar de quem é cada token.
 */
export async function removerPushToken(usuarioId: number, token: string): Promise<void> {
  try {
    await prisma.pushToken.deleteMany({ where: { usuarioId, token } });
  } catch {
    throw new Error('Falha ao remover o token de notificação');
  }
}
