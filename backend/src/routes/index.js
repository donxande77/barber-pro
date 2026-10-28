import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { validate } from '../middlewares/validate.js';
import { requireAuth, requirePermission } from '../middlewares/auth.js';
import * as auth from '../controllers/auth.controller.js';
import * as users from '../controllers/users.controller.js';
import { loginBody, changePasswordBody } from '../validators/auth.validators.js';
import { createUserBody, updateUserBody, listUsersQuery } from '../validators/user.validators.js';
import { idParams, unitParams } from '../validators/common.js';
import * as unitService from '../services/unit.service.js';
import { z } from 'zod';

export const router = Router();

// ── Saúde ──
router.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: 'ok' });
});

// ── Autenticação ──
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.LOGIN_RATE_LIMIT_PER_15MIN,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Chave por IP + e-mail: um atacante não bloqueia todos os usuários de um mesmo IP corporativo.
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email ?? '').toLowerCase()}`,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Muitas tentativas de login. Aguarde alguns minutos.' } }),
});

router.post('/auth/login', loginLimiter, validate({ body: loginBody }), auth.login);
router.post('/auth/logout', requireAuth, auth.logout);
router.get('/auth/me', requireAuth, auth.me);
router.post('/auth/change-password', requireAuth, validate({ body: changePasswordBody }), auth.changePassword);

// ── Usuários ──
router.get('/users', requirePermission('users:read'), validate({ query: listUsersQuery }), users.list);
router.post('/users', requirePermission('users:manage'), validate({ body: createUserBody }), users.create);
router.get('/users/:id', requirePermission('users:read'), validate({ params: idParams }), users.get);
router.patch('/users/:id', requirePermission('users:manage'), validate({ params: idParams, body: updateUserBody }), users.update);

// ── Unidades (leitura com escopo; CRUD na Fase 2) ──
router.get('/units', requirePermission('units:read'), async (req, res) => res.json(await unitService.listUnits(req.ctx)));
router.get('/units/:unitId', requirePermission('units:read'), validate({ params: unitParams }), async (req, res) =>
  res.json(await unitService.getUnit(req.ctx, req.valid.params.unitId)),
);

// ── Auditoria ──
const auditQuery = z.object({
  entity: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
router.get('/audit', requirePermission('audit:read'), validate({ query: auditQuery }), async (req, res) => {
  const { entity, limit } = req.valid.query;
  const rows = await prisma.auditLog.findMany({
    where: { companyId: req.ctx.user.companyId, ...(entity ? { entity } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json(rows);
});
