import { z } from 'zod';

export const uuid = z.uuid({ message: 'Identificador inválido.' });
export const idParams = z.object({ id: uuid });
export const unitParams = z.object({ unitId: uuid });

// Senha: mínimo 10 caracteres; limite superior evita custo excessivo no hash.
export const password = z
  .string()
  .min(10, 'A senha deve ter pelo menos 10 caracteres.')
  .max(128, 'A senha deve ter no máximo 128 caracteres.')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Use letras e números na senha.');

export const email = z.email('E-mail inválido.').max(254).transform((v) => v.trim().toLowerCase());
export const role = z.enum(['OWNER', 'MANAGER', 'RECEPTIONIST', 'BARBER']);

/** Valor monetário: aceita "50", "50.5", 50.5 → string com até 2 casas. Rejeita negativos e mais de 2 casas. */
export const moneyInput = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(',', '.'))
  .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v), 'Valor inválido (use até 2 casas decimais).');

export const positiveMoney = moneyInput.refine((v) => Number(v) > 0, 'O valor deve ser maior que zero.');

export const percentInput = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(',', '.'))
  .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100, 'Percentual entre 0 e 100.');

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (AAAA-MM-DD).');
export const isoDateTime = z.iso.datetime({ offset: true, message: 'Data e hora inválidas.' }).transform((v) => new Date(v));

export const optionalText = (max = 500) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v === '' ? null : v));

/** URL de imagem: caminho de upload próprio (/uploads/...) ou https. */
export const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith('/uploads/') || /^https:\/\/[^\s]+$/.test(v), 'Imagem inválida.')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));

export const minutesOfDay = z.number().int().min(0).max(1440);
export const weekday = z.number().int().min(0).max(6);

export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
};

export const csvUuids = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').filter(Boolean) : []))
  .pipe(z.array(uuid));

/**
 * Versão "atualização parcial" de um objeto: todos os campos opcionais e SEM valores padrão
 * (no Zod 4, .partial() ainda aplicaria os defaults e sobrescreveria dados existentes).
 */
export function partialNoDefaults(schema) {
  return z.object(
    Object.fromEntries(
      Object.entries(schema.shape).map(([k, v]) => [k, (v instanceof z.ZodDefault ? v.unwrap() : v).optional()]),
    ),
  );
}
