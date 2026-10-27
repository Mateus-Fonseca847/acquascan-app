/**
 * Auxiliares dos testes: monta mundos pequenos e sintéticos (ruas, rios, estações), calcula a
 * exposição como o tools/grafo faria (em versão simples) e gera números aleatórios determinísticos.
 * Nada disso é código de produção.
 */
import {
  criarRoteador,
  type ArestaBruta,
  type GrafoBruto,
  type Roteador,
} from '@aquascan/roteamento';
import type { Estado } from '@aquascan/shared';
import {
  criarDesvio,
  type Desvio,
  type EstacaoCadastro,
  type ExposicaoBruta,
  type LeituraEstacao,
  type LatLng,
  type PoliticaParcial,
  type RiosGeoJson,
} from '../src';

export function mulberry32(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LAT0 = -22.5;
const LON0 = -43.17;
const METROS_POR_GRAU = 111_195;
const COS = Math.cos((LAT0 * Math.PI) / 180);

export const AGORA = new Date('2026-03-10T12:00:00Z');

/** Metros (x leste, y norte) a partir de um ponto fixo, em coordenadas. */
export function p(x: number, y: number): LatLng {
  return { latitude: LAT0 + y / METROS_POR_GRAU, longitude: LON0 + x / (METROS_POR_GRAU * COS) };
}

export type Ponto = [number, number];

export interface DefAresta {
  de: number;
  para: number;
  via?: Ponto[];
  nome?: string;
  sentidoUnico?: true;
}

export interface DefRio {
  rio: string;
  pontos: Ponto[];
}

export interface DefEstacao {
  id: number;
  rio: string;
  x: number;
  y: number;
}

export interface Mundo {
  desvio: Desvio;
  roteador: Roteador;
  exposicao: ExposicaoBruta;
  rios: RiosGeoJson;
  estacoes: EstacaoCadastro[];
  grafo: GrafoBruto;
}

const dist = (a: Ponto, b: Ponto) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function distPontoSeg(pt: Ponto, a: Ponto, b: Ponto): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t =
    l2 === 0 ? 0 : Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2));
  return dist(pt, [a[0] + t * dx, a[1] + t * dy]);
}

function orient(a: Ponto, b: Ponto, c: Ponto): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function seCruzam(a: Ponto, b: Ponto, c: Ponto, d: Ponto): boolean {
  return orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
}

/** Pontos a cada `passo` metros ao longo de uma polilinha (inclui o fim). */
function amostrar(caminho: Ponto[], passo: number): Ponto[] {
  const saida: Ponto[] = [caminho[0]!];
  let falta = passo;
  for (let i = 1; i < caminho.length; i++) {
    const a = caminho[i - 1]!;
    const b = caminho[i]!;
    const l = dist(a, b);
    let pos = falta;
    while (pos < l) {
      saida.push([a[0] + ((b[0] - a[0]) * pos) / l, a[1] + ((b[1] - a[1]) * pos) / l]);
      pos += passo;
    }
    falta = pos - l;
  }
  saida.push(caminho[caminho.length - 1]!);
  return saida;
}

/** Monta o mundo: roteador, rios, exposição calculada e o `Desvio`. */
export function criarMundo(config: {
  nos: Ponto[];
  arestas: DefAresta[];
  rios: DefRio[];
  estacoes: DefEstacao[];
  politica?: PoliticaParcial;
}): Mundo {
  const { nos, arestas, rios: defRios, estacoes: defEstacoes } = config;
  const caminhos = arestas.map((a): Ponto[] => [nos[a.de]!, ...(a.via ?? []), nos[a.para]!]);

  const grafo: GrafoBruto = {
    versao: 1,
    nos: nos.map(([x, y], i) => ({ id: 1000 + i, lat: p(x, y).latitude, lon: p(x, y).longitude })),
    arestas: arestas.map((a, i): ArestaBruta => {
      const caminho = caminhos[i]!;
      let comp = 0;
      for (let k = 1; k < caminho.length; k++) comp += dist(caminho[k - 1]!, caminho[k]!);
      const bruta: ArestaBruta = {
        de: a.de,
        para: a.para,
        comprimentoM: comp,
        geometria: caminho.map(([x, y]): [number, number] => [p(x, y).latitude, p(x, y).longitude]),
        classe: 'residential',
        escada: false,
        ponte: false,
        tunel: false,
      };
      if (a.nome !== undefined) bruta.nome = a.nome;
      if (a.sentidoUnico) bruta.sentidoUnico = true;
      return bruta;
    }),
  };
  const roteador = criarRoteador(grafo);

  const rios: RiosGeoJson = {
    features: defRios.map((r, i) => {
      let comp = 0;
      for (let k = 1; k < r.pontos.length; k++) comp += dist(r.pontos[k - 1]!, r.pontos[k]!);
      return {
        properties: { id: i + 1, rio: r.rio, comprimentoM: comp, coberto: false },
        geometry: {
          type: 'LineString',
          coordinates: r.pontos.map(([x, y]) => [p(x, y).longitude, p(x, y).latitude]),
        },
      };
    }),
  };

  // Exposição: amostragem a cada 5 m, fração dentro de 15/30/50 m e cruzamento.
  const entradas: number[][] = [];
  caminhos.forEach((caminho, aresta) => {
    const amostras = amostrar(caminho, 5);
    // Distância de cada amostra a cada rio; cada amostra pertence ao rio MAIS PRÓXIMO (como em
    // tools/grafo), então as frações de rios diferentes são disjuntas.
    const dist2 = defRios.map((rio) =>
      amostras.map((pt) => {
        let m = Infinity;
        for (let k = 1; k < rio.pontos.length; k++)
          m = Math.min(m, distPontoSeg(pt, rio.pontos[k - 1]!, rio.pontos[k]!));
        return m;
      }),
    );
    const dono = amostras.map((_, i) => {
      let melhor = 0;
      for (let s = 1; s < defRios.length; s++) if (dist2[s]![i]! < dist2[melhor]![i]!) melhor = s;
      return melhor;
    });
    defRios.forEach((rio, s) => {
      const d = dist2[s]!;
      let cruza = false;
      for (let i = 1; i < caminho.length && !cruza; i++) {
        for (let k = 1; k < rio.pontos.length && !cruza; k++) {
          cruza = seCruzam(caminho[i - 1]!, caminho[i]!, rio.pontos[k - 1]!, rio.pontos[k]!);
        }
      }
      const distMin = Math.min(...d);
      if (!cruza && distMin > 50) return;
      const fr = (f: number) => d.filter((v, i) => dono[i] === s && v <= f).length / d.length;
      entradas.push([aresta, s + 1, cruza ? 1 : 0, Math.round(distMin), fr(15), fr(30), fr(50)]);
    });
  });
  const exposicao: ExposicaoBruta = {
    versao: 1,
    grafo: { nos: nos.length, arestas: arestas.length },
    parametros: { passoM: 5, faixasM: [15, 30, 50] },
    segmentos: defRios.map((r, i) => ({
      id: i + 1,
      rio: r.rio,
      osmWayId: 100 + i,
      coberto: false,
    })),
    entradas,
  };

  const estacoes: EstacaoCadastro[] = defEstacoes.map((e) => ({
    id: e.id,
    rio: e.rio,
    latitude: p(e.x, e.y).latitude,
    longitude: p(e.x, e.y).longitude,
  }));
  const desvio = criarDesvio({ roteador, exposicao, rios }, estacoes, config.politica);
  return { desvio, roteador, exposicao, rios, estacoes, grafo };
}

/** Uma leitura medida `minutosAtras` minutos antes de AGORA. */
export function leitura(
  estacaoId: number,
  estado: Estado | null,
  minutosAtras = 1,
): LeituraEstacao {
  return {
    estacaoId,
    estado,
    medidoEm:
      estado === null ? null : new Date(AGORA.getTime() - minutosAtras * 60_000).toISOString(),
  };
}

/**
 * Mundo "ponte": rio horizontal de x=-100 a 1100 em y=0; margens norte (y=150) e sul (y=-150);
 * ponte N1-S1 em x=500 (300 m, cruza o rio). Com `contorno`, há uma volta pela direita
 * (x=1400), onde o rio já acabou. Estação 1 no rio "Piabanha", em (500, 0).
 */
export function mundoPonte(
  opcoes: { contorno: boolean; politica?: PoliticaParcial } = { contorno: true },
): Mundo {
  const nos: Ponto[] = [
    [0, 150],
    [500, 150],
    [1000, 150],
    [1400, 150],
    [0, -150],
    [500, -150],
    [1000, -150],
    [1400, -150],
  ];
  const arestas: DefAresta[] = [
    { de: 0, para: 1 },
    { de: 1, para: 2 },
    { de: 2, para: 3 },
    { de: 4, para: 5 },
    { de: 5, para: 6 },
    { de: 6, para: 7 },
    { de: 1, para: 5 }, // ponte
  ];
  if (opcoes.contorno) arestas.push({ de: 3, para: 7 });
  return criarMundo({
    nos,
    arestas,
    rios: [
      {
        rio: 'Piabanha',
        pontos: [
          [-100, 0],
          [1100, 0],
        ],
      },
    ],
    estacoes: [{ id: 1, rio: 'Rio Piabanha', x: 500, y: 0 }],
    ...(opcoes.politica ? { politica: opcoes.politica } : {}),
  });
}
