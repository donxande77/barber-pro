import { prisma } from '../db/prisma.js';

const SENSITIVE_KEYS = new Set(['passwordHash', 'password', 'tokenHash', 'csrfToken']);

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return JSON.parse(
    JSON.stringify(obj, (k, v) => (SENSITIVE_KEYS.has(k) ? undefined : typeof v === 'bigint' ? v.toString() : v)),
  );
}

/**
 * Registra uma ação na trilha de auditoria. Aceita um cliente de transação (tx)
 * para que o registro seja gravado na mesma transação da operação auditada.
 */
export async function audit({ ctx, action, entity, entityId, unitId, before, after, companyId }, tx = prisma) {
  return tx.auditLog.create({
    data: {
      companyId: companyId ?? ctx.user.companyId,
      userId: ctx?.user?.id ?? null,
      unitId: unitId ?? null,
      action,
      entity,
      entityId: entityId ? String(entityId) : null,
      before: before ? redact(before) : undefined,
      after: after ? redact(after) : undefined,
      ip: ctx?.ip ?? null,
    },
  });
}
