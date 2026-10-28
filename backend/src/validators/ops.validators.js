import { z } from 'zod';
import { uuid, csvUuids, dateStr, isoDateTime, moneyInput, optionalText, percentInput, positiveMoney } from './common.js';

const phone = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length >= 10 && v.length <= 13, 'Telefone inválido (DDD + número).');

// ── Agenda ──
export const availabilityQuery = z.object({
  unitId: uuid,
  date: dateStr,
  serviceIds: csvUuids.refine((v) => v.length > 0 && v.length <= 6, 'Escolha de 1 a 6 serviços.'),
  barberId: uuid.optional(),
});

export const publicBookingBody = z.object({
  unitId: uuid,
  serviceIds: z.array(uuid).min(1).max(6),
  barberId: uuid.nullable().optional(),
  startsAt: isoDateTime,
  client: z.object({
    name: z.string().trim().min(2, 'Informe seu nome.').max(120),
    phone,
    email: z.email('E-mail inválido.').max(254).optional().nullable().or(z.literal('').transform(() => null)),
  }),
  notes: optionalText(300),
  consent: z.literal(true, { message: 'É preciso aceitar a política de privacidade.' }),
});

export const internalBookingBody = z
  .object({
    unitId: uuid,
    serviceIds: z.array(uuid).min(1).max(6),
    barberId: uuid.nullable().optional(),
    startsAt: isoDateTime,
    clientId: uuid.optional(),
    client: z.object({ name: z.string().trim().min(2).max(120), phone, email: z.email().optional().nullable().or(z.literal('').transform(() => null)) }).optional(),
    notes: optionalText(300),
  })
  .refine((v) => v.clientId || v.client, 'Informe o cliente.');

export const appointmentListQuery = z.object({
  unitId: uuid.optional(),
  from: dateStr,
  to: dateStr.optional(),
  barberId: uuid.optional(),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
});

export const rescheduleBody = z.object({ startsAt: isoDateTime, barberId: uuid.optional() });
export const statusBody = z.object({
  status: z.enum(['CONFIRMED', 'CHECKED_IN', 'NO_SHOW', 'CANCELLED']),
  reason: optionalText(200),
});
export const tokenParams = z.object({ token: z.string().min(20).max(64).regex(/^[A-Za-z0-9_-]+$/) });
export const cancelByClientBody = z.object({ reason: optionalText(200) });
export const reviewBody = z.object({ rating: z.number().int().min(1).max(5), comment: optionalText(1000) });
export const moderateBody = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });

// ── Vendas ──
const itemBody = z.object({
  kind: z.enum(['SERVICE', 'PRODUCT']),
  serviceId: uuid.optional(),
  productId: uuid.optional(),
  barberId: uuid.optional(),
  quantity: z.number().int().min(1).max(999).default(1),
  discount: moneyInput.default('0'),
});
export const saleCreateBody = z.object({
  unitId: uuid,
  clientId: uuid.optional(),
  appointmentId: uuid.optional(),
  items: z.array(itemBody).max(50).default([]),
});
export const saleItemBody = itemBody;
export const saleItemUpdateBody = z.object({ discount: moneyInput.optional(), barberId: uuid.optional(), quantity: z.number().int().min(1).max(999).optional() });
export const saleItemParams = z.object({ id: uuid, itemId: uuid });
export const saleListQuery = z.object({
  unitId: uuid.optional(),
  from: dateStr,
  to: dateStr,
  status: z.enum(['OPEN', 'CLOSED', 'CANCELLED']).optional(),
  barberId: uuid.optional(),
});
export const paymentBody = z.object({
  accountId: uuid,
  method: z.enum(['CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD', 'OTHER']),
  amount: positiveMoney,
  idempotencyKey: z.string().min(8).max(80).optional(),
});
export const reasonBody = z.object({ reason: z.string().trim().min(3, 'Informe o motivo.').max(200) });

// ── Remuneração ──
export const ruleBody = z
  .object({
    barberId: uuid,
    unitId: uuid.nullable().optional(),
    serviceId: uuid.nullable().optional(),
    productId: uuid.nullable().optional(),
    type: z.enum(['SERVICE_COMMISSION_PCT', 'PRODUCT_COMMISSION_PCT', 'FIXED_SALARY', 'CHAIR_RENTAL']),
    percent: percentInput.optional(),
    amount: moneyInput.optional(),
    period: z.enum(['WEEKLY', 'MONTHLY']).optional(),
    validFrom: isoDateTime,
    notes: optionalText(300),
  })
  .refine((r) => (r.type.endsWith('_PCT') ? r.percent != null && r.amount == null : r.amount != null && r.percent == null && r.period), {
    message: 'Comissão exige percentual; fixo e aluguel exigem valor e periodicidade.',
  });
export const ruleListQuery = z.object({ barberId: uuid.optional(), includeEnded: z.coerce.boolean().default(false) });
export const endRuleBody = z.object({ validTo: isoDateTime });
export const periodicBody = z.object({ unitId: uuid, month: z.string().regex(/^\d{4}-\d{2}$/, 'Mês inválido (AAAA-MM).') });
export const manualObligationBody = z.object({
  barberId: uuid,
  unitId: uuid,
  type: z.enum(['BONUS', 'ADJUSTMENT']),
  direction: z.enum(['PAYABLE_TO_BARBER', 'RECEIVABLE_FROM_BARBER']).default('PAYABLE_TO_BARBER'),
  amount: positiveMoney,
  description: z.string().trim().min(3).max(200),
});
export const obligationListQuery = z.object({
  barberId: uuid.optional(), unitId: uuid.optional(),
  status: z.enum(['OPEN', 'PARTIAL', 'SETTLED', 'CANCELLED']).optional(),
  from: dateStr.optional(), to: dateStr.optional(),
});
export const payoutBody = z.object({
  barberId: uuid,
  unitId: uuid,
  accountId: uuid,
  direction: z.enum(['PAYABLE_TO_BARBER', 'RECEIVABLE_FROM_BARBER']).default('PAYABLE_TO_BARBER'),
  amount: positiveMoney,
  obligationIds: z.array(uuid).max(500).optional(),
  notes: optionalText(300),
});
export const statementQuery = z.object({ barberId: uuid.optional(), unitId: uuid.optional(), from: dateStr, to: dateStr });

// ── Financeiro ──
export const accountBody = z.object({
  unitId: uuid,
  name: z.string().trim().min(2).max(60),
  type: z.enum(['CASH', 'BANK', 'DIGITAL_WALLET', 'CARD_RECEIVABLE']),
  openingBalance: moneyInput.default('0'),
});
export const accountUpdateBody = z.object({ name: z.string().trim().min(2).max(60).optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional() });
export const finCategoryBody = z.object({ name: z.string().trim().min(2).max(60), kind: z.enum(['INCOME', 'EXPENSE']) });
export const txBody = z.object({
  unitId: uuid,
  accountId: uuid,
  direction: z.enum(['IN', 'OUT']),
  kind: z.enum(['INCOME', 'EXPENSE', 'ADJUSTMENT']),
  amount: positiveMoney,
  categoryId: uuid.nullable().optional(),
  description: z.string().trim().min(2).max(200),
  occurredAt: isoDateTime.optional(),
});
export const txListQuery = z.object({
  unitId: uuid.optional(), accountId: uuid.optional(), from: dateStr, to: dateStr,
  kind: z.enum(['SALE_PAYMENT', 'INCOME', 'EXPENSE', 'BILL_PAYMENT', 'BILL_RECEIPT', 'BARBER_PAYOUT', 'CHAIR_RENT_RECEIPT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'REVERSAL']).optional(),
});
export const billBody = z.object({
  unitId: uuid,
  kind: z.enum(['PAYABLE', 'RECEIVABLE']),
  categoryId: uuid.nullable().optional(),
  description: z.string().trim().min(2).max(200),
  counterparty: optionalText(120),
  amount: positiveMoney,
  dueDate: dateStr,
});
export const billListQuery = z.object({
  unitId: uuid.optional(), kind: z.enum(['PAYABLE', 'RECEIVABLE']).optional(),
  status: z.enum(['OPEN', 'PARTIAL', 'PAID', 'CANCELLED']).optional(), from: dateStr.optional(), to: dateStr.optional(),
});
export const billPayBody = z.object({ accountId: uuid, amount: positiveMoney, occurredAt: isoDateTime.optional() });
export const transferBody = z
  .object({ fromAccountId: uuid, toAccountId: uuid, amount: positiveMoney, description: optionalText(200), occurredAt: isoDateTime.optional() })
  .refine((v) => v.fromAccountId !== v.toAccountId, 'Escolha contas diferentes.');
export const periodQuery = z.object({
  unitId: uuid.optional(), from: dateStr, to: dateStr,
  method: z.enum(['CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD', 'OTHER']).optional(),
  barberId: uuid.optional(), serviceId: uuid.optional(),
});
export const closingBody = z.object({ accountId: uuid, countedBalance: moneyInput, notes: optionalText(300), createAdjustment: z.boolean().default(false) });
export const closingListQuery = z.object({ accountId: uuid.optional(), unitId: uuid.optional() });

// ── Relatórios ──
const format = z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json');
export const barberReportQuery = statementQuery.extend({ format });
export const unitReportQuery = z.object({ unitId: uuid, from: dateStr, to: dateStr, method: periodQuery.shape.method, format });
export const consolidatedReportQuery = z.object({ from: dateStr, to: dateStr, method: periodQuery.shape.method, format });

export { percentInput };
