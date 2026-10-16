/**
 * Texto do relatório dos rios. Lógica pura: quem grava em disco é o main-rios.ts.
 */
import { DISTANCIA_LACUNA_M, type Bbox } from './config';
import { formatarBytes } from './relatorio';
import type { ResultadoRios } from './rios';

export interface DadosDoRelatorioRios {
  bbox: Bbox;
  geradoEm: Date;
  riosAlvo: readonly string[];
  /** Limiar usado para as lacunas (padrão: DISTANCIA_LACUNA_M). */
  distanciaLacunaM?: number;
  download: { bytes: number; doCache: boolean };
  resultado: ResultadoRios;
  saida: { bytes: number; bytesGzip: number };
}

const num = (n: number) => n.toLocaleString('pt-BR');

export function gerarRelatorioRios(d: DadosDoRelatorioRios): string {
  const { resultado: r } = d;
  const linhas: string[] = [
    '# Relatório dos rios',
    '',
    `Gerado em ${d.geradoEm.toISOString()}. Dados © colaboradores do OpenStreetMap (ODbL).`,
    '',
    `Área (sul, oeste, norte, leste): ${d.bbox.sul}, ${d.bbox.oeste}, ${d.bbox.norte}, ${d.bbox.leste}`,
    `Rios alvo: ${d.riosAlvo.join(', ')}`,
    '',
    `- Download bruto: ${formatarBytes(d.download.bytes)} (${d.download.doCache ? 'do cache' : 'baixado agora'})`,
    `- Ways waterway (river, stream, canal, drain): ${num(r.estatisticas.waysWaterway)}; dentro da caixa: ${num(r.estatisticas.waysDentroDaCaixa)}`,
    `- Relações de rio com nome: ${num(r.estatisticas.relacoesComNome)}`,
    '',
    '## 1. Todos os waterways nomeados dentro da caixa',
    '',
    'Para a equipe escolher quais rios entram. O nome é o mais comum entre os ways; "alvo" marca os rios que estão na lista de rios alvo. Os km contam os ways inteiros (um way que atravessa a borda da caixa é contado todo).',
    '',
    '| Rio | Tipos (km) | km | % coberto | Ways | Alvo |',
    '| --- | --- | ---: | ---: | ---: | :---: |',
    ...r.todos.map(
      (t) =>
        `| ${t.nome} | ${t.tipos.map((x) => `${x.waterway} ${x.km}`).join(', ')} | ${num(t.km)} | ${num(t.pctCoberto)} | ${num(t.ways)} | ${t.alvo ? 'sim' : ''} |`,
    ),
    '',
    `Sem nome: ${num(r.semNome.ways)} ways, ${num(r.semNome.km)} km (nem o way nem uma relação tem nome).`,
    '',
    '## 2. Rios alvo',
  ];

  for (const a of r.alvos) {
    linhas.push('', `### ${a.rio}`, '');
    if (a.segmentos === 0) {
      linhas.push(
        '**Nenhum segmento encontrado.** Confira a grafia em `RIOS_ALVO` (src/config.ts) e a tabela da seção 1: o nome no OSM pode ser outro.',
      );
      continue;
    }
    linhas.push(
      `- Total: ${num(a.km)} km em ${num(a.segmentos)} segmentos`,
      `- Coberto (tunnel=culvert ou yes): ${num(a.pctCoberto)}% | canal ou vala (canal, drain): ${num(a.pctCanal)}%`,
      `- Componentes conexos: ${a.componentes.length} (${a.componentes.map((c) => `${num(c.km)} km/${c.segmentos} seg.`).join('; ')})`,
    );
    if (a.comCoveredYes > 0) {
      linhas.push(
        `- ${a.comCoveredYes} segmento(s) com covered=yes: NÃO contados como cobertos (só tunnel conta). Vale conferir.`,
      );
    }

    if (a.aliases.length > 0) {
      linhas.push(
        '',
        '**Grafias alternativas** (entraram como este rio por ALIASES_RIOS; corrigir o `name` no OpenStreetMap):',
        '',
        '| Way | Nome no OSM |',
        '| --- | --- |',
        ...a.aliases.map((x) => `| ${x.osmWayId} | ${x.nomeOsm} |`),
      );
    }
    if (a.inferidos.length > 0) {
      linhas.push(
        '',
        '**Ways sem nome absorvidos** (inferidos por se ligarem ao rio; vale conferir no mapa):',
        '',
        '| Way | Tipo | km |',
        '| --- | --- | ---: |',
        ...a.inferidos.map((x) => `| ${x.osmWayId} | ${x.waterway} | ${num(x.km)} |`),
      );
    }

    linhas.push(
      '',
      `**Lacunas** (pontas de componentes diferentes a menos de ${d.distanciaLacunaM ?? DISTANCIA_LACUNA_M} m, provável rio quebrado no OSM; nada foi unido):`,
      '',
    );
    if (a.lacunas.length === 0) linhas.push('Nenhuma.');
    else {
      linhas.push('| Distância (m) | Coordenadas aproximadas | Ways |', '| ---: | --- | --- |');
      for (const l of a.lacunas) {
        linhas.push(`| ${num(l.distanciaM)} | ${l.lat}, ${l.lon} | ${l.wayA} e ${l.wayB} |`);
      }
    }

    linhas.push(
      '',
      '**Ways sem nome ligados a este rio** (podem ser trechos do mesmo rio sem a tag):',
      '',
    );
    if (a.semNomeLigados.length === 0) linhas.push('Nenhum.');
    else {
      linhas.push('| Way | Tipo | km |', '| --- | --- | ---: |');
      for (const w of a.semNomeLigados)
        linhas.push(`| ${w.osmWayId} | ${w.waterway} | ${num(w.km)} |`);
    }
  }

  linhas.push(
    '',
    '## 3. Arquivo de saída',
    '',
    `- GeoJSON: ${formatarBytes(d.saida.bytes)}`,
    `- GeoJSON com gzip: ${formatarBytes(d.saida.bytesGzip)}`,
    '',
  );
  return linhas.join('\n');
}
