import { prisma } from '../db/prisma.js';
import { audit } from '../utils/audit.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { dec } from '../utils/money.js';

/** Preço vigente da oferta num instante (promoção, se ativa). */
export function effectivePrice(offer, at = new Date()) {
  if (offer.promoPrice != null && offer.promoStart && offer.promoEnd && at >= offer.promoStart && at < offer.promoEnd) {
    return { price: dec(offer.promoPrice), promo: true };
  }
  return { price: dec(offer.price), promo: false };
}

// ── Categorias ──
export const listCategories = (ctx) =>
  prisma.serviceCategory.findMany({ where: { companyId: ctx.user.companyId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });

export async function createCategory(ctx, data) {
  const c = await prisma.serviceCategory.create({ data: { ...data, companyId: ctx.user.companyId } });
  await audit({ ctx, action: 'category.create', entity: 'ServiceCategory', entityId: c.id });
  return c;
}

export async function updateCategory(ctx, id, data) {
  const c = await prisma.serviceCategory.findFirst({ where: { id, companyId: ctx.user.companyId } });
  if (!c) throw notFound('Categoria não encontrada.');
  return prisma.serviceCategory.update({ where: { id }, data });
}

export async function deleteCategory(ctx, id) {
  const c = await prisma.serviceCategory.findFirst({ where: { id, companyId: ctx.user.companyId } });
  if (!c) throw notFound('Categoria não encontrada.');
  await prisma.$transaction([
    prisma.service.updateMany({ where: { categoryId: id }, data: { categoryId: null } }),
    prisma.serviceCategory.delete({ where: { id } }),
  ]);
}

// ── Serviços ──
const serviceInclude = {
  category: true,
  offers: { include: { unit: { select: { id: true, name: true } } } },
  barbers: { select: { barberId: true } },
};
const shapeService = (s) => ({ ...s, barberIds: s.barbers.map((b) => b.barberId), barbers: undefined });

export async function listServices(ctx, { unitId } = {}) {
  const rows = await prisma.service.findMany({
    where: { companyId: ctx.user.companyId, ...(unitId ? { offers: { some: { unitId } } } : {}) },
    include: serviceInclude,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(shapeService);
}

async function loadService(ctx, id) {
  const s = await prisma.service.findFirst({ where: { id, companyId: ctx.user.companyId }, include: serviceInclude });
  if (!s) throw notFound('Serviço não encontrado.');
  return s;
}

export const getService = async (ctx, id) => shapeService(await loadService(ctx, id));

async function checkRefs(ctx, { categoryId, offers, barberIds }) {
  if (categoryId) {
    const c = await prisma.serviceCategory.findFirst({ where: { id: categoryId, companyId: ctx.user.companyId } });
    if (!c) throw badRequest('Categoria inválida.');
  }
  if (offers?.length) {
    const ids = offers.map((o) => o.unitId);
    if (new Set(ids).size !== ids.length) throw badRequest('Unidade repetida nas ofertas.');
    const n = await prisma.unit.count({ where: { id: { in: ids }, companyId: ctx.user.companyId } });
    if (n !== ids.length) throw badRequest('Unidade inválida.');
    if (ids.some((u) => !ctx.unitIds.includes(u))) throw forbidden('Você só pode definir preços para as suas unidades.');
  }
  if (barberIds?.length) {
    const n = await prisma.barber.count({ where: { id: { in: barberIds }, companyId: ctx.user.companyId } });
    if (n !== new Set(barberIds).size) throw badRequest('Barbeiro inválido.');
  }
}

export async function createService(ctx, data) {
  const { offers, barberIds = [], ...fields } = data;
  await checkRefs(ctx, data);
  const s = await prisma.service.create({
    data: {
      ...fields,
      companyId: ctx.user.companyId,
      offers: { create: offers },
      barbers: { create: barberIds.map((barberId) => ({ barberId })) },
    },
    include: serviceInclude,
  });
  await audit({ ctx, action: 'service.create', entity: 'Service', entityId: s.id, after: s });
  return shapeService(s);
}

/**
 * Atualiza o serviço. Campos gerais (nome, imagem, comissão padrão) são do proprietário;
 * gerentes ajustam preço/duração/promoção apenas das próprias unidades.
 * Alterar preço não afeta agendamentos e vendas já registrados (eles guardam cópia do valor).
 */
export async function updateService(ctx, id, data) {
  const before = await loadService(ctx, id);
  const { offers, barberIds, ...fields } = data;
  if (ctx.user.role !== 'OWNER' && Object.keys(fields).length) {
    throw forbidden('Somente o proprietário altera nome, descrição, imagem, categoria e comissão padrão.');
  }
  await checkRefs(ctx, data);
  const s = await prisma.$transaction(async (tx) => {
    if (offers) {
      for (const o of offers) {
        await tx.serviceUnit.upsert({
          where: { serviceId_unitId: { serviceId: id, unitId: o.unitId } },
          update: { ...o, promoPrice: o.promoPrice ?? null, promoStart: o.promoStart ?? null, promoEnd: o.promoEnd ?? null },
          create: { ...o, serviceId: id },
        });
      }
      // Ofertas de unidades do escopo que saíram da lista ficam inativas.
      const keep = offers.map((o) => o.unitId);
      await tx.serviceUnit.updateMany({
        where: { serviceId: id, unitId: { in: ctx.unitIds, notIn: keep } },
        data: { isActive: false },
      });
    }
    if (barberIds) {
      await tx.barberService.deleteMany({ where: { serviceId: id } });
      if (barberIds.length) await tx.barberService.createMany({ data: barberIds.map((barberId) => ({ barberId, serviceId: id })) });
    }
    const updated = await tx.service.update({ where: { id }, data: fields, include: serviceInclude });
    await audit({ ctx, action: 'service.update', entity: 'Service', entityId: id, before, after: updated }, tx);
    return updated;
  });
  return shapeService(s);
}

// ── Produtos ──
const productInclude = { stocks: { include: { unit: { select: { id: true, name: true } } } } };

export async function listProducts(ctx, { unitId } = {}) {
  const rows = await prisma.product.findMany({
    where: { companyId: ctx.user.companyId },
    include: productInclude,
    orderBy: { name: 'asc' },
  });
  return rows.map((p) => ({
    ...p,
    stocks: p.stocks.filter((s) => ctx.unitIds.includes(s.unitId) && (!unitId || s.unitId === unitId)),
  }));
}

async function loadProduct(ctx, id, db = prisma) {
  const p = await db.product.findFirst({ where: { id, companyId: ctx.user.companyId }, include: productInclude });
  if (!p) throw notFound('Produto não encontrado.');
  return p;
}

export async function createProduct(ctx, data) {
  const p = await prisma.product.create({ data: { ...data, companyId: ctx.user.companyId }, include: productInclude });
  await audit({ ctx, action: 'product.create', entity: 'Product', entityId: p.id, after: p });
  return p;
}

export async function updateProduct(ctx, id, data) {
  const before = await loadProduct(ctx, id);
  const p = await prisma.product.update({ where: { id }, data, include: productInclude });
  await audit({ ctx, action: 'product.update', entity: 'Product', entityId: id, before, after: p });
  return p;
}

/**
 * Movimenta estoque. Usa UPDATE condicional para não deixar o saldo negativo,
 * mesmo com duas baixas simultâneas.
 */
export async function moveStock(tx, { productId, unitId, type, quantity, reason, unitCost, saleItemId, transferRef, userId }) {
  await tx.productStock.upsert({
    where: { productId_unitId: { productId, unitId } },
    update: {},
    create: { productId, unitId, quantity: 0 },
  });
  const outgoing = ['OUT', 'SALE', 'TRANSFER_OUT'].includes(type);
  if (outgoing) {
    const n = await tx.$executeRaw`
      UPDATE "ProductStock" SET quantity = quantity - ${quantity}
      WHERE "productId" = ${productId}::uuid AND "unitId" = ${unitId}::uuid AND quantity >= ${quantity}`;
    if (n === 0) throw badRequest('Estoque insuficiente.');
  } else {
    await tx.productStock.update({ where: { productId_unitId: { productId, unitId } }, data: { quantity: { increment: quantity } } });
  }
  return tx.stockMovement.create({
    data: { productId, unitId, type, quantity, reason, unitCost, saleItemId, transferRef, createdById: userId },
  });
}

export async function adjustStock(ctx, productId, { unitId, type, quantity, unitCost, reason, minQuantity }) {
  await loadProduct(ctx, productId);
  if (!ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
  await prisma.$transaction(async (tx) => {
    const stock = await tx.productStock.upsert({
      where: { productId_unitId: { productId, unitId } },
      update: minQuantity != null ? { minQuantity } : {},
      create: { productId, unitId, quantity: 0, minQuantity: minQuantity ?? 0 },
    });
    if (type === 'ADJUSTMENT') {
      // Ajuste de inventário: informa a quantidade contada; registra a diferença.
      const diff = quantity - stock.quantity;
      if (diff !== 0) {
        await moveStock(tx, {
          productId, unitId, type: diff > 0 ? 'IN' : 'OUT', quantity: Math.abs(diff),
          reason: `Ajuste de inventário${reason ? `: ${reason}` : ''}`, userId: ctx.user.id,
        });
      }
    } else if (quantity > 0) {
      await moveStock(tx, { productId, unitId, type, quantity, unitCost, reason, userId: ctx.user.id });
    }
    await audit({ ctx, action: 'stock.move', entity: 'Product', entityId: productId, unitId, after: { type, quantity, reason } }, tx);
  });
  return loadProduct(ctx, productId);
}

export async function transferStock(ctx, productId, { fromUnitId, toUnitId, quantity, reason }) {
  await loadProduct(ctx, productId);
  if (!ctx.unitIds.includes(fromUnitId) || !ctx.unitIds.includes(toUnitId)) throw forbidden('Você precisa ter acesso às duas unidades.');
  const ref = crypto.randomUUID();
  await prisma.$transaction(async (tx) => {
    await moveStock(tx, { productId, unitId: fromUnitId, type: 'TRANSFER_OUT', quantity, reason, transferRef: ref, userId: ctx.user.id });
    await moveStock(tx, { productId, unitId: toUnitId, type: 'TRANSFER_IN', quantity, reason, transferRef: ref, userId: ctx.user.id });
    await audit({ ctx, action: 'stock.transfer', entity: 'Product', entityId: productId, after: { fromUnitId, toUnitId, quantity } }, tx);
  });
  return loadProduct(ctx, productId);
}

export async function listStockMovements(ctx, productId, { unitId }) {
  await loadProduct(ctx, productId);
  return prisma.stockMovement.findMany({
    where: { productId, unitId: unitId ? (ctx.unitIds.includes(unitId) ? unitId : '00000000-0000-0000-0000-000000000000') : { in: ctx.unitIds } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { unit: { select: { name: true } } },
  });
}
