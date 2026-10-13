import { coordenadasSchema, type PontoApoio } from '@acquascan/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';

const query = coordenadasSchema.partial().extend({
  limite: z.coerce.number().int().min(1).max(50).default(10),
});

interface PontoComDistancia {
  id: number;
  nome: string;
  endereco: string;
  capacidade: number;
  contato: string | null;
  latitude: number;
  longitude: number;
  distancia_m: number;
}

export async function pontosApoioRoutes(app: FastifyInstance) {
  /**
   * Sem lat/lng: lista todos os pontos ativos.
   * Com lat/lng: ordena pelos mais próximos, com a distância em linha reta (PostGIS).
   */
  app.get('/pontos-apoio', async (request): Promise<PontoApoio[]> => {
    const { lat, lng, limite } = query.parse(request.query);

    if (lat === undefined || lng === undefined) {
      return prisma.pontoApoio.findMany({
        where: { ativo: true },
        orderBy: { nome: 'asc' },
        take: limite,
        omit: { ativo: true },
      });
    }

    const linhas = await prisma.$queryRaw<PontoComDistancia[]>`
      SELECT id, nome, endereco, capacidade, contato, latitude, longitude,
             ST_Distance(
               ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
               ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography
             ) AS distancia_m
      FROM pontos_apoio
      WHERE ativo = true
      ORDER BY distancia_m
      LIMIT ${limite}::int
    `;

    return linhas.map(({ distancia_m, ...ponto }) => ({
      ...ponto,
      distanciaM: Math.round(distancia_m),
    }));
  });
}
