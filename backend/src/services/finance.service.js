import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { audit } from '../utils/audit.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { D, dec, money, sum, toMoneyString } from '../utils/money.js';
import { periodRange } from '../utils/time.js';
import { reversePayment } from './sale.service.js';

const assertUnit = (ctx, unitId) => {
  if (!ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
};

// ── Contas e saldos ──

/** Saldo de cada conta até um instante: saldo inicial + entradas − saídas (estornos inclusos). */
export async function balances(accountIds, asOf = new Date(), db = prisma) {
  if (!accountIds.length) return new Map();
  const rows = await db.$queryRaw`
    SELECT a.id,
           a."openingBalance" + COALESCE(SUM(CASE WHEN t.direction = 'IN' THEN t.amount ELSE -t.amount END), 0) AS balance
    FROM "FinancialAccount" a
    LEFT JOIN "FinancialTransaction" t ON t."accountId" = a.id AND t."occurredAt" <= ${asOf}
    WHERE a.id IN (${Prisma.join(accountIds.map((id) => Prisma.sql`${id}::uuid`))})
    GROUP BY a.id`;
  return new Map(rows.map((r) => [r.id, dec(r.balance)]));
}

export async function listAccounts(ctx, { unitId } = {}) {
  if (unitId) assertUnit(ctx, unitId);
  const accounts = await prisma.financialAccount.findMany({
    where: { unitId: unitId ?? { in: ctx.unitIds } },
    include: { unit: { select: { id: true, name: true } } },
    orderBy: [{ unitId: 'asc' }, { name: 'asc' }],
  });
  const bal = await balances(accounts.map((a) => a.id));
  return accounts.map((a) => ({ ...a, balance: (bal.get(a.id) ?? dec(a.openingBalance)).toFixed(2) }));
}

export async function createAccount(ctx, data) {
  assertUnit(ctx, data.unitId);
  const a = await prisma.financialAccount.create({ data });
  await audit({ ctx, action: 'account.create', entity: 'FinancialAccount', entityId: a.id, unitId: a.unitId, after: a });
  return a;
}

export async function updateAccount(ctx, id, data) {
  const a = await prisma.financialAccount.findFirst({ where: { id, unitId: { in: ctx.unitIds } } });
  if (!a) throw notFound('Conta não encontrada.');
  const updated = await prisma.financialAccount.update({ where: { id }, data });
  await audit({ ctx, action: 'account.update', entity: 'FinancialAccount', entityId: id, unitId: a.unitId, before: a, after: updated });
  return updated;
}

export async function listCategories(ctx) {
  return prisma.financialCategory.findMany({ where: { companyId: ctx.user.companyId }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
}

export async function createCategory(ctx, data) {
  return prisma.financialCategory.create({ data: { ...data, companyId: ctx.user.companyId } });
}

// ── Movimentações ──

const txInclude = {
  account: { select: { name: true } },
  category: { select: { name: true } },
  reversedBy: { select: { id: true } },
  reversalOf: { select: { id: true, kind: true } },
};

export async function listTransactions(ctx, { unitId, accountId, from, to, kind }) {
  if (unitId) assertUnit(ctx, unitId);
  const { start, end } = periodRange(from, to);
  return prisma.financialTransaction.findMany({
    where: {
      unitId: unitId ?? { in: ctx.unitIds },
      occurredAt: { gte: start, lt: end },
      ...(accountId ? { accountId } : {}),
      ...(kind ? { kind } : {}),
    },
    include: txInclude,
    orderBy: { occurredAt: 'desc' },
    take: 1000,
  });
}

async function activeAccount(db, accountId, unitId) {
  const a = await db.financialAccount.findFirst({ where: { id: accountId, unitId, status: 'ACTIVE' } });
  if (!a) throw badRequest('Conta inválida ou inativa para esta unidade.');
  return a;
}

/** Lançamento manual de receita, despesa ou ajuste. */
export async function createTransaction(ctx, { unitId, accountId, direction, kind, amount, categoryId, description, occurredAt }) {
  assertUnit(ctx, unitId);
  await activeAccount(prisma, accountId, unitId);
  if (kind === 'INCOME' && direction !== 'IN') throw badRequest('Receita deve ser entrada.');
  if (kind === 'EXPENSE' && direction !== 'OUT') throw badRequest('Despesa deve ser saída.');
  if (categoryId) {
    const c = await prisma.financialCategory.findFirst({ where: { id: categoryId, companyId: ctx.user.companyId } });
    if (!c) throw badRequest('Categoria inválida.');
  }
  const t = await prisma.financialTransaction.create({
    data: { unitId, accountId, direction, kind, amount, categoryId, description, occurredAt: occurredAt ?? new Date(), createdById: ctx.user.id },
    include: txInclude,
  });
  await audit({ ctx, action: 'finance.transaction', entity: 'FinancialTransaction', entityId: t.id, unitId, after: t });
  return t;
}

/**
 * Estorno auditável: lança uma movimentação inversa ligada à original (reversalOfId é único,
 * então a mesma movimentação não pode ser estornada duas vezes). Nada é apagado.
 */
export async function reverseTransaction(ctx, id, { reason }) {
  const t = await prisma.financialTransaction.findFirst({ where: { id, unitId: { in: ctx.unitIds } }, include: { reversedBy: true } });
  if (!t) throw notFound('Movimentação não encontrada.');
  if (t.kind === 'REVERSAL') throw badRequest('Não é possível estornar um estorno.');
  if (t.reversedBy) throw badRequest('Esta movimentação já foi estornada.');
  if (t.paymentId) {
    await reversePayment(ctx, t.paymentId, { reason });
    return prisma.financialTransaction.findUnique({ where: { id }, include: txInclude });
  }
  if (t.transferId) return reverseTransfer(ctx, t.transferId, { reason });
  if (t.payoutId) throw badRequest('Pagamentos a profissionais são corrigidos com um ajuste no financeiro do profissional.');

  try {
    return await prisma.$transaction(async (tx) => {
      if (t.billId) {
        const bill = await tx.bill.findUnique({ where: { id: t.billId } });
        const paid = D.max(dec(bill.paidAmount).minus(dec(t.amount)), 0);
        await tx.bill.update({ where: { id: bill.id }, data: { paidAmount: toMoneyString(paid), status: paid.eq(0) ? 'OPEN' : 'PARTIAL' } });
      }
      const rev = await tx.financialTransaction.create({
        data: {
          unitId: t.unitId, accountId: t.accountId, direction: t.direction === 'IN' ? 'OUT' : 'IN', kind: 'REVERSAL',
          amount: t.amount, reversalOfId: t.id, billId: t.billId, categoryId: t.categoryId,
          description: `Estorno: ${reason}`, createdById: ctx.user.id,
        },
        include: txInclude,
      });
      await audit({ ctx, action: 'finance.reverse', entity: 'FinancialTransaction', entityId: t.id, unitId: t.unitId, after: { reversalId: rev.id, reason } }, tx);
      return rev;
    });
  } catch (e) {
    if (e?.code === 'P2002') throw badRequest('Esta movimentação já foi estornada.');
    throw e;
  }
}

// ── Contas a pagar e a receber ──

export async function listBills(ctx, { unitId, kind, status, from, to }) {
  if (unitId) assertUnit(ctx, unitId);
  const where = { unitId: unitId ?? { in: ctx.unitIds } };
  if (kind) where.kind = kind;
  if (status) where.status = status;
  if (from) {
    const r = periodRange(from, to ?? from);
    where.dueDate = { gte: r.start, lt: r.end };
  }
  return prisma.bill.findMany({ where, include: { category: { select: { name: true } }, unit: { select: { name: true } } }, orderBy: { dueDate: 'asc' } });
}

export async function createBill(ctx, data) {
  assertUnit(ctx, data.unitId);
  const b = await prisma.bill.create({ data: { ...data, dueDate: new Date(`${data.dueDate}T00:00:00Z`), createdById: ctx.user.id } });
  await audit({ ctx, action: 'bill.create', entity: 'Bill', entityId: b.id, unitId: b.unitId, after: b });
  return b;
}

/** Baixa (parcial ou total) de uma conta, gerando a movimentação na conta financeira. */
export async function payBill(ctx, id, { accountId, amount, occurredAt }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Bill" WHERE id = ${id}::uuid FOR UPDATE`;
    const bill = await tx.bill.findFirst({ where: { id, unitId: { in: ctx.unitIds } } });
    if (!bill) throw notFound('Conta não encontrada.');
    if (['PAID', 'CANCELLED'].includes(bill.status)) throw badRequest('Esta conta já está quitada ou cancelada.');
    await activeAccount(tx, accountId, bill.unitId);
    const open = dec(bill.amount).minus(dec(bill.paidAmount));
    const value = money(amount);
    if (value.gt(open)) throw badRequest(`O valor excede o saldo em aberto (R$ ${open.toFixed(2)}).`);
    const paid = dec(bill.paidAmount).plus(value);
    await tx.bill.update({ where: { id }, data: { paidAmount: toMoneyString(paid), status: paid.gte(dec(bill.amount)) ? 'PAID' : 'PARTIAL' } });
    const isPayable = bill.kind === 'PAYABLE';
    const t = await tx.financialTransaction.create({
      data: {
        unitId: bill.unitId, accountId, billId: id, categoryId: bill.categoryId,
        direction: isPayable ? 'OUT' : 'IN', kind: isPayable ? 'BILL_PAYMENT' : 'BILL_RECEIPT',
        amount: toMoneyString(value), description: bill.description, occurredAt: occurredAt ?? new Date(), createdById: ctx.user.id,
      },
    });
    await audit({ ctx, action: 'bill.pay', entity: 'Bill', entityId: id, unitId: bill.unitId, after: { amount: value.toFixed(2) } }, tx);
    return t;
  });
}

export async function cancelBill(ctx, id) {
  const bill = await prisma.bill.findFirst({ where: { id, unitId: { in: ctx.unitIds } } });
  if (!bill) throw notFound('Conta não encontrada.');
  if (dec(bill.paidAmount).gt(0)) throw badRequest('Conta com baixa registrada: estorne as baixas antes de cancelar.');
  const b = await prisma.bill.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
  await audit({ ctx, action: 'bill.cancel', entity: 'Bill', entityId: id, unitId: bill.unitId });
  return b;
}

// ── Transferências ──

/**
 * Transferência entre contas (da mesma unidade ou entre unidades). Gera um par de movimentações
 * ligadas pelo transferId, que são excluídas de receitas/despesas e do consolidado.
 */
export async function createTransfer(ctx, { fromAccountId, toAccountId, amount, description, occurredAt }) {
  const [from, to] = await Promise.all([
    prisma.financialAccount.findFirst({ where: { id: fromAccountId, status: 'ACTIVE' }, include: { unit: true } }),
    prisma.financialAccount.findFirst({ where: { id: toAccountId, status: 'ACTIVE' }, include: { unit: true } }),
  ]);
  if (!from || !to || from.unit.companyId !== ctx.user.companyId || to.unit.companyId !== ctx.user.companyId) throw badRequest('Conta inválida.');
  assertUnit(ctx, from.unitId);
  assertUnit(ctx, to.unitId);
  if (from.unitId !== to.unitId && ctx.user.role !== 'OWNER') throw forbidden('Transferências entre unidades são feitas pelo proprietário.');
  const when = occurredAt ?? new Date();
  return prisma.$transaction(async (tx) => {
    const tr = await tx.transfer.create({
      data: { fromUnitId: from.unitId, toUnitId: to.unitId, fromAccountId, toAccountId, amount, description, occurredAt: when, createdById: ctx.user.id },
    });
    const base = { amount, transferId: tr.id, occurredAt: when, createdById: ctx.user.id };
    await tx.financialTransaction.create({ data: { ...base, unitId: from.unitId, accountId: fromAccountId, direction: 'OUT', kind: 'TRANSFER_OUT', description: `Transferência para ${to.unit.name} / ${to.name}` } });
    await tx.financialTransaction.create({ data: { ...base, unitId: to.unitId, accountId: toAccountId, direction: 'IN', kind: 'TRANSFER_IN', description: `Transferência de ${from.unit.name} / ${from.name}` } });
    await audit({ ctx, action: 'transfer.create', entity: 'Transfer', entityId: tr.id, unitId: from.unitId, after: tr }, tx);
    return tr;
  });
}

export async function reverseTransfer(ctx, transferId, { reason }) {
  const tr = await prisma.transfer.findFirst({
    where: { id: transferId, fromUnitId: { in: ctx.unitIds }, toUnitId: { in: ctx.unitIds } },
    include: { transactions: { include: { reversedBy: true } } },
  });
  if (!tr) throw notFound('Transferência não encontrada.');
  const originals = tr.transactions.filter((t) => t.kind !== 'REVERSAL');
  if (originals.some((t) => t.reversedBy)) throw badRequest('Transferência já estornada.');
  try {
    return await prisma.$transaction(async (tx) => {
      for (const t of originals) {
        await tx.financialTransaction.create({
          data: {
            unitId: t.unitId, accountId: t.accountId, direction: t.direction === 'IN' ? 'OUT' : 'IN', kind: 'REVERSAL',
            amount: t.amount, transferId, reversalOfId: t.id, description: `Estorno de transferência: ${reason}`, createdById: ctx.user.id,
          },
        });
      }
      await audit({ ctx, action: 'transfer.reverse', entity: 'Transfer', entityId: transferId, unitId: tr.fromUnitId, after: { reason } }, tx);
      return tr;
    });
  } catch (e) {
    if (e?.code === 'P2002') throw badRequest('Transferência já estornada.');
    throw e;
  }
}

export async function listTransfers(ctx, { from, to }) {
  const { start, end } = periodRange(from, to);
  return prisma.transfer.findMany({
    where: { occurredAt: { gte: start, lt: end }, OR: [{ fromUnitId: { in: ctx.unitIds } }, { toUnitId: { in: ctx.unitIds } }] },
    include: {
      fromUnit: { select: { name: true } }, toUnit: { select: { name: true } },
      fromAccount: { select: { name: true } }, toAccount: { select: { name: true } },
      transactions: { where: { kind: 'REVERSAL' }, select: { id: true } },
    },
    orderBy: { occurredAt: 'desc' },
  });
}

// ── Fechamento de caixa e conciliação ──

/**
 * Fecha o caixa de uma conta: compara o saldo calculado com o valor contado.
 * A diferença fica registrada; se pedido, é lançado um ajuste para conciliar.
 */
export async function closeCash(ctx, { accountId, countedBalance, notes, createAdjustment }) {
  const account = await prisma.financialAccount.findFirst({ where: { id: accountId, unitId: { in: ctx.unitIds } } });
  if (!account) throw notFound('Conta não encontrada.');
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "FinancialAccount" WHERE id = ${accountId}::uuid FOR UPDATE`;
    const last = await tx.cashClosing.findFirst({ where: { accountId }, orderBy: { periodEnd: 'desc' } });
    const periodStart = last?.periodEnd ?? account.createdAt;
    const periodEnd = new Date();
    if (periodEnd <= periodStart) throw badRequest('Já existe um fechamento para este instante.');
    const expected = (await balances([accountId], periodEnd, tx)).get(accountId);
    const counted = money(countedBalance);
    const difference = counted.minus(expected);
    const closing = await tx.cashClosing.create({
      data: {
        unitId: account.unitId, accountId, periodStart, periodEnd,
        expectedBalance: toMoneyString(expected), countedBalance: toMoneyString(counted), difference: toMoneyString(difference),
        notes, closedById: ctx.user.id,
      },
    });
    await tx.financialTransaction.updateMany({
      where: { accountId, occurredAt: { gt: periodStart, lte: periodEnd }, cashClosingId: null },
      data: { cashClosingId: closing.id },
    });
    if (createAdjustment && !difference.eq(0)) {
      await tx.financialTransaction.create({
        data: {
          unitId: account.unitId, accountId, direction: difference.gt(0) ? 'IN' : 'OUT', kind: 'ADJUSTMENT',
          amount: toMoneyString(difference.abs()), description: `Ajuste de conciliação do fechamento`, occurredAt: new Date(periodEnd.getTime() + 1),
          createdById: ctx.user.id,
        },
      });
    }
    await audit({ ctx, action: 'cash.close', entity: 'CashClosing', entityId: closing.id, unitId: account.unitId, after: closing }, tx);
    return closing;
  });
}

export async function listClosings(ctx, { accountId, unitId }) {
  if (unitId) assertUnit(ctx, unitId);
  return prisma.cashClosing.findMany({
    where: { unitId: unitId ?? { in: ctx.unitIds }, ...(accountId ? { accountId } : {}) },
    include: { account: { select: { name: true } }, unit: { select: { name: true } } },
    orderBy: { closedAt: 'desc' },
    take: 200,
  });
}

// ── Resumos (unidade e consolidado) ──

/**
 * Soma as movimentações por natureza, tratando estornos como redução da natureza original.
 * Transferências (com transferId) ficam de fora: dinheiro que só mudou de lugar não é receita nem despesa.
 */
async function netByKind(unitIds, start, end, filters = {}) {
  if (!unitIds.length) return {};
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(o.kind, t.kind)::text AS kind,
           SUM(CASE WHEN t.direction = 'IN' THEN t.amount ELSE -t.amount END) AS net
    FROM "FinancialTransaction" t
    LEFT JOIN "FinancialTransaction" o ON o.id = t."reversalOfId"
    LEFT JOIN "Payment" p ON p.id = COALESCE(t."paymentId", o."paymentId")
    WHERE t."unitId" IN (${Prisma.join(unitIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND t."occurredAt" >= ${start} AND t."occurredAt" < ${end}
      AND t."transferId" IS NULL
      ${filters.method ? Prisma.sql`AND (p.method IS NULL OR p.method::text = ${filters.method})` : Prisma.empty}
    GROUP BY 1`;
  return Object.fromEntries(rows.map((r) => [r.kind, dec(r.net)]));
}

export async function unitSummary(unitIds, { start, end }, filters = {}) {
  const net = await netByKind(unitIds, start, end, filters);
  const n = (k) => net[k] ?? new D(0);
  const ids = Prisma.join(unitIds.map((id) => Prisma.sql`${id}::uuid`));
  const [sales] = unitIds.length
    ? await prisma.$queryRaw`
        SELECT COALESCE(SUM(s.total), 0) AS revenue, COUNT(*)::int AS count
        FROM "Sale" s WHERE s.status = 'CLOSED' AND s."unitId" IN (${ids}) AND s."closedAt" >= ${start} AND s."closedAt" < ${end}`
    : [{ revenue: 0, count: 0 }];
  const [costs] = unitIds.length
    ? await prisma.$queryRaw`
        SELECT COALESCE(SUM(i."unitCost" * i.quantity), 0) AS cogs, COALESCE(SUM(i."commissionAmount"), 0) AS commissions
        FROM "SaleItem" i JOIN "Sale" s ON s.id = i."saleId"
        WHERE s.status = 'CLOSED' AND s."unitId" IN (${ids}) AND s."closedAt" >= ${start} AND s."closedAt" < ${end}`
    : [{ cogs: 0, commissions: 0 }];
  const pendingObligations = unitIds.length
    ? await prisma.barberObligation.findMany({
        where: { unitId: { in: unitIds }, status: { in: ['OPEN', 'PARTIAL'] }, direction: 'PAYABLE_TO_BARBER' },
        select: { amount: true, settledAmount: true },
      })
    : [];
  const openBills = unitIds.length
    ? await prisma.bill.findMany({ where: { unitId: { in: unitIds }, status: { in: ['OPEN', 'PARTIAL'] } }, select: { kind: true, amount: true, paidAmount: true } })
    : [];
  const open = (list) => sum(list.map((b) => dec(b.amount).minus(dec(b.paidAmount ?? b.settledAmount))));

  const receipts = n('SALE_PAYMENT');
  const otherIncome = n('INCOME').plus(n('BILL_RECEIPT')).plus(n('CHAIR_RENT_RECEIPT'));
  const expenses = n('EXPENSE').plus(n('BILL_PAYMENT')).plus(n('BARBER_PAYOUT')).negated();
  const adjustments = n('ADJUSTMENT');
  const s = (v) => money(v).toFixed(2);
  return {
    revenue: s(dec(sales.revenue)), // faturamento: vendas fechadas (competência)
    salesCount: Number(sales.count),
    receipts: s(receipts), // recebimentos de vendas (caixa)
    otherIncome: s(otherIncome),
    expenses: s(expenses),
    payouts: s(n('BARBER_PAYOUT').negated()),
    adjustments: s(adjustments),
    operatingResult: s(receipts.plus(otherIncome).minus(expenses)), // resultado operacional de caixa
    cogs: s(dec(costs.cogs)),
    commissionsAccrued: s(dec(costs.commissions)),
    pendingToBarbers: s(open(pendingObligations)),
    payablesOpen: s(open(openBills.filter((b) => b.kind === 'PAYABLE'))),
    receivablesOpen: s(open(openBills.filter((b) => b.kind === 'RECEIVABLE'))),
  };
}

export async function financeSummary(ctx, { unitId, from, to, method }) {
  if (unitId) assertUnit(ctx, unitId);
  const range = periodRange(from, to);
  const unitIds = unitId ? [unitId] : ctx.unitIds;
  const accounts = await listAccounts(ctx, unitId ? { unitId } : {});
  return {
    period: { from, to },
    summary: await unitSummary(unitIds, range, { method }),
    available: sum(accounts.filter((a) => a.status === 'ACTIVE').map((a) => a.balance)).toFixed(2),
    accounts,
  };
}

/**
 * Consolidado da empresa: soma das unidades + comparativo. Transferências internas são
 * listadas à parte e não entram em receitas/despesas (não há dupla contagem).
 */
export async function consolidated(ctx, { from, to, method }) {
  const range = periodRange(from, to);
  const units = await prisma.unit.findMany({ where: { companyId: ctx.user.companyId, id: { in: ctx.unitIds } }, orderBy: { name: 'asc' } });
  const perUnit = [];
  for (const u of units) perUnit.push({ unit: { id: u.id, name: u.name }, ...(await unitSummary([u.id], range, { method })) });
  const total = await unitSummary(units.map((u) => u.id), range, { method });
  const transfers = await prisma.transfer.findMany({
    where: { occurredAt: { gte: range.start, lt: range.end }, fromUnitId: { in: ctx.unitIds } },
    include: { fromUnit: { select: { name: true } }, toUnit: { select: { name: true } }, transactions: { where: { kind: 'REVERSAL' }, select: { id: true } } },
    orderBy: { occurredAt: 'asc' },
  });
  const accounts = await listAccounts(ctx);
  return {
    period: { from, to },
    total,
    perUnit,
    internalTransfers: {
      count: transfers.length,
      amount: sum(transfers.filter((t) => !t.transactions.length).map((t) => t.amount)).toFixed(2),
      items: transfers.map((t) => ({ id: t.id, occurredAt: t.occurredAt, from: t.fromUnit.name, to: t.toUnit.name, amount: t.amount, reversed: t.transactions.length > 0, description: t.description })),
    },
    accounts,
    available: sum(accounts.filter((a) => a.status === 'ACTIVE').map((a) => a.balance)).toFixed(2),
  };
}

/** Fluxo de caixa diário (entradas e saídas sem transferências). */
export async function cashFlow(unitIds, { start, end }, tz = 'America/Sao_Paulo') {
  if (!unitIds.length) return [];
  const rows = await prisma.$queryRaw`
    SELECT to_char(t."occurredAt" AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
           SUM(CASE WHEN t.direction = 'IN' THEN t.amount ELSE 0 END) AS "in",
           SUM(CASE WHEN t.direction = 'OUT' THEN t.amount ELSE 0 END) AS "out"
    FROM "FinancialTransaction" t
    WHERE t."unitId" IN (${Prisma.join(unitIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND t."occurredAt" >= ${start} AND t."occurredAt" < ${end} AND t."transferId" IS NULL
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({ day: r.day, in: dec(r.in).toFixed(2), out: dec(r.out).toFixed(2), net: dec(r.in).minus(dec(r.out)).toFixed(2) }));
}
