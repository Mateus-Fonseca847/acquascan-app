import type { Perfil } from '@acquascan/shared';
import { ErroHttp } from '../../lib/erros';
import { prisma } from '../../lib/prisma';

/** Dados do próprio usuário. Privacidade: nada daqui vai para o log, e a senha nunca é lida. */
export async function buscarPerfil(usuarioId: number): Promise<Perfil> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: {
      id: true,
      nome: true,
      email: true,
      consentimentoEm: true,
      criadoEm: true,
      cidade: { select: { id: true, nome: true, uf: true, latitude: true, longitude: true } },
    },
  });
  // A conta pode ter sido apagada entre a autenticação e esta consulta.
  if (!usuario) throw new ErroHttp(401, 'Faça login para continuar');

  // Campo a campo, de propósito: nada que não esteja aqui chega à resposta.
  const { cidade } = usuario;
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    consentimentoEm: usuario.consentimentoEm.toISOString(),
    criadoEm: usuario.criadoEm.toISOString(),
    cidade: {
      id: cidade.id,
      nome: cidade.nome,
      uf: cidade.uf,
      latitude: cidade.latitude,
      longitude: cidade.longitude,
    },
  };
}
