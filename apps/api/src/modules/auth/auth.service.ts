import type { CadastroEntrada, LoginEntrada } from '@aquascan/shared';
import { Prisma } from '../../generated/prisma/client';
import { ErroHttp } from '../../lib/erros';
import { prisma } from '../../lib/prisma';
import { hashSenha, verificarSenha } from '../../lib/senha';

export interface UsuarioCriado {
  id: number;
  nome: string;
  email: string;
}

/**
 * Hash fictício (mesmos parâmetros do hash real) para gastar o mesmo tempo quando o e-mail
 * não existe. Se os parâmetros de lib/senha.ts mudarem, gere outro (o teste avisa).
 */
export const HASH_FICTICIO =
  'scrypt$32768$8$3$sdZuD1hI1qYDloEqdcScxA==$yOXJPcASwiRJFy4KjOAiYql2awDqTAfL4X63XfXEseQTj4KFxSYOTlLi6cLoX9DFGBuo1qRhJ2Y8OgGYfdeE+g==';

const credenciaisInvalidas = () => new ErroHttp(401, 'E-mail ou senha incorretos');

const emailJaCadastrado = () => new ErroHttp(409, 'E-mail já cadastrado');

const cidadeInvalida = () => new ErroHttp(400, 'Cidade inválida');

/**
 * Cadastro (RF01). Privacidade: nada daqui (e-mail, nome, senha) é registrado em log,
 * e os erros inesperados do banco são trocados por uma mensagem genérica, porque a
 * mensagem do Prisma pode trazer os dados enviados.
 */
export async function cadastrarUsuario(entrada: CadastroEntrada): Promise<UsuarioCriado> {
  const email = entrada.email.trim().toLowerCase();

  const existente = await prisma.usuario.findUnique({ where: { email }, select: { id: true } });
  if (existente) throw emailJaCadastrado();

  const cidade = await prisma.cidade.findUnique({
    where: { id: entrada.cidadeId },
    select: { id: true },
  });
  if (!cidade) throw cidadeInvalida();

  const senhaHash = await hashSenha(entrada.senha);

  try {
    return await prisma.usuario.create({
      data: {
        nome: entrada.nome,
        email,
        cidadeId: cidade.id,
        senhaHash,
        consentimentoEm: new Date(),
      },
      select: { id: true, nome: true, email: true },
    });
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError) {
      // Corrida: outro cadastro com o mesmo e-mail entrou entre a checagem e o create.
      if (erro.code === 'P2002') throw emailJaCadastrado();
      // Corrida: a cidade foi apagada entre a checagem e o create.
      if (erro.code === 'P2003') throw cidadeInvalida();
    }
    throw new Error('Falha ao salvar o usuário');
  }
}

/**
 * Login (RF02). Confere e-mail e senha e devolve o usuário; quem assina o token é a rota.
 * E-mail inexistente e senha errada dão exatamente a mesma resposta, e o tempo também é parecido:
 * sem usuário, a senha é conferida contra um hash fictício.
 */
export async function autenticarCredenciais(entrada: LoginEntrada): Promise<UsuarioCriado> {
  const email = entrada.email.trim().toLowerCase();

  const usuario = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true, nome: true, email: true, senhaHash: true },
  });

  const senhaConfere = await verificarSenha(entrada.senha, usuario?.senhaHash ?? HASH_FICTICIO);
  if (!usuario || !senhaConfere) throw credenciaisInvalidas();

  return { id: usuario.id, nome: usuario.nome, email: usuario.email };
}

/**
 * Exclusão da conta (LGPD). Confere a senha do usuário já autenticado e apaga o usuário;
 * os tokens de push saem junto (onDelete: Cascade). É idempotente: se o usuário já não
 * existe, termina sem erro. A senha errada é 403, e não 401, para o app não confundir
 * com sessão expirada.
 */
export async function excluirConta(usuarioId: number, senha: string): Promise<void> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { senhaHash: true },
  });
  if (!usuario) return;

  if (!(await verificarSenha(senha, usuario.senhaHash))) {
    throw new ErroHttp(403, 'Senha incorreta');
  }

  try {
    await prisma.usuario.delete({ where: { id: usuarioId } });
  } catch (erro) {
    // P2025: o usuário já foi apagado (outra requisição, por exemplo).
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2025') return;
    throw new Error('Falha ao excluir a conta');
  }
}
