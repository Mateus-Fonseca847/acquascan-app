/**
 * Classificação da chuva prevista para as cores da tela de previsão.
 *
 * ATENÇÃO: os limites abaixo são PROVISÓRIOS, escolhidos para o protótipo.
 * Antes de usar com o público, validar com os critérios da Defesa Civil.
 */

export const RISCOS_CHUVA = ['BAIXO', 'MODERADO', 'ALTO', 'MUITO_ALTO'] as const;
export type RiscoChuva = (typeof RISCOS_CHUVA)[number];

/** Limites em mm acumulados no dia. */
export const LIMITES_CHUVA_MM = { moderado: 10, alto: 30, muitoAlto: 50 } as const;

export function classificarChuva(mmNoDia: number): RiscoChuva {
  if (mmNoDia >= LIMITES_CHUVA_MM.muitoAlto) return 'MUITO_ALTO';
  if (mmNoDia >= LIMITES_CHUVA_MM.alto) return 'ALTO';
  if (mmNoDia >= LIMITES_CHUVA_MM.moderado) return 'MODERADO';
  return 'BAIXO';
}
