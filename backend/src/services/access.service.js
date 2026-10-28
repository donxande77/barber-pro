import { prisma } from '../db/prisma.js';
import { forbidden, notFound } from '../utils/errors.js';

/**
 * Retorna os IDs das unidades que o usuário pode acessar.
 * - OWNER: todas as unidades da empresa.
 * - MANAGER / RECEPTIONIST: unidades concedidas em UserUnitAccess.
 * - BARBER: unidades com vínculo ativo (BarberUnit).
 * O resultado é memorizado na requisição (req.ctx) pelo middleware de autenticação.
 */
export async function getAccessibleUnitIds(user, db = prisma) {
  if (user.role === 'OWNER') {
    const units = await db.unit.findMany({ where: { companyId: user.companyId }, select: { id: true } });
    return units.map((u) => u.id);
  }
  if (user.role === 'BARBER') {
    const barber = await db.barber.findUnique({
      where: { userId: user.id },
      select: { companyId: true, units: { where: { isActive: true }, select: { unitId: true } } },
    });
    if (!barber || barber.companyId !== user.companyId) return [];
    return barber.units.map((u) => u.unitId);
  }
  const rows = await db.userUnitAccess.findMany({
    where: { userId: user.id, unit: { companyId: user.companyId } },
    select: { unitId: true },
  });
  return rows.map((r) => r.unitId);
}

/** Garante que a unidade existe na empresa do usuário e está no escopo dele. */
export async function assertUnitAccess(ctx, unitId) {
  const unit = await prisma.unit.findFirst({ where: { id: unitId, companyId: ctx.user.companyId } });
  // Mesma resposta para "não existe" e "é de outra empresa": não revela existência de dados alheios.
  if (!unit) throw notFound('Unidade não encontrada.');
  if (!ctx.unitIds.includes(unitId)) throw forbidden('Você não tem acesso a esta unidade.');
  return unit;
}

/** Filtra uma lista de unidades pedida pelo cliente, ou devolve o escopo inteiro. */
export function scopeUnitIds(ctx, requested) {
  if (!requested || requested.length === 0) return ctx.unitIds;
  const outside = requested.filter((id) => !ctx.unitIds.includes(id));
  if (outside.length) throw forbidden('Você não tem acesso a uma ou mais unidades informadas.');
  return requested;
}
