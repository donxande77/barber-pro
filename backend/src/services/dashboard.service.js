import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { forbidden, notFound } from '../utils/errors.js';
import { dec, sum } from '../utils/money.js';
import { dayRange, periodRange, todayLocal } from '../utils/time.js';
import { cashFlow, consolidated, listAccounts, unitSummary } from './finance.service.js';
import { barberStatement } from './compensation.service.js';

const join = (ids) => Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));

/** Serviços e produtos mais vendidos no período (com filtros opcionais). */
async function topItems(unitIds, { start, end }, { barberId, serviceId } = {}) {
  if (!unitIds.length) return { services: [], products: [] };
  const rows = await prisma.$queryRaw`
    SELECT i.kind::text AS kind, i.description AS name, SUM(i.quantity)::int AS qty, SUM(i.total) AS revenue
    FROM "SaleItem" i JOIN "Sale" s ON s.id = i."saleId"
    WHERE s.status = 'CLOSED' AND s."unitId" IN (${join(unitIds)}) AND s."closedAt" >= ${start} AND s."closedAt" < ${end}
      ${barberId ? Prisma.sql`AND i."barberId" = ${barberId}::uuid` : Prisma.empty}
      ${serviceId ? Prisma.sql`AND i."serviceId" = ${serviceId}::uuid` : Prisma.empty}
    GROUP BY 1, 2 ORDER BY revenue DESC LIMIT 20`;
  const map = (r) => ({ name: r.name, qty: r.qty, revenue: dec(r.revenue).toFixed(2) });
  return {
    services: rows.filter((r) => r.kind === 'SERVICE').slice(0, 8).map(map),
    products: rows.filter((r) => r.kind === 'PRODUCT').slice(0, 8).map(map),
  };
}

async function revenueByMethod(unitIds, { start, end }) {
  if (!unitIds.length) return [];
  const rows = await prisma.$queryRaw`
    SELECT p.method::text AS method, SUM(p.amount) AS amount
    FROM "Payment" p JOIN "Sale" s ON s.id = p."saleId"
    WHERE p.status = 'CONFIRMED' AND s."unitId" IN (${join(unitIds)}) AND p."paidAt" >= ${start} AND p."paidAt" < ${end}
    GROUP BY 1 ORDER BY 2 DESC`;
  return rows.map((r) => ({ method: r.method, amount: dec(r.amount).toFixed(2) }));
}

async function productivity(unitIds, { start, end }, serviceId) {
  if (!unitIds.length) return [];
  const rows = await prisma.$queryRaw`
    SELECT b.id, b.name, COUNT(DISTINCT s.id)::int AS sales,
           COALESCE(SUM(CASE WHEN i.kind = 'SERVICE' THEN i.quantity ELSE 0 END), 0)::int AS services,
           COALESCE(SUM(i.total), 0) AS revenue, COALESCE(SUM(i."commissionAmount"), 0) AS commissions
    FROM "SaleItem" i JOIN "Sale" s ON s.id = i."saleId" JOIN "Barber" b ON b.id = i."barberId"
    WHERE s.status = 'CLOSED' AND s."unitId" IN (${join(unitIds)}) AND s."closedAt" >= ${start} AND s."closedAt" < ${end}
      ${serviceId ? Prisma.sql`AND i."serviceId" = ${serviceId}::uuid` : Prisma.empty}
    GROUP BY b.id, b.name ORDER BY revenue DESC`;
  return rows.map((r) => ({ id: r.id, name: r.name, sales: r.sales, services: r.services, revenue: dec(r.revenue).toFixed(2), commissions: dec(r.commissions).toFixed(2) }));
}

export async function ownerDashboard(ctx, { from, to, unitId, barberId, serviceId, method }) {
  if (unitId && !ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
  const range = periodRange(from, to);
  const unitIds = unitId ? [unitId] : ctx.unitIds;
  const cons = await consolidated(ctx, { from, to, method });
  return {
    period: { from, to },
    summary: unitId ? await unitSummary(unitIds, range, { method }) : cons.total,
    perUnit: unitId ? cons.perUnit.filter((u) => u.unit.id === unitId) : cons.perUnit,
    internalTransfers: cons.internalTransfers,
    accounts: cons.accounts.filter((a) => unitIds.includes(a.unitId)),
    available: sum(cons.accounts.filter((a) => unitIds.includes(a.unitId) && a.status === 'ACTIVE').map((a) => a.balance)).toFixed(2),
    cashFlow: await cashFlow(unitIds, range),
    top: await topItems(unitIds, range, { barberId, serviceId }),
    byMethod: await revenueByMethod(unitIds, range),
    productivity: (await productivity(unitIds, range, serviceId)).filter((p) => !barberId || p.id === barberId),
  };
}

export async function managerDashboard(ctx, { unitId, from, to, serviceId, method }) {
  const uid = unitId ?? ctx.unitIds[0];
  if (!uid) return { empty: true };
  if (!ctx.unitIds.includes(uid)) throw forbidden('Unidade fora do seu acesso.');
  const unit = await prisma.unit.findUnique({ where: { id: uid } });
  const range = periodRange(from, to, unit.timezone);
  const today = dayRange(todayLocal(unit.timezone), unit.timezone);
  const [todayAppointments, statusCounts, lowStock] = await Promise.all([
    prisma.appointment.findMany({
      where: { unitId: uid, startsAt: { gte: today.start, lt: today.end } },
      include: { client: { select: { name: true } }, barber: { select: { name: true } }, items: { select: { serviceName: true } } },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.appointment.groupBy({ by: ['status'], where: { unitId: uid, startsAt: { gte: range.start, lt: range.end } }, _count: true }),
    prisma.$queryRaw`
      SELECT p.name, ps.quantity, ps."minQuantity" FROM "ProductStock" ps JOIN "Product" p ON p.id = ps."productId"
      WHERE ps."unitId" = ${uid}::uuid AND p.status = 'ACTIVE' AND ps.quantity <= ps."minQuantity" ORDER BY ps.quantity ASC LIMIT 20`,
  ]);
  const accounts = await listAccounts(ctx, { unitId: uid });
  return {
    unit: { id: unit.id, name: unit.name, timezone: unit.timezone },
    period: { from, to },
    summary: await unitSummary([uid], range, { method }),
    accounts,
    available: sum(accounts.filter((a) => a.status === 'ACTIVE').map((a) => a.balance)).toFixed(2),
    today: todayAppointments,
    appointmentsByStatus: statusCounts.map((s) => ({ status: s.status, count: s._count })),
    cashFlow: await cashFlow([uid], range, unit.timezone),
    top: await topItems([uid], range, { serviceId }),
    byMethod: await revenueByMethod([uid], range),
    productivity: await productivity([uid], range, serviceId),
    lowStock,
  };
}

export async function barberDashboard(ctx, { from, to }) {
  const barber = await prisma.barber.findUnique({ where: { userId: ctx.user.id } });
  if (!barber) throw notFound('Cadastro de barbeiro não encontrado.');
  const statement = await barberStatement(ctx, { from, to });
  const tz = 'America/Sao_Paulo';
  const today = dayRange(todayLocal(tz), tz);
  const upcoming = await prisma.appointment.findMany({
    where: { barberId: barber.id, startsAt: { gte: today.start }, status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'] } },
    include: { client: { select: { name: true, phone: true } }, unit: { select: { name: true, timezone: true } }, items: { select: { serviceName: true } } },
    orderBy: { startsAt: 'asc' },
    take: 30,
  });
  const byDay = new Map();
  for (const i of statement.items) {
    const d = i.date.toISOString().slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? dec(0)).plus(dec(i.commissionAmount ?? 0)));
  }
  return {
    ...statement,
    upcoming,
    commissionsByDay: [...byDay.entries()].map(([day, v]) => ({ day, amount: v.toFixed(2) })),
  };
}
