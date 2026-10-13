/**
 * Todas as chamadas à API passam por aqui.
 * Os tipos de resposta vêm de @acquascan/shared, os mesmos usados pela API.
 */
import type {
  Alerta,
  CadastroEntrada,
  EstacaoDetalhe,
  EstacaoResumo,
  LeituraResumo,
  PontoApoio,
  PrevisaoDia,
} from '@acquascan/shared';
import { env } from '@/config/env';

export class ErroApi extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function requisitar<T>(caminho: string, init?: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${env.apiUrl}${caminho}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Verifique a internet e tente de novo.');
  }

  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as { erro?: string } | null;
    throw new ErroApi(resposta.status, corpo?.erro ?? `Erro ${resposta.status} no servidor.`);
  }
  return resposta.json() as Promise<T>;
}

export const api = {
  listarEstacoes: () => requisitar<EstacaoResumo[]>('/estacoes'),
  buscarEstacao: (id: number) => requisitar<EstacaoDetalhe>(`/estacoes/${id}`),
  listarLeituras: (id: number, horas = 24) =>
    requisitar<LeituraResumo[]>(`/estacoes/${id}/leituras?horas=${horas}`),
  listarAlertas: () => requisitar<Alerta[]>('/alertas'),
  listarPontosApoio: (coords?: { lat: number; lng: number }) =>
    requisitar<PontoApoio[]>(
      coords ? `/pontos-apoio?lat=${coords.lat}&lng=${coords.lng}` : '/pontos-apoio',
    ),
  buscarPrevisao: () => requisitar<PrevisaoDia[]>('/previsao'),
  cadastrar: (dados: CadastroEntrada) =>
    requisitar<unknown>('/auth/cadastro', { method: 'POST', body: JSON.stringify(dados) }),
};
