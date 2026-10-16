/**
 * Extrai os rios do OpenStreetMap (hidrografia) para a etapa de desvio de rios.
 *
 *   pnpm grafo:rios                    usa o cache, se houver
 *   pnpm grafo:rios -- --atualizar     baixa de novo da Overpass
 *
 * Saída (ignorada pelo git por enquanto): tools/grafo/saida/rios-petropolis.geojson e
 * relatorio-rios.md. Os rios alvo ficam em RIOS_ALVO (src/config.ts).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { baixarOuUsarCache } from './baixar';
import { ALIASES_RIOS, BBOX_PETROPOLIS, RIOS_ALVO } from './config';
import { montarConsultaRios } from './consulta-rios';
import type { RespostaOverpass } from './osm';
import { gerarRelatorioRios } from './relatorio-rios';
import { extrairRios, paraGeoJson } from './rios';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const dirCache = `${raiz}cache`;
const dirSaida = `${raiz}saida`;

const atualizar = process.argv.includes('--atualizar');

const download = await baixarOuUsarCache({
  bbox: BBOX_PETROPOLIS,
  consulta: montarConsultaRios(BBOX_PETROPOLIS),
  prefixoCache: 'rios',
  dirCache,
  atualizar,
  log: (mensagem) => console.info(mensagem),
});

const resposta = JSON.parse(download.texto) as RespostaOverpass;
console.info(`Processando ${resposta.elements.length.toLocaleString('pt-BR')} elementos...`);
const resultado = extrairRios(resposta.elements, {
  riosAlvo: RIOS_ALVO,
  bbox: BBOX_PETROPOLIS,
  aliases: ALIASES_RIOS,
  absorverSemNome: true,
});

const geojson = JSON.stringify(paraGeoJson(resultado.segmentos));
const bytesGzip = gzipSync(geojson).length;

await mkdir(dirSaida, { recursive: true });
await writeFile(`${dirSaida}/rios-petropolis.geojson`, geojson);

const relatorio = gerarRelatorioRios({
  bbox: BBOX_PETROPOLIS,
  geradoEm: new Date(),
  riosAlvo: RIOS_ALVO,
  download: { bytes: download.bytes, doCache: download.doCache },
  resultado,
  saida: { bytes: Buffer.byteLength(geojson), bytesGzip },
});
await writeFile(`${dirSaida}/relatorio-rios.md`, relatorio);

console.info(`\n${relatorio}`);
console.info(`Rios gravados em ${dirSaida}/rios-petropolis.geojson`);
