import { estimarMinutosAteTransbordar, type EstacaoDetalhe } from '@acquascan/shared';
import { prisma } from '../../lib/prisma';
import { naoEncontrado } from '../../lib/erros';
import { paraEstacaoResumo, paraLeituraResumo } from './estacoes.mapper';

/** Janela usada para estimar a velocidade de subida do rio. */
const JANELA_ESTIMATIVA_MIN = 30;

const comUltimaLeitura = {
  rio: true,
  leituras: { orderBy: { medidoEm: 'desc' as const }, take: 1 },
};

export async function listarEstacoes() {
  const estacoes = await prisma.estacao.findMany({
    where: { ativa: true },
    include: comUltimaLeitura,
    orderBy: { nome: 'asc' },
  });
  return estacoes.map(paraEstacaoResumo);
}

export async function buscarEstacao(id: number): Promise<EstacaoDetalhe> {
  const estacao = await prisma.estacao.findFirst({
    where: { id, ativa: true },
    include: comUltimaLeitura,
  });
  if (!estacao) throw naoEncontrado('Estação');

  const desde = new Date(Date.now() - JANELA_ESTIMATIVA_MIN * 60_000);
  const recentes = await prisma.leitura.findMany({
    where: { estacaoId: id, medidoEm: { gte: desde } },
    select: { nivelCm: true, medidoEm: true },
  });

  return {
    ...paraEstacaoResumo(estacao),
    nivelTransbordamentoCm: estacao.nivelTransbordamentoCm,
    limiteAtencaoPct: estacao.limiteAtencaoPct,
    limiteCriticoPct: estacao.limiteCriticoPct,
    estimativaMinutosAteTransbordar: estimarMinutosAteTransbordar(
      recentes,
      estacao.nivelTransbordamentoCm,
    ),
  };
}

export async function listarHistorico(id: number, horas: number) {
  const existe = await prisma.estacao.count({ where: { id } });
  if (!existe) throw naoEncontrado('Estação');

  const desde = new Date(Date.now() - horas * 3_600_000);
  const leituras = await prisma.leitura.findMany({
    where: { estacaoId: id, medidoEm: { gte: desde } },
    orderBy: { medidoEm: 'asc' },
    take: 2000,
  });
  return leituras.map(paraLeituraResumo);
}
