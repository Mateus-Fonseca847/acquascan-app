/**
 * Variáveis de ambiente validadas na inicialização.
 * Se faltar algo, a API para logo ao iniciar, com uma mensagem clara,
 * em vez de falhar mais tarde no meio de uma requisição.
 */
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().min(1, 'Defina DATABASE_URL no arquivo .env (veja .env.example)'),
  PREVISAO_LATITUDE: z.coerce.number().default(-22.505),
  PREVISAO_LONGITUDE: z.coerce.number().default(-43.178),
});

const resultado = envSchema.safeParse(process.env);

if (!resultado.success) {
  console.error('Variáveis de ambiente inválidas:\n' + z.prettifyError(resultado.error));
  process.exit(1);
}

export const env = resultado.data;
