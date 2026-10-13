/**
 * Validações (Zod) dos dados que entram na API.
 * O mesmo esquema é usado pela API, pelo simulador e, no futuro, pelo app.
 */
import { z } from 'zod';

/**
 * Corpo enviado pelo ESP32 em POST /leituras.
 * A estação se identifica pelo token no cabeçalho Authorization, não no corpo.
 */
export const leituraEntradaSchema = z.object({
  distanciaCm: z.number().positive().max(2000),
  vazaoLpm: z.number().min(0).max(1000).optional(),
  /** Opcional: o ESP32 só sabe a hora se tiver NTP. Sem ele, vale a hora de chegada. */
  medidoEm: z.iso.datetime().optional(),
});
export type LeituraEntrada = z.infer<typeof leituraEntradaSchema>;

export const cadastroEntradaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome'),
  email: z.email('E-mail inválido'),
  telefone: z.string().regex(/^\d{10,11}$/, 'Use DDD + número, só dígitos'),
  cep: z.string().regex(/^\d{8}$/, 'Use os 8 dígitos do CEP'),
  senha: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres'),
  /** LGPD: o cadastro só é aceito com consentimento explícito. */
  consentimento: z.literal(true, 'É preciso aceitar os termos de uso de dados'),
});
export type CadastroEntrada = z.infer<typeof cadastroEntradaSchema>;

export const loginEntradaSchema = z.object({
  email: z.email(),
  senha: z.string().min(1),
});
export type LoginEntrada = z.infer<typeof loginEntradaSchema>;

export const coordenadasSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
