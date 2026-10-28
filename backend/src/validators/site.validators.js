import { z } from 'zod';
import { imageUrl } from './common.js';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida (use #RRGGBB).');
const text = (max) => z.string().max(max).default('');
const url = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === '' || /^https:\/\/[^\s]+$/.test(v), 'Use um link https://')
  .nullable()
  .default(null)
  .transform((v) => v || null);

export const SECTIONS = ['hero', 'about', 'services', 'promotions', 'barbers', 'gallery', 'products', 'reviews', 'units', 'policies'];
export const FONTS = ['Playfair Display', 'Cormorant Garamond', 'Bebas Neue', 'Oswald', 'DM Serif Display', 'Inter', 'Manrope', 'Lato'];

export const siteConfigSchema = z.object({
  brand: z.object({
    name: z.string().trim().min(1).max(80),
    tagline: text(160),
    logoUrl: imageUrl.default(null),
  }),
  colors: z.object({
    background: hex,
    surface: hex,
    graphite: hex,
    text: hex,
    muted: hex,
    accent: hex,
    accentContrast: hex,
  }),
  fonts: z.object({ heading: z.enum(FONTS), body: z.enum(FONTS) }),
  hero: z.object({
    title: text(120),
    subtitle: text(300),
    imageUrl: imageUrl.default(null),
    ctaLabel: z.string().max(40).default('Agendar horário'),
  }),
  about: z.object({ title: text(80), text: text(3000), imageUrl: imageUrl.default(null) }),
  sections: z
    .array(z.enum(SECTIONS))
    .max(SECTIONS.length)
    .refine((s) => new Set(s).size === s.length, 'Seção repetida.'),
  gallery: z.array(z.object({ imageUrl: imageUrl.refine((v) => !!v, 'Envie a imagem.'), caption: text(120) })).max(40).default([]),
  social: z.object({ instagram: url, facebook: url, tiktok: url, whatsapp: z.string().max(20).nullable().default(null) }),
  policies: z.object({ cancellation: text(3000) }),
});

export const draftBody = z.object({
  data: siteConfigSchema,
  note: z.string().trim().max(160).optional(),
});

export const uploadBody = z.object({
  fileName: z.string().max(200).optional(),
  dataBase64: z.string().min(10).max(7_000_000, 'Imagem muito grande (máximo 5 MB).'),
});
