-- CreateTable
CREATE TABLE "push_tickets" (
    "id" SERIAL NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "push_token_id" INTEGER NOT NULL,
    "alerta_id" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_tickets_ticket_id_key" ON "push_tickets"("ticket_id");

-- CreateIndex
CREATE INDEX "push_tickets_criado_em_idx" ON "push_tickets"("criado_em");

-- AddForeignKey
ALTER TABLE "push_tickets" ADD CONSTRAINT "push_tickets_push_token_id_fkey" FOREIGN KEY ("push_token_id") REFERENCES "push_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tickets" ADD CONSTRAINT "push_tickets_alerta_id_fkey" FOREIGN KEY ("alerta_id") REFERENCES "alertas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
