import { z } from 'zod';
import { password } from './common.js';

export const loginBody = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail.').max(254),
  password: z.string().min(1, 'Informe a senha.').max(128),
});

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});
