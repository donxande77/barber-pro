import { z } from 'zod';
import { minutesOfDay, optionalText, weekday, moneyInput, partialNoDefaults } from './common.js';
import { isValidTimeZone } from '../utils/time.js';

const hours = z
  .array(z.object({ weekday, openMin: minutesOfDay, closeMin: minutesOfDay }))
  .max(7)
  .refine((h) => new Set(h.map((x) => x.weekday)).size === h.length, 'Dia da semana repetido.')
  .refine((h) => h.every((x) => x.closeMin > x.openMin), 'O fechamento deve ser depois da abertura.');

const unitFields = {
  name: z.string().trim().min(2, 'Informe o nome.').max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífen.')
    .max(60),
  timezone: z.string().refine(isValidTimeZone, 'Fuso horário inválido.').default('America/Sao_Paulo'),
  street: optionalText(120),
  number: optionalText(20),
  district: optionalText(80),
  city: optionalText(80),
  state: optionalText(2),
  zipCode: optionalText(10),
  phone: optionalText(20),
  whatsapp: optionalText(20),
  email: z.email().max(254).optional().nullable().or(z.literal('').transform(() => null)),
  instagramUrl: optionalText(200),
  cancellationPolicy: optionalText(2000),
  minCancelHours: z.number().int().min(0).max(168).default(2),
  slotStepMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(60)]).default(15),
  hours: hours.default([]),
};

export const createUnitBody = z.object({
  ...unitFields,
  openingCash: moneyInput.default('0'),
});

export const updateUnitBody = partialNoDefaults(z.object(unitFields))
  .extend({ status: z.enum(['ACTIVE', 'INACTIVE']).optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar.');

export const companyBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  document: optionalText(20),
});
