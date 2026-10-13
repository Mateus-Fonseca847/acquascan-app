/**
 * Simulador de estação: faz o papel do ESP32 enquanto a estação física não existe.
 * Segue a mesma ideia do potenciômetro no Wokwi: o resto do sistema
 * não percebe a diferença entre leituras simuladas e reais.
 *
 * Uso (na raiz): pnpm simulador
 * Cenários: estavel (nível oscilando), cheia (sobe até transbordar), vazante (desce)
 */
import 'dotenv/config';
import { avaliarLeitura, type LeituraEntrada } from '@acquascan/shared';

const API_URL = process.env['API_URL'] ?? 'http://localhost:3333';
const TOKEN = process.env['ESTACAO_TOKEN'] ?? 'dev-token-estacao-1';
const ALTURA = Number(process.env['ALTURA_INSTALACAO_CM'] ?? 400);
const TRANSBORDAMENTO = Number(process.env['NIVEL_TRANSBORDAMENTO_CM'] ?? 300);
const CENARIO = process.env['CENARIO'] ?? 'cheia';
const INTERVALO_MS = Number(process.env['INTERVALO_S'] ?? 3) * 1000;

/** Nível desejado (fração do transbordamento) no passo n. */
function nivelNoPasso(n: number): number {
  switch (CENARIO) {
    case 'estavel':
      return 0.35 + 0.05 * Math.sin(n / 5);
    case 'vazante':
      return Math.max(0.2, 0.95 - n * 0.02);
    case 'cheia':
    default:
      return Math.min(1.05, 0.3 + n * 0.02);
  }
}

function ruido(): number {
  return (Math.random() - 0.5) * 2; // ±1 cm, como um sensor real
}

async function enviar(n: number) {
  const nivelCm = nivelNoPasso(n) * TRANSBORDAMENTO;
  const corpo: LeituraEntrada = {
    distanciaCm: Math.round((ALTURA - nivelCm + ruido()) * 10) / 10,
    vazaoLpm: Math.round((5 + nivelNoPasso(n) * 10) * 100) / 100,
  };

  const resposta = await fetch(`${API_URL}/leituras`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(corpo),
  });

  const esperado = avaliarLeitura(corpo.distanciaCm, {
    alturaInstalacaoCm: ALTURA,
    nivelTransbordamentoCm: TRANSBORDAMENTO,
    limiteAtencaoPct: 50,
    limiteCriticoPct: 80,
  });

  const status = resposta.ok ? 'ok ' : `ERRO ${resposta.status}`;
  console.info(
    `${status} | distância ${corpo.distanciaCm.toFixed(1)} cm | nível ${esperado.nivelPct.toFixed(1)}% | ${esperado.estado}`,
  );
  if (!resposta.ok) console.error(await resposta.text());
}

console.info(
  `Simulador AcquaScan: cenário "${CENARIO}", a cada ${INTERVALO_MS / 1000} s → ${API_URL}`,
);
console.info('Ctrl+C para parar.\n');

let passo = 0;
setInterval(() => {
  enviar(passo++).catch((erro: Error) => {
    console.error(`Falha ao enviar: ${erro.message}. A API está rodando? (pnpm dev:api)`);
  });
}, INTERVALO_MS);
