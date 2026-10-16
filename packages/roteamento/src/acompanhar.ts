/**
 * Acompanhamento da rota: dada a posição (GPS) da pessoa, diz em que passo ela está, quanto falta
 * e se saiu da rota. Função PURA: devolve o novo estado e recebe-o de volta na chamada seguinte.
 * Não recalcula rota (a tela chama o `rotear` de novo quando `foraDaRota`).
 *
 * Passo atual = o último passo já iniciado (`acumuladaM` <= progresso); `distanciaAtePassoM` é a
 * distância até o INÍCIO do passo seguinte (a próxima manobra).
 *
 * A posição é projetada na polilinha da rota procurando só numa janela à frente do progresso
 * (250 m), para não saltar para um trecho paralelo ou um laço da rota. O progresso guardado nunca
 * diminui (o GPS recuar 15 m não faz o passo regredir); a busca começa até 20 m antes dele.
 */
import { ProjecaoLocal } from './geo';
import type { Passo } from './passos';
import type { LatLng, RotaEncontrada } from './tipos';

export interface OpcoesAcompanhamento {
  /** Quanto à frente do progresso se procura a posição (m). Padrão 250. */
  janelaM?: number;
  /** Quanto atrás do progresso se aceita ruído (m). Padrão 20. */
  retrocessoMaxM?: number;
  /** Acima desta distância à rota a amostra conta como "fora" (m). Padrão 30. */
  foraM?: number;
  /** Abaixo desta distância a pessoa volta a estar "na rota" (m). Padrão 20. */
  voltaM?: number;
  /** Amostras seguidas fora para marcar `foraDaRota`. Padrão 3. */
  amostrasFora?: number;
  /** Distância ao destino que conta como chegada (m). Padrão 25. */
  chegadaM?: number;
}

export interface EstadoAcompanhamento {
  /** Progresso máximo já atingido ao longo da rota, em metros. */
  progressoM: number;
  /** Amostras seguidas acima de `foraM`. */
  amostrasFora: number;
  foraDaRota: boolean;
}

export interface ResultadoAcompanhamento {
  estado: EstadoAcompanhamento;
  passoAtualIndice: number;
  distanciaAtePassoM: number;
  distanciaRestanteM: number;
  distanciaDaRotaM: number;
  foraDaRota: boolean;
  chegou: boolean;
}

export const ESTADO_INICIAL: EstadoAcompanhamento = Object.freeze({
  progressoM: 0,
  amostrasFora: 0,
  foraDaRota: false,
});

interface Preparada {
  proj: ProjecaoLocal;
  xs: number[];
  ys: number[];
  /** Distância acumulada de cada vértice, em metros da ROTA (escalada para somar distanciaRedeM). */
  acum: number[];
  /** Metros reais (plano) por metro da rota, para converter a janela. */
  totalM: number;
}

const cache = new WeakMap<RotaEncontrada, Preparada>();

function preparar(rota: RotaEncontrada): Preparada {
  const guardada = cache.get(rota);
  if (guardada) return guardada;
  const primeiro = rota.pontos[0] ?? { latitude: 0, longitude: 0 };
  const proj = new ProjecaoLocal(primeiro.latitude, primeiro.longitude);
  const xs = rota.pontos.map((p) => proj.x(p.longitude));
  const ys = rota.pontos.map((p) => proj.y(p.latitude));
  const plano = [0];
  for (let i = 1; i < xs.length; i++) {
    plano.push(plano[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!));
  }
  const comprimentoPlano = plano[plano.length - 1] ?? 0;
  const totalM = rota.distanciaRedeM;
  const escala = comprimentoPlano > 0 ? totalM / comprimentoPlano : 1;
  const prep = { proj, xs, ys, acum: plano.map((d) => d * escala), totalM };
  cache.set(rota, prep);
  return prep;
}

/** O índice do último passo cuja `acumuladaM` já foi alcançada. */
function passoAtual(passos: readonly Passo[], progressoM: number): number {
  let atual = 0;
  for (let i = 0; i < passos.length; i++) {
    if (passos[i]!.acumuladaM <= progressoM + 1e-9) atual = i;
    else break;
  }
  return atual;
}

export function acompanhar(
  rota: RotaEncontrada,
  passos: readonly Passo[],
  posicao: LatLng,
  estado: EstadoAcompanhamento = ESTADO_INICIAL,
  opcoes: OpcoesAcompanhamento = {},
): ResultadoAcompanhamento {
  const janelaM = opcoes.janelaM ?? 250;
  const retrocessoMaxM = opcoes.retrocessoMaxM ?? 20;
  const foraM = opcoes.foraM ?? 30;
  const voltaM = opcoes.voltaM ?? 20;
  const amostrasParaFora = opcoes.amostrasFora ?? 3;
  const chegadaM = opcoes.chegadaM ?? 25;

  const prep = preparar(rota);
  const { xs, ys, acum, proj } = prep;
  const px = proj.x(posicao.longitude);
  const py = proj.y(posicao.latitude);

  // Projeta nos segmentos cuja faixa [acum[i], acum[i+1]] cruza a janela de busca.
  const de = Math.max(0, estado.progressoM - retrocessoMaxM);
  const ate = estado.progressoM + janelaM;
  let melhorDist = Infinity;
  let melhorAlong = estado.progressoM;
  const candidatos: { dist: number; along: number }[] = [];
  for (let i = 1; i < xs.length; i++) {
    if (acum[i]! < de) continue;
    if (acum[i - 1]! > ate) break;
    const ax = xs[i - 1]!;
    const ay = ys[i - 1]!;
    const dx = xs[i]! - ax;
    const dy = ys[i]! - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    const dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    const along = acum[i - 1]! + t * (acum[i]! - acum[i - 1]!);
    candidatos.push({ dist, along });
    if (dist < melhorDist) melhorDist = dist;
  }
  // Empate prático (laço que volta ao mesmo ponto): vale o que vem primeiro, sem saltar à frente.
  for (const c of candidatos) {
    if (c.dist <= melhorDist + 5) {
      melhorAlong = c.along;
      break;
    }
  }
  if (!Number.isFinite(melhorDist)) {
    // Nada na janela (rota vazia ou posição além do fim): mede até o fim da rota.
    melhorDist = Math.hypot(px - (xs.at(-1) ?? px), py - (ys.at(-1) ?? py));
    melhorAlong = prep.totalM;
  }

  const progressoM = Math.min(prep.totalM, Math.max(estado.progressoM, melhorAlong));

  // Fora da rota: 3 amostras seguidas acima de foraM; volta ao normal abaixo de voltaM.
  let amostrasFora = estado.amostrasFora;
  let foraDaRota = estado.foraDaRota;
  if (melhorDist > foraM) {
    amostrasFora += 1;
    if (amostrasFora >= amostrasParaFora) foraDaRota = true;
  } else if (melhorDist < voltaM) {
    amostrasFora = 0;
    foraDaRota = false;
  } else if (!foraDaRota) {
    amostrasFora = 0; // entre os dois limites a sequência de "fora" se quebra
  }

  const fim = rota.pontos[rota.pontos.length - 1];
  const distAoDestino = fim
    ? Math.hypot(px - proj.x(fim.longitude), py - proj.y(fim.latitude))
    : Infinity;
  const chegou = distAoDestino < chegadaM;

  const indice = passos.length > 0 ? passoAtual(passos, progressoM) : 0;
  const proximo = passos[indice + 1];
  const distanciaAtePassoM = proximo
    ? Math.max(0, proximo.acumuladaM - progressoM)
    : Math.max(0, prep.totalM - progressoM);

  return {
    estado: { progressoM, amostrasFora, foraDaRota },
    passoAtualIndice: indice,
    distanciaAtePassoM,
    distanciaRestanteM: Math.max(0, prep.totalM - progressoM),
    distanciaDaRotaM: melhorDist,
    foraDaRota,
    chegou,
  };
}
