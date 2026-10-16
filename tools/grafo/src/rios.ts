/**
 * Extrai os rios do OpenStreetMap: segmentos com geometria e flags, componentes conexos e lacunas.
 * Só lógica pura (sem rede nem disco), testada com uma fixture em memória.
 *
 * Sentido: a geometria de cada segmento preserva a ORDEM do OSM, que é o sentido do fluxo (a
 * jusante). Nada aqui inverte nem reordena os pontos.
 */
import { DISTANCIA_LACUNA_M, TOLERANCIA_SIMPLIFICACAO_M, type Bbox } from './config';
import { TIPOS_WATERWAY } from './consulta-rios';
import { comprimentoPolilinha, douglasPeucker, haversine, type Ponto } from './geo';
import { normalizarNome } from './nomes';
import type { ElementoOsm, NoOsm, ViaOsm } from './osm';

export interface SegmentoRio {
  /** Número estável e sequencial: ordenado por rio e depois por osmWayId. */
  id: number;
  osmWayId: number;
  /** Nome canônico, o da lista de rios alvo. */
  rio: string;
  /** Nome como está no OSM (da tag do way ou da relação). Nulo nos segmentos inferidos. */
  nomeOsm: string | null;
  /** Entrou por uma grafia alternativa do nome (ALIASES_RIOS). */
  alias: boolean;
  /** Way sem nome absorvido por se ligar a um segmento do rio. */
  inferido: boolean;
  waterway: string;
  /** tunnel=culvert ou tunnel=yes. */
  coberto: boolean;
  /** Valor bruto de `tunnel` (null se não há). */
  tunnel: string | null;
  /** Valor bruto de `covered`, só para conferência: NÃO conta como coberto. */
  covered: string | null;
  /** waterway=canal ou drain. */
  canal: boolean;
  /** Metros, calculados na geometria ORIGINAL (antes de simplificar). */
  comprimentoM: number;
  /** [lat, lon] simplificada, no sentido do fluxo (a jusante). */
  geometria: [number, number][];
}

export interface Lacuna {
  rio: string;
  distanciaM: number;
  /** Ponto médio aproximado entre as duas pontas. */
  lat: number;
  lon: number;
  wayA: number;
  wayB: number;
}

export interface WaySemNome {
  osmWayId: number;
  waterway: string;
  km: number;
}

export interface ResumoRioAlvo {
  rio: string;
  km: number;
  segmentos: number;
  pctCoberto: number;
  pctCanal: number;
  /** Segmentos e km de cada componente conexo, do maior para o menor. */
  componentes: { segmentos: number; km: number }[];
  lacunas: Lacuna[];
  /** Ways sem nome cuja ponta toca o rio (podem ser trechos do mesmo rio sem a tag). */
  semNomeLigados: WaySemNome[];
  /** Quantos segmentos têm covered=yes (não contados como cobertos). */
  comCoveredYes: number;
  /** Segmentos que entraram por uma grafia alternativa (way e nome original). */
  aliases: { osmWayId: number; nomeOsm: string }[];
  /** Ways sem nome absorvidos por se ligarem ao rio. */
  inferidos: WaySemNome[];
}

export interface RioDoMapa {
  /** O nome mais comum entre os ways. */
  nome: string;
  tipos: { waterway: string; km: number }[];
  km: number;
  pctCoberto: number;
  ways: number;
  alvo: boolean;
}

export interface ResultadoRios {
  segmentos: SegmentoRio[];
  alvos: ResumoRioAlvo[];
  /** Todos os waterways nomeados na caixa, do mais longo para o mais curto. */
  todos: RioDoMapa[];
  semNome: { ways: number; km: number };
  estatisticas: {
    waysWaterway: number;
    waysDentroDaCaixa: number;
    relacoesComNome: number;
  };
}

export interface OpcoesRios {
  riosAlvo: readonly string[];
  /** Se informada, ignora ways inteiramente fora da caixa (membros distantes de uma relação). */
  bbox?: Bbox;
  toleranciaM?: number;
  distanciaLacunaM?: number;
  /** Nome normalizado de uma grafia alternativa -> rio alvo (veja ALIASES_RIOS). Padrão: nenhum. */
  aliases?: Readonly<Record<string, string>>;
  /**
   * Absorve ways SEM nome que compartilham um nó com um segmento do rio (e, em cadeia, com outros
   * ways sem nome já absorvidos). Nunca absorve um way que tenha outro nome. Padrão: não.
   */
  absorverSemNome?: boolean;
}

const arredondar = (valor: number, casas: number) => {
  const f = 10 ** casas;
  return Math.round(valor * f) / f;
};

export interface ViaRio {
  osmWayId: number;
  ids: number[];
  pontos: Ponto[];
  /** Nome efetivo (do way ou, na falta, da relação), ou null. */
  nome: string | null;
  chave: string;
  waterway: string;
  tunnel: string | null;
  covered: string | null;
  comprimentoM: number;
}

const ehCoberto = (tunnel: string | null) => tunnel === 'culvert' || tunnel === 'yes';

/** União-busca. */
class Conjuntos {
  private readonly pai: number[];
  constructor(n: number) {
    this.pai = Array.from({ length: n }, (_, i) => i);
  }
  raiz(i: number): number {
    let atual = i;
    while (this.pai[atual] !== atual) {
      this.pai[atual] = this.pai[this.pai[atual]!]!;
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

export interface LeituraVias {
  nos: Map<number, NoOsm>;
  /** Todos os ways waterway (river, stream, canal, drain) com geometria, já com o nome efetivo. */
  viasRio: ViaRio[];
  waysWaterway: number;
  relacoesComNome: number;
}

/**
 * Lê os elementos do OSM: os nós, os ways waterway com o nome efetivo (o do way ou, na falta, o
 * da relação) e a contagem de relações. Se `bbox` for informada, ignora ways inteiramente fora dela.
 */
export function lerVias(
  elementos: readonly ElementoOsm[],
  opcoes: { riosAlvo: readonly string[]; bbox?: Bbox },
): LeituraVias {
  const tipos = new Set<string>(TIPOS_WATERWAY);
  const alvos = new Map<string, string>();
  for (const nome of opcoes.riosAlvo) alvos.set(normalizarNome(nome), nome);

  const nos = new Map<number, NoOsm>();
  const vias: ViaOsm[] = [];
  const nomesDasRelacoes = new Map<number, string[]>(); // id do way -> nomes das relações
  let relacoesComNome = 0;
  for (const e of elementos) {
    if (e.type === 'node') nos.set(e.id, e);
    else if (e.type === 'way') vias.push(e);
    else if (e.tags?.['type'] === 'waterway' && e.tags['name']?.trim()) {
      relacoesComNome++;
      for (const membro of e.members ?? []) {
        if (membro.type !== 'way') continue;
        const lista = nomesDasRelacoes.get(membro.ref) ?? [];
        lista.push(e.tags['name'].trim());
        nomesDasRelacoes.set(membro.ref, lista);
      }
    }
  }

  const dentroDaCaixa = (no: NoOsm) =>
    !opcoes.bbox ||
    (no.lat >= opcoes.bbox.sul &&
      no.lat <= opcoes.bbox.norte &&
      no.lon >= opcoes.bbox.oeste &&
      no.lon <= opcoes.bbox.leste);

  // 1. Cada way waterway vira uma ViaRio, com o nome efetivo.
  const viasRio: ViaRio[] = [];
  let waysWaterway = 0;
  for (const via of vias) {
    const waterway = via.tags?.['waterway'];
    if (waterway === undefined || !tipos.has(waterway)) continue;
    waysWaterway++;

    const ids = via.nodes.filter((id) => nos.has(id));
    if (ids.length < 2) continue;
    if (opcoes.bbox && !ids.some((id) => dentroDaCaixa(nos.get(id)!))) continue;

    // Nome do way; se faltar, o da relação; senão, sem nome. Havendo mais de uma relação,
    // prefere a que é de um rio alvo.
    const doWay = via.tags?.['name']?.trim() || null;
    const dasRelacoes = nomesDasRelacoes.get(via.id) ?? [];
    const nome =
      doWay ?? dasRelacoes.find((n) => alvos.has(normalizarNome(n))) ?? dasRelacoes[0] ?? null;

    const pontos: Ponto[] = ids.map((id) => [nos.get(id)!.lat, nos.get(id)!.lon] as const);
    viasRio.push({
      osmWayId: via.id,
      ids,
      pontos,
      nome,
      chave: nome === null ? '' : normalizarNome(nome),
      waterway,
      tunnel: via.tags?.['tunnel'] ?? null,
      covered: via.tags?.['covered'] ?? null,
      comprimentoM: comprimentoPolilinha(pontos),
    });
  }

  return { nos, viasRio, waysWaterway, relacoesComNome };
}

export function extrairRios(elementos: readonly ElementoOsm[], opcoes: OpcoesRios): ResultadoRios {
  const toleranciaM = opcoes.toleranciaM ?? TOLERANCIA_SIMPLIFICACAO_M;
  const distanciaLacunaM = opcoes.distanciaLacunaM ?? DISTANCIA_LACUNA_M;

  // Rios alvo: nome normalizado -> nome canônico da lista.
  const alvos = new Map<string, string>();
  for (const nome of opcoes.riosAlvo) alvos.set(normalizarNome(nome), nome);

  // Grafias alternativas (só valem se o rio de destino estiver na lista de rios alvo).
  const aliases = new Map<string, string>();
  for (const [apelido, rio] of Object.entries(opcoes.aliases ?? {})) {
    const canonico = alvos.get(normalizarNome(rio));
    if (canonico !== undefined) aliases.set(normalizarNome(apelido), canonico);
  }

  const { nos, viasRio, waysWaterway, relacoesComNome } = lerVias(elementos, opcoes);

  // 2. Todos os waterways nomeados (relatório 1) e os sem nome.
  const grupos = new Map<
    string,
    {
      nomes: Map<string, number>;
      tipos: Map<string, number>;
      km: number;
      kmCoberto: number;
      ways: number;
    }
  >();
  let semNomeWays = 0;
  let semNomeM = 0;
  for (const v of viasRio) {
    if (v.nome === null) {
      semNomeWays++;
      semNomeM += v.comprimentoM;
      continue;
    }
    const g = grupos.get(v.chave) ?? {
      nomes: new Map(),
      tipos: new Map(),
      km: 0,
      kmCoberto: 0,
      ways: 0,
    };
    g.nomes.set(v.nome, (g.nomes.get(v.nome) ?? 0) + 1);
    g.tipos.set(v.waterway, (g.tipos.get(v.waterway) ?? 0) + v.comprimentoM / 1000);
    g.km += v.comprimentoM / 1000;
    if (ehCoberto(v.tunnel)) g.kmCoberto += v.comprimentoM / 1000;
    g.ways++;
    grupos.set(v.chave, g);
  }
  const todos: RioDoMapa[] = [...grupos]
    .map(([chave, g]) => ({
      nome: [...g.nomes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0],
      tipos: [...g.tipos]
        .map(([waterway, km]) => ({ waterway, km: arredondar(km, 2) }))
        .sort((a, b) => b.km - a.km),
      km: arredondar(g.km, 2),
      pctCoberto: g.km === 0 ? 0 : arredondar((g.kmCoberto / g.km) * 100, 1),
      ways: g.ways,
      alvo: alvos.has(chave) || aliases.has(chave),
    }))
    .sort((a, b) => b.km - a.km || a.nome.localeCompare(b.nome));

  // 3. Quais vias pertencem a um rio alvo: pelo nome, por um alias ou (opcional) por ligação.
  interface Escolha {
    via: ViaRio;
    rio: string;
    alias: boolean;
    inferido: boolean;
  }
  const escolhidas = new Map<number, Escolha>(); // osmWayId -> escolha
  for (const v of viasRio) {
    if (v.nome === null) continue;
    const direto = alvos.get(v.chave);
    if (direto !== undefined) {
      escolhidas.set(v.osmWayId, { via: v, rio: direto, alias: false, inferido: false });
      continue;
    }
    const doAlias = aliases.get(v.chave);
    if (doAlias !== undefined) {
      escolhidas.set(v.osmWayId, { via: v, rio: doAlias, alias: true, inferido: false });
    }
  }

  if (opcoes.absorverSemNome) {
    // Ways SEM nome que compartilham um nó com um segmento do rio, em cadeia (um way sem nome
    // absorvido pode puxar o próximo). Way com outro nome nunca é absorvido. Se um way toca dois
    // rios alvo, vale o que vem primeiro na lista de rios alvo.
    const ordemRios = [...alvos.values()];
    const posicao = (rio: string) => ordemRios.indexOf(rio);
    const rioDoNo = new Map<number, string>();
    const registrar = (e: Escolha) => {
      for (const id of e.via.ids) {
        const atual = rioDoNo.get(id);
        if (atual === undefined || posicao(e.rio) < posicao(atual)) rioDoNo.set(id, e.rio);
      }
    };
    for (const e of escolhidas.values()) registrar(e);

    const semNome = viasRio.filter((v) => v.nome === null);
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const v of semNome) {
        if (escolhidas.has(v.osmWayId)) continue;
        let rio: string | undefined;
        for (const id of v.ids) {
          const candidato = rioDoNo.get(id);
          if (candidato !== undefined && (rio === undefined || posicao(candidato) < posicao(rio))) {
            rio = candidato;
          }
        }
        if (rio === undefined) continue;
        const escolha: Escolha = { via: v, rio, alias: false, inferido: true };
        escolhidas.set(v.osmWayId, escolha);
        registrar(escolha);
        mudou = true;
      }
    }
  }

  // Ordem estável: por rio e depois por osmWayId. O id do segmento é a posição nessa ordem.
  const ordenadas = [...escolhidas.values()].sort(
    (a, b) => a.rio.localeCompare(b.rio) || a.via.osmWayId - b.via.osmWayId,
  );
  const viasPorRio = new Map<string, ViaRio[]>();
  const segmentos: SegmentoRio[] = ordenadas.map((e, id) => {
    const v = e.via;
    const lista = viasPorRio.get(e.rio) ?? [];
    lista.push(v);
    viasPorRio.set(e.rio, lista);
    return {
      id,
      osmWayId: v.osmWayId,
      rio: e.rio,
      nomeOsm: v.nome,
      alias: e.alias,
      inferido: e.inferido,
      waterway: v.waterway,
      coberto: ehCoberto(v.tunnel),
      tunnel: v.tunnel,
      covered: v.covered,
      canal: v.waterway === 'canal' || v.waterway === 'drain',
      comprimentoM: arredondar(v.comprimentoM, 1),
      geometria: douglasPeucker(v.pontos, toleranciaM).map(
        ([lat, lon]) => [arredondar(lat, 6), arredondar(lon, 6)] as [number, number],
      ),
    };
  });

  // 4. Por rio alvo: componentes, lacunas e ways sem nome ligados.
  const semNomeVias = viasRio.filter((v) => v.nome === null && !escolhidas.has(v.osmWayId));
  const resumos: ResumoRioAlvo[] = [];
  for (const [, canonico] of alvos) {
    const doRio = viasPorRio.get(canonico) ?? [];
    const segs = segmentos.filter((s) => s.rio === canonico);
    const km = segs.reduce((s, x) => s + x.comprimentoM, 0) / 1000;
    const kmCoberto = segs.filter((s) => s.coberto).reduce((s, x) => s + x.comprimentoM, 0) / 1000;
    const kmCanal = segs.filter((s) => s.canal).reduce((s, x) => s + x.comprimentoM, 0) / 1000;

    // Quem usa cada nó, e se o nó é ponta do segmento.
    const usos = new Map<number, { seg: number; ponta: boolean }[]>();
    doRio.forEach((v, i) => {
      const primeiro = v.ids[0]!;
      const ultimo = v.ids[v.ids.length - 1]!;
      for (const id of new Set(v.ids)) {
        const lista = usos.get(id) ?? [];
        lista.push({ seg: i, ponta: id === primeiro || id === ultimo });
        usos.set(id, lista);
      }
    });

    // Dois segmentos fazem parte do mesmo componente se compartilham um nó que é ponta de
    // pelo menos um deles (cobre a emenda ponta a ponta e a foz de um afluente no meio do outro).
    const conjuntos = new Conjuntos(doRio.length);
    for (const lista of usos.values()) {
      if (lista.length < 2 || !lista.some((u) => u.ponta)) continue;
      for (const u of lista) conjuntos.unir(lista[0]!.seg, u.seg);
    }
    const componentes = new Map<number, { segmentos: number; km: number }>();
    doRio.forEach((v, i) => {
      const raiz = conjuntos.raiz(i);
      const c = componentes.get(raiz) ?? { segmentos: 0, km: 0 };
      c.segmentos++;
      c.km += v.comprimentoM / 1000;
      componentes.set(raiz, c);
    });

    // Pontas livres: nó que é ponta de um segmento e que ninguém mais usa.
    const livres: { seg: number; id: number; lat: number; lon: number }[] = [];
    doRio.forEach((v, i) => {
      const extremos = new Set([v.ids[0]!, v.ids[v.ids.length - 1]!]);
      for (const id of extremos) {
        if (usos.get(id)!.length === 1) {
          livres.push({ seg: i, id, lat: nos.get(id)!.lat, lon: nos.get(id)!.lon });
        }
      }
    });
    const lacunas: Lacuna[] = [];
    for (let a = 0; a < livres.length; a++) {
      for (let b = a + 1; b < livres.length; b++) {
        const pa = livres[a]!;
        const pb = livres[b]!;
        if (conjuntos.raiz(pa.seg) === conjuntos.raiz(pb.seg)) continue;
        const d = haversine([pa.lat, pa.lon], [pb.lat, pb.lon]);
        if (d >= distanciaLacunaM) continue;
        lacunas.push({
          rio: canonico,
          distanciaM: arredondar(d, 1),
          lat: arredondar((pa.lat + pb.lat) / 2, 6),
          lon: arredondar((pa.lon + pb.lon) / 2, 6),
          wayA: doRio[pa.seg]!.osmWayId,
          wayB: doRio[pb.seg]!.osmWayId,
        });
      }
    }
    lacunas.sort((x, y) => x.distanciaM - y.distanciaM);

    // Ways sem nome cuja ponta é um nó do rio.
    const nosDoRio = new Set(usos.keys());
    const semNomeLigados: WaySemNome[] = semNomeVias
      .filter((v) => nosDoRio.has(v.ids[0]!) || nosDoRio.has(v.ids[v.ids.length - 1]!))
      .map((v) => ({
        osmWayId: v.osmWayId,
        waterway: v.waterway,
        km: arredondar(v.comprimentoM / 1000, 3),
      }));

    resumos.push({
      rio: canonico,
      km: arredondar(km, 2),
      segmentos: segs.length,
      pctCoberto: km === 0 ? 0 : arredondar((kmCoberto / km) * 100, 1),
      pctCanal: km === 0 ? 0 : arredondar((kmCanal / km) * 100, 1),
      componentes: [...componentes.values()]
        .map((c) => ({ segmentos: c.segmentos, km: arredondar(c.km, 2) }))
        .sort((x, y) => y.km - x.km),
      lacunas,
      semNomeLigados,
      comCoveredYes: segs.filter((s) => s.covered === 'yes').length,
      aliases: segs
        .filter((s) => s.alias)
        .map((s) => ({ osmWayId: s.osmWayId, nomeOsm: s.nomeOsm ?? '' })),
      inferidos: segs
        .filter((s) => s.inferido)
        .map((s) => ({
          osmWayId: s.osmWayId,
          waterway: s.waterway,
          km: arredondar(s.comprimentoM / 1000, 3),
        })),
    });
  }

  return {
    segmentos,
    alvos: resumos,
    todos,
    semNome: { ways: semNomeWays, km: arredondar(semNomeM / 1000, 2) },
    estatisticas: { waysWaterway, waysDentroDaCaixa: viasRio.length, relacoesComNome },
  };
}

/** GeoJSON (FeatureCollection de LineString) dos segmentos. As coordenadas do GeoJSON são [lon, lat]. */
export function paraGeoJson(segmentos: readonly (SegmentoRio & { indice?: number })[]) {
  return {
    type: 'FeatureCollection' as const,
    features: segmentos.map((s) => ({
      type: 'Feature' as const,
      properties: {
        id: s.id,
        osmWayId: s.osmWayId,
        rio: s.rio,
        nomeOsm: s.nomeOsm,
        alias: s.alias,
        inferido: s.inferido,
        waterway: s.waterway,
        coberto: s.coberto,
        tunnel: s.tunnel,
        covered: s.covered,
        canal: s.canal,
        comprimentoM: s.comprimentoM,
        ...(s.indice !== undefined ? { indice: s.indice } : {}),
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: s.geometria.map(([lat, lon]) => [lon, lat] as [number, number]),
      },
    })),
  };
}
