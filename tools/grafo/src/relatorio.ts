/**
 * Métricas e relatório do grafo. Lógica pura: quem grava em disco é o main.ts.
 */
import type { Bbox } from './config';
import type { EstatisticasConstrucao, Grafo } from './construir';

export interface Metricas {
  comprimentoTotalKm: number;
  arestasPorClasse: [classe: string, quantidade: number][];
  escadas: number;
  pontes: number;
  tuneis: number;
  /** Arestas por nó (um laço conta 2). */
  grauMedio: number;
  grauMaximo: number;
}

export function calcularMetricas(grafo: Grafo): Metricas {
  const grau = new Array<number>(grafo.nos.length).fill(0);
  const porClasse = new Map<string, number>();
  let metros = 0;
  let escadas = 0;
  let pontes = 0;
  let tuneis = 0;

  for (const a of grafo.arestas) {
    grau[a.de] = (grau[a.de] ?? 0) + 1;
    grau[a.para] = (grau[a.para] ?? 0) + 1;
    metros += a.comprimentoM;
    porClasse.set(a.classe, (porClasse.get(a.classe) ?? 0) + 1);
    if (a.escada) escadas++;
    if (a.ponte) pontes++;
    if (a.tunel) tuneis++;
  }

  return {
    comprimentoTotalKm: Math.round(metros) / 1000,
    arestasPorClasse: [...porClasse].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])),
    escadas,
    pontes,
    tuneis,
    grauMedio:
      grafo.nos.length === 0
        ? 0
        : Math.round((2 * grafo.arestas.length * 100) / grafo.nos.length) / 100,
    grauMaximo: grau.reduce((maior, g) => Math.max(maior, g), 0),
  };
}

export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface DadosDoRelatorio {
  bbox: Bbox;
  geradoEm: Date;
  download: { bytes: number; doCache: boolean };
  estatisticas: EstatisticasConstrucao;
  metricas: Metricas;
  saida: { bytes: number; bytesGzip: number };
}

export function gerarRelatorio(d: DadosDoRelatorio): string {
  const { estatisticas: e, metricas: m } = d;
  const separador = (n: number) => n.toLocaleString('pt-BR');
  const linhasClasse = m.arestasPorClasse.map(([classe, n]) => `| ${classe} | ${separador(n)} |`);

  return [
    '# Relatório do grafo de ruas a pé',
    '',
    `Gerado em ${d.geradoEm.toISOString()}. Dados © colaboradores do OpenStreetMap (ODbL).`,
    '',
    `Área (sul, oeste, norte, leste): ${d.bbox.sul}, ${d.bbox.oeste}, ${d.bbox.norte}, ${d.bbox.leste}`,
    '',
    '## Download',
    '',
    `- Tamanho bruto: ${formatarBytes(d.download.bytes)} (${d.download.doCache ? 'do cache' : 'baixado agora'})`,
    `- Ways com tag highway: ${separador(e.vias.total)}, dos quais caminháveis: ${separador(e.vias.caminhaveis)}`,
    '',
    '## Grafo',
    '',
    '| | Nós | Arestas |',
    '| --- | ---: | ---: |',
    `| Antes do maior componente (${separador(e.antes.componentes)} componentes) | ${separador(e.antes.nos)} | ${separador(e.antes.arestas)} |`,
    `| Depois (maior componente) | ${separador(e.depois.nos)} | ${separador(e.depois.arestas)} |`,
    `| Descartados | ${separador(e.descartados.nos)} (${e.descartados.porcentagemNos}%) | ${separador(e.descartados.arestas)} (${e.descartados.porcentagemArestas}%) |`,
    '',
    `- Comprimento total da malha: ${m.comprimentoTotalKm.toLocaleString('pt-BR')} km`,
    `- Arestas por nó: média ${m.grauMedio.toLocaleString('pt-BR')}, máximo ${m.grauMaximo}`,
    `- Escadas: ${separador(m.escadas)} | Pontes: ${separador(m.pontes)} | Túneis: ${separador(m.tuneis)}`,
    '',
    '## Arestas por classe',
    '',
    '| Classe | Arestas |',
    '| --- | ---: |',
    ...linhasClasse,
    '',
    '## Arquivo de saída',
    '',
    `- JSON: ${formatarBytes(d.saida.bytes)}`,
    `- JSON com gzip: ${formatarBytes(d.saida.bytesGzip)}`,
    '',
  ].join('\n');
}
