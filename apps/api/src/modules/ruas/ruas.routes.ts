import type { FastifyInstance } from 'fastify';
import { naoImplementado } from '../../lib/erros';

/**
 * Pesquisa do estado do rio por rua.
 *
 * TODO(v0.3.0): importar as ruas de Petrópolis do OpenStreetMap para o PostGIS,
 * associar cada rua à estação mais próxima e responder
 * GET /ruas/busca?q=nome → [{ rua, estacao: EstacaoResumo, distanciaM }].
 * Ver docs/requisitos.md, RF04.
 */
export async function ruasRoutes(app: FastifyInstance) {
  app.get('/ruas/busca', async () => {
    throw naoImplementado('A pesquisa por rua', 'v0.3.0');
  });
}
