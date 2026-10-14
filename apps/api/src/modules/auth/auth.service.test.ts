import type { CadastroEntrada } from '@acquascan/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { ErroHttp } from '../../lib/erros';

const { prismaFalso, consultarCepFalso } = vi.hoisted(() => ({
  prismaFalso: { usuario: { findUnique: vi.fn(), create: vi.fn() } },
  consultarCepFalso: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({ prisma: prismaFalso }));
vi.mock('../../lib/cep', () => ({ consultarCep: consultarCepFalso }));

const { cadastrarUsuario } = await import('./auth.service');

const entrada: CadastroEntrada = {
  nome: 'Maria',
  email: 'Maria@Exemplo.com',
  cep: '25600000',
  senha: 'senha-segura-123',
  consentimento: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  prismaFalso.usuario.findUnique.mockResolvedValue(null);
  prismaFalso.usuario.create.mockImplementation(
    async ({ data }: { data: { nome: string; email: string } }) => ({
      id: 1,
      nome: data.nome,
      email: data.email,
    }),
  );
  consultarCepFalso.mockResolvedValue({ status: 'ok', latitude: -22.5, longitude: -43.1 });
});

const dadosGravados = () => prismaFalso.usuario.create.mock.calls[0]![0].data;

describe('cadastrarUsuario', () => {
  it('cria o usuário com as coordenadas do CEP', async () => {
    const usuario = await cadastrarUsuario(entrada);

    expect(usuario).toEqual({ id: 1, nome: 'Maria', email: 'maria@exemplo.com' });
    expect(consultarCepFalso).toHaveBeenCalledWith('25600000');
    expect(dadosGravados()).toMatchObject({
      cep: '25600000',
      latitude: -22.5,
      longitude: -43.1,
    });
    expect(dadosGravados().consentimentoEm).toBeInstanceOf(Date);
  });

  it('cria o usuário quando o CEP existe mas não tem coordenadas', async () => {
    consultarCepFalso.mockResolvedValue({ status: 'ok', latitude: null, longitude: null });
    await cadastrarUsuario(entrada);
    expect(dadosGravados()).toMatchObject({ latitude: null, longitude: null });
  });

  it('cria o usuário sem coordenadas quando a consulta de CEP está indisponível', async () => {
    consultarCepFalso.mockResolvedValue({ status: 'indisponivel' });
    await cadastrarUsuario(entrada);
    expect(dadosGravados()).toMatchObject({ latitude: null, longitude: null });
  });

  it('responde 400 quando o CEP não existe', async () => {
    consultarCepFalso.mockResolvedValue({ status: 'nao_encontrado' });
    await expect(cadastrarUsuario(entrada)).rejects.toMatchObject({
      status: 400,
      message: 'CEP não encontrado',
    });
    expect(prismaFalso.usuario.create).not.toHaveBeenCalled();
  });

  it('responde 409 para e-mail duplicado, sem consultar o CEP', async () => {
    prismaFalso.usuario.findUnique.mockResolvedValue({ id: 7 });
    const erro = await cadastrarUsuario(entrada).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroHttp);
    expect(erro).toMatchObject({ status: 409, message: 'E-mail já cadastrado' });
    expect(consultarCepFalso).not.toHaveBeenCalled();
    expect(prismaFalso.usuario.create).not.toHaveBeenCalled();
  });

  it('responde 409 quando o banco recusa o e-mail repetido (P2002)', async () => {
    prismaFalso.usuario.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicado', {
        code: 'P2002',
        clientVersion: 'teste',
      }),
    );
    await expect(cadastrarUsuario(entrada)).rejects.toMatchObject({
      status: 409,
      message: 'E-mail já cadastrado',
    });
  });

  it('troca erros inesperados do banco por uma mensagem sem dados', async () => {
    prismaFalso.usuario.create.mockRejectedValue(new Error('falha com maria@exemplo.com'));
    const erro = await cadastrarUsuario(entrada).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toBe('Falha ao salvar o usuário');
  });

  it('grava só o hash da senha, nunca a senha em texto', async () => {
    await cadastrarUsuario(entrada);
    const { senhaHash, ...resto } = dadosGravados();
    expect(senhaHash.startsWith('scrypt$')).toBe(true);
    expect(JSON.stringify({ senhaHash })).not.toContain(entrada.senha);
    expect(Object.values(resto)).not.toContain(entrada.senha);
  });

  it('grava o e-mail em minúsculas e consulta duplicidade com ele', async () => {
    await cadastrarUsuario({ ...entrada, email: 'MARIA@EXEMPLO.COM' });
    expect(dadosGravados().email).toBe('maria@exemplo.com');
    expect(prismaFalso.usuario.findUnique.mock.calls[0]![0].where).toEqual({
      email: 'maria@exemplo.com',
    });
  });

  it('não devolve senha, CEP nem coordenadas', async () => {
    const usuario = await cadastrarUsuario(entrada);
    expect(Object.keys(usuario).sort()).toEqual(['email', 'id', 'nome']);
    expect(prismaFalso.usuario.create.mock.calls[0]![0].select).toEqual({
      id: true,
      nome: true,
      email: true,
    });
  });
});
