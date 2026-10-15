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
  /**
   * Atrás de um proxy (nginx, Render, Railway...) ligue esta variável: sem ela todos os usuários
   * parecem ter o IP do proxy e compartilham o mesmo limite de tentativas. Aceita true, false,
   * um número de proxies à frente da API (ex.: 1) ou uma lista de IPs/CIDR confiáveis.
   */
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((valor): boolean | number | string => {
      const texto = valor.trim();
      if (texto === 'true') return true;
      if (texto === 'false' || texto === '') return false;
      return /^\d+$/.test(texto) ? Number(texto) : texto;
    }),
  /**
   * Liga o envio de notificações push. Desligado (padrão), nada é enviado e os alertas ficam
   * pendentes no banco; ao ligar, os alertas das últimas 1 hora ainda não enviados saem.
   */
  PUSH_ENVIO_ATIVO: z
    .enum(['true', 'false'])
    .default('false')
    .transform((valor) => valor === 'true'),
  /**
   * Cooldown do push por estação (antiflapping), em minutos. Depois que uma notificação sai para
   * uma estação, outro alerta dela dentro dessa janela NÃO gera push, a menos que seja mais grave
   * (por exemplo, de atenção para crítico). 0 desliga o cooldown. O valor inicial (30) é uma
   * ESTIMATIVA: ajuste com dados reais do sensor, vendo o quanto o nível oscila perto dos limites.
   */
  PUSH_COOLDOWN_MIN: z.preprocess(
    (valor) => (valor === '' ? undefined : valor), // linha vazia no .env = padrão, nunca 0
    z.coerce.number().int().min(0).default(30),
  ),
  /** Endereço do Expo Push Service. Os testes e a verificação manual apontam para um servidor falso. */
  EXPO_PUSH_URL: z.url().default('https://exp.host/--/api/v2/push/send'),
  /** Endereço de consulta dos recibos (receipts) do Expo Push Service. */
  EXPO_RECIBOS_URL: z.url().default('https://exp.host/--/api/v2/push/getReceipts'),
  /**
   * Token de acesso do Expo (opcional). Só é obrigatório se o "enhanced push security" estiver
   * ligado no projeto, no painel do EAS. Nunca vai para log.
   */
  EXPO_ACCESS_TOKEN: z
    .string()
    .optional()
    .transform((valor) => valor?.trim() || undefined),
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
