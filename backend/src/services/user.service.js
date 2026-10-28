import { prisma } from '../db/prisma.js';
import { hashPassword } from '../utils/crypto.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { MANAGEABLE_ROLES } from './permissions.js';
import { revokeAllSessions } from './auth.service.js';

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  unitAccess: { select: { unitId: true } },
  barber: { select: { id: true } },
};

export function toPublicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    unitIds: u.unitAccess?.map((a) => a.unitId) ?? [],
    barberId: u.barber?.id ?? null,
  };
}

/** Unidades informadas precisam pertencer à empresa e estar no escopo de quem está editando. */
async function checkUnits(ctx, unitIds) {
  if (!unitIds?.length) return;
  const count = await prisma.unit.count({ where: { id: { in: unitIds }, companyId: ctx.user.companyId } });
  if (count !== new Set(unitIds).size) throw badRequest('Uma ou mais unidades não existem.');
  const outside = unitIds.filter((id) => !ctx.unitIds.includes(id));
  if (outside.length) throw forbidden('Você só pode conceder acesso às suas unidades.');
}

function assertCanManageRole(ctx, targetRole) {
  if (!MANAGEABLE_ROLES[ctx.user.role].includes(targetRole)) {
    throw forbidden('Você não pode criar ou alterar usuários com esta função.');
  }
}

/** Um gerente só enxerga/gerencia usuários que compartilham ao menos uma de suas unidades. */
async function loadManageableUser(ctx, id) {
  const user = await prisma.user.findFirst({
    where: { id, companyId: ctx.user.companyId },
    select: { ...publicUserSelect, companyId: true },
  });
  if (!user) throw notFound('Usuário não encontrado.');
  if (ctx.user.role !== 'OWNER') {
    assertCanManageRole(ctx, user.role);
    const ids = user.unitAccess.map((a) => a.unitId);
    if (!ids.some((uid) => ctx.unitIds.includes(uid))) throw notFound('Usuário não encontrado.');
  }
  return user;
}

export async function listUsers(ctx, { role, unitId }) {
  const where = { companyId: ctx.user.companyId };
  if (role) where.role = role;
  if (ctx.user.role !== 'OWNER') {
    where.role = role && MANAGEABLE_ROLES[ctx.user.role].includes(role) ? role : { in: MANAGEABLE_ROLES[ctx.user.role] };
    where.unitAccess = { some: { unitId: { in: unitId ? [unitId].filter((u) => ctx.unitIds.includes(u)) : ctx.unitIds } } };
  } else if (unitId) {
    where.unitAccess = { some: { unitId } };
  }
  const users = await prisma.user.findMany({ where, select: publicUserSelect, orderBy: { name: 'asc' } });
  return users.map(toPublicUser);
}

export async function getUser(ctx, id) {
  return toPublicUser(await loadManageableUser(ctx, id));
}

export async function createUser(ctx, data) {
  assertCanManageRole(ctx, data.role);
  if (data.role !== 'OWNER' && data.unitIds.length === 0) {
    throw badRequest('Informe ao menos uma unidade para este usuário.');
  }
  await checkUnits(ctx, data.unitIds);

  const passwordHash = await hashPassword(data.password);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        companyId: ctx.user.companyId,
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role,
        unitAccess: data.role === 'OWNER' ? undefined : { create: data.unitIds.map((unitId) => ({ unitId })) },
      },
      select: publicUserSelect,
    });
    await audit({ ctx, action: 'user.create', entity: 'User', entityId: user.id, after: toPublicUser(user) }, tx);
    return toPublicUser(user);
  });
}

export async function updateUser(ctx, id, data) {
  const before = await loadManageableUser(ctx, id);
  if (id === ctx.user.id && (data.role || data.status === 'INACTIVE')) {
    throw badRequest('Você não pode alterar a própria função nem desativar a própria conta.');
  }
  if (data.role) assertCanManageRole(ctx, data.role);
  if (data.role === 'OWNER') data.unitIds = [];
  if (data.unitIds) {
    await checkUnits(ctx, data.unitIds);
    // Gerente não pode remover acessos a unidades que ele mesmo não gerencia.
    if (ctx.user.role !== 'OWNER') {
      const keepOutside = before.unitAccess.map((a) => a.unitId).filter((u) => !ctx.unitIds.includes(u));
      data.unitIds = [...new Set([...data.unitIds, ...keepOutside])];
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (data.unitIds) {
      await tx.userUnitAccess.deleteMany({ where: { userId: id } });
      if (data.unitIds.length) {
        await tx.userUnitAccess.createMany({ data: data.unitIds.map((unitId) => ({ userId: id, unitId })) });
      }
    }
    const u = await tx.user.update({
      where: { id },
      data: { name: data.name, role: data.role, status: data.status },
      select: publicUserSelect,
    });
    await audit({ ctx, action: 'user.update', entity: 'User', entityId: id, before: toPublicUser(before), after: toPublicUser(u) }, tx);
    return u;
  });

  // Mudou a função ou foi desativado: derruba as sessões abertas para valer imediatamente.
  // (Mudanças de unidade já valem na próxima requisição, pois o escopo é recalculado a cada uma.)
  if (data.role || data.status === 'INACTIVE') await revokeAllSessions(id);
  return toPublicUser(updated);
}
