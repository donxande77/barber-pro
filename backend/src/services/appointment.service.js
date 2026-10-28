import { prisma } from '../db/prisma.js';
import { audit } from '../utils/audit.js';
import { randomToken } from '../utils/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { sum, toMoneyString } from '../utils/money.js';
import { assertDate, dayRange, hhmm, localDateOf, localToUtc, minutesOfDay, weekdayOf } from '../utils/time.js';
import { effectivePrice } from './catalog.service.js';
import { findOrCreateByPhone } from './client.service.js';
import { isExclusionViolation } from '../middlewares/error.js';

const ACTIVE = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED'];
const FINAL = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

/** Carrega as ofertas dos serviços na unidade, validando que estão ativos. */
async function loadOffers(db, unitId, serviceIds) {
  const unique = [...new Set(serviceIds)];
  const offers = await db.serviceUnit.findMany({
    where: { unitId, serviceId: { in: unique }, isActive: true, service: { status: 'ACTIVE' } },
    include: { service: { select: { id: true, name: true } } },
  });
  if (offers.length !== unique.length) throw badRequest('Um ou mais serviços não estão disponíveis nesta unidade.');
  // Mantém a ordem escolhida pelo cliente
  return unique.map((id) => offers.find((o) => o.serviceId === id));
}

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

/**
 * Calcula os horários livres de um dia. Considera: horário da unidade, escala e intervalo do barbeiro,
 * folgas, agendamentos ativos do barbeiro em QUALQUER unidade e antecedência mínima.
 * A garantia final contra conflito é a restrição EXCLUDE do banco (ver migração de restrições).
 */
export async function computeSlots({ unitId, date, serviceIds, barberId, excludeAppointmentId, now = new Date(), leadMinutes = 0 }, db = prisma) {
  assertDate(date);
  const unit = await db.unit.findUnique({ where: { id: unitId }, include: { hours: true } });
  if (!unit || unit.status !== 'ACTIVE') throw notFound('Unidade não encontrada.');
  const tz = unit.timezone;
  const offers = await loadOffers(db, unitId, serviceIds);
  const durationMin = offers.reduce((s, o) => s + o.durationMin, 0);

  const weekday = weekdayOf(date, tz);
  const unitHours = unit.hours.find((h) => h.weekday === weekday);
  const result = { unit: { id: unit.id, name: unit.name, timezone: tz }, date, durationMin, slots: [], barbers: [] };
  if (!unitHours) return result;

  const barbers = await db.barber.findMany({
    where: {
      companyId: unit.companyId,
      status: 'ACTIVE',
      ...(barberId ? { id: barberId } : {}),
      units: { some: { unitId, isActive: true } },
      AND: offers.map((o) => ({ services: { some: { serviceId: o.serviceId } } })),
    },
    include: { units: { where: { unitId }, include: { schedules: { where: { weekday } } } } },
    orderBy: { name: 'asc' },
  });
  if (barberId && barbers.length === 0) throw badRequest('Este profissional não atende os serviços escolhidos nesta unidade.');
  result.barbers = barbers.map((b) => ({ id: b.id, name: b.name, photoUrl: b.photoUrl }));
  if (!barbers.length) return result;

  const { start: dayStart, end: dayEnd } = dayRange(date, tz);
  const ids = barbers.map((b) => b.id);
  const [appointments, timeOffs] = await Promise.all([
    db.appointment.findMany({
      where: {
        barberId: { in: ids },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
      select: { barberId: true, startsAt: true, endsAt: true },
    }),
    db.barberTimeOff.findMany({
      where: { barberId: { in: ids }, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart }, OR: [{ unitId: null }, { unitId }] },
    }),
  ]);

  // Converte um intervalo absoluto em minutos do dia local, cortando nas bordas do dia.
  const toMin = (s, e) => [s <= dayStart ? 0 : minutesOfDay(s, tz), e >= dayEnd ? 1440 : minutesOfDay(e, tz)];
  const earliest = now.getTime() + leadMinutes * 60_000;
  const step = unit.slotStepMinutes;
  const slotMap = new Map();

  for (const b of barbers) {
    const sched = b.units[0]?.schedules[0];
    if (!sched) continue;
    const from = Math.max(unitHours.openMin, sched.startMin);
    const to = Math.min(unitHours.closeMin, sched.endMin);
    const busy = [];
    if (sched.breakStartMin != null) busy.push([sched.breakStartMin, sched.breakEndMin]);
    for (const a of appointments) if (a.barberId === b.id) busy.push(toMin(a.startsAt, a.endsAt));
    for (const t of timeOffs) if (t.barberId === b.id) busy.push(toMin(t.startsAt, t.endsAt));

    for (let t = Math.ceil(from / step) * step; t + durationMin <= to; t += step) {
      if (busy.some(([s, e]) => overlaps(t, t + durationMin, s, e))) continue;
      const startsAt = localToUtc(date, t, tz);
      if (startsAt.getTime() < earliest) continue;
      const key = t;
      if (!slotMap.has(key)) slotMap.set(key, { time: hhmm(t), startsAt: startsAt.toISOString(), barberIds: [] });
      slotMap.get(key).barberIds.push(b.id);
    }
  }
  result.slots = [...slotMap.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  return result;
}

const include = {
  items: true,
  client: { select: { id: true, name: true, phone: true, email: true } },
  barber: { select: { id: true, name: true, photoUrl: true } },
  unit: { select: { id: true, name: true, timezone: true } },
  sale: { select: { id: true, status: true, total: true } },
};

/**
 * Cria um agendamento (público ou interno). Revalida o horário no servidor e grava
 * numa transação; se outro pedido levar o mesmo horário ao mesmo tempo, o banco recusa (409).
 */
export async function createAppointment({ ctx, unitId, serviceIds, barberId, startsAt, clientId, client, notes, source, leadMinutes = 0 }) {
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) throw notFound('Unidade não encontrada.');
  const date = localDateOf(startsAt, unit.timezone);
  const avail = await computeSlots({ unitId, date, serviceIds, barberId, leadMinutes });
  const slot = avail.slots.find((s) => new Date(s.startsAt).getTime() === startsAt.getTime());
  if (!slot) throw conflict('Este horário não está mais disponível. Escolha outro.', { code: 'SLOT_UNAVAILABLE' });

  let chosen = barberId;
  if (!chosen) {
    // "Qualquer profissional": distribui para quem tem menos atendimentos no dia.
    const { start, end } = dayRange(date, unit.timezone);
    const counts = await prisma.appointment.groupBy({
      by: ['barberId'],
      where: { barberId: { in: slot.barberIds }, status: { in: ACTIVE }, startsAt: { gte: start, lt: end } },
      _count: true,
    });
    const load = (id) => counts.find((c) => c.barberId === id)?._count ?? 0;
    chosen = [...slot.barberIds].sort((a, b) => load(a) - load(b))[0];
  }

  const offers = await loadOffers(prisma, unitId, serviceIds);
  const priced = offers.map((o) => ({ ...o, price: effectivePrice(o, startsAt).price }));
  const endsAt = new Date(startsAt.getTime() + avail.durationMin * 60_000);

  try {
    return await prisma.$transaction(async (tx) => {
      let cid = clientId;
      if (!cid) cid = (await findOrCreateByPhone(tx, unit.companyId, client)).id;
      else {
        const c = await tx.client.findFirst({ where: { id: cid, companyId: unit.companyId, anonymizedAt: null } });
        if (!c) throw badRequest('Cliente inválido.');
      }
      const appt = await tx.appointment.create({
        data: {
          unitId,
          clientId: cid,
          barberId: chosen,
          startsAt,
          endsAt,
          source,
          notes,
          totalDuration: avail.durationMin,
          totalPrice: toMoneyString(sum(priced.map((p) => p.price))),
          createdById: ctx?.user?.id ?? null,
          manageToken: randomToken(24),
          items: {
            create: priced.map((p) => ({
              serviceId: p.serviceId,
              serviceName: p.service.name,
              price: toMoneyString(p.price),
              durationMin: p.durationMin,
            })),
          },
        },
        include,
      });
      await audit(
        { ctx: ctx ?? null, companyId: unit.companyId, action: 'appointment.create', entity: 'Appointment', entityId: appt.id, unitId, after: { source, startsAt, barberId: chosen } },
        tx,
      );
      return appt;
    });
  } catch (e) {
    if (isExclusionViolation(e)) throw conflict('Este horário acabou de ser reservado. Escolha outro.', { code: 'SLOT_UNAVAILABLE' });
    throw e;
  }
}

async function loadAppointment(ctx, id) {
  const a = await prisma.appointment.findFirst({ where: { id, unitId: { in: ctx.unitIds } }, include });
  if (!a) throw notFound('Agendamento não encontrado.');
  if (ctx.user.role === 'BARBER') {
    const barber = await prisma.barber.findUnique({ where: { userId: ctx.user.id } });
    if (a.barberId !== barber?.id) throw notFound('Agendamento não encontrado.');
  }
  return a;
}

export const getAppointment = (ctx, id) => loadAppointment(ctx, id);

export async function listAppointments(ctx, { unitId, from, to, barberId, status }) {
  if (unitId && !ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
  const tz = unitId ? (await prisma.unit.findUnique({ where: { id: unitId } })).timezone : 'America/Sao_Paulo';
  const start = dayRange(from, tz).start;
  const end = dayRange(to ?? from, tz).end;
  const where = { unitId: unitId ? unitId : { in: ctx.unitIds }, startsAt: { gte: start, lt: end } };
  if (ctx.user.role === 'BARBER') {
    const barber = await prisma.barber.findUnique({ where: { userId: ctx.user.id } });
    where.barberId = barber?.id ?? '00000000-0000-0000-0000-000000000000';
  } else if (barberId) where.barberId = barberId;
  if (status) where.status = status;
  return prisma.appointment.findMany({ where, include, orderBy: { startsAt: 'asc' } });
}

export async function rescheduleAppointment(ctx, id, { startsAt, barberId }) {
  const a = await loadAppointment(ctx, id);
  if (!['SCHEDULED', 'CONFIRMED'].includes(a.status)) throw badRequest('Só é possível remarcar agendamentos ainda não iniciados.');
  const date = localDateOf(startsAt, a.unit.timezone);
  const avail = await computeSlots({
    unitId: a.unitId, date, serviceIds: a.items.map((i) => i.serviceId), barberId: barberId ?? a.barberId, excludeAppointmentId: id,
  });
  const slot = avail.slots.find((s) => new Date(s.startsAt).getTime() === startsAt.getTime());
  if (!slot) throw conflict('Horário indisponível para este profissional.');
  try {
    const updated = await prisma.appointment.update({
      where: { id },
      data: { startsAt, endsAt: new Date(startsAt.getTime() + a.totalDuration * 60_000), barberId: barberId ?? a.barberId },
      include,
    });
    await audit({ ctx, action: 'appointment.reschedule', entity: 'Appointment', entityId: id, unitId: a.unitId, before: { startsAt: a.startsAt, barberId: a.barberId }, after: { startsAt, barberId: updated.barberId } });
    return updated;
  } catch (e) {
    if (isExclusionViolation(e)) throw conflict('Horário indisponível para este profissional.');
    throw e;
  }
}

const TRANSITIONS = {
  CONFIRMED: ['SCHEDULED'],
  CHECKED_IN: ['SCHEDULED', 'CONFIRMED'],
  NO_SHOW: ['SCHEDULED', 'CONFIRMED'],
  CANCELLED: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'],
};

export async function setStatus(ctx, id, { status, reason }) {
  const a = await loadAppointment(ctx, id);
  if (!TRANSITIONS[status]?.includes(a.status)) throw badRequest('Mudança de situação não permitida.');
  if (a.sale && a.sale.status !== 'CANCELLED' && status === 'CANCELLED') throw badRequest('Cancele primeiro o atendimento/venda vinculado.');
  const updated = await prisma.appointment.update({
    where: { id },
    data: { status, ...(status === 'CANCELLED' ? { cancelledAt: new Date(), cancelReason: reason ?? null } : {}) },
    include,
  });
  await audit({ ctx, action: `appointment.${status.toLowerCase()}`, entity: 'Appointment', entityId: id, unitId: a.unitId, before: { status: a.status }, after: { status, reason } });
  return updated;
}

// ── Links do cliente (sem login) ──

export async function getByManageToken(token) {
  const a = await prisma.appointment.findUnique({
    where: { manageToken: token },
    include: { items: true, barber: { select: { name: true } }, unit: true },
  });
  if (!a) throw notFound('Agendamento não encontrado.');
  const deadline = new Date(a.startsAt.getTime() - a.unit.minCancelHours * 3_600_000);
  return {
    status: a.status,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    totalPrice: a.totalPrice,
    services: a.items.map((i) => i.serviceName),
    barber: a.barber.name,
    unit: { name: a.unit.name, timezone: a.unit.timezone, phone: a.unit.phone, whatsapp: a.unit.whatsapp, cancellationPolicy: a.unit.cancellationPolicy, minCancelHours: a.unit.minCancelHours },
    canCancel: ['SCHEDULED', 'CONFIRMED'].includes(a.status) && new Date() < deadline,
    cancelDeadline: deadline,
  };
}

export async function cancelByManageToken(token, reason) {
  const info = await getByManageToken(token);
  if (!info.canCancel) {
    throw badRequest(`O cancelamento online é possível até ${info.unit.minCancelHours} h antes do horário. Fale com a unidade.`);
  }
  const a = await prisma.appointment.update({
    where: { manageToken: token },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason || 'Cancelado pelo cliente' },
    include: { unit: { select: { companyId: true } } },
  });
  await audit({ ctx: null, companyId: a.unit.companyId, action: 'appointment.cancelled_by_client', entity: 'Appointment', entityId: a.id, unitId: a.unitId });
  return getByManageToken(token);
}

export { FINAL as FINAL_STATUSES };
