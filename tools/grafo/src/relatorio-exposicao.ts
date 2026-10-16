/**
 * Resumo e relatório da exposição das ruas aos rios. Lógica pura: quem grava é o main-exposicao.ts.
 */
import type { ResultadoCobertura } from './cobertura';
import type { Bbox } from './config';
import type { Grafo } from './construir';
import type { EntradaExposicao, SegmentoParaExposicao } from './exposicao';
import { formatarBytes } from './relatorio';

const FAIXAS_ROTULO = ['até 15 m', 'até 30 m', 'até 50 m'] as const;

const arredondar = (valor: number, casas: number) => {
  const f = 10 ** casas;
  return Math.round(valor * f) / f;
};

export interface ResumoDeUmRio {
  /** "Todos os rios alvo" quando junta todos. */
  rio: string;
  arestasQueCruzam: number;
  /** Arestas com f15 > 0, f30 > 0 e f50 > 0. */
  arestasPorFaixa: [number, number, number];
  /** Comprimento exposto (fração x comprimento da aresta, sem contar duas vezes), em km. */
  kmPorFaixa: [number, number, number];
  pctMalhaPorFaixa: [number, number, number];
}

export interface PonteSemRio {
  cruzamRioAlvo: number;
  pertoSemCruzar: number;
  semRioPorPerto: number;
  total: number;
}

export interface CruzamentoSemPonte {
  arestaId: number;
  nome: string | null;
  classe: string;
  comprimentoM: number;
  lat: number | null;
  lon: number | null;
}

export interface SegmentoPopular {
  id: number;
  rio: string;
  osmWayId: number;
  arestas: number;
  cruzam: number;
}

export interface ResumoExposicao {
  malhaKm: number;
  porRio: ResumoDeUmRio[];
  /** Quantas arestas expostas (soma de f30 > 0) caem em cada faixa de 10% (0-10%, 10-20%...). */
  histogramaF30: number[];
  arestasExpostasF30: number;
  cruzamSemPonteNemTunel: CruzamentoSemPonte[];
  pontes: PonteSemRio;
  segmentosMaisLigados: SegmentoPopular[];
}

export function resumirExposicao(
  grafo: Pick<Grafo, 'arestas'>,
  segmentos: readonly SegmentoParaExposicao[],
  entradas: readonly EntradaExposicao[],
  topo = 10,
): ResumoExposicao {
  const malhaKm = grafo.arestas.reduce((s, a) => s + a.comprimentoM, 0) / 1000;
  const rioDoSegmento = new Map(segmentos.map((s) => [s.id, s.rio]));
  const rios = [...new Set(segmentos.map((s) => s.rio))].sort();

  const porAresta = new Map<number, EntradaExposicao[]>();
  for (const e of entradas) {
    const lista = porAresta.get(e.arestaId) ?? [];
    lista.push(e);
    porAresta.set(e.arestaId, lista);
  }

  const resumir = (rotulo: string, pertence: (segmentoId: number) => boolean): ResumoDeUmRio => {
    let cruzam = 0;
    const arestas: [number, number, number] = [0, 0, 0];
    const km: [number, number, number] = [0, 0, 0];
    for (const [arestaId, lista] of porAresta) {
      const doRio = lista.filter((e) => pertence(e.segmentoId));
      if (doRio.length === 0) continue;
      if (doRio.some((e) => e.cruza)) cruzam++;
      const soma = [
        doRio.reduce((s, e) => s + e.f15, 0),
        doRio.reduce((s, e) => s + e.f30, 0),
        doRio.reduce((s, e) => s + e.f50, 0),
      ];
      for (let b = 0; b < 3; b++) {
        if (soma[b]! > 0) arestas[b]!++;
        // Cada amostra pertence a um só segmento, então a soma é a fração exposta da aresta.
        km[b]! += (Math.min(1, soma[b]!) * grafo.arestas[arestaId]!.comprimentoM) / 1000;
      }
    }
    return {
      rio: rotulo,
      arestasQueCruzam: cruzam,
      arestasPorFaixa: arestas,
      kmPorFaixa: km.map((x) => arredondar(x, 2)) as [number, number, number],
      pctMalhaPorFaixa: km.map((x) => arredondar((x / malhaKm) * 100, 2)) as [
        number,
        number,
        number,
      ],
    };
  };
  const porRio = [
    ...rios.map((rio) => resumir(rio, (id) => rioDoSegmento.get(id) === rio)),
    resumir('Todos os rios alvo', () => true),
  ];

  // Histograma da fração f30 (somada nos segmentos) das arestas expostas.
  const histogramaF30 = new Array<number>(10).fill(0);
  let arestasExpostasF30 = 0;
  for (const lista of porAresta.values()) {
    const f30 = Math.min(
      1,
      lista.reduce((s, e) => s + e.f30, 0),
    );
    if (!(f30 > 0)) continue;
    arestasExpostasF30++;
    histogramaF30[Math.min(9, Math.max(0, Math.ceil(f30 * 10 - 1e-9) - 1))]!++;
  }

  // Arestas que cruzam rio sem ser ponte nem túnel.
  const cruzamSemPonteNemTunel: CruzamentoSemPonte[] = [];
  for (const [arestaId, lista] of porAresta) {
    const aresta = grafo.arestas[arestaId]!;
    if (aresta.ponte || aresta.tunel) continue;
    const cruzando = lista.find((e) => e.cruza);
    if (!cruzando) continue;
    cruzamSemPonteNemTunel.push({
      arestaId,
      nome: aresta.nome ?? null,
      classe: aresta.classe,
      comprimentoM: aresta.comprimentoM,
      lat: cruzando.ponto?.[0] ?? null,
      lon: cruzando.ponto?.[1] ?? null,
    });
  }
  cruzamSemPonteNemTunel.sort((a, b) => a.arestaId - b.arestaId);

  // Pontes.
  const pontes: PonteSemRio = { cruzamRioAlvo: 0, pertoSemCruzar: 0, semRioPorPerto: 0, total: 0 };
  grafo.arestas.forEach((aresta, arestaId) => {
    if (!aresta.ponte) return;
    pontes.total++;
    const lista = porAresta.get(arestaId);
    if (!lista) pontes.semRioPorPerto++;
    else if (lista.some((e) => e.cruza)) pontes.cruzamRioAlvo++;
    else pontes.pertoSemCruzar++;
  });

  // Segmentos de rio com mais arestas.
  const contagem = new Map<number, { arestas: number; cruzam: number }>();
  for (const e of entradas) {
    const c = contagem.get(e.segmentoId) ?? { arestas: 0, cruzam: 0 };
    c.arestas++;
    if (e.cruza) c.cruzam++;
    contagem.set(e.segmentoId, c);
  }
  const segmentosMaisLigados = segmentos
    .map((s) => ({
      id: s.id,
      rio: s.rio,
      osmWayId: s.osmWayId,
      arestas: contagem.get(s.id)?.arestas ?? 0,
      cruzam: contagem.get(s.id)?.cruzam ?? 0,
    }))
    .sort((a, b) => b.arestas - a.arestas || a.id - b.id)
    .slice(0, topo);

  return {
    malhaKm: arredondar(malhaKm, 1),
    porRio,
    histogramaF30,
    arestasExpostasF30,
    cruzamSemPonteNemTunel,
    pontes,
    segmentosMaisLigados,
  };
}

export interface DadosDoRelatorioExposicao {
  bbox: Bbox;
  geradoEm: Date;
  grafo: { nos: number; arestas: number; sha256: string };
  parametros: { passoM: number; faixasM: readonly number[] };
  resumo: ResumoExposicao;
  cobertura: ResultadoCobertura | null;
  saida: { bytes: number; bytesGzip: number; entradas: number; segmentos: number };
}

const num = (n: number) => n.toLocaleString('pt-BR');
const pct = (parte: number, total: number) =>
  total === 0 ? '0' : num(arredondar((parte / total) * 100, 1));

export function gerarRelatorioExposicao(d: DadosDoRelatorioExposicao): string {
  const { resumo: r, cobertura: c } = d;
  const linhas: string[] = [
    '# Relatório da exposição das ruas aos rios',
    '',
    `Gerado em ${d.geradoEm.toISOString()}. Dados © colaboradores do OpenStreetMap (ODbL).`,
    '',
    `- Grafo: ${num(d.grafo.nos)} nós, ${num(d.grafo.arestas)} arestas, ${num(r.malhaKm)} km (sha256 ${d.grafo.sha256.slice(0, 12)}...)`,
    `- Amostragem a cada ${d.parametros.passoM} m; faixas de ${d.parametros.faixasM.join(', ')} m; cada amostra vai para o segmento de rio mais próximo`,
    '',
    '## 1. Por rio alvo',
    '',
    'Arestas com `cruza` e com fração > 0 em cada faixa. O comprimento exposto é a soma de fração x comprimento da aresta, sem contar duas vezes, e a % é sobre a malha inteira.',
    '',
    `| Rio | Cruzam | ${FAIXAS_ROTULO.map((f) => `Arestas ${f}`).join(' | ')} | ${FAIXAS_ROTULO.map((f) => `km ${f}`).join(' | ')} | ${FAIXAS_ROTULO.map((f) => `% malha ${f}`).join(' | ')} |`,
    `| --- | ---: | ${'---: | '.repeat(9)}`.trimEnd(),
    ...r.porRio.map(
      (x) =>
        `| ${x.rio} | ${num(x.arestasQueCruzam)} | ${x.arestasPorFaixa.map(num).join(' | ')} | ${x.kmPorFaixa.map(num).join(' | ')} | ${x.pctMalhaPorFaixa.map(num).join(' | ')} |`,
    ),
    '',
    '## 2. Fração f30 das arestas expostas',
    '',
    `Entre as ${num(r.arestasExpostasF30)} arestas com algum trecho a até 30 m de um rio alvo, quantas ficam em cada faixa de fração (as da faixa 90-100% são quase todas junto ao rio; as da faixa 0-10% só tocam a faixa):`,
    '',
    '| Fração f30 | Arestas | % das expostas |',
    '| --- | ---: | ---: |',
    ...r.histogramaF30.map(
      (n, i) => `| ${i * 10}-${(i + 1) * 10}% | ${num(n)} | ${pct(n, r.arestasExpostasF30)} |`,
    ),
    '',
    '## 3. Arestas que cruzam um rio SEM serem ponte nem túnel',
    '',
    `${num(r.cruzamSemPonteNemTunel.length)} arestas (vau, rio coberto, ponte não mapeada ou erro de dados). O ponto é onde a rua chega mais perto do rio.`,
    '',
  ];
  if (r.cruzamSemPonteNemTunel.length > 0) {
    linhas.push(
      '| Aresta | Nome | Classe | Comprimento (m) | Coordenadas aproximadas |',
      '| ---: | --- | --- | ---: | --- |',
      ...r.cruzamSemPonteNemTunel.map(
        (x) =>
          `| ${x.arestaId} | ${x.nome ?? '(sem nome)'} | ${x.classe} | ${num(x.comprimentoM)} | ${x.lat ?? '-'}, ${x.lon ?? '-'} |`,
      ),
      '',
    );
  }

  linhas.push(
    '## 4. Pontes',
    '',
    `- Arestas de ponte no grafo: ${num(r.pontes.total)}`,
    `- Cruzam um rio alvo: ${num(r.pontes.cruzamRioAlvo)} (${pct(r.pontes.cruzamRioAlvo, r.pontes.total)}%)`,
    `- A menos de ${d.parametros.faixasM[2]} m de um rio alvo, sem cruzar: ${num(r.pontes.pertoSemCruzar)} (${pct(r.pontes.pertoSemCruzar, r.pontes.total)}%)`,
    `- Sem rio alvo por perto: ${num(r.pontes.semRioPorPerto)} (${pct(r.pontes.semRioPorPerto, r.pontes.total)}%): pontes sobre outros rios ou vias elevadas`,
    '',
    '## 5. Segmentos de rio com mais arestas associadas',
    '',
    '| Segmento | Rio | Way | Arestas | Que cruzam |',
    '| ---: | --- | ---: | ---: | ---: |',
    ...r.segmentosMaisLigados.map(
      (s) => `| ${s.id} | ${s.rio} | ${s.osmWayId} | ${num(s.arestas)} | ${num(s.cruzam)} |`,
    ),
    '',
    '## 6. Cobertura do monitoramento',
    '',
  );

  if (c === null) {
    linhas.push(
      'Não foi possível analisar: o cache da Overpass dos rios não foi encontrado. Rode `pnpm grafo:rios` primeiro.',
      '',
    );
  } else {
    linhas.push(
      'Usa TODOS os waterways do cache bruto da Overpass (nomeados ou não). **Os cruzamentos com outros rios NÃO terão desvio por estado de estação, e o app precisa dizer isso.**',
      '',
      `- Waterways analisados: ${num(c.waterways)}`,
      `- Arestas que cruzam algum waterway: ${num(c.arestasQueCruzam)}`,
      `- Dessas, cruzam um rio alvo: ${num(c.cruzamRioAlvo)} (${pct(c.cruzamRioAlvo, c.arestasQueCruzam)}%)`,
      `- Dessas, cruzam outros waterways: ${num(c.cruzamOutros)} (${pct(c.cruzamOutros, c.arestasQueCruzam)}%), sendo ${num(c.soOutros)} (${pct(c.soOutros, c.arestasQueCruzam)}%) SÓ de outros e ${num(c.ambos)} de rios alvo e outros ao mesmo tempo`,
      '',
      `Os ${c.outros.length} outros waterways com mais arestas cruzadas (de ${num(c.totalGruposOutros)} com alguma):`,
      '',
      '| Waterway | km | % coberto | Ways | Arestas cruzadas |',
      '| --- | ---: | ---: | ---: | ---: |',
      ...c.outros.map(
        (o) =>
          `| ${o.nome} | ${num(o.km)} | ${num(o.pctCoberto)} | ${num(o.ways)} | ${num(o.arestas)} |`,
      ),
      '',
    );
  }

  linhas.push(
    '## 7. Arquivo de saída',
    '',
    `- ${num(d.saida.entradas)} entradas (pares aresta x segmento) para ${num(d.saida.segmentos)} segmentos de rio`,
    `- JSON: ${formatarBytes(d.saida.bytes)}`,
    `- JSON com gzip: ${formatarBytes(d.saida.bytesGzip)}`,
    '',
  );
  return linhas.join('\n');
}
