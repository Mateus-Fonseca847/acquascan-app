CREATE EXTENSION IF NOT EXISTS postgis;
-- CreateEnum
CREATE TYPE "Estado" AS ENUM ('ESTAVEL', 'ATENCAO', 'CRITICO');

-- CreateTable
CREATE TABLE "rios" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "rios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estacoes" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "rio_id" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "altura_instalacao_cm" DOUBLE PRECISION NOT NULL,
    "nivel_transbordamento_cm" DOUBLE PRECISION NOT NULL,
    "limite_atencao_pct" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "limite_critico_pct" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "token_hash" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leituras" (
    "id" SERIAL NOT NULL,
    "estacao_id" INTEGER NOT NULL,
    "distancia_cm" DOUBLE PRECISION NOT NULL,
    "nivel_cm" DOUBLE PRECISION NOT NULL,
    "nivel_pct" DOUBLE PRECISION NOT NULL,
    "vazao_lpm" DOUBLE PRECISION,
    "estado" "Estado" NOT NULL,
    "medido_em" TIMESTAMP(3) NOT NULL,
    "recebido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leituras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas" (
    "id" SERIAL NOT NULL,
    "estacao_id" INTEGER NOT NULL,
    "estado_anterior" "Estado" NOT NULL,
    "estado_novo" "Estado" NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_em" TIMESTAMP(3),

    CONSTRAINT "alertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pontos_apoio" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "capacidade" INTEGER NOT NULL,
    "contato" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pontos_apoio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "cep" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "senha_hash" TEXT NOT NULL,
    "consentimento_em" TIMESTAMP(3) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rios_nome_key" ON "rios"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "estacoes_token_hash_key" ON "estacoes"("token_hash");

-- CreateIndex
CREATE INDEX "leituras_estacao_id_medido_em_idx" ON "leituras"("estacao_id", "medido_em");

-- CreateIndex
CREATE INDEX "alertas_criado_em_idx" ON "alertas"("criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- AddForeignKey
ALTER TABLE "estacoes" ADD CONSTRAINT "estacoes_rio_id_fkey" FOREIGN KEY ("rio_id") REFERENCES "rios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leituras" ADD CONSTRAINT "leituras_estacao_id_fkey" FOREIGN KEY ("estacao_id") REFERENCES "estacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_estacao_id_fkey" FOREIGN KEY ("estacao_id") REFERENCES "estacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
