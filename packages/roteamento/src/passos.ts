/**
 * Instruções de curva ("Vire à direita na Rua X") a partir de uma rota do roteador.
 *
 * Como funciona:
 *  1. Os trechos consecutivos de mesmo nome e mesmas marcas (ponte, escada, túnel) viram uma
 *     UNIDADE. Sem nome, só agrupa com outras sem nome da mesma classe.
 *  2. Em cada junção entre unidades mede-se o ângulo: o rumo dos últimos 15 m de quem chega contra
 *     o dos primeiros 15 m de quem sai (positivo = direita).
 *  3. Manobras (|ângulo| >= 25) separadas por menos de 15 m viram uma só (os ângulos somam).
 *  4. Emite-se um passo numa manobra, numa mudança de nome (mesmo em frente) ou no começo/fim de
 *     ponte, escada ou túnel. Nunca há "em frente" sem mudança de nome.
 *
 * As distâncias dos passos vêm dos comprimentos dos trechos (os mesmos de `distanciaRedeM`), não
 * da polilinha simplificada. LIMITAÇÕES: rotatórias não são reconhecidas (viram curvas comuns) e
 * o texto das preposições é heurístico (veja textos.ts).
 */
import { ProjecaoLocal } from './geo';
import {
  comPreposicao,
  formatarDistancia,
  normalizarTexto,
  referenciaDaVia,
  rumoCardeal,
  type ReferenciaVia,
} from './textos';
import type { AtributosAresta, LatLng, RotaEncontrada } from './tipos';

export type TipoPasso = 'partida' | 'siga' | 'curva' | 'travessia' | 'chegada';

export type Manobra =
  | 'em_frente'
  | 'leve_direita'
  | 'direita'
  | 'fechada_direita'
  | 'leve_esquerda'
  | 'esquerda'
  | 'fechada_esquerda'
  | 'retorno';

export type AvisoPasso = 'ESCADA' | 'TRILHA' | 'PONTE' | 'TUNEL';

export interface Passo {
  tipo: TipoPasso;
  manobra: Manobra | null;
  texto: string;
  /** Nome da via em que a pessoa fica depois deste passo (nulo se não tem nome). */
  rua: string | null;
  /** Do ponto da manobra até o próximo passo, em metros. */
  distanciaM: number;
  /** Desde o início da rede, em metros. */
  acumuladaM: number;
  /** Índice em `rota.pontos`. */
  indiceNaLinha: number;
  ponto: LatLng;
  avisos: AvisoPasso[];
}

export interface OpcoesPassos {
  /** Nome do destino para a chegada ("Você chegou: <nome>"). Padrão: "seu destino". */
  nomeDestino?: string;
}

/** Quem dá os atributos de uma aresta: a função `(id) => ...` ou o próprio `Roteador`. */
export type FonteAtributos =
  | ((arestaId: number) => Readonly<AtributosAresta>)
  | { atributos(arestaId: number): Readonly<AtributosAresta> };

/** Abaixo disto o ângulo é "em frente". */
export const ANGULO_MANOBRA_GRAUS = 25;
const LEVE_ATE = 60;
const NORMAL_ATE = 120;
const FECHADA_ATE = 160;
/** Quanto de cada lado da junção entra no rumo médio. */
const JANELA_RUMO_M = 15;
/** Manobras mais próximas que isto viram uma só. */
const JUNTAR_MANOBRAS_M = 15;
/** Encaixes maiores que isto ganham um passo próprio. */
const ENCAIXE_COM_PASSO_M = 30;
/** Trechos menores que isto (encaixe exatamente num nó) não contam para a unidade. */
const TRECHO_MINIMO_M = 0.5;
/** Travessias (ponte, escada, túnel) com menos disto até o passo seguinte são fundidas nele. */
const TRAVESSIA_CURTA_M = 15;

interface Unidade {
  chave: string;
  nome: string | null;
  classe: string;
  ponte: boolean;
  escada: boolean;
  tunel: boolean;
  trilha: boolean;
  comprimentoM: number;
  /** Índice, em rota.pontos, do primeiro ponto da unidade. */
  inicioIdx: number;
  primeiroPonto: LatLng;
  /** Pontos no plano local (metros). */
  xs: number[];
  ys: number[];
}

interface Juncao {
  posM: number;
  idx: number;
  ponto: LatLng;
  angulo: number;
  antes: Unidade;
  depois: Unidade;
}

function normalizarAngulo(g: number): number {
  let a = ((g % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return a === -180 ? 180 : a;
}

const rumoDe = (dx: number, dy: number) => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;

/** Ponto a `d` metros do início de uma polilinha plana. */
function pontoAEm(xs: number[], ys: number[], d: number): [number, number] {
  let falta = d;
  for (let i = 1; i < xs.length; i++) {
    const l = Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!);
    if (falta <= l && l > 0) {
      const t = falta / l;
      return [xs[i - 1]! + t * (xs[i]! - xs[i - 1]!), ys[i - 1]! + t * (ys[i]! - ys[i - 1]!)];
    }
    falta -= l;
  }
  return [xs[xs.length - 1]!, ys[ys.length - 1]!];
}

function comprimentoPlano(xs: number[], ys: number[]): number {
  let t = 0;
  for (let i = 1; i < xs.length; i++) t += Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!);
  return t;
}

/** Rumo médio dos últimos 15 m (ou do que existir). Nulo se a unidade não tem extensão. */
function rumoDeChegada(u: Unidade): number | null {
  const l = comprimentoPlano(u.xs, u.ys);
  if (l < 0.01) return null;
  const [x0, y0] = pontoAEm(u.xs, u.ys, Math.max(0, l - JANELA_RUMO_M));
  const fx = u.xs[u.xs.length - 1]!;
  const fy = u.ys[u.ys.length - 1]!;
  return rumoDe(fx - x0, fy - y0);
}

/** Rumo médio dos primeiros 15 m (ou do que existir). */
function rumoDeSaida(u: Unidade): number | null {
  const l = comprimentoPlano(u.xs, u.ys);
  if (l < 0.01) return null;
  const [x1, y1] = pontoAEm(u.xs, u.ys, Math.min(l, JANELA_RUMO_M));
  return rumoDe(x1 - u.xs[0]!, y1 - u.ys[0]!);
}

export function classificarManobra(angulo: number): Manobra {
  const abs = Math.abs(angulo);
  const direita = angulo > 0;
  if (abs < ANGULO_MANOBRA_GRAUS) return 'em_frente';
  if (abs > FECHADA_ATE) return 'retorno';
  if (abs < LEVE_ATE) return direita ? 'leve_direita' : 'leve_esquerda';
  if (abs < NORMAL_ATE) return direita ? 'direita' : 'esquerda';
  return direita ? 'fechada_direita' : 'fechada_esquerda';
}

function textoDaCurva(manobra: Manobra, ref: ReferenciaVia): string {
  // Rua sem nome: não se diz "na via"; a instrução é só a manobra.
  const em = ref.semNome ? '' : ` ${comPreposicao('em', ref)}`;
  switch (manobra) {
    case 'leve_direita':
      return ref.semNome ? 'Siga levemente à direita' : `Vire levemente à direita${em}`;
    case 'direita':
      return `Vire à direita${em}`;
    case 'fechada_direita':
      return `Faça a curva fechada à direita${em}`;
    case 'leve_esquerda':
      return ref.semNome ? 'Siga levemente à esquerda' : `Vire levemente à esquerda${em}`;
    case 'esquerda':
      return `Vire à esquerda${em}`;
    case 'fechada_esquerda':
      return `Faça a curva fechada à esquerda${em}`;
    case 'retorno':
      return `Retorne e siga ${comPreposicao('por', ref)}`;
    case 'em_frente':
      return `Continue ${comPreposicao('por', ref)}`;
  }
}

function avisosDaUnidade(u: Unidade): AvisoPasso[] {
  const avisos: AvisoPasso[] = [];
  if (u.escada) avisos.push('ESCADA');
  if (u.trilha) avisos.push('TRILHA');
  if (u.ponte) avisos.push('PONTE');
  if (u.tunel) avisos.push('TUNEL');
  return avisos;
}

const somarAvisos = (a: readonly AvisoPasso[], b: readonly AvisoPasso[]): AvisoPasso[] => [
  ...a,
  ...b.filter((x) => !a.includes(x)),
];

const ehPassoDeDestino = (p: { texto: string }) => p.texto.startsWith('O destino fica');

const refDaUnidade = (u: Unidade) => referenciaDaVia(u.nome, u.classe);

/** O texto de uma mudança de marca (ponte, escada, túnel) entre duas unidades de mesmo trajeto. */
function textoDaTravessia(antes: Unidade, depois: Unidade): string {
  if (depois.ponte && !antes.ponte) return 'Atravesse a ponte';
  if (depois.tunel && !antes.tunel) return 'Siga pelo túnel';
  if (depois.escada && !antes.escada) return 'Pegue a escadaria';
  // terminou uma ponte, escada ou túnel
  return `Continue ${comPreposicao('por', refDaUnidade(depois))}`;
}

function mudouMarca(a: Unidade, b: Unidade): boolean {
  return a.ponte !== b.ponte || a.escada !== b.escada || a.tunel !== b.tunel;
}

function lerAtributos(fonte: FonteAtributos, id: number): Readonly<AtributosAresta> {
  return typeof fonte === 'function' ? fonte(id) : fonte.atributos(id);
}

/** Monta as instruções de uma rota `ok` do roteador. */
export function gerarPassos(
  rota: RotaEncontrada,
  atributos: FonteAtributos,
  opcoes: OpcoesPassos = {},
): Passo[] {
  const totalPontos = rota.pontos.length;
  const ultimoIdx = Math.max(0, totalPontos - 1);
  const destino = rota.pontos[ultimoIdx] ?? rota.trechos.at(-1)?.pontos.at(-1);
  const textoChegada = `Você chegou: ${opcoes.nomeDestino ?? 'seu destino'}`;
  if (!destino) {
    return [
      {
        tipo: 'chegada',
        manobra: null,
        texto: textoChegada,
        rua: null,
        distanciaM: 0,
        acumuladaM: 0,
        indiceNaLinha: 0,
        ponto: { latitude: 0, longitude: 0 },
        avisos: [],
      },
    ];
  }

  const origemPlano = rota.pontos[0] ?? destino;
  const proj = new ProjecaoLocal(origemPlano.latitude, origemPlano.longitude);

  // 1. Unidades: trechos consecutivos de mesmo nome (ou mesma classe, sem nome) e mesmas marcas.
  const unidades: Unidade[] = [];
  let inicioIdx = 0;
  const trechosUteis = rota.trechos.filter((t) => t.comprimentoM >= TRECHO_MINIMO_M);
  const usados = trechosUteis.length > 0 ? trechosUteis : rota.trechos;
  const inicioDe = new Map<unknown, number>();
  for (const t of rota.trechos) {
    inicioDe.set(t, inicioIdx);
    inicioIdx += Math.max(0, t.pontos.length - 1);
  }
  for (const t of usados) {
    const attr = lerAtributos(atributos, t.arestaId);
    const nome = t.nome !== null && t.nome.trim() !== '' ? t.nome : null;
    const classe = t.classe;
    const escada = attr.escada || classe === 'steps';
    const chave = nome !== null ? normalizarTexto(nome) : `#${classe}`;
    const ultima = unidades[unidades.length - 1];
    const xs = t.pontos.map((p) => proj.x(p.longitude));
    const ys = t.pontos.map((p) => proj.y(p.latitude));
    if (
      ultima &&
      ultima.chave === chave &&
      ultima.ponte === attr.ponte &&
      ultima.escada === escada &&
      ultima.tunel === attr.tunel
    ) {
      ultima.comprimentoM += t.comprimentoM;
      // o primeiro ponto do trecho repete o último da unidade
      ultima.xs.push(...xs.slice(1));
      ultima.ys.push(...ys.slice(1));
      continue;
    }
    unidades.push({
      chave,
      nome,
      classe,
      ponte: attr.ponte,
      escada,
      tunel: attr.tunel,
      trilha: classe === 'path' || classe === 'track',
      comprimentoM: t.comprimentoM,
      inicioIdx: inicioDe.get(t) ?? 0,
      primeiroPonto: t.pontos[0] ?? destino,
      xs,
      ys,
    });
  }

  // 2. Junções e ângulos.
  const juncoes: Juncao[] = [];
  let posM = 0;
  for (let i = 0; i + 1 < unidades.length; i++) {
    const a = unidades[i]!;
    const b = unidades[i + 1]!;
    posM += a.comprimentoM;
    const entrada = rumoDeChegada(a);
    const saida = rumoDeSaida(b);
    const angulo = entrada === null || saida === null ? 0 : normalizarAngulo(saida - entrada);
    juncoes.push({
      posM,
      idx: Math.min(b.inicioIdx, ultimoIdx),
      ponto: b.primeiroPonto,
      angulo,
      antes: a,
      depois: b,
    });
  }

  // 3. Suavização: manobras a menos de 15 m uma da outra viram uma só.
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (let i = 0; i + 1 < juncoes.length; i++) {
      const a = juncoes[i]!;
      const b = juncoes[i + 1]!;
      if (
        Math.abs(a.angulo) >= ANGULO_MANOBRA_GRAUS &&
        Math.abs(b.angulo) >= ANGULO_MANOBRA_GRAUS &&
        b.posM - a.posM < JUNTAR_MANOBRAS_M
      ) {
        juncoes.splice(i, 2, {
          posM: a.posM,
          idx: a.idx,
          ponto: a.ponto,
          angulo: normalizarAngulo(a.angulo + b.angulo),
          antes: a.antes,
          depois: b.depois,
        });
        mudou = true;
        break;
      }
    }
  }

  // 4. Passos.
  const total = rota.distanciaRedeM;
  const primeira = unidades[0];
  const ultima = unidades[unidades.length - 1];
  const bruto: Omit<Passo, 'distanciaM'>[] = [];

  if (primeira) {
    const rumoInicial = rumoDeSaida(primeira) ?? 0;
    const ref = refDaUnidade(primeira);
    if (rota.encaixeOrigemM > ENCAIXE_COM_PASSO_M) {
      bruto.push({
        tipo: 'siga',
        manobra: null,
        texto: `Vá até ${comPreposicao('a', ref)} (${formatarDistancia(rota.encaixeOrigemM)})`,
        rua: primeira.nome,
        acumuladaM: 0,
        indiceNaLinha: 0,
        ponto: primeira.primeiroPonto,
        avisos: [],
      });
    }
    bruto.push({
      tipo: 'partida',
      manobra: null,
      texto: `Siga para o ${rumoCardeal(rumoInicial)} ${comPreposicao('por', ref)}`,
      rua: primeira.nome,
      acumuladaM: 0,
      indiceNaLinha: 0,
      ponto: primeira.primeiroPonto,
      avisos: avisosDaUnidade(primeira),
    });
  }

  for (const j of juncoes) {
    const manobra = Math.abs(j.angulo) >= ANGULO_MANOBRA_GRAUS;
    const nomeMudou = j.antes.chave !== j.depois.chave;
    const marca = mudouMarca(j.antes, j.depois);
    if (!manobra && !nomeMudou && !marca) continue;
    const ref = refDaUnidade(j.depois);
    let tipo: TipoPasso;
    let m: Manobra | null;
    let texto: string;
    if (manobra) {
      tipo = 'curva';
      m = classificarManobra(j.angulo);
      texto = textoDaCurva(m, ref);
    } else if (marca) {
      tipo = 'travessia';
      m = null;
      texto = textoDaTravessia(j.antes, j.depois);
    } else {
      tipo = 'siga';
      m = 'em_frente';
      texto = textoDaCurva('em_frente', ref);
    }
    bruto.push({
      tipo,
      manobra: m,
      texto,
      rua: j.depois.nome,
      acumuladaM: j.posM,
      indiceNaLinha: j.idx,
      ponto: j.ponto,
      avisos: avisosDaUnidade(j.depois),
    });
  }

  if (ultima && rota.encaixeDestinoM > ENCAIXE_COM_PASSO_M) {
    bruto.push({
      tipo: 'siga',
      manobra: null,
      texto: `O destino fica a ${formatarDistancia(rota.encaixeDestinoM)} ${comPreposicao('de', refDaUnidade(ultima))}`,
      rua: ultima.nome,
      acumuladaM: total,
      indiceNaLinha: ultimoIdx,
      ponto: destino,
      avisos: [],
    });
  }
  bruto.push({
    tipo: 'chegada',
    manobra: null,
    texto: textoChegada,
    rua: ultima?.nome ?? null,
    acumuladaM: total,
    indiceNaLinha: ultimoIdx,
    ponto: destino,
    avisos: [],
  });

  // Dois "continue" seguidos a menos de 15 m: o primeiro é um trecho minúsculo de outro nome;
  // fica só o segundo.
  const enxuto = bruto.filter((p, i) => {
    const proximo = bruto[i + 1];
    return !(
      p.manobra === 'em_frente' &&
      proximo?.manobra === 'em_frente' &&
      proximo.acumuladaM - p.acumuladaM < JUNTAR_MANOBRAS_M
    );
  });

  // Travessia curta (menos de 15 m até o passo seguinte, por exemplo "Atravesse a ponte" logo
  // seguido de "Continue pela Praça..."): é fundida no passo seguinte, que mantém o texto e ganha
  // os avisos. A distância dela passa para o passo anterior (distanciaM é recalculado abaixo).
  // Exceção: o último passo antes da chegada fica.
  const fundido: typeof enxuto = [];
  let avisosPendentes: AvisoPasso[] = [];
  enxuto.forEach((p, i) => {
    const proximo = enxuto[i + 1];
    const antesDaChegada =
      proximo === undefined || proximo.tipo === 'chegada' || ehPassoDeDestino(proximo);
    if (
      p.tipo === 'travessia' &&
      !antesDaChegada &&
      proximo.acumuladaM - p.acumuladaM < TRAVESSIA_CURTA_M
    ) {
      avisosPendentes = somarAvisos(avisosPendentes, p.avisos);
      return;
    }
    fundido.push({ ...p, avisos: somarAvisos(avisosPendentes, p.avisos) });
    avisosPendentes = [];
  });

  // distanciaM: do passo até o seguinte. Os passos de encaixe levam a própria distância de
  // encaixe (da origem até a rede; da rede até o destino).
  return fundido.map((p, i) => {
    const proximo = fundido[i + 1];
    let distanciaM = proximo ? Math.max(0, proximo.acumuladaM - p.acumuladaM) : 0;
    if (p.tipo === 'siga' && p.manobra === null && p.texto.startsWith('Vá até')) {
      distanciaM = rota.encaixeOrigemM;
    } else if (p.tipo === 'siga' && p.manobra === null && p.texto.startsWith('O destino fica')) {
      distanciaM = rota.encaixeDestinoM;
    }
    return { ...p, distanciaM };
  });
}
