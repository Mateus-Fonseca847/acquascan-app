import type { Alerta, Estado } from '@aquascan/shared';
import type { Estacao } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { processarAlertasPendentes } from '../push/push.service';

/**
 * Registra um alerta quando o estado de uma estação piora.
 *
 * O alerta é gravado com enviadoEm vazio (é a "caixa de saída"). Em seguida o envio das
 * notificações push é disparado SEM esperar: ele nunca pode atrasar nem derrubar quem chamou
 * (o POST /leituras). Se falhar, o alerta continua pendente e a próxima rodada tenta de novo.
 * Ver docs/requisitos.md, RF08.
 */
export async function registrarAlerta(
  estacao: Estacao,
  estadoAnterior: Estado,
  estadoNovo: Estado,
) {
  const alerta = await prisma.alerta.create({
    data: { estacaoId: estacao.id, estadoAnterior, estadoNovo },
  });
  console.info(`[alerta] ${estacao.nome}: ${estadoAnterior} → ${estadoNovo}`);

  // Sem await de propósito. A mensagem do erro é fixa: nada de dados do envio no log.
  processarAlertasPendentes().catch(() => {
    console.error('[push] falha ao processar os alertas pendentes');
  });
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
