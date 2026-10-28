import { prisma } from '../db/prisma.js';
import { assertUnitAccess } from './access.service.js';

// Fase 1: leitura com escopo. O CRUD completo de unidades entra na Fase 2.

export async function listUnits(ctx) {
  return prisma.unit.findMany({
    where: { companyId: ctx.user.companyId, id: { in: ctx.unitIds } },
    orderBy: { name: 'asc' },
  });
}

export async function getUnit(ctx, unitId) {
  await assertUnitAccess(ctx, unitId);
  return prisma.unit.findUnique({ where: { id: unitId }, include: { hours: { orderBy: { weekday: 'asc' } } } });
}
