/** Converte registros do banco para o formato de resposta da API (@aquascan/shared). */
import type { EstacaoResumo, LeituraResumo } from '@aquascan/shared';
import type { Estacao, Leitura, Rio } from '../../generated/prisma/client';

export function paraLeituraResumo(leitura: Leitura): LeituraResumo {
  return {
    nivelCm: leitura.nivelCm,
    nivelPct: leitura.nivelPct,
    estado: leitura.estado,
    vazaoLpm: leitura.vazaoLpm,
    medidoEm: leitura.medidoEm.toISOString(),
  };
}

export function paraEstacaoResumo(
  estacao: Estacao & { rio: Rio; leituras: Leitura[] },
): EstacaoResumo {
  const ultima = estacao.leituras[0];
  return {
    id: estacao.id,
    nome: estacao.nome,
    rio: estacao.rio.nome,
    latitude: estacao.latitude,
    longitude: estacao.longitude,
    ultimaLeitura: ultima ? paraLeituraResumo(ultima) : null,
  };
}
