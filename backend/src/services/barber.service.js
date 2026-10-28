import { prisma } from '../db/prisma.js';
import { audit } from '../utils/audit.js';
import { hashPassword } from '../utils/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { revokeAllSessions } from './auth.service.js';

const include = {
  units: { include: { unit: { select: { id: true, name: true } }, schedules: { orderBy: { weekday: 'asc' } } } },
  services: { select: { serviceId: true } },
  user: { select: { id: true, email: true, status: true } },
};

function shape(b) {
  return {
    ...b,
    serviceIds: b.services?.map((s) => s.serviceId) ?? [],
    services: undefined,
    login: b.user ? { email: b.user.email, status: b.user.status } : null,
    user: undefined,
  };
}

/** Barbeiros visíveis: proprietário vê todos; demais, os vinculados às suas unidades. */
function scopeWhere(ctx) {
  const where = { companyId: ctx.user.companyId };
  if (ctx.user.role !== 'OWNER') where.units = { some: { unitId: { in: ctx.unitIds } } };
  return where;
}

export async function listBarbers(ctx, { unitId } = {}) {
  const where = scopeWhere(ctx);
  if (unitId) {
    if (!ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
    where.units = { some: { unitId } };
  }
  const rows = await prisma.barber.findMany({ where, include, orderBy: { name: 'asc' } });
  return rows.map(shape);
}

export async function loadBarber(ctx, id, db = prisma) {
  const b = await db.barber.findFirst({ where: { id, ...scopeWhere(ctx) }, include });
  if (!b) throw notFound('Barbeiro não encontrado.');
  return b;
}

export async function getBarber(ctx, id) {
  const b = await loadBarber(ctx, id);
  const timeOffs = await prisma.barberTimeOff.findMany({
    where: { barberId: id, endsAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    orderBy: { startsAt: 'asc' },
  });
  return { ...shape(b), timeOffs };
}

async function checkServices(ctx, serviceIds) {
  if (!serviceIds?.length) return;
  const n = await prisma.service.count({ where: { id: { in: serviceIds }, companyId: ctx.user.companyId } });
  if (n !== new Set(serviceIds).size) throw badRequest('Serviço inválido.');
}

async function checkUnits(ctx, units) {
  if (!units?.length) return;
  const ids = units.map((u) => u.unitId);
  if (new Set(ids).size !== ids.length) throw badRequest('Unidade repetida.');
  const n = await prisma.unit.count({ where: { id: { in: ids }, companyId: ctx.user.companyId } });
  if (n !== ids.length) throw badRequest('Unidade inválida.');
  if (ids.some((id) => !ctx.unitIds.includes(id))) throw forbidden('Você só pode vincular barbeiros às suas unidades.');
}

export async function createBarber(ctx, data) {
  const { serviceIds, units, ...fields } = data;
  if (ctx.user.role !== 'OWNER' && units.length === 0) throw badRequest('Vincule o barbeiro a ao menos uma unidade.');
  await checkServices(ctx, serviceIds);
  await checkUnits(ctx, units);
  return prisma.$transaction(async (tx) => {
    const b = await tx.barber.create({
      data: {
        ...fields,
        companyId: ctx.user.companyId,
        services: { create: serviceIds.map((serviceId) => ({ serviceId })) },
        units: { create: units.map((u) => ({ unitId: u.unitId, compensationModel: u.compensationModel, isActive: u.isActive })) },
      },
      include,
    });
    await audit({ ctx, action: 'barber.create', entity: 'Barber', entityId: b.id, after: b }, tx);
    return shape(b);
  });
}

export async function updateBarber(ctx, id, data) {
  const before = await loadBarber(ctx, id);
  const { serviceIds, units, ...fields } = data;
  await checkServices(ctx, serviceIds);
  if (units) {
    await checkUnits(ctx, units);
    // Um gerente não altera vínculos com unidades que não administra.
    if (ctx.user.role !== 'OWNER') {
      const outside = before.units.filter((l) => !ctx.unitIds.includes(l.unitId));
      if (outside.length) units.push(...outside.map((l) => ({ unitId: l.unitId, compensationModel: l.compensationModel, isActive: l.isActive })));
    }
  }
  return prisma.$transaction(async (tx) => {
    if (serviceIds) {
      await tx.barberService.deleteMany({ where: { barberId: id } });
      if (serviceIds.length) await tx.barberService.createMany({ data: serviceIds.map((serviceId) => ({ barberId: id, serviceId })) });
    }
    if (units) {
      // Vínculos não são apagados (preservam escalas e histórico): os removidos são desativados.
      const keep = new Set(units.map((u) => u.unitId));
      for (const link of before.units) {
        if (!keep.has(link.unitId) && link.isActive) {
          await tx.barberUnit.update({ where: { id: link.id }, data: { isActive: false, endDate: new Date() } });
        }
      }
      for (const u of units) {
        await tx.barberUnit.upsert({
          where: { barberId_unitId: { barberId: id, unitId: u.unitId } },
          update: { compensationModel: u.compensationModel, isActive: u.isActive, ...(u.isActive ? { endDate: null } : {}) },
          create: { barberId: id, unitId: u.unitId, compensationModel: u.compensationModel, isActive: u.isActive },
        });
      }
    }
    const b = await tx.barber.update({ where: { id }, data: fields, include });
    await audit({ ctx, action: 'barber.update', entity: 'Barber', entityId: id, before, after: b }, tx);
    return shape(b);
  });
}

/** Cria ou redefine o acesso do barbeiro ao painel (usuário com função BARBEIRO). */
export async function setBarberLogin(ctx, id, { email, password }) {
  const b = await loadBarber(ctx, id);
  const passwordHash = await hashPassword(password);
  if (b.userId) {
    const other = await prisma.user.findUnique({ where: { email } });
    if (other && other.id !== b.userId) throw conflict('Este e-mail já está em uso.');
    await prisma.user.update({ where: { id: b.userId }, data: { email, passwordHash, status: 'ACTIVE' } });
    await revokeAllSessions(b.userId);
  } else {
    if (await prisma.user.findUnique({ where: { email } })) throw conflict('Este e-mail já está em uso.');
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { companyId: ctx.user.companyId, name: b.name, email, passwordHash, role: 'BARBER' } });
      await tx.barber.update({ where: { id }, data: { userId: user.id } });
    });
  }
  await audit({ ctx, action: 'barber.login_set', entity: 'Barber', entityId: id });
  return getBarber(ctx, id);
}

export async function disableBarberLogin(ctx, id) {
  const b = await loadBarber(ctx, id);
  if (!b.userId) throw badRequest('Este barbeiro não tem acesso ao painel.');
  await prisma.user.update({ where: { id: b.userId }, data: { status: 'INACTIVE' } });
  await revokeAllSessions(b.userId);
  await audit({ ctx, action: 'barber.login_disabled', entity: 'Barber', entityId: id });
}

export async function setSchedule(ctx, id, unitId, { days }) {
  const b = await loadBarber(ctx, id);
  if (!ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
  const link = b.units.find((l) => l.unitId === unitId);
  if (!link) throw badRequest('O barbeiro não está vinculado a esta unidade.');
  await prisma.$transaction([
    prisma.barberSchedule.deleteMany({ where: { barberUnitId: link.id } }),
    prisma.barberSchedule.createMany({ data: days.map((d) => ({ ...d, barberUnitId: link.id })) }),
  ]);
  await audit({ ctx, action: 'barber.schedule', entity: 'Barber', entityId: id, unitId, after: days });
  return getBarber(ctx, id);
}

export async function addTimeOff(ctx, id, data) {
  await loadBarber(ctx, id);
  if (data.unitId && !ctx.unitIds.includes(data.unitId)) throw forbidden('Unidade fora do seu acesso.');
  const t = await prisma.barberTimeOff.create({ data: { ...data, barberId: id } });
  await audit({ ctx, action: 'barber.timeoff_add', entity: 'Barber', entityId: id, after: t });
  return t;
}

export async function removeTimeOff(ctx, id, timeOffId) {
  await loadBarber(ctx, id);
  const t = await prisma.barberTimeOff.findFirst({ where: { id: timeOffId, barberId: id } });
  if (!t) throw notFound('Folga não encontrada.');
  await prisma.barberTimeOff.delete({ where: { id: timeOffId } });
  await audit({ ctx, action: 'barber.timeoff_remove', entity: 'Barber', entityId: id, before: t });
}
