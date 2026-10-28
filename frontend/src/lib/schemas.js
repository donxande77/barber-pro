// Validações de formulário. Espelham o backend para dar retorno imediato,
// mas o backend continua validando tudo.
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe a senha.'),
});

export const passwordRule = z
  .string()
  .min(10, 'Mínimo de 10 caracteres.')
  .max(128, 'Máximo de 128 caracteres.')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Use letras e números.');

export const userSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.'),
  email: z.email('Informe um e-mail válido.'),
  password: passwordRule,
  role: z.enum(['OWNER', 'MANAGER', 'RECEPTIONIST']),
  unitIds: z.array(z.string()),
}).refine((v) => v.role === 'OWNER' || v.unitIds.length > 0, {
  path: ['unitIds'],
  message: 'Selecione ao menos uma unidade.',
});

export const ROLE_LABELS = {
  OWNER: 'Proprietário',
  MANAGER: 'Gerente',
  RECEPTIONIST: 'Recepcionista',
  BARBER: 'Barbeiro',
};
