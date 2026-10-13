/**
 * Como cada estado do rio e cada risco de chuva aparecem na tela.
 * Regra de acessibilidade: nunca só a cor. Sempre cor + ícone + texto.
 */
import type { Estado, RiscoChuva } from '@acquascan/shared';

interface Aparencia {
  cor: string;
  icone: string;
  rotulo: string;
}

export const aparenciaEstado: Record<Estado, Aparencia> = {
  ESTAVEL: { cor: '#1E7B34', icone: '✓', rotulo: 'Estável' },
  ATENCAO: { cor: '#9A5B00', icone: '!', rotulo: 'Atenção' },
  CRITICO: { cor: '#B3261E', icone: '▲', rotulo: 'Crítico' },
};

export const aparenciaChuva: Record<RiscoChuva, Aparencia> = {
  BAIXO: { cor: '#1E7B34', icone: '✓', rotulo: 'Chuva fraca' },
  MODERADO: { cor: '#9A5B00', icone: '!', rotulo: 'Chuva moderada' },
  ALTO: { cor: '#B3261E', icone: '▲', rotulo: 'Chuva forte' },
  MUITO_ALTO: { cor: '#7A1712', icone: '▲', rotulo: 'Chuva muito forte' },
};

/** Para estações ainda sem leitura. */
export const aparenciaSemDados: Aparencia = { cor: '#46607A', icone: '?', rotulo: 'Sem dados' };
