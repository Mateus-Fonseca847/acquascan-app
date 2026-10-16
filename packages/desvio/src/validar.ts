import type { ExposicaoBruta, RiosGeoJson } from './tipos';

const falha = (mensagem: string): never => {
  throw new Error(mensagem);
};

const VERSAO_SUPORTADA = 1;
const COLUNAS_DA_ENTRADA = 7;

/**
 * Confere o formato da exposição e dos rios e se combinam entre si e com o roteador. Os erros
 * explicam o que está errado e o que fazer. O hash dos arquivos NÃO é comparado aqui (o app não
 * calcula sha256): quem empacota os arquivos confere `grafo.sha256` e `rios.sha256`.
 */
export function validarDados(
  exposicao: ExposicaoBruta,
  rios: RiosGeoJson,
  totalArestas: number,
  faixasNecessarias: readonly number[],
): void {
  if (typeof exposicao !== 'object' || exposicao === null) {
    falha('Exposição inválida: esperado o conteúdo de exposicao-petropolis.json.');
  }
  if (exposicao.versao !== VERSAO_SUPORTADA) {
    falha(
      `Exposição inválida: versão ${String(exposicao.versao)} não suportada (esperado ${VERSAO_SUPORTADA}). Gere o arquivo de novo com \`pnpm grafo:exposicao\`.`,
    );
  }
  if (!Array.isArray(exposicao.entradas) || !Array.isArray(exposicao.segmentos)) {
    falha('Exposição inválida: faltam as listas "segmentos" e "entradas".');
  }
  if (exposicao.grafo?.arestas !== totalArestas) {
    falha(
      `A exposição foi calculada para um grafo de ${String(exposicao.grafo?.arestas)} arestas, mas o roteador tem ${totalArestas}. Os arquivos são de gerações diferentes: gere a exposição de novo com \`pnpm grafo:exposicao\`.`,
    );
  }
  const faixas = exposicao.parametros?.faixasM;
  if (!Array.isArray(faixas) || faixas.length !== 3) {
    falha('Exposição inválida: "parametros.faixasM" deve ter as 3 faixas (15, 30 e 50 m).');
  }
  for (const faixa of faixasNecessarias) {
    if (!faixas.includes(faixa)) {
      falha(
        `A política usa a faixa de ${faixa} m, mas a exposição só tem as faixas ${faixas.join(', ')} m.`,
      );
    }
  }

  if (!rios || !Array.isArray(rios.features)) {
    falha('Rios inválidos: esperado o GeoJSON de rios-petropolis.geojson (FeatureCollection).');
  }
  const idsDosRios = new Set<number>();
  rios.features.forEach((f, i) => {
    const id = f?.properties?.id;
    if (typeof id !== 'number') {
      falha(
        `Rios inválidos: o segmento ${i} não tem "id" (GeoJSON de uma versão antiga). Rode \`pnpm grafo:rios\` de novo.`,
      );
    }
    if (
      f.geometry?.type !== 'LineString' ||
      !Array.isArray(f.geometry.coordinates) ||
      f.geometry.coordinates.length < 2
    ) {
      falha(`Rios inválidos: o segmento ${id} não é um LineString com pelo menos 2 pontos.`);
    }
    idsDosRios.add(id);
  });

  for (const s of exposicao.segmentos) {
    if (!idsDosRios.has(s.id)) {
      falha(
        `O segmento ${s.id} (${s.rio}) da exposição não está no GeoJSON dos rios: os arquivos são de gerações diferentes. Gere a exposição de novo com \`pnpm grafo:exposicao\`.`,
      );
    }
  }
  const idsDaExposicao = new Set(exposicao.segmentos.map((s) => s.id));
  exposicao.entradas.forEach((e, i) => {
    if (!Array.isArray(e) || e.length !== COLUNAS_DA_ENTRADA) {
      falha(`Exposição inválida: a entrada ${i} deve ter ${COLUNAS_DA_ENTRADA} números.`);
    }
    const aresta = e[0]!;
    if (!Number.isInteger(aresta) || aresta < 0 || aresta >= totalArestas) {
      falha(
        `Exposição inválida: a entrada ${i} aponta para a aresta ${aresta}, que não existe no grafo.`,
      );
    }
    if (!idsDaExposicao.has(e[1]!)) {
      falha(
        `Exposição inválida: a entrada ${i} aponta para o segmento ${e[1]}, que não está em "segmentos".`,
      );
    }
  });
}
