import { z } from 'zod';
import { email, password, role, uuid } from './common.js';

export const createUserBody = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  email,
  password,
  role,
  unitIds: z.array(uuid).max(200).default([]),
});

export const updateUserBody = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    role: role.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    unitIds: z.array(uuid).max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar.');

export const listUsersQuery = z.object({
  role: role.optional(),
  unitId: uuid.optional(),
});
