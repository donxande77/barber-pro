-- Restrições de integridade que o Prisma não expressa no schema.
-- Esta migração é escrita à mão e deve ser mantida junto com o schema.prisma.

-- ── Agenda: impede dois agendamentos ativos sobrepostos para o mesmo barbeiro ──
-- Garantido pelo banco mesmo com requisições simultâneas (nenhuma corrida no backend escapa disto).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_time_check" CHECK ("endsAt" > "startsAt");

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_barber_no_overlap"
  EXCLUDE USING gist (
    "barberId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE ("status" NOT IN ('CANCELLED', 'NO_SHOW'));

ALTER TABLE "BarberTimeOff"
  ADD CONSTRAINT "BarberTimeOff_time_check" CHECK ("endsAt" > "startsAt");

-- ── Horários recorrentes (minutos desde 00:00) ──
ALTER TABLE "UnitHours"
  ADD CONSTRAINT "UnitHours_range_check"
  CHECK ("weekday" BETWEEN 0 AND 6 AND "openMin" >= 0 AND "closeMin" <= 1440 AND "closeMin" > "openMin");

ALTER TABLE "BarberSchedule"
  ADD CONSTRAINT "BarberSchedule_range_check"
  CHECK (
    "weekday" BETWEEN 0 AND 6 AND "startMin" >= 0 AND "endMin" <= 1440 AND "endMin" > "startMin"
    AND (("breakStartMin" IS NULL AND "breakEndMin" IS NULL)
      OR ("breakStartMin" >= "startMin" AND "breakEndMin" <= "endMin" AND "breakEndMin" > "breakStartMin"))
  );

-- ── Valores monetários ──
ALTER TABLE "ServiceUnit" ADD CONSTRAINT "ServiceUnit_values_check"
  CHECK ("price" >= 0 AND "durationMin" > 0 AND ("promoPrice" IS NULL OR "promoPrice" >= 0));
ALTER TABLE "Product" ADD CONSTRAINT "Product_values_check" CHECK ("price" >= 0 AND "cost" >= 0);
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_qty_check" CHECK ("quantity" >= 0 AND "minQuantity" >= 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_qty_check" CHECK ("quantity" > 0);

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_values_check"
  CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "total" >= 0 AND "discount" <= "subtotal");
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_values_check"
  CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "discount" >= 0 AND "total" >= 0
    AND (("kind" = 'SERVICE' AND "serviceId" IS NOT NULL AND "productId" IS NULL)
      OR ("kind" = 'PRODUCT' AND "productId" IS NOT NULL AND "serviceId" IS NULL)));

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check" CHECK ("amount" > 0);
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_amount_check" CHECK ("amount" > 0);
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_values_check"
  CHECK ("amount" > 0 AND "fromAccountId" <> "toAccountId");
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_values_check"
  CHECK ("amount" > 0 AND "paidAmount" >= 0 AND "paidAmount" <= "amount");

ALTER TABLE "BarberObligation" ADD CONSTRAINT "BarberObligation_values_check"
  CHECK ("amount" >= 0 AND "settledAmount" >= 0 AND "settledAmount" <= "amount");
ALTER TABLE "BarberPayout" ADD CONSTRAINT "BarberPayout_amount_check" CHECK ("amount" > 0);
ALTER TABLE "BarberPayoutAllocation" ADD CONSTRAINT "BarberPayoutAllocation_amount_check" CHECK ("amount" > 0);

-- Uma comissão por item de venda (evita comissão duplicada)
CREATE UNIQUE INDEX "BarberObligation_commission_per_item"
  ON "BarberObligation" ("saleItemId") WHERE ("type" = 'COMMISSION' AND "cancelledAt" IS NULL);

-- ── Regras de remuneração ──
ALTER TABLE "CompensationRule" ADD CONSTRAINT "CompensationRule_values_check"
  CHECK (
    ("validTo" IS NULL OR "validTo" > "validFrom")
    AND (
      ("type" IN ('SERVICE_COMMISSION_PCT', 'PRODUCT_COMMISSION_PCT')
        AND "percent" IS NOT NULL AND "percent" >= 0 AND "percent" <= 100 AND "amount" IS NULL)
      OR ("type" IN ('FIXED_SALARY', 'CHAIR_RENTAL')
        AND "amount" IS NOT NULL AND "amount" >= 0 AND "percent" IS NULL AND "period" IS NOT NULL)
    )
  );

-- ── Avaliações ──
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5);

-- ── Personalização: no máximo uma versão publicada por empresa ──
CREATE UNIQUE INDEX "SiteConfigVersion_one_published"
  ON "SiteConfigVersion" ("companyId") WHERE ("status" = 'PUBLISHED');

-- ── Fechamento de caixa ──
ALTER TABLE "CashClosing" ADD CONSTRAINT "CashClosing_period_check" CHECK ("periodEnd" > "periodStart");
