// Planos mensais (assinaturas): cadastro de planos, assinaturas de clientes, mensalidades
// e cobertura automática dos serviços do plano nos atendimentos.
import { DateTime } from 'luxon';
import { prisma } from '../db/prisma.js';
import { audit } from '../utils/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { dec, money, sum, toMoneyString } from '../utils/money.js';
import { periodRange, todayLocal } from '../utils/time.js';

/** Dias de tolerância após o vencimento: depois disso, a assinatura deixa de cobrir serviços até pagar. */
export const GRACE_DAYS = 5;

// Colunas DATE do Prisma: Date em 00:00 UTC.
const toDbDate = (iso) => new Date(`${iso}T00:00:00.000Z`);
const isoOf = (d) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/** Período n da assinatura: início = startDate + n meses (fim do mês ajustado), fim exclusivo. */
export function periodAt(startIso, n) {
  const base = DateTime.fromISO(startIso, { zone: 'utc' });
  return { start: base.plus({ months: n }).toISODate(), end: base.plus({ months: n + 1 }).toISODate() };
}

/** Índice do período que contém a data (ou -1 se antes do início). */
export function periodIndexOn(startIso, dayIso) {
  if (dayIso < startIso) return -1;
  const a = DateTime.fromISO(startIso, { zone: 'utc' });
  const b = DateTime.fromISO(dayIso, { zone: 'utc' });
  let n = Math.max(0, Math.floor(b.diff(a, 'months').months) - 1);
  while (periodAt(startIso, n + 1).start <= dayIso) n++;
  return n;
}

const planInclude = {
  items: { include: { service: { select: { id: true, name: true } } }, orderBy: { service: { name: 'asc' } } },
  unit: { select: { id: true, name: true } },
};

function serializePlan(p) {
  return {
    ...p,
    items: p.items.map((i) => ({ id: i.id, serviceId: i.serviceId, serviceName: i.service?.name, quantity: i.quantity })),
  };
}

async function assertServices(db, companyId, items) {
  const ids = [...new Set(items.map((i) => i.serviceId))];
  if (ids.length !== items.length) throw badRequest('Cada serviço só pode aparecer uma vez no plano.');
  const found = await db.service.count({ where: { id: { in: ids }, companyId } });
  if (found !== ids.length) throw badRequest('Serviço inválido no plano.');
}

async function assertUnitOfCompany(db, companyId, unitId) {
  if (!unitId) return;
  const u = await db.unit.findFirst({ where: { id: unitId, companyId } });
  if (!u) throw badRequest('Unidade inválida.');
}

// ── Planos ──

export async function listPlans(ctx, { status } = {}) {
  const plans = await prisma.plan.findMany({
    where: { companyId: ctx.user.companyId, ...(status ? { status } : {}) },
    include: { ...planInclude, _count: { select: { subscriptions: { where: { status: { in: ['ACTIVE', 'PAUSED'] } } } } } },
    orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
  });
  return plans.map((p) => ({ ...serializePlan(p), activeSubscribers: p._count.subscriptions, _count: undefined }));
}

export async function createPlan(ctx, { items, ...data }) {
  const companyId = ctx.user.companyId;
  await assertServices(prisma, companyId, items);
  await assertUnitOfCompany(prisma, companyId, data.unitId);
  const plan = await prisma.plan.create({
    data: {
      ...data,
      price: toMoneyString(money(data.price)),
      companyId,
      items: { create: items.map((i) => ({ serviceId: i.serviceId, quantity: i.quantity ?? null })) },
    },
    include: planInclude,
  });
  await audit({ ctx, action: 'plan.create', entity: 'Plan', entityId: plan.id, after: { name: plan.name, price: plan.price } });
  return serializePlan(plan);
}

/** Alterar o plano não muda assinaturas já contratadas (elas guardam uma cópia). */
export async function updatePlan(ctx, id, { items, ...data }) {
  const companyId = ctx.user.companyId;
  const before = await prisma.plan.findFirst({ where: { id, companyId }, include: planInclude });
  if (!before) throw notFound('Plano não encontrado.');
  if (items) await assertServices(prisma, companyId, items);
  if (data.unitId) await assertUnitOfCompany(prisma, companyId, data.unitId);
  const plan = await prisma.$transaction(async (tx) => {
    if (items) {
      await tx.planItem.deleteMany({ where: { planId: id } });
      await tx.planItem.createMany({ data: items.map((i) => ({ planId: id, serviceId: i.serviceId, quantity: i.quantity ?? null })) });
    }
    return tx.plan.update({
      where: { id },
      data: { ...data, ...(data.price !== undefined ? { price: toMoneyString(money(data.price)) } : {}) },
      include: planInclude,
    });
  });
  await audit({ ctx, action: 'plan.update', entity: 'Plan', entityId: id, before: serializePlan(before), after: serializePlan(plan) });
  return serializePlan(plan);
}

/** Planos ativos para o site público (sem dados internos). */
export async function publicPlans(companyId, unitId) {
  const plans = await prisma.plan.findMany({
    where: { companyId, status: 'ACTIVE', ...(unitId ? { OR: [{ unitId: null }, { unitId }] } : {}) },
    include: planInclude,
    orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
  });
  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    highlight: p.highlight,
    unit: p.unit,
    items: p.items.map((i) => ({ serviceName: i.service.name, quantity: i.quantity })),
  }));
}

// ── Assinaturas ──

const subInclude = {
  client: { select: { id: true, name: true, phone: true } },
  unit: { select: { id: true, name: true, timezone: true } },
  plan: { select: { id: true, name: true } },
  charges: { orderBy: { periodStart: 'desc' }, take: 6 },
};

async function loadSubscription(ctx, id, db = prisma) {
  const s = await db.subscription.findFirst({ where: { id, companyId: ctx.user.companyId, unitId: { in: ctx.unitIds } }, include: subInclude });
  if (!s) throw notFound('Assinatura não encontrada.');
  return s;
}

/** Uso do período atual e situação de pagamento. */
async function describe(sub, db = prisma) {
  const today = todayLocal(sub.unit.timezone);
  const startIso = isoOf(sub.startDate);
  const n = periodIndexOn(startIso, today);
  const period = n >= 0 ? periodAt(startIso, n) : periodAt(startIso, 0);
  const tz = sub.unit.timezone;
  const used = await db.saleItem.groupBy({
    by: ['serviceId'],
    where: {
      subscriptionId: sub.id,
      sale: {
        status: { not: 'CANCELLED' },
        createdAt: {
          gte: DateTime.fromISO(period.start, { zone: tz }).toUTC().toJSDate(),
          lt: DateTime.fromISO(period.end, { zone: tz }).toUTC().toJSDate(),
        },
      },
    },
    _sum: { quantity: true },
  });
  const usedBy = Object.fromEntries(used.map((u) => [u.serviceId, u._sum.quantity ?? 0]));
  const overdue = sub.charges.filter((c) => c.status === 'OPEN' && isoOf(c.dueDate) < today);
  const blocked = overdue.some((c) => DateTime.fromISO(isoOf(c.dueDate)).plus({ days: GRACE_DAYS }).toISODate() < today);
  return {
    ...sub,
    period,
    usage: sub.planSnapshot.items.map((i) => ({ ...i, used: usedBy[i.serviceId] ?? 0 })),
    paymentStatus: blocked ? 'BLOCKED' : overdue.length ? 'OVERDUE' : 'OK',
    openAmount: sum(sub.charges.filter((c) => c.status === 'OPEN').map((c) => c.amount)).toFixed(2),
  };
}

export async function listSubscriptions(ctx, { status, unitId, clientId, search } = {}) {
  if (unitId && !ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
  const subs = await prisma.subscription.findMany({
    where: {
      companyId: ctx.user.companyId,
      unitId: unitId ?? { in: ctx.unitIds },
      ...(status ? { status } : {}),
      ...(clientId ? { clientId } : {}),
      ...(search
        ? { client: { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search.replace(/\D/g, '') || search } }] } }
        : {}),
    },
    include: subInclude,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 500,
  });
  const out = [];
  for (const s of subs) out.push(await describe(s));
  return out;
}

export const getSubscription = async (ctx, id) => describe(await loadSubscription(ctx, id));

async function ensureCharge(tx, sub, n) {
  const { start, end } = periodAt(isoOf(sub.startDate), n);
  const existing = await tx.subscriptionCharge.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: sub.id, periodStart: toDbDate(start) } } });
  if (existing) return { charge: existing, created: false };
  const charge = await tx.subscriptionCharge.create({
    data: { subscriptionId: sub.id, unitId: sub.unitId, periodStart: toDbDate(start), periodEnd: toDbDate(end), dueDate: toDbDate(start), amount: sub.price },
  });
  return { charge, created: true };
}

async function payChargeTx(tx, ctx, charge, { accountId, method }, label) {
  const account = await tx.financialAccount.findFirst({ where: { id: accountId, unitId: charge.unitId, status: 'ACTIVE' } });
  if (!account) throw badRequest('Conta inválida para esta unidade.');
  const paidAt = new Date();
  await tx.subscriptionCharge.update({ where: { id: charge.id }, data: { status: 'PAID', paidAt, method, accountId } });
  await tx.financialTransaction.create({
    data: {
      unitId: charge.unitId, accountId, direction: 'IN', kind: 'SUBSCRIPTION_PAYMENT', amount: charge.amount, occurredAt: paidAt,
      chargeId: charge.id, description: `Mensalidade ${label} (${isoOf(charge.periodStart).split('-').reverse().join('/')})`, createdById: ctx.user.id,
    },
  });
}

/** Contrata um plano para um cliente. Gera a primeira mensalidade e, se informado, registra o pagamento. */
export async function subscribe(ctx, { clientId, planId, unitId, startDate, notes, payment }) {
  if (!ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
  const companyId = ctx.user.companyId;
  const unit = await prisma.unit.findFirst({ where: { id: unitId, companyId } });
  if (!unit) throw badRequest('Unidade inválida.');
  const client = await prisma.client.findFirst({ where: { id: clientId, companyId, anonymizedAt: null } });
  if (!client) throw badRequest('Cliente inválido.');
  const plan = await prisma.plan.findFirst({ where: { id: planId, companyId, status: 'ACTIVE' }, include: planInclude });
  if (!plan) throw badRequest('Plano inválido ou inativo.');
  if (plan.unitId && plan.unitId !== unitId) throw badRequest('Este plano é exclusivo de outra unidade.');
  const start = startDate ?? todayLocal(unit.timezone);
  try {
    const id = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          companyId, clientId, planId, unitId, startDate: toDbDate(start), price: plan.price, notes, createdById: ctx.user.id,
          planSnapshot: {
            name: plan.name,
            unitId: plan.unitId,
            commissionOnCovered: plan.commissionOnCovered,
            items: plan.items.map((i) => ({ serviceId: i.serviceId, name: i.service.name, quantity: i.quantity })),
          },
        },
      });
      const { charge } = await ensureCharge(tx, sub, 0);
      if (payment) await payChargeTx(tx, ctx, charge, payment, plan.name);
      await audit({ ctx, action: 'subscription.create', entity: 'Subscription', entityId: sub.id, unitId, after: { clientId, plan: plan.name, price: plan.price, paid: !!payment } }, tx);
      return sub.id;
    });
    return getSubscription(ctx, id);
  } catch (e) {
    if (e?.code === 'P2002') throw conflict('Este cliente já tem este plano ativo ou pausado.');
    throw e;
  }
}

/** Pausar (não gera mensalidades nem cobre serviços), retomar ou cancelar. Mensalidades em aberto são canceladas no cancelamento. */
export async function changeSubscriptionStatus(ctx, id, { action, reason }) {
  const sub = await loadSubscription(ctx, id);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (action === 'pause') {
      if (sub.status !== 'ACTIVE') throw badRequest('Só é possível pausar assinaturas ativas.');
      await tx.subscription.update({ where: { id }, data: { status: 'PAUSED', pausedAt: now } });
    } else if (action === 'resume') {
      if (sub.status !== 'PAUSED') throw badRequest('Só é possível retomar assinaturas pausadas.');
      await tx.subscription.update({ where: { id }, data: { status: 'ACTIVE', pausedAt: null } });
      const n = periodIndexOn(isoOf(sub.startDate), todayLocal(sub.unit.timezone));
      if (n >= 0) await ensureCharge(tx, sub, n);
    } else {
      if (sub.status === 'CANCELLED') throw badRequest('Assinatura já cancelada.');
      if (!reason) throw badRequest('Informe o motivo do cancelamento.');
      await tx.subscription.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: now, cancelReason: reason } });
      await tx.subscriptionCharge.updateMany({ where: { subscriptionId: id, status: 'OPEN' }, data: { status: 'CANCELLED', cancelledAt: now } });
    }
    await audit({ ctx, action: `subscription.${action}`, entity: 'Subscription', entityId: id, unitId: sub.unitId, after: { reason } }, tx);
  });
  return getSubscription(ctx, id);
}

// ── Mensalidades ──

/** Gera as mensalidades que faltam até o período atual das assinaturas ativas. Idempotente. */
export async function generateCharges(ctx, { unitId } = {}) {
  if (unitId && !ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
  const subs = await prisma.subscription.findMany({
    where: { companyId: ctx.user.companyId, status: 'ACTIVE', unitId: unitId ?? { in: ctx.unitIds } },
    include: { unit: { select: { timezone: true } } },
  });
  let created = 0;
  for (const sub of subs) {
    const n = periodIndexOn(isoOf(sub.startDate), todayLocal(sub.unit.timezone));
    if (n < 0) continue;
    // Gera só a partir do último período que já tem mensalidade (não recria meses em que estava pausada).
    const last = await prisma.subscriptionCharge.findFirst({ where: { subscriptionId: sub.id }, orderBy: { periodStart: 'desc' } });
    const from = last ? periodIndexOn(isoOf(sub.startDate), isoOf(last.periodStart)) + 1 : 0;
    for (let i = from; i <= n; i++) {
      try {
        const r = await prisma.$transaction((tx) => ensureCharge(tx, sub, i));
        if (r.created) created++;
      } catch (e) {
        if (e?.code !== 'P2002') throw e; // gerada em paralelo: tudo bem
      }
    }
  }
  if (created) await audit({ ctx, action: 'subscription.charges.generate', entity: 'SubscriptionCharge', unitId, after: { created } });
  return { created };
}

export async function listCharges(ctx, { unitId, status, from, to }) {
  if (unitId && !ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
  const where = { unitId: unitId ?? { in: ctx.unitIds }, subscription: { companyId: ctx.user.companyId }, ...(status ? { status } : {}) };
  if (from && to) {
    periodRange(from, to);
    where.dueDate = { gte: toDbDate(from), lte: toDbDate(to) };
  }
  const rows = await prisma.subscriptionCharge.findMany({
    where,
    include: {
      subscription: { select: { id: true, status: true, planSnapshot: true, client: { select: { id: true, name: true, phone: true } } } },
      account: { select: { name: true } },
      unit: { select: { name: true, timezone: true } },
    },
    orderBy: [{ dueDate: 'asc' }],
    take: 1000,
  });
  return rows.map((c) => {
    const today = todayLocal(c.unit.timezone);
    return { ...c, overdue: c.status === 'OPEN' && isoOf(c.dueDate) < today };
  });
}

async function loadCharge(ctx, id, db = prisma) {
  const c = await db.subscriptionCharge.findFirst({
    where: { id, unitId: { in: ctx.unitIds }, subscription: { companyId: ctx.user.companyId } },
    include: { subscription: true },
  });
  if (!c) throw notFound('Mensalidade não encontrada.');
  return c;
}

export async function payCharge(ctx, id, payment) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SubscriptionCharge" WHERE id = ${id}::uuid FOR UPDATE`;
    const c = await loadCharge(ctx, id, tx);
    if (c.status !== 'OPEN') throw badRequest(c.status === 'PAID' ? 'Esta mensalidade já foi paga.' : 'Mensalidade cancelada.');
    await payChargeTx(tx, ctx, c, payment, c.subscription.planSnapshot.name);
    await audit({ ctx, action: 'subscription.charge.pay', entity: 'SubscriptionCharge', entityId: id, unitId: c.unitId, after: { amount: c.amount, method: payment.method } }, tx);
  });
  return loadCharge(ctx, id);
}

export async function cancelCharge(ctx, id, { reason }) {
  const c = await loadCharge(ctx, id);
  if (c.status !== 'OPEN') throw badRequest('Só mensalidades em aberto podem ser canceladas. Para uma paga, estorne o recebimento no financeiro.');
  await prisma.subscriptionCharge.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
  await audit({ ctx, action: 'subscription.charge.cancel', entity: 'SubscriptionCharge', entityId: id, unitId: c.unitId, after: { reason } });
  return loadCharge(ctx, id);
}

/** Chamado pelo estorno do financeiro: a mensalidade volta a ficar em aberto. */
export async function reopenChargeTx(tx, chargeId) {
  await tx.subscriptionCharge.update({ where: { id: chargeId }, data: { status: 'OPEN', paidAt: null, method: null, accountId: null } });
}

// ── Cobertura nos atendimentos ──

/**
 * Procura uma assinatura do cliente que cubra o serviço nesta unidade agora.
 * Regras: assinatura ativa; serviço no plano; plano válido na unidade; limite do mês não atingido;
 * nenhuma mensalidade vencida há mais de GRACE_DAYS dias.
 * Retorna { subscriptionId, planName } ou { reason } explicando por que não cobre.
 */
export async function findCoverage(tx, { companyId, clientId, unitId, serviceId, quantity = 1, excludeItemId }) {
  if (!clientId) return { reason: 'Atendimento sem cliente identificado.' };
  const unit = await tx.unit.findUnique({ where: { id: unitId }, select: { timezone: true } });
  const today = todayLocal(unit.timezone);
  const subs = await tx.subscription.findMany({ where: { companyId, clientId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
  let reason = subs.length ? 'O plano do cliente não inclui este serviço.' : 'O cliente não tem plano ativo.';
  for (const sub of subs) {
    const snap = sub.planSnapshot;
    const item = snap.items.find((i) => i.serviceId === serviceId);
    if (!item) continue;
    if (snap.unitId && snap.unitId !== unitId) {
      reason = 'O plano do cliente vale em outra unidade.';
      continue;
    }
    const startIso = isoOf(sub.startDate);
    const n = periodIndexOn(startIso, today);
    if (n < 0) {
      reason = 'O plano do cliente ainda não começou.';
      continue;
    }
    await ensureCharge(tx, sub, n); // mensalidade do mês atual (vence hoje ou já venceu)
    const overdue = await tx.subscriptionCharge.findFirst({
      where: { subscriptionId: sub.id, status: 'OPEN', dueDate: { lt: toDbDate(DateTime.fromISO(today).minus({ days: GRACE_DAYS }).toISODate()) } },
    });
    if (overdue) {
      reason = `Mensalidade vencida em ${isoOf(overdue.dueDate).split('-').reverse().join('/')} — regularize para usar o plano.`;
      continue;
    }
    if (item.quantity != null) {
      const { start, end } = periodAt(startIso, n);
      const agg = await tx.saleItem.aggregate({
        where: {
          subscriptionId: sub.id,
          serviceId,
          ...(excludeItemId ? { id: { not: excludeItemId } } : {}),
          sale: {
            status: { not: 'CANCELLED' },
            createdAt: { gte: DateTime.fromISO(start, { zone: unit.timezone }).toUTC().toJSDate(), lt: DateTime.fromISO(end, { zone: unit.timezone }).toUTC().toJSDate() },
          },
        },
        _sum: { quantity: true },
      });
      if ((agg._sum.quantity ?? 0) + quantity > item.quantity) {
        reason = `Limite do plano atingido neste mês (${item.quantity}× ${item.name}).`;
        continue;
      }
    }
    return { subscriptionId: sub.id, planName: snap.name };
  }
  return { reason };
}

/** Comissão de item coberto: sobre o preço de tabela do serviço (padrão) ou zero, conforme o plano. */
export function commissionBase(item, subscription) {
  if (!item.subscriptionId) return dec(item.total);
  return subscription?.planSnapshot?.commissionOnCovered === false ? dec(0) : dec(item.coveredAmount ?? 0);
}

/** Indicadores de assinaturas para dashboards e relatórios. */
export async function subscriptionStats(unitIds, { start, end } = {}) {
  if (!unitIds.length) return { activeSubscribers: 0, mrr: '0.00', overdueCharges: 0, overdueAmount: '0.00', coveredServices: 0, coveredValue: '0.00' };
  const active = await prisma.subscription.findMany({ where: { unitId: { in: unitIds }, status: 'ACTIVE' }, select: { price: true } });
  const todayIso = DateTime.now().setZone('America/Sao_Paulo').toISODate();
  const overdue = await prisma.subscriptionCharge.findMany({ where: { unitId: { in: unitIds }, status: 'OPEN', dueDate: { lt: toDbDate(todayIso) } }, select: { amount: true } });
  let covered = { _count: 0, _sum: { coveredAmount: null } };
  if (start && end) {
    covered = await prisma.saleItem.aggregate({
      where: { subscriptionId: { not: null }, sale: { unitId: { in: unitIds }, status: 'CLOSED', closedAt: { gte: start, lt: end } } },
      _count: true,
      _sum: { coveredAmount: true },
    });
  }
  return {
    activeSubscribers: active.length,
    mrr: sum(active.map((a) => a.price)).toFixed(2), // receita mensal recorrente contratada
    overdueCharges: overdue.length,
    overdueAmount: sum(overdue.map((o) => o.amount)).toFixed(2),
    coveredServices: covered._count,
    coveredValue: dec(covered._sum.coveredAmount ?? 0).toFixed(2),
  };
}
