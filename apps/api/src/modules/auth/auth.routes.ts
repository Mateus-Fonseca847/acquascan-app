import { cadastroEntradaSchema, loginEntradaSchema } from '@acquascan/shared';
import type { FastifyInstance } from 'fastify';
import { naoImplementado } from '../../lib/erros';

/**
 * Cadastro e login.
 *
 * TODO(v0.2.0):
 * - cadastro: validar, salvar senha com hash (scrypt ou argon2, nunca em texto),
 *   registrar consentimentoEm (LGPD) e obter lat/lng do CEP (ViaCEP + geocodificação)
 * - login: conferir senha e devolver um token de sessão (JWT)
 * - DELETE /auth/conta: excluir a conta e os dados (direito previsto na LGPD)
 * Ver docs/requisitos.md, RF01 e RF02, e docs/privacidade.md.
 */
export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/cadastro', async (request) => {
    cadastroEntradaSchema.parse(request.body);
    throw naoImplementado('O cadastro', 'v0.2.0');
  });

  app.post('/auth/login', async (request) => {
    loginEntradaSchema.parse(request.body);
    throw naoImplementado('O login', 'v0.2.0');
  });
}
