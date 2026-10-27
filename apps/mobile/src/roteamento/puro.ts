/**
 * Funções PURAS da prova de roteamento (sem React nem módulos nativos): escolha das estações
 * hipotéticas, sorteio dos pares, estatísticas e formatação. O app não tem runner de testes; estas
 * funções são testadas pelo vitest de tools/grafo (src/prova-app.test.ts), que as importa daqui.
 *
 * Só `import type`: nada aqui pode puxar código de plataforma.
 */
import type { EstacaoCadastro, LeituraEstacao, RiosGeoJson } from '@aquascan/desvio';
import type { LatLng } from '@aquascan/roteamento';

/** Gerador pseudoaleatório determinístico (mulberry32): a mesma semente dá a mesma sequência. */
export function mulberry32(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Estatistica {
  n: number;
  mediana: number;
  p95: number;
  max: number;
}

/** Mediana, percentil 95 (posição `floor(0,95 × n)`, limitada ao último) e máximo. */
export function estatisticas(valores: readonly number[]): Estatistica {
  if (valores.length === 0) return { n: 0, mediana: 0, p95: 0, max: 0 };
  const ordenados = [...valores].sort((a, b) => a - b);
  const n = ordenados.length;
  return {
    n,
    mediana: ordenados[Math.floor(n / 2)]!,
    p95: ordenados[Math.min(n - 1, Math.floor(n * 0.95))]!,
    max: ordenados[n - 1]!,
  };
}

export function media(valores: readonly number[]): number {
  return valores.length === 0 ? 0 : valores.reduce((s, v) => s + v, 0) / valores.length;
}

/** "12,3 ms" (uma casa; duas abaixo de 1 ms). */
export function formatarMs(ms: number): string {
  const casas = ms < 1 ? 2 : 1;
  return `${ms.toFixed(casas).replace('.', ',')} ms`;
}

/** Sorteia `quantidade` pares de vértices do grafo (origem e destino diferentes). */
export function escolherPares(
  nos: readonly { lat: number; lon: number }[],
  quantidade: number,
  semente: number,
): { origem: LatLng; destino: LatLng }[] {
  if (nos.length < 2) return [];
  const rnd = mulberry32(semente);
  const pares: { origem: LatLng; destino: LatLng }[] = [];
  while (pares.length < quantidade) {
    const a = Math.floor(rnd() * nos.length);
    const b = Math.floor(rnd() * nos.length);
    if (a === b) continue;
    const na = nos[a]!;
    const nb = nos[b]!;
    pares.push({
      origem: { latitude: na.lat, longitude: na.lon },
      destino: { latitude: nb.lat, longitude: nb.lon },
    });
  }
  return pares;
}

const RAIO_TERRA_M = 6_371_008.8;

function distanciaM(a: readonly number[], b: readonly number[]): number {
  // [lon, lat] (GeoJSON)
  const rad = Math.PI / 180;
  const dLat = (b[1]! - a[1]!) * rad;
  const dLon = (b[0]! - a[0]!) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1]! * rad) * Math.cos(b[1]! * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** O ponto no meio (em comprimento) de uma polilinha GeoJSON [lon, lat]. */
export function pontoMedio(coordenadas: readonly (readonly number[])[]): LatLng {
  let total = 0;
  for (let i = 1; i < coordenadas.length; i++)
    total += distanciaM(coordenadas[i - 1]!, coordenadas[i]!);
  let alvo = total / 2;
  for (let i = 1; i < coordenadas.length; i++) {
    const a = coordenadas[i - 1]!;
    const b = coordenadas[i]!;
    const l = distanciaM(a, b);
    if (alvo <= l && l > 0) {
      const t = alvo / l;
      return {
        latitude: a[1]! + t * (b[1]! - a[1]!),
        longitude: a[0]! + t * (b[0]! - a[0]!),
      };
    }
    alvo -= l;
  }
  const ultimo = coordenadas[coordenadas.length - 1]!;
  return { latitude: ultimo[1]!, longitude: ultimo[0]! };
}

/**
 * O ponto médio do trecho em que cai a fração `fracao` (0 a 1) do comprimento do rio, com os
 * trechos na ordem do OSM (osmWayId e posição dentro do way). Nulo se o rio não tem trechos.
 */
export function pontoNoRio(rios: RiosGeoJson, rio: string, fracao: number): LatLng | null {
  const trechos = rios.features
    .filter((f) => f.properties.rio === rio)
    .map((f) => ({
      ordem: [
        (f.properties as { osmWayId?: number }).osmWayId ?? 0,
        (f.properties as { indice?: number }).indice ?? 0,
      ] as const,
      coordenadas: f.geometry.coordinates,
      comprimentoM:
        f.properties.comprimentoM ??
        f.geometry.coordinates.reduce(
          (s, c, i, v) => (i === 0 ? s : s + distanciaM(v[i - 1]!, c)),
          0,
        ),
    }))
    .sort((a, b) => a.ordem[0] - b.ordem[0] || a.ordem[1] - b.ordem[1]);
  if (trechos.length === 0) return null;
  const total = trechos.reduce((s, t) => s + t.comprimentoM, 0);
  const alvo = Math.min(1, Math.max(0, fracao)) * total;
  let acumulado = 0;
  for (const t of trechos) {
    acumulado += t.comprimentoM;
    if (alvo <= acumulado) return pontoMedio(t.coordenadas);
  }
  return pontoMedio(trechos[trechos.length - 1]!.coordenadas);
}

/**
 * As três estações HIPOTÉTICAS da prova, derivadas do GeoJSON (nada de coordenada escrita à mão):
 * duas no Piabanha (a 25% e a 75% do comprimento) e uma no Quitandinha (a 50%).
 */
export function escolherEstacoesHipoteticas(rios: RiosGeoJson): EstacaoCadastro[] {
  const pedidos: { id: number; rio: string; nomeNoCadastro: string; fracao: number }[] = [
    { id: 1, rio: 'Piabanha', nomeNoCadastro: 'Rio Piabanha', fracao: 0.25 },
    { id: 2, rio: 'Piabanha', nomeNoCadastro: 'Rio Piabanha', fracao: 0.75 },
    { id: 3, rio: 'Quitandinha', nomeNoCadastro: 'Rio Quitandinha', fracao: 0.5 },
  ];
  const estacoes: EstacaoCadastro[] = [];
  for (const p of pedidos) {
    const ponto = pontoNoRio(rios, p.rio, p.fracao);
    if (ponto) estacoes.push({ id: p.id, rio: p.nomeNoCadastro, ...ponto });
  }
  return estacoes;
}

/** Uma leitura recente com o mesmo estado para todas as estações. */
export function leiturasComEstado(
  estacoes: readonly EstacaoCadastro[],
  estado: 'ESTAVEL' | 'ATENCAO' | 'CRITICO',
  agora: Date,
): LeituraEstacao[] {
  return estacoes.map((e) => ({
    estacaoId: e.id,
    estado,
    medidoEm: new Date(agora.getTime() - 60_000).toISOString(),
  }));
}
