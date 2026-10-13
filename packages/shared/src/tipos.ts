/**
 * Formato das respostas da API (o "contrato" entre API e app).
 * Datas trafegam como texto ISO 8601.
 */
import type { RiscoChuva } from './chuva';
import type { Estado } from './estado';

export interface LeituraResumo {
  nivelCm: number;
  nivelPct: number;
  estado: Estado;
  vazaoLpm: number | null;
  medidoEm: string;
}

export interface EstacaoResumo {
  id: number;
  nome: string;
  rio: string;
  latitude: number;
  longitude: number;
  ultimaLeitura: LeituraResumo | null;
}

export interface EstacaoDetalhe extends EstacaoResumo {
  nivelTransbordamentoCm: number;
  limiteAtencaoPct: number;
  limiteCriticoPct: number;
  /** null quando o rio não está subindo. */
  estimativaMinutosAteTransbordar: number | null;
}

export interface Rio {
  id: number;
  nome: string;
  estacoes: EstacaoResumo[];
}

export interface PontoApoio {
  id: number;
  nome: string;
  endereco: string;
  capacidade: number;
  contato: string | null;
  latitude: number;
  longitude: number;
  /** Presente quando a consulta informa a localização do usuário. */
  distanciaM?: number;
}

export interface PrevisaoDia {
  data: string;
  chuvaMm: number;
  probabilidadeChuvaPct: number | null;
  temperaturaMinC: number;
  temperaturaMaxC: number;
  risco: RiscoChuva;
}

export interface Alerta {
  id: number;
  estacaoId: number;
  estacao: string;
  estadoAnterior: Estado;
  estadoNovo: Estado;
  criadoEm: string;
}

export interface ErroApi {
  erro: string;
  detalhes?: unknown;
}
