import type { FastifyRequest } from 'fastify';

/**
 * Como a requisição aparece no log: só método e caminho. O serializador padrão do Fastify
 * também registra host, IP e porta de quem chamou, e a URL com a query string (que pode
 * trazer a localização do usuário). Nada disso deve ir para o log.
 */
export function serializarRequisicao(request: Pick<FastifyRequest, 'method' | 'url'>) {
  return { method: request.method, url: request.url.split('?')[0] };
}
