import { DateTime } from 'luxon';
import { prisma } from '../db/prisma.js';
import { audit } from '../utils/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { D, dec, money, percentOf, sum, toMoneyString } from '../utils/money.js';
import { periodRange } from '../utils/time.js';
import { commissionBase } from './plan.service.js';

/**
 * Quais tipos de regra cada modelo de remuneração aceita.
 * Combinações fora desta tabela são recusadas ("sem regra explícita, não combina").
 */
export const MODEL_ALLOWS = {
  COMMISSION: ['SERVICE_COMMISSION_PCT', 'PRODUCT_COMMISSION_PCT'],
  FIXED: ['FIXED_SALARY'],
  FIXED_PLUS_COMMISSION: ['FIXED_SALARY', 'SERVICE_COMMISSION_PCT', 'PRODUCT_COMMISSION_PCT'],
  CHAIR_RENTAL: ['CHAIR_RENTAL'],
  CHAIR_RENTAL_PLUS_COMMISSION: ['CHAIR_RENTAL', 'SERVICE_COMMISSION_PCT', 'PRODUCT_COMMISSION_PCT'],
};

export const MODEL_LABELS = {
  COMMISSION: 'Comissão',
  FIXED: 'Remuneração fixa',
  FIXED_PLUS_COMMISSION: 'Fixo + comissão',
  CHAIR_RENTAL: 'Aluguel de cadeira',
  CHAIR_RENTAL_PLUS_COMMISSION: 'Aluguel de cadeira + comissão',
};

// ── Regras ──

async function loadBarberInCompany(ctx, barberId) {
  const b = await prisma.barber.findFirst({ where: { id: barberId, companyId: ctx.user.companyId }, include: { units: true } });
  if (!b) throw notFound('Barbeiro não encontrado.');
  return b;
}

export async function listRules(ctx, { barberId, includeEnded }) {
  const where = { companyId: ctx.user.companyId };
  if (barberId) where.barberId = barberId;
  if (!includeEnded) where.OR = [{ validTo: null }, { validTo: { gt: new Date() } }];
  return prisma.compensationRule.findMany({
    where,
    include: {
      barber: { select: { name: true } },
      unit: { select: { name: true } },
      service: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: [{ barberId: 'asc' }, { validFrom: 'desc' }],
  });
}

/**
 * Cria uma regra com vigência. Se já existir regra aberta para o mesmo escopo,
 * ela é encerrada na data de início da nova — o passado não é recalculado.
 */
export async function createRule(ctx, data) {
  const barber = await loadBarberInCompany(ctx, data.barberId);
  const links = barber.units.filter((l) => l.isActive && (!data.unitId || l.unitId === data.unitId));
  if (!links.length) throw badRequest('O barbeiro não tem vínculo ativo com a unidade informada.');
  const incompatible = links.filter((l) => !MODEL_ALLOWS[l.compensationModel].includes(data.type));
  if (incompatible.length) {
    throw badRequest(
      `O modelo de remuneração do vínculo (${MODEL_LABELS[incompatible[0].compensationModel]}) não permite este tipo de regra. ` +
        'Altere o modelo do vínculo no cadastro do barbeiro para combinar fixo/aluguel com comissão.',
    );
  }
  if (data.serviceId && data.type !== 'SERVICE_COMMISSION_PCT') throw badRequest('Serviço só se aplica a comissão de serviço.');
  if (data.productId && data.type !== 'PRODUCT_COMMISSION_PCT') throw badRequest('Produto só se aplica a comissão de produto.');
  for (const [model, id] of [['service', data.serviceId], ['product', data.productId], ['unit', data.unitId]]) {
    if (id && !(await prisma[model].findFirst({ where: { id, companyId: ctx.user.companyId } }))) throw badRequest('Referência inválida.');
  }

  const scope = {
    barberId: data.barberId,
    type: data.type,
    unitId: data.unitId ?? null,
    serviceId: data.serviceId ?? null,
    productId: data.productId ?? null,
  };
  return prisma.$transaction(async (tx) => {
    const open = await tx.compensationRule.findMany({
      where: { ...scope, companyId: ctx.user.companyId, OR: [{ validTo: null }, { validTo: { gt: data.validFrom } }] },
    });
    for (const r of open) {
      if (r.validFrom >= data.validFrom) {
        throw conflict('Já existe regra para este escopo começando na mesma data ou depois. Ajuste a data de início.');
      }
      await tx.compensationRule.update({ where: { id: r.id }, data: { validTo: data.validFrom } });
    }
    const rule = await tx.compensationRule.create({
      data: {
        ...scope,
        companyId: ctx.user.companyId,
        percent: data.percent ?? null,
        amount: data.amount ?? null,
        period: data.period ?? null,
        validFrom: data.validFrom,
        notes: data.notes,
        createdById: ctx.user.id,
      },
    });
    await audit({ ctx, action: 'compensation.rule_create', entity: 'CompensationRule', entityId: rule.id, after: rule, before: open }, tx);
    return rule;
  });
}

/** Encerra a vigência de uma regra (não apaga: o histórico continua valendo para o passado). */
export async function endRule(ctx, id, { validTo }) {
  const rule = await prisma.compensationRule.findFirst({ where: { id, companyId: ctx.user.companyId } });
  if (!rule) throw notFound('Regra não encontrada.');
  if (validTo <= rule.validFrom) throw badRequest('O fim deve ser depois do início da vigência.');
  const updated = await prisma.compensationRule.update({ where: { id }, data: { validTo } });
  await audit({ ctx, action: 'compensation.rule_end', entity: 'CompensationRule', entityId: id, before: rule, after: updated });
  return updated;
}

/**
 * Define o percentual de comissão de um item no momento da venda.
 * Ordem: regra do barbeiro mais específica vigente → comissão padrão do serviço/produto → zero.
 * Sempre respeita o modelo de remuneração do vínculo do barbeiro com a unidade.
 */
export async function resolveCommission(tx, { barberId, unitId, kind, serviceId, productId, at, itemDefaultPct }) {
  const type = kind === 'SERVICE' ? 'SERVICE_COMMISSION_PCT' : 'PRODUCT_COMMISSION_PCT';
  const link = await tx.barberUnit.findUnique({ where: { barberId_unitId: { barberId, unitId } } });
  if (!link) return { pct: new D(0), ruleId: null, snapshot: { source: 'sem vínculo com a unidade', type } };
  if (!MODEL_ALLOWS[link.compensationModel].includes(type)) {
    return { pct: new D(0), ruleId: null, snapshot: { source: 'modelo sem comissão', model: link.compensationModel, type } };
  }
  const itemField = kind === 'SERVICE' ? 'serviceId' : 'productId';
  const itemId = kind === 'SERVICE' ? serviceId : productId;
  const rules = await tx.compensationRule.findMany({
    where: {
      barberId,
      type,
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
      AND: [{ OR: [{ unitId: null }, { unitId }] }, { OR: [{ [itemField]: null }, { [itemField]: itemId }] }],
    },
  });
  if (rules.length) {
    const score = (r) => (r[itemField] ? 2 : 0) + (r.unitId ? 1 : 0);
    const best = rules.sort((a, b) => score(b) - score(a) || b.validFrom - a.validFrom)[0];
    return {
      pct: dec(best.percent),
      ruleId: best.id,
      snapshot: { source: 'regra do barbeiro', ruleId: best.id, type, percent: dec(best.percent).toFixed(2), model: link.compensationModel, validFrom: best.validFrom, unitId: best.unitId, [itemField]: best[itemField] },
    };
  }
  if (itemDefaultPct != null) {
    return { pct: dec(itemDefaultPct), ruleId: null, snapshot: { source: `padrão do ${kind === 'SERVICE' ? 'serviço' : 'produto'}`, type, percent: dec(itemDefaultPct).toFixed(2), model: link.compensationModel } };
  }
  return { pct: new D(0), ruleId: null, snapshot: { source: 'sem regra', type, model: link.compensationModel } };
}

/** Gera as obrigações de comissão dos itens de uma venda fechada. */
export async function accrueCommissions(tx, sale, ctx) {
  for (const item of sale.items) {
    if (!item.barberId) continue;
    const c = await resolveCommission(tx, {
      barberId: item.barberId,
      unitId: sale.unitId,
      kind: item.kind,
      serviceId: item.serviceId,
      productId: item.productId,
      at: sale.closedAt,
      itemDefaultPct: item.kind === 'SERVICE' ? item.service?.commissionPct : item.product?.commissionPct,
    });
    const amount = percentOf(commissionBase(item, item.subscription), c.pct);
    await tx.saleItem.update({
      where: { id: item.id },
      data: { commissionRuleId: c.ruleId, commissionPct: c.pct.toFixed(2), commissionAmount: toMoneyString(amount), ruleSnapshot: c.snapshot },
    });
    if (amount.gt(0)) {
      await tx.barberObligation.create({
        data: {
          barberId: item.barberId,
          unitId: sale.unitId,
          type: 'COMMISSION',
          direction: 'PAYABLE_TO_BARBER',
          amount: toMoneyString(amount),
          saleItemId: item.id,
          ruleId: c.ruleId,
          ruleSnapshot: c.snapshot,
          description: `Comissão ${c.pct.toFixed(2)}% — ${item.description}`,
          createdById: ctx?.user?.id,
        },
      });
    }
  }
}

// ── Obrigações periódicas (fixo e aluguel de cadeira) ──

/**
 * Gera remuneração fixa e aluguel de cadeira de um mês para os barbeiros da unidade.
 * Regras mensais entram uma vez; semanais, uma vez por semana iniciada (segunda-feira) no mês.
 * Idempotente: rodar de novo não duplica.
 */
export async function generatePeriodic(ctx, { unitId, month }) {
  if (!ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  const start = DateTime.fromISO(`${month}-01`, { zone: unit.timezone });
  if (!start.isValid) throw badRequest('Mês inválido (AAAA-MM).');
  const end = start.plus({ months: 1 });
  let mondays = 0;
  for (let d = start; d < end; d = d.plus({ days: 1 })) if (d.weekday === 1) mondays++;

  const links = await prisma.barberUnit.findMany({ where: { unitId, isActive: true }, include: { barber: true } });
  const created = [];
  await prisma.$transaction(async (tx) => {
    for (const link of links) {
      const rules = await tx.compensationRule.findMany({
        where: {
          barberId: link.barberId,
          type: { in: ['FIXED_SALARY', 'CHAIR_RENTAL'] },
          validFrom: { lt: end.toJSDate() },
          OR: [{ validTo: null }, { validTo: { gt: start.toJSDate() } }],
          AND: [{ OR: [{ unitId: null }, { unitId }] }],
        },
      });
      for (const rule of rules) {
        if (!MODEL_ALLOWS[link.compensationModel].includes(rule.type)) continue;
        const refStart = new Date(`${month}-01T00:00:00Z`);
        const exists = await tx.barberObligation.findFirst({
          where: { barberId: link.barberId, unitId, ruleId: rule.id, referenceStart: refStart, cancelledAt: null },
        });
        if (exists) continue;
        const times = rule.period === 'WEEKLY' ? mondays : 1;
        const amount = money(dec(rule.amount).times(times));
        if (amount.lte(0)) continue;
        const isRent = rule.type === 'CHAIR_RENTAL';
        const ob = await tx.barberObligation.create({
          data: {
            barberId: link.barberId,
            unitId,
            type: isRent ? 'CHAIR_RENTAL' : 'FIXED_SALARY',
            direction: isRent ? 'RECEIVABLE_FROM_BARBER' : 'PAYABLE_TO_BARBER',
            amount: toMoneyString(amount),
            referenceStart: refStart,
            referenceEnd: new Date(`${end.toISODate()}T00:00:00Z`),
            ruleId: rule.id,
            ruleSnapshot: { type: rule.type, amount: dec(rule.amount).toFixed(2), period: rule.period, times },
            description: `${isRent ? 'Aluguel de cadeira' : 'Remuneração fixa'} ${start.toFormat('MM/yyyy')}`,
            createdById: ctx.user.id,
          },
        });
        created.push(ob);
      }
    }
    await audit({ ctx, action: 'compensation.periodic', entity: 'Unit', entityId: unitId, unitId, after: { month, created: created.length } }, tx);
  });
  return { created: created.length, obligations: created };
}

// ── Bônus e ajustes ──

export async function createManualObligation(ctx, data) {
  if (!ctx.unitIds.includes(data.unitId)) throw forbidden('Unidade fora do seu acesso.');
  const link = await prisma.barberUnit.findFirst({ where: { barberId: data.barberId, unitId: data.unitId, barber: { companyId: ctx.user.companyId } } });
  if (!link) throw badRequest('O barbeiro não é vinculado a esta unidade.');
  const ob = await prisma.barberObligation.create({
    data: { ...data, createdById: ctx.user.id },
  });
  await audit({ ctx, action: 'compensation.obligation_manual', entity: 'BarberObligation', entityId: ob.id, unitId: data.unitId, after: ob });
  return ob;
}

export async function cancelObligation(ctx, id, { reason }) {
  const ob = await prisma.barberObligation.findFirst({ where: { id, unitId: { in: ctx.unitIds } } });
  if (!ob) throw notFound('Lançamento não encontrado.');
  if (ob.status === 'CANCELLED') throw badRequest('Lançamento já cancelado.');
  if (dec(ob.settledAmount).gt(0)) throw badRequest('Lançamento com pagamento registrado não pode ser cancelado. Lance um ajuste.');
  if (ob.type === 'COMMISSION') throw badRequest('Comissões são canceladas pelo cancelamento da venda.');
  const updated = await prisma.barberObligation.update({
    where: { id },
    data: { status: 'CANCELLED', cancelledAt: new Date(), description: `${ob.description ?? ''} [cancelado: ${reason}]` },
  });
  await audit({ ctx, action: 'compensation.obligation_cancel', entity: 'BarberObligation', entityId: id, unitId: ob.unitId, before: ob, after: updated });
  return updated;
}

// ── Situação das obrigações: calculado × devido × pago × pendente ──

const obligationInclude = {
  saleItem: { select: { description: true, sale: { select: { id: true, total: true, status: true, closedAt: true, payments: { where: { status: 'CONFIRMED' }, select: { amount: true } } } } } },
};

/** Comissão só passa a ser devida quando a venda está totalmente recebida. */
export function isDue(ob) {
  if (ob.status === 'CANCELLED') return false;
  if (ob.type !== 'COMMISSION') return true;
  const sale = ob.saleItem?.sale;
  if (!sale || sale.status !== 'CLOSED') return false;
  return sum(sale.payments.map((p) => p.amount)).gte(dec(sale.total));
}

export function decorate(ob) {
  const due = isDue(ob);
  const amount = dec(ob.amount);
  const settled = dec(ob.settledAmount);
  return {
    ...ob,
    due,
    pending: toMoneyString(ob.status === 'CANCELLED' ? 0 : D.max(amount.minus(settled), 0)),
    saleId: ob.saleItem?.sale?.id ?? null,
    saleItem: undefined,
  };
}

export async function listObligations(ctx, { barberId, unitId, status, from, to }) {
  const where = { unitId: unitId ? unitId : { in: ctx.unitIds } };
  if (unitId && !ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
  if (barberId) where.barberId = barberId;
  if (status) where.status = status;
  if (from) {
    const r = periodRange(from, to ?? from);
    where.createdAt = { gte: r.start, lt: r.end };
  }
  const rows = await prisma.barberObligation.findMany({
    where,
    include: { ...obligationInclude, barber: { select: { name: true } }, unit: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return rows.map(decorate);
}

/**
 * Registra pagamento ao barbeiro (ou recebimento do aluguel de cadeira), quitando obrigações
 * devidas da mais antiga para a mais nova. Gera a movimentação financeira na conta escolhida.
 */
export async function createPayout(ctx, { barberId, unitId, accountId, direction, amount, obligationIds, notes }) {
  if (!ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
  const account = await prisma.financialAccount.findFirst({ where: { id: accountId, unitId, status: 'ACTIVE' } });
  if (!account) throw badRequest('Conta inválida para esta unidade.');
  const value = money(amount);

  return prisma.$transaction(async (tx) => {
    // Trava as obrigações do barbeiro na unidade para evitar dois pagamentos simultâneos sobre o mesmo saldo.
    await tx.$queryRaw`SELECT id FROM "BarberObligation" WHERE "barberId" = ${barberId}::uuid AND "unitId" = ${unitId}::uuid FOR UPDATE`;
    const rows = await tx.barberObligation.findMany({
      where: {
        barberId, unitId, direction, status: { in: ['OPEN', 'PARTIAL'] },
        ...(obligationIds?.length ? { id: { in: obligationIds } } : {}),
      },
      include: obligationInclude,
      orderBy: { createdAt: 'asc' },
    });
    const due = rows.filter(isDue);
    const available = sum(due.map((o) => dec(o.amount).minus(dec(o.settledAmount))));
    if (value.gt(available)) {
      throw badRequest(`O valor excede o saldo devido (R$ ${available.toFixed(2)}).`, { available: available.toFixed(2) });
    }
    const payout = await tx.barberPayout.create({
      data: { barberId, unitId, accountId, direction, amount: toMoneyString(value), notes, createdById: ctx.user.id },
    });
    let left = value;
    for (const ob of due) {
      if (left.lte(0)) break;
      const open = dec(ob.amount).minus(dec(ob.settledAmount));
      const part = D.min(open, left);
      left = left.minus(part);
      const settled = dec(ob.settledAmount).plus(part);
      await tx.barberPayoutAllocation.create({ data: { payoutId: payout.id, obligationId: ob.id, amount: toMoneyString(part) } });
      await tx.barberObligation.update({
        where: { id: ob.id },
        data: { settledAmount: toMoneyString(settled), status: settled.gte(dec(ob.amount)) ? 'SETTLED' : 'PARTIAL' },
      });
    }
    const isRent = direction === 'RECEIVABLE_FROM_BARBER';
    await tx.financialTransaction.create({
      data: {
        unitId, accountId, payoutId: payout.id,
        direction: isRent ? 'IN' : 'OUT',
        kind: isRent ? 'CHAIR_RENT_RECEIPT' : 'BARBER_PAYOUT',
        amount: toMoneyString(value),
        description: isRent ? 'Recebimento de aluguel de cadeira' : 'Pagamento a profissional',
        createdById: ctx.user.id,
      },
    });
    await audit({ ctx, action: 'compensation.payout', entity: 'BarberPayout', entityId: payout.id, unitId, after: { barberId, amount: value.toFixed(2), direction } }, tx);
    return payout;
  });
}

export async function listPayouts(ctx, { barberId, unitId }) {
  return prisma.barberPayout.findMany({
    where: { unitId: unitId && ctx.unitIds.includes(unitId) ? unitId : { in: ctx.unitIds }, ...(barberId ? { barberId } : {}) },
    include: { barber: { select: { name: true } }, account: { select: { name: true } }, allocations: true },
    orderBy: { paidAt: 'desc' },
    take: 200,
  });
}

/**
 * Demonstrativo financeiro do barbeiro no período.
 * Separa: calculado (tudo gerado), devido (já exigível), pago e pendente.
 */
export async function barberStatement(ctx, { barberId, unitId, from, to }) {
  let id = barberId;
  if (ctx.user.role === 'BARBER') {
    const own = await prisma.barber.findUnique({ where: { userId: ctx.user.id } });
    if (!own) throw notFound('Cadastro de barbeiro não encontrado.');
    if (barberId && barberId !== own.id) throw forbidden('Você só pode consultar o seu próprio financeiro.');
    id = own.id;
  }
  if (!id) throw badRequest('Informe o barbeiro.');
  const barber = await prisma.barber.findFirst({ where: { id, companyId: ctx.user.companyId }, include: { units: { include: { unit: { select: { id: true, name: true } } } } } });
  if (!barber) throw notFound('Barbeiro não encontrado.');
  if (unitId && !ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
  const units = unitId ? [unitId] : ctx.unitIds;
  if (ctx.user.role !== 'OWNER' && ctx.user.role !== 'BARBER' && !barber.units.some((l) => units.includes(l.unitId))) {
    throw notFound('Barbeiro não encontrado.');
  }
  const { start, end } = periodRange(from, to);

  const items = await prisma.saleItem.findMany({
    where: { barberId: id, sale: { status: 'CLOSED', unitId: { in: units }, closedAt: { gte: start, lt: end } } },
    include: { sale: { select: { id: true, closedAt: true, unit: { select: { name: true } } } } },
    orderBy: { sale: { closedAt: 'asc' } },
  });
  const services = items.filter((i) => i.kind === 'SERVICE');
  const products = items.filter((i) => i.kind === 'PRODUCT');
  const gross = (list) => sum(list.map((i) => dec(i.unitPrice).times(i.quantity)));

  const obligations = (
    await prisma.barberObligation.findMany({
      where: { barberId: id, unitId: { in: units }, createdAt: { gte: start, lt: end } },
      include: obligationInclude,
      orderBy: { createdAt: 'asc' },
    })
  ).map(decorate);

  // Pendências anteriores ao período também aparecem no saldo pendente total.
  const openBefore = (
    await prisma.barberObligation.findMany({
      where: { barberId: id, unitId: { in: units }, createdAt: { lt: start }, status: { in: ['OPEN', 'PARTIAL'] } },
      include: obligationInclude,
    })
  ).map(decorate);

  const active = obligations.filter((o) => o.status !== 'CANCELLED');
  const by = (pred) => active.filter(pred);
  const total = (list, f = 'amount') => sum(list.map((o) => (f === 'pending' ? dec(o.pending) : dec(o[f]))));
  const payable = (o) => o.direction === 'PAYABLE_TO_BARBER';
  const receivable = (o) => o.direction === 'RECEIVABLE_FROM_BARBER';

  const payouts = await prisma.barberPayout.findMany({
    where: { barberId: id, unitId: { in: units }, paidAt: { gte: start, lt: end } },
    include: { account: { select: { name: true } }, unit: { select: { name: true } } },
    orderBy: { paidAt: 'asc' },
  });

  const s = (v) => v.toFixed(2);
  return {
    barber: { id: barber.id, name: barber.name, units: barber.units.map((l) => ({ id: l.unit.id, name: l.unit.name, model: l.compensationModel, isActive: l.isActive })) },
    period: { from, to },
    summary: {
      servicesCount: services.reduce((n, i) => n + i.quantity, 0),
      productsCount: products.reduce((n, i) => n + i.quantity, 0),
      servicesRevenue: s(sum(services.map((i) => i.total))),
      productsRevenue: s(sum(products.map((i) => i.total))),
      revenue: s(sum(items.map((i) => i.total))),
      discounts: s(gross(items).minus(sum(items.map((i) => i.total)))),
      commissions: s(total(by((o) => o.type === 'COMMISSION'))),
      fixed: s(total(by((o) => o.type === 'FIXED_SALARY'))),
      bonuses: s(total(by((o) => o.type === 'BONUS' && payable(o)))),
      adjustments: s(total(by((o) => o.type === 'ADJUSTMENT' && payable(o))).minus(total(by((o) => o.type === 'ADJUSTMENT' && receivable(o))))),
      calculated: s(total(by(payable))),
      due: s(total(by((o) => payable(o) && o.due))),
      paid: s(total(by(payable), 'settledAmount')),
      pending: s(total(by((o) => payable(o) && o.due), 'pending')),
      notYetDue: s(total(by((o) => payable(o) && !o.due), 'pending')),
      pendingBefore: s(total(openBefore.filter((o) => payable(o) && o.due), 'pending')),
      chairRentDue: s(total(by(receivable))),
      chairRentPaid: s(total(by(receivable), 'settledAmount')),
      chairRentPending: s(total(by(receivable), 'pending')),
    },
    items: items.map((i) => ({
      id: i.id, saleId: i.sale.id, date: i.sale.closedAt, unit: i.sale.unit.name, kind: i.kind, description: i.description,
      quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount, total: i.total, commissionPct: i.commissionPct, commissionAmount: i.commissionAmount,
    })),
    obligations,
    payouts,
  };
}
