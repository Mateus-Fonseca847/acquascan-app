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
export const USER_AGENT = 'aquascan-grafo/1.0 (projeto acadêmico)';

/** Tolerância do Douglas-Peucker na geometria das arestas, em metros. */
export const TOLERANCIA_SIMPLIFICACAO_M = 3;

/**
 * Rios que entram no mapa de exposição (desvio de rios em estado crítico). Comparados pelo nome
 * NORMALIZADO e por IGUALDADE (não "contém"): minúsculas, sem acento e sem o prefixo "rio ".
 * "Rio Piabanha", "Piabanha" e "RIO PIABANHÁ" são o mesmo rio; "Rio Piabanha do Sul" não é.
 * Os demais rios aparecem só no relatório, para a equipe decidir se entram.
 */
export const RIOS_ALVO: readonly string[] = ['Piabanha', 'Quitandinha'];

/** Pontas de rio de componentes diferentes mais perto que isto são reportadas como lacuna (m). */
export const DISTANCIA_LACUNA_M = 30;

/**
 * Grafias alternativas que valem como um rio alvo. A chave é o nome NORMALIZADO (minúsculas,
 * sem acento, sem o prefixo "rio ") e o valor é o rio alvo. São, em geral, erros de digitação
 * no OSM; os segmentos entram com `alias: true` e o relatório lista cada um (way e nome original)
 * para a equipe corrigir no OpenStreetMap.
 */
export const ALIASES_RIOS: Readonly<Record<string, string>> = {
  pirabanha: 'Piabanha',
  quintandinha: 'Quitandinha',
};

// ---------- Exposição das ruas aos rios ----------

/** Passo da amostragem ao longo de cada aresta, em metros. */
export const PASSO_AMOSTRA_M = 5;

/** Faixas de distância ao rio, em metros (cada uma inclui as anteriores). */
export const FAIXAS_EXPOSICAO_M = [15, 30, 50] as const;

/** Um toque a até esta distância (m) conta como cruzamento (extremidades que se encostam). */
export const TOLERANCIA_TOQUE_M = 0.5;

/**
 * Comprimento máximo, em metros, de um trecho de rio. Os ways do OSM são fatiados em trechos
 * iguais de até este tamanho (veja trechos.ts): o trecho é a unidade de monitoramento e de
 * exposição. Mudar este valor muda os ids dos trechos e exige regenerar rios e exposição.
 */
export const TRECHO_MAX_M = 250;
