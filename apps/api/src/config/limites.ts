/**
 * Limites de tentativas (rate limit) das rotas de conta. Todas as tentativas contam,
 * inclusive as bem-sucedidas. Os contadores ficam na memória da API (ver apps/api/README.md).
 * Ao passar do limite a API responde 429 com o cabeçalho Retry-After.
 */

const MINUTO = 60_000;

export const limites = {
  /**
   * Login, por combinação IP + e-mail: segura quem tenta adivinhar a senha de UMA conta.
   * Sem e-mail válido no corpo, a chave é só o IP.
   */
  loginPorIpEEmail: { max: 10, janelaMs: 15 * MINUTO },

  /**
   * Login, por IP: segura quem testa muitos e-mails diferentes a partir da mesma origem.
   * É mais folgado que o limite acima para não atrapalhar várias pessoas no mesmo Wi-Fi.
   */
  loginPorIp: { max: 40, janelaMs: 15 * MINUTO },

  /**
   * Cadastro, por IP: 20 por hora. A folga é de propósito: num evento (como a Supernova)
   * várias pessoas podem se cadastrar usando o mesmo Wi-Fi, e portanto o mesmo IP.
   */
  cadastroPorIp: { max: 20, janelaMs: 60 * MINUTO },

  /**
   * Exclusão de conta, por IP: ação rara e destrutiva, que ainda confere a senha.
   * O limite é baixo para impedir tentativas de adivinhar a senha por aqui.
   */
  exclusaoPorIp: { max: 5, janelaMs: 15 * MINUTO },
} as const;

export const MENSAGEM_MUITAS_TENTATIVAS = 'Muitas tentativas. Tente de novo em alguns minutos.';
