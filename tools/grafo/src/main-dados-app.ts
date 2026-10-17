/**
 * Copia os dados de roteamento (grafo, rios e exposição) para o app.
 *
 *   pnpm dados:app
 *
 * Origem: tools/grafo/saida/. Destino: apps/mobile/assets/roteamento/ (ignorado pelo git por
 * enquanto: os arquivos são derivados do OpenStreetMap, e a licença ODbL pede atribuição).
 * Antes de copiar, confere se os três arquivos são da mesma geração; se não forem, falha e manda
 * regerar. Grava também versao.json com os três hashes e a data.
 */
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  COMO_REGERAR,
  conferirConsistencia,
  mensagemDeInconsistencia,
  montarVersaoDados,
} from './dados-app';
import { sha256Hex } from './exposicao';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const dirSaida = `${raiz}saida`;
const dirApp = fileURLToPath(new URL('../../../apps/mobile/assets/roteamento', import.meta.url));

// `destino`: o Metro só carrega dados com a extensão .json, então os rios (.geojson na origem)
// vão para o app como .json.
const ARQUIVOS = [
  {
    nome: 'grafo-petropolis.json',
    destino: 'grafo-petropolis.json',
    comando: 'pnpm grafo:construir',
  },
  { nome: 'rios-petropolis.geojson', destino: 'rios-petropolis.json', comando: 'pnpm grafo:rios' },
  {
    nome: 'exposicao-petropolis.json',
    destino: 'exposicao-petropolis.json',
    comando: 'pnpm grafo:exposicao',
  },
] as const;

for (const a of ARQUIVOS) {
  if (!existsSync(`${dirSaida}/${a.nome}`)) {
    console.error(`Falta ${a.nome} em tools/grafo/saida. Rode ${a.comando}. ${COMO_REGERAR}`);
    process.exit(1);
  }
}

const [bytesGrafo, bytesRios, bytesExposicao] = await Promise.all(
  ARQUIVOS.map((a) => readFile(`${dirSaida}/${a.nome}`)),
);
const grafo = JSON.parse(bytesGrafo!.toString('utf8')) as { nos: unknown[]; arestas: unknown[] };
const exposicao = JSON.parse(bytesExposicao!.toString('utf8'));

const shaGrafo = sha256Hex(bytesGrafo!);
const shaRios = sha256Hex(bytesRios!);
const shaExposicao = sha256Hex(bytesExposicao!);

const problemas = conferirConsistencia({
  exposicao,
  shaGrafo,
  shaRios,
  arestasDoGrafo: grafo.arestas.length,
});
if (problemas.length > 0) {
  console.error(mensagemDeInconsistencia(problemas));
  process.exit(1);
}

await mkdir(dirApp, { recursive: true });
for (const a of ARQUIVOS) await copyFile(`${dirSaida}/${a.nome}`, `${dirApp}/${a.destino}`);
const versao = montarVersaoDados({
  geradoEm: new Date(),
  grafo: { sha256: shaGrafo, nos: grafo.nos.length, arestas: grafo.arestas.length },
  shaRios,
  shaExposicao,
});
await writeFile(`${dirApp}/versao.json`, `${JSON.stringify(versao, null, 2)}\n`);

console.info(`Dados copiados para ${dirApp}`);
console.info(
  `  grafo ${shaGrafo.slice(0, 12)} (${grafo.arestas.length} arestas), rios ${shaRios.slice(0, 12)}, exposição ${shaExposicao.slice(0, 12)}`,
);
