-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "manageToken" TEXT,
ADD COLUMN     "reviewToken" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "commissionPct" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "commissionPct" DECIMAL(5,2);

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_manageToken_key" ON "Appointment"("manageToken");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_reviewToken_key" ON "Appointment"("reviewToken");

-- Comissão padrão entre 0 e 100
ALTER TABLE "Product" ADD CONSTRAINT "Product_commission_check" CHECK ("commissionPct" IS NULL OR ("commissionPct" >= 0 AND "commissionPct" <= 100));
ALTER TABLE "Service" ADD CONSTRAINT "Service_commission_check" CHECK ("commissionPct" IS NULL OR ("commissionPct" >= 0 AND "commissionPct" <= 100));
