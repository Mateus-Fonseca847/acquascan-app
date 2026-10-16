/**
 * Tipos do JSON da Overpass API (só o que usamos).
 */

export type Tags = Readonly<Record<string, string>>;

export interface NoOsm {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Tags;
}

export interface ViaOsm {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: Tags;
}

export interface MembroOsm {
  type: 'node' | 'way' | 'relation';
  ref: number;
  role: string;
}

export interface OutroElementoOsm {
  type: 'relation';
  id: number;
  members?: MembroOsm[];
  tags?: Tags;
}

export type ElementoOsm = NoOsm | ViaOsm | OutroElementoOsm;

export interface RespostaOverpass {
  elements: ElementoOsm[];
}
