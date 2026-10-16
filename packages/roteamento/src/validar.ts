import type { GrafoBruto } from './tipos';

const VERSAO_SUPORTADA = 1;

const falha = (mensagem: string): never => {
  throw new Error(`Grafo inválido: ${mensagem}`);
};

const ehNumeroFinito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Checagens baratas do formato do grafo (sem biblioteca de validação). Devolve o próprio objeto
 * já tipado, ou lança um Error em português dizendo o que está errado e onde.
 *
 * Não verifica o conteúdo geográfico (por exemplo, se o comprimento de cada aresta é coerente
 * com a geometria). O grafo vem de `tools/grafo`, que garante isso.
 */
export function validarGrafo(entrada: unknown): GrafoBruto {
  if (typeof entrada !== 'object' || entrada === null) {
    return falha('esperado um objeto com "versao", "nos" e "arestas".');
  }
  const grafo = entrada as Record<string, unknown>;

  if (grafo['versao'] !== VERSAO_SUPORTADA) {
    return falha(`versão ${String(grafo['versao'])} não suportada (esperado ${VERSAO_SUPORTADA}).`);
  }
  const nos = grafo['nos'];
  const arestas = grafo['arestas'];
  if (!Array.isArray(nos)) return falha('"nos" deve ser uma lista.');
  if (!Array.isArray(arestas)) return falha('"arestas" deve ser uma lista.');

  for (let i = 0; i < nos.length; i++) {
    const no = nos[i] as Record<string, unknown> | null;
    if (typeof no !== 'object' || no === null) return falha(`nos[${i}] deve ser um objeto.`);
    const lat = no['lat'];
    const lon = no['lon'];
    if (!ehNumeroFinito(lat) || lat < -90 || lat > 90) {
      return falha(`nos[${i}].lat deve ser um número entre -90 e 90.`);
    }
    if (!ehNumeroFinito(lon) || lon < -180 || lon > 180) {
      return falha(`nos[${i}].lon deve ser um número entre -180 e 180.`);
    }
  }

  for (let i = 0; i < arestas.length; i++) {
    const a = arestas[i] as Record<string, unknown> | null;
    if (typeof a !== 'object' || a === null) return falha(`arestas[${i}] deve ser um objeto.`);

    for (const campo of ['de', 'para'] as const) {
      const v = a[campo];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= nos.length) {
        return falha(
          `arestas[${i}].${campo} deve ser um índice válido de "nos" (0 a ${nos.length - 1}).`,
        );
      }
    }
    const comprimento = a['comprimentoM'];
    if (!ehNumeroFinito(comprimento) || comprimento <= 0) {
      return falha(`arestas[${i}].comprimentoM deve ser um número maior que zero.`);
    }
    const geometria = a['geometria'];
    if (!Array.isArray(geometria) || geometria.length < 2) {
      return falha(`arestas[${i}].geometria deve ter pelo menos 2 pontos [lat, lon].`);
    }
    for (let k = 0; k < geometria.length; k++) {
      const p = geometria[k] as unknown;
      if (!Array.isArray(p) || p.length !== 2 || !ehNumeroFinito(p[0]) || !ehNumeroFinito(p[1])) {
        return falha(`arestas[${i}].geometria[${k}] deve ser um par [lat, lon] de números.`);
      }
    }
    if (typeof a['classe'] !== 'string' || a['classe'] === '') {
      return falha(`arestas[${i}].classe deve ser um texto não vazio.`);
    }
    if (a['nome'] !== undefined && typeof a['nome'] !== 'string') {
      return falha(`arestas[${i}].nome, quando existe, deve ser um texto.`);
    }
    for (const campo of ['escada', 'ponte', 'tunel'] as const) {
      if (typeof a[campo] !== 'boolean')
        return falha(`arestas[${i}].${campo} deve ser verdadeiro ou falso.`);
    }
  }

  return entrada as GrafoBruto;
}
