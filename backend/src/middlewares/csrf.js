import { env } from '../config/env.js';
import { safeEqual } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defesa CSRF em duas camadas para métodos que alteram dados:
 * 1. Origin/Referer, quando enviados pelo navegador, precisam estar na lista de origens permitidas.
 * 2. Requisições autenticadas por cookie precisam do cabeçalho X-CSRF-Token igual ao token da sessão
 *    (padrão "synchronizer token"). Login e agendamento público não têm sessão e ficam só com (1)
 *    + SameSite=Lax + exigência de Content-Type JSON (que força preflight CORS em chamadas cross-site).
 */
export function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin') || refererOrigin(req.get('referer'));
  if (origin && !env.corsOrigins.includes(origin)) {
    throw new AppError(403, 'CSRF_ORIGIN', 'Origem da requisição não autorizada.');
  }

  if (req.ctx?.session) {
    const header = req.get('x-csrf-token');
    if (!header || !safeEqual(header, req.ctx.session.csrfToken)) {
      throw new AppError(403, 'CSRF_TOKEN', 'Token de segurança ausente ou inválido. Recarregue a página.');
    }
  }
  next();
}

/** Exige corpo JSON em métodos com corpo (bloqueia formulários HTML simples enviados de outro site). */
export function requireJson(req, _res, next) {
  if (SAFE_METHODS.has(req.method) || req.method === 'DELETE') return next();
  const hasBody = Number(req.get('content-length') || 0) > 0 || req.get('transfer-encoding');
  if (hasBody && !req.is('application/json')) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie os dados em JSON.');
  }
  next();
}

function refererOrigin(referer) {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return 'invalid';
  }
}
