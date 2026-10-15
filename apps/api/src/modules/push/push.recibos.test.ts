import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EstadoRio = 'ESTAVEL' | 'ATENCAO' | 'CRITICO';

interface TokenFalso {
  id: number;
  token: string;
  cidadeId: number;
}
interface TicketFalso {
  id: number;
  ticketId: string;
  pushTokenId: number;
  alertaId: number;
  criadoEm: Date;
}
interface AlertaFalso {
  id: number;
  estacaoId: number;
  estadoAnterior: EstadoRio;
  estadoNovo: EstadoRio;
  criadoEm: Date;
  enviadoEm: Date | null;
  estacao: { nome: string; cidadeId: number; rio: { nome: string } };
}

/** Banco falso em memória, com a cascata (apagar o token apaga os tickets dele). */
const { banco, prismaFalso, envFalso, dormirFalso } = vi.hoisted(() => {
  const banco = {
    alertas: [] as AlertaFalso[],
    tokens: [] as TokenFalso[],
    tickets: [] as TicketFalso[],
    proximoTicket: 1,
  };

  const prismaFalso = {
    alerta: {
      findMany: vi.fn(async (args: { where: { criadoEm: { gte: Date } } }) =>
        banco.alertas.filter(
          (a) => a.enviadoEm === null && a.criadoEm.getTime() >= args.where.criadoEm.gte.getTime(),
        ),
      ),
      count: vi.fn(async () => 0),
      update: vi.fn(async (args: { where: { id: number }; data: { enviadoEm: Date } }) => {
        const alerta = banco.alertas.find((a) => a.id === args.where.id)!;
        alerta.enviadoEm = args.data.enviadoEm;
        return alerta;
      }),
    },
    pushToken: {
      findMany: vi.fn(async (args: { where: { usuario: { cidadeId: number } } }) =>
        banco.tokens
          .filter((t) => t.cidadeId === args.where.usuario.cidadeId)
          .map((t) => ({ id: t.id, token: t.token })),
      ),
      deleteMany: vi.fn(async (args: { where: { id: { in: number[] } } }) => {
        const ids = args.where.id.in;
        const antes = banco.tokens.length;
        banco.tokens = banco.tokens.filter((t) => !ids.includes(t.id));
        banco.tickets = banco.tickets.filter((t) => !ids.includes(t.pushTokenId)); // ON DELETE CASCADE
        return { count: antes - banco.tokens.length };
      }),
    },
    pushTicket: {
      createMany: vi.fn(
        async (args: { data: { ticketId: string; pushTokenId: number; alertaId: number }[] }) => {
          for (const d of args.data) {
            if (banco.tickets.some((t) => t.ticketId === d.ticketId)) continue; // skipDuplicates
            banco.tickets.push({ id: banco.proximoTicket++, ...d, criadoEm: new Date() });
          }
          return { count: args.data.length };
        },
      ),
      findMany: vi.fn(async (args: { where: { criadoEm: { lte: Date } } }) =>
        banco.tickets
          .filter((t) => t.criadoEm.getTime() <= args.where.criadoEm.lte.getTime())
          .sort((a, b) => a.id - b.id)
          .map((t) => ({ id: t.id, ticketId: t.ticketId, pushTokenId: t.pushTokenId })),
      ),
      deleteMany: vi.fn(
        async (args: { where: { criadoEm?: { lt: Date }; id?: { in: number[] } } }) => {
          const { criadoEm, id } = args.where;
          const antes = banco.tickets.length;
          banco.tickets = banco.tickets.filter((t) => {
            if (criadoEm && t.criadoEm.getTime() < criadoEm.lt.getTime()) return false;
            if (id && id.in.includes(t.id)) return false;
            return true;
          });
          return { count: antes - banco.tickets.length };
        },
      ),
    },
  };

  const envFalso = {
    PUSH_ENVIO_ATIVO: true,
    PUSH_COOLDOWN_MIN: 0,
    EXPO_PUSH_URL: 'https://expo.invalid/push/send',
    EXPO_RECIBOS_URL: 'https://expo.invalid/push/getReceipts',
    EXPO_ACCESS_TOKEN: undefined as string | undefined,
  };
  const dormirFalso = vi.fn(async (_ms: number) => {});
  return { banco, prismaFalso, envFalso, dormirFalso };
});

vi.mock('../../lib/prisma', () => ({ prisma: prismaFalso }));
vi.mock('../../config/env', () => ({ env: envFalso }));
vi.mock('../../lib/dormir', () => ({ dormir: dormirFalso }));

const {
  esquecerProgressoDosAlertas,
  processarAlertasPendentes,
  processarRecibos,
  reiniciarEstadoDosRecibos,
} = await import('./push.service');

const MIN = 60_000;
const HORA = 60 * MIN;
const AGORA = new Date('2026-10-15T12:00:00.000Z');

type Receipt = { status: 'ok' } | { status: 'error'; message: string; details: { error: string } };
const erroDe = (codigo: string): Receipt => ({
  status: 'error',
  message: 'texto sigiloso do Expo',
  details: { error: codigo },
});

let fetchFalso: ReturnType<typeof vi.fn>;
let logs: string;
/** O que o "Expo" devolve para os recibos: recebe os ids pedidos e devolve o mapa. */
let recibosDoExpo: (ids: string[]) => Record<string, Receipt>;
let proximoTicketDoExpo = 1;

function criarTokens(quantidade: number, prefixo = 'sigiloso') {
  for (let i = 0; i < quantidade; i++) {
    banco.tokens.push({
      id: banco.tokens.length + 1,
      token: `ExponentPushToken[${prefixo}-${i}]`,
      cidadeId: 1,
    });
  }
}
function criarTicket(sobrescrever: Partial<TicketFalso> = {}): TicketFalso {
  const ticket: TicketFalso = {
    id: banco.proximoTicket++,
    ticketId: `ticket-secreto-${banco.proximoTicket}`,
    pushTokenId: banco.tokens[0]?.id ?? 1,
    alertaId: 1,
    criadoEm: new Date(AGORA.getTime() - 20 * MIN),
    ...sobrescrever,
  };
  banco.tickets.push(ticket);
  return ticket;
}
function criarAlerta() {
  banco.alertas.push({
    id: banco.alertas.length + 1,
    estacaoId: 7,
    estadoAnterior: 'ESTAVEL',
    estadoNovo: 'ATENCAO',
    criadoEm: new Date(),
    enviadoEm: null,
    estacao: { nome: 'Estação Centro', cidadeId: 1, rio: { nome: 'Rio Piabanha' } },
  });
}

beforeEach(() => {
  esquecerProgressoDosAlertas();
  reiniciarEstadoDosRecibos();
  banco.alertas = [];
  banco.tokens = [];
  banco.tickets = [];
  banco.proximoTicket = 1;
  proximoTicketDoExpo = 1;
  envFalso.PUSH_ENVIO_ATIVO = true;
  envFalso.EXPO_ACCESS_TOKEN = undefined;
  dormirFalso.mockClear();
  for (const grupo of Object.values(prismaFalso)) {
    for (const fn of Object.values(grupo)) fn.mockClear();
  }

  recibosDoExpo = () => ({});
  fetchFalso = vi.fn(async (url: string, init: RequestInit) => {
    const corpo = JSON.parse(init.body as string);
    if (url === envFalso.EXPO_RECIBOS_URL) {
      return new Response(JSON.stringify({ data: recibosDoExpo(corpo.ids) }), { status: 200 });
    }
    // Envio: um ticket ok por mensagem.
    const data = (corpo as unknown[]).map(() => ({
      status: 'ok',
      id: `ticket-secreto-expo-${proximoTicketDoExpo++}`,
    }));
    return new Response(JSON.stringify({ data }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchFalso);

  logs = '';
  for (const metodo of ['info', 'warn', 'error', 'log'] as const) {
    vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      logs += args.map(String).join(' ') + '\n';
    });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const chamadasDeRecibos = () =>
  fetchFalso.mock.calls.filter(([url]) => url === envFalso.EXPO_RECIBOS_URL);
const idsPedidos = () =>
  chamadasDeRecibos().map(
    ([, init]) => (JSON.parse((init as RequestInit).body as string) as { ids: string[] }).ids,
  );

describe('gravação dos tickets no envio', () => {
  it('guarda cada ticket ok ligado ao token e ao alerta', async () => {
    criarAlerta();
    criarTokens(3);

    await processarAlertasPendentes();

    expect(banco.tickets).toHaveLength(3);
    expect(banco.tickets.map((t) => t.pushTokenId).sort()).toEqual([1, 2, 3]);
    expect(banco.tickets.every((t) => t.alertaId === 1)).toBe(true);
    expect(banco.tickets.every((t) => t.ticketId.startsWith('ticket-secreto-expo-'))).toBe(true);
    expect(prismaFalso.pushTicket.createMany).toHaveBeenCalledTimes(1);
  });

  it('não guarda ticket de mensagem que o Expo recusou', async () => {
    criarAlerta();
    criarTokens(2);
    fetchFalso.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { status: 'ok', id: 'ticket-secreto-a' },
            { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } },
          ],
        }),
        { status: 200 },
      ),
    );

    await processarAlertasPendentes();

    expect(banco.tickets.map((t) => t.ticketId)).toEqual(['ticket-secreto-a']);
  });

  it('falha ao gravar os tickets não impede a conclusão do alerta', async () => {
    criarAlerta();
    criarTokens(2);
    prismaFalso.pushTicket.createMany.mockRejectedValueOnce(
      new Error('quebrou ticket-secreto-xyz ExponentPushToken[sigiloso-0]'),
    );

    await processarAlertasPendentes();

    expect(banco.alertas[0]!.enviadoEm).toBeInstanceOf(Date);
    expect(logs).toContain('falha ao guardar os tickets');
    expect(logs).not.toContain('sigiloso');
    expect(logs).not.toContain('ticket-secreto');
  });
});

describe('quais tickets são consultados', () => {
  it('ticket com menos de 15 minutos não é consultado; com 15 minutos exatos, é', async () => {
    criarTokens(1);
    criarTicket({
      ticketId: 'ticket-secreto-novo',
      criadoEm: new Date(AGORA.getTime() - 14 * MIN),
    });

    await processarRecibos(AGORA);
    expect(fetchFalso).not.toHaveBeenCalled();

    criarTicket({ ticketId: 'ticket-secreto-15', criadoEm: new Date(AGORA.getTime() - 15 * MIN) });
    await processarRecibos(AGORA);
    expect(idsPedidos()).toEqual([['ticket-secreto-15']]);
  });

  it('o envio usa a URL de recibos, JSON com { ids } e o tempo limite', async () => {
    criarTokens(1);
    criarTicket({ ticketId: 'ticket-secreto-1' });
    await processarRecibos(AGORA);

    const [url, init] = chamadasDeRecibos()[0]! as [string, RequestInit];
    expect(url).toBe(envFalso.EXPO_RECIBOS_URL);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['ticket-secreto-1'] });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('ticket com mais de 24 horas é apagado, contado como sem recibo e não consultado', async () => {
    criarTokens(1);
    criarTicket({
      ticketId: 'ticket-secreto-velho',
      criadoEm: new Date(AGORA.getTime() - 25 * HORA),
    });

    await processarRecibos(AGORA);

    expect(banco.tickets).toHaveLength(0);
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(logs).toContain('sem recibo (expirados): 1');
  });

  it('um lote respeita o máximo de 1000 ids por consulta', async () => {
    criarTokens(1);
    for (let i = 0; i < 2500; i++) criarTicket({ ticketId: `ticket-secreto-${i}` });

    await processarRecibos(AGORA);

    expect(idsPedidos().map((ids) => ids.length)).toEqual([1000, 1000, 500]);
  });
});

describe('o que fazer com cada recibo', () => {
  it('recibo ok apaga o ticket (e conta como entregue)', async () => {
    criarTokens(1);
    const ticket = criarTicket();
    recibosDoExpo = (ids) => Object.fromEntries(ids.map((id) => [id, { status: 'ok' } as Receipt]));

    await processarRecibos(AGORA);

    expect(banco.tickets).toHaveLength(0);
    expect(banco.tokens).toHaveLength(1);
    expect(logs).toContain('verificados: 1, entregues: 1');
    expect(logs).not.toContain(ticket.ticketId);
  });

  it('DeviceNotRegistered apaga o token e, por cascata, o ticket', async () => {
    criarTokens(2);
    const doToken1 = criarTicket({ ticketId: 'ticket-secreto-a', pushTokenId: 1 });
    criarTicket({ ticketId: 'ticket-secreto-b', pushTokenId: 2 });
    recibosDoExpo = () => ({
      [doToken1.ticketId]: erroDe('DeviceNotRegistered'),
      'ticket-secreto-b': { status: 'ok' },
    });

    await processarRecibos(AGORA);

    expect(banco.tokens.map((t) => t.id)).toEqual([2]);
    expect(banco.tickets).toHaveLength(0);
    expect(prismaFalso.pushToken.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [1] } } });
    expect(logs).toContain('tokens removidos: 1');
  });

  it('InvalidCredentials avisa uma só vez, mesmo em duas rodadas, e apaga o ticket', async () => {
    criarTokens(1);
    recibosDoExpo = (ids) =>
      Object.fromEntries(ids.map((id) => [id, erroDe('InvalidCredentials')]));

    criarTicket({ ticketId: 'ticket-secreto-1' });
    await processarRecibos(AGORA);
    criarTicket({ ticketId: 'ticket-secreto-2' });
    await processarRecibos(AGORA);

    expect(banco.tickets).toHaveLength(0);
    expect(logs.split('credenciais de push inválidas').length - 1).toBe(1);
    expect(logs).toContain('confira APNs/FCM no Expo');
    expect(logs).toContain('InvalidCredentials=1');
  });

  it('outro erro é contado por código, o ticket é apagado e nada é reenviado', async () => {
    criarTokens(3);
    criarTicket({ ticketId: 'ticket-secreto-1', pushTokenId: 1 });
    criarTicket({ ticketId: 'ticket-secreto-2', pushTokenId: 2 });
    criarTicket({ ticketId: 'ticket-secreto-3', pushTokenId: 3 });
    recibosDoExpo = () => ({
      'ticket-secreto-1': erroDe('MessageTooBig'),
      'ticket-secreto-2': erroDe('MessageRateExceeded'),
      'ticket-secreto-3': erroDe('MessageTooBig'),
    });

    await processarRecibos(AGORA);

    expect(banco.tickets).toHaveLength(0);
    expect(banco.tokens).toHaveLength(3);
    expect(logs).toContain('MessageTooBig=2');
    expect(logs).toContain('MessageRateExceeded=1');
    // Só a consulta de recibos: nenhuma mensagem foi enviada de novo.
    expect(fetchFalso.mock.calls.every(([url]) => url === envFalso.EXPO_RECIBOS_URL)).toBe(true);
    expect(logs).not.toContain('sigiloso');
  });

  it('recibo ausente mantém o ticket, que é consultado de novo na rodada seguinte', async () => {
    criarTokens(1);
    criarTicket({ ticketId: 'ticket-secreto-1' });
    recibosDoExpo = () => ({}); // o Expo ainda não tem o recibo

    await processarRecibos(AGORA);
    expect(banco.tickets).toHaveLength(1);
    expect(logs).toContain('aguardando recibo: 1');

    recibosDoExpo = () => ({ 'ticket-secreto-1': { status: 'ok' } });
    await processarRecibos(AGORA);

    expect(idsPedidos()).toEqual([['ticket-secreto-1'], ['ticket-secreto-1']]);
    expect(banco.tickets).toHaveLength(0);
  });

  it('mistura: ok, DeviceNotRegistered e ausente na mesma consulta', async () => {
    criarTokens(3);
    criarTicket({ ticketId: 'ticket-secreto-ok', pushTokenId: 1 });
    criarTicket({ ticketId: 'ticket-secreto-sumiu', pushTokenId: 2 });
    criarTicket({ ticketId: 'ticket-secreto-ausente', pushTokenId: 3 });
    recibosDoExpo = () => ({
      'ticket-secreto-ok': { status: 'ok' },
      'ticket-secreto-sumiu': erroDe('DeviceNotRegistered'),
    });

    await processarRecibos(AGORA);

    expect(banco.tickets.map((t) => t.ticketId)).toEqual(['ticket-secreto-ausente']);
    expect(banco.tokens.map((t) => t.id).sort()).toEqual([1, 3]);
  });
});

describe('falhas', () => {
  it('5xx mantém os tickets, com 3 tentativas e espera crescente', async () => {
    criarTokens(1);
    criarTicket({ ticketId: 'ticket-secreto-1' });
    fetchFalso.mockImplementation(async () => new Response('erro', { status: 503 }));

    await processarRecibos(AGORA);

    expect(fetchFalso).toHaveBeenCalledTimes(3);
    expect(dormirFalso.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
    expect(banco.tickets).toHaveLength(1);
    expect(prismaFalso.pushTicket.deleteMany).toHaveBeenCalledTimes(1); // só a limpeza de expirados
    expect(logs).toContain('consultas com falha: 1');
  });

  it('erro de rede mantém os tickets', async () => {
    criarTokens(1);
    criarTicket();
    fetchFalso.mockRejectedValue(new TypeError('fetch failed'));

    await processarRecibos(AGORA);
    expect(banco.tickets).toHaveLength(1);
    expect(banco.tokens).toHaveLength(1);
  });

  it('resposta em formato inesperado mantém os tickets', async () => {
    criarTokens(1);
    criarTicket();
    fetchFalso.mockImplementation(
      async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    await processarRecibos(AGORA);
    expect(banco.tickets).toHaveLength(1);
  });

  it('se uma consulta falha, só os tickets dela ficam; as outras seguem', async () => {
    criarTokens(1);
    for (let i = 0; i < 1500; i++) criarTicket({ ticketId: `ticket-secreto-${i}` });
    fetchFalso
      .mockImplementationOnce(async () => new Response('erro', { status: 400 })) // 1ª consulta: falha
      .mockImplementation(async (_url: string, init: RequestInit) => {
        const { ids } = JSON.parse(init.body as string) as { ids: string[] };
        return new Response(
          JSON.stringify({ data: Object.fromEntries(ids.map((id) => [id, { status: 'ok' }])) }),
          { status: 200 },
        );
      });

    await processarRecibos(AGORA);

    expect(banco.tickets).toHaveLength(1000); // o 1º lote ficou
    expect(banco.tickets[0]!.ticketId).toBe('ticket-secreto-0');
  });
});

describe('controle de execução e segredos', () => {
  it('PUSH_ENVIO_ATIVO=false não chama o Expo nem o banco', async () => {
    envFalso.PUSH_ENVIO_ATIVO = false;
    criarTokens(1);
    criarTicket();

    await processarRecibos(AGORA);

    expect(fetchFalso).not.toHaveBeenCalled();
    expect(prismaFalso.pushTicket.findMany).not.toHaveBeenCalled();
    expect(prismaFalso.pushTicket.deleteMany).not.toHaveBeenCalled();
    expect(banco.tickets).toHaveLength(1);
  });

  it('duas chamadas ao mesmo tempo rodam uma vez só', async () => {
    criarTokens(1);
    criarTicket();
    fetchFalso.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    });

    await Promise.all([processarRecibos(AGORA), processarRecibos(AGORA)]);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('só envia o Authorization quando há EXPO_ACCESS_TOKEN', async () => {
    criarTokens(1);
    criarTicket();
    await processarRecibos(AGORA);
    const semToken = (fetchFalso.mock.calls[0]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(semToken).not.toHaveProperty('authorization');

    envFalso.EXPO_ACCESS_TOKEN = 'token-de-acesso-secreto';
    await processarRecibos(AGORA);
    const comToken = (fetchFalso.mock.calls[1]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(comToken['authorization']).toBe('Bearer token-de-acesso-secreto');
  });

  it('o log não contém token de push, ticketId, token de acesso nem texto do Expo', async () => {
    envFalso.EXPO_ACCESS_TOKEN = 'token-de-acesso-secreto';
    criarAlerta();
    criarTokens(4);
    await processarAlertasPendentes(); // grava 4 tickets
    for (const t of banco.tickets) t.criadoEm = new Date(AGORA.getTime() - 20 * MIN);
    criarTicket({
      ticketId: 'ticket-secreto-velho',
      criadoEm: new Date(AGORA.getTime() - 30 * HORA),
    });

    const [t1, t2, t3] = banco.tickets;
    recibosDoExpo = () => ({
      [t1!.ticketId]: { status: 'ok' },
      [t2!.ticketId]: erroDe('DeviceNotRegistered'),
      [t3!.ticketId]: erroDe('InvalidCredentials'),
    });
    await processarRecibos(AGORA);
    fetchFalso.mockImplementation(async () => new Response('erro', { status: 500 }));
    await processarRecibos(AGORA);

    expect(logs).toContain('[push]');
    expect(logs).not.toContain('sigiloso');
    expect(logs).not.toContain('ExponentPushToken');
    expect(logs).not.toContain('ticket-secreto');
    expect(logs).not.toContain('token-de-acesso-secreto');
  });
});
