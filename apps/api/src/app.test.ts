/**
 * Testes que não precisam do banco de dados.
 * Testes com banco ficam para quando houver um banco de teste no CI (ver docs/validacao.md).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['DATABASE_URL'] ??= 'postgresql://teste:teste@localhost:5432/teste';

const { construirApp } = await import('./app');
const app = construirApp({ logger: false });

beforeAll(() => app.ready());
afterAll(() => app.close());

describe('API', () => {
  it('GET /saude responde ok', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/saude' });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ status: 'ok' });
  });

  it('POST /leituras sem token responde 401', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/leituras',
      payload: { distanciaCm: 100 },
    });
    expect(resposta.statusCode).toBe(401);
  });

  it('POST /auth/cadastro com dados inválidos responde 400', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/auth/cadastro',
      payload: { nome: 'A' },
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ erro: 'Dados inválidos' });
  });

  it('GET /ruas/busca indica que ainda não foi implementado', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/ruas/busca?q=Imperador' });
    expect(resposta.statusCode).toBe(501);
  });
});
