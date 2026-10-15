/*
  O cadastro passa a usar a cidade no lugar do CEP.

  Atenção: as colunas cep, latitude e longitude de usuarios são apagadas junto com os dados.
  Os usuários que já existem ficam em Petrópolis, que era a única cidade até aqui.
*/

-- (a) Usuários sem cidade ficam em Petrópolis/RJ.
UPDATE "usuarios"
SET "cidade_id" = (SELECT "id" FROM "cidades" WHERE "nome" = 'Petrópolis' AND "uf" = 'RJ')
WHERE "cidade_id" IS NULL;

-- DropForeignKey (a chave é recriada abaixo; passa de SET NULL para RESTRICT)
ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_cidade_id_fkey";

-- (b) A cidade passa a ser obrigatória.
ALTER TABLE "usuarios" ALTER COLUMN "cidade_id" SET NOT NULL;

-- (c) Minimização de dados (LGPD): o CEP e as coordenadas deixam de ser guardados.
ALTER TABLE "usuarios" DROP COLUMN "cep",
DROP COLUMN "latitude",
DROP COLUMN "longitude";

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_cidade_id_fkey" FOREIGN KEY ("cidade_id") REFERENCES "cidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
