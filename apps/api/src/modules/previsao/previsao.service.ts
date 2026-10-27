/**
 * Previsão do tempo dos próximos 7 dias, via Open-Meteo (gratuito, sem chave).
 * https://open-meteo.com/en/docs
 */
import { classificarChuva, type PrevisaoDia } from '@aquascan/shared';
import { z } from 'zod';
import { env } from '../../config/env';
import { ErroHttp } from '../../lib/erros';

const CACHE_MS = 30 * 60_000;
let cache: { dados: PrevisaoDia[]; expiraEm: number } | null = null;

const respostaOpenMeteo = z.object({
  daily: z.object({
    time: z.array(z.string()),
    precipitation_sum: z.array(z.number().nullable()),
    precipitation_probability_max: z.array(z.number().nullable()),
    temperature_2m_min: z.array(z.number().nullable()),
    temperature_2m_max: z.array(z.number().nullable()),
  }),
});

export async function buscarPrevisao(): Promise<PrevisaoDia[]> {
  if (cache && cache.expiraEm > Date.now()) return cache.dados;

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(env.PREVISAO_LATITUDE),
    longitude: String(env.PREVISAO_LONGITUDE),
    daily: 'precipitation_sum,precipitation_probability_max,temperature_2m_min,temperature_2m_max',
    timezone: 'America/Sao_Paulo',
    forecast_days: '7',
  }).toString();

  const indisponivel = new ErroHttp(
    502,
    'Serviço de previsão do tempo indisponível. Tente de novo em alguns minutos.',
  );

  let resposta: Response;
  try {
    resposta = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw indisponivel; // sem internet ou tempo esgotado
  }
  if (!resposta.ok) throw indisponivel;

  const { daily } = respostaOpenMeteo.parse(await resposta.json());

  const dados = daily.time.map((data, i) => {
    const chuvaMm = daily.precipitation_sum[i] ?? 0;
    return {
      data,
      chuvaMm,
      probabilidadeChuvaPct: daily.precipitation_probability_max[i] ?? null,
      temperaturaMinC: daily.temperature_2m_min[i] ?? 0,
      temperaturaMaxC: daily.temperature_2m_max[i] ?? 0,
      risco: classificarChuva(chuvaMm),
    };
  });

  cache = { dados, expiraEm: Date.now() + CACHE_MS };
  return dados;
}
