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

export interface Cidade {
  id: number;
  nome: string;
  /** Sigla do estado, 2 letras (ex.: RJ). */
  uf: string;
  /** Centro da cidade. */
  latitude: number;
  longitude: number;
}

/** Dados do próprio usuário (GET /usuarios/me). Nunca inclui a senha. */
export interface Perfil {
  id: number;
  nome: string;
  email: string;
  consentimentoEm: string;
  criadoEm: string;
  cidade: Cidade;
}

/** Resumo do usuário devolvido no cadastro e no login. */
export interface UsuarioResumo {
  id: number;
  nome: string;
  email: string;
}

/** Resposta de POST /auth/login. */
export interface LoginResposta {
  token: string;
  usuario: UsuarioResumo;
}

/** Resposta de POST /auth/cadastro (201). Não traz token: o app entra em seguida com o login. */
export type CadastroResposta = UsuarioResumo;

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
