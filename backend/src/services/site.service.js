import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { audit } from '../utils/audit.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { DEFAULT_SITE_CONFIG } from './site-defaults.js';
import { siteConfigSchema } from '../validators/site.validators.js';

/** Configuração publicada (ou o padrão, se nunca houve publicação). */
export async function getPublishedConfig(companyId) {
  const v = await prisma.siteConfigVersion.findFirst({ where: { companyId, status: 'PUBLISHED' } });
  if (!v) return DEFAULT_SITE_CONFIG;
  // Completa campos novos que versões antigas não tinham.
  const parsed = siteConfigSchema.safeParse({ ...DEFAULT_SITE_CONFIG, ...v.data });
  return parsed.success ? parsed.data : DEFAULT_SITE_CONFIG;
}

export async function listVersions(ctx) {
  return prisma.siteConfigVersion.findMany({
    where: { companyId: ctx.user.companyId },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, status: true, note: true, createdAt: true, publishedAt: true },
  });
}

export async function getVersion(ctx, id) {
  const v = await prisma.siteConfigVersion.findFirst({ where: { id, companyId: ctx.user.companyId } });
  if (!v) throw notFound('Versão não encontrada.');
  return v;
}

async function nextVersion(tx, companyId) {
  const last = await tx.siteConfigVersion.aggregate({ where: { companyId }, _max: { version: true } });
  return (last._max.version ?? 0) + 1;
}

/** Cria um rascunho. Só existe um rascunho por vez: se houver, ele é atualizado. */
export async function saveDraft(ctx, { data, note }) {
  const companyId = ctx.user.companyId;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.siteConfigVersion.findFirst({ where: { companyId, status: 'DRAFT' } });
    const draft = existing
      ? await tx.siteConfigVersion.update({ where: { id: existing.id }, data: { data, note: note ?? existing.note } })
      : await tx.siteConfigVersion.create({
          data: { companyId, version: await nextVersion(tx, companyId), status: 'DRAFT', data, note, createdById: ctx.user.id },
        });
    await audit({ ctx, action: 'site.draft_saved', entity: 'SiteConfigVersion', entityId: draft.id }, tx);
    return draft;
  });
}

export async function getDraft(ctx) {
  return prisma.siteConfigVersion.findFirst({ where: { companyId: ctx.user.companyId, status: 'DRAFT' } });
}

export async function discardDraft(ctx) {
  const draft = await getDraft(ctx);
  if (!draft) throw notFound('Não há rascunho.');
  await prisma.siteConfigVersion.update({ where: { id: draft.id }, data: { status: 'ARCHIVED', note: `${draft.note ?? ''} (descartado)`.trim() } });
  await audit({ ctx, action: 'site.draft_discarded', entity: 'SiteConfigVersion', entityId: draft.id });
}

/** Publica o rascunho: a versão publicada anterior vira ARCHIVED (fica disponível para restaurar). */
export async function publishDraft(ctx) {
  const companyId = ctx.user.companyId;
  return prisma.$transaction(async (tx) => {
    const draft = await tx.siteConfigVersion.findFirst({ where: { companyId, status: 'DRAFT' } });
    if (!draft) throw badRequest('Não há rascunho para publicar.');
    await tx.siteConfigVersion.updateMany({ where: { companyId, status: 'PUBLISHED' }, data: { status: 'ARCHIVED' } });
    const published = await tx.siteConfigVersion.update({
      where: { id: draft.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    await audit({ ctx, action: 'site.published', entity: 'SiteConfigVersion', entityId: draft.id }, tx);
    return published;
  });
}

/** Restaurar = copiar uma versão antiga para um novo rascunho (nada é sobrescrito). */
export async function restoreVersion(ctx, id) {
  const source = await getVersion(ctx, id);
  const existing = await getDraft(ctx);
  if (existing) throw conflict('Já existe um rascunho. Publique ou descarte antes de restaurar outra versão.');
  const data = siteConfigSchema.parse({ ...DEFAULT_SITE_CONFIG, ...source.data });
  return saveDraft(ctx, { data, note: `Restaurada da versão ${source.version}` });
}

// ── Uploads de imagem ──

const SIGNATURES = [
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Salva uma imagem enviada em base64. O tipo é detectado pelos bytes do arquivo (não pelo nome),
 * e só PNG, JPEG e WEBP são aceitos — SVG é recusado por poder conter scripts.
 */
export async function saveUpload(ctx, { dataBase64 }) {
  const raw = dataBase64.replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length === 0) throw badRequest('Arquivo vazio.');
  if (buf.length > MAX_UPLOAD_BYTES) throw badRequest('Imagem muito grande (máximo 5 MB).');
  const sig = SIGNATURES.find((s) => s.test(buf));
  if (!sig) throw badRequest('Formato não suportado. Envie PNG, JPG ou WEBP.');
  const name = `${crypto.randomUUID()}.${sig.ext}`;
  await fs.mkdir(env.UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(env.UPLOAD_DIR, name), buf);
  await audit({ ctx, action: 'upload.create', entity: 'Upload', entityId: name });
  return { url: `/uploads/${name}`, mime: sig.mime, size: buf.length };
}
