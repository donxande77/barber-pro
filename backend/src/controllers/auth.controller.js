import { env } from '../config/env.js';
import * as authService from '../services/auth.service.js';
import { getAccessibleUnitIds } from '../services/access.service.js';
import { permissionsOf } from '../services/permissions.js';
import { sessionCookieOptions } from '../middlewares/auth.js';
import { prisma } from '../db/prisma.js';

async function mePayload(user, unitIds, csrfToken) {
  const [company, barber] = await Promise.all([
    prisma.company.findUnique({ where: { id: user.companyId }, select: { id: true, name: true, slug: true } }),
    user.role === 'BARBER' ? prisma.barber.findUnique({ where: { userId: user.id }, select: { id: true } }) : null,
  ]);
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role, barberId: barber?.id ?? null },
    company,
    unitIds,
    permissions: permissionsOf(user.role),
    csrfToken,
  };
}

export async function login(req, res) {
  const { email, password } = req.valid.body;
  const result = await authService.login({ email, password, ip: req.ip, userAgent: req.get('user-agent') });
  res.cookie(env.SESSION_COOKIE_NAME, result.token, sessionCookieOptions());
  const unitIds = await getAccessibleUnitIds(result.user);
  res.json(await mePayload(result.user, unitIds, result.csrfToken));
}

export async function me(req, res) {
  const { user, unitIds, session } = req.ctx;
  res.json(await mePayload(user, unitIds, session.csrfToken));
}

export async function logout(req, res) {
  if (req.ctx.session) await authService.logout(req.ctx.session.id);
  const { maxAge: _maxAge, ...opts } = sessionCookieOptions();
  res.clearCookie(env.SESSION_COOKIE_NAME, opts);
  res.status(204).end();
}

export async function changePassword(req, res) {
  await authService.changePassword(req.ctx, req.valid.body);
  res.status(204).end();
}
