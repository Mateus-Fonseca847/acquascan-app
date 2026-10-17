/**
 * Lógica pura do `pnpm dados:app`: confere se o grafo, os rios e a exposição são da MESMA geração
 * antes de copiá-los para o app, e monta o `versao.json`. Sem disco nem rede (o main faz isso).
 */

/** O que o comando manda fazer quando os arquivos não combinam. */
export const COMO_REGERAR =
  'Rode em sequência: pnpm grafo:construir, pnpm grafo:rios e pnpm grafo:exposicao.';

/** Pedaço do arquivo de exposição que a conferência lê. */
export interface ExposicaoParaConferir {
  grafo?: { nos?: number; arestas?: number; sha256?: string };
  rios?: { sha256?: string };
}

export interface EntradaConferencia {
  exposicao: ExposicaoParaConferir;
  /** sha256 do arquivo grafo-petropolis.json que será copiado. */
  shaGrafo: string;
  /** sha256 do arquivo rios-petropolis.geojson que será copiado. */
  shaRios: string;
  /** Número de arestas do grafo que será copiado. */
  arestasDoGrafo: number;
}

/**
 * Devolve os problemas encontrados, em português (lista vazia = tudo consistente):
 * o sha256 do grafo e o dos rios registrados na exposição têm de bater com os arquivos, e o
 * número de arestas também.
 */
export function conferirConsistencia(d: EntradaConferencia): string[] {
  const problemas: string[] = [];
  const grafo = d.exposicao.grafo;

  if (grafo?.sha256 === undefined) {
    problemas.push('A exposição não registra o sha256 do grafo (arquivo de uma versão antiga).');
  } else if (grafo.sha256 !== d.shaGrafo) {
    problemas.push(
      'O grafo não é o mesmo com que a exposição foi calculada (o sha256 do grafo não bate).',
    );
  }

  const shaRiosRegistrado = d.exposicao.rios?.sha256;
  if (shaRiosRegistrado === undefined) {
    problemas.push('A exposição não registra o sha256 dos rios (arquivo de uma versão antiga).');
  } else if (shaRiosRegistrado !== d.shaRios) {
    problemas.push(
      'Os rios não são os mesmos com que a exposição foi calculada (o sha256 dos rios não bate).',
    );
  }

  if (grafo?.arestas === undefined) {
    problemas.push('A exposição não registra o número de arestas do grafo.');
  } else if (grafo.arestas !== d.arestasDoGrafo) {
    problemas.push(
      `A exposição foi calculada para ${grafo.arestas} arestas, mas o grafo tem ${d.arestasDoGrafo}.`,
    );
  }
  return problemas;
}

/** A mensagem de erro completa, com o que fazer. Vazia se não há problemas. */
export function mensagemDeInconsistencia(problemas: readonly string[]): string {
  if (problemas.length === 0) return '';
  return `Os arquivos de roteamento não são da mesma geração:\n- ${problemas.join('\n- ')}\n${COMO_REGERAR}`;
}

export interface VersaoDados {
  geradoEm: string;
  grafo: { sha256: string; nos: number; arestas: number };
  rios: { sha256: string };
  exposicao: { sha256: string };
}

/** O conteúdo do versao.json: os três hashes e a data. */
export function montarVersaoDados(d: {
  geradoEm: Date;
  grafo: { sha256: string; nos: number; arestas: number };
  shaRios: string;
  shaExposicao: string;
}): VersaoDados {
  return {
    geradoEm: d.geradoEm.toISOString(),
    grafo: d.grafo,
    rios: { sha256: d.shaRios },
    exposicao: { sha256: d.shaExposicao },
  };
}
