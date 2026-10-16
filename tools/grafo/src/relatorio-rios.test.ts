import { describe, expect, it } from 'vitest';
import { BBOX_PETROPOLIS } from './config';
import type { ElementoOsm, NoOsm, Tags, ViaOsm } from './osm';
import { gerarRelatorioRios } from './relatorio-rios';
import { extrairRios } from './rios';

const LAT0 = -22.5;
const LON0 = -43.17;
const no = (id: number, x: number, y: number): NoOsm => ({
  type: 'node',
  id,
  lat: LAT0 + y / 111_195,
  lon: LON0 + x / (111_195 * Math.cos((LAT0 * Math.PI) / 180)),
});
const via = (id: number, nodes: number[], tags: Tags): ViaOsm => ({ type: 'way', id, nodes, tags });

const elementos: ElementoOsm[] = [
  no(1, 0, 0),
  no(2, 200, 0),
  no(3, 220, 0),
  no(4, 400, 0),
  no(5, 0, 500),
  no(6, 300, 500),
  no(7, 200, 80),
  via(1, [1, 2], { waterway: 'river', name: 'Rio Piabanha' }),
  via(2, [3, 4], { waterway: 'stream', name: 'Rio Piabanha', tunnel: 'culvert' }),
  via(3, [5, 6], { waterway: 'river', name: 'Rio Palatinado' }),
  via(4, [2, 7], { waterway: 'stream' }),
];

const montar = (riosAlvo: string[]) =>
  gerarRelatorioRios({
    bbox: BBOX_PETROPOLIS,
    geradoEm: new Date('2026-10-16T12:00:00Z'),
    riosAlvo,
    download: { bytes: 2 * 1024 * 1024, doCache: false },
    resultado: extrairRios(elementos, { riosAlvo }),
    saida: { bytes: 4096, bytesGzip: 1024 },
  });

describe('gerarRelatorioRios', () => {
  const texto = montar(['Piabanha']);

  it('traz as três seções e a atribuição do OSM', () => {
    expect(texto).toContain('## 1. Todos os waterways nomeados');
    expect(texto).toContain('## 2. Rios alvo');
    expect(texto).toContain('## 3. Arquivo de saída');
    expect(texto).toContain('colaboradores do OpenStreetMap');
    expect(texto).toContain('GeoJSON com gzip');
  });

  it('a tabela de todos os rios mostra também os que não são alvo', () => {
    expect(texto).toMatch(/\| Rio Palatinado \| river 0\.3 \| 0,3 \| 0 \| 1 \| {2}\|/);
    expect(texto).toMatch(/\| Rio Piabanha \| .* \| sim \|/);
  });

  it('o rio alvo mostra km, cobertura, componentes, lacuna e way sem nome ligado', () => {
    expect(texto).toContain('### Piabanha');
    expect(texto).toContain('Componentes conexos: 2');
    expect(texto).toMatch(/\| 20 \| -?\d+\.\d+, -?\d+\.\d+ \| 1 e 2 \|/);
    expect(texto).toMatch(/\| 4 \| stream \| 0,08 \|/);
    expect(texto).toContain('nada foi unido');
  });

  it('avisa quando um rio alvo não foi encontrado', () => {
    const t = montar(['Piabanha', 'Rio Que Nao Existe']);
    expect(t).toContain('### Rio Que Nao Existe');
    expect(t).toContain('Nenhum segmento encontrado');
  });
});
