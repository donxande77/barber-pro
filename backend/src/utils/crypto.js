import crypto from 'node:crypto';
import argon2 from 'argon2';

// Parâmetros Argon2id recomendados pela OWASP (m=19 MiB, t=2, p=1).
const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (plain) => argon2.hash(plain, ARGON_OPTS);

export async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export const needsRehash = (hash) => argon2.needsRehash(hash, ARGON_OPTS);

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** Comparação em tempo constante para tokens (CSRF). */
export function safeEqual(a, b) {
  const ab = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
