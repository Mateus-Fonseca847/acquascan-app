/**
 * Consulta de CEP na BrasilAPI v2, usada para obter as coordenadas do usuário.
 * Privacidade: nada daqui (CEP, endereço, coordenadas) é registrado em log.
 */

export type ResultadoCep =
  | { status: 'ok'; latitude: number | null; longitude: number | null }
  | { status: 'nao_encontrado' }
  | { status: 'indisponivel' };

const URL_BASE = 'https://brasilapi.com.br/api/cep/v2';
const TIMEOUT_MS = 5000;

/** Converte para número só se for um valor finito dentro do intervalo; vazio e nulo não valem. */
function coordenada(valor: unknown, limite: number): number | null {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null;
  if (typeof valor === 'string' && valor.trim() === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) && Math.abs(numero) <= limite ? numero : null;
}

function extrairCoordenadas(corpo: unknown): { latitude: number | null; longitude: number | null } {
  const coordenadas = (corpo as { location?: { coordinates?: Record<string, unknown> } } | null)
    ?.location?.coordinates;
  const latitude = coordenada(coordenadas?.['latitude'], 90);
  const longitude = coordenada(coordenadas?.['longitude'], 180);
  // Um ponto com só uma das coordenadas não serve para nada.
  return latitude === null || longitude === null
    ? { latitude: null, longitude: null }
    : { latitude, longitude };
}

/** Nunca lança exceção: qualquer falha vira 'indisponivel'. */
export async function consultarCep(cep: string): Promise<ResultadoCep> {
  const digitos = cep.replace(/\D/g, '');
  if (!/^\d{8}$/.test(digitos)) return { status: 'nao_encontrado' };

  try {
    const resposta = await fetch(`${URL_BASE}/${digitos}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (resposta.status === 404) return { status: 'nao_encontrado' };
    if (!resposta.ok) return { status: 'indisponivel' };

    const corpo: unknown = await resposta.json();
    return { status: 'ok', ...extrairCoordenadas(corpo) };
  } catch {
    return { status: 'indisponivel' };
  }
}
