/**
 * Carregamento dos dados de roteamento (grafo, rios e exposição) e criação do roteador e do desvio.
 *
 * PREGUIÇOSO: os três arquivos (~2 MB, no total) só são lidos quando `carregarRoteamento` é chamada
 * pela primeira vez, nunca na abertura do app (os `require` ficam dentro das funções). O resultado
 * fica em cache no módulo: `criarRoteador` e `criarDesvio` rodam uma vez.
 *
 * Os arquivos vêm de `pnpm dados:app` (copiados de tools/grafo/saida/) e ficam FORA do git. Cada
 * `require` está dentro de um try/catch: o Metro trata como dependência opcional, então o bundle
 * não quebra (nem o typecheck) quando os arquivos não existem; em vez disso, o erro só aparece, em
 * português, quando alguém tenta carregar. Caminho escolhido: `require` de JSON (veja o README do
 * app para o porquê e para a alternativa com expo-asset, se o tempo de carga for um problema).
 */
import { criarDesvio, type Desvio, type EstacaoCadastro, type RiosGeoJson } from '@aquascan/desvio';
import { criarRoteador, type GrafoBruto, type Roteador } from '@aquascan/roteamento';

export interface TemposDeCarga {
  /** Ler e interpretar os três arquivos (o `require` dos JSON), em ms. */
  leituraParseMs: number;
  criarRoteadorMs: number;
  criarDesvioMs: number;
  totalMs: number;
}

export interface ExposicaoBrutaApp {
  versao: number;
  grafo: { nos: number; arestas: number; sha256?: string };
  parametros: { passoM: number; faixasM: readonly number[]; trechoMaxM?: number };
  segmentos: { id: number; rio: string; osmWayId: number; coberto: boolean }[];
  entradas: readonly (readonly number[])[];
}

export interface Roteamento {
  roteador: Roteador;
  desvio: Desvio;
  grafo: GrafoBruto;
  rios: RiosGeoJson;
  estacoes: EstacaoCadastro[];
  tempos: TemposDeCarga;
}

const agoraMs = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const AJUDA =
  'Rode `pnpm dados:app` na raiz do repositório (depois de pnpm grafo:construir, grafo:rios e grafo:exposicao) e reinicie o Metro com `pnpm dev:mobile -- --clear`.';

function ausente(nome: string, causa: unknown): Error {
  const detalhe = causa instanceof Error ? ` (${causa.message.split('\n')[0]})` : '';
  return new Error(`Dados de roteamento ausentes: ${nome}${detalhe}. ${AJUDA}`);
}

// Um `require` literal por arquivo, cada um dentro de try/catch (dependência opcional do Metro).
function lerGrafo(): GrafoBruto {
  try {
    return require('../../assets/roteamento/grafo-petropolis.json') as GrafoBruto;
  } catch (e) {
    throw ausente('grafo-petropolis.json', e);
  }
}

function lerRios(): RiosGeoJson {
  try {
    return require('../../assets/roteamento/rios-petropolis.json') as RiosGeoJson;
  } catch (e) {
    throw ausente('rios-petropolis.json', e);
  }
}

function lerExposicao(): ExposicaoBrutaApp {
  try {
    return require('../../assets/roteamento/exposicao-petropolis.json') as ExposicaoBrutaApp;
  } catch (e) {
    throw ausente('exposicao-petropolis.json', e);
  }
}

interface Bruto {
  grafo: GrafoBruto;
  rios: RiosGeoJson;
  exposicao: ExposicaoBrutaApp;
  roteador: Roteador;
  leituraParseMs: number;
  criarRoteadorMs: number;
}

let bruto: Bruto | null = null;
let ultimoDesvio: { chave: string; desvio: Desvio; criarDesvioMs: number } | null = null;

function carregarBruto(): Bruto {
  if (bruto) return bruto;
  const t0 = agoraMs();
  const grafo = lerGrafo();
  const rios = lerRios();
  const exposicao = lerExposicao();
  const t1 = agoraMs();
  const roteador = criarRoteador(grafo);
  const t2 = agoraMs();
  bruto = {
    grafo,
    rios,
    exposicao,
    roteador,
    leituraParseMs: t1 - t0,
    criarRoteadorMs: t2 - t1,
  };
  return bruto;
}

/**
 * Carrega (uma vez) e devolve o roteador, o desvio e os tempos. As estações podem ser uma lista
 * ou uma função que as deriva dos rios já carregados (a prova usa a segunda forma).
 */
export function carregarRoteamento(
  estacoes: EstacaoCadastro[] | ((rios: RiosGeoJson) => EstacaoCadastro[]),
): Roteamento {
  const b = carregarBruto();
  const lista = typeof estacoes === 'function' ? estacoes(b.rios) : estacoes;
  const chave = JSON.stringify(lista);

  if (!ultimoDesvio || ultimoDesvio.chave !== chave) {
    const t = agoraMs();
    const desvio = criarDesvio(
      { roteador: b.roteador, exposicao: b.exposicao, rios: b.rios },
      lista,
    );
    ultimoDesvio = { chave, desvio, criarDesvioMs: agoraMs() - t };
  }
  return {
    roteador: b.roteador,
    desvio: ultimoDesvio.desvio,
    grafo: b.grafo,
    rios: b.rios,
    estacoes: lista,
    tempos: {
      leituraParseMs: b.leituraParseMs,
      criarRoteadorMs: b.criarRoteadorMs,
      criarDesvioMs: ultimoDesvio.criarDesvioMs,
      totalMs: b.leituraParseMs + b.criarRoteadorMs + ultimoDesvio.criarDesvioMs,
    },
  };
}
