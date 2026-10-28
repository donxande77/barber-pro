import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  // Lista separada por vírgula das origens autorizadas a chamar a API com cookies.
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  SESSION_COOKIE_NAME: z.string().default('bp_session'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  SESSION_IDLE_MINUTES: z.coerce.number().positive().default(120),
  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  LOGIN_RATE_LIMIT_PER_15MIN: z.coerce.number().int().positive().default(20),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuração inválida:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
};
