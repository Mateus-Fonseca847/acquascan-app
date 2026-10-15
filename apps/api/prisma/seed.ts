/**
 * Dados FICTÍCIOS para desenvolvimento.
 *
 * As coordenadas das estações e os pontos de apoio abaixo NÃO são reais.
 * Antes de qualquer uso público, substituir pela lista oficial da Defesa Civil.
 *
 * Executar: pnpm db:seed (na raiz)
 */
import 'dotenv/config';
import { avaliarLeitura } from '@acquascan/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashToken } from '../src/lib/token';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL']! }),
});

const token1 = process.env['SEED_TOKEN_ESTACAO_1'] ?? 'dev-token-estacao-1';
const token2 = process.env['SEED_TOKEN_ESTACAO_2'] ?? 'dev-token-estacao-2';

async function main() {
  // Limpa na ordem certa por causa das chaves estrangeiras.
  // Cidades NÃO são apagadas: os usuários as referenciam e o seed nunca apaga usuários.
  await prisma.alerta.deleteMany();
  await prisma.leitura.deleteMany();
  await prisma.estacao.deleteMany();
  await prisma.rio.deleteMany();
  await prisma.pontoApoio.deleteMany();

  const petropolis = await prisma.cidade.upsert({
    where: { nome_uf: { nome: 'Petrópolis', uf: 'RJ' } },
    update: { latitude: -22.505, longitude: -43.17861 },
    create: { nome: 'Petrópolis', uf: 'RJ', latitude: -22.505, longitude: -43.17861 },
  });

  const piabanha = await prisma.rio.create({ data: { nome: 'Rio Piabanha' } });
  const quitandinha = await prisma.rio.create({ data: { nome: 'Rio Quitandinha' } });

  const estacao1 = await prisma.estacao.create({
    data: {
      nome: 'Estação de teste 1 (Piabanha)',
      rioId: piabanha.id,
      cidadeId: petropolis.id,
      latitude: -22.5046,
      longitude: -43.1786,
      alturaInstalacaoCm: 400,
      nivelTransbordamentoCm: 300,
      tokenHash: hashToken(token1),
    },
  });

  await prisma.estacao.create({
    data: {
      nome: 'Estação de teste 2 (Quitandinha)',
      rioId: quitandinha.id,
      cidadeId: petropolis.id,
      latitude: -22.5181,
      longitude: -43.1958,
      alturaInstalacaoCm: 350,
      nivelTransbordamentoCm: 250,
      tokenHash: hashToken(token2),
    },
  });

  // 24 h de histórico estável para a estação 1 (uma leitura a cada 15 min)
  const agora = Date.now();
  const leituras = Array.from({ length: 96 }, (_, i) => {
    const distanciaCm = 300 - 20 * Math.sin(i / 10); // nível oscilando entre ~27% e ~40%
    const { nivelCm, nivelPct, estado } = avaliarLeitura(distanciaCm, estacao1);
    return {
      estacaoId: estacao1.id,
      distanciaCm,
      nivelCm,
      nivelPct,
      estado,
      medidoEm: new Date(agora - (96 - i) * 15 * 60_000),
    };
  });
  await prisma.leitura.createMany({ data: leituras });

  await prisma.pontoApoio.createMany({
    data: [
      {
        nome: 'Ponto de apoio de teste A',
        endereco: 'Endereço fictício, Centro',
        capacidade: 120,
        contato: '199',
        latitude: -22.5079,
        longitude: -43.1838,
      },
      {
        nome: 'Ponto de apoio de teste B',
        endereco: 'Endereço fictício, Quitandinha',
        capacidade: 80,
        contato: null,
        latitude: -22.5219,
        longitude: -43.2012,
      },
      {
        nome: 'Ponto de apoio de teste C',
        endereco: 'Endereço fictício, Valparaíso',
        capacidade: 200,
        contato: '199',
        latitude: -22.4993,
        longitude: -43.1672,
      },
    ],
  });

  console.info('Seed concluído: 1 cidade, 2 rios, 2 estações, 96 leituras, 3 pontos de apoio.');
  console.info(`Token da estação 1 (use no simulador): ${token1}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
