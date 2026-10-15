import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EstadoRio = 'ESTAVEL' | 'ATENCAO' | 'CRITICO';

interface AlertaFalso {
  id: number;
  estacaoId: number;
  estadoAnterior: EstadoRio;
  estadoNovo: EstadoRio;
  criadoEm: Date;
  enviadoEm: Date | null;
  pushSuprimidoEm: Date | null;
  estacao: { nome: string; cidadeId: number; rio: { nome: string } };
}
interface TokenFalso {
  id: number;
  token: string;
  cidadeId: number;
}

/** Banco falso em memória, com os dois tipos de consulta que o serviço faz em `alerta`. */
const { banco, prismaFalso, envFalso } = vi.hoisted(() => {
  const banco = { alertas: [] as AlertaFalso[], tokens: [] as TokenFalso[] };

  const prismaFalso = {
    alerta: {
      findMany: vi.fn(
        async (args: {
          where: {
            estacaoId?: number;
            enviadoEm: null | { gte: Date };
            pushSuprimidoEm?: null;
            criadoEm?: { gte: Date };
          };
        }) => {
          const { where } = args;
          if (where.enviadoEm === null) {
            // Alertas pendentes: sem envio, sem supressão, dentro da janela de 1 hora.
            return banco.alertas
              .filter(
                (a) =>
                  a.enviadoEm === null &&
                  a.pushSuprimidoEm === null &&
                  a.criadoEm.getTime() >= where.criadoEm!.gte.getTime(),
              )
              .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime() || a.id - b.id);
          }
          // Cooldown: alertas já enviados da estação, depois de `gte`.
          const desde = where.enviadoEm.gte.getTime();
          return banco.alertas
            .filter(
              (a) =>
                a.estacaoId === where.estacaoId &&
                a.enviadoEm !== null &&
                a.enviadoEm.getTime() >= desde,
            )
            .map((a) => ({ estadoNovo: a.estadoNovo }));
        },
      ),
      count: vi.fn(async () => 0),
      update: vi.fn(
        async (args: {
          where: { id: number };
          data: { enviadoEm?: Date; pushSuprimidoEm?: Date };
        }) => {
          const alerta = banco.alertas.find((a) => a.id === args.where.id)!;
          Object.assign(alerta, args.data);
          return alerta;
        },
      ),
    },
    pushToken: {
      findMany: vi.fn(async (args: { where: { usuario: { cidadeId: number } } }) =>
        banco.tokens
          .filter((t) => t.cidadeId === args.where.usuario.cidadeId)
          .map((t) => ({ id: t.id, token: t.token })),
      ),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    pushTicket: { createMany: vi.fn(async () => ({ count: 0 })) },
  };

  const envFalso = {
    PUSH_ENVIO_ATIVO: true,
    PUSH_COOLDOWN_MIN: 30,
    EXPO_PUSH_URL: 'https://expo.invalid/push/send',
    EXPO_RECIBOS_URL: 'https://expo.invalid/push/getReceipts',
    EXPO_ACCESS_TOKEN: undefined as string | undefined,
  };
  return { banco, prismaFalso, envFalso };
});

vi.mock('../../lib/prisma', () => ({ prisma: prismaFalso }));
vi.mock('../../config/env', () => ({ env: envFalso }));
vi.mock('../../lib/dormir', () => ({ dormir: vi.fn(async (_ms: number) => {}) }));

const { esquecerProgressoDosAlertas, processarAlertasPendentes } = await import('./push.service');

const MIN = 60_000;
const ESTACAO_A = 7;
const ESTACAO_B = 8;
const CIDADE = 1;

function criarAlerta(sobrescrever: Partial<AlertaFalso> = {}): AlertaFalso {
  const alerta: AlertaFalso = {
    id: banco.alertas.length + 1,
    estacaoId: ESTACAO_A,
    estadoAnterior: 'ESTAVEL',
    estadoNovo: 'ATENCAO',
    criadoEm: new Date(Date.now() - 10 * MIN),
    enviadoEm: null,
    pushSuprimidoEm: null,
    estacao: { nome: 'Estação Centro', cidadeId: CIDADE, rio: { nome: 'Rio Piabanha' } },
    ...sobrescrever,
  };
  banco.alertas.push(alerta);
  return alerta;
}
/** Alerta que já foi enviado há `minutos` minutos. */
const jaEnviado = (minutos: number, sobrescrever: Partial<AlertaFalso> = {}) =>
  criarAlerta({
    criadoEm: new Date(Date.now() - (minutos + 1) * MIN),
    enviadoEm: new Date(Date.now() - minutos * MIN),
    ...sobrescrever,
  });

let fetchFalso: ReturnType<typeof vi.fn>;
let logs: string;
const aceitarTudo = async (_url: unknown, init: RequestInit) =>
  new Response(
    JSON.stringify({
      data: (JSON.parse(init.body as string) as unknown[]).map(() => ({ status: 'ok', id: 'x' })),
    }),
    { status: 200 },
  );

beforeEach(() => {
  esquecerProgressoDosAlertas();
  banco.alertas = [];
  banco.tokens = [{ id: 1, token: 'ExponentPushToken[sigiloso-1]', cidadeId: CIDADE }];
  envFalso.PUSH_ENVIO_ATIVO = true;
  envFalso.PUSH_COOLDOWN_MIN = 30;
  for (const grupo of Object.values(prismaFalso)) {
    for (const fn of Object.values(grupo)) fn.mockClear();
  }
  fetchFalso = vi.fn(aceitarTudo);
  vi.stubGlobal('fetch', fetchFalso);

  logs = '';
  for (const metodo of ['info', 'warn', 'error', 'log'] as const) {
    vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      logs += args.map(String).join(' ') + '\n';
    });
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('cooldown de push por estação', () => {
  it('o primeiro alerta da estação é enviado', async () => {
    const alerta = criarAlerta();
    await processarAlertasPendentes();

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(alerta.enviadoEm).toBeInstanceOf(Date);
    expect(alerta.pushSuprimidoEm).toBeNull();
  });

  it('segundo alerta de mesmo estado dentro da janela é suprimido, sem chamar o Expo', async () => {
    jaEnviado(10);
    const segundo = criarAlerta();

    await processarAlertasPendentes();

    expect(fetchFalso).not.toHaveBeenCalled();
    expect(segundo.pushSuprimidoEm).toBeInstanceOf(Date);
    expect(segundo.enviadoEm).toBeNull();
    expect(logs).toContain('suprimidos pelo cooldown: 1');
  });

  it('o alerta suprimido não é reprocessado na rodada seguinte', async () => {
    jaEnviado(10);
    criarAlerta();
    await processarAlertasPendentes();
    prismaFalso.alerta.update.mockClear();

    await processarAlertasPendentes();

    expect(fetchFalso).not.toHaveBeenCalled();
    expect(prismaFalso.alerta.update).not.toHaveBeenCalled();
    expect(prismaFalso.alerta.findMany.mock.calls[0]![0].where).toMatchObject({
      pushSuprimidoEm: null,
    });
  });

  it('depois da janela volta a enviar', async () => {
    jaEnviado(31);
    const novo = criarAlerta();
    await processarAlertasPendentes();

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(novo.enviadoEm).toBeInstanceOf(Date);
    expect(novo.pushSuprimidoEm).toBeNull();
  });

  it('a janela é de PUSH_COOLDOWN_MIN minutos (29 min suprime, 31 min libera)', async () => {
    jaEnviado(29);
    const dentro = criarAlerta();
    await processarAlertasPendentes();
    expect(dentro.pushSuprimidoEm).toBeInstanceOf(Date);

    banco.alertas = [];
    jaEnviado(31);
    const fora = criarAlerta();
    await processarAlertasPendentes();
    expect(fora.enviadoEm).toBeInstanceOf(Date);
  });

  it('escalada de ATENCAO para CRITICO dentro da janela envia', async () => {
    jaEnviado(10, { estadoNovo: 'ATENCAO' });
    const critico = criarAlerta({ estadoAnterior: 'ATENCAO', estadoNovo: 'CRITICO' });

    await processarAlertasPendentes();

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(critico.enviadoEm).toBeInstanceOf(Date);
    expect(critico.pushSuprimidoEm).toBeNull();
  });

  it('CRITICO enviado e depois ATENCAO dentro da janela é suprimido', async () => {
    jaEnviado(10, { estadoAnterior: 'ATENCAO', estadoNovo: 'CRITICO' });
    const atencao = criarAlerta({ estadoNovo: 'ATENCAO' });

    await processarAlertasPendentes();

    expect(fetchFalso).not.toHaveBeenCalled();
    expect(atencao.pushSuprimidoEm).toBeInstanceOf(Date);
  });

  it('compara com o MAIS grave dos enviados na janela', async () => {
    jaEnviado(20, { estadoNovo: 'ATENCAO' });
    jaEnviado(10, { estadoAnterior: 'ATENCAO', estadoNovo: 'CRITICO' });
    const atencao = criarAlerta({ estadoNovo: 'ATENCAO' });

    await processarAlertasPendentes();
    expect(atencao.pushSuprimidoEm).toBeInstanceOf(Date);
  });

  it('estações diferentes não interferem entre si', async () => {
    jaEnviado(10, { estacaoId: ESTACAO_A });
    const daOutra = criarAlerta({ estacaoId: ESTACAO_B });

    await processarAlertasPendentes();

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(daOutra.enviadoEm).toBeInstanceOf(Date);
  });

  it('PUSH_COOLDOWN_MIN=0 desliga o cooldown', async () => {
    envFalso.PUSH_COOLDOWN_MIN = 0;
    jaEnviado(1);
    const segundo = criarAlerta();

    await processarAlertasPendentes();

    expect(segundo.enviadoEm).toBeInstanceOf(Date);
    expect(segundo.pushSuprimidoEm).toBeNull();
    // Nem a consulta do cooldown é feita.
    expect(prismaFalso.alerta.findMany).toHaveBeenCalledTimes(1);
  });

  it('alerta cujo envio falhou não inicia cooldown: o seguinte da estação é enviado', async () => {
    const primeiro = criarAlerta({ criadoEm: new Date(Date.now() - 5 * MIN) });
    const segundo = criarAlerta({ criadoEm: new Date(Date.now() - 4 * MIN) });
    fetchFalso
      .mockImplementationOnce(async () => new Response('erro', { status: 503 }))
      .mockImplementationOnce(async () => new Response('erro', { status: 503 }))
      .mockImplementationOnce(async () => new Response('erro', { status: 503 }))
      .mockImplementation(aceitarTudo);

    await processarAlertasPendentes();

    expect(primeiro.enviadoEm).toBeNull(); // falhou: continua pendente
    expect(primeiro.pushSuprimidoEm).toBeNull();
    expect(segundo.enviadoEm).toBeInstanceOf(Date); // não foi suprimido pela falha do primeiro
    expect(segundo.pushSuprimidoEm).toBeNull();
  });

  it('alerta concluído por falta de tokens conta como enviado para o cooldown', async () => {
    banco.tokens = []; // ninguém na cidade para avisar
    const primeiro = criarAlerta({ criadoEm: new Date(Date.now() - 5 * MIN) });
    const segundo = criarAlerta({ criadoEm: new Date(Date.now() - 4 * MIN) });

    await processarAlertasPendentes();

    expect(fetchFalso).not.toHaveBeenCalled();
    expect(primeiro.enviadoEm).toBeInstanceOf(Date);
    expect(segundo.pushSuprimidoEm).toBeInstanceOf(Date);
  });

  it('dois pendentes na mesma rodada, ATENCAO e depois CRITICO: enviam os dois', async () => {
    const atencao = criarAlerta({
      criadoEm: new Date(Date.now() - 5 * MIN),
      estadoNovo: 'ATENCAO',
    });
    const critico = criarAlerta({
      criadoEm: new Date(Date.now() - 4 * MIN),
      estadoAnterior: 'ATENCAO',
      estadoNovo: 'CRITICO',
    });

    await processarAlertasPendentes();

    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect(atencao.enviadoEm).toBeInstanceOf(Date);
    expect(critico.enviadoEm).toBeInstanceOf(Date);
  });

  it('dois ATENCAO na mesma rodada: envia um e suprime o outro', async () => {
    const primeiro = criarAlerta({ criadoEm: new Date(Date.now() - 5 * MIN) });
    const segundo = criarAlerta({ criadoEm: new Date(Date.now() - 4 * MIN) });

    await processarAlertasPendentes();

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(primeiro.enviadoEm).toBeInstanceOf(Date);
    expect(segundo.pushSuprimidoEm).toBeInstanceOf(Date);
    expect(segundo.enviadoEm).toBeNull();
    expect(logs).toContain('suprimidos pelo cooldown: 1');
  });

  it('fluxo completo: envia, suprime dentro da janela e volta a enviar depois dela', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T12:00:00Z') });
    const a = criarAlerta({ criadoEm: new Date() });
    await processarAlertasPendentes();
    expect(a.enviadoEm).toBeInstanceOf(Date);

    vi.setSystemTime(new Date('2026-10-15T12:10:00Z'));
    const b = criarAlerta({ criadoEm: new Date() });
    await processarAlertasPendentes();
    expect(b.pushSuprimidoEm).toBeInstanceOf(Date);

    vi.setSystemTime(new Date('2026-10-15T12:31:00Z'));
    const c = criarAlerta({ criadoEm: new Date() });
    await processarAlertasPendentes();
    expect(c.enviadoEm).toBeInstanceOf(Date);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('o log traz só contagens, sem token', async () => {
    jaEnviado(10);
    criarAlerta();
    await processarAlertasPendentes();

    expect(logs).toContain('[push]');
    expect(logs).not.toContain('sigiloso');
    expect(logs).not.toContain('ExponentPushToken');
  });
});
