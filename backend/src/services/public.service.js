// Dados do site público. Só expõe o que é público: nada de clientes, valores internos ou custos.
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { getPublishedConfig } from './site.service.js';
import { effectivePrice } from './catalog.service.js';
import { computeSlots, createAppointment, getByManageToken, cancelByManageToken } from './appointment.service.js';

let cachedCompanyId = null;
export async function publicCompany() {
  if (cachedCompanyId && !env.isTest) return prisma.company.findUnique({ where: { id: cachedCompanyId } });
  const company = env.PUBLIC_COMPANY_SLUG
    ? await prisma.company.findUnique({ where: { slug: env.PUBLIC_COMPANY_SLUG } })
    : await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!company) throw notFound('Site ainda não configurado.');
  cachedCompanyId = company.id;
  return company;
}

const publicUnitSelect = {
  id: true, name: true, slug: true, timezone: true, street: true, number: true, district: true, city: true, state: true,
  zipCode: true, phone: true, whatsapp: true, email: true, instagramUrl: true, cancellationPolicy: true, minCancelHours: true,
  hours: { orderBy: { weekday: 'asc' }, select: { weekday: true, openMin: true, closeMin: true } },
};

export async function site() {
  const company = await publicCompany();
  const [config, units] = await Promise.all([
    getPublishedConfig(company.id),
    prisma.unit.findMany({ where: { companyId: company.id, status: 'ACTIVE' }, select: publicUnitSelect, orderBy: { name: 'asc' } }),
  ]);
  return { company: { name: company.name }, config, units };
}

async function activeUnit(unitId) {
  const company = await publicCompany();
  const unit = await prisma.unit.findFirst({ where: { id: unitId, companyId: company.id, status: 'ACTIVE' } });
  if (!unit) throw notFound('Unidade não encontrada.');
  return unit;
}

/** Serviços, profissionais, produtos e avaliações aprovadas de uma unidade. */
export async function unitCatalog(unitId) {
  const unit = await activeUnit(unitId);
  const now = new Date();
  const [offers, barbers, products, reviews] = await Promise.all([
    prisma.serviceUnit.findMany({
      where: { unitId, isActive: true, service: { status: 'ACTIVE' } },
      include: { service: { include: { category: true, barbers: { select: { barberId: true } } } } },
    }),
    prisma.barber.findMany({
      where: { status: 'ACTIVE', units: { some: { unitId, isActive: true } } },
      select: { id: true, name: true, photoUrl: true, bio: true, specialties: true, services: { select: { serviceId: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.product.findMany({
      where: { companyId: unit.companyId, status: 'ACTIVE', stocks: { some: { unitId } } },
      select: { id: true, name: true, description: true, imageUrl: true, price: true, stocks: { where: { unitId }, select: { quantity: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.review.findMany({
      where: { unitId, status: 'APPROVED' },
      select: { id: true, rating: true, comment: true, createdAt: true, client: { select: { name: true } }, barber: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);
  const activeBarberIds = new Set(barbers.map((b) => b.id));
  const services = offers
    .map((o) => {
      const eff = effectivePrice(o, now);
      return {
        id: o.service.id,
        name: o.service.name,
        description: o.service.description,
        imageUrl: o.service.imageUrl,
        isCombo: o.service.isCombo,
        category: o.service.category?.name ?? null,
        categoryOrder: o.service.category?.sortOrder ?? 999,
        sortOrder: o.service.sortOrder,
        durationMin: o.durationMin,
        price: eff.price.toFixed(2),
        regularPrice: Number(o.price).toFixed(2),
        promo: eff.promo ? { endsAt: o.promoEnd } : null,
        barberIds: o.service.barbers.map((b) => b.barberId).filter((id) => activeBarberIds.has(id)),
      };
    })
    .filter((s) => s.barberIds.length > 0)
    .sort((a, b) => a.categoryOrder - b.categoryOrder || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const ratingAvg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
  return {
    unitId,
    services,
    barbers: barbers.map((b) => ({ ...b, serviceIds: b.services.map((s) => s.serviceId), services: undefined })),
    products: products.map((p) => ({ id: p.id, name: p.name, description: p.description, imageUrl: p.imageUrl, price: p.price, available: (p.stocks[0]?.quantity ?? 0) > 0 })),
    reviews: reviews.map((r) => ({
      id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt, barber: r.barber.name,
      // Apenas o primeiro nome e a inicial do sobrenome (privacidade)
      client: r.client.name.split(' ').filter(Boolean).map((p, i) => (i === 0 ? p : `${p[0]}.`)).slice(0, 2).join(' '),
    })),
    rating: ratingAvg ? { average: Math.round(ratingAvg * 10) / 10, count: reviews.length } : null,
  };
}

export async function availability({ unitId, date, serviceIds, barberId }) {
  await activeUnit(unitId);
  const r = await computeSlots({ unitId, date, serviceIds, barberId, leadMinutes: 30 });
  return { ...r, slots: r.slots.map((s) => ({ time: s.time, startsAt: s.startsAt, barberCount: s.barberIds.length })) };
}

export async function book(data) {
  await activeUnit(data.unitId);
  if (!data.consent) throw badRequest('É preciso aceitar a política de privacidade para agendar.');
  const appt = await createAppointment({
    ctx: null,
    unitId: data.unitId,
    serviceIds: data.serviceIds,
    barberId: data.barberId ?? null,
    startsAt: data.startsAt,
    client: data.client,
    notes: data.notes,
    source: 'PUBLIC',
    leadMinutes: 30,
  });
  return {
    manageToken: appt.manageToken,
    manageUrl: `${env.PUBLIC_SITE_URL}/agendamento/${appt.manageToken}`,
    startsAt: appt.startsAt,
    endsAt: appt.endsAt,
    barber: appt.barber.name,
    unit: appt.unit.name,
    services: appt.items.map((i) => i.serviceName),
    totalPrice: appt.totalPrice,
  };
}

export const manageInfo = (token) => getByManageToken(token);
export const manageCancel = (token, reason) => cancelByManageToken(token, reason);

// ── Avaliações reais: só via link gerado ao concluir um atendimento ──

export async function reviewInfo(token) {
  const a = await prisma.appointment.findUnique({
    where: { reviewToken: token },
    include: { barber: { select: { name: true } }, unit: { select: { name: true } }, items: { select: { serviceName: true } }, review: { select: { id: true } } },
  });
  if (!a || a.status !== 'COMPLETED') throw notFound('Link de avaliação inválido.');
  return { barber: a.barber.name, unit: a.unit.name, services: a.items.map((i) => i.serviceName), date: a.startsAt, alreadyReviewed: !!a.review };
}

export async function submitReview(token, { rating, comment }) {
  const a = await prisma.appointment.findUnique({ where: { reviewToken: token }, include: { review: true, unit: true } });
  if (!a || a.status !== 'COMPLETED') throw notFound('Link de avaliação inválido.');
  if (a.review) throw badRequest('Este atendimento já foi avaliado. Obrigado!');
  const review = await prisma.review.create({
    data: { unitId: a.unitId, appointmentId: a.id, clientId: a.clientId, barberId: a.barberId, rating, comment },
  });
  await audit({ ctx: null, companyId: a.unit.companyId, action: 'review.submitted', entity: 'Review', entityId: review.id, unitId: a.unitId });
  return { ok: true, status: review.status };
}

// ── Moderação (painel) ──

export async function listReviews(ctx, { unitId, status }) {
  return prisma.review.findMany({
    where: { unitId: unitId && ctx.unitIds.includes(unitId) ? unitId : { in: ctx.unitIds }, ...(status ? { status } : {}) },
    include: { client: { select: { name: true } }, barber: { select: { name: true } }, unit: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export async function moderateReview(ctx, id, { status }) {
  const r = await prisma.review.findFirst({ where: { id, unitId: { in: ctx.unitIds } } });
  if (!r) throw notFound('Avaliação não encontrada.');
  const updated = await prisma.review.update({ where: { id }, data: { status, moderatedAt: new Date() } });
  await audit({ ctx, action: `review.${status.toLowerCase()}`, entity: 'Review', entityId: id, unitId: r.unitId });
  return updated;
}
