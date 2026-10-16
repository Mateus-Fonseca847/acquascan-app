/**
 * Cobertura do monitoramento: das ruas que cruzam algum waterway do OpenStreetMap, quantas
 * cruzam um rio ALVO (que terá o desvio por estado de estação) e quantas cruzam OUTROS
 * (sem estação, portanto sem desvio). O app precisa avisar sobre esse segundo grupo.
 */
import { TOLERANCIA_TOQUE_M } from './config';
import type { Grafo } from './construir';
import { distSegmentos, IndiceSegmentos } from './espacial';
import { type Ponto } from './geo';
import { normalizarNome } from './nomes';
import { projecaoDoGrafo } from './exposicao';

export interface WaterwayParaCobertura {
  osmWayId: number;
  /** Nome efetivo (do way ou da relação) ou null. */
  nome: string | null;
  waterway: string;
  coberto: boolean;
  comprimentoM: number;
  /** [lat, lon] da geometria ORIGINAL. */
  pontos: readonly Ponto[];
  /** O way pertence a um segmento de rio alvo (inclui aliases e inferidos). */
  alvo: boolean;
}

export interface OutroWaterway {
  /** "(sem nome)" para os ways sem nome, agrupados. */
  nome: string;
  km: number;
  pctCoberto: number;
  ways: number;
  /** Arestas do grafo que cruzam algum way do grupo. */
  arestas: number;
}

export interface ResultadoCobertura {
  waterways: number;
  arestasQueCruzam: number;
  /** Cruzam pelo menos um way de rio alvo. */
  cruzamRioAlvo: number;
  /** Cruzam pelo menos um outro waterway. */
  cruzamOutros: number;
  /** Cruzam SÓ outros waterways (sem nenhum rio alvo). */
  soOutros: number;
  /** Cruzam rios alvo e outros ao mesmo tempo. */
  ambos: number;
  outros: OutroWaterway[];
  totalGruposOutros: number;
}

const arredondar = (valor: number, casas: number) => {
  const f = 10 ** casas;
  return Math.round(valor * f) / f;
};

export function analisarCobertura(
  grafo: Pick<Grafo, 'nos' | 'arestas'>,
  waterways: readonly WaterwayParaCobertura[],
  opcoes: { toqueM?: number; topo?: number } = {},
): ResultadoCobertura {
  const toqueM = opcoes.toqueM ?? TOLERANCIA_TOQUE_M;
  const proj = projecaoDoGrafo(grafo.nos);

  const ax: number[] = [];
  const ay: number[] = [];
  const bx: number[] = [];
  const by: number[] = [];
  const dono: number[] = [];
  waterways.forEach((w, i) => {
    for (let k = 1; k < w.pontos.length; k++) {
      ax.push(proj.x(w.pontos[k - 1]![1]));
      ay.push(proj.y(w.pontos[k - 1]![0]));
      bx.push(proj.x(w.pontos[k]![1]));
      by.push(proj.y(w.pontos[k]![0]));
      dono.push(i);
    }
  });
  const indice = new IndiceSegmentos(
    Float64Array.from(ax),
    Float64Array.from(ay),
    Float64Array.from(bx),
    Float64Array.from(by),
  );

  // Grupos dos waterways que não são rio alvo, por nome normalizado.
  const chaveDe = (w: WaterwayParaCobertura) => (w.nome === null ? '' : normalizarNome(w.nome));
  const grupos = new Map<
    string,
    { nomes: Map<string, number>; km: number; kmCoberto: number; ways: number; arestas: number }
  >();
  for (const w of waterways) {
    if (w.alvo) continue;
    const chave = chaveDe(w);
    const g = grupos.get(chave) ?? { nomes: new Map(), km: 0, kmCoberto: 0, ways: 0, arestas: 0 };
    const nome = w.nome ?? '(sem nome)';
    g.nomes.set(nome, (g.nomes.get(nome) ?? 0) + 1);
    g.km += w.comprimentoM / 1000;
    if (w.coberto) g.kmCoberto += w.comprimentoM / 1000;
    g.ways++;
    grupos.set(chave, g);
  }

  let arestasQueCruzam = 0;
  let cruzamRioAlvo = 0;
  let cruzamOutros = 0;
  let soOutros = 0;
  let ambos = 0;
  const candidatos: number[] = [];

  for (const aresta of grafo.arestas) {
    const n = aresta.geometria.length;
    const px = new Float64Array(n);
    const py = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      px[i] = proj.x(aresta.geometria[i]![1]);
      py[i] = proj.y(aresta.geometria[i]![0]);
    }
    const cruzados = new Set<number>(); // índices de waterways
    for (let k = 1; k < n; k++) {
      indice.consultar(
        Math.min(px[k - 1]!, px[k]!),
        Math.min(py[k - 1]!, py[k]!),
        Math.max(px[k - 1]!, px[k]!),
        Math.max(py[k - 1]!, py[k]!),
        toqueM,
        candidatos,
      );
      for (const j of candidatos) {
        if (cruzados.has(dono[j]!)) continue;
        if (
          distSegmentos(px[k - 1]!, py[k - 1]!, px[k]!, py[k]!, ax[j]!, ay[j]!, bx[j]!, by[j]!) <=
          toqueM
        ) {
          cruzados.add(dono[j]!);
        }
      }
    }
    if (cruzados.size === 0) continue;

    arestasQueCruzam++;
    let alvo = false;
    const gruposDaAresta = new Set<string>();
    for (const i of cruzados) {
      const w = waterways[i]!;
      if (w.alvo) alvo = true;
      else gruposDaAresta.add(chaveDe(w));
    }
    for (const chave of gruposDaAresta) grupos.get(chave)!.arestas++;
    const outros = gruposDaAresta.size > 0;
    if (alvo) cruzamRioAlvo++;
    if (outros) cruzamOutros++;
    if (alvo && outros) ambos++;
    if (!alvo && outros) soOutros++;
  }

  const lista: OutroWaterway[] = [...grupos.values()]
    .filter((g) => g.arestas > 0)
    .map((g) => ({
      nome: [...g.nomes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0],
      km: arredondar(g.km, 2),
      pctCoberto: g.km === 0 ? 0 : arredondar((g.kmCoberto / g.km) * 100, 1),
      ways: g.ways,
      arestas: g.arestas,
    }))
    .sort((a, b) => b.arestas - a.arestas || b.km - a.km || a.nome.localeCompare(b.nome));

  return {
    waterways: waterways.length,
    arestasQueCruzam,
    cruzamRioAlvo,
    cruzamOutros,
    soOutros,
    ambos,
    outros: lista.slice(0, opcoes.topo ?? 10),
    totalGruposOutros: lista.length,
  };
}
