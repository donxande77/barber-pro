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

/**
 * Cenário completo: empresa, 2 unidades (abertas todos os dias 09:00–19:00), contas,
 * barbeiro com login e escala, serviço "Corte" (R$ 50, 30 min) e produto "Pomada" (R$ 40, custo 15).
 */
export async function scenario() {
  const company = await createCompany('Barbearia Cenário');
  const hours = Array.from({ length: 7 }, (_, weekday) => ({ weekday, openMin: 540, closeMin: 1140 }));
  const mkUnit = (name) =>
    prisma.unit.create({
      data: {
        companyId: company.id, name, slug: `u-${uniq()}`, minCancelHours: 2,
        hours: { create: hours },
        accounts: { create: [{ name: 'Caixa', type: 'CASH' }, { name: 'Banco', type: 'BANK' }] },
      },
      include: { accounts: true },
    });
  const unitA = await mkUnit('Centro');
  const unitB = await mkUnit('Bairro');
  const owner = await createUser(company.id, 'OWNER');
  const managerA = await createUser(company.id, 'MANAGER', { unitIds: [unitA.id] });
  const receptionistA = await createUser(company.id, 'RECEPTIONIST', { unitIds: [unitA.id] });
  const service = await prisma.service.create({
    data: { companyId: company.id, name: 'Corte', offers: { create: [{ unitId: unitA.id, price: '50.00', durationMin: 30 }, { unitId: unitB.id, price: '55.00', durationMin: 30 }] } },
  });
  const beard = await prisma.service.create({
    data: { companyId: company.id, name: 'Barba', offers: { create: [{ unitId: unitA.id, price: '35.00', durationMin: 20 }] } },
  });
  const product = await prisma.product.create({
    data: { companyId: company.id, name: 'Pomada', price: '40.00', cost: '15.00', stocks: { create: [{ unitId: unitA.id, quantity: 10 }] } },
  });
  const mkBarber = async (name, model = 'COMMISSION') => {
    const { user, barber } = await createBarberUser(company.id, [unitA.id]);
    await prisma.barber.update({ where: { id: barber.id }, data: { name, services: { create: [{ serviceId: service.id }, { serviceId: beard.id }] } } });
    const link = await prisma.barberUnit.update({ where: { barberId_unitId: { barberId: barber.id, unitId: unitA.id } }, data: { compensationModel: model } });
    await prisma.barberSchedule.createMany({
      data: Array.from({ length: 7 }, (_, weekday) => ({ barberUnitId: link.id, weekday, startMin: 540, endMin: 1140, breakStartMin: 720, breakEndMin: 780 })),
    });
    return { user, barber: { ...barber, name } };
  };
  const b1 = await mkBarber('João');
  const b2 = await mkBarber('Pedro');
  const client = await prisma.client.create({ data: { companyId: company.id, name: 'Carlos Lima', phone: '11988887777' } });
  const acc = (unit, name) => unit.accounts.find((a) => a.name === name);
  return { company, unitA, unitB, owner, managerA, receptionistA, service, beard, product, b1, b2, client, acc };
}

/** Data (AAAA-MM-DD) daqui a N dias no fuso de São Paulo. */
export function futureDate(days = 3) {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

/** Instante ISO para data local + HH:MM em São Paulo (UTC-3, sem horário de verão). */
export const spAt = (date, hhmm) => new Date(`${date}T${hhmm}:00-03:00`).toISOString();
