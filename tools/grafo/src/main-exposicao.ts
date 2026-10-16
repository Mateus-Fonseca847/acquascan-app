/**
 * Calcula a exposição de cada rua do grafo aos rios alvo (terceira etapa de dados do desvio de rios).
 *
 *   pnpm grafo:exposicao
 *
 * Entrada (sem rede): tools/grafo/saida/grafo-petropolis.json e rios-petropolis.geojson, gerados
 * por `pnpm grafo:construir` e `pnpm grafo:rios`. Saída (ignorada pelo git): exposicao-petropolis.json
 * e relatorio-exposicao.md.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { caminhoDoCache } from './baixar';
import { analisarCobertura, type WaterwayParaCobertura } from './cobertura';
import { BBOX_PETROPOLIS, RIOS_ALVO } from './config';
import { montarConsultaRios } from './consulta-rios';
import type { Grafo } from './construir';
import {
  calcularExposicao,
  lerSegmentosGeoJson,
  montarArquivoExposicao,
  sha256Hex,
} from './exposicao';
import type { RespostaOverpass } from './osm';
import { gerarRelatorioExposicao, resumirExposicao } from './relatorio-exposicao';
import { lerVias } from './rios';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const dirCache = `${raiz}cache`;
const dirSaida = `${raiz}saida`;
const arquivoGrafo = `${dirSaida}/grafo-petropolis.json`;
const arquivoRios = `${dirSaida}/rios-petropolis.geojson`;

function falhar(mensagem: string): never {
  console.error(`\nErro: ${mensagem}\n`);
  process.exit(1);
}

if (!existsSync(arquivoGrafo)) {
  falhar(`falta ${arquivoGrafo}. Rode primeiro: pnpm grafo:construir`);
}
if (!existsSync(arquivoRios)) {
  falhar(`falta ${arquivoRios}. Rode primeiro: pnpm grafo:rios`);
}

const bytesGrafo = await readFile(arquivoGrafo);
const grafo = JSON.parse(bytesGrafo.toString('utf8')) as Grafo;
const sha256 = sha256Hex(bytesGrafo);

const bytesRios = await readFile(arquivoRios);
const shaRios = sha256Hex(bytesRios);

let segmentos;
try {
  segmentos = lerSegmentosGeoJson(JSON.parse(bytesRios.toString('utf8')));
} catch (erro) {
  falhar(erro instanceof Error ? erro.message : String(erro));
}

console.info(
  `Calculando a exposição de ${grafo.arestas.length.toLocaleString('pt-BR')} arestas a ${segmentos.length} segmentos de rio...`,
);
const resultado = calcularExposicao(grafo, segmentos);

// Cobertura do monitoramento: todos os waterways do cache bruto da Overpass (sem rede).
let cobertura = null;
const arquivoCache = caminhoDoCache(dirCache, montarConsultaRios(BBOX_PETROPOLIS), 'rios');
if (existsSync(arquivoCache)) {
  const bruto = JSON.parse(await readFile(arquivoCache, 'utf8')) as RespostaOverpass;
  const { viasRio } = lerVias(bruto.elements, { riosAlvo: RIOS_ALVO, bbox: BBOX_PETROPOLIS });
  const idsAlvo = new Set(segmentos.map((s) => s.osmWayId));
  const waterways: WaterwayParaCobertura[] = viasRio.map((v) => ({
    osmWayId: v.osmWayId,
    nome: v.nome,
    waterway: v.waterway,
    coberto: v.tunnel === 'culvert' || v.tunnel === 'yes',
    comprimentoM: v.comprimentoM,
    pontos: v.pontos,
    alvo: idsAlvo.has(v.osmWayId),
  }));
  cobertura = analisarCobertura(grafo, waterways);
} else {
  console.warn(
    `Cache dos rios não encontrado (${arquivoCache}); a análise de cobertura foi pulada.`,
  );
}

const arquivo = montarArquivoExposicao({
  geradoEm: new Date(),
  grafo: { nos: grafo.nos.length, arestas: grafo.arestas.length, sha256 },
  rios: { sha256: shaRios },
  segmentos,
  resultado,
});
const json = JSON.stringify(arquivo);
const bytesGzip = gzipSync(json).length;

await mkdir(dirSaida, { recursive: true });
await writeFile(`${dirSaida}/exposicao-petropolis.json`, json);

const relatorio = gerarRelatorioExposicao({
  bbox: BBOX_PETROPOLIS,
  geradoEm: new Date(arquivo.geradoEm),
  grafo: arquivo.grafo,
  parametros: arquivo.parametros,
  resumo: resumirExposicao(grafo, segmentos, resultado.entradas),
  cobertura,
  saida: {
    bytes: Buffer.byteLength(json),
    bytesGzip,
    entradas: arquivo.entradas.length,
    segmentos: arquivo.segmentos.length,
  },
});
await writeFile(`${dirSaida}/relatorio-exposicao.md`, relatorio);

console.info(`\n${relatorio}`);
console.info(`Exposição gravada em ${dirSaida}/exposicao-petropolis.json`);
