-- Müşteri KVKK onay token sistemi
ALTER TABLE "Clients" ADD COLUMN "ConsentToken" VARCHAR(255);
ALTER TABLE "Clients" ADD COLUMN "ConsentRequestedAt" TIMESTAMP(3);
ALTER TABLE "Clients" ADD COLUMN "ConsentTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Clients_ConsentToken_key" ON "Clients"("ConsentToken");
