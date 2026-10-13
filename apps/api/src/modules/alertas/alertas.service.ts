import type { Alerta, Estado } from '@acquascan/shared';
import type { Estacao } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Registra um alerta quando o estado de uma estação piora.
 *
 * TODO(v0.4.0): enviar notificação push aos usuários da região da estação
 * (Expo Push Service) e preencher "enviadoEm". Ver docs/requisitos.md, RF08.
 */
export async function registrarAlerta(
  estacao: Estacao,
  estadoAnterior: Estado,
  estadoNovo: Estado,
) {
  const alerta = await prisma.alerta.create({
    data: { estacaoId: estacao.id, estadoAnterior, estadoNovo },
  });
  console.info(
    `[alerta] ${estacao.nome}: ${estadoAnterior} → ${estadoNovo} (push ainda não implementado)`,
  );
  return alerta;
}

export async function listarAlertasRecentes(horas: number): Promise<Alerta[]> {
  const alertas = await prisma.alerta.findMany({
    where: { criadoEm: { gte: new Date(Date.now() - horas * 3_600_000) } },
    include: { estacao: true },
    orderBy: { criadoEm: 'desc' },
    take: 100,
  });
  return alertas.map((a) => ({
    id: a.id,
    estacaoId: a.estacaoId,
    estacao: a.estacao.nome,
    estadoAnterior: a.estadoAnterior,
    estadoNovo: a.estadoNovo,
    criadoEm: a.criadoEm.toISOString(),
  }));
}
