/**
 * Regras de nível e estado dos rios.
 *
 * Ficam neste pacote para que a API (que calcula e salva) e o app (que exibe)
 * usem exatamente a mesma lógica. Documentação: docs/arquitetura.md
 */

export const ESTADOS = ['ESTAVEL', 'ATENCAO', 'CRITICO'] as const;
export type Estado = (typeof ESTADOS)[number];

/** Parâmetros medidos no local de instalação de cada estação. */
export interface ConfigEstacao {
  /** Distância entre o sensor e o fundo do rio, em cm. */
  alturaInstalacaoCm: number;
  /** Nível (a partir do fundo) em que o rio transborda, em cm. */
  nivelTransbordamentoCm: number;
  /** A partir deste percentual o estado é ATENCAO. */
  limiteAtencaoPct: number;
  /** A partir deste percentual o estado é CRITICO. */
  limiteCriticoPct: number;
}

/**
 * O sensor ultrassônico mede a distância até a superfície da água.
 * Quanto menor a distância, mais alto está o rio.
 */
export function calcularNivelCm(distanciaCm: number, alturaInstalacaoCm: number): number {
  return Math.max(0, Math.round((alturaInstalacaoCm - distanciaCm) * 10) / 10);
}

/** Pode passar de 100%: significa que o rio já transbordou. */
export function calcularNivelPct(nivelCm: number, nivelTransbordamentoCm: number): number {
  if (nivelTransbordamentoCm <= 0) {
    throw new Error('nivelTransbordamentoCm deve ser maior que zero');
  }
  return Math.round((nivelCm / nivelTransbordamentoCm) * 1000) / 10;
}

export function classificarEstado(
  nivelPct: number,
  limites: Pick<ConfigEstacao, 'limiteAtencaoPct' | 'limiteCriticoPct'>,
): Estado {
  if (nivelPct >= limites.limiteCriticoPct) return 'CRITICO';
  if (nivelPct >= limites.limiteAtencaoPct) return 'ATENCAO';
  return 'ESTAVEL';
}

/** Junta as três funções acima: da distância medida até o estado. */
export function avaliarLeitura(distanciaCm: number, config: ConfigEstacao) {
  const nivelCm = calcularNivelCm(distanciaCm, config.alturaInstalacaoCm);
  const nivelPct = calcularNivelPct(nivelCm, config.nivelTransbordamentoCm);
  const estado = classificarEstado(nivelPct, config);
  return { nivelCm, nivelPct, estado };
}

const GRAVIDADE: Record<Estado, number> = { ESTAVEL: 0, ATENCAO: 1, CRITICO: 2 };

/** true quando o estado novo é mais grave que o anterior (dispara alerta). */
export function estadoPiorou(anterior: Estado, novo: Estado): boolean {
  return GRAVIDADE[novo] > GRAVIDADE[anterior];
}

export interface PontoNivel {
  nivelCm: number;
  medidoEm: Date;
}

/**
 * ESTIMATIVA de minutos até o transbordamento, supondo que o rio continue
 * subindo no mesmo ritmo das leituras recebidas. Não é uma previsão:
 * se a chuva mudar, a estimativa muda.
 *
 * Retorna 0 se já transbordou e null se o rio não está subindo
 * ou se não há leituras suficientes.
 */
export function estimarMinutosAteTransbordar(
  leituras: PontoNivel[],
  nivelTransbordamentoCm: number,
): number | null {
  if (leituras.length < 2) return null;

  const ordenadas = [...leituras].sort((a, b) => a.medidoEm.getTime() - b.medidoEm.getTime());
  const primeira = ordenadas[0]!;
  const ultima = ordenadas[ordenadas.length - 1]!;

  if (ultima.nivelCm >= nivelTransbordamentoCm) return 0;

  const minutos = (ultima.medidoEm.getTime() - primeira.medidoEm.getTime()) / 60_000;
  if (minutos <= 0) return null;

  const velocidadeCmPorMin = (ultima.nivelCm - primeira.nivelCm) / minutos;
  if (velocidadeCmPorMin <= 0) return null;

  return Math.round((nivelTransbordamentoCm - ultima.nivelCm) / velocidadeCmPorMin);
}

/** O firmware mede em L/min; o app exibe em L/s. */
export function lpmParaLps(vazaoLpm: number): number {
  return Math.round((vazaoLpm / 60) * 100) / 100;
}
