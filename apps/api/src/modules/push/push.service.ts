import { ROTULO_ESTADO, type Estado } from '@acquascan/shared';
import { env } from '../../config/env';
import { dormir } from '../../lib/dormir';
import { prisma } from '../../lib/prisma';

/**
 * Envio das notificações push quando o estado de um rio piora (RF08).
 *
 * O alerta gravado no banco com `enviadoEm` vazio funciona como uma "caixa de saída". Cada
 * rodada envia o que está pendente e só então preenche `enviadoEm`. Se algo falhar, o alerta
 * continua pendente e a próxima rodada tenta de novo. Preferimos duplicar uma notificação a
 * perder um alerta: num rio subindo, receber duas vezes é um incômodo, não receber é um risco.
 *
 * Expo Push Service (docs.expo.dev/push-notifications/sending-notifications):
 * - até 100 mensagens por requisição; limite de 600 notificações por segundo por projeto;
 * - resposta 200 com `data`: um ticket por mensagem, na mesma ordem. Ticket `ok` traz `id`;
 *   ticket `error` traz `details.error` (`DeviceNotRegistered`: o aparelho não existe mais);
 * - 429 e 5xx são temporários (tentar de novo com espera); outros 4xx são erro da requisição;
 * - o token de acesso é opcional (só exigido com o "enhanced push security" ligado).
 *
 * Privacidade: NUNCA registrar token de push, token de acesso, corpo das mensagens nem dados de
 * usuário. O log tem só contagens e códigos de erro.
 *
 * Reenvio sem duplicar: quando um lote falha de vez, os lotes já aceitos são lembrados (em memória,
 * por alerta) e as rodadas seguintes mandam só os tokens que faltam. Cada alerta tem no máximo
 * 3 rodadas. Esse estado SOME quando a API reinicia: depois de um reinício, um alerta ainda
 * pendente é reenviado por inteiro (pode duplicar, mas não perde).
 */

/** Alertas mais velhos que isto deixam de ser enviados: avisar tarde de uma cheia confunde. */
const JANELA_ALERTA_MS = 3_600_000;
const TAMANHO_LOTE = 100;
const TENTATIVAS = 3;
const TIMEOUT_ENVIO_MS = 10_000;
const ESPERA_BASE_MS = 1_000;
const ESPERA_MAXIMA_MS = 30_000;
const TTL_SEGUNDOS = 1_800;
/** Quantas rodadas de envio cada alerta pode ter. Depois disso, paramos de tentar. */
const MAX_RODADAS_POR_ALERTA = 3;

export interface MensagemPush {
  to: string;
  title: string;
  body: string;
  data: { alertaId: number; estacaoId: number; estado: Estado };
  priority: 'high';
  ttl: number;
  sound: 'default';
}

interface AlertaComEstacao {
  id: number;
  estacaoId: number;
  estadoAnterior: Estado;
  estadoNovo: Estado;
  estacao: { nome: string; cidadeId: number; rio: { nome: string } };
}

/** Só rio, estação e estado: nada que identifique um usuário. */
export function montarMensagem(alerta: AlertaComEstacao, token: string): MensagemPush {
  const novo = ROTULO_ESTADO[alerta.estadoNovo];
  const anterior = ROTULO_ESTADO[alerta.estadoAnterior].toLowerCase();
  return {
    to: token,
    title: `${novo}: ${alerta.estacao.rio.nome}`,
    body: `${alerta.estacao.nome}: o rio passou de ${anterior} para ${novo.toLowerCase()}.`,
    data: { alertaId: alerta.id, estacaoId: alerta.estacaoId, estado: alerta.estadoNovo },
    priority: 'high',
    ttl: TTL_SEGUNDOS,
    sound: 'default',
  };
}

interface Ticket {
  status?: string;
  details?: { error?: string };
}

type ResultadoLote = { aceito: true; tickets: Ticket[] } | { aceito: false };

/** Espera de uma tentativa: o Retry-After (segundos), se vier, ou 1 s, 2 s... Com teto. */
function esperaAntesDeTentarDeNovo(tentativa: number, retryAfter: string | null): number {
  const segundos = retryAfter === null ? NaN : Number(retryAfter);
  if (Number.isFinite(segundos) && segundos >= 0) {
    return Math.min(segundos * 1000, ESPERA_MAXIMA_MS);
  }
  return Math.min(ESPERA_BASE_MS * 2 ** (tentativa - 1), ESPERA_MAXIMA_MS);
}

/** Envia um lote (até 100 mensagens). Em 429 ou 5xx tenta até 3 vezes; depois desiste do lote. */
async function enviarLote(mensagens: MensagemPush[]): Promise<ResultadoLote> {
  const cabecalhos: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (env.EXPO_ACCESS_TOKEN) cabecalhos['authorization'] = `Bearer ${env.EXPO_ACCESS_TOKEN}`;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    let retryAfter: string | null = null;
    try {
      const resposta = await fetch(env.EXPO_PUSH_URL, {
        method: 'POST',
        headers: cabecalhos,
        body: JSON.stringify(mensagens),
        signal: AbortSignal.timeout(TIMEOUT_ENVIO_MS),
      });

      if (resposta.ok) {
        const corpo = (await resposta.json()) as { data?: unknown };
        // Sem um ticket por mensagem não dá para saber o que o Expo aceitou: conta como falha.
        if (!Array.isArray(corpo.data) || corpo.data.length !== mensagens.length) {
          return { aceito: false };
        }
        return { aceito: true, tickets: corpo.data as Ticket[] };
      }
      // Outro 4xx é erro da requisição: tentar de novo não adianta.
      if (resposta.status !== 429 && resposta.status < 500) return { aceito: false };
      retryAfter = resposta.headers.get('retry-after');
    } catch {
      // Rede fora do ar, tempo esgotado ou resposta que não é JSON: tenta de novo.
    }
    if (tentativa < TENTATIVAS) await dormir(esperaAntesDeTentarDeNovo(tentativa, retryAfter));
  }
  return { aceito: false };
}

interface Contagens {
  alertas: number;
  mensagens: number;
  tokensRemovidos: number;
  lotesComFalha: number;
  alertasEsgotados: number;
  errosDeTicket: Map<string, number>;
}

/** O que já foi feito por um alerta ainda não concluído. Só existe em memória. */
interface ProgressoDoAlerta {
  /** Ids (do banco) dos push tokens cujo lote o Expo já aceitou. */
  enviados: Set<number>;
  /** Rodadas em que tentamos enviar este alerta. */
  rodadas: number;
}

const progressoDosAlertas = new Map<number, ProgressoDoAlerta>();

/** Quantos alertas estão sendo acompanhados em memória (para os testes). */
export const alertasEmAcompanhamento = () => progressoDosAlertas.size;

/** Zera a memória do envio, como se a API tivesse reiniciado (para os testes). */
export function esquecerProgressoDosAlertas() {
  progressoDosAlertas.clear();
}

/**
 * Envia o que falta de um alerta. Devolve true quando não resta nenhum token pendente, isto é,
 * todos os lotes foram aceitos pelo Expo (agora ou em rodadas anteriores).
 */
async function enviarAlerta(alerta: AlertaComEstacao, contagens: Contagens): Promise<boolean> {
  const progresso = progressoDosAlertas.get(alerta.id) ?? {
    enviados: new Set<number>(),
    rodadas: 0,
  };

  // Já usou as rodadas: não tenta mais (e já foi registrado no log, uma única vez).
  if (progresso.rodadas >= MAX_RODADAS_POR_ALERTA) return false;

  const tokens = await prisma.pushToken.findMany({
    where: { usuario: { cidadeId: alerta.estacao.cidadeId } },
    select: { id: true, token: true },
  });
  // Tokens que o Expo já aceitou não voltam. Tokens apagados (DeviceNotRegistered) nem
  // aparecem aqui, então também não contam como pendentes.
  const pendentes = tokens.filter((t) => !progresso.enviados.has(t.id));
  if (pendentes.length === 0) return true;

  progresso.rodadas++;
  progressoDosAlertas.set(alerta.id, progresso);

  let todosAceitos = true;
  for (let inicio = 0; inicio < pendentes.length; inicio += TAMANHO_LOTE) {
    const lote = pendentes.slice(inicio, inicio + TAMANHO_LOTE);
    const resultado = await enviarLote(lote.map((t) => montarMensagem(alerta, t.token)));

    if (!resultado.aceito) {
      todosAceitos = false;
      contagens.lotesComFalha++;
      continue;
    }

    contagens.mensagens += lote.length;
    for (const t of lote) progresso.enviados.add(t.id);

    const naoRegistrados: number[] = [];
    resultado.tickets.forEach((ticket, i) => {
      if (ticket?.status !== 'error') return;
      const codigo = ticket.details?.error ?? 'desconhecido';
      if (codigo === 'DeviceNotRegistered') naoRegistrados.push(lote[i]!.id);
      else contagens.errosDeTicket.set(codigo, (contagens.errosDeTicket.get(codigo) ?? 0) + 1);
    });
    if (naoRegistrados.length > 0) {
      await prisma.pushToken.deleteMany({ where: { id: { in: naoRegistrados } } });
      contagens.tokensRemovidos += naoRegistrados.length;
    }
  }

  if (!todosAceitos && progresso.rodadas >= MAX_RODADAS_POR_ALERTA) contagens.alertasEsgotados++;
  return todosAceitos;
}

let emExecucao = false;
let ultimoTotalIgnorado = 0;

/**
 * Uma rodada do envio. Pode ser chamada à vontade (ao registrar um alerta e a cada 30 s):
 * uma flag em memória impede duas rodadas ao mesmo tempo. Se já houver uma rodada, a chamada
 * não faz nada; o que chegou nesse meio-tempo sai na próxima.
 */
export async function processarAlertasPendentes(): Promise<void> {
  if (!env.PUSH_ENVIO_ATIVO || emExecucao) return;
  emExecucao = true;
  try {
    await rodada();
  } finally {
    emExecucao = false;
  }
}

async function rodada(): Promise<void> {
  const limite = new Date(Date.now() - JANELA_ALERTA_MS);

  const pendentes = await prisma.alerta.findMany({
    where: { enviadoEm: null, criadoEm: { gte: limite } },
    include: { estacao: { include: { rio: true } } },
    orderBy: { criadoEm: 'asc' },
  });

  // Os mais velhos que 1 hora ficam como estão; só a contagem vai para o log, e só quando muda.
  const ignorados = await prisma.alerta.count({
    where: { enviadoEm: null, criadoEm: { lt: limite } },
  });
  if (ignorados !== ultimoTotalIgnorado) {
    ultimoTotalIgnorado = ignorados;
    if (ignorados > 0) console.info(`[push] ${ignorados} alerta(s) com mais de 1 hora ignorado(s)`);
  }

  const contagens: Contagens = {
    alertas: 0,
    mensagens: 0,
    tokensRemovidos: 0,
    lotesComFalha: 0,
    alertasEsgotados: 0,
    errosDeTicket: new Map(),
  };

  // Alertas que já foram concluídos ou saíram da janela de 1 hora deixam a memória.
  const idsPendentes = new Set(pendentes.map((a) => a.id));
  for (const id of progressoDosAlertas.keys()) {
    if (!idsPendentes.has(id)) progressoDosAlertas.delete(id);
  }

  for (const alerta of pendentes) {
    try {
      // Só marca como enviado se TODOS os lotes foram aceitos. Senão fica pendente.
      if (await enviarAlerta(alerta, contagens)) {
        await prisma.alerta.update({ where: { id: alerta.id }, data: { enviadoEm: new Date() } });
        progressoDosAlertas.delete(alerta.id);
        contagens.alertas++;
      }
    } catch {
      // Erro do banco: o alerta segue pendente. Mensagem fixa, para não vazar dados.
      console.error('[push] falha ao processar um alerta; ele será tentado de novo');
    }
  }

  if (contagens.alertasEsgotados > 0) {
    console.warn(
      `[push] ${contagens.alertasEsgotados} alerta(s) esgotaram as ${MAX_RODADAS_POR_ALERTA} rodadas de envio e ficarão sem envio`,
    );
  }

  if (pendentes.length === 0) return;
  const erros = [...contagens.errosDeTicket].map(([codigo, n]) => `${codigo}=${n}`).join(' ');
  console.info(
    `[push] alertas enviados: ${contagens.alertas}/${pendentes.length}, ` +
      `mensagens: ${contagens.mensagens}, tokens removidos: ${contagens.tokensRemovidos}, ` +
      `lotes com falha: ${contagens.lotesComFalha}` +
      (erros ? `, erros de ticket: ${erros}` : ''),
  );
}
