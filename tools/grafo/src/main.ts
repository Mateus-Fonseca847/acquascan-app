/**
 * Constrói o grafo de ruas a pé de Petrópolis.
 *
 *   pnpm grafo:construir               usa o cache, se houver
 *   pnpm grafo:construir -- --atualizar   baixa de novo da Overpass
 *
 * Saída (ignorada pelo git por enquanto): tools/grafo/saida/grafo-petropolis.json e relatorio.md
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { baixarOuUsarCache } from './baixar';
import { BBOX_PETROPOLIS } from './config';
import { construirGrafo } from './construir';
import type { RespostaOverpass } from './osm';
import { calcularMetricas, gerarRelatorio } from './relatorio';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const dirCache = `${raiz}cache`;
const dirSaida = `${raiz}saida`;

const atualizar = process.argv.includes('--atualizar');

const download = await baixarOuUsarCache({
  bbox: BBOX_PETROPOLIS,
  dirCache,
  atualizar,
  log: (mensagem) => console.info(mensagem),
});

const resposta = JSON.parse(download.texto) as RespostaOverpass;
console.info(
  `Construindo o grafo a partir de ${resposta.elements.length.toLocaleString('pt-BR')} elementos...`,
);
const { grafo, estatisticas } = construirGrafo(resposta.elements);

const json = JSON.stringify(grafo);
const bytesGzip = gzipSync(json).length;

await mkdir(dirSaida, { recursive: true });
await writeFile(`${dirSaida}/grafo-petropolis.json`, json);

const relatorio = gerarRelatorio({
  bbox: BBOX_PETROPOLIS,
  geradoEm: new Date(),
  download: { bytes: download.bytes, doCache: download.doCache },
  estatisticas,
  metricas: calcularMetricas(grafo),
  saida: { bytes: Buffer.byteLength(json), bytesGzip },
});
await writeFile(`${dirSaida}/relatorio.md`, relatorio);

console.info(`\n${relatorio}`);
console.info(`Grafo gravado em ${dirSaida}/grafo-petropolis.json`);
