-- AlterTable: o default cobre as linhas que já existem.
ALTER TABLE "push_tokens" ADD COLUMN     "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Para os tokens que já existem, a última atualização é a data em que foram criados
-- (assim a ordem "mais antigo primeiro" continua certa).
UPDATE "push_tokens" SET "atualizado_em" = "criado_em";
