/**
 * Configuração da construção do grafo.
 */

/** Caixa geográfica em graus, na ordem que a Overpass usa: sul, oeste, norte, leste. */
export interface Bbox {
  sul: number;
  oeste: number;
  norte: number;
  leste: number;
}

/**
 * Caixa APROXIMADA em volta da área urbana de Petrópolis (RJ). É um ponto de partida, e deve
 * ser AJUSTADA ao mapa: abra o OpenStreetMap, confira se os bairros e as estações que o app
 * atende ficam dentro dela e, se preciso, aumente ou diminua. Quanto maior a caixa, maior o
 * download e o grafo (o arquivo vai para o celular). Veja o README desta pasta.
 */
export const BBOX_PETROPOLIS: Bbox = {
  sul: -22.56,
  oeste: -43.26,
  norte: -22.45,
  leste: -43.12,
};

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Identifica o projeto para quem opera a Overpass (política de uso da API pública). */
export const USER_AGENT = 'acquascan-grafo/1.0 (projeto acadêmico)';

/** Tolerância do Douglas-Peucker na geometria das arestas, em metros. */
export const TOLERANCIA_SIMPLIFICACAO_M = 3;
