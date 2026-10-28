import request from 'supertest';
import { prisma } from '../../db/prisma.js';
import { hashPassword } from '../../utils/crypto.js';
import { createApp } from '../../app.js';

export const app = createApp();
export const PASSWORD = 'SenhaForte123';

let hashCache;
const passwordHash = async () => (hashCache ??= await hashPassword(PASSWORD));

/** Limpa todas as tabelas (mantém a estrutura). */
export async function truncateAll() {
  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function createCompany(name = 'Empresa') {
  return prisma.company.create({ data: { name, slug: `emp-${uniq()}` } });
}

export async function createUnit(companyId, name = 'Unidade') {
  return prisma.unit.create({ data: { companyId, name, slug: `un-${uniq()}` } });
}

export async function createUser(companyId, role, { unitIds = [], email, status = 'ACTIVE' } = {}) {
  return prisma.user.create({
    data: {
      companyId,
      role,
      status,
      name: `${role} ${uniq()}`,
      email: email ?? `${role.toLowerCase()}-${uniq()}@teste.dev`,
      passwordHash: await passwordHash(),
      unitAccess: unitIds.length ? { create: unitIds.map((unitId) => ({ unitId })) } : undefined,
    },
  });
}

export async function createBarberUser(companyId, unitIds) {
  const user = await createUser(companyId, 'BARBER');
  const barber = await prisma.barber.create({
    data: {
      companyId,
      userId: user.id,
      name: user.name,
      units: { create: unitIds.map((unitId) => ({ unitId })) },
    },
  });
  return { user, barber };
}

/** Faz login e devolve um "cliente" que já envia cookie e X-CSRF-Token. */
export async function loginAs(user, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password });
  if (res.status !== 200) throw new Error(`Login falhou (${res.status}): ${JSON.stringify(res.body)}`);
  const csrf = res.body.csrfToken;
  const withCsrf = (method) => (url) => agent[method](url).set('X-CSRF-Token', csrf);
  return {
    agent,
    csrf,
    me: res.body,
    get: (url) => agent.get(url),
    post: withCsrf('post'),
    patch: withCsrf('patch'),
    put: withCsrf('put'),
    delete: withCsrf('delete'),
  };
}
