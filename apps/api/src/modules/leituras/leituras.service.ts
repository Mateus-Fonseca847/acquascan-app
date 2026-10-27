import { avaliarLeitura, estadoPiorou, type LeituraEntrada } from '@aquascan/shared';
import type { Estacao } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { registrarAlerta } from '../alertas/alertas.service';

/**
 * Recebe a leitura bruta do ESP32, calcula nível e estado e salva.
 * Se o estado piorou em relação à leitura anterior, registra um alerta.
 */
export async function registrarLeitura(estacao: Estacao, entrada: LeituraEntrada) {
  const { nivelCm, nivelPct, estado } = avaliarLeitura(entrada.distanciaCm, estacao);

  const anterior = await prisma.leitura.findFirst({
    where: { estacaoId: estacao.id },
    orderBy: { medidoEm: 'desc' },
    select: { estado: true },
  });

  const leitura = await prisma.leitura.create({
    data: {
      estacaoId: estacao.id,
      distanciaCm: entrada.distanciaCm,
      vazaoLpm: entrada.vazaoLpm ?? null,
      nivelCm,
      nivelPct,
      estado,
      medidoEm: entrada.medidoEm ? new Date(entrada.medidoEm) : new Date(),
    },
  });

  const estadoAnterior = anterior?.estado ?? 'ESTAVEL';
  if (estadoPiorou(estadoAnterior, estado)) {
    await registrarAlerta(estacao, estadoAnterior, estado);
  }

  return { id: leitura.id, nivelCm, nivelPct, estado };
}
