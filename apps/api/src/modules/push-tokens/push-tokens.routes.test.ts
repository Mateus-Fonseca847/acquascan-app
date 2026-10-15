import { Writable } from 'node:stream';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client';

interface Linha {
  id: number;
  usuarioId: number;
  token: string;
  atualizadoEm: Date;
}

/** Tabela push_tokens falsa, em memória, com o comportamento do upsert, findMany e deleteMany. */
const { tabela, pushTokenFalso, prismaFalso } = vi.hoisted(() => {
  const tabela = { linhas: [] as Linha[], proximoId: 1, relogio: 0 };
  const agora = () => new Date(Date.UTC(2026, 0, 1) + ++tabela.relogio * 1000);

  const pushTokenFalso = {
    upsert: vi.fn(
      async (args: {
        where: { token: string };
        update: { usuarioId: number; atualizadoEm: Date };
        create: { usuarioId: number; token: string };
      }) => {
        const existente = tabela.linhas.find((l) => l.token === args.where.token);
        if (existente) {
          existente.usuarioId = args.update.usuarioId;
          existente.atualizadoEm = agora();
          return existente;
        }
        const nova = { id: tabela.proximoId++, ...args.create, atualizadoEm: agora() };
        tabela.linhas.push(nova);
        return nova;
      },
    ),
    findMany: vi.fn(async (args: { where: { usuarioId: number }; take: number }) =>
      tabela.linhas
        .filter((l) => l.usuarioId === args.where.usuarioId)
        .sort((a, b) => b.atualizadoEm.getTime() - a.atualizadoEm.getTime() || b.id - a.id)
        .slice(0, args.take)
        .map((l) => ({ id: l.id })),
    ),
    deleteMany: vi.fn(
      async (args: { where: { usuarioId: number; id?: { notIn: number[] }; token?: string } }) => {
        const { usuarioId, id, token } = args.where;
        const antes = tabela.linhas.length;
        tabela.linhas = tabela.linhas.filter(
          (l) =>
            !(
              l.usuarioId === usuarioId &&
              (id === undefined || !id.notIn.includes(l.id)) &&
              (token === undefined || l.token === token)
            ),
        );
        return { count: antes - tabela.linhas.length };
      },
    ),
  };

  const prismaFalso = {
    usuario: { findUnique: vi.fn() },
    pushToken: pushTokenFalso,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ pushToken: pushTokenFalso }),
    ),
  };
  return { tabela, pushTokenFalso, prismaFalso };
});

vi.mock('../../lib/prisma', () => ({ prisma: prismaFalso }));

const { construirApp } = await import('../../app');

/** Guarda tudo o que o logger escreve. */
class SaidaLog extends Writable {
  texto = '';
  override _write(chunk: Buffer, _codificacao: string, fim: () => void) {
    this.texto += chunk.toString();
    fim();
  }
}

const saida = new SaidaLog();
const app = construirApp({ saidaLog: saida });

beforeAll(() => app.ready());

const token = (n: number) => `ExponentPushToken[teste-${n}]`;
const sessao = (usuarioId: number) => `Bearer ${app.jwt.sign({ sub: String(usuarioId) })}`;

beforeEach(() => {
  tabela.linhas = [];
  tabela.proximoId = 1;
  tabela.relogio = 0;
  saida.texto = '';
  prismaFalso.usuario.findUnique.mockReset().mockImplementation(async ({ where }) => ({
    id: where.id,
    nome: 'Maria',
    email: 'maria@exemplo.com',
  }));
  for (const fn of Object.values(pushTokenFalso)) fn.mockClear();
});

const registrar = (usuarioId: number | null, corpo?: object) =>
  app.inject({
    method: 'POST',
    url: '/usuarios/me/push-token',
    ...(usuarioId ? { headers: { authorization: sessao(usuarioId) } } : {}),
    ...(corpo ? { payload: corpo } : {}),
  });
const remover = (usuarioId: number | null, corpo?: object) =>
  app.inject({
    method: 'DELETE',
    url: '/usuarios/me/push-token',
    ...(usuarioId ? { headers: { authorization: sessao(usuarioId) } } : {}),
    ...(corpo ? { payload: corpo } : {}),
  });

describe('POST /usuarios/me/push-token', () => {
  it('registra um token novo com o usuário da sessão e responde 204 sem corpo', async () => {
    const resposta = await registrar(5, { token: token(1) });

    expect(resposta.statusCode).toBe(204);
    expect(resposta.body).toBe('');
    expect(pushTokenFalso.upsert).toHaveBeenCalledTimes(1);
    const args = pushTokenFalso.upsert.mock.calls[0]![0];
    expect(args.where).toEqual({ token: token(1) });
    expect(args.create).toEqual({ usuarioId: 5, token: token(1) });
    expect(tabela.linhas.map((l) => [l.usuarioId, l.token])).toEqual([[5, token(1)]]);
  });

  it('reatribui ao usuário atual um token que era de outro usuário', async () => {
    await registrar(5, { token: token(1) });
    await registrar(6, { token: token(1) });

    expect(pushTokenFalso.upsert.mock.calls[1]![0].update.usuarioId).toBe(6);
    expect(tabela.linhas).toHaveLength(1);
    expect(tabela.linhas[0]).toMatchObject({ usuarioId: 6, token: token(1) });
  });

  it('é idempotente: o mesmo token duas vezes pelo mesmo usuário mantém uma linha', async () => {
    expect((await registrar(5, { token: token(1) })).statusCode).toBe(204);
    const antes = tabela.linhas[0]!.atualizadoEm.getTime();
    expect((await registrar(5, { token: token(1) })).statusCode).toBe(204);

    expect(tabela.linhas).toHaveLength(1);
    expect(tabela.linhas[0]!.atualizadoEm.getTime()).toBeGreaterThan(antes);
  });

  it('acima de 10 tokens, apaga os mais antigos e mantém 10', async () => {
    for (let n = 1; n <= 12; n++) {
      expect((await registrar(5, { token: token(n) })).statusCode).toBe(204);
    }

    const restantes = tabela.linhas.map((l) => l.token).sort();
    expect(restantes).toHaveLength(10);
    expect(restantes).not.toContain(token(1));
    expect(restantes).not.toContain(token(2));
    expect(restantes).toContain(token(12));
  });

  it('o corte de 10 é por usuário: não apaga tokens de outro usuário', async () => {
    await registrar(6, { token: token(100) });
    for (let n = 1; n <= 11; n++) await registrar(5, { token: token(n) });

    expect(tabela.linhas.filter((l) => l.usuarioId === 5)).toHaveLength(10);
    expect(tabela.linhas.filter((l) => l.usuarioId === 6)).toHaveLength(1);
  });

  it('refaz a operação uma vez quando dois pedidos disputam o mesmo token (P2002)', async () => {
    pushTokenFalso.upsert.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('corrida', {
        code: 'P2002',
        clientVersion: 'teste',
      }),
    );
    const resposta = await registrar(5, { token: token(1) });

    expect(resposta.statusCode).toBe(204);
    expect(pushTokenFalso.upsert).toHaveBeenCalledTimes(2);
    expect(tabela.linhas).toHaveLength(1);
  });

  it('desiste depois da segunda tentativa e devolve erro genérico, sem o token', async () => {
    const corrida = () =>
      new Prisma.PrismaClientKnownRequestError(`falha ${token(1)}`, {
        code: 'P2002',
        clientVersion: 'teste',
      });
    pushTokenFalso.upsert.mockRejectedValueOnce(corrida()).mockRejectedValueOnce(corrida());

    const resposta = await registrar(5, { token: token(1) });

    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({ erro: 'Erro interno do servidor' });
    expect(resposta.body).not.toContain('teste-1');
  });

  it('troca erro inesperado do banco por mensagem genérica, sem o token', async () => {
    pushTokenFalso.upsert.mockRejectedValueOnce(new Error(`quebrou ${token(1)}`));
    const resposta = await registrar(5, { token: token(1) });

    expect(resposta.statusCode).toBe(500);
    expect(resposta.body).not.toContain('teste-1');
    expect(saida.texto).not.toContain('teste-1');
  });

  it.each([
    ['sem corpo', undefined],
    ['sem o campo token', {}],
    ['token vazio', { token: '' }],
    ['token malformado', { token: 'isto-nao-e-um-token' }],
    ['token com espaço', { token: 'ExponentPushToken[abc def]' }],
    ['token acima de 200 caracteres', { token: `ExponentPushToken[${'a'.repeat(200)}]` }],
  ])('responde 400 com %s', async (_nome, corpo) => {
    const resposta = await registrar(5, corpo);
    expect(resposta.statusCode).toBe(400);
    expect(pushTokenFalso.upsert).not.toHaveBeenCalled();
  });

  it('o 400 não repete o token recebido na resposta', async () => {
    const resposta = await registrar(5, { token: 'ExponentPushToken[segredo com espaço]' });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.body).not.toContain('segredo');
  });

  it('responde 401 sem sessão e não toca no banco', async () => {
    const resposta = await registrar(null, { token: token(1) });
    expect(resposta.statusCode).toBe(401);
    expect(pushTokenFalso.upsert).not.toHaveBeenCalled();
  });
});

describe('DELETE /usuarios/me/push-token', () => {
  it('apaga o token do próprio usuário e responde 204', async () => {
    await registrar(5, { token: token(1) });
    const resposta = await remover(5, { token: token(1) });

    expect(resposta.statusCode).toBe(204);
    expect(pushTokenFalso.deleteMany).toHaveBeenLastCalledWith({
      where: { usuarioId: 5, token: token(1) },
    });
    expect(tabela.linhas).toHaveLength(0);
  });

  it('token de outro usuário: responde 204 igual e NÃO apaga', async () => {
    await registrar(5, { token: token(1) });
    const resposta = await remover(6, { token: token(1) });

    expect(resposta.statusCode).toBe(204);
    expect(pushTokenFalso.deleteMany).toHaveBeenLastCalledWith({
      where: { usuarioId: 6, token: token(1) },
    });
    expect(tabela.linhas).toHaveLength(1);
    expect(tabela.linhas[0]!.usuarioId).toBe(5);
  });

  it('token inexistente: responde 204', async () => {
    expect((await remover(5, { token: token(99) })).statusCode).toBe(204);
  });

  it('responde 400 com corpo inválido e 401 sem sessão', async () => {
    expect((await remover(5, { token: 'lixo' })).statusCode).toBe(400);
    expect((await remover(5)).statusCode).toBe(400);
    expect((await remover(null, { token: token(1) })).statusCode).toBe(401);
    expect(pushTokenFalso.deleteMany).not.toHaveBeenCalled();
  });

  it('troca erro inesperado do banco por mensagem genérica, sem o token', async () => {
    pushTokenFalso.deleteMany.mockRejectedValueOnce(new Error(`quebrou ${token(1)}`));
    const resposta = await remover(5, { token: token(1) });

    expect(resposta.statusCode).toBe(500);
    expect(resposta.body).not.toContain('teste-1');
  });
});

describe('privacidade', () => {
  it('o token nunca aparece no log, nem nas respostas de sucesso ou de erro', async () => {
    const resultados = [
      await registrar(5, { token: token(7) }),
      await registrar(5, { token: token(7) }),
      await remover(6, { token: token(7) }),
      await remover(5, { token: token(7) }),
      await registrar(5, { token: `${token(7)} com espaço` }),
      await registrar(null, { token: token(7) }),
    ];
    pushTokenFalso.upsert.mockRejectedValueOnce(new Error(`quebrou ${token(7)}`));
    resultados.push(await registrar(5, { token: token(7) }));

    // Prova de que a captura funciona: o log tem as requisições.
    expect(saida.texto).toContain('incoming request');
    expect(saida.texto).toContain('/usuarios/me/push-token');
    // E, mesmo com erro e requisições recusadas, o token não está lá.
    expect(saida.texto).not.toContain('teste-7');
    for (const resposta of resultados) expect(resposta.body).not.toContain('teste-7');
  });
});
