import { z } from 'zod';
import {
  partialNoDefaults, uuid, optionalText, imageUrl, moneyInput, percentInput, isoDateTime, minutesOfDay, weekday, email, password, pageQuery,
} from './common.js';

// ── Clientes ──
export const clientBody = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length >= 10 && v.length <= 13, 'Telefone inválido (DDD + número).'),
  email: z.email().max(254).optional().nullable().or(z.literal('').transform(() => null)),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('').transform(() => null)),
  notes: optionalText(1000),
});
export const clientUpdateBody = partialNoDefaults(clientBody);
export const clientListQuery = z.object({ search: z.string().trim().max(80).optional(), ...pageQuery });

// ── Barbeiros ──
const compensationModel = z.enum(['COMMISSION', 'FIXED', 'FIXED_PLUS_COMMISSION', 'CHAIR_RENTAL', 'CHAIR_RENTAL_PLUS_COMMISSION']);

export const barberBody = z.object({
  name: z.string().trim().min(2).max(120),
  photoUrl: imageUrl,
  phone: optionalText(20),
  email: z.email().max(254).optional().nullable().or(z.literal('').transform(() => null)),
  bio: optionalText(1000),
  specialties: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE']).default('ACTIVE'),
  serviceIds: z.array(uuid).max(200).default([]),
  units: z.array(z.object({ unitId: uuid, compensationModel, isActive: z.boolean().default(true) })).max(50).default([]),
});
export const barberUpdateBody = partialNoDefaults(barberBody);

export const barberLoginBody = z.object({ email, password });

export const scheduleBody = z.object({
  days: z
    .array(
      z
        .object({
          weekday,
          startMin: minutesOfDay,
          endMin: minutesOfDay,
          breakStartMin: minutesOfDay.nullable().optional(),
          breakEndMin: minutesOfDay.nullable().optional(),
        })
        .refine((d) => d.endMin > d.startMin, 'Fim do expediente deve ser depois do início.')
        .refine(
          (d) =>
            (d.breakStartMin == null && d.breakEndMin == null) ||
            (d.breakStartMin != null && d.breakEndMin != null && d.breakStartMin >= d.startMin && d.breakEndMin <= d.endMin && d.breakEndMin > d.breakStartMin),
          'Intervalo deve estar dentro do expediente.',
        ),
    )
    .max(7)
    .refine((d) => new Set(d.map((x) => x.weekday)).size === d.length, 'Dia repetido.'),
});

export const timeOffBody = z
  .object({ unitId: uuid.nullable().optional(), startsAt: isoDateTime, endsAt: isoDateTime, reason: optionalText(200) })
  .refine((v) => v.endsAt > v.startsAt, 'O fim deve ser depois do início.');

export const barberTimeOffParams = z.object({ id: uuid, timeOffId: uuid });
export const barberUnitParams = z.object({ id: uuid, unitId: uuid });

// ── Serviços ──
export const categoryBody = z.object({ name: z.string().trim().min(2).max(60), sortOrder: z.number().int().default(0) });

const offer = z
  .object({
    unitId: uuid,
    price: moneyInput,
    durationMin: z.number().int().min(5).max(480),
    promoPrice: moneyInput.nullable().optional(),
    promoStart: isoDateTime.nullable().optional(),
    promoEnd: isoDateTime.nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((o) => !o.promoPrice || (o.promoStart && o.promoEnd && o.promoEnd > o.promoStart), 'Promoção precisa de início e fim.')
  .refine((o) => !o.promoPrice || Number(o.promoPrice) < Number(o.price), 'Preço promocional deve ser menor que o preço normal.');

export const serviceBody = z.object({
  name: z.string().trim().min(2).max(80),
  description: optionalText(1000),
  imageUrl,
  categoryId: uuid.nullable().optional(),
  isCombo: z.boolean().default(false),
  commissionPct: percentInput.nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  sortOrder: z.number().int().default(0),
  offers: z.array(offer).max(50).default([]),
  barberIds: z.array(uuid).max(200).optional(),
});
export const serviceUpdateBody = partialNoDefaults(serviceBody);

// ── Produtos e estoque ──
export const productBody = z.object({
  name: z.string().trim().min(2).max(80),
  description: optionalText(1000),
  imageUrl,
  sku: optionalText(40),
  price: moneyInput,
  cost: moneyInput,
  commissionPct: percentInput.nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export const productUpdateBody = partialNoDefaults(productBody);

export const stockMoveBody = z.object({
  unitId: uuid,
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT']),
  quantity: z.number().int().min(0).max(100000), // em ADJUSTMENT, é a quantidade final contada
  unitCost: moneyInput.optional(),
  reason: optionalText(200),
  minQuantity: z.number().int().min(0).max(100000).optional(),
});

export const stockTransferBody = z
  .object({ fromUnitId: uuid, toUnitId: uuid, quantity: z.number().int().min(1).max(100000), reason: optionalText(200) })
  .refine((v) => v.fromUnitId !== v.toUnitId, 'Escolha unidades diferentes.');
