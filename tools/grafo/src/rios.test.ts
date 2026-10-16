import { describe, expect, it } from 'vitest';
import type { Bbox } from './config';
import { haversine } from './geo';
import type { ElementoOsm, NoOsm, Tags, ViaOsm } from './osm';
import { extrairRios, paraGeoJson } from './rios';

/** Coordenadas em metros (x leste, y norte) a partir de um ponto fixo. */
const LAT0 = -22.5;
const LON0 = -43.17;
const M_LAT = 111_195;
const lat = (y: number) => LAT0 + y / M_LAT;
const lon = (x: number) => LON0 + x / (M_LAT * Math.cos((LAT0 * Math.PI) / 180));
const no = (id: number, x: number, y: number): NoOsm => ({
  type: 'node',
  id,
  lat: lat(y),
  lon: lon(x),
});
const via = (id: number, nodes: number[], tags: Tags): ViaOsm => ({ type: 'way', id, nodes, tags });

/** Caixa de -300 a 1100 m em x e de -300 a 1300 m em y. */
const bbox: Bbox = { sul: lat(-300), oeste: lon(-300), norte: lat(1300), leste: lon(1100) };

/**
 * Piabanha (leste): W101 -> W102 (coberto, sem nome, membro da relação) -> W103 (canal), e W104
 * solta a 20 m da ponta de W103. W105 (sem nome) sai da ponta de W103.
 * Quitandinha: W106 (coberto) -> W107 (vala), e W108 a 100 m dali.
 * Outros: Palatinado, "Quitandinha do Sul", uma vala chamada Piabanha (ditch) e um way longe.
 */
const fixture = (): ElementoOsm[] => [
  // Piabanha
  no(1, 0, 0),
  no(2, 100, 0),
  no(3, 200, 1.5), // dentro de 3 m da reta: o Douglas-Peucker remove
  no(4, 300, 0),
  no(5, 400, 0),
  no(6, 500, 0),
  no(7, 600, 0),
  no(40, 620, 0), // 20 m da ponta (nó 7)
  no(41, 700, 0),
  no(50, 600, 80),
  // Quitandinha
  no(11, 0, 500),
  no(12, 100, 500),
  no(13, 200, 500),
  no(14, 300, 500), // 100 m da ponta (nó 13)
  no(15, 400, 500),
  // Outros
  no(21, 0, 1000),
  no(22, 500, 1000),
  no(23, 0, 800),
  no(24, 300, 800),
  no(25, 0, 900),
  no(26, 200, 900),
  no(90, 50_000, 0),
  no(91, 50_100, 0),

  via(101, [1, 2, 3, 4], { waterway: 'river', name: 'Rio Piabanha' }),
  via(102, [4, 5, 6], { waterway: 'stream', tunnel: 'culvert' }), // sem nome: vem da relação
  via(103, [6, 7], { waterway: 'canal', name: 'Piabanha' }),
  via(104, [40, 41], { waterway: 'river', name: 'RIO PIABANHÁ' }),
  via(105, [7, 50], { waterway: 'stream' }), // sem nome, ligado ao rio

  via(106, [11, 12], { waterway: 'stream', name: 'Rio Quitandinha', tunnel: 'yes' }),
  via(107, [12, 13], { waterway: 'drain', name: 'Quitandinha' }),
  via(108, [14, 15], {
    waterway: 'stream',
    name: 'Rio Quitandinha',
    tunnel: 'building_passage',
    covered: 'yes',
  }),

  via(109, [21, 22], { waterway: 'river', name: 'Rio Palatinado' }),
  via(110, [23, 24], { waterway: 'stream', name: 'Rio Quitandinha do Sul' }),
  via(111, [25, 26], { waterway: 'ditch', name: 'Rio Piabanha' }), // ditch não está nos tipos
  via(112, [90, 91], { waterway: 'stream', name: 'Rio Piabanha' }), // longe da caixa

  {
    type: 'relation',
    id: 900,
    tags: { type: 'waterway', name: 'Rio Piabanha' },
    members: [
      { type: 'way', ref: 102, role: '' },
      { type: 'way', ref: 112, role: '' },
    ],
  },
];

const extrair = (elementos = fixture(), extra = {}) =>
  extrairRios(elementos, { riosAlvo: ['Piabanha', 'Quitandinha'], bbox, ...extra });

describe('extrairRios: quais segmentos saem', () => {
  const r = extrair();
  const ids = r.segmentos.map((s) => s.osmWayId).sort();

  it('só os rios alvo, por igualdade do nome normalizado', () => {
    expect(ids).toEqual([101, 102, 103, 104, 106, 107, 108]);
  });

  it('"Quitandinha do Sul" (contém o nome) não é o Quitandinha', () => {
    expect(ids).not.toContain(110);
  });

  it('rio fora da lista não vai para a saída, mas aparece na tabela do relatório', () => {
    expect(ids).not.toContain(109);
    const palatinado = r.todos.find((t) => t.nome === 'Rio Palatinado')!;
    expect(palatinado).toMatchObject({ alvo: false, ways: 1 });
    expect(palatinado.km).toBeCloseTo(0.5, 1);
    expect(r.todos.find((t) => t.nome === 'Rio Quitandinha do Sul')!.alvo).toBe(false);
  });

  it('tipos fora de river, stream, canal e drain são ignorados', () => {
    expect(ids).not.toContain(111);
  });

  it('way inteiramente fora da caixa (membro distante da relação) é ignorado', () => {
    expect(ids).not.toContain(112);
  });

  it('sem a caixa, o way distante entra', () => {
    const sem = extrairRios(fixture(), { riosAlvo: ['Piabanha'] });
    expect(sem.segmentos.map((s) => s.osmWayId)).toContain(112);
  });
});

describe('extrairRios: nome', () => {
  const r = extrair();
  const seg = (id: number) => r.segmentos.find((s) => s.osmWayId === id)!;

  it('o nome vem da relação quando o way não tem', () => {
    expect(seg(102)).toMatchObject({ rio: 'Piabanha', nomeOsm: 'Rio Piabanha' });
  });

  it('o rio é o nome canônico da lista, qualquer que seja a grafia no OSM', () => {
    expect(seg(101).rio).toBe('Piabanha');
    expect(seg(103).rio).toBe('Piabanha');
    expect(seg(104).rio).toBe('Piabanha'); // "RIO PIABANHÁ"
    expect(seg(103).nomeOsm).toBe('Piabanha');
  });

  it('o nome do próprio way vale mais que o da relação', () => {
    const elementos = fixture();
    elementos.push({
      type: 'relation',
      id: 901,
      tags: { type: 'waterway', name: 'Rio Piabanha' },
      members: [{ type: 'way', ref: 109, role: '' }], // o way 109 se chama Rio Palatinado
    });
    const rr = extrair(elementos);
    expect(rr.segmentos.map((s) => s.osmWayId)).not.toContain(109);
  });

  it('relação sem nome ou de outro tipo não dá nome a ninguém', () => {
    const elementos: ElementoOsm[] = fixture().filter((e) => e.type !== 'relation');
    elementos.push({
      type: 'relation',
      id: 902,
      tags: { type: 'route' },
      members: [{ type: 'way', ref: 102, role: '' }],
    });
    elementos.push({
      type: 'relation',
      id: 903,
      tags: { type: 'waterway' },
      members: [{ type: 'way', ref: 102, role: '' }],
    });
    const rr = extrair(elementos);
    expect(rr.segmentos.map((s) => s.osmWayId)).not.toContain(102);
    expect(rr.semNome.ways).toBe(2); // 102 e 105
  });

  it('way sem nome e fora de qualquer relação conta como "sem nome"', () => {
    expect(r.semNome.ways).toBe(1); // o 105
    expect(r.semNome.km).toBeCloseTo(0.08, 2);
  });
});

describe('extrairRios: flags', () => {
  const r = extrair();
  const seg = (id: number) => r.segmentos.find((s) => s.osmWayId === id)!;

  it('coberto: tunnel=culvert ou yes, guardando o valor bruto', () => {
    expect(seg(102)).toMatchObject({ coberto: true, tunnel: 'culvert' });
    expect(seg(106)).toMatchObject({ coberto: true, tunnel: 'yes' });
    expect(seg(101)).toMatchObject({ coberto: false, tunnel: null });
  });

  it('outro valor de tunnel não é coberto, mas o valor bruto é guardado; covered=yes só é registrado', () => {
    expect(seg(108)).toMatchObject({ coberto: false, tunnel: 'building_passage', covered: 'yes' });
  });

  it('canal: waterway=canal ou drain', () => {
    expect(seg(103)).toMatchObject({ canal: true, waterway: 'canal' });
    expect(seg(107)).toMatchObject({ canal: true, waterway: 'drain' });
    expect(seg(101)).toMatchObject({ canal: false, waterway: 'river' });
    expect(seg(102)).toMatchObject({ canal: false, waterway: 'stream' });
  });
});

describe('extrairRios: geometria, comprimento e sentido do fluxo', () => {
  const r = extrair();
  const seg = (id: number) => r.segmentos.find((s) => s.osmWayId === id)!;

  it('simplifica (Douglas-Peucker, 3 m) e mantém os extremos', () => {
    const g = seg(101).geometria;
    expect(g).toHaveLength(2); // os nós 2 e 3 estão a menos de 3 m da reta
    expect(g[0]![0]).toBeCloseTo(lat(0), 6);
    expect(g[1]![1]).toBeCloseTo(lon(300), 6);
  });

  it('o comprimento é o da geometria ORIGINAL, não da simplificada', () => {
    const original = [1, 2, 3, 4].map((id) => {
      const n = fixture().find((e) => e.type === 'node' && e.id === id) as NoOsm;
      return [n.lat, n.lon] as const;
    });
    let esperado = 0;
    for (let i = 1; i < original.length; i++) esperado += haversine(original[i - 1]!, original[i]!);
    expect(seg(101).comprimentoM).toBeCloseTo(esperado, 1);
    expect(seg(101).comprimentoM).toBeGreaterThan(299.9);
  });

  it('preserva o sentido do OSM (a jusante) mesmo para um way que corre para o oeste, com curva', () => {
    // Fluxo de leste para oeste, com uma curva que sobrevive à simplificação.
    const elementos: ElementoOsm[] = [
      no(1, 400, 0),
      no(2, 200, 50),
      no(3, 0, 0),
      via(1, [1, 2, 3], { waterway: 'stream', name: 'Rio Piabanha' }),
    ];
    const g = extrairRios(elementos, { riosAlvo: ['Piabanha'] }).segmentos[0]!.geometria;

    expect(g).toHaveLength(3);
    expect(g[0]![1]).toBeCloseTo(lon(400), 6); // começa no leste (nascente)
    expect(g[2]![1]).toBeCloseTo(lon(0), 6); // termina no oeste (foz)
    expect(g[1]![1]).toBeCloseTo(lon(200), 6);
  });

  it('o GeoJSON tem um LineString por segmento, com [lon, lat] e as propriedades', () => {
    const geo = paraGeoJson(r.segmentos);
    expect(geo.type).toBe('FeatureCollection');
    expect(geo.features).toHaveLength(7);
    const f = geo.features.find((x) => x.properties.osmWayId === 102)!;
    expect(f.geometry.type).toBe('LineString');
    expect(f.geometry.coordinates[0]).toEqual([
      seg(102).geometria[0]![1],
      seg(102).geometria[0]![0],
    ]);
    expect(f.properties).toMatchObject({
      osmWayId: 102,
      rio: 'Piabanha',
      waterway: 'stream',
      coberto: true,
      tunnel: 'culvert',
      canal: false,
    });
    expect(f.properties.comprimentoM).toBeCloseTo(200, 0);
  });
});

describe('extrairRios: componentes e lacunas', () => {
  const r = extrair();
  const rio = (nome: string) => r.alvos.find((a) => a.rio === nome)!;

  it('agrupa os segmentos que se encostam', () => {
    expect(rio('Piabanha').componentes.map((c) => c.segmentos)).toEqual([3, 1]);
    expect(rio('Quitandinha').componentes.map((c) => c.segmentos)).toEqual([2, 1]);
  });

  it('duas pontas a 20 m são reportadas como lacuna, e nada é unido', () => {
    const lacunas = rio('Piabanha').lacunas;
    expect(lacunas).toHaveLength(1);
    expect(lacunas[0]!.distanciaM).toBeCloseTo(20, 0);
    expect([lacunas[0]!.wayA, lacunas[0]!.wayB].sort()).toEqual([103, 104]);
    expect(lacunas[0]!.lat).toBeCloseTo(lat(0), 5);
    expect(lacunas[0]!.lon).toBeCloseTo(lon(610), 5);
    expect(rio('Piabanha').componentes).toHaveLength(2); // continuam dois componentes
  });

  it('duas pontas a 100 m não são reportadas', () => {
    expect(rio('Quitandinha').lacunas).toEqual([]);
  });

  it('o limite da lacuna é configurável', () => {
    const larga = extrair(fixture(), { distanciaLacunaM: 150 });
    expect(larga.alvos.find((a) => a.rio === 'Quitandinha')!.lacunas).toHaveLength(1);
  });

  it('um afluente que termina no meio de outro segmento do mesmo rio fica no mesmo componente', () => {
    const elementos: ElementoOsm[] = [
      no(1, 0, 0),
      no(2, 100, 0),
      no(3, 200, 0),
      no(4, 100, 80),
      via(1, [1, 2, 3], { waterway: 'river', name: 'Rio Piabanha' }),
      via(2, [4, 2], { waterway: 'stream', name: 'Rio Piabanha' }), // termina no nó 2, no meio do way 1
    ];
    const rr = extrairRios(elementos, { riosAlvo: ['Piabanha'] });
    expect(rr.alvos[0]!.componentes).toHaveLength(1);
    expect(rr.alvos[0]!.lacunas).toEqual([]);
  });

  it('pontas do mesmo componente não são lacuna, mesmo próximas', () => {
    const elementos: ElementoOsm[] = [
      no(1, 0, 0),
      no(2, 100, 0),
      no(3, 100, 10),
      no(4, 0, 10), // quase fecha um anel de 10 m
      via(1, [1, 2, 3, 4], { waterway: 'stream', name: 'Rio Piabanha' }),
    ];
    const rr = extrairRios(elementos, { riosAlvo: ['Piabanha'] });
    expect(rr.alvos[0]!.componentes).toHaveLength(1);
    expect(rr.alvos[0]!.lacunas).toEqual([]);
  });
});

describe('extrairRios: resumo por rio', () => {
  const r = extrair();
  const rio = (nome: string) => r.alvos.find((a) => a.rio === nome)!;

  it('km, segmentos e porcentagens (por comprimento)', () => {
    const p = rio('Piabanha');
    expect(p.segmentos).toBe(4);
    expect(p.km).toBeCloseTo(0.3 + 0.2 + 0.1 + 0.08, 2);
    expect(p.pctCoberto).toBeCloseTo((0.2 / 0.68) * 100, 0);
    expect(p.pctCanal).toBeCloseTo((0.1 / 0.68) * 100, 0);

    const q = rio('Quitandinha');
    expect(q.segmentos).toBe(3);
    expect(q.pctCoberto).toBeCloseTo(33.3, 0); // 106 coberto; o 108 (building_passage) não
    expect(q.comCoveredYes).toBe(1);
  });

  it('lista os ways sem nome ligados ao rio', () => {
    expect(rio('Piabanha').semNomeLigados.map((w) => w.osmWayId)).toEqual([105]);
    expect(rio('Quitandinha').semNomeLigados).toEqual([]);
  });

  it('a tabela de todos os rios junta as grafias do mesmo rio e ordena por comprimento', () => {
    const nomes = r.todos.map((t) => t.nome);
    expect(
      r.todos.filter((t) => t.alvo).map((t) => t.nome.toLowerCase().replace('rio ', '')),
    ).toEqual(expect.arrayContaining(['piabanha', 'quitandinha']));
    expect(nomes.filter((n) => /piabanha/i.test(n))).toHaveLength(1); // Rio Piabanha, Piabanha e RIO PIABANHÁ juntos
    const kms = r.todos.map((t) => t.km);
    expect([...kms].sort((a, b) => b - a)).toEqual(kms);
  });

  it('rio alvo sem nenhum segmento aparece com zeros (para o relatório avisar)', () => {
    const rr = extrairRios(fixture(), { riosAlvo: ['Piabanha', 'Rio Inexistente'], bbox });
    expect(rr.alvos.find((a) => a.rio === 'Rio Inexistente')).toMatchObject({
      segmentos: 0,
      km: 0,
    });
  });
});

describe('extrairRios: dados incompletos', () => {
  it('ignora nós ausentes e ways com menos de 2 nós', () => {
    const elementos: ElementoOsm[] = [
      no(1, 0, 0),
      no(2, 100, 0),
      via(1, [1, 99, 2], { waterway: 'stream', name: 'Rio Piabanha' }), // o nó 99 não veio
      via(2, [1], { waterway: 'stream', name: 'Rio Piabanha' }),
      via(3, [98, 99], { waterway: 'stream', name: 'Rio Piabanha' }),
    ];
    const rr = extrairRios(elementos, { riosAlvo: ['Piabanha'] });
    expect(rr.segmentos.map((s) => s.osmWayId)).toEqual([1]);
  });

  it('entrada vazia dá resultado vazio', () => {
    const rr = extrairRios([], { riosAlvo: ['Piabanha'] });
    expect(rr.segmentos).toEqual([]);
    expect(rr.todos).toEqual([]);
  });
});
