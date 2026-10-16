import { describe, expect, it } from 'vitest';
import { construirGrafo } from './construir';
import { haversine } from './geo';
import type { ElementoOsm, NoOsm, Tags, ViaOsm } from './osm';

/** Cada passo vale 0,001 grau (~111 m de latitude). */
const BASE_LAT = -22.5;
const BASE_LON = -43.17;
const no = (id: number, passoLat: number, passoLon: number): NoOsm => ({
  type: 'node',
  id,
  lat: BASE_LAT + passoLat * 0.001,
  lon: BASE_LON + passoLon * 0.001,
});
const via = (id: number, nodes: number[], tags: Tags): ViaOsm => ({ type: 'way', id, nodes, tags });

/**
 * Mapa de brinquedo (a rua A corre de oeste para leste, a travessa cruza no nó 3):
 *
 *        6
 *        |
 *  1--2--3--4--8--33
 *        |
 *        5--7
 *
 * Mais: uma ilha (20-21) sem ligação, e vias que NÃO devem entrar (rodovia, foot=no,
 * access=private, área).
 */
const fixture = (): ElementoOsm[] => [
  no(1, 0, 0),
  no(2, 0, 1),
  no(3, 0, 2),
  no(4, 0, 3),
  no(5, -1, 2),
  no(6, 1, 2),
  no(7, -1, 3),
  no(8, 0, 4),
  no(33, 0, 5),
  no(9, 3, 0),
  no(10, 3, 1),
  no(20, 6, 6),
  no(21, 6, 7),
  no(31, 1, 4),
  no(32, 1, 3),
  no(34, 1, 0),
  via(100, [1, 2, 3, 4], { highway: 'residential', name: 'Rua A' }),
  via(101, [6, 3, 5], { highway: 'footway' }),
  via(102, [5, 7], { highway: 'steps' }),
  via(103, [4, 8], { highway: 'footway', bridge: 'yes' }),
  via(104, [8, 33], { highway: 'service', access: 'private', foot: 'yes' }),
  via(105, [9, 10], { highway: 'motorway' }),
  via(106, [8, 31], { highway: 'footway', foot: 'no' }),
  via(107, [4, 32], { highway: 'residential', access: 'private' }),
  via(108, [1, 34], { highway: 'pedestrian', area: 'yes' }),
  via(109, [20, 21], { highway: 'residential' }),
  via(110, [3, 6], { waterway: 'stream' }),
];

const idsDosNos = (r: ReturnType<typeof construirGrafo>) =>
  r.grafo.nos.map((n) => n.id).sort((a, b) => a - b);
const buscarNo = (r: ReturnType<typeof construirGrafo>, id: number) =>
  r.grafo.nos.findIndex((n) => n.id === id);
const buscarAresta = (r: ReturnType<typeof construirGrafo>, idA: number, idB: number) =>
  r.grafo.arestas.find((a) => {
    const de = r.grafo.nos[a.de]!.id;
    const para = r.grafo.nos[a.para]!.id;
    return (de === idA && para === idB) || (de === idB && para === idA);
  });

describe('construirGrafo', () => {
  it('interseção vira nó, ponta de way vira nó, e nós do meio não', () => {
    const r = construirGrafo(fixture());
    const ids = idsDosNos(r);

    expect(ids).toContain(3); // interseção da rua A com a travessa
    expect(ids).toContain(1); // ponta
    expect(ids).toContain(6); // ponta
    expect(ids).not.toContain(2); // nó do meio da rua A
  });

  it('comprime nós de grau 2: o trecho 1-2-3 vira uma aresta com o comprimento real', () => {
    const r = construirGrafo(fixture());
    const aresta = buscarAresta(r, 1, 3)!;

    expect(aresta).toBeDefined();
    const a = fixture().find((e) => e.type === 'node' && e.id === 1) as NoOsm;
    const b = fixture().find((e) => e.type === 'node' && e.id === 2) as NoOsm;
    const c = fixture().find((e) => e.type === 'node' && e.id === 3) as NoOsm;
    const esperado =
      haversine([a.lat, a.lon], [b.lat, b.lon]) + haversine([b.lat, b.lon], [c.lat, c.lon]);
    expect(aresta.comprimentoM).toBeCloseTo(esperado, 0);
    // Os pontos são colineares: a geometria simplificada fica só com as duas pontas.
    expect(aresta.geometria).toHaveLength(2);
    expect(aresta.nome).toBe('Rua A');
    expect(aresta.classe).toBe('residential');
  });

  it('mantém a curva quando ela foge mais que a tolerância', () => {
    const r = construirGrafo([
      no(1, 0, 0),
      no(2, 0, 2),
      no(3, 2, 2),
      via(1, [1, 2, 3], { highway: 'footway' }),
    ]);

    expect(r.grafo.arestas).toHaveLength(1);
    expect(r.grafo.arestas[0]!.geometria).toHaveLength(3);
    expect(r.grafo.nos.map((n) => n.id).sort()).toEqual([1, 3]);
  });

  it('o grafo todo tem os nós e arestas esperados', () => {
    const r = construirGrafo(fixture());

    expect(idsDosNos(r)).toEqual([1, 3, 4, 5, 6, 7, 8, 33]);
    // rua A: 1-3 e 3-4; travessa: 6-3 e 3-5; escada 5-7; ponte 4-8; acesso 8-33
    expect(r.grafo.arestas).toHaveLength(7);
  });

  it('não inclui vias excluídas (rodovia, foot=no, access=private, área, sem highway)', () => {
    const r = construirGrafo(fixture());
    const ids = idsDosNos(r);

    for (const excluido of [9, 10, 31, 32, 34]) expect(ids).not.toContain(excluido);
    expect(r.estatisticas.vias.total).toBe(10); // a via 110 não tem highway
    expect(r.estatisticas.vias.caminhaveis).toBe(6);
  });

  it('via com access=private mas foot=yes entra', () => {
    const r = construirGrafo(fixture());
    expect(buscarAresta(r, 8, 33)).toBeDefined();
  });

  it('o maior componente descarta a ilha e informa o que ficou de fora', () => {
    const r = construirGrafo(fixture());

    expect(idsDosNos(r)).not.toContain(20);
    expect(idsDosNos(r)).not.toContain(21);
    expect(r.estatisticas.antes).toEqual({ nos: 10, arestas: 8, componentes: 2 });
    expect(r.estatisticas.depois).toEqual({ nos: 8, arestas: 7 });
    expect(r.estatisticas.descartados).toEqual({
      nos: 2,
      arestas: 1,
      porcentagemNos: 20,
      porcentagemArestas: 12.5,
    });
  });

  it('escada e ponte são mantidas e marcadas', () => {
    const r = construirGrafo(fixture());
    const escada = buscarAresta(r, 5, 7)!;
    const ponte = buscarAresta(r, 4, 8)!;
    const rua = buscarAresta(r, 1, 3)!;

    expect(escada).toMatchObject({ escada: true, ponte: false, tunel: false, classe: 'steps' });
    expect(ponte).toMatchObject({ escada: false, ponte: true, tunel: false });
    expect(rua).toMatchObject({ escada: false, ponte: false, tunel: false });
  });

  it('reconhece bridge=viaduct e tunnel, mas não bridge=no', () => {
    const r = construirGrafo([
      no(1, 0, 0),
      no(2, 0, 1),
      no(3, 0, 2),
      no(4, 0, 3),
      via(1, [1, 2], { highway: 'footway', bridge: 'viaduct' }),
      via(2, [2, 3], { highway: 'footway', tunnel: 'yes' }),
      via(3, [3, 4], { highway: 'footway', bridge: 'no' }),
    ]);

    expect(buscarAresta(r, 1, 2)!.ponte).toBe(true);
    expect(buscarAresta(r, 2, 3)!.tunel).toBe(true);
    expect(buscarAresta(r, 3, 4)!.ponte).toBe(false);
  });

  it('arestas apontam para índices válidos de nós', () => {
    const r = construirGrafo(fixture());
    for (const a of r.grafo.arestas) {
      expect(r.grafo.nos[a.de]).toBeDefined();
      expect(r.grafo.nos[a.para]).toBeDefined();
    }
    expect(buscarNo(r, 3)).toBeGreaterThanOrEqual(0);
  });

  it('way fechado (anel) vira uma aresta de laço e o nó de fechamento é nó do grafo', () => {
    const r = construirGrafo([
      no(1, 0, 0),
      no(2, 0, 2),
      no(3, 2, 2),
      no(4, 2, 0),
      no(5, 0, -3),
      via(1, [1, 2, 3, 4, 1], { highway: 'footway' }),
      via(2, [5, 1], { highway: 'footway' }),
    ]);

    expect(idsDosNos(r)).toEqual([1, 5]);
    const laco = r.grafo.arestas.find((a) => a.de === a.para);
    expect(laco).toBeDefined();
    expect(laco!.geometria.length).toBeGreaterThan(2);
  });

  it('way com nó ausente no extrato é cortado ali, sem quebrar', () => {
    const r = construirGrafo([
      no(1, 0, 0),
      no(2, 0, 1),
      no(4, 0, 3),
      no(5, 0, 4),
      via(1, [1, 2, 3, 4, 5], { highway: 'footway' }), // o nó 3 não veio
      via(2, [2, 4], { highway: 'footway' }), // liga os dois pedaços
    ]);

    expect(r.grafo.arestas.length).toBeGreaterThanOrEqual(2);
    expect(idsDosNos(r)).not.toContain(3);
  });

  it('oneway:foot marca sentido único; oneway comum é ignorado', () => {
    const r = construirGrafo([
      no(1, 0, 0),
      no(2, 0, 1),
      no(3, 0, 2),
      no(4, 0, 3),
      via(1, [1, 2], { highway: 'footway', 'oneway:foot': 'yes' }),
      via(2, [2, 3], { highway: 'residential', oneway: 'yes' }),
      via(3, [3, 4], { highway: 'footway', 'oneway:foot': '-1' }),
    ]);

    const umSentido = buscarAresta(r, 1, 2)!;
    expect(umSentido.sentidoUnico).toBe(true);
    expect(r.grafo.nos[umSentido.de]!.id).toBe(1);

    expect(buscarAresta(r, 2, 3)!.sentidoUnico).toBeUndefined();

    const contrario = buscarAresta(r, 3, 4)!;
    expect(contrario.sentidoUnico).toBe(true);
    expect(r.grafo.nos[contrario.de]!.id).toBe(4); // sentido contrário ao desenho
    expect(r.grafo.nos[contrario.para]!.id).toBe(3);
  });

  it('sem nenhuma via caminhável devolve um grafo vazio', () => {
    const r = construirGrafo([no(1, 0, 0), no(2, 0, 1), via(1, [1, 2], { highway: 'motorway' })]);
    expect(r.grafo.nos).toEqual([]);
    expect(r.grafo.arestas).toEqual([]);
    expect(r.estatisticas.descartados.porcentagemNos).toBe(0);
  });
});
