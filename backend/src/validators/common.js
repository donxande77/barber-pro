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
