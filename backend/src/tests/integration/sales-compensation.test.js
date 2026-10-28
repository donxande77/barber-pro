import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../db/prisma.js';
import { truncateAll, scenario, loginAs, futureDate, spAt } from '../helpers/factory.js';

let s, owner, recep, date, today;

beforeEach(async () => {
  await truncateAll();
  s = await scenario();
  owner = await loginAs(s.owner);
  recep = await loginAs(s.receptionistA);
  date = futureDate(2);
  today = futureDate(0);
  // Regra: João recebe 40% nos serviços e 10% nos produtos, vigente desde ontem
  const validFrom = new Date(Date.now() - 86_400_000).toISOString();
  await owner.post('/api/compensation/rules').send({ barberId: s.b1.barber.id, type: 'SERVICE_COMMISSION_PCT', percent: '40', validFrom }).expect(201);
  await owner.post('/api/compensation/rules').send({ barberId: s.b1.barber.id, type: 'PRODUCT_COMMISSION_PCT', percent: '10', validFrom }).expect(201);
});

async function appointment(time = '10:00', barber = s.b1.barber) {
  const res = await recep.post('/api/appointments').send({ unitId: s.unitA.id, serviceIds: [s.service.id], barberId: barber.id, startsAt: spAt(date, time), clientId: s.client.id });
  expect(res.status).toBe(201);
  return res.body;
}

async function closedSale({ withProduct = true } = {}) {
  const appt = await appointment();
  const sale = (await recep.post('/api/sales').send({ unitId: s.unitA.id, appointmentId: appt.id })).body;
  if (withProduct) {
    await recep.post(`/api/sales/${sale.id}/items`).send({ kind: 'PRODUCT', productId: s.product.id, barberId: s.b1.barber.id, quantity: 1 }).expect(200);
  }
  const closed = await recep.post(`/api/sales/${sale.id}/close`);
  expect(closed.status).toBe(200);
  return { appt, sale: closed.body };
}

const statement = (client = owner, extra = '') =>
  client.get(`/api/compensation/statement?barberId=${s.b1.barber.id}&from=${today}&to=${today}${extra}`);

describe('atendimento e venda', () => {
  it('abre atendimento a partir do agendamento com o preço combinado', async () => {
    const appt = await appointment();
    await prisma.serviceUnit.updateMany({ where: { serviceId: s.service.id }, data: { price: '80.00' } }); // aumento depois do agendamento
    const res = await recep.post('/api/sales').send({ unitId: s.unitA.id, appointmentId: appt.id });
    expect(res.status).toBe(201);
    expect(res.body.items[0].unitPrice).toBe('50');
    expect(res.body.total).toBe('50');
    expect((await prisma.appointment.findUnique({ where: { id: appt.id } })).status).toBe('CHECKED_IN');
  });

  it('não permite dois atendimentos para o mesmo agendamento', async () => {
    const appt = await appointment();
    await recep.post('/api/sales').send({ unitId: s.unitA.id, appointmentId: appt.id }).expect(201);
    const dup = await recep.post('/api/sales').send({ unitId: s.unitA.id, appointmentId: appt.id });
    expect(dup.status).toBe(409);
  });

  it('fechar a venda: baixa estoque, comissões com snapshot, conclui agendamento e NÃO conta como recebido', async () => {
    const { appt, sale } = await closedSale();
    expect(sale.status).toBe('CLOSED');
    expect(sale.total).toBe('90');
    expect(sale.paymentStatus).toBe('UNPAID');
    expect(sale.balanceDue).toBe('90.00');
    const items = await prisma.saleItem.findMany({ where: { saleId: sale.id }, orderBy: { kind: 'asc' } });
    const svc = items.find((i) => i.kind === 'SERVICE');
    const prod = items.find((i) => i.kind === 'PRODUCT');
    expect(svc.commissionAmount.toFixed(2)).toBe('20.00'); // 40% de R$ 50,00
    expect(prod.commissionAmount.toFixed(2)).toBe('4.00'); // 10% de R$ 40,00
    expect(svc.ruleSnapshot.percent).toBe('40.00');
    expect((await prisma.productStock.findFirst({ where: { productId: s.product.id, unitId: s.unitA.id } })).quantity).toBe(9);
    const a = await prisma.appointment.findUnique({ where: { id: appt.id } });
    expect(a.status).toBe('COMPLETED');
    expect(a.reviewToken).toBeTruthy();
    expect(await prisma.financialTransaction.count()).toBe(0);
    expect(await prisma.barberObligation.count({ where: { type: 'COMMISSION' } })).toBe(2);
  });

  it('fechar duas vezes ao mesmo tempo não duplica comissão nem baixa de estoque', async () => {
    const appt = await appointment();
    const sale = (await recep.post('/api/sales').send({ unitId: s.unitA.id, appointmentId: appt.id })).body;
    await recep.post(`/api/sales/${sale.id}/items`).send({ kind: 'PRODUCT', productId: s.product.id, barberId: s.b1.barber.id });
    const r = await Promise.all([recep.post(`/api/sales/${sale.id}/close`), recep.post(`/api/sales/${sale.id}/close`)]);
    expect(r.map((x) => x.status).sort()).toEqual([200, 400]);
    expect(await prisma.barberObligation.count()).toBe(2);
    expect((await prisma.productStock.findFirst({ where: { productId: s.product.id } })).quantity).toBe(9);
  });

  it('estoque insuficiente impede o fechamento', async () => {
    await prisma.productStock.updateMany({ data: { quantity: 0 } });
    const sale = (await recep.post('/api/sales').send({ unitId: s.unitA.id, items: [{ kind: 'PRODUCT', productId: s.product.id }] })).body;
    const res = await recep.post(`/api/sales/${sale.id}/close`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Estoque insuficiente/);
  });

  it('desconto maior que o item é recusado', async () => {
    const sale = (await recep.post('/api/sales').send({ unitId: s.unitA.id })).body;
    const res = await recep.post(`/api/sales/${sale.id}/items`).send({ kind: 'PRODUCT', productId: s.product.id, discount: '41' });
    expect(res.status).toBe(400);
  });
});

describe('pagamentos parciais e estornos', () => {
  it('pagamento parcial, depois o restante; excesso é recusado', async () => {
    const { sale } = await closedSale();
    const caixa = s.acc(s.unitA, 'Caixa').id;
    const p1 = await recep.post(`/api/sales/${sale.id}/payments`).send({ accountId: caixa, method: 'PIX', amount: '30' });
    expect(p1.status).toBe(201);
    expect(p1.body.paymentStatus).toBe('PARTIAL');
    expect(p1.body.balanceDue).toBe('60.00');
    const over = await recep.post(`/api/sales/${sale.id}/payments`).send({ accountId: caixa, method: 'CASH', amount: '60.01' });
    expect(over.status).toBe(400);
    const p2 = await recep.post(`/api/sales/${sale.id}/payments`).send({ accountId: caixa, method: 'CASH', amount: '60' });
    expect(p2.body.paymentStatus).toBe('PAID');
    expect(await prisma.financialTransaction.count({ where: { kind: 'SALE_PAYMENT' } })).toBe(2);
  });

  it('pagamento repetido com a mesma chave de idempotência não duplica', async () => {
    const { sale } = await closedSale();
    const body = { accountId: s.acc(s.unitA, 'Caixa').id, method: 'PIX', amount: '10', idempotencyKey: 'chave-unica-123' };
    await Promise.all([recep.post(`/api/sales/${sale.id}/payments`).send(body), recep.post(`/api/sales/${sale.id}/payments`).send(body)]);
    expect(await prisma.payment.count()).toBe(1);
  });

  it('não aceita pagamento em conta de outra unidade', async () => {
    const { sale } = await closedSale();
    const res = await recep.post(`/api/sales/${sale.id}/payments`).send({ accountId: s.acc(s.unitB, 'Caixa').id, method: 'PIX', amount: '10' });
    expect(res.status).toBe(400);
  });

  it('estorno: pagamento vira REVERSED, movimentação inversa ligada, saldo a receber volta', async () => {
    const { sale } = await closedSale();
    const paid = await recep.post(`/api/sales/${sale.id}/payments`).send({ accountId: s.acc(s.unitA, 'Caixa').id, method: 'PIX', amount: '90' });
    const paymentId = paid.body.payments[0].id;
    expect((await recep.post(`/api/payments/${paymentId}/reverse`).send({ reason: 'Erro de lançamento' })).status).toBe(403); // recepção não estorna
    const m = await loginAs(s.managerA);
    const rev = await m.post(`/api/payments/${paymentId}/reverse`).send({ reason: 'Erro de lançamento' });
    expect(rev.status).toBe(200);
    expect(rev.body.balanceDue).toBe('90.00');
    const txs = await prisma.financialTransaction.findMany({ orderBy: { createdAt: 'asc' } });
    expect(txs).toHaveLength(2);
    expect(txs[1].kind).toBe('REVERSAL');
    expect(txs[1].reversalOfId).toBe(txs[0].id);
    expect((await m.post(`/api/payments/${paymentId}/reverse`).send({ reason: 'De novo' })).status).toBe(400);
  });

  it('cancelar venda fechada: exige estorno antes; depois devolve estoque e cancela comissões', async () => {
    const { sale } = await closedSale();
    const caixa = s.acc(s.unitA, 'Caixa').id;
    const paid = await recep.post(`/api/sales/${sale.id}/payments`).send({ accountId: caixa, method: 'CASH', amount: '10' });
    expect((await recep.post(`/api/sales/${sale.id}/cancel`).send({ reason: 'Cliente desistiu' })).status).toBe(400);
    const m = await loginAs(s.managerA);
    await m.post(`/api/payments/${paid.body.payments[0].id}/reverse`).send({ reason: 'Cancelamento' }).expect(200);
    const res = await recep.post(`/api/sales/${sale.id}/cancel`).send({ reason: 'Cliente desistiu' });
    expect(res.status).toBe(200);
    expect((await prisma.productStock.findFirst({ where: { productId: s.product.id } })).quantity).toBe(10);
    expect(await prisma.barberObligation.count({ where: { status: 'CANCELLED' } })).toBe(2);
  });
});

describe('remuneração mista', () => {
  it('comissão só fica devida quando a venda é totalmente recebida', async () => {
    const { sale } = await closedSale({ withProduct: false });
    let st = (await statement()).body.summary;
    expect(st.calculated).toBe('20.00');
    expect(st.due).toBe('0.00');
    expect(st.notYetDue).toBe('20.00');
    await recep.post(`/api/sales/${sale.id}/payments`).send({ accountId: s.acc(s.unitA, 'Caixa').id, method: 'PIX', amount: '50' }).expect(201);
    st = (await statement()).body.summary;
    expect(st.due).toBe('20.00');
    expect(st.pending).toBe('20.00');
  });

  it('pagamento ao barbeiro (parcial) separa pago e pendente e gera saída no caixa', async () => {
    const { sale } = await closedSale({ withProduct: false });
    await recep.post(`/api/sales/${sale.id}/payments`).send({ accountId: s.acc(s.unitA, 'Caixa').id, method: 'PIX', amount: '50' });
    const m = await loginAs(s.managerA);
    const over = await m.post('/api/compensation/payouts').send({ barberId: s.b1.barber.id, unitId: s.unitA.id, accountId: s.acc(s.unitA, 'Caixa').id, amount: '25' });
    expect(over.status).toBe(400);
    const res = await m.post('/api/compensation/payouts').send({ barberId: s.b1.barber.id, unitId: s.unitA.id, accountId: s.acc(s.unitA, 'Caixa').id, amount: '15' });
    expect(res.status).toBe(201);
    const st = (await statement()).body.summary;
    expect(st.paid).toBe('15.00');
    expect(st.pending).toBe('5.00');
    const out = await prisma.financialTransaction.findFirst({ where: { kind: 'BARBER_PAYOUT' } });
    expect(out.amount.toFixed(2)).toBe('15.00');
    expect(out.direction).toBe('OUT');
  });

  it('nova comissão vale para frente; vendas antigas mantêm o percentual', async () => {
    await closedSale({ withProduct: false });
    await owner.post('/api/compensation/rules').send({ barberId: s.b1.barber.id, type: 'SERVICE_COMMISSION_PCT', percent: '50', validFrom: new Date().toISOString() }).expect(201);
    const appt = await appointment('11:00');
    const sale2 = (await recep.post('/api/sales').send({ unitId: s.unitA.id, appointmentId: appt.id })).body;
    await recep.post(`/api/sales/${sale2.id}/close`).expect(200);
    const amounts = (await prisma.saleItem.findMany({ orderBy: { commissionPct: 'asc' } })).map((i) => i.commissionAmount.toFixed(2));
    expect(amounts).toEqual(['20.00', '25.00']);
    const rules = await prisma.compensationRule.findMany({ where: { type: 'SERVICE_COMMISSION_PCT' }, orderBy: { validFrom: 'asc' } });
    expect(rules[0].validTo).not.toBeNull(); // a antiga foi encerrada, não apagada
  });

  it('regra específica do serviço vence a geral', async () => {
    await owner.post('/api/compensation/rules').send({ barberId: s.b1.barber.id, serviceId: s.service.id, type: 'SERVICE_COMMISSION_PCT', percent: '45', validFrom: new Date(Date.now() - 1000).toISOString() }).expect(201);
    await closedSale({ withProduct: false });
    expect((await prisma.saleItem.findFirst()).commissionAmount.toFixed(2)).toBe('22.50');
  });

  it('sem regra do barbeiro, usa a comissão padrão do serviço', async () => {
    await prisma.service.update({ where: { id: s.service.id }, data: { commissionPct: '30' } });
    const appt = await appointment('10:00', s.b2.barber);
    const sale = (await recep.post('/api/sales').send({ unitId: s.unitA.id, appointmentId: appt.id })).body;
    await recep.post(`/api/sales/${sale.id}/close`).expect(200);
    const item = await prisma.saleItem.findFirst();
    expect(item.commissionAmount.toFixed(2)).toBe('15.00');
    expect(item.ruleSnapshot.source).toBe('padrão do serviço');
  });

  it('combinação incompatível é recusada (fixo em vínculo só de comissão)', async () => {
    const res = await owner.post('/api/compensation/rules').send({ barberId: s.b1.barber.id, type: 'FIXED_SALARY', amount: '1500', period: 'MONTHLY', validFrom: new Date().toISOString() });
    expect(res.status).toBe(400);
  });

  it('fixo + comissão e aluguel de cadeira: geração mensal idempotente', async () => {
    await prisma.barberUnit.updateMany({ where: { barberId: s.b1.barber.id }, data: { compensationModel: 'FIXED_PLUS_COMMISSION' } });
    await prisma.barberUnit.updateMany({ where: { barberId: s.b2.barber.id }, data: { compensationModel: 'CHAIR_RENTAL' } });
    const vf = new Date('2026-01-01T03:00:00Z').toISOString();
    await owner.post('/api/compensation/rules').send({ barberId: s.b1.barber.id, type: 'FIXED_SALARY', amount: '1200', period: 'MONTHLY', validFrom: vf }).expect(201);
    await owner.post('/api/compensation/rules').send({ barberId: s.b2.barber.id, type: 'CHAIR_RENTAL', amount: '150', period: 'WEEKLY', validFrom: vf }).expect(201);
    const m = await loginAs(s.managerA);
    const g1 = await m.post('/api/compensation/periodic').send({ unitId: s.unitA.id, month: '2026-11' });
    expect(g1.body.created).toBe(2);
    const g2 = await m.post('/api/compensation/periodic').send({ unitId: s.unitA.id, month: '2026-11' });
    expect(g2.body.created).toBe(0);
    const rent = await prisma.barberObligation.findFirst({ where: { type: 'CHAIR_RENTAL' } });
    expect(rent.direction).toBe('RECEIVABLE_FROM_BARBER');
    expect(rent.amount.toFixed(2)).toBe('750.00'); // 5 segundas-feiras em nov/2026
    const fixed = await prisma.barberObligation.findFirst({ where: { type: 'FIXED_SALARY' } });
    expect(fixed.amount.toFixed(2)).toBe('1200.00');
    // Recebimento do aluguel entra no caixa
    const r = await m.post('/api/compensation/payouts').send({ barberId: s.b2.barber.id, unitId: s.unitA.id, accountId: s.acc(s.unitA, 'Caixa').id, direction: 'RECEIVABLE_FROM_BARBER', amount: '300' });
    expect(r.status).toBe(201);
    expect((await prisma.financialTransaction.findFirst({ where: { kind: 'CHAIR_RENT_RECEIPT' } })).direction).toBe('IN');
  });

  it('bônus manual entra como devido; pode ser cancelado se não pago', async () => {
    const m = await loginAs(s.managerA);
    const bonus = await m.post('/api/compensation/obligations').send({ barberId: s.b1.barber.id, unitId: s.unitA.id, type: 'BONUS', amount: '100', description: 'Meta do mês' });
    expect(bonus.status).toBe(201);
    expect((await statement()).body.summary.bonuses).toBe('100.00');
    expect((await m.post(`/api/compensation/obligations/${bonus.body.id}/cancel`).send({ reason: 'Lançado em duplicidade' })).status).toBe(200);
    expect((await statement()).body.summary.bonuses).toBe('0.00');
  });
});

describe('isolamento do financeiro do barbeiro', () => {
  it('barbeiro vê o próprio demonstrativo e não o de outro', async () => {
    await closedSale({ withProduct: false });
    const b1 = await loginAs(s.b1.user);
    const own = await b1.get(`/api/compensation/statement?from=${today}&to=${today}`);
    expect(own.status).toBe(200);
    expect(own.body.barber.id).toBe(s.b1.barber.id);
    const other = await b1.get(`/api/compensation/statement?barberId=${s.b2.barber.id}&from=${today}&to=${today}`);
    expect(other.status).toBe(403);
    expect((await b1.get(`/api/compensation/obligations`)).status).toBe(403);
    expect((await b1.get(`/api/finance/summary?from=${today}&to=${today}`)).status).toBe(403);
    expect((await b1.get(`/api/reports/barber?barberId=${s.b2.barber.id}&from=${today}&to=${today}`)).status).toBe(403);
  });

  it('recepcionista não acessa demonstrativos nem regras', async () => {
    expect((await recep.get(`/api/compensation/statement?barberId=${s.b1.barber.id}&from=${today}&to=${today}`)).status).toBe(403);
    expect((await recep.post('/api/compensation/rules').send({})).status).toBe(403);
  });

  it('gerente não altera regras de comissão (só o proprietário)', async () => {
    const m = await loginAs(s.managerA);
    const res = await m.post('/api/compensation/rules').send({ barberId: s.b1.barber.id, type: 'SERVICE_COMMISSION_PCT', percent: '90', validFrom: new Date().toISOString() });
    expect(res.status).toBe(403);
  });
});
