import { ROTULO_ESTADO, type Estado } from '@acquascan/shared';
import { env } from '../../config/env';
import { ESPERA_RECIBO_MS, MAX_IDS_POR_CONSULTA, RETENCAO_RECIBO_MS } from '../../config/push';
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
 * Recibos (receipts): ao aceitar uma mensagem o Expo devolve um ticket. Guardamos o ticket e,
 * 15 minutos depois, perguntamos o recibo (`processarRecibos`) para descobrir falhas de entrega
 * (aparelho que saiu, credenciais inválidas...). Veja config/push.ts.
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
  id?: string;
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

type RespostaDoExpo = { aceito: true; corpo: unknown } | { aceito: false };

/**
 * POST em JSON ao Expo (envio e consulta de recibos). Em 429, 5xx ou falha de rede tenta até
 * 3 vezes, com espera crescente; depois desiste. Outro 4xx não é tentado de novo.
 */
async function postarNoExpo(url: string, corpo: unknown): Promise<RespostaDoExpo> {
  const cabecalhos: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (env.EXPO_ACCESS_TOKEN) cabecalhos['authorization'] = `Bearer ${env.EXPO_ACCESS_TOKEN}`;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    let retryAfter: string | null = null;
    try {
      const resposta = await fetch(url, {
        method: 'POST',
        headers: cabecalhos,
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(TIMEOUT_ENVIO_MS),
      });

      if (resposta.ok) return { aceito: true, corpo: await resposta.json() };
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

/** Envia um lote (até 100 mensagens) e devolve um ticket por mensagem. */
async function enviarLote(mensagens: MensagemPush[]): Promise<ResultadoLote> {
  const resposta = await postarNoExpo(env.EXPO_PUSH_URL, mensagens);
  if (!resposta.aceito) return { aceito: false };

  const data = (resposta.corpo as { data?: unknown } | null)?.data;
  // Sem um ticket por mensagem não dá para saber o que o Expo aceitou: conta como falha.
  if (!Array.isArray(data) || data.length !== mensagens.length) return { aceito: false };
  return { aceito: true, tickets: data as Ticket[] };
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

    // Guarda os tickets para conferir os recibos depois. Se não der para gravar, o alerta
    // continua concluído (a notificação já foi aceita); só não conferimos o recibo.
    const novosTickets = resultado.tickets.flatMap((ticket, i) =>
      ticket?.status === 'ok' && typeof ticket.id === 'string'
        ? [{ ticketId: ticket.id, pushTokenId: lote[i]!.id, alertaId: alerta.id }]
        : [],
    );
    if (novosTickets.length > 0) {
      try {
        await prisma.pushTicket.createMany({ data: novosTickets, skipDuplicates: true });
      } catch {
        console.error(
          '[push] falha ao guardar os tickets; os recibos deste lote não serão conferidos',
        );
      }
    }

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

let recibosEmExecucao = false;
let avisouCredenciaisInvalidas = false;

/** Esquece o aviso de credenciais, como se o processo tivesse reiniciado (para os testes). */
export function reiniciarEstadoDosRecibos() {
  avisouCredenciaisInvalidas = false;
}

interface Receipt {
  status?: string;
  details?: { error?: string };
}

/**
 * Confere os recibos dos tickets guardados (RF08, segunda etapa). Roda a cada 5 minutos.
 * Uma flag em memória impede duas execuções ao mesmo tempo. O parâmetro `agora` existe para
 * os testes; ele decide quais tickets já têm idade para ser consultados e quais expiraram.
 *
 * - com mais de 24 h: apagados e contados como "sem recibo" (o Expo já descartou o recibo);
 * - com 15 min ou mais: consulta em lotes de até 1000 ids;
 * - recibo ausente: o ticket fica para a próxima rodada;
 * - ok: apaga o ticket; DeviceNotRegistered: apaga o PUSH TOKEN (o ticket sai junto, em cascata);
 * - InvalidCredentials: um único aviso por execução do processo, e apaga o ticket;
 * - outros erros: contados por código e o ticket apagado. A notificação NÃO é reenviada, porque a
 *   janela do alerta já passou;
 * - falha de rede ou 5xx: os tickets ficam como estão para a próxima rodada.
 *
 * Privacidade: o log traz só contagens e códigos de erro, nunca token, ticketId ou resposta.
 */
export async function processarRecibos(agora = new Date()): Promise<void> {
  if (!env.PUSH_ENVIO_ATIVO || recibosEmExecucao) return;
  recibosEmExecucao = true;
  try {
    await rodadaDeRecibos(agora);
  } finally {
    recibosEmExecucao = false;
  }
}

async function rodadaDeRecibos(agora: Date): Promise<void> {
  const expirados = await prisma.pushTicket.deleteMany({
    where: { criadoEm: { lt: new Date(agora.getTime() - RETENCAO_RECIBO_MS) } },
  });

  const prontos = await prisma.pushTicket.findMany({
    where: { criadoEm: { lte: new Date(agora.getTime() - ESPERA_RECIBO_MS) } },
    orderBy: { id: 'asc' },
    select: { id: true, ticketId: true, pushTokenId: true },
  });

  let verificados = 0;
  let entregues = 0;
  let aguardando = 0;
  let tokensRemovidos = 0;
  let consultasComFalha = 0;
  const erros = new Map<string, number>();

  for (let inicio = 0; inicio < prontos.length; inicio += MAX_IDS_POR_CONSULTA) {
    const lote = prontos.slice(inicio, inicio + MAX_IDS_POR_CONSULTA);
    const resposta = await postarNoExpo(env.EXPO_RECIBOS_URL, { ids: lote.map((t) => t.ticketId) });

    const data = resposta.aceito ? (resposta.corpo as { data?: unknown } | null)?.data : undefined;
    if (!resposta.aceito || typeof data !== 'object' || data === null || Array.isArray(data)) {
      // Consulta que falhou: os tickets ficam como estão para a próxima rodada.
      consultasComFalha++;
      continue;
    }
    const recibos = data as Record<string, Receipt | undefined>;
    verificados += lote.length;

    const ticketsParaApagar: number[] = [];
    const tokensParaApagar = new Set<number>();

    for (const ticket of lote) {
      const recibo = Object.hasOwn(recibos, ticket.ticketId) ? recibos[ticket.ticketId] : undefined;

      if (recibo?.status === 'ok') {
        entregues++;
        ticketsParaApagar.push(ticket.id);
      } else if (recibo?.status === 'error') {
        const codigo = recibo.details?.error ?? 'desconhecido';
        if (codigo === 'DeviceNotRegistered') {
          // O ticket sai junto com o token (ON DELETE CASCADE).
          tokensParaApagar.add(ticket.pushTokenId);
          continue;
        }
        if (codigo === 'InvalidCredentials' && !avisouCredenciaisInvalidas) {
          avisouCredenciaisInvalidas = true;
          console.warn('[push] credenciais de push inválidas: confira APNs/FCM no Expo');
        }
        erros.set(codigo, (erros.get(codigo) ?? 0) + 1);
        ticketsParaApagar.push(ticket.id);
      } else {
        // Recibo ausente (ainda não existe): mantém o ticket para a próxima rodada.
        aguardando++;
      }
    }

    if (ticketsParaApagar.length > 0) {
      await prisma.pushTicket.deleteMany({ where: { id: { in: ticketsParaApagar } } });
    }
    if (tokensParaApagar.size > 0) {
      await prisma.pushToken.deleteMany({ where: { id: { in: [...tokensParaApagar] } } });
      tokensRemovidos += tokensParaApagar.size;
    }
  }

  if (prontos.length === 0 && expirados.count === 0) return;
  const porCodigo = [...erros].map(([codigo, n]) => `${codigo}=${n}`).join(' ');
  console.info(
    `[push] recibos verificados: ${verificados}, entregues: ${entregues}, ` +
      `tokens removidos: ${tokensRemovidos}, aguardando recibo: ${aguardando}, ` +
      `sem recibo (expirados): ${expirados.count}, consultas com falha: ${consultasComFalha}` +
      (porCodigo ? `, erros: ${porCodigo}` : ''),
  );
}
