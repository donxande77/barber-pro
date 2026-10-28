import { prisma } from '../db/prisma.js';
import { audit } from '../utils/audit.js';
import { randomToken } from '../utils/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { D, dec, money, sum, toMoneyString } from '../utils/money.js';
import { periodRange } from '../utils/time.js';
import { effectivePrice, moveStock } from './catalog.service.js';
import { accrueCommissions } from './compensation.service.js';

const include = {
  items: { include: { barber: { select: { id: true, name: true } } }, orderBy: { id: 'asc' } },
  payments: { include: { account: { select: { name: true } } }, orderBy: { paidAt: 'asc' } },
  client: { select: { id: true, name: true, phone: true } },
  unit: { select: { id: true, name: true, timezone: true } },
  appointment: { select: { id: true, startsAt: true, status: true, reviewToken: true } },
};

/** Acrescenta saldo recebido e saldo a receber, calculados com decimal. */
export function withBalance(sale) {
  const paid = sum(sale.payments.filter((p) => p.status === 'CONFIRMED').map((p) => p.amount));
  const total = dec(sale.total);
  const due = D.max(total.minus(paid), 0);
  return {
    ...sale,
    paidAmount: paid.toFixed(2),
    balanceDue: due.toFixed(2),
    paymentStatus: sale.status !== 'CLOSED' ? null : paid.gte(total) ? 'PAID' : paid.gt(0) ? 'PARTIAL' : 'UNPAID',
  };
}

async function loadSale(ctx, id, db = prisma) {
  const s = await db.sale.findFirst({ where: { id, unitId: { in: ctx.unitIds } }, include });
  if (!s) throw notFound('Venda não encontrada.');
  return s;
}

export const getSale = async (ctx, id) => withBalance(await loadSale(ctx, id));

export async function listSales(ctx, { unitId, from, to, status, barberId }) {
  if (unitId && !ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
  const { start, end } = periodRange(from, to);
  const rows = await prisma.sale.findMany({
    where: {
      unitId: unitId ?? { in: ctx.unitIds },
      createdAt: { gte: start, lt: end },
      ...(status ? { status } : {}),
      ...(barberId ? { items: { some: { barberId } } } : {}),
    },
    include,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return rows.map(withBalance);
}

async function recalc(tx, saleId) {
  const items = await tx.saleItem.findMany({ where: { saleId } });
  const subtotal = sum(items.map((i) => i.total));
  await tx.sale.update({ where: { id: saleId }, data: { subtotal: toMoneyString(subtotal), total: toMoneyString(subtotal) } });
}

/** Monta um item com preço e custo copiados do cadastro no momento (snapshot). */
async function buildItem(tx, sale, { kind, serviceId, productId, barberId, quantity = 1, discount = '0' }) {
  if (barberId) {
    const link = await tx.barberUnit.findFirst({ where: { barberId, unitId: sale.unitId } });
    if (!link) throw badRequest('O profissional não é vinculado a esta unidade.');
  }
  let description, unitPrice, unitCost = null;
  if (kind === 'SERVICE') {
    if (!serviceId) throw badRequest('Informe o serviço.');
    const offer = await tx.serviceUnit.findFirst({ where: { serviceId, unitId: sale.unitId }, include: { service: true } });
    if (!offer || offer.service.companyId !== sale.companyId) throw badRequest('Serviço não oferecido nesta unidade.');
    if (!barberId) throw badRequest('Informe o profissional que realizou o serviço.');
    description = offer.service.name;
    unitPrice = effectivePrice(offer).price;
  } else {
    if (!productId) throw badRequest('Informe o produto.');
    const p = await tx.product.findFirst({ where: { id: productId, companyId: sale.companyId, status: 'ACTIVE' } });
    if (!p) throw badRequest('Produto inválido.');
    description = p.name;
    unitPrice = dec(p.price);
    unitCost = dec(p.cost);
  }
  const gross = money(unitPrice.times(quantity));
  const disc = money(discount);
  if (disc.gt(gross)) throw badRequest('O desconto não pode ser maior que o valor do item.');
  return {
    kind,
    serviceId: kind === 'SERVICE' ? serviceId : null,
    productId: kind === 'PRODUCT' ? productId : null,
    barberId: barberId ?? null,
    description,
    quantity,
    unitPrice: toMoneyString(unitPrice),
    unitCost: unitCost ? toMoneyString(unitCost) : null,
    discount: toMoneyString(disc),
    total: toMoneyString(gross.minus(disc)),
  };
}

/** Abre uma venda avulsa ou o atendimento de um agendamento (itens vêm do agendamento). */
export async function createSale(ctx, { unitId, clientId, appointmentId, items = [] }) {
  if (!ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  try {
    return await prisma.$transaction(async (tx) => {
      let appt = null;
      if (appointmentId) {
        appt = await tx.appointment.findFirst({ where: { id: appointmentId, unitId }, include: { items: true, sale: true } });
        if (!appt) throw badRequest('Agendamento inválido.');
        if (appt.sale && appt.sale.status !== 'CANCELLED') throw conflict('Este agendamento já tem um atendimento aberto.');
        if (!['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'].includes(appt.status)) throw badRequest('Agendamento cancelado ou já concluído.');
        if (appt.sale) await tx.sale.update({ where: { id: appt.sale.id }, data: { appointmentId: null } }); // libera o vínculo único
        await tx.appointment.update({ where: { id: appt.id }, data: { status: 'CHECKED_IN' } });
      }
      if (clientId && !(await tx.client.findFirst({ where: { id: clientId, companyId: ctx.user.companyId } }))) throw badRequest('Cliente inválido.');
      const sale = await tx.sale.create({
        data: { unitId, clientId: clientId ?? appt?.clientId ?? null, appointmentId: appt?.id ?? null, createdById: ctx.user.id },
      });
      const ctxSale = { ...sale, companyId: unit.companyId };
      // Atendimento: mantém o preço combinado no agendamento.
      for (const ai of appt?.items ?? []) {
        await tx.saleItem.create({
          data: {
            saleId: sale.id, kind: 'SERVICE', serviceId: ai.serviceId, barberId: appt.barberId, description: ai.serviceName,
            quantity: 1, unitPrice: ai.price, discount: '0', total: ai.price,
          },
        });
      }
      for (const it of items) await tx.saleItem.create({ data: { ...(await buildItem(tx, ctxSale, it)), saleId: sale.id } });
      await recalc(tx, sale.id);
      await audit({ ctx, action: 'sale.create', entity: 'Sale', entityId: sale.id, unitId, after: { appointmentId } }, tx);
      return sale.id;
    }).then((id) => getSale(ctx, id));
  } catch (e) {
    if (e?.code === 'P2002') throw conflict('Este agendamento já tem um atendimento.');
    throw e;
  }
}

export async function addItem(ctx, saleId, data) {
  const sale = await loadSale(ctx, saleId);
  if (sale.status !== 'OPEN') throw badRequest('Só é possível alterar vendas abertas.');
  const companyId = ctx.user.companyId;
  await prisma.$transaction(async (tx) => {
    await tx.saleItem.create({ data: { ...(await buildItem(tx, { ...sale, companyId }, data)), saleId } });
    await recalc(tx, saleId);
  });
  return getSale(ctx, saleId);
}

export async function updateItem(ctx, saleId, itemId, { discount, barberId, quantity }) {
  const sale = await loadSale(ctx, saleId);
  if (sale.status !== 'OPEN') throw badRequest('Só é possível alterar vendas abertas.');
  const item = sale.items.find((i) => i.id === itemId);
  if (!item) throw notFound('Item não encontrado.');
  if (barberId) {
    const link = await prisma.barberUnit.findFirst({ where: { barberId, unitId: sale.unitId } });
    if (!link) throw badRequest('O profissional não é vinculado a esta unidade.');
  }
  const q = quantity ?? item.quantity;
  const gross = money(dec(item.unitPrice).times(q));
  const disc = money(discount ?? item.discount);
  if (disc.gt(gross)) throw badRequest('O desconto não pode ser maior que o valor do item.');
  await prisma.$transaction(async (tx) => {
    await tx.saleItem.update({
      where: { id: itemId },
      data: { quantity: q, discount: toMoneyString(disc), total: toMoneyString(gross.minus(disc)), ...(barberId ? { barberId } : {}) },
    });
    await recalc(tx, saleId);
  });
  return getSale(ctx, saleId);
}

export async function removeItem(ctx, saleId, itemId) {
  const sale = await loadSale(ctx, saleId);
  if (sale.status !== 'OPEN') throw badRequest('Só é possível alterar vendas abertas.');
  if (!sale.items.some((i) => i.id === itemId)) throw notFound('Item não encontrado.');
  await prisma.$transaction(async (tx) => {
    await tx.saleItem.delete({ where: { id: itemId } });
    await recalc(tx, saleId);
  });
  return getSale(ctx, saleId);
}

/**
 * Fecha a venda: baixa estoque, calcula comissões com as regras vigentes agora (snapshot)
 * e conclui o agendamento. Fechar NÃO significa receber — o recebimento é registrado em pagamentos.
 */
export async function closeSale(ctx, saleId) {
  await prisma.$transaction(async (tx) => {
    // Trava a venda para que dois cliques simultâneos não fechem duas vezes.
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId}::uuid FOR UPDATE`;
    const sale = await tx.sale.findFirst({
      where: { id: saleId, unitId: { in: ctx.unitIds } },
      include: { items: { include: { service: true, product: true } } },
    });
    if (!sale) throw notFound('Venda não encontrada.');
    if (sale.status !== 'OPEN') throw badRequest('Esta venda já foi fechada ou cancelada.');
    if (!sale.items.length) throw badRequest('Adicione ao menos um item.');
    const closedAt = new Date();
    for (const item of sale.items.filter((i) => i.kind === 'PRODUCT')) {
      await moveStock(tx, { productId: item.productId, unitId: sale.unitId, type: 'SALE', quantity: item.quantity, saleItemId: item.id, unitCost: item.unitCost, userId: ctx.user.id });
    }
    await tx.sale.update({ where: { id: saleId }, data: { status: 'CLOSED', closedAt } });
    await accrueCommissions(tx, { ...sale, closedAt }, ctx);
    if (sale.appointmentId) {
      await tx.appointment.update({ where: { id: sale.appointmentId }, data: { status: 'COMPLETED', reviewToken: randomToken(24) } });
    }
    await audit({ ctx, action: 'sale.close', entity: 'Sale', entityId: saleId, unitId: sale.unitId, after: { total: sale.total } }, tx);
  });
  return getSale(ctx, saleId);
}

/** Registra um recebimento (parcial ou total). Repetir com a mesma chave de idempotência não duplica. */
export async function addPayment(ctx, saleId, { accountId, method, amount, idempotencyKey }) {
  if (idempotencyKey) {
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.saleId !== saleId) throw conflict('Chave de idempotência já usada em outra venda.');
      return getSale(ctx, saleId);
    }
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId}::uuid FOR UPDATE`;
      const sale = await loadSale(ctx, saleId, tx);
      if (sale.status !== 'CLOSED') throw badRequest('Feche a venda antes de registrar o pagamento.');
      const account = await tx.financialAccount.findFirst({ where: { id: accountId, unitId: sale.unitId, status: 'ACTIVE' } });
      if (!account) throw badRequest('Conta inválida para esta unidade.');
      const { balanceDue } = withBalance(sale);
      const value = money(amount);
      if (value.gt(dec(balanceDue))) throw badRequest(`O valor excede o saldo a receber (R$ ${balanceDue}).`);
      const payment = await tx.payment.create({
        data: { saleId, accountId, method, amount: toMoneyString(value), idempotencyKey, createdById: ctx.user.id },
      });
      await tx.financialTransaction.create({
        data: {
          unitId: sale.unitId, accountId, direction: 'IN', kind: 'SALE_PAYMENT', amount: toMoneyString(value),
          paymentId: payment.id, description: `Recebimento venda ${saleId.slice(0, 8)}`, createdById: ctx.user.id,
        },
      });
      await audit({ ctx, action: 'payment.create', entity: 'Payment', entityId: payment.id, unitId: sale.unitId, after: { saleId, amount: value.toFixed(2), method } }, tx);
    });
  } catch (e) {
    if (e?.code === 'P2002' && idempotencyKey) return getSale(ctx, saleId);
    throw e;
  }
  return getSale(ctx, saleId);
}

/**
 * Estorna um pagamento: nada é apagado. O pagamento fica REVERSED e é lançada uma movimentação
 * de saída ligada à original. Se a comissão já foi paga ao barbeiro, ela continua registrada
 * e deve ser compensada com um ajuste.
 */
export async function reversePayment(ctx, paymentId, { reason }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId}::uuid FOR UPDATE`;
    const p = await tx.payment.findFirst({
      where: { id: paymentId, sale: { unitId: { in: ctx.unitIds } } },
      include: { sale: true, transactions: true },
    });
    if (!p) throw notFound('Pagamento não encontrado.');
    if (p.status === 'REVERSED') throw badRequest('Pagamento já estornado.');
    const original = p.transactions.find((t) => t.kind === 'SALE_PAYMENT');
    await tx.payment.update({ where: { id: paymentId }, data: { status: 'REVERSED', reversedAt: new Date(), reversalReason: reason } });
    await tx.financialTransaction.create({
      data: {
        unitId: p.sale.unitId, accountId: p.accountId, direction: 'OUT', kind: 'REVERSAL', amount: p.amount,
        paymentId, reversalOfId: original?.id, description: `Estorno: ${reason}`, createdById: ctx.user.id,
      },
    });
    await audit({ ctx, action: 'payment.reverse', entity: 'Payment', entityId: paymentId, unitId: p.sale.unitId, after: { reason } }, tx);
    return p.saleId;
  }).then((saleId) => getSale(ctx, saleId));
}

/**
 * Cancela a venda. Venda fechada só pode ser cancelada sem pagamentos ativos (estorne antes);
 * devolve o estoque e cancela as comissões ainda não pagas.
 */
export async function cancelSale(ctx, saleId, { reason }) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId}::uuid FOR UPDATE`;
    const sale = await loadSale(ctx, saleId, tx);
    if (sale.status === 'CANCELLED') throw badRequest('Venda já cancelada.');
    if (sale.payments.some((p) => p.status === 'CONFIRMED')) throw badRequest('Estorne os pagamentos antes de cancelar a venda.');
    if (sale.status === 'CLOSED') {
      const obligations = await tx.barberObligation.findMany({ where: { saleItemId: { in: sale.items.map((i) => i.id) }, cancelledAt: null } });
      if (obligations.some((o) => dec(o.settledAmount).gt(0))) {
        throw badRequest('Há comissão desta venda já paga ao profissional. Lance um ajuste antes de cancelar.');
      }
      await tx.barberObligation.updateMany({
        where: { id: { in: obligations.map((o) => o.id) } },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      for (const item of sale.items.filter((i) => i.kind === 'PRODUCT')) {
        await moveStock(tx, { productId: item.productId, unitId: sale.unitId, type: 'SALE_REVERSAL', quantity: item.quantity, saleItemId: item.id, reason: `Cancelamento: ${reason}`, userId: ctx.user.id });
      }
    }
    if (sale.appointmentId && sale.appointment?.status !== 'CANCELLED') {
      await tx.appointment.update({ where: { id: sale.appointmentId }, data: { status: sale.status === 'CLOSED' ? 'CANCELLED' : 'CONFIRMED', reviewToken: null, ...(sale.status === 'CLOSED' ? { cancelledAt: new Date(), cancelReason: `Venda cancelada: ${reason}` } : {}) } });
    }
    await tx.sale.update({ where: { id: saleId }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } });
    await audit({ ctx, action: 'sale.cancel', entity: 'Sale', entityId: saleId, unitId: sale.unitId, after: { reason } }, tx);
  });
  return getSale(ctx, saleId);
}
