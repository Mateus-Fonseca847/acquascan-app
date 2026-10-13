/**
 * Consultas com TanStack Query: cache, nova tentativa e atualização automática.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

/** As estações enviam uma leitura por minuto; atualizamos no mesmo ritmo. */
const UM_MINUTO = 60_000;

export const useEstacoes = () =>
  useQuery({ queryKey: ['estacoes'], queryFn: api.listarEstacoes, refetchInterval: UM_MINUTO });

export const useEstacao = (id: number) =>
  useQuery({
    queryKey: ['estacoes', id],
    queryFn: () => api.buscarEstacao(id),
    refetchInterval: UM_MINUTO,
  });

export const useLeituras = (id: number, horas = 24) =>
  useQuery({
    queryKey: ['estacoes', id, 'leituras', horas],
    queryFn: () => api.listarLeituras(id, horas),
    refetchInterval: UM_MINUTO,
  });

export const usePontosApoio = () =>
  useQuery({ queryKey: ['pontos-apoio'], queryFn: () => api.listarPontosApoio() });

export const usePrevisao = () =>
  useQuery({ queryKey: ['previsao'], queryFn: api.buscarPrevisao, staleTime: 30 * UM_MINUTO });
