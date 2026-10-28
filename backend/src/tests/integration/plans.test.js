import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { DateTime } from 'luxon';
import { prisma } from '../../db/prisma.js';
import { periodAt, periodIndexOn } from '../../services/plan.service.js';
import { app, truncateAll, scenario, loginAs, createCompany } from '../helpers/factory.js';

let s, owner;
const today = () => DateTime.now().setZone('America/Sao_Paulo').toISODate();
const daysAgo = (n) => DateTime.now().setZone('America/Sao_Paulo').minus({ days: n }).toISODate();
const range = () => `from=${daysAgo(40)}&to=${today()}`;

beforeEach(async () => {
  await truncateAll();
  s = await scenario();
  owner = await loginAs(s.owner);
  await prisma.service.updateMany({ where: { companyId: s.company.id }, data: { commissionPct: '40' } });
});

const createPlan = (client = owner, extra = {}) =>
  client.post('/api/plans').send({
    name: 'Corte + Barba',
    price: '120,00',
    items: [{ serviceId: s.service.id, quantity: 4 }, { serviceId: s.beard.id, quantity: 2 }],
    ...extra,
  });

async function subscribe(client = owner, extra = {}) {
  const plan = extra.plan ?? (await createPlan()).body;
  const res = await client.post('/api/subscriptions').send({
    clientId: s.client.id, planId: plan.id, unitId: s.unitA.id,
    payment: { accountId: s.acc(s.unitA, 'Caixa').id, method: 'PIX' },
    ...extra.body,
  });
  return { plan, res };
}

const openSale = (client, items) =>
  client.post('/api/sales').send({ unitId: s.unitA.id, clientId: s.client.id, items });
const cut = (extra = {}) => ({ kind: 'SERVICE', serviceId: s.service.id, barberId: s.b1.barber.id, ...extra });

describe('períodos mensais', () => {
  it('ancora no dia de início e ajusta fim de mês', () => {
    expect(periodAt('2026-01-31', 1)).toEqual({ start: '2026-02-28', end: '2026-03-31' });
    expect(periodIndexOn('2026-01-31', '2026-03-30')).toBe(1);
    expect(periodIndexOn('2026-01-31', '2026-03-31')).toBe(2);
    expect(periodIndexOn('2026-01-31', '2026-01-30')).toBe(-1);
    expect(periodIndexOn('2026-10-28', '2027-10-28')).toBe(12);
  });
});

describe('planos — cadastro e permissões', () => {
  it('proprietário cria; gerente e recepção não criam mas consultam', async () => {
    const res = await createPlan();
    expect(res.status).toBe(201);
    expect(res.body.price).toBe('120');
    expect(res.body.items).toHaveLength(2);
    const m = await loginAs(s.managerA);
    expect((await createPlan(m)).status).toBe(403);
    const r = await loginAs(s.receptionistA);
    expect((await r.get('/api/plans')).status).toBe(200);
    const b = await loginAs(s.b1.user);
    expect((await b.get('/api/plans')).status).toBe(403);
  });

  it('valida serviços (sem repetição, da própria empresa) e preço positivo', async () => {
    expect((await createPlan(owner, { items: [{ serviceId: s.service.id }, { serviceId: s.service.id }] })).status).toBe(400);
    expect((await createPlan(owner, { price: '0' })).status).toBe(400);
    const other = await createCompany('Outra');
    const svc = await prisma.service.create({ data: { companyId: other.id, name: 'Corte X' } });
    expect((await createPlan(owner, { items: [{ serviceId: svc.id }] })).status).toBe(400);
  });

  it('site público lista só planos ativos', async () => {
    await createPlan();
    await createPlan(owner, { name: 'Antigo', status: 'INACTIVE' });
    const res = await request(app).get('/api/public/plans');
    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.name)).toEqual(['Corte + Barba']);
    expect(res.body[0].items).toEqual([{ serviceName: 'Barba', quantity: 2 }, { serviceName: 'Corte', quantity: 4 }]); // ordem alfabética
  });
});

describe('assinaturas e mensalidades', () => {
  it('assinar gera a 1ª mensalidade paga e entra no financeiro como mensalidade', async () => {
    const { res } = await subscribe();
    expect(res.status).toBe(201);
    expect(res.body.charges).toHaveLength(1);
    expect(res.body.charges[0].status).toBe('PAID');
    expect(res.body.paymentStatus).toBe('OK');
    const fin = await owner.get(`/api/finance/summary?unitId=${s.unitA.id}&${range()}`);
    expect(fin.body.summary.subscriptionReceipts).toBe('120.00');
    expect(fin.body.summary.receipts).toBe('0.00'); // não é venda
    expect(fin.body.summary.revenue).toBe('0.00');
    expect(fin.body.summary.plans.activeSubscribers).toBe(1);
    expect(fin.body.summary.plans.mrr).toBe('120.00');
  });

  it('não permite o mesmo plano duas vezes em aberto para o cliente', async () => {
    const { plan } = await subscribe();
    const again = await subscribe(owner, { plan });
    expect(again.res.status).toBe(409);
  });

  it('alterar o plano não muda assinaturas existentes (cópia na contratação)', async () => {
    const { plan, res } = await subscribe();
    await owner.patch(`/api/plans/${plan.id}`).send({ price: '150.00', items: [{ serviceId: s.service.id, quantity: 1 }] });
    const sub = (await owner.get(`/api/subscriptions/${res.body.id}`)).body;
    expect(sub.price).toBe('120');
    expect(sub.planSnapshot.items).toHaveLength(2);
  });

  it('gera mensalidades atrasadas sem duplicar; estorno do recebimento reabre a mensalidade', async () => {
    const { res } = await subscribe(owner, { body: { startDate: daysAgo(65), payment: undefined } });
    const gen = await owner.post('/api/subscription-charges/generate').send({});
    expect(gen.body.created).toBe(2); // 3 períodos no total
    expect((await owner.post('/api/subscription-charges/generate').send({})).body.created).toBe(0);
    const charges = (await owner.get(`/api/subscription-charges?unitId=${s.unitA.id}`)).body;
    expect(charges).toHaveLength(3);
    expect(charges.filter((c) => c.overdue).length).toBeGreaterThanOrEqual(2); // o 3º período pode ter vencido há poucos dias
    const first = charges[0];
    const paid = await owner.post(`/api/subscription-charges/${first.id}/pay`).send({ accountId: s.acc(s.unitA, 'Caixa').id, method: 'CASH' });
    expect(paid.body.status).toBe('PAID');
    expect((await owner.post(`/api/subscription-charges/${first.id}/pay`).send({ accountId: s.acc(s.unitA, 'Caixa').id, method: 'CASH' })).status).toBe(400);
    const tx = await prisma.financialTransaction.findFirst({ where: { chargeId: first.id } });
    expect((await owner.post(`/api/finance/transactions/${tx.id}/reverse`).send({ reason: 'Pix devolvido' })).status).toBe(201);
    expect((await prisma.subscriptionCharge.findUnique({ where: { id: first.id } })).status).toBe('OPEN');
    const fin = await owner.get(`/api/finance/summary?unitId=${s.unitA.id}&${range()}`);
    expect(fin.body.summary.subscriptionReceipts).toBe('0.00');
    const sub = (await owner.get(`/api/subscriptions/${res.body.id}`)).body;
    expect(sub.paymentStatus).toBe('BLOCKED');
  });

  it('pausar não cobre; cancelar cancela as mensalidades em aberto', async () => {
    const { res } = await subscribe(owner, { body: { payment: undefined } });
    const id = res.body.id;
    expect((await owner.post(`/api/subscriptions/${id}/status`).send({ action: 'pause' })).body.status).toBe('PAUSED');
    const sale = (await openSale(owner, [cut()])).body;
    expect(sale.items[0].subscriptionId).toBeNull();
    expect(sale.total).toBe('50');
    expect((await owner.post(`/api/subscriptions/${id}/status`).send({ action: 'cancel' })).status).toBe(400); // exige motivo
    const c = await owner.post(`/api/subscriptions/${id}/status`).send({ action: 'cancel', reason: 'Mudou de cidade' });
    expect(c.body.status).toBe('CANCELLED');
    expect(c.body.charges.every((x) => x.status === 'CANCELLED')).toBe(true);
  });

  it('recepção da unidade A não vê assinaturas da unidade B', async () => {
    const plan = (await createPlan()).body;
    await owner.post('/api/subscriptions').send({ clientId: s.client.id, planId: plan.id, unitId: s.unitB.id });
    const r = await loginAs(s.receptionistA);
    expect((await r.get('/api/subscriptions')).body).toHaveLength(0);
    expect((await r.post('/api/subscriptions').send({ clientId: s.client.id, planId: plan.id, unitId: s.unitB.id })).status).toBe(403);
  });
});

describe('cobertura nos atendimentos', () => {
  it('cobre o serviço do plano: item zerado, valor coberto guardado e comissão sobre o preço de tabela', async () => {
    await subscribe();
    const sale = (await openSale(owner, [cut(), { kind: 'PRODUCT', productId: s.product.id, barberId: s.b1.barber.id }])).body;
    const svc = sale.items.find((i) => i.kind === 'SERVICE');
    expect(svc.subscriptionId).toBeTruthy();
    expect(svc.coveredAmount).toBe('50');
    expect(svc.total).toBe('0');
    expect(sale.total).toBe('40'); // só o produto
    await owner.post(`/api/sales/${sale.id}/close`);
    const item = await prisma.saleItem.findUnique({ where: { id: svc.id } });
    expect(item.commissionAmount.toFixed(2)).toBe('20.00'); // 40% de R$ 50 (plano comissiona sobre o coberto)
  });

  it('plano configurado sem comissão no coberto gera comissão zero', async () => {
    const plan = (await createPlan(owner, { commissionOnCovered: false })).body;
    await subscribe(owner, { plan });
    const sale = (await openSale(owner, [cut()])).body;
    await owner.post(`/api/sales/${sale.id}/close`);
    const item = await prisma.saleItem.findFirst({ where: { saleId: sale.id } });
    expect(item.commissionAmount.toFixed(2)).toBe('0.00');
    expect(await prisma.barberObligation.count()).toBe(0);
  });

  it('respeita o limite mensal e libera de novo se a venda for cancelada', async () => {
    const plan = (await createPlan(owner, { items: [{ serviceId: s.service.id, quantity: 1 }] })).body;
    await subscribe(owner, { plan });
    const first = (await openSale(owner, [cut()])).body;
    expect(first.items[0].subscriptionId).toBeTruthy();
    const second = (await openSale(owner, [cut()])).body;
    expect(second.items[0].subscriptionId).toBeNull();
    expect(second.total).toBe('50');
    const tryCover = await owner.patch(`/api/sales/${second.id}/items/${second.items[0].id}`).send({ covered: true });
    expect(tryCover.status).toBe(400);
    expect(tryCover.body.error.message).toMatch(/Limite do plano/);
    await owner.post(`/api/sales/${first.id}/cancel`).send({ reason: 'Lançado errado' });
    const now = await owner.patch(`/api/sales/${second.id}/items/${second.items[0].id}`).send({ covered: true });
    expect(now.status).toBe(200);
    expect(now.body.total).toBe('0');
  });

  it('"Cobrar normalmente" remove a cobertura do item', async () => {
    await subscribe();
    const sale = (await openSale(owner, [cut()])).body;
    const res = await owner.patch(`/api/sales/${sale.id}/items/${sale.items[0].id}`).send({ covered: false });
    expect(res.body.items[0].subscriptionId).toBeNull();
    expect(res.body.total).toBe('50');
    const skip = (await openSale(owner, [cut({ useSubscription: false })])).body;
    expect(skip.items[0].subscriptionId).toBeNull();
  });

  it('mensalidade vencida há mais de 5 dias bloqueia a cobertura', async () => {
    await subscribe(owner, { body: { startDate: daysAgo(10), payment: undefined } });
    const sale = (await openSale(owner, [cut()])).body;
    expect(sale.items[0].subscriptionId).toBeNull();
    const res = await owner.patch(`/api/sales/${sale.id}/items/${sale.items[0].id}`).send({ covered: true });
    expect(res.body.error.message).toMatch(/Mensalidade vencida/);
  });

  it('dentro da tolerância, cobre mesmo com a mensalidade em aberto', async () => {
    await subscribe(owner, { body: { startDate: daysAgo(3), payment: undefined } });
    const sale = (await openSale(owner, [cut()])).body;
    expect(sale.items[0].subscriptionId).toBeTruthy();
  });

  it('atendimento aberto pelo agendamento já vem coberto; venda sem cliente não é coberta', async () => {
    await subscribe();
    const date = DateTime.now().setZone('America/Sao_Paulo').plus({ days: 1 }).toISODate();
    const appt = await owner.post('/api/appointments').send({
      unitId: s.unitA.id, serviceIds: [s.service.id, s.beard.id], barberId: s.b1.barber.id,
      startsAt: new Date(`${date}T10:00:00-03:00`).toISOString(), clientId: s.client.id,
    });
    expect(appt.status).toBe(201);
    const sale = (await owner.post('/api/sales').send({ unitId: s.unitA.id, appointmentId: appt.body.id })).body;
    expect(sale.items.every((i) => i.subscriptionId)).toBe(true);
    expect(sale.total).toBe('0');
    // Fecha sem pagamento: total zero, comissão já devida
    await owner.post(`/api/sales/${sale.id}/close`);
    const st = await owner.get(`/api/compensation/statement?barberId=${s.b1.barber.id}&unitId=${s.unitA.id}&from=${today()}&to=${date}`);
    expect(st.body.summary.due).toBe('34.00'); // 40% de (50 + 35)
    const anon = (await owner.post('/api/sales').send({ unitId: s.unitA.id, items: [cut()] })).body;
    expect(anon.items[0].subscriptionId).toBeNull();
  });

  it('plano exclusivo de outra unidade não cobre', async () => {
    const plan = (await createPlan(owner, { unitId: s.unitB.id })).body;
    const r = await owner.post('/api/subscriptions').send({ clientId: s.client.id, planId: plan.id, unitId: s.unitA.id });
    expect(r.status).toBe(400);
  });

  it('dashboards e relatório de unidade mostram os indicadores de planos', async () => {
    await subscribe();
    const sale = (await openSale(owner, [cut()])).body;
    await owner.post(`/api/sales/${sale.id}/close`);
    const dash = await owner.get(`/api/dashboard/owner?${range()}`);
    expect(dash.body.summary.plans.coveredServices).toBe(1);
    expect(dash.body.summary.plans.coveredValue).toBe('50.00');
    const rep = await owner.get(`/api/reports/unit?unitId=${s.unitA.id}&${range()}&format=csv`);
    expect(rep.status).toBe(200);
    expect(rep.text).toContain('Mensalidades de planos recebidas');
  });
});
