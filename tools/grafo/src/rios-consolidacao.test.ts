import { describe, expect, it } from 'vitest';
import type { ElementoOsm, NoOsm, Tags, ViaOsm } from './osm';
import { gerarRelatorioRios } from './relatorio-rios';
import { BBOX_PETROPOLIS } from './config';
import { extrairRios, paraGeoJson } from './rios';

const LAT0 = -22.5;
const LON0 = -43.17;
const no = (id: number, x: number, y: number): NoOsm => ({
  type: 'node',
  id,
  lat: LAT0 + y / 111_195,
  lon: LON0 + x / (111_195 * Math.cos((LAT0 * Math.PI) / 180)),
});
const via = (id: number, nodes: number[], tags: Tags): ViaOsm => ({ type: 'way', id, nodes, tags });

const ALIASES = { pirabanha: 'Piabanha', quintandinha: 'Quitandinha' };

/**
 * Piabanha: W20 (nome certo) e W10 (nome certo), mais W30 com a grafia "Rio Pirabanha".
 * Sem nome: U1 sai do fim de W20, U2 sai do fim de U1 (cadeia), U3 está solta.
 * Outro nome: W40 "Rio Palatinado" toca o início de W10; U4 (sem nome) toca só o Palatinado.
 * Quitandinha: W50.
 */
const fixture = (): ElementoOsm[] => [
  no(1, 0, 0),
  no(2, 100, 0),
  no(3, 200, 0),
  no(4, 300, 0),
  no(5, 300, 100),
  no(6, 300, 200),
  no(7, 800, 800),
  no(8, 800, 900),
  no(9, 0, -100),
  no(10, 0, -200),
  no(11, 0, 500),
  no(12, 100, 500),
  no(13, 500, 0),
  no(14, 600, 0),
  via(20, [1, 2], { waterway: 'river', name: 'Rio Piabanha' }),
  via(10, [2, 3], { waterway: 'river', name: 'Rio Piabanha' }),
  via(30, [13, 14], { waterway: 'river', name: 'Rio Pirabanha' }),
  via(61, [3, 4], { waterway: 'stream' }), // U1
  via(62, [4, 5], { waterway: 'stream' }), // U2, só toca U1
  via(63, [7, 8], { waterway: 'stream' }), // U3, solta
  via(40, [1, 9], { waterway: 'river', name: 'Rio Palatinado' }),
  via(64, [9, 10], { waterway: 'stream' }), // U4, só toca o Palatinado
  via(50, [11, 12], { waterway: 'river', name: 'Rio Quitandinha' }),
];

const comTudo = (elementos = fixture()) =>
  extrairRios(elementos, {
    riosAlvo: ['Piabanha', 'Quitandinha'],
    aliases: ALIASES,
    absorverSemNome: true,
  });

describe('aliases (grafias alternativas)', () => {
  const r = comTudo();
  const seg = (wayId: number) => r.segmentos.find((s) => s.osmWayId === wayId);

  it('o nome alternativo entra como o rio alvo, marcado com alias', () => {
    expect(seg(30)).toMatchObject({
      rio: 'Piabanha',
      nomeOsm: 'Rio Pirabanha',
      alias: true,
      inferido: false,
    });
  });

  it('o nome certo não é alias', () => {
    expect(seg(20)).toMatchObject({ alias: false, inferido: false });
  });

  it('o relatório lista cada alias, com o way e o nome original', () => {
    const piabanha = r.alvos.find((a) => a.rio === 'Piabanha')!;
    expect(piabanha.aliases).toEqual([{ osmWayId: 30, nomeOsm: 'Rio Pirabanha' }]);
    const texto = gerarRelatorioRios({
      bbox: BBOX_PETROPOLIS,
      geradoEm: new Date('2026-10-16T12:00:00Z'),
      riosAlvo: ['Piabanha', 'Quitandinha'],
      download: { bytes: 1024, doCache: true },
      resultado: r,
      saida: { bytes: 100, bytesGzip: 50 },
    });
    expect(texto).toContain('Grafias alternativas');
    expect(texto).toMatch(/\| 30 \| Rio Pirabanha \|/);
  });

  it('sem a opção de aliases, a grafia alternativa continua de fora (comportamento antigo)', () => {
    const sem = extrairRios(fixture(), { riosAlvo: ['Piabanha', 'Quitandinha'] });
    expect(sem.segmentos.map((s) => s.osmWayId)).not.toContain(30);
  });

  it('um alias para um rio que não está na lista é ignorado', () => {
    const rr = extrairRios(fixture(), { riosAlvo: ['Quitandinha'], aliases: ALIASES });
    expect(rr.segmentos.map((s) => s.osmWayId)).toEqual([50]);
  });
});

describe('absorção de ways sem nome', () => {
  const r = comTudo();
  const ids = r.segmentos.map((s) => s.osmWayId);

  it('absorve o way sem nome que toca o rio e, em cadeia, o que toca esse (inferido)', () => {
    expect(ids).toContain(61);
    expect(ids).toContain(62);
    for (const wayId of [61, 62]) {
      expect(r.segmentos.find((s) => s.osmWayId === wayId)).toMatchObject({
        rio: 'Piabanha',
        inferido: true,
        alias: false,
        nomeOsm: null,
      });
    }
  });

  it('não absorve way sem nome que não se liga a nenhum rio alvo', () => {
    expect(ids).not.toContain(63);
  });

  it('NUNCA absorve um way que tenha outro nome, nem passa por ele para chegar a outro', () => {
    expect(ids).not.toContain(40); // Rio Palatinado toca o Piabanha, mas tem outro nome
    expect(ids).not.toContain(64); // só toca o Palatinado
  });

  it('o relatório lista os ways inferidos', () => {
    const piabanha = r.alvos.find((a) => a.rio === 'Piabanha')!;
    expect(piabanha.inferidos.map((x) => x.osmWayId)).toEqual([61, 62]);
    expect(piabanha.semNomeLigados).toEqual([]); // os que se ligavam foram absorvidos
    const texto = gerarRelatorioRios({
      bbox: BBOX_PETROPOLIS,
      geradoEm: new Date('2026-10-16T12:00:00Z'),
      riosAlvo: ['Piabanha'],
      download: { bytes: 1024, doCache: true },
      resultado: r,
      saida: { bytes: 100, bytesGzip: 50 },
    });
    expect(texto).toContain('Ways sem nome absorvidos');
    expect(texto).toMatch(/\| 61 \| stream \|/);
  });

  it('os inferidos entram no mesmo componente conexo do rio', () => {
    const piabanha = r.alvos.find((a) => a.rio === 'Piabanha')!;
    // W20 + W10 + U1 + U2 formam um componente; W30 (alias, solto) é outro.
    expect(piabanha.componentes.map((c) => c.segmentos)).toEqual([4, 1]);
  });

  it('sem a opção, nada é absorvido e os ways sem nome ligados só são listados (comportamento antigo)', () => {
    const sem = extrairRios(fixture(), { riosAlvo: ['Piabanha', 'Quitandinha'] });
    expect(sem.segmentos.map((s) => s.osmWayId)).not.toContain(61);
    expect(
      sem.alvos.find((a) => a.rio === 'Piabanha')!.semNomeLigados.map((w) => w.osmWayId),
    ).toEqual([61]);
  });

  it('um way sem nome que toca dois rios alvo fica com o primeiro da lista', () => {
    const elementos: ElementoOsm[] = [
      no(1, 0, 0),
      no(2, 100, 0),
      no(3, 200, 0),
      no(4, 300, 0),
      via(1, [1, 2], { waterway: 'river', name: 'Rio Piabanha' }),
      via(2, [3, 4], { waterway: 'river', name: 'Rio Quitandinha' }),
      via(3, [2, 3], { waterway: 'stream' }),
    ];
    const rr = extrairRios(elementos, {
      riosAlvo: ['Quitandinha', 'Piabanha'],
      absorverSemNome: true,
    });
    expect(rr.segmentos.find((s) => s.osmWayId === 3)!.rio).toBe('Quitandinha');
  });
});

describe('ids dos segmentos', () => {
  it('são sequenciais, ordenados por rio e depois por osmWayId', () => {
    const r = comTudo();
    expect(r.segmentos.map((s) => s.id)).toEqual(r.segmentos.map((_, i) => i));
    const chave = r.segmentos.map((s) => `${s.rio}|${String(s.osmWayId).padStart(6, '0')}`);
    expect(chave).toEqual([...chave].sort());
    expect(r.segmentos.map((s) => [s.rio, s.osmWayId])).toEqual([
      ['Piabanha', 10],
      ['Piabanha', 20],
      ['Piabanha', 30],
      ['Piabanha', 61],
      ['Piabanha', 62],
      ['Quitandinha', 50],
    ]);
  });

  it('são estáveis: a ordem dos elementos na resposta da Overpass não muda nada', () => {
    const embaralhado = [...fixture()].reverse();
    const a = comTudo();
    const b = comTudo(embaralhado);
    expect(b.segmentos.map((s) => [s.id, s.osmWayId, s.rio])).toEqual(
      a.segmentos.map((s) => [s.id, s.osmWayId, s.rio]),
    );
  });

  it('o GeoJSON traz as propriedades novas e mantém as antigas', () => {
    const geo = paraGeoJson(comTudo().segmentos);
    const f = geo.features.find((x) => x.properties.osmWayId === 30)!;
    expect(f.properties).toMatchObject({
      id: 2,
      osmWayId: 30,
      rio: 'Piabanha',
      nomeOsm: 'Rio Pirabanha',
      alias: true,
      inferido: false,
      waterway: 'river',
      coberto: false,
      tunnel: null,
      canal: false,
    });
    expect(Object.keys(f.properties)).toEqual(
      expect.arrayContaining(['covered', 'comprimentoM', 'coberto', 'canal']),
    );
    const inferido = geo.features.find((x) => x.properties.osmWayId === 61)!;
    expect(inferido.properties).toMatchObject({ inferido: true, nomeOsm: null });
  });

  it('o sentido do OSM segue preservado nos segmentos inferidos e nos aliases', () => {
    const r = comTudo();
    const u1 = r.segmentos.find((s) => s.osmWayId === 61)!;
    expect(u1.geometria[0]![1]).toBeCloseTo(
      LON0 + 200 / (111_195 * Math.cos((LAT0 * Math.PI) / 180)),
      6,
    );
  });
});
