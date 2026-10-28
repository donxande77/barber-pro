import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../db/prisma.js';
import { truncateAll, createCompany, createUnit, createBarberUser } from '../helpers/factory.js';

let company, unit, barber, client;

const at = (h, m = 0) => new Date(Date.UTC(2026, 10, 10, h, m));

function appointment(startH, startM, endH, endM, extra = {}) {
  return prisma.appointment.create({
    data: {
      unitId: unit.id,
      clientId: client.id,
      barberId: barber.id,
      startsAt: at(startH, startM),
      endsAt: at(endH, endM),
      source: 'INTERNAL',
      totalPrice: '50.00',
      totalDuration: 30,
      ...extra,
    },
  });
}

beforeEach(async () => {
  await truncateAll();
  company = await createCompany();
  unit = await createUnit(company.id);
  ({ barber } = await createBarberUser(company.id, [unit.id]));
  client = await prisma.client.create({ data: { companyId: company.id, name: 'Cliente', phone: '11999990000' } });
});

describe('agenda: proteção contra conflito no banco', () => {
  it('recusa sobreposição para o mesmo barbeiro', async () => {
    await appointment(13, 0, 13, 30);
    await expect(appointment(13, 15, 13, 45)).rejects.toThrow();
  });

  it('permite horários encostados (fim = início do próximo)', async () => {
    await appointment(13, 0, 13, 30);
    await expect(appointment(13, 30, 14, 0)).resolves.toBeTruthy();
  });

  it('agendamento cancelado libera o horário', async () => {
    await appointment(13, 0, 13, 30, { status: 'CANCELLED' });
    await expect(appointment(13, 0, 13, 30)).resolves.toBeTruthy();
  });

  it('requisições simultâneas: só uma é gravada', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => appointment(15, 0, 15, 45)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.appointment.count()).toBe(1);
  });

  it('fim antes do início é recusado', async () => {
    await expect(appointment(14, 0, 13, 0)).rejects.toThrow();
  });
});

describe('integridade financeira no banco', () => {
  it('valores monetários são DECIMAL exatos', async () => {
    const acc = await prisma.financialAccount.create({ data: { unitId: unit.id, name: 'Caixa', type: 'CASH', openingBalance: '0.10' } });
    const tx = await prisma.financialTransaction.create({
      data: { unitId: unit.id, accountId: acc.id, direction: 'IN', kind: 'INCOME', amount: '0.20' },
    });
    const [{ total }] = await prisma.$queryRaw`
      SELECT (a."openingBalance" + t.amount)::text AS total
      FROM "FinancialAccount" a JOIN "FinancialTransaction" t ON t."accountId" = a.id WHERE t.id = ${tx.id}::uuid`;
    expect(total).toBe('0.30');
  });

  it('movimentação com valor zero ou negativo é recusada', async () => {
    const acc = await prisma.financialAccount.create({ data: { unitId: unit.id, name: 'Caixa', type: 'CASH' } });
    await expect(
      prisma.financialTransaction.create({ data: { unitId: unit.id, accountId: acc.id, direction: 'OUT', kind: 'EXPENSE', amount: '-5' } }),
    ).rejects.toThrow();
  });

  it('um estorno por movimentação (reversalOfId único)', async () => {
    const acc = await prisma.financialAccount.create({ data: { unitId: unit.id, name: 'Caixa', type: 'CASH' } });
    const orig = await prisma.financialTransaction.create({
      data: { unitId: unit.id, accountId: acc.id, direction: 'IN', kind: 'INCOME', amount: '10' },
    });
    const rev = { unitId: unit.id, accountId: acc.id, direction: 'OUT', kind: 'REVERSAL', amount: '10', reversalOfId: orig.id };
    await prisma.financialTransaction.create({ data: rev });
    await expect(prisma.financialTransaction.create({ data: rev })).rejects.toThrow();
  });

  it('regra de comissão percentual exige percentual entre 0 e 100', async () => {
    const base = { companyId: company.id, barberId: barber.id, type: 'SERVICE_COMMISSION_PCT', validFrom: new Date() };
    await expect(prisma.compensationRule.create({ data: { ...base, percent: '140' } })).rejects.toThrow();
    await expect(prisma.compensationRule.create({ data: { ...base, percent: '40' } })).resolves.toBeTruthy();
  });

  it('apenas uma configuração visual publicada por empresa', async () => {
    await prisma.siteConfigVersion.create({ data: { companyId: company.id, version: 1, status: 'PUBLISHED', data: {} } });
    await expect(
      prisma.siteConfigVersion.create({ data: { companyId: company.id, version: 2, status: 'PUBLISHED', data: {} } }),
    ).rejects.toThrow();
  });
});
