/**
 * Validações (Zod) dos dados que entram na API.
 * O mesmo esquema é usado pela API, pelo simulador e, no futuro, pelo app.
 */
import { z } from 'zod';
import { NIVEIS_ALERTA } from './contratos';

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

/** Tamanho máximo da senha aceito na API. */
export const SENHA_MAX = 128;

export const cadastroEntradaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome'),
  email: z.email('E-mail inválido'),
  /** Id de uma cidade de GET /cidades. */
  cidadeId: z.number('Escolha sua cidade').int('Escolha sua cidade').positive('Escolha sua cidade'),
  /** O máximo evita abuso de CPU: o hash da senha é lento de propósito. */
  senha: z
    .string()
    .min(8, 'A senha precisa de pelo menos 8 caracteres')
    .max(SENHA_MAX, `A senha pode ter no máximo ${SENHA_MAX} caracteres`),
  /** LGPD: o cadastro só é aceito com consentimento explícito. */
  consentimento: z.literal(true, 'É preciso aceitar os termos de uso de dados'),
});
export type CadastroEntrada = z.infer<typeof cadastroEntradaSchema>;

export const loginEntradaSchema = z.object({
  email: z.email(),
  senha: z.string().min(1).max(SENHA_MAX),
});
export type LoginEntrada = z.infer<typeof loginEntradaSchema>;

/** Exclusão da conta (LGPD): a senha confirma que é o próprio usuário. */
export const excluirContaEntradaSchema = z.object({
  senha: z.string().min(1, 'Informe sua senha').max(SENHA_MAX),
});
export type ExcluirContaEntrada = z.infer<typeof excluirContaEntradaSchema>;

/** Token de notificação push do Expo, enviado pelo app para receber alertas. */
export const pushTokenEntradaSchema = z.object({
  token: z
    .string('Informe o token de notificação')
    .trim()
    .max(200, 'O token de notificação é grande demais')
    .regex(/^Expo(nent)?PushToken\[[^\]\s]+\]$/, 'Token de notificação inválido'),
});
export type PushTokenEntrada = z.infer<typeof pushTokenEntradaSchema>;

// Contratos planejados (C2, C6 e C7). Ainda não há endpoint: ver contratos-api.md. ----------------

/** Nova senha, nos mesmos limites do cadastro. */
const novaSenhaSchema = z
  .string('Informe a nova senha')
  .min(8, 'A senha precisa de pelo menos 8 caracteres')
  .max(SENHA_MAX, `A senha pode ter no máximo ${SENHA_MAX} caracteres`);

/** Id positivo de cidade ou de estação. */
const idSchema = z.number().int().positive();

/**
 * PATCH /usuarios/me (C2). Campos ausentes não mudam; `estacoesSeguidas` SUBSTITUI o conjunto.
 * O e-mail não pode ser alterado nesta versão (campo desconhecido é ignorado, como no cadastro).
 */
export const atualizarPerfilEntradaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome').optional(),
  cidadeId: idSchema.optional(),
  nivelAlerta: z.enum(NIVEIS_ALERTA).optional(),
  /** O teto de 100 evita abuso; o servidor ainda confere que são estações ativas da cidade. */
  estacoesSeguidas: z.array(idSchema).max(100).optional(),
});
export type AtualizarPerfilEntrada = z.infer<typeof atualizarPerfilEntradaSchema>;

/** PATCH /usuarios/me/senha (C2). */
export const trocarSenhaEntradaSchema = z.object({
  senhaAtual: z.string('Informe sua senha atual').min(1, 'Informe sua senha atual').max(SENHA_MAX),
  novaSenha: novaSenhaSchema,
});
export type TrocarSenhaEntrada = z.infer<typeof trocarSenhaEntradaSchema>;

/** GET /ruas/busca?q=&limite= (C6). `q` precisa de 2 ou mais caracteres; `limite` vai de 1 a 20. */
export const buscaRuaEntradaSchema = z.object({
  /** O teto de 100 evita abuso na busca por similaridade. */
  q: z.string('Informe o nome da rua').trim().min(2, 'Digite pelo menos 2 caracteres').max(100),
  limite: z.coerce.number().int().min(1).max(20).default(10),
});
export type BuscaRuaEntrada = z.infer<typeof buscaRuaEntradaSchema>;

/** POST /auth/esqueci-senha (C7). */
export const esqueciSenhaEntradaSchema = z.object({
  email: z.email('E-mail inválido'),
});
export type EsqueciSenhaEntrada = z.infer<typeof esqueciSenhaEntradaSchema>;

/** POST /auth/redefinir-senha (C7). O código tem 6 dígitos. */
export const redefinirSenhaEntradaSchema = z.object({
  email: z.email('E-mail inválido'),
  codigo: z.string('Informe o código').regex(/^\d{6}$/, 'O código tem 6 dígitos'),
  novaSenha: novaSenhaSchema,
});
export type RedefinirSenhaEntrada = z.infer<typeof redefinirSenhaEntradaSchema>;

export const coordenadasSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
