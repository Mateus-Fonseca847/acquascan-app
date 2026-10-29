/**
 * Todas as chamadas à API passam por aqui.
 * Os tipos de resposta vêm de @aquascan/shared, os mesmos usados pela API.
 */
import type {
  Alerta,
  CadastroEntrada,
  CadastroResposta,
  Cidade,
  EstacaoDetalhe,
  EstacaoResumo,
  LeituraResumo,
  LoginEntrada,
  LoginResposta,
  Perfil,
  PontoApoio,
} from '@aquascan/shared';
import { lerPrevisao } from '@aquascan/shared';
import { env } from '@/config/env';
import { deveExpirarSessao, ErroApi, erroDeResposta } from './regras';

export { ErroApi } from './regras';

const TEMPO_LIMITE_MS = 10_000;

/** Token da sessão em memória; o provedor de sessão é quem o define. */
let tokenAtual: string | null = null;
let aoSessaoExpirar: (() => void) | null = null;

export function definirToken(token: string | null) {
  tokenAtual = token;
}

/** Registrado pelo provedor de sessão. Chamado só quando uma chamada autenticada recebe 401. */
export function definirAoSessaoExpirar(gancho: (() => void) | null) {
  aoSessaoExpirar = gancho;
}

interface Opcoes {
  metodo?: 'GET' | 'POST' | 'DELETE';
  corpo?: unknown;
  /** Envia o token da sessão e trata 401 como sessão expirada. */
  autenticada?: boolean;
}

async function requisitar<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { metodo = 'GET', corpo, autenticada = false } = opcoes;
  const tokenDaChamada = autenticada ? tokenAtual : null;

  const headers: Record<string, string> = {};
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (tokenDaChamada) headers.Authorization = `Bearer ${tokenDaChamada}`;

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS);

  let resposta: Response;
  try {
    resposta = await fetch(`${env.apiUrl}${caminho}`, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: controlador.signal,
    });
  } catch (erro) {
    const estourou = erro instanceof Error && erro.name === 'AbortError';
    throw new ErroApi(
      0,
      estourou
        ? 'O servidor demorou demais para responder. Confira se o celular e o computador estão na mesma rede Wi-Fi e tente de novo.'
        : 'Sem conexão com o servidor. Verifique a internet e tente de novo.',
    );
  } finally {
    clearTimeout(temporizador);
  }

  if (!resposta.ok) {
    const corpoErro: unknown = await resposta.json().catch(() => null);
    // Ignora a resposta tardia de uma sessão que já foi trocada ou encerrada.
    if (deveExpirarSessao(autenticada, resposta.status) && tokenDaChamada === tokenAtual) {
      aoSessaoExpirar?.();
    }
    throw erroDeResposta(resposta.status, corpoErro);
  }
  if (resposta.status === 204) return undefined as T;
  try {
    return (await resposta.json()) as T;
  } catch {
    throw erroDeResposta(resposta.status, null);
  }
}

export const api = {
  listarCidades: () => requisitar<Cidade[]>('/cidades'),
  listarEstacoes: () => requisitar<EstacaoResumo[]>('/estacoes'),
  buscarEstacao: (id: number) => requisitar<EstacaoDetalhe>(`/estacoes/${id}`),
  listarLeituras: (id: number, horas = 24) =>
    requisitar<LeituraResumo[]>(`/estacoes/${id}/leituras?horas=${horas}`),
  listarAlertas: () => requisitar<Alerta[]>('/alertas'),
  listarPontosApoio: (coords?: { lat: number; lng: number }) =>
    requisitar<PontoApoio[]>(
      coords ? `/pontos-apoio?lat=${coords.lat}&lng=${coords.lng}` : '/pontos-apoio',
    ),
  /**
   * Aceita as duas formas da resposta (lista de dias de hoje e `{ atual, dias }` do C4): ver `lerPrevisao`.
   * Formato desconhecido vira erro em português, que a tela mostra com "Tentar de novo".
   */
  buscarPrevisao: async () => lerPrevisao(await requisitar<unknown>('/previsao')),
  cadastrar: (dados: CadastroEntrada) =>
    requisitar<CadastroResposta>('/auth/cadastro', { metodo: 'POST', corpo: dados }),
  entrar: (dados: LoginEntrada) =>
    requisitar<LoginResposta>('/auth/login', { metodo: 'POST', corpo: dados }),
  perfil: () => requisitar<Perfil>('/usuarios/me', { autenticada: true }),
  excluirConta: (senha: string) =>
    requisitar<void>('/auth/conta', { metodo: 'DELETE', corpo: { senha }, autenticada: true }),
};
