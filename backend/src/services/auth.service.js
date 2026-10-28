import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { hashPassword, verifyPassword, needsRehash, randomToken, sha256 } from '../utils/crypto.js';
import { AppError, badRequest, unauthorized } from '../utils/errors.js';
import { audit } from '../utils/audit.js';

// Hash fixo usado quando o e-mail não existe, para que a resposta leve o mesmo tempo
// (evita descobrir quais e-mails estão cadastrados pelo tempo de resposta).
let dummyHashPromise;
const dummyHash = () => (dummyHashPromise ??= hashPassword(randomToken()));

const GENERIC_LOGIN_ERROR = 'E-mail ou senha incorretos.';

export async function login({ email, password, ip, userAgent }) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  if (!user) {
    await verifyPassword(await dummyHash(), password);
    throw new AppError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN_ERROR);
  }

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    // Informar o bloqueio ajuda o usuário legítimo; o tempo de resposta é igualado com o hash fictício.
    await verifyPassword(await dummyHash(), password);
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Conta temporariamente bloqueada por excesso de tentativas. Tente mais tarde.');
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok || user.status !== 'ACTIVE') {
    if (!ok) {
      const failures = user.failedLogins + 1;
      const lock = failures >= env.LOGIN_MAX_FAILURES;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: lock ? 0 : failures,
          lockedUntil: lock ? new Date(now.getTime() + env.LOGIN_LOCK_MINUTES * 60_000) : null,
        },
      });
      if (lock) {
        await audit({ ctx: { user, ip }, action: 'auth.lockout', entity: 'User', entityId: user.id });
      }
    }
    throw new AppError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN_ERROR);
  }

  const token = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(now.getTime() + env.SESSION_TTL_HOURS * 3_600_000);

  const updates = { failedLogins: 0, lockedUntil: null, lastLoginAt: now };
  if (needsRehash(user.passwordHash)) updates.passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: updates }),
    prisma.session.create({
      data: { tokenHash: sha256(token), csrfToken, userId: user.id, ip, userAgent: userAgent?.slice(0, 300), expiresAt },
    }),
  ]);
  await audit({ ctx: { user, ip }, action: 'auth.login', entity: 'User', entityId: user.id });

  return { token, csrfToken, expiresAt, user };
}

/** Valida o token do cookie. Retorna { session, user } ou null. Aplica expiração absoluta e por inatividade. */
export async function resolveSession(token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt) return null;

  const now = new Date();
  const idleLimit = new Date(session.lastSeenAt.getTime() + env.SESSION_IDLE_MINUTES * 60_000);
  if (session.expiresAt <= now || idleLimit <= now || session.user.status !== 'ACTIVE') {
    if (!session.revokedAt) {
      await prisma.session.update({ where: { id: session.id }, data: { revokedAt: now } });
    }
    return null;
  }

  // Atualiza "visto por último" no máximo 1x por minuto para não escrever a cada requisição.
  if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }
  return { session, user: session.user };
}

export async function logout(sessionId) {
  await prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllSessions(userId, exceptSessionId) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}

export async function changePassword(ctx, { currentPassword, newPassword }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw unauthorized('Senha atual incorreta.');
  }
  if (currentPassword === newPassword) throw badRequest('A nova senha deve ser diferente da atual.');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  // Encerra as outras sessões: se a senha vazou, quem a usou perde o acesso.
  await revokeAllSessions(user.id, ctx.session.id);
  await audit({ ctx, action: 'auth.password_changed', entity: 'User', entityId: user.id });
}
