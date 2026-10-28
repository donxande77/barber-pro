-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'RECEPTIONIST', 'BARBER');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BarberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "CompensationModel" AS ENUM ('COMMISSION', 'FIXED', 'FIXED_PLUS_COMMISSION', 'CHAIR_RENTAL', 'CHAIR_RENTAL_PLUS_COMMISSION');

-- CreateEnum
CREATE TYPE "CompensationRuleType" AS ENUM ('SERVICE_COMMISSION_PCT', 'PRODUCT_COMMISSION_PCT', 'FIXED_SALARY', 'CHAIR_RENTAL');

-- CreateEnum
CREATE TYPE "RulePeriod" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleItemKind" AS ENUM ('SERVICE', 'PRODUCT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CONFIRMED', 'REVERSED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT', 'SALE', 'SALE_REVERSAL', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateEnum
CREATE TYPE "ObligationType" AS ENUM ('COMMISSION', 'FIXED_SALARY', 'CHAIR_RENTAL', 'BONUS', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ObligationDirection" AS ENUM ('PAYABLE_TO_BARBER', 'RECEIVABLE_FROM_BARBER');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('OPEN', 'PARTIAL', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'DIGITAL_WALLET', 'CARD_RECEIVABLE');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "BillKind" AS ENUM ('PAYABLE', 'RECEIVABLE');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TxDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "TxKind" AS ENUM ('OPENING_BALANCE', 'SALE_PAYMENT', 'INCOME', 'EXPENSE', 'BILL_PAYMENT', 'BILL_RECEIPT', 'BARBER_PAYOUT', 'CHAIR_RENT_RECEIPT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "SiteConfigStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "document" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "street" TEXT,
    "number" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "instagramUrl" TEXT,
    "cancellationPolicy" TEXT,
    "minCancelHours" INTEGER NOT NULL DEFAULT 2,
    "slotStepMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitHours" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "openMin" INTEGER NOT NULL,
    "closeMin" INTEGER NOT NULL,
    CONSTRAINT "UnitHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserUnitAccess" (
    "userId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    CONSTRAINT "UserUnitAccess_pkey" PRIMARY KEY ("userId","unitId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "birthDate" DATE,
    "notes" TEXT,
    "consentAt" TIMESTAMPTZ(3),
    "anonymizedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Barber" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID,
    "name" TEXT NOT NULL,
    "photoUrl" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "bio" TEXT,
    "specialties" TEXT[],
    "status" "BarberStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Barber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarberUnit" (
    "id" UUID NOT NULL,
    "barberId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "compensationModel" "CompensationModel" NOT NULL DEFAULT 'COMMISSION',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" DATE,
    CONSTRAINT "BarberUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarberSchedule" (
    "id" UUID NOT NULL,
    "barberUnitId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "breakStartMin" INTEGER,
    "breakEndMin" INTEGER,
    CONSTRAINT "BarberSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarberTimeOff" (
    "id" UUID NOT NULL,
    "barberId" UUID NOT NULL,
    "unitId" UUID,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    CONSTRAINT "BarberTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "categoryId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "isCombo" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceUnit" (
    "id" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "promoPrice" DECIMAL(12,2),
    "promoStart" TIMESTAMPTZ(3),
    "promoEnd" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ServiceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarberService" (
    "barberId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    CONSTRAINT "BarberService_pkey" PRIMARY KEY ("barberId","serviceId")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "sku" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductStock" (
    "productId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProductStock_pkey" PRIMARY KEY ("productId","unitId")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2),
    "reason" TEXT,
    "saleItemId" UUID,
    "transferRef" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationRule" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "barberId" UUID NOT NULL,
    "unitId" UUID,
    "serviceId" UUID,
    "productId" UUID,
    "type" "CompensationRuleType" NOT NULL,
    "percent" DECIMAL(5,2),
    "amount" DECIMAL(12,2),
    "period" "RulePeriod",
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "validTo" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompensationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "barberId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "source" "AppointmentSource" NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "totalDuration" INTEGER NOT NULL,
    "notes" TEXT,
    "createdById" UUID,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentItem" (
    "id" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "serviceName" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "durationMin" INTEGER NOT NULL,
    CONSTRAINT "AppointmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "clientId" UUID,
    "appointmentId" UUID,
    "status" "SaleStatus" NOT NULL DEFAULT 'OPEN',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "kind" "SaleItemKind" NOT NULL,
    "serviceId" UUID,
    "productId" UUID,
    "barberId" UUID,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "unitCost" DECIMAL(12,2),
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "commissionRuleId" UUID,
    "commissionPct" DECIMAL(5,2),
    "commissionAmount" DECIMAL(12,2),
    "ruleSnapshot" JSONB,
    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "paidAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMPTZ(3),
    "reversalReason" TEXT,
    "idempotencyKey" TEXT,
    "createdById" UUID,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarberObligation" (
    "id" UUID NOT NULL,
    "barberId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "type" "ObligationType" NOT NULL,
    "direction" "ObligationDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "settledAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "ObligationStatus" NOT NULL DEFAULT 'OPEN',
    "referenceStart" DATE,
    "referenceEnd" DATE,
    "saleItemId" UUID,
    "ruleId" UUID,
    "ruleSnapshot" JSONB,
    "description" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMPTZ(3),
    CONSTRAINT "BarberObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarberPayout" (
    "id" UUID NOT NULL,
    "barberId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "direction" "ObligationDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" UUID,
    CONSTRAINT "BarberPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarberPayoutAllocation" (
    "payoutId" UUID NOT NULL,
    "obligationId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "BarberPayoutAllocation_pkey" PRIMARY KEY ("payoutId","obligationId")
);

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "openingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "openingDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialCategory" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "kind" "BillKind" NOT NULL,
    "categoryId" UUID,
    "description" TEXT NOT NULL,
    "counterparty" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dueDate" DATE NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMPTZ(3),
    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "direction" "TxDirection" NOT NULL,
    "kind" "TxKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "categoryId" UUID,
    "paymentId" UUID,
    "billId" UUID,
    "payoutId" UUID,
    "transferId" UUID,
    "reversalOfId" UUID,
    "cashClosingId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" UUID NOT NULL,
    "fromUnitId" UUID NOT NULL,
    "toUnitId" UUID NOT NULL,
    "fromAccountId" UUID NOT NULL,
    "toAccountId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashClosing" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "expectedBalance" DECIMAL(12,2) NOT NULL,
    "countedBalance" DECIMAL(12,2) NOT NULL,
    "difference" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "closedById" UUID,
    "closedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashClosing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteConfigVersion" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "SiteConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "data" JSONB NOT NULL,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),
    CONSTRAINT "SiteConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "barberId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moderatedAt" TIMESTAMPTZ(3),
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID,
    "unitId" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Unit_companyId_idx" ON "Unit"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_companyId_slug_key" ON "Unit"("companyId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "UnitHours_unitId_weekday_key" ON "UnitHours"("unitId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Client_companyId_name_idx" ON "Client"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_companyId_phone_key" ON "Client"("companyId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Barber_userId_key" ON "Barber"("userId");

-- CreateIndex
CREATE INDEX "Barber_companyId_idx" ON "Barber"("companyId");

-- CreateIndex
CREATE INDEX "BarberUnit_unitId_idx" ON "BarberUnit"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "BarberUnit_barberId_unitId_key" ON "BarberUnit"("barberId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "BarberSchedule_barberUnitId_weekday_key" ON "BarberSchedule"("barberUnitId", "weekday");

-- CreateIndex
CREATE INDEX "BarberTimeOff_barberId_startsAt_idx" ON "BarberTimeOff"("barberId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_companyId_name_key" ON "ServiceCategory"("companyId", "name");

-- CreateIndex
CREATE INDEX "Service_companyId_idx" ON "Service"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceUnit_serviceId_unitId_key" ON "ServiceUnit"("serviceId", "unitId");

-- CreateIndex
CREATE INDEX "Product_companyId_idx" ON "Product"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_companyId_sku_key" ON "Product"("companyId", "sku");

-- CreateIndex
CREATE INDEX "StockMovement_unitId_productId_createdAt_idx" ON "StockMovement"("unitId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "CompensationRule_barberId_type_validFrom_idx" ON "CompensationRule"("barberId", "type", "validFrom");

-- CreateIndex
CREATE INDEX "Appointment_unitId_startsAt_idx" ON "Appointment"("unitId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_barberId_startsAt_idx" ON "Appointment"("barberId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_appointmentId_key" ON "Sale"("appointmentId");

-- CreateIndex
CREATE INDEX "Sale_unitId_createdAt_idx" ON "Sale"("unitId", "createdAt");

-- CreateIndex
CREATE INDEX "SaleItem_barberId_idx" ON "SaleItem"("barberId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_saleId_idx" ON "Payment"("saleId");

-- CreateIndex
CREATE INDEX "BarberObligation_barberId_unitId_status_idx" ON "BarberObligation"("barberId", "unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_unitId_name_key" ON "FinancialAccount"("unitId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialCategory_companyId_kind_name_key" ON "FinancialCategory"("companyId", "kind", "name");

-- CreateIndex
CREATE INDEX "Bill_unitId_dueDate_idx" ON "Bill"("unitId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_reversalOfId_key" ON "FinancialTransaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_unitId_occurredAt_idx" ON "FinancialTransaction"("unitId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_accountId_occurredAt_idx" ON "FinancialTransaction"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "CashClosing_accountId_periodEnd_idx" ON "CashClosing"("accountId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "SiteConfigVersion_companyId_version_key" ON "SiteConfigVersion"("companyId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Review_appointmentId_key" ON "Review"("appointmentId");

-- CreateIndex
CREATE INDEX "Review_unitId_status_idx" ON "Review"("unitId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHours" ADD CONSTRAINT "UnitHours_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUnitAccess" ADD CONSTRAINT "UserUnitAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUnitAccess" ADD CONSTRAINT "UserUnitAccess_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barber" ADD CONSTRAINT "Barber_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barber" ADD CONSTRAINT "Barber_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarberUnit" ADD CONSTRAINT "BarberUnit_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarberUnit" ADD CONSTRAINT "BarberUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarberSchedule" ADD CONSTRAINT "BarberSchedule_barberUnitId_fkey" FOREIGN KEY ("barberUnitId") REFERENCES "BarberUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarberTimeOff" ADD CONSTRAINT "BarberTimeOff_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarberTimeOff" ADD CONSTRAINT "BarberTimeOff_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceUnit" ADD CONSTRAINT "ServiceUnit_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceUnit" ADD CONSTRAINT "ServiceUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarberService" ADD CONSTRAINT "BarberService_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarberService" ADD CONSTRAINT "BarberService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRule" ADD CONSTRAINT "CompensationRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRule" ADD CONSTRAINT "CompensationRule_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRule" ADD CONSTRAINT "CompensationRule_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRule" ADD CONSTRAINT "CompensationRule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRule" ADD CONSTRAINT "CompensationRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarberObligation" ADD CONSTRAINT "BarberObligation_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarberObligation" ADD CONSTRAINT "BarberObligation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarberObligation" ADD CONSTRAINT "BarberObligation_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarberPayout" ADD CONSTRAINT "BarberPayout_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarberPayout" ADD CONSTRAINT "BarberPayout_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarberPayout" ADD CONSTRAINT "BarberPayout_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarberPayoutAllocation" ADD CONSTRAINT "BarberPayoutAllocation_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "BarberPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarberPayoutAllocation" ADD CONSTRAINT "BarberPayoutAllocation_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "BarberObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialCategory" ADD CONSTRAINT "FinancialCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "BarberPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_cashClosingId_fkey" FOREIGN KEY ("cashClosingId") REFERENCES "CashClosing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromUnitId_fkey" FOREIGN KEY ("fromUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toUnitId_fkey" FOREIGN KEY ("toUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashClosing" ADD CONSTRAINT "CashClosing_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashClosing" ADD CONSTRAINT "CashClosing_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteConfigVersion" ADD CONSTRAINT "SiteConfigVersion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
