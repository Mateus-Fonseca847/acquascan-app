import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EstadoRio = 'ESTAVEL' | 'ATENCAO' | 'CRITICO';

interface AlertaFalso {
  id: number;
  estacaoId: number;
  estadoAnterior: EstadoRio;
  estadoNovo: EstadoRio;
  criadoEm: Date;
  enviadoEm: Date | null;
  estacao: { nome: string; cidadeId: number; rio: { nome: string } };
}
interface TokenFalso {
  id: number;
  token: string;
  cidadeId: number;
}

/** Banco falso: alertas e push tokens em memória, com os filtros que o serviço usa. */
const { banco, prismaFalso, envFalso, dormirFalso } = vi.hoisted(() => {
  const banco = { alertas: [] as AlertaFalso[], tokens: [] as TokenFalso[] };

  const prismaFalso = {
    alerta: {
      findMany: vi.fn(async (args: { where: { enviadoEm: null; criadoEm: { gte: Date } } }) =>
        banco.alertas.filter(
          (a) => a.enviadoEm === null && a.criadoEm.getTime() >= args.where.criadoEm.gte.getTime(),
        ),
      ),
      count: vi.fn(
        async (args: { where: { enviadoEm: null; criadoEm: { lt: Date } } }) =>
          banco.alertas.filter(
            (a) => a.enviadoEm === null && a.criadoEm.getTime() < args.where.criadoEm.lt.getTime(),
          ).length,
      ),
      update: vi.fn(async (args: { where: { id: number }; data: { enviadoEm: Date } }) => {
        const alerta = banco.alertas.find((a) => a.id === args.where.id)!;
        alerta.enviadoEm = args.data.enviadoEm;
        return alerta;
      }),
    },
    pushTicket: {
      createMany: vi.fn(async (args: { data: unknown[] }) => ({ count: args.data.length })),
    },
    pushToken: {
      findMany: vi.fn(async (args: { where: { usuario: { cidadeId: number } } }) =>
        banco.tokens
          .filter((t) => t.cidadeId === args.where.usuario.cidadeId)
          .map((t) => ({ id: t.id, token: t.token })),
      ),
      deleteMany: vi.fn(async (args: { where: { id: { in: number[] } } }) => {
        const antes = banco.tokens.length;
        banco.tokens = banco.tokens.filter((t) => !args.where.id.in.includes(t.id));
        return { count: antes - banco.tokens.length };
      }),
    },
  };

  const envFalso = {
    PUSH_ENVIO_ATIVO: true,
    EXPO_PUSH_URL: 'https://expo.invalid/push/send',
    EXPO_ACCESS_TOKEN: undefined as string | undefined,
  };
  const dormirFalso = vi.fn(async (_ms: number) => {});
  return { banco, prismaFalso, envFalso, dormirFalso };
});

vi.mock('../../lib/prisma', () => ({ prisma: prismaFalso }));
vi.mock('../../config/env', () => ({ env: envFalso }));
vi.mock('../../lib/dormir', () => ({ dormir: dormirFalso }));

const {
  alertasEmAcompanhamento,
  esquecerProgressoDosAlertas,
  montarMensagem,
  processarAlertasPendentes,
} = await import('./push.service');

const CIDADE_PETROPOLIS = 1;
const OUTRA_CIDADE = 2;
const HORA = 3_600_000;

function criarAlerta(sobrescrever: Partial<AlertaFalso> = {}): AlertaFalso {
  const alerta: AlertaFalso = {
    id: banco.alertas.length + 1,
    estacaoId: 7,
    estadoAnterior: 'ESTAVEL',
    estadoNovo: 'ATENCAO',
    criadoEm: new Date(),
    enviadoEm: null,
    estacao: { nome: 'Estação Centro', cidadeId: CIDADE_PETROPOLIS, rio: { nome: 'Rio Piabanha' } },
    ...sobrescrever,
  };
  banco.alertas.push(alerta);
  return alerta;
}
function criarTokens(quantidade: number, cidadeId = CIDADE_PETROPOLIS, prefixo = 'p') {
  for (let i = 0; i < quantidade; i++) {
    banco.tokens.push({
      id: banco.tokens.length + 1,
      token: `ExponentPushToken[${prefixo}-${i}]`,
      cidadeId,
    });
  }
}

type Ticket = { status: 'ok'; id: string } | { status: 'error'; message: string; details: object };
const ok: Ticket = { status: 'ok', id: 'recibo' };
const respostaExpo = (data: Ticket[], init: ResponseInit = {}) =>
  new Response(JSON.stringify({ data }), { status: 200, ...init });
/** Responde "ok" para cada mensagem do lote. */
const aceitarTudo = async (_url: unknown, init: RequestInit) =>
  respostaExpo((JSON.parse(init.body as string) as unknown[]).map(() => ok));

let fetchFalso: ReturnType<typeof vi.fn>;
let logs: string;

beforeEach(() => {
  esquecerProgressoDosAlertas();
  banco.alertas = [];
  banco.tokens = [];
  envFalso.PUSH_ENVIO_ATIVO = true;
  envFalso.EXPO_ACCESS_TOKEN = undefined;
  dormirFalso.mockClear();
  for (const fn of [
    ...Object.values(prismaFalso.alerta),
    ...Object.values(prismaFalso.pushToken),
  ]) {
    fn.mockClear();
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const corpos = () =>
  fetchFalso.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));

describe('lotes', () => {
  it('250 tokens viram 3 requisições (100, 100 e 50), uma de cada vez', async () => {
    criarAlerta();
    criarTokens(250);
    let simultaneas = 0;
    let maximo = 0;
    fetchFalso.mockImplementation(async (url: unknown, init: RequestInit) => {
      simultaneas++;
      maximo = Math.max(maximo, simultaneas);
      await new Promise((r) => setTimeout(r, 5));
      simultaneas--;
      return aceitarTudo(url, init);
    });

    await processarAlertasPendentes();

    expect(corpos().map((c) => c.length)).toEqual([100, 100, 50]);
    expect(maximo).toBe(1);
    expect(banco.alertas[0]!.enviadoEm).toBeInstanceOf(Date);
  });

  it('usa a URL configurada, JSON e o timeout de 10 s', async () => {
    criarAlerta();
    criarTokens(1);
    await processarAlertasPendentes();

    const [url, init] = fetchFalso.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(envFalso.EXPO_PUSH_URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('quem recebe', () => {
  it('manda só para os tokens da cidade da estação', async () => {
    criarAlerta();
    criarTokens(3, CIDADE_PETROPOLIS, 'petropolis');
    criarTokens(4, OUTRA_CIDADE, 'outra');

    await processarAlertasPendentes();

    const enviados = corpos()
      .flat()
      .map((m: { to: string }) => m.to);
    expect(enviados).toHaveLength(3);
    expect(enviados.every((t: string) => t.includes('petropolis'))).toBe(true);
    expect(prismaFalso.pushToken.findMany.mock.calls[0]![0].where).toEqual({
      usuario: { cidadeId: CIDADE_PETROPOLIS },
    });
  });

  it('cidade sem tokens: marca como enviado sem chamar o Expo', async () => {
    criarAlerta();
    criarTokens(2, OUTRA_CIDADE);

    await processarAlertasPendentes();

    expect(fetchFalso).not.toHaveBeenCalled();
    expect(banco.alertas[0]!.enviadoEm).toBeInstanceOf(Date);
  });
});

describe('a mensagem', () => {
  it('é em português, com rio, estação e estado, e sem dado pessoal', async () => {
    const alerta = criarAlerta({ estadoAnterior: 'ATENCAO', estadoNovo: 'CRITICO' });
    criarTokens(1);

    await processarAlertasPendentes();

    const [mensagem] = corpos()[0];
    expect(mensagem).toEqual({
      to: 'ExponentPushToken[p-0]',
      title: 'Crítico: Rio Piabanha',
      body: 'Estação Centro: o rio passou de atenção para crítico.',
      data: { alertaId: alerta.id, estacaoId: 7, estado: 'CRITICO' },
      priority: 'high',
      ttl: 1800,
      sound: 'default',
    });
  });

  it('montarMensagem não usa nada além de rio, estação, estado e ids do alerta', () => {
    const alerta = criarAlerta();
    const mensagem = montarMensagem(alerta, 'ExponentPushToken[x]');
    expect(Object.keys(mensagem.data).sort()).toEqual(['alertaId', 'estacaoId', 'estado']);
  });
});

describe('tickets com erro', () => {
  it('DeviceNotRegistered apaga só aquele token; outros erros só são contados', async () => {
    criarAlerta();
    criarTokens(4);
    fetchFalso.mockResolvedValue(
      respostaExpo([
        ok,
        { status: 'error', message: 'segredo', details: { error: 'DeviceNotRegistered' } },
        { status: 'error', message: 'segredo', details: { error: 'MessageRateExceeded' } },
        ok,
      ]),
    );

    await processarAlertasPendentes();

    expect(banco.tokens.map((t) => t.token)).toEqual([
      'ExponentPushToken[p-0]',
      'ExponentPushToken[p-2]',
      'ExponentPushToken[p-3]',
    ]);
    expect(banco.alertas[0]!.enviadoEm).toBeInstanceOf(Date);
    // Só o código do erro vai para o log, com a contagem.
    expect(logs).toContain('MessageRateExceeded=1');
    expect(logs).not.toContain('segredo');
  });
});

describe('falhas do Expo', () => {
  it('5xx: tenta 3 vezes com espera crescente e deixa o alerta pendente', async () => {
    criarAlerta();
    criarTokens(2);
    fetchFalso.mockImplementation(async () => new Response('erro', { status: 503 }));

    await processarAlertasPendentes();

    expect(fetchFalso).toHaveBeenCalledTimes(3);
    expect(dormirFalso.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
    expect(banco.alertas[0]!.enviadoEm).toBeNull();
    expect(prismaFalso.alerta.update).not.toHaveBeenCalled();
  });

  it('a rodada seguinte tenta de novo o alerta que ficou pendente', async () => {
    criarAlerta();
    criarTokens(1);
    fetchFalso.mockImplementation(async () => new Response('erro', { status: 500 }));
    await processarAlertasPendentes();
    expect(banco.alertas[0]!.enviadoEm).toBeNull();

    fetchFalso.mockImplementation(aceitarTudo);
    await processarAlertasPendentes();
    expect(banco.alertas[0]!.enviadoEm).toBeInstanceOf(Date);
  });

  it('429 respeita o Retry-After e depois funciona', async () => {
    criarAlerta();
    criarTokens(1);
    fetchFalso
      .mockResolvedValueOnce(
        new Response('devagar', { status: 429, headers: { 'retry-after': '7' } }),
      )
      .mockImplementation(aceitarTudo);

    await processarAlertasPendentes();

    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect(dormirFalso).toHaveBeenCalledWith(7000);
    expect(banco.alertas[0]!.enviadoEm).toBeInstanceOf(Date);
  });

  it('limita a espera do Retry-After a 30 s', async () => {
    criarAlerta();
    criarTokens(1);
    fetchFalso
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '99999' } }))
      .mockImplementation(aceitarTudo);

    await processarAlertasPendentes();
    expect(dormirFalso).toHaveBeenCalledWith(30_000);
  });

  it('erro de rede também é tentado de novo', async () => {
    criarAlerta();
    criarTokens(1);
    fetchFalso.mockRejectedValueOnce(new TypeError('fetch failed')).mockImplementation(aceitarTudo);

    await processarAlertasPendentes();
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect(banco.alertas[0]!.enviadoEm).toBeInstanceOf(Date);
  });

  it('4xx (erro da requisição) não é tentado de novo e deixa pendente', async () => {
    criarAlerta();
    criarTokens(1);
    fetchFalso.mockImplementation(async () => new Response('{}', { status: 400 }));

    await processarAlertasPendentes();
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(banco.alertas[0]!.enviadoEm).toBeNull();
  });

  it('resposta sem um ticket por mensagem deixa pendente', async () => {
    criarAlerta();
    criarTokens(3);
    fetchFalso.mockImplementation(async () => respostaExpo([ok]));

    await processarAlertasPendentes();
    expect(banco.alertas[0]!.enviadoEm).toBeNull();
  });

  it('se um lote falha de vez, o alerta fica pendente mesmo com os outros aceitos', async () => {
    criarAlerta();
    criarTokens(150);
    fetchFalso
      .mockImplementationOnce(aceitarTudo)
      .mockImplementation(async () => new Response('erro', { status: 502 }));

    await processarAlertasPendentes();
    expect(banco.alertas[0]!.enviadoEm).toBeNull();
    expect(logs).toContain('lotes com falha: 1');
  });
});

describe('quais alertas são enviados', () => {
  it('alerta já enviado não é reenviado', async () => {
    criarAlerta();
    criarTokens(2);
    await processarAlertasPendentes();
    expect(fetchFalso).toHaveBeenCalledTimes(1);

    await processarAlertasPendentes();
    expect(fetchFalso).toHaveBeenCalledTimes(1);

    banco.alertas.push({ ...banco.alertas[0]!, id: 99, enviadoEm: new Date() });
    await processarAlertasPendentes();
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('alerta com mais de 1 hora é ignorado, e só a contagem vai para o log', async () => {
    criarAlerta({ criadoEm: new Date(Date.now() - HORA - 60_000) });
    criarTokens(2);

    await processarAlertasPendentes();

    expect(fetchFalso).not.toHaveBeenCalled();
    expect(banco.alertas[0]!.enviadoEm).toBeNull();
    expect(logs).toContain('1 alerta(s) com mais de 1 hora ignorado(s)');
    expect(logs).not.toContain('ExponentPushToken');
  });

  it('um alerta recente é enviado mesmo com um antigo pendente', async () => {
    criarAlerta({ criadoEm: new Date(Date.now() - 2 * HORA) });
    criarAlerta();
    criarTokens(1);

    await processarAlertasPendentes();
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(banco.alertas[1]!.enviadoEm).toBeInstanceOf(Date);
  });
});

describe('controle de execução', () => {
  it('PUSH_ENVIO_ATIVO=false não chama o Expo nem o banco, e o alerta fica pendente', async () => {
    envFalso.PUSH_ENVIO_ATIVO = false;
    criarAlerta();
    criarTokens(2);

    await processarAlertasPendentes();

    expect(fetchFalso).not.toHaveBeenCalled();
    expect(prismaFalso.alerta.findMany).not.toHaveBeenCalled();
    expect(banco.alertas[0]!.enviadoEm).toBeNull();
  });

  it('duas chamadas ao mesmo tempo rodam uma vez só', async () => {
    criarAlerta();
    criarTokens(2);
    fetchFalso.mockImplementation(async (url: unknown, init: RequestInit) => {
      await new Promise((r) => setTimeout(r, 20));
      return aceitarTudo(url, init);
    });

    await Promise.all([processarAlertasPendentes(), processarAlertasPendentes()]);

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(prismaFalso.alerta.findMany).toHaveBeenCalledTimes(1);
  });

  it('a flag é liberada mesmo depois de um erro do banco', async () => {
    criarAlerta();
    criarTokens(1);
    prismaFalso.alerta.findMany.mockRejectedValueOnce(new Error('banco fora do ar'));
    await expect(processarAlertasPendentes()).rejects.toThrow();

    await processarAlertasPendentes();
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('erro do banco em um alerta não impede os outros', async () => {
    criarAlerta();
    criarAlerta({ id: 2 });
    criarTokens(1);
    prismaFalso.alerta.update.mockRejectedValueOnce(new Error('falhou'));

    await processarAlertasPendentes();

    expect(banco.alertas[0]!.enviadoEm).toBeNull();
    expect(banco.alertas[1]!.enviadoEm).toBeInstanceOf(Date);
    expect(logs).toContain('falha ao processar um alerta');
  });
});

describe('segredos', () => {
  it('só envia o Authorization quando há EXPO_ACCESS_TOKEN', async () => {
    criarAlerta();
    criarTokens(1);
    await processarAlertasPendentes();
    const semToken = (fetchFalso.mock.calls[0]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(semToken).not.toHaveProperty('authorization');

    banco.alertas = [];
    criarAlerta();
    envFalso.EXPO_ACCESS_TOKEN = 'token-de-acesso-secreto';
    await processarAlertasPendentes();
    const comToken = (fetchFalso.mock.calls[1]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(comToken['authorization']).toBe('Bearer token-de-acesso-secreto');
  });

  it('o log não contém push token, token de acesso nem o texto das mensagens', async () => {
    envFalso.EXPO_ACCESS_TOKEN = 'token-de-acesso-secreto';
    criarAlerta();
    criarAlerta({ id: 2, criadoEm: new Date(Date.now() - 2 * HORA) });
    criarTokens(5, CIDADE_PETROPOLIS, 'sigiloso');
    fetchFalso
      .mockResolvedValueOnce(
        respostaExpo([
          ok,
          {
            status: 'error',
            message: 'ExponentPushToken[sigiloso-1] inválido',
            details: { error: 'DeviceNotRegistered' },
          },
          { status: 'error', message: 'detalhe', details: { error: 'MessageTooBig' } },
          ok,
          ok,
        ]),
      )
      .mockImplementation(async () => new Response('erro', { status: 500 }));

    await processarAlertasPendentes();
    banco.alertas[0]!.enviadoEm = null;
    await processarAlertasPendentes();

    expect(logs).toContain('[push]');
    expect(logs).not.toContain('sigiloso');
    expect(logs).not.toContain('token-de-acesso-secreto');
    expect(logs).not.toContain('Rio Piabanha');
    expect(logs).not.toContain('Estação Centro');
  });
});

describe('reenvio sem duplicar', () => {
  const tokensEnviados = (chamada: number) =>
    (corpos()[chamada] as { to: string }[]).map((m) => m.to);
  const falharSempre = async () => new Response('erro', { status: 503 });

  it('lotes 1 e 2 aceitos e o 3 falha: a próxima rodada reenvia só o lote 3', async () => {
    criarAlerta();
    criarTokens(250);
    fetchFalso
      .mockImplementationOnce(aceitarTudo)
      .mockImplementationOnce(aceitarTudo)
      .mockImplementation(falharSempre);

    await processarAlertasPendentes();
    // 2 lotes aceitos + 3 tentativas do lote com falha.
    expect(fetchFalso).toHaveBeenCalledTimes(5);
    expect(banco.alertas[0]!.enviadoEm).toBeNull();
    expect(alertasEmAcompanhamento()).toBe(1);

    fetchFalso.mockClear();
    fetchFalso.mockImplementation(aceitarTudo);
    await processarAlertasPendentes();

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const reenviados = tokensEnviados(0);
    expect(reenviados).toHaveLength(50);
    // Só os 50 últimos: nenhum dos 200 que já tinham sido aceitos volta.
    expect(reenviados[0]).toBe('ExponentPushToken[p-200]');
    expect(reenviados.at(-1)).toBe('ExponentPushToken[p-249]');
    expect(banco.alertas[0]!.enviadoEm).toBeInstanceOf(Date);
  });

  it('depois de 3 rodadas não tenta mais, avisa uma única vez e deixa sem enviadoEm', async () => {
    criarAlerta();
    criarTokens(1);
    fetchFalso.mockImplementation(falharSempre);

    for (let rodada = 1; rodada <= 3; rodada++) await processarAlertasPendentes();
    expect(fetchFalso).toHaveBeenCalledTimes(9); // 3 rodadas x 3 tentativas

    fetchFalso.mockClear();
    for (let rodada = 4; rodada <= 6; rodada++) await processarAlertasPendentes();

    expect(fetchFalso).not.toHaveBeenCalled();
    expect(banco.alertas[0]!.enviadoEm).toBeNull();
    const avisos = logs.split('esgotaram as 3 rodadas').length - 1;
    expect(avisos).toBe(1);
    expect(logs).toContain('1 alerta(s) esgotaram as 3 rodadas');
  });

  it('se a 3ª rodada der certo, o alerta é concluído e não conta como esgotado', async () => {
    criarAlerta();
    criarTokens(1);
    fetchFalso.mockImplementation(falharSempre);
    await processarAlertasPendentes();
    await processarAlertasPendentes();

    fetchFalso.mockImplementation(aceitarTudo);
    await processarAlertasPendentes();

    expect(banco.alertas[0]!.enviadoEm).toBeInstanceOf(Date);
    expect(logs).not.toContain('esgotaram');
    expect(alertasEmAcompanhamento()).toBe(0);
  });

  it('alerta concluído sai da memória', async () => {
    criarAlerta();
    criarTokens(150);
    fetchFalso.mockImplementationOnce(aceitarTudo).mockImplementation(falharSempre);
    await processarAlertasPendentes();
    expect(alertasEmAcompanhamento()).toBe(1);

    fetchFalso.mockImplementation(aceitarTudo);
    await processarAlertasPendentes();
    expect(banco.alertas[0]!.enviadoEm).toBeInstanceOf(Date);
    expect(alertasEmAcompanhamento()).toBe(0);
  });

  it('alerta que sai da janela de 1 hora também sai da memória', async () => {
    const alerta = criarAlerta();
    criarTokens(1);
    fetchFalso.mockImplementation(falharSempre);
    await processarAlertasPendentes();
    expect(alertasEmAcompanhamento()).toBe(1);

    alerta.criadoEm = new Date(Date.now() - HORA - 60_000);
    await processarAlertasPendentes();
    expect(alertasEmAcompanhamento()).toBe(0);
  });

  it('LIMITAÇÃO: a memória some no reinício e o alerta pendente é reenviado por inteiro', async () => {
    criarAlerta();
    criarTokens(250);
    fetchFalso
      .mockImplementationOnce(aceitarTudo)
      .mockImplementationOnce(aceitarTudo)
      .mockImplementation(falharSempre);
    await processarAlertasPendentes();

    esquecerProgressoDosAlertas(); // simula a API reiniciando
    fetchFalso.mockClear();
    fetchFalso.mockImplementation(aceitarTudo);
    await processarAlertasPendentes();

    expect(corpos().map((c) => c.length)).toEqual([100, 100, 50]);
    expect(banco.alertas[0]!.enviadoEm).toBeInstanceOf(Date);
  });

  it('token apagado por DeviceNotRegistered não conta como pendente nem é reenviado', async () => {
    criarAlerta();
    criarTokens(150);
    fetchFalso
      .mockResolvedValueOnce(
        respostaExpo([
          { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } },
          ...Array.from({ length: 99 }, () => ok),
        ]),
      )
      .mockImplementation(falharSempre);
    await processarAlertasPendentes();
    expect(banco.tokens).toHaveLength(149);

    fetchFalso.mockClear();
    fetchFalso.mockImplementation(aceitarTudo);
    await processarAlertasPendentes();

    const reenviados = tokensEnviados(0);
    expect(reenviados).toHaveLength(50);
    expect(reenviados).not.toContain('ExponentPushToken[p-0]');
    expect(banco.alertas[0]!.enviadoEm).toBeInstanceOf(Date);
  });

  it('a falha de um alerta não apaga o progresso de outro', async () => {
    criarAlerta({ id: 1 });
    criarAlerta({ id: 2, estacaoId: 8 });
    criarTokens(1);
    fetchFalso.mockImplementation(falharSempre);
    await processarAlertasPendentes();
    expect(alertasEmAcompanhamento()).toBe(2);
  });
});
