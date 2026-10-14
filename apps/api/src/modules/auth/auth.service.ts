import type { CadastroEntrada, LoginEntrada } from '@acquascan/shared';
import { Prisma } from '../../generated/prisma/client';
import { consultarCep } from '../../lib/cep';
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

/**
 * Cadastro (RF01). Privacidade: nada daqui (e-mail, CEP, nome, coordenadas, senha)
 * é registrado em log, e os erros inesperados do banco são trocados por uma
 * mensagem genérica, porque a mensagem do Prisma pode trazer os dados enviados.
 */
export async function cadastrarUsuario(entrada: CadastroEntrada): Promise<UsuarioCriado> {
  const email = entrada.email.trim().toLowerCase();
  const cep = entrada.cep.replace(/\D/g, '');

  // Antes de qualquer chamada à rede.
  const existente = await prisma.usuario.findUnique({ where: { email }, select: { id: true } });
  if (existente) throw emailJaCadastrado();

  const consulta = await consultarCep(cep);
  if (consulta.status === 'nao_encontrado') throw new ErroHttp(400, 'CEP não encontrado');
  // Com a BrasilAPI fora do ar o cadastro segue, só sem coordenadas.
  const latitude = consulta.status === 'ok' ? consulta.latitude : null;
  const longitude = consulta.status === 'ok' ? consulta.longitude : null;

  const senhaHash = await hashSenha(entrada.senha);

  try {
    return await prisma.usuario.create({
      data: {
        nome: entrada.nome,
        email,
        cep,
        latitude,
        longitude,
        senhaHash,
        consentimentoEm: new Date(),
      },
      select: { id: true, nome: true, email: true },
    });
  } catch (erro) {
    // Corrida: outro cadastro com o mesmo e-mail entrou entre a checagem e o create.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw emailJaCadastrado();
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
