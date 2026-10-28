import { prisma } from '../db/prisma.js';
import { assertUnitAccess } from './access.service.js';
import { audit } from '../utils/audit.js';
import { forbidden } from '../utils/errors.js';

const include = { hours: { orderBy: { weekday: 'asc' } } };

export async function listUnits(ctx) {
  return prisma.unit.findMany({
    where: { companyId: ctx.user.companyId, id: { in: ctx.unitIds } },
    orderBy: { name: 'asc' },
    include,
  });
}

export async function getUnit(ctx, unitId) {
  await assertUnitAccess(ctx, unitId);
  return prisma.unit.findUnique({ where: { id: unitId }, include });
}

/** Cria a unidade, seus horários e a conta "Caixa" com o saldo inicial informado. */
export async function createUnit(ctx, data) {
  const { hours, openingCash, ...fields } = data;
  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.create({
      data: {
        ...fields,
        companyId: ctx.user.companyId,
        hours: { create: hours },
        accounts: { create: { name: 'Caixa', type: 'CASH', openingBalance: openingCash } },
      },
      include,
    });
    await audit({ ctx, action: 'unit.create', entity: 'Unit', entityId: unit.id, unitId: unit.id, after: unit }, tx);
    return unit;
  });
}

export async function updateUnit(ctx, unitId, data) {
  const before = await assertUnitAccess(ctx, unitId);
  if (data.status && ctx.user.role !== 'OWNER') throw forbidden('Somente o proprietário ativa ou desativa unidades.');
  const { hours, ...fields } = data;
  return prisma.$transaction(async (tx) => {
    if (hours) {
      await tx.unitHours.deleteMany({ where: { unitId } });
      if (hours.length) await tx.unitHours.createMany({ data: hours.map((h) => ({ ...h, unitId })) });
    }
    const unit = await tx.unit.update({ where: { id: unitId }, data: fields, include });
    await audit({ ctx, action: 'unit.update', entity: 'Unit', entityId: unitId, unitId, before, after: unit }, tx);
    return unit;
  });
}

export async function getCompany(ctx) {
  return prisma.company.findUnique({ where: { id: ctx.user.companyId } });
}

export async function updateCompany(ctx, data) {
  const before = await getCompany(ctx);
  const after = await prisma.company.update({ where: { id: ctx.user.companyId }, data });
  await audit({ ctx, action: 'company.update', entity: 'Company', entityId: after.id, before, after });
  return after;
}
