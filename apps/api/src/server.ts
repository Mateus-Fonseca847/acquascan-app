import { construirApp } from './app';
import { env } from './config/env';

const app = construirApp();

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (erro) {
  app.log.error(erro);
  process.exit(1);
}
