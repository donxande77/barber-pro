// Mural de cortes: a equipe publica trabalhos; o cliente escolhe um como referência ao agendar.
import { prisma } from '../db/prisma.js';
import { audit } from '../utils/audit.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { effectivePrice } from './catalog.service.js';

const adminInclude = {
  barber: { select: { id: true, name: true, photoUrl: true } },
  unit: { select: { id: true, name: true } },
  _count: { select: { appointments: true } },
};

async function ownBarberId(ctx) {
  if (ctx.user.role !== 'BARBER') return null;
  const b = await prisma.barber.findUnique({ where: { userId: ctx.user.id } });
  if (!b) throw forbidden('Cadastro de barbeiro não encontrado.');
  return b.id;
}

/** Proprietário vê tudo; gerente vê as das suas unidades e as gerais; barbeiro vê as próprias. */
async function scopeWhere(ctx) {
  const where = { companyId: ctx.user.companyId };
  const own = await ownBarberId(ctx);
  if (own) where.barberId = own;
  else if (ctx.user.role !== 'OWNER') where.OR = [{ unitId: null }, { unitId: { in: ctx.unitIds } }];
  return where;
}

const shape = (p) => ({ ...p, bookings: p._count?.appointments ?? 0, _count: undefined });

export async function listPosts(ctx, { status, unitId }) {
  const where = await scopeWhere(ctx);
  if (status) where.status = status;
  if (unitId) where.AND = [{ OR: [{ unitId: null }, { unitId }] }];
  const rows = await prisma.haircutPost.findMany({ where, include: adminInclude, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] });
  return rows.map(shape);
}

async function loadPost(ctx, id) {
  const p = await prisma.haircutPost.findFirst({ where: { id, ...(await scopeWhere(ctx)) }, include: adminInclude });
  if (!p) throw notFound('Publicação não encontrada.');
  return p;
}

async function checkRefs(ctx, data) {
  if (data.unitId && !ctx.unitIds.includes(data.unitId)) throw forbidden('Unidade fora do seu acesso.');
  if (data.barberId) {
    const b = await prisma.barber.findFirst({ where: { id: data.barberId, companyId: ctx.user.companyId } });
    if (!b) throw badRequest('Barbeiro inválido.');
  }
  if (data.serviceIds?.length) {
    const n = await prisma.service.count({ where: { id: { in: data.serviceIds }, companyId: ctx.user.companyId } });
    if (n !== new Set(data.serviceIds).size) throw badRequest('Serviço inválido.');
  }
}

const normTags = (tags) => [...new Set((tags ?? []).map((t) => t.trim()).filter(Boolean).map((t) => t[0].toUpperCase() + t.slice(1)))];

export async function createPost(ctx, data) {
  const own = await ownBarberId(ctx);
  const body = { ...data, tags: normTags(data.tags) };
  if (own) {
    // Barbeiro publica os próprios trabalhos; a gestão aprova antes de aparecer no site.
    body.barberId = own;
    body.status = 'PENDING';
    body.featured = false;
  }
  await checkRefs(ctx, body);
  const post = await prisma.haircutPost.create({
    data: { ...body, companyId: ctx.user.companyId, createdById: ctx.user.id, publishedAt: body.status === 'PUBLISHED' ? new Date() : null },
    include: adminInclude,
  });
  await audit({ ctx, action: 'post.create', entity: 'HaircutPost', entityId: post.id, unitId: post.unitId, after: { title: post.title, status: post.status } });
  return shape(post);
}

export async function updatePost(ctx, id, data) {
  const before = await loadPost(ctx, id);
  const own = await ownBarberId(ctx);
  const body = { ...data };
  if (body.tags) body.tags = normTags(body.tags);
  if (own) {
    delete body.barberId;
    delete body.featured;
    delete body.status;
    if (before.status === 'PUBLISHED') body.status = 'PENDING'; // alteração do barbeiro volta para aprovação
  }
  await checkRefs(ctx, body);
  if (body.status === 'PUBLISHED' && before.status !== 'PUBLISHED') body.publishedAt = new Date();
  const post = await prisma.haircutPost.update({ where: { id }, data: body, include: adminInclude });
  await audit({ ctx, action: 'post.update', entity: 'HaircutPost', entityId: id, unitId: post.unitId, before: { status: before.status }, after: { status: post.status } });
  return shape(post);
}

export async function deletePost(ctx, id) {
  const post = await loadPost(ctx, id);
  // Agendamentos que usaram o corte como referência ficam sem a referência (SET NULL), nada mais é afetado.
  await prisma.haircutPost.delete({ where: { id } });
  await audit({ ctx, action: 'post.delete', entity: 'HaircutPost', entityId: id, unitId: post.unitId, before: { title: post.title } });
}

// ── Site público ──

const publicSelect = {
  id: true, title: true, description: true, imageUrls: true, tags: true, serviceIds: true, featured: true, unitId: true, publishedAt: true,
  barber: { select: { id: true, name: true, photoUrl: true, status: true } },
  unit: { select: { id: true, name: true } },
};

/** Publicações visíveis no site, com os serviços necessários e o preço na unidade (quando informada). */
export async function publicPosts(companyId, { unitId, tag, barberId }) {
  const where = { companyId, status: 'PUBLISHED' };
  if (unitId) where.OR = [{ unitId: null }, { unitId }];
  if (tag) where.tags = { has: tag };
  if (barberId) where.barberId = barberId;
  const rows = await prisma.haircutPost.findMany({ where, select: publicSelect, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { publishedAt: 'desc' }], take: 120 });
  const allTags = await prisma.haircutPost.findMany({ where: { companyId, status: 'PUBLISHED' }, select: { tags: true } });
  const serviceIds = [...new Set(rows.flatMap((r) => r.serviceIds))];
  const services = serviceIds.length
    ? await prisma.service.findMany({
        where: { id: { in: serviceIds }, status: 'ACTIVE' },
        select: { id: true, name: true, offers: unitId ? { where: { unitId, isActive: true } } : false },
      })
    : [];
  const now = new Date();
  const byId = new Map(services.map((s) => [s.id, s]));
  const posts = rows.map((p) => {
    const svc = p.serviceIds.map((id) => byId.get(id)).filter(Boolean);
    const priced = unitId ? svc.filter((s) => s.offers?.length) : svc;
    return {
      ...p,
      barber: p.barber && p.barber.status === 'ACTIVE' ? { id: p.barber.id, name: p.barber.name, photoUrl: p.barber.photoUrl } : null,
      services: svc.map((s) => ({ id: s.id, name: s.name })),
      // Preço estimado para reproduzir o corte na unidade escolhida
      estimate: unitId && priced.length === svc.length && svc.length
        ? priced.reduce((acc, s) => acc + Number(effectivePrice(s.offers[0], now).price), 0).toFixed(2)
        : null,
    };
  });
  const tagCount = new Map();
  for (const r of allTags) for (const t of r.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  return { posts, tags: [...tagCount.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t) };
}

export async function publicPost(companyId, id) {
  const p = await prisma.haircutPost.findFirst({ where: { id, companyId, status: 'PUBLISHED' }, select: publicSelect });
  if (!p) throw notFound('Corte não encontrado.');
  const services = await prisma.service.findMany({ where: { id: { in: p.serviceIds }, status: 'ACTIVE' }, select: { id: true, name: true } });
  return { ...p, barber: p.barber?.status === 'ACTIVE' ? { id: p.barber.id, name: p.barber.name, photoUrl: p.barber.photoUrl } : null, services };
}

/** Valida a referência escolhida no agendamento (publicada e da mesma empresa). */
export async function validateReference(companyId, postId) {
  if (!postId) return null;
  const p = await prisma.haircutPost.findFirst({ where: { id: postId, companyId, status: 'PUBLISHED' }, select: { id: true } });
  if (!p) throw badRequest('O corte escolhido não está mais disponível no mural.');
  return p.id;
}
