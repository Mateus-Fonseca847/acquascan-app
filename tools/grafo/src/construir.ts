/**
 * Monta o grafo de ruas a pé a partir dos elementos do OpenStreetMap. Só lógica pura: nada de
 * rede nem de disco, para poder ser testada com uma fixture em memória.
 *
 * Modelo:
 *   - Nós do grafo = interseções (nó que aparece 2 ou mais vezes nos ways caminháveis) e pontas
 *     de way. Os nós do meio de um way viram a GEOMETRIA da aresta (a curva da rua), não nós.
 *   - Cada aresta liga dois nós e guarda o comprimento real (haversine sobre a polilinha ORIGINAL)
 *     e uma geometria simplificada com Douglas-Peucker.
 *   - Arestas de escada e de ponte são mantidas, só marcadas, para o roteamento decidir.
 *   - Fica só o maior componente conexo: o resto são ilhas que o pedestre não alcança.
 *   - `de` e `para` são ÍNDICES do vetor `nos` (menor e mais rápido que ids do OSM).
 */
import { avaliarCaminhavel, sentidoUnicoAPe } from './caminhavel';
import { TOLERANCIA_SIMPLIFICACAO_M } from './config';
import { comprimentoPolilinha, douglasPeucker, type Ponto } from './geo';
import type { ElementoOsm, NoOsm, Tags, ViaOsm } from './osm';

export interface NoGrafo {
  /** Id do nó no OpenStreetMap (para depurar e atualizar o grafo). */
  id: number;
  lat: number;
  lon: number;
}

export interface ArestaGrafo {
  /** Índice em `nos`. */
  de: number;
  /** Índice em `nos`. */
  para: number;
  comprimentoM: number;
  /** Polilinha simplificada [lat, lon], do nó `de` ao nó `para`, com as duas pontas incluídas. */
  geometria: [number, number][];
  nome?: string;
  /** Valor da tag `highway` (footway, residential, steps...). */
  classe: string;
  escada: boolean;
  ponte: boolean;
  tunel: boolean;
  /** Só pode ser percorrida de `de` para `para` (`oneway:foot`). Ausente na imensa maioria. */
  sentidoUnico?: true;
}

export interface Grafo {
  versao: 1;
  nos: NoGrafo[];
  arestas: ArestaGrafo[];
}

export interface EstatisticasConstrucao {
  /** Ways do OSM com tag highway que entraram na análise. */
  vias: { total: number; caminhaveis: number };
  /** Grafo completo, antes de manter só o maior componente. */
  antes: { nos: number; arestas: number; componentes: number };
  depois: { nos: number; arestas: number };
  descartados: { nos: number; arestas: number; porcentagemNos: number; porcentagemArestas: number };
}

export interface ResultadoConstrucao {
  grafo: Grafo;
  estatisticas: EstatisticasConstrucao;
}

export interface OpcoesConstrucao {
  /** Tolerância do Douglas-Peucker, em metros. */
  toleranciaM?: number;
}

const arredondar = (valor: number, casas: number) => {
  const f = 10 ** casas;
  return Math.round(valor * f) / f;
};

/** Valor da tag que indica "tem" (ponte, túnel): qualquer coisa que não seja ausente ou `no`. */
const temTag = (tags: Tags | undefined, chave: string) => {
  const valor = tags?.[chave];
  return valor !== undefined && valor !== 'no';
};

/** União-busca para achar os componentes conexos. */
class ConjuntosDisjuntos {
  private readonly pai: number[];
  constructor(tamanho: number) {
    this.pai = Array.from({ length: tamanho }, (_, i) => i);
  }
  raiz(i: number): number {
    let atual = i;
    while (this.pai[atual] !== atual) {
      this.pai[atual] = this.pai[this.pai[atual]!]!; // compressão de caminho
      atual = this.pai[atual]!;
    }
    return atual;
  }
  unir(a: number, b: number) {
    const ra = this.raiz(a);
    const rb = this.raiz(b);
    if (ra !== rb) this.pai[ra] = rb;
  }
}

/** Divide o way em trechos de nós consecutivos que existem no extrato (sem repetir o mesmo nó em sequência). */
function trechosDaVia(via: ViaOsm, nosOsm: ReadonlyMap<number, NoOsm>): number[][] {
  const trechos: number[][] = [];
  let atual: number[] = [];
  const fechar = () => {
    if (atual.length >= 2) trechos.push(atual);
    atual = [];
  };
  for (const id of via.nodes) {
    if (!nosOsm.has(id)) {
      fechar(); // nó fora do extrato: o way é cortado aqui
      continue;
    }
    if (atual[atual.length - 1] === id) continue;
    atual.push(id);
  }
  fechar();
  return trechos;
}

export function construirGrafo(
  elementos: readonly ElementoOsm[],
  opcoes: OpcoesConstrucao = {},
): ResultadoConstrucao {
  const toleranciaM = opcoes.toleranciaM ?? TOLERANCIA_SIMPLIFICACAO_M;

  const nosOsm = new Map<number, NoOsm>();
  const vias: ViaOsm[] = [];
  for (const e of elementos) {
    if (e.type === 'node') nosOsm.set(e.id, e);
    else if (e.type === 'way') vias.push(e);
  }

  // 1. Só as vias que o pedestre pode usar.
  const viasComHighway = vias.filter((v) => v.tags?.['highway'] !== undefined);
  const caminhaveis = viasComHighway.filter((v) => avaliarCaminhavel(v.tags).caminhavel);
  const trechosPorVia = caminhaveis.map((via) => ({ via, trechos: trechosDaVia(via, nosOsm) }));

  // 2. Quantas vezes cada nó aparece. 2 ou mais = interseção (ou ponta de way fechado).
  const usos = new Map<number, number>();
  for (const { trechos } of trechosPorVia) {
    for (const trecho of trechos) {
      for (const id of trecho) usos.set(id, (usos.get(id) ?? 0) + 1);
    }
  }

  // 3. Quebra cada trecho nas interseções e nas pontas; o que fica no meio vira geometria.
  const indiceDoNo = new Map<number, number>();
  const nos: NoGrafo[] = [];
  const indiceDe = (id: number): number => {
    let indice = indiceDoNo.get(id);
    if (indice === undefined) {
      const no = nosOsm.get(id)!;
      indice = nos.length;
      nos.push({ id, lat: arredondar(no.lat, 6), lon: arredondar(no.lon, 6) });
      indiceDoNo.set(id, indice);
    }
    return indice;
  };

  const arestas: ArestaGrafo[] = [];
  for (const { via, trechos } of trechosPorVia) {
    const tags = via.tags!;
    const classe = tags['highway']!;
    const sentido = sentidoUnicoAPe(tags);

    for (const trecho of trechos) {
      let inicio = 0;
      for (let i = 1; i < trecho.length; i++) {
        const ehPonta = i === trecho.length - 1;
        if (!ehPonta && (usos.get(trecho[i]!) ?? 0) < 2) continue; // nó do meio: só geometria

        const ids = trecho.slice(inicio, i + 1);
        inicio = i;

        let pontos: Ponto[] = ids.map((id) => [nosOsm.get(id)!.lat, nosOsm.get(id)!.lon] as const);
        const comprimento = comprimentoPolilinha(pontos);
        if (comprimento === 0) continue; // nós repetidos em outro ponto: nada a percorrer

        let deId = ids[0]!;
        let paraId = ids[ids.length - 1]!;
        if (sentido === 'tras') {
          // oneway:foot=-1: o sentido permitido é o contrário ao do desenho do way.
          pontos = [...pontos].reverse();
          [deId, paraId] = [paraId, deId];
        }

        const aresta: ArestaGrafo = {
          de: indiceDe(deId),
          para: indiceDe(paraId),
          comprimentoM: arredondar(comprimento, 1),
          geometria: douglasPeucker(pontos, toleranciaM).map(
            ([lat, lon]) => [arredondar(lat, 6), arredondar(lon, 6)] as [number, number],
          ),
          classe,
          escada: classe === 'steps',
          ponte: temTag(tags, 'bridge'),
          tunel: temTag(tags, 'tunnel'),
        };
        if (tags['name']) aresta.nome = tags['name'];
        if (sentido !== null) aresta.sentidoUnico = true;
        arestas.push(aresta);
      }
    }
  }

  // 4. Maior componente conexo (ignorando o sentido das arestas).
  const conjuntos = new ConjuntosDisjuntos(nos.length);
  for (const a of arestas) conjuntos.unir(a.de, a.para);

  const nosPorComponente = new Map<number, number>();
  for (let i = 0; i < nos.length; i++) {
    const raiz = conjuntos.raiz(i);
    nosPorComponente.set(raiz, (nosPorComponente.get(raiz) ?? 0) + 1);
  }
  let raizPrincipal = -1;
  let maior = 0;
  for (const [raiz, quantidade] of nosPorComponente) {
    if (quantidade > maior) {
      maior = quantidade;
      raizPrincipal = raiz;
    }
  }

  const novoIndice = new Map<number, number>();
  const nosFinais: NoGrafo[] = [];
  nos.forEach((no, i) => {
    if (conjuntos.raiz(i) === raizPrincipal) {
      novoIndice.set(i, nosFinais.length);
      nosFinais.push(no);
    }
  });
  const arestasFinais = arestas
    .filter((a) => novoIndice.has(a.de))
    .map((a) => ({ ...a, de: novoIndice.get(a.de)!, para: novoIndice.get(a.para)! }));

  const pct = (parte: number, total: number) =>
    total === 0 ? 0 : arredondar((parte / total) * 100, 2);
  const nosDescartados = nos.length - nosFinais.length;
  const arestasDescartadas = arestas.length - arestasFinais.length;

  return {
    grafo: { versao: 1, nos: nosFinais, arestas: arestasFinais },
    estatisticas: {
      vias: { total: viasComHighway.length, caminhaveis: caminhaveis.length },
      antes: { nos: nos.length, arestas: arestas.length, componentes: nosPorComponente.size },
      depois: { nos: nosFinais.length, arestas: arestasFinais.length },
      descartados: {
        nos: nosDescartados,
        arestas: arestasDescartadas,
        porcentagemNos: pct(nosDescartados, nos.length),
        porcentagemArestas: pct(arestasDescartadas, arestas.length),
      },
    },
  };
}
