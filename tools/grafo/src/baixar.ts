/**
 * Download dos dados do OpenStreetMap pela Overpass API.
 *
 * Uma única consulta por execução, e só quando não há cache. A API pública é de uso comunitário:
 * nunca consultamos em laço nem sem cache. A resposta bruta fica em `cache/` e é reaproveitada
 * nas execuções seguintes (use `--atualizar` para baixar de novo).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OVERPASS_URL, USER_AGENT, type Bbox } from './config';

/** Tempo máximo da consulta no servidor (segundos) e no nosso fetch (ms, com folga). */
const TIMEOUT_SERVIDOR_S = 180;
const TIMEOUT_FETCH_MS = 240_000;
/** Depois da primeira tentativa, no máximo 2 novas, com espera crescente. */
const NOVAS_TENTATIVAS = 2;
const ESPERA_BASE_MS = 5_000;

/**
 * Todos os ways `highway` dentro da caixa (sul, oeste, norte, leste) e, pela recursão `>`, os
 * nós de cada um. `out body` devolve ids, coordenadas e tags.
 */
export function montarConsulta(bbox: Bbox): string {
  const caixa = `${bbox.sul},${bbox.oeste},${bbox.norte},${bbox.leste}`;
  return `[out:json][timeout:${TIMEOUT_SERVIDOR_S}];way["highway"](${caixa});(._;>;);out body;`;
}

export interface OpcoesBaixar {
  bbox: Bbox;
  /** Outra consulta Overpass (padrão: as ruas). A chave do cache vem dela. */
  consulta?: string;
  /** Prefixo do nome do arquivo de cache (padrão: `overpass`). */
  prefixoCache?: string;
  dirCache: string;
  atualizar?: boolean;
  /** Para os testes. */
  fetchImpl?: typeof fetch;
  dormir?: (ms: number) => Promise<void>;
  log?: (mensagem: string) => void;
  url?: string;
}

export interface ResultadoDownload {
  /** JSON bruto da Overpass, exatamente como veio. */
  texto: string;
  bytes: number;
  doCache: boolean;
  arquivoCache: string;
}

const esperarPadrao = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Erros que valem uma nova tentativa: rede, tempo esgotado, 429 e 5xx. Os demais 4xx não. */
class ErroTemporario extends Error {}

async function consultar(consulta: string, url: string, fetchImpl: typeof fetch): Promise<string> {
  let resposta: Response;
  try {
    resposta = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
        'user-agent': USER_AGENT,
      },
      body: `data=${encodeURIComponent(consulta)}`,
      signal: AbortSignal.timeout(TIMEOUT_FETCH_MS),
    });
  } catch {
    throw new ErroTemporario('falha de rede ou tempo esgotado ao consultar a Overpass');
  }

  if (resposta.status === 429 || resposta.status >= 500) {
    throw new ErroTemporario(`Overpass respondeu ${resposta.status}`);
  }
  if (!resposta.ok) {
    throw new Error(`Overpass respondeu ${resposta.status}; a consulta foi recusada`);
  }

  const texto = await resposta.text();
  // A Overpass pode responder 200 com um aviso de erro e dados PARCIAIS (ex.: consulta que
  // estourou o tempo). Isso não pode ser guardado como se fosse a resposta completa.
  let corpo: { remark?: unknown; elements?: unknown };
  try {
    corpo = JSON.parse(texto);
  } catch {
    throw new ErroTemporario('a Overpass devolveu uma resposta que não é JSON');
  }
  if (typeof corpo.remark === 'string' && /error|timed out|out of memory/i.test(corpo.remark)) {
    throw new ErroTemporario(`a Overpass avisou: ${corpo.remark}`);
  }
  if (!Array.isArray(corpo.elements)) {
    throw new Error('resposta da Overpass sem a lista "elements"');
  }
  return texto;
}

/** Onde fica (ou ficaria) o cache de uma consulta. O nome vem de um hash da própria consulta. */
export function caminhoDoCache(dirCache: string, consulta: string, prefixo = 'overpass'): string {
  const chave = createHash('sha1').update(consulta).digest('hex').slice(0, 12);
  return join(dirCache, `${prefixo}-${chave}.json`);
}

export async function baixarOuUsarCache(opcoes: OpcoesBaixar): Promise<ResultadoDownload> {
  const log = opcoes.log ?? (() => {});
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  const dormir = opcoes.dormir ?? esperarPadrao;
  const consulta = opcoes.consulta ?? montarConsulta(opcoes.bbox);
  // A chave do cache é a própria consulta: mudar a caixa usa outro arquivo.
  const arquivoCache = caminhoDoCache(opcoes.dirCache, consulta, opcoes.prefixoCache);

  if (!opcoes.atualizar) {
    try {
      const texto = await readFile(arquivoCache, 'utf8');
      log(`Usando o cache (${arquivoCache}). Use --atualizar para baixar de novo.`);
      return { texto, bytes: Buffer.byteLength(texto), doCache: true, arquivoCache };
    } catch {
      // sem cache: baixa
    }
  }

  let ultimoErro: unknown;
  for (let tentativa = 0; tentativa <= NOVAS_TENTATIVAS; tentativa++) {
    if (tentativa > 0) {
      const espera = ESPERA_BASE_MS * tentativa;
      log(`Nova tentativa ${tentativa}/${NOVAS_TENTATIVAS} em ${espera / 1000} s...`);
      await dormir(espera);
    }
    try {
      log('Consultando a Overpass API (uma consulta só)...');
      const texto = await consultar(consulta, opcoes.url ?? OVERPASS_URL, fetchImpl);

      await mkdir(opcoes.dirCache, { recursive: true });
      const temporario = `${arquivoCache}.parcial`;
      await writeFile(temporario, texto);
      await rename(temporario, arquivoCache); // o cache nunca fica pela metade
      return { texto, bytes: Buffer.byteLength(texto), doCache: false, arquivoCache };
    } catch (erro) {
      ultimoErro = erro;
      if (!(erro instanceof ErroTemporario)) throw erro;
      log(`Falhou: ${erro.message}`);
    }
  }
  throw new Error(
    `Não foi possível baixar os dados depois de ${NOVAS_TENTATIVAS + 1} tentativas: ${
      ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)
    }`,
  );
}
