/**
 * Limite de tentativas com os números reais. Abordagem: construirApp aceita a opção
 * `limitarTentativas`, que fica desligada por padrão quando NODE_ENV=test (o vitest.config.ts
 * define isso). Estes testes ligam a opção e criam um app novo por teste (contadores zerados).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { limites, MENSAGEM_MUITAS_TENTATIVAS } from '../../config/limites';

const { prismaFalso } = vi.hoisted(() => ({
  prismaFalso: {
    usuario: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    cidade: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('../../lib/prisma', () => ({ prisma: prismaFalso }));
// A conferência de senha real (scrypt) custa ~100 ms; aqui só importa o resultado.
const { senhaConfere } = vi.hoisted(() => ({ senhaConfere: { valor: false } }));
vi.mock('../../lib/senha', () => ({
  hashSenha: vi.fn(async () => 'scrypt$hash-falso'),
  verificarSenha: vi.fn(async () => senhaConfere.valor),
}));

const { construirApp } = await import('../../app');

async function novoApp(opcoes: { limitarTentativas?: boolean } = { limitarTentativas: true }) {
  const app = construirApp({ logger: false, ...opcoes });
  await app.ready();
  return app;
}
type App = Awaited<ReturnType<typeof novoApp>>;

const IP_A = '10.0.0.1';
const IP_B = '10.0.0.2';

const login = (app: App, email: string, ip = IP_A) =>
  app.inject({
    method: 'POST',
    url: '/auth/login',
    remoteAddress: ip,
    payload: { email, senha: 'senha-qualquer-123' },
  });
const cadastro = (app: App, ip = IP_A) =>
  app.inject({
    method: 'POST',
    url: '/auth/cadastro',
    remoteAddress: ip,
    payload: {
      nome: 'Maria',
      email: 'maria@exemplo.com',
      cidadeId: 1,
      senha: 'senha-segura-123',
      consentimento: true,
    },
  });
const excluir = (app: App, ip = IP_A) =>
  app.inject({
    method: 'DELETE',
    url: '/auth/conta',
    remoteAddress: ip,
    payload: { senha: 'senha-qualquer-123' },
  });

beforeEach(() => {
  senhaConfere.valor = false;
  prismaFalso.usuario.findUnique.mockReset().mockResolvedValue(null);
  prismaFalso.cidade.findMany.mockReset().mockResolvedValue([]);
});

describe('limite de login por IP + e-mail', () => {
  it('bloqueia a 11ª tentativa para o mesmo e-mail, com 429, mensagem e Retry-After', async () => {
    const app = await novoApp();
    for (let i = 0; i < limites.loginPorIpEEmail.max; i++) {
      expect((await login(app, 'maria@exemplo.com')).statusCode).toBe(401);
    }

    const bloqueada = await login(app, 'maria@exemplo.com');

    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json()).toEqual({ erro: MENSAGEM_MUITAS_TENTATIVAS });
    expect(bloqueada.json().erro).not.toBe('Requisição inválida');
    const espera = Number(bloqueada.headers['retry-after']);
    expect(espera).toBeGreaterThan(0);
    expect(espera).toBeLessThanOrEqual(15 * 60);
    expect(bloqueada.headers['x-ratelimit-limit']).toBe('10');
    expect(bloqueada.headers['x-ratelimit-remaining']).toBe('0');
    expect(Number(bloqueada.headers['x-ratelimit-reset'])).toBeGreaterThan(0);
  });

  it('as respostas dentro do limite trazem os cabeçalhos x-ratelimit-*', async () => {
    const app = await novoApp();
    const resposta = await login(app, 'maria@exemplo.com');

    expect(resposta.statusCode).toBe(401);
    expect(resposta.headers['x-ratelimit-limit']).toBe('10');
    expect(resposta.headers['x-ratelimit-remaining']).toBe('9');
    expect(resposta.headers['retry-after']).toBeUndefined();
  });

  it('outro e-mail do mesmo IP não é bloqueado, e o contador de um não afeta o outro', async () => {
    const app = await novoApp();
    for (let i = 0; i < limites.loginPorIpEEmail.max; i++) await login(app, 'maria@exemplo.com');
    expect((await login(app, 'maria@exemplo.com')).statusCode).toBe(429);

    const outro = await login(app, 'joao@exemplo.com');
    expect(outro.statusCode).toBe(401);
    expect(outro.headers['x-ratelimit-remaining']).toBe('9');
  });

  it('o mesmo e-mail vindo de outro IP não é bloqueado', async () => {
    const app = await novoApp();
    for (let i = 0; i < limites.loginPorIpEEmail.max; i++) await login(app, 'maria@exemplo.com');
    expect((await login(app, 'maria@exemplo.com', IP_B)).statusCode).toBe(401);
  });

  it('normaliza o e-mail (espaços e maiúsculas contam como o mesmo)', async () => {
    const app = await novoApp();
    const variacoes = ['maria@exemplo.com', ' MARIA@exemplo.com ', 'Maria@Exemplo.com'];
    for (let i = 0; i < limites.loginPorIpEEmail.max; i++) {
      await login(app, variacoes[i % variacoes.length]!);
    }
    expect((await login(app, ' MARIA@EXEMPLO.COM')).statusCode).toBe(429);
  });

  it('conta também as tentativas bem-sucedidas', async () => {
    senhaConfere.valor = true;
    prismaFalso.usuario.findUnique.mockResolvedValue({
      id: 5,
      nome: 'Maria',
      email: 'maria@exemplo.com',
      senhaHash: 'scrypt$hash-falso',
    });
    const app = await novoApp();
    for (let i = 0; i < limites.loginPorIpEEmail.max; i++) {
      expect((await login(app, 'maria@exemplo.com')).statusCode).toBe(200);
    }
    expect((await login(app, 'maria@exemplo.com')).statusCode).toBe(429);
  });

  it('sem e-mail válido no corpo, a chave é só o IP (e continua limitando)', async () => {
    const app = await novoApp();
    for (let i = 0; i < limites.loginPorIpEEmail.max; i++) {
      expect((await login(app, 'isto-nao-e-email')).statusCode).toBe(400);
    }
    expect((await login(app, 'isto-nao-e-email')).statusCode).toBe(429);
    // Corpo que nem é objeto também cai na chave só do IP, sem quebrar.
    const semCorpo = await app.inject({ method: 'POST', url: '/auth/login', remoteAddress: IP_B });
    expect(semCorpo.statusCode).toBe(400);
  });
});

describe('limite de login por IP', () => {
  it('bloqueia e-mails diferentes do mesmo IP após 40 tentativas', async () => {
    const app = await novoApp();
    for (let i = 0; i < limites.loginPorIp.max; i++) {
      expect((await login(app, `pessoa${i}@exemplo.com`)).statusCode).toBe(401);
    }

    const bloqueada = await login(app, 'pessoa-nova@exemplo.com');
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json()).toEqual({ erro: MENSAGEM_MUITAS_TENTATIVAS });
    expect(Number(bloqueada.headers['retry-after'])).toBeGreaterThan(0);

    // Outro IP continua livre.
    expect((await login(app, 'pessoa-nova@exemplo.com', IP_B)).statusCode).toBe(401);
  });
});

describe('limite de cadastro', () => {
  it('bloqueia a 21ª tentativa do mesmo IP, e outro IP segue livre', async () => {
    // E-mail já cadastrado: 409 rápido, sem hash. A tentativa conta do mesmo jeito.
    prismaFalso.usuario.findUnique.mockResolvedValue({ id: 1 });
    const app = await novoApp();
    for (let i = 0; i < limites.cadastroPorIp.max; i++) {
      expect((await cadastro(app)).statusCode).toBe(409);
    }

    const bloqueada = await cadastro(app);
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json()).toEqual({ erro: MENSAGEM_MUITAS_TENTATIVAS });
    const espera = Number(bloqueada.headers['retry-after']);
    expect(espera).toBeGreaterThan(15 * 60);
    expect(espera).toBeLessThanOrEqual(60 * 60);

    expect((await cadastro(app, IP_B)).statusCode).toBe(409);
  });

  it('o cadastro e o login têm contadores separados', async () => {
    prismaFalso.usuario.findUnique.mockResolvedValue({ id: 1 });
    const app = await novoApp();
    for (let i = 0; i < limites.cadastroPorIp.max + 1; i++) await cadastro(app);
    expect((await login(app, 'maria@exemplo.com')).statusCode).toBe(401);
  });
});

describe('limite de exclusão de conta', () => {
  it('bloqueia a 6ª tentativa do mesmo IP, antes mesmo de checar o token', async () => {
    const app = await novoApp();
    for (let i = 0; i < limites.exclusaoPorIp.max; i++) {
      // Sem token: 401. Conta mesmo assim, porque o limite vem antes da autenticação.
      expect((await excluir(app)).statusCode).toBe(401);
    }

    const bloqueada = await excluir(app);
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json()).toEqual({ erro: MENSAGEM_MUITAS_TENTATIVAS });
    expect(Number(bloqueada.headers['retry-after'])).toBeGreaterThan(0);

    expect((await excluir(app, IP_B)).statusCode).toBe(401);
  });
});

describe('o que não é limitado', () => {
  it('outras rotas não sofrem limite', async () => {
    const app = await novoApp();
    for (let i = 0; i < 60; i++) {
      const resposta = await app.inject({ method: 'GET', url: '/cidades', remoteAddress: IP_A });
      expect(resposta.statusCode).toBe(200);
      expect(resposta.headers['x-ratelimit-limit']).toBeUndefined();
    }
  });

  it('POST /leituras não é limitado (a estação tem autenticação própria)', async () => {
    const app = await novoApp();
    for (let i = 0; i < 60; i++) {
      const resposta = await app.inject({
        method: 'POST',
        url: '/leituras',
        remoteAddress: IP_A,
        payload: { distanciaCm: 100 },
      });
      expect(resposta.statusCode).toBe(401); // sem token de estação, nunca 429
    }
  });

  it('com a opção desligada (padrão nos testes), nada é limitado', async () => {
    const app = await novoApp({});
    for (let i = 0; i < limites.loginPorIpEEmail.max + 5; i++) {
      expect((await login(app, 'maria@exemplo.com')).statusCode).toBe(401);
    }
  });
});
