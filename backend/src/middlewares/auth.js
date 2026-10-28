import { env } from '../config/env.js';
import { resolveSession } from '../services/auth.service.js';
import { getAccessibleUnitIds } from '../services/access.service.js';
import { can } from '../services/permissions.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: env.SESSION_TTL_HOURS * 3_600_000,
  };
}

/**
 * Carrega a sessão (se houver) e monta req.ctx = { user, session, unitIds, ip }.
 * Não bloqueia: rotas públicas continuam funcionando sem login.
 */
export async function loadSession(req, _res, next) {
  req.ctx = { user: null, session: null, unitIds: [], ip: req.ip };
  const token = req.cookies?.[env.SESSION_COOKIE_NAME];
  if (!token) return next();
  const resolved = await resolveSession(token);
  if (resolved) {
    req.ctx.user = resolved.user;
    req.ctx.session = resolved.session;
    req.ctx.unitIds = await getAccessibleUnitIds(resolved.user);
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.ctx?.user) throw unauthorized();
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.ctx?.user) throw unauthorized();
  if (!roles.includes(req.ctx.user.role)) throw forbidden();
  next();
};

export const requirePermission = (permission) => (req, _res, next) => {
  if (!req.ctx?.user) throw unauthorized();
  if (!can(req.ctx.user, permission)) throw forbidden();
  next();
};
