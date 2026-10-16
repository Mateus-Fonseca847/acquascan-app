/**
 * Tipos públicos do roteamento a pé.
 */

export type LatLng = { latitude: number; longitude: number };

// ---------- Entrada: o JSON gerado por tools/grafo (versão 1) ----------

export interface NoBruto {
  /** Id do nó no OpenStreetMap (só para depurar). */
  id: number;
  lat: number;
  lon: number;
}

export interface ArestaBruta {
  /** Índice em `nos`. */
  de: number;
  /** Índice em `nos`. */
  para: number;
  /** Comprimento real em metros (soma sobre a polilinha original). */
  comprimentoM: number;
  /** Polilinha simplificada [lat, lon], de `de` até `para`, com as duas pontas. */
  geometria: [number, number][];
  nome?: string;
  classe: string;
  escada: boolean;
  ponte: boolean;
  tunel: boolean;
  /** Só pode ser percorrida de `de` para `para`. */
  sentidoUnico?: true;
}

export interface GrafoBruto {
  versao: 1;
  nos: NoBruto[];
  arestas: ArestaBruta[];
}

// ---------- Saída ----------

export interface Encaixe {
  arestaId: number;
  /** Distância, em metros, ao longo da aresta a partir do nó `de`. */
  posicaoM: number;
  /** O ponto da aresta mais próximo do ponto consultado. */
  ponto: LatLng;
  /** Distância em linha reta do ponto consultado até `ponto`. */
  distanciaM: number;
}

export interface OpcoesRota {
  /**
   * Um valor por aresta, indexado pelo id da aresta. Cada valor deve ser >= 1 ou Infinity.
   * 1 = normal; maior que 1 penaliza; valores enormes (1000) quase bloqueiam, mas deixam a rota
   * existir; Infinity bloqueia de vez. Padrão: tudo 1.
   */
  multiplicadorPorAresta?: Float32Array;
  /** Velocidade de caminhada para o tempo estimado. Padrão 4,5 km/h. */
  velocidadeKmH?: number;
  /** Distância máxima do encaixe da origem e do destino na rede, em metros. Padrão 250. */
  maxEncaixeM?: number;
}

export interface Trecho {
  arestaId: number;
  nome: string | null;
  classe: string;
  sentido: 'direto' | 'inverso';
  /** Comprimento da parte percorrida (parcial na primeira e na última aresta). */
  comprimentoM: number;
  /** O multiplicador que foi usado nesta aresta. */
  multiplicador: number;
  /** Já orientados no sentido do percurso e cortados nos pontos de encaixe, nas pontas. */
  pontos: LatLng[];
}

export interface RotaEncontrada {
  status: 'ok';
  /** Soma dos comprimentos percorridos na rede (sem os trechos de encaixe). */
  distanciaRedeM: number;
  /** Distância em linha reta da origem até a rede. */
  encaixeOrigemM: number;
  /** Distância em linha reta da rede até o destino. */
  encaixeDestinoM: number;
  /** Tempo só da parte na rede, pela velocidade. */
  tempoS: number;
  /** Soma de comprimento x multiplicador. */
  custo: number;
  trechos: Trecho[];
  /** A linha completa, sem vértices repetidos nas junções. */
  pontos: LatLng[];
  /** Diagnóstico: nós retirados da fila pelo A* (para comparar com outras buscas). */
  nosExpandidos: number;
}

export interface RotaSemResultado {
  status: 'sem_caminho' | 'origem_longe' | 'destino_longe';
}

export type ResultadoRota = RotaEncontrada | RotaSemResultado;

export interface AtributosAresta {
  nome: string | null;
  classe: string;
  comprimentoM: number;
  escada: boolean;
  ponte: boolean;
  tunel: boolean;
}
