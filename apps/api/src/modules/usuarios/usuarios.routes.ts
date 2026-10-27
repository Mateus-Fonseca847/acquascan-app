import type { Perfil } from '@aquascan/shared';
import type { FastifyInstance } from 'fastify';
import { autenticarUsuario } from '../../plugins/autenticar-usuario';
import { buscarPerfil } from './usuarios.service';

export async function usuariosRoutes(app: FastifyInstance) {
  /** Perfil de quem está logado (Authorization: Bearer <token>). */
  app.get('/usuarios/me', { preHandler: autenticarUsuario }, async (request): Promise<Perfil> => {
    return buscarPerfil(request.usuario!.id);
  });
}
