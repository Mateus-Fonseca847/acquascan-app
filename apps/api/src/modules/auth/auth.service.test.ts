import type { CadastroEntrada } from '@aquascan/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { ErroHttp } from '../../lib/erros';

const { prismaFalso } = vi.hoisted(() => ({
  prismaFalso: {
    usuario: { findUnique: vi.fn(), create: vi.fn() },
    cidade: { findUnique: vi.fn() },
  },
}));

vi.mock('../../lib/prisma', () => ({ prisma: prismaFalso }));
// Espia o hash, mas deixa o scrypt real rodar: o teste confere o formato de verdade.
vi.mock('../../lib/senha', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('../../lib/senha')>();
  return { ...original, hashSenha: vi.fn(original.hashSenha) };
});

const { hashSenha } = await import('../../lib/senha');
const { cadastrarUsuario } = await import('./auth.service');

const entrada: CadastroEntrada = {
  nome: 'Maria',
  email: 'Maria@Exemplo.com',
  cidadeId: 1,
  senha: 'senha-segura-123',
  consentimento: true,
};

const erroDoBanco = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('erro', { code, clientVersion: 'teste' });

beforeEach(() => {
  prismaFalso.usuario.findUnique.mockReset().mockResolvedValue(null);
  prismaFalso.cidade.findUnique.mockReset().mockResolvedValue({ id: 1 });
  prismaFalso.usuario.create
    .mockReset()
    .mockImplementation(async ({ data }: { data: { nome: string; email: string } }) => ({
      id: 1,
      nome: data.nome,
      email: data.email,
    }));
  vi.mocked(hashSenha).mockClear();
});

const dadosGravados = () => prismaFalso.usuario.create.mock.calls[0]![0].data;

describe('cadastrarUsuario', () => {
  it('cria o usuário com a cidade e a data do consentimento', async () => {
    const usuario = await cadastrarUsuario(entrada);

    expect(usuario).toEqual({ id: 1, nome: 'Maria', email: 'maria@exemplo.com' });
    expect(prismaFalso.cidade.findUnique.mock.calls[0]![0].where).toEqual({ id: 1 });
    expect(dadosGravados()).toMatchObject({ nome: 'Maria', cidadeId: 1 });
    expect(dadosGravados().consentimentoEm).toBeInstanceOf(Date);
  });

  it('não grava CEP nem coordenadas', async () => {
    await cadastrarUsuario(entrada);
    expect(Object.keys(dadosGravados()).sort()).toEqual(
      ['cidadeId', 'consentimentoEm', 'email', 'nome', 'senhaHash'].sort(),
    );
  });

  it('responde 400 quando a cidade não existe', async () => {
    prismaFalso.cidade.findUnique.mockResolvedValue(null);
    await expect(cadastrarUsuario(entrada)).rejects.toMatchObject({
      status: 400,
      message: 'Cidade inválida',
    });
    expect(prismaFalso.usuario.create).not.toHaveBeenCalled();
  });

  it('responde 409 para e-mail duplicado, sem consultar a cidade', async () => {
    prismaFalso.usuario.findUnique.mockResolvedValue({ id: 7 });
    const erro = await cadastrarUsuario(entrada).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroHttp);
    expect(erro).toMatchObject({ status: 409, message: 'E-mail já cadastrado' });
    expect(prismaFalso.cidade.findUnique).not.toHaveBeenCalled();
    expect(prismaFalso.usuario.create).not.toHaveBeenCalled();
  });

  it('responde 409 quando o banco recusa o e-mail repetido (P2002)', async () => {
    prismaFalso.usuario.create.mockRejectedValue(erroDoBanco('P2002'));
    await expect(cadastrarUsuario(entrada)).rejects.toMatchObject({
      status: 409,
      message: 'E-mail já cadastrado',
    });
  });

  it('responde 400 quando o banco recusa a cidade (P2003)', async () => {
    prismaFalso.usuario.create.mockRejectedValue(erroDoBanco('P2003'));
    await expect(cadastrarUsuario(entrada)).rejects.toMatchObject({
      status: 400,
      message: 'Cidade inválida',
    });
  });

  it('troca outros erros do banco por uma mensagem sem dados', async () => {
    prismaFalso.usuario.create.mockRejectedValue(erroDoBanco('P2024'));
    const erro = await cadastrarUsuario(entrada).catch((e: unknown) => e);
    expect(erro).not.toBeInstanceOf(ErroHttp);
    expect((erro as Error).message).toBe('Falha ao salvar o usuário');

    prismaFalso.usuario.create.mockRejectedValue(new Error('falha com maria@exemplo.com'));
    const outro = await cadastrarUsuario(entrada).catch((e: unknown) => e);
    expect((outro as Error).message).toBe('Falha ao salvar o usuário');
  });

  it('grava só o hash da senha, nunca a senha em texto', async () => {
    await cadastrarUsuario(entrada);
    expect(hashSenha).toHaveBeenCalledWith(entrada.senha);
    const { senhaHash, ...resto } = dadosGravados();
    expect(senhaHash.startsWith('scrypt$')).toBe(true);
    expect(senhaHash).not.toContain(entrada.senha);
    expect(Object.values(resto)).not.toContain(entrada.senha);
  });

  it('grava o e-mail em minúsculas e consulta duplicidade com ele', async () => {
    await cadastrarUsuario({ ...entrada, email: 'MARIA@EXEMPLO.COM' });
    expect(dadosGravados().email).toBe('maria@exemplo.com');
    expect(prismaFalso.usuario.findUnique.mock.calls[0]![0].where).toEqual({
      email: 'maria@exemplo.com',
    });
  });

  it('não devolve a senha nem dados além de id, nome e e-mail', async () => {
    const usuario = await cadastrarUsuario(entrada);
    expect(Object.keys(usuario).sort()).toEqual(['email', 'id', 'nome']);
    expect(prismaFalso.usuario.create.mock.calls[0]![0].select).toEqual({
      id: true,
      nome: true,
      email: true,
    });
  });
});
