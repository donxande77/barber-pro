import { prisma } from '../db/prisma.js';
import { audit } from '../utils/audit.js';
import { badRequest, notFound } from '../utils/errors.js';

export async function listClients(ctx, { search, page, pageSize }) {
  const where = { companyId: ctx.user.companyId, anonymizedAt: null };
  if (search) {
    const digits = search.replace(/\D/g, '');
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await prisma.$transaction([
    prisma.client.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.client.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getClient(ctx, id) {
  const client = await prisma.client.findFirst({ where: { id, companyId: ctx.user.companyId } });
  if (!client) throw notFound('Cliente não encontrado.');
  const appointments = await prisma.appointment.findMany({
    where: { clientId: id, unitId: { in: ctx.unitIds } },
    orderBy: { startsAt: 'desc' },
    take: 30,
    include: { items: true, barber: { select: { name: true } }, unit: { select: { name: true } } },
  });
  const subscriptions = await prisma.subscription.findMany({
    where: { clientId: id, unitId: { in: ctx.unitIds } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, price: true, startDate: true, planSnapshot: true, unit: { select: { name: true } } },
  });
  return { ...client, appointments, subscriptions };
}

const toData = (d) => ({ ...d, birthDate: d.birthDate ? new Date(`${d.birthDate}T00:00:00Z`) : d.birthDate });

export async function createClient(ctx, data) {
  const client = await prisma.client.create({ data: { ...toData(data), companyId: ctx.user.companyId } });
  await audit({ ctx, action: 'client.create', entity: 'Client', entityId: client.id });
  return client;
}

export async function updateClient(ctx, id, data) {
  const before = await prisma.client.findFirst({ where: { id, companyId: ctx.user.companyId } });
  if (!before) throw notFound('Cliente não encontrado.');
  if (before.anonymizedAt) throw badRequest('Cliente anonimizado não pode ser editado.');
  const client = await prisma.client.update({ where: { id }, data: toData(data) });
  await audit({ ctx, action: 'client.update', entity: 'Client', entityId: id, before, after: client });
  return client;
}

/**
 * LGPD — eliminação a pedido do titular: remove dados pessoais e mantém
 * o histórico de atendimentos e vendas (obrigação contábil) sem identificação.
 */
export async function anonymizeClient(ctx, id) {
  const before = await prisma.client.findFirst({ where: { id, companyId: ctx.user.companyId } });
  if (!before) throw notFound('Cliente não encontrado.');
  const client = await prisma.client.update({
    where: { id },
    data: { name: 'Cliente anonimizado', phone: `anon-${id}`, email: null, birthDate: null, notes: null, anonymizedAt: new Date() },
  });
  await audit({ ctx, action: 'client.anonymize', entity: 'Client', entityId: id });
  return client;
}

/** Usado no agendamento público: encontra pelo telefone ou cria. Não sobrescreve o nome de quem já existe. */
export async function findOrCreateByPhone(tx, companyId, { name, phone, email }) {
  const existing = await tx.client.findUnique({ where: { companyId_phone: { companyId, phone } } });
  if (existing) {
    if (!existing.email && email) await tx.client.update({ where: { id: existing.id }, data: { email } });
    return existing;
  }
  return tx.client.create({ data: { companyId, name, phone, email, consentAt: new Date() } });
}
