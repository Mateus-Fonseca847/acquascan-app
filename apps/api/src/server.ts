import { construirApp } from './app';
import { env } from './config/env';
import { processarAlertasPendentes, processarRecibos } from './modules/push/push.service';

const app = construirApp();

/**
 * Rodada periódica do envio de push: pega os alertas que ficaram pendentes (envio que falhou,
 * ou API reiniciada). Fica aqui e não em construirApp para os testes não criarem timers.
 * O temporizador é limpo quando o servidor fecha (o hook precisa ser registrado antes do listen).
 */
const INTERVALO_PUSH_MS = 30_000;
const INTERVALO_RECIBOS_MS = 300_000;
let temporizadorPush: NodeJS.Timeout | undefined;
let temporizadorRecibos: NodeJS.Timeout | undefined;
app.addHook('onClose', async () => {
  clearInterval(temporizadorPush);
  clearInterval(temporizadorRecibos);
});

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (erro) {
  app.log.error(erro);
  process.exit(1);
}

temporizadorPush = setInterval(() => {
  processarAlertasPendentes().catch(() => {
    console.error('[push] falha ao processar os alertas pendentes');
  });
}, INTERVALO_PUSH_MS);

/** A cada 5 minutos confere os recibos de entrega dos tickets com 15 minutos ou mais. */
temporizadorRecibos = setInterval(() => {
  processarRecibos().catch(() => {
    console.error('[push] falha ao conferir os recibos');
  });
}, INTERVALO_RECIBOS_MS);

console.info(`[push] envio de notificações ${env.PUSH_ENVIO_ATIVO ? 'ligado' : 'desligado'}`);

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sinal, () => {
    app.close().finally(() => process.exit(0));
  });
}
