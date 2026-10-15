-- CreateTable
CREATE TABLE "cidades" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "cidades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cidades_nome_uf_key" ON "cidades"("nome", "uf");

-- Cidade inicial: todas as estações existentes ficam em Petrópolis.
INSERT INTO "cidades" ("nome", "uf", "latitude", "longitude")
VALUES ('Petrópolis', 'RJ', -22.505, -43.17861);

-- AlterTable: estacoes.cidade_id entra como opcional, é preenchida e só então vira obrigatória.
ALTER TABLE "estacoes" ADD COLUMN "cidade_id" INTEGER;

UPDATE "estacoes"
SET "cidade_id" = (SELECT "id" FROM "cidades" WHERE "nome" = 'Petrópolis' AND "uf" = 'RJ');

ALTER TABLE "estacoes" ALTER COLUMN "cidade_id" SET NOT NULL;

-- AlterTable: o usuário continua sem cidade até o cadastro passar a pedi-la.
ALTER TABLE "usuarios" ADD COLUMN "cidade_id" INTEGER;

-- AddForeignKey
ALTER TABLE "estacoes" ADD CONSTRAINT "estacoes_cidade_id_fkey" FOREIGN KEY ("cidade_id") REFERENCES "cidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_cidade_id_fkey" FOREIGN KEY ("cidade_id") REFERENCES "cidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;
