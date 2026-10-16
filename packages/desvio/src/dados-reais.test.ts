/**
 * Dados reais de Petrópolis (gerados por tools/grafo). Só roda se os três arquivos existirem.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { criarRoteador } from '@acquascan/roteamento';
import { describe, expect, it } from 'vitest';
import { criarDesvio, type RiosGeoJson } from './index';

const pasta = fileURLToPath(new URL('../../../tools/grafo/saida/', import.meta.url));
const arquivos = [
  'grafo-petropolis.json',
  'exposicao-petropolis.json',
  'rios-petropolis.geojson',
].map((n) => pasta + n);
const existem = arquivos.every((a) => existsSync(a));

/** Um ponto sobre o rio (o meio do primeiro segmento com esse nome). */
function pontoNoRio(rios: RiosGeoJson, nome: string) {
  const f = rios.features.find((x) => x.properties.rio === nome)!;
  const c = f.geometry.coordinates[Math.floor(f.geometry.coordinates.length / 2)]!;
  return { latitude: c[1]!, longitude: c[0]! };
}

describe.skipIf(!existem)('dados reais de Petrópolis', () => {
  it('os três arquivos combinam e o desvio roda', () => {
    const [g, e, r] = arquivos.map((a) => JSON.parse(readFileSync(a, 'utf8')));
    const roteador = criarRoteador(g);
    const desvio = criarDesvio({ roteador, exposicao: e, rios: r }, [
      { id: 1, rio: 'Rio Piabanha', ...pontoNoRio(r, 'Piabanha') },
    ]);
    const cobertura = desvio.resumoCobertura();
    expect(cobertura.kmTotal).toBeGreaterThan(5);
    expect(cobertura.kmMonitorado).toBeGreaterThan(0);
    const agora = new Date('2026-03-10T12:00:00Z');
    const seg = desvio.estadoDosSegmentos(
      [{ estacaoId: 1, estado: 'CRITICO', medidoEm: agora.toISOString() }],
      agora,
    );
    expect([...seg.values()].some((s) => s.estado === 'CRITICO')).toBe(true);
  });
});
