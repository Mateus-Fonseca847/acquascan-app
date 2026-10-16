/**
 * Tipos públicos da política de desvio de rios.
 */
import type { LatLng, RotaEncontrada } from '@acquascan/roteamento';
import type { Estado } from '@acquascan/shared';

export type { Estado, LatLng, RotaEncontrada };

// ---------- Entradas de dados ----------

/**
 * O arquivo de exposição gerado por `pnpm grafo:exposicao` (tools/grafo). Cada entrada é
 * `[arestaId, segmentoId, cruza (0 ou 1), distMinM, f15, f30, f50]`.
 */
export interface ExposicaoBruta {
  versao: number;
  grafo: { nos: number; arestas: number; sha256?: string };
  rios?: { sha256: string };
  parametros: { passoM: number; faixasM: readonly number[]; trechoMaxM?: number };
  segmentos: { id: number; rio: string; osmWayId: number; coberto: boolean }[];
  entradas: readonly (readonly number[])[];
}

/** O GeoJSON dos rios gerado por `pnpm grafo:rios`. Coordenadas no padrão GeoJSON: [lon, lat]. */
export interface RiosGeoJson {
  features: {
    properties: { id: number; rio: string; comprimentoM?: number; coberto?: boolean };
    geometry: { type: string; coordinates: readonly (readonly number[])[] };
  }[];
}

/** Uma estação do cadastro da API. `rio` vem como a API devolve (por exemplo, "Rio Piabanha"). */
export interface EstacaoCadastro {
  id: number;
  rio: string;
  latitude: number;
  longitude: number;
}

/** A última leitura de uma estação, como a API devolve (`estado` e `medidoEm` nulos = sem leitura). */
export interface LeituraEstacao {
  estacaoId: number;
  estado: Estado | null;
  medidoEm: string | null;
}

export interface ApoioCadastro {
  id: number;
  latitude: number;
  longitude: number;
}

// ---------- Estados ----------

export type OrigemDoEstado = 'medido' | 'falha_segura' | 'desatualizado' | 'sem_leitura';

export interface EstadoEfetivo {
  estado: Estado | 'DESCONHECIDO';
  origem: OrigemDoEstado;
  /** Idade da leitura em minutos; nulo se não há leitura ou a data é inválida ou do futuro. */
  idadeMin: number | null;
}

export type EstadoDoSegmento = Estado | 'DESCONHECIDO' | 'SEM_MONITORAMENTO';

export interface InfoSegmento {
  estado: EstadoDoSegmento;
  /** A estação que governa o segmento (a mais próxima do mesmo rio, dentro do alcance), ou nulo. */
  estacaoId: number | null;
}

export interface EstadosAtuais {
  estacoes: ReadonlyMap<number, EstadoEfetivo>;
  segmentos: ReadonlyMap<number, InfoSegmento>;
}

// ---------- Rotas ----------

export type ModoDesvio = 'sem_risco' | 'segura' | 'menos_exposta';

/** Códigos de aviso. Os textos em português ficam para o app. */
export type Aviso =
  | 'ATRAVESSA_RIO_CRITICO'
  | 'EXPOSICAO_RIO_CRITICO'
  | 'ESTADO_ANTIGO_EM_USO'
  | 'ESTACAO_SEM_LEITURA_ATUAL';

export interface RotaAvaliada {
  rota: RotaEncontrada;
  /** Distância na rede mais as distâncias de encaixe da origem e do destino. */
  distanciaTotalM: number;
  /** Tempo de caminhada da distância total, pela velocidade. */
  tempoS: number;
  /** Metros da rota (parcial x fração efetiva da aresta) junto de rio em estado crítico. */
  exposicaoCriticaM: number;
  exposicaoAtencaoM: number;
  /** Quantas vezes a rota usa uma aresta que cruza um rio em estado crítico (ou de atenção). */
  travessiasCriticas: number;
  travessiasAtencao: number;
}

export interface ResultadoDesvioOk {
  status: 'ok';
  modo: ModoDesvio;
  recomendada: RotaAvaliada;
  /** A rota mais curta, só quando vale mostrá-la (ela é bem mais exposta que a recomendada). */
  maisCurta: RotaAvaliada | null;
  avisos: Aviso[];
  estados: EstadosAtuais;
}

export interface ResultadoDesvioSemRota {
  status: 'sem_caminho' | 'origem_longe' | 'destino_longe';
  modo: null;
  recomendada: null;
  maisCurta: null;
  avisos: Aviso[];
  estados: EstadosAtuais;
}

export type ResultadoDesvio = ResultadoDesvioOk | ResultadoDesvioSemRota;

export interface OpcoesRotaDesvio {
  /** Velocidade de caminhada (km/h). Padrão: a do roteador (4,5). */
  velocidadeKmH?: number;
  /** Distância máxima do encaixe da origem e do destino na rede (m). Padrão: a do roteador (250). */
  maxEncaixeM?: number;
}

export interface ApoioAvaliado {
  apoio: ApoioCadastro;
  resultado: ResultadoDesvio;
}

export interface CoberturaDeUmRio {
  rio: string;
  segmentos: number;
  segmentosMonitorados: number;
  kmTotal: number;
  kmMonitorado: number;
  kmSemMonitoramento: number;
}

export interface ResumoCobertura {
  rios: CoberturaDeUmRio[];
  kmTotal: number;
  kmMonitorado: number;
  kmSemMonitoramento: number;
  /** Estações sem nenhum segmento do mesmo rio no alcance: provável erro de coordenada ou de nome do rio. */
  estacoesSemSegmento: EstacaoCadastro[];
}
