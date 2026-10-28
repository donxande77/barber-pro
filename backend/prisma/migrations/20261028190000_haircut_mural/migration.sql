-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('PENDING', 'PUBLISHED', 'HIDDEN');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "referencePostId" UUID;

-- CreateTable
CREATE TABLE "HaircutPost" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "unitId" UUID,
    "barberId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrls" TEXT[],
    "tags" TEXT[],
    "serviceIds" TEXT[],
    "status" "PostStatus" NOT NULL DEFAULT 'PUBLISHED',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    CONSTRAINT "HaircutPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HaircutPost_companyId_status_idx" ON "HaircutPost"("companyId", "status");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_referencePostId_fkey" FOREIGN KEY ("referencePostId") REFERENCES "HaircutPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HaircutPost" ADD CONSTRAINT "HaircutPost_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HaircutPost" ADD CONSTRAINT "HaircutPost_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HaircutPost" ADD CONSTRAINT "HaircutPost_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mural: de 1 a 4 fotos por publicação
ALTER TABLE "HaircutPost" ADD CONSTRAINT "HaircutPost_images_check"
  CHECK (cardinality("imageUrls") BETWEEN 1 AND 4);
