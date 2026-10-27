/**
 * Regras puras da API e da sessão (sem rede, sem armazenamento, sem React).
 * Ficam isoladas aqui para poderem ser testadas quando o app ganhar um runner de testes.
 */
import type { Perfil } from '@aquascan/shared';

export const MENSAGEM_SEM_CONEXAO = 'Sem conexão. Verifique sua internet e tente de novo.';
export const AVISO_SESSAO_EXPIROU = 'Sua sessão expirou. Entre de novo.';
export const AVISO_CONTA_CRIADA = 'Conta criada. Entre com seu e-mail e senha.';

/** Erro de uma chamada à API. `status` é 0 quando faltou rede ou o tempo esgotou. */
export class ErroApi extends Error {
  constructor(
    public readonly status: number,
    public readonly mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

/** Falha de rede ou tempo esgotado: não houve resposta do servidor. */
export function erroDeRede(): ErroApi {
  return new ErroApi(0, MENSAGEM_SEM_CONEXAO);
}

/** Erro devolvido pelo servidor: usa o campo `erro` da resposta quando existir. */
export function erroDeResposta(status: number, corpo: unknown): ErroApi {
  const erro =
    typeof corpo === 'object' && corpo !== null && 'erro' in corpo
      ? (corpo as { erro: unknown }).erro
      : undefined;
  if (typeof erro === 'string' && erro.trim() !== '') return new ErroApi(status, erro);
  return new ErroApi(status, `Erro ${status} no servidor. Tente de novo em instantes.`);
}

/**
 * A sessão só expira quando uma chamada AUTENTICADA devolve 401.
 * Nunca em 403 (senha errada na exclusão da conta) nem em falha de rede (status 0).
 */
export function deveExpirarSessao(autenticada: boolean, status: number): boolean {
  return autenticada && status === 401;
}

export type EstadoSessao = 'carregando' | 'logado' | 'visitante' | 'novo';

/** Resultado de GET /usuarios/me na abertura do app. */
export type ResultadoPerfil = { ok: true; usuario: Perfil } | { ok: false; status: number };

export interface EntradaEstadoInicial {
  token: string | null;
  boasVindasVistas: boolean;
  /** Só é usado quando há token. */
  perfil: ResultadoPerfil | null;
  /** Último perfil guardado no aparelho, para quando não der para validar a sessão. */
  usuarioEmCache: Perfil | null;
}

export interface DecisaoEstadoInicial {
  estado: Exclude<EstadoSessao, 'carregando'>;
  usuario: Perfil | null;
  apagarSessao: boolean;
  aviso: string | null;
}

/**
 * Decide o estado ao abrir o app.
 * - sem token: "visitante" se já escolheu antes, senão "novo";
 * - token válido (200): "logado";
 * - token recusado (401): apaga a sessão e vira "visitante" com aviso;
 * - qualquer outra falha (sem internet, servidor fora do ar): continua "logado" com o cache.
 */
export function decidirEstadoInicial(entrada: EntradaEstadoInicial): DecisaoEstadoInicial {
  if (!entrada.token) {
    return {
      estado: entrada.boasVindasVistas ? 'visitante' : 'novo',
      usuario: null,
      apagarSessao: false,
      aviso: null,
    };
  }
  if (entrada.perfil?.ok) {
    return { estado: 'logado', usuario: entrada.perfil.usuario, apagarSessao: false, aviso: null };
  }
  if (entrada.perfil && entrada.perfil.status === 401) {
    return { estado: 'visitante', usuario: null, apagarSessao: true, aviso: AVISO_SESSAO_EXPIROU };
  }
  return { estado: 'logado', usuario: entrada.usuarioEmCache, apagarSessao: false, aviso: null };
}

/** Confere o mínimo do que foi lido do armazenamento antes de tratá-lo como Perfil. */
export function ehPerfil(valor: unknown): valor is Perfil {
  if (typeof valor !== 'object' || valor === null) return false;
  const v = valor as Record<string, unknown>;
  const cidade = v.cidade as Record<string, unknown> | null | undefined;
  return (
    typeof v.id === 'number' &&
    typeof v.nome === 'string' &&
    typeof v.email === 'string' &&
    typeof cidade === 'object' &&
    cidade !== null &&
    typeof cidade.nome === 'string'
  );
}
