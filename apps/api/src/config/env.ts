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
  /** Assina e confere o token de login. Mínimo de 32 caracteres. */
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres (veja .env.example)'),
  /** Validade do token: número + s, m, h ou d (ex.: 7d). */
  JWT_EXPIRA_EM: z
    .string()
    .regex(/^\d+[smhd]$/, 'Use um número seguido de s, m, h ou d (ex.: 7d)')
    .default('7d'),
  PREVISAO_LATITUDE: z.coerce.number().default(-22.505),
  PREVISAO_LONGITUDE: z.coerce.number().default(-43.178),
});

const resultado = envSchema.safeParse(process.env);

// O segredo do .env.example é público: serve só para desenvolvimento.
if (
  resultado.success &&
  resultado.data.NODE_ENV === 'production' &&
  resultado.data.JWT_SECRET.startsWith('dev-')
) {
  console.error('JWT_SECRET: troque o segredo de desenvolvimento por um valor aleatório.');
  process.exit(1);
}

if (!resultado.success) {
  console.error('Variáveis de ambiente inválidas:\n' + z.prettifyError(resultado.error));
  process.exit(1);
}

export const env = resultado.data;
