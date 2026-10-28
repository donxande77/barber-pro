import { describe, it, expect, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { prisma } from '../../db/prisma.js';
import { truncateAll, scenario, loginAs, futureDate, spAt } from '../helpers/factory.js';

let s, owner, manager, today;

beforeEach(async () => {
  await truncateAll();
  s = await scenario();
  owner = await loginAs(s.owner);
  manager = await loginAs(s.managerA);
  today = futureDate(0);
});

const caixaA = () => s.acc(s.unitA, 'Caixa').id;
const bancoA = () => s.acc(s.unitA, 'Banco').id;
const caixaB = () => s.acc(s.unitB, 'Caixa').id;

async function paidSale(amount = '50') {
  const r = await loginAs(s.receptionistA);
  const sale = (await r.post('/api/sales').send({ unitId: s.unitA.id, items: [{ kind: 'SERVICE', serviceId: s.service.id, barberId: s.b1.barber.id }] })).body;
  await r.post(`/api/sales/${sale.id}/close`).expect(200);
  await r.post(`/api/sales/${sale.id}/payments`).send({ accountId: caixaA(), method: 'PIX', amount }).expect(201);
  return sale;
}

const summary = async (client = owner, unitId = s.unitA.id) =>
  (await client.get(`/api/finance/summary?unitId=${unitId}&from=${today}&to=${today}`)).body;

describe('lançamentos e estornos', () => {
  it('despesa manual reduz o resultado; estorno desfaz sem apagar', async () => {
    await paidSale();
    const exp = await manager.post('/api/finance/transactions').send({ unitId: s.unitA.id, accountId: caixaA(), direction: 'OUT', kind: 'EXPENSE', amount: '20', description: 'Material de limpeza' });
    expect(exp.status).toBe(201);
    let sm = await summary();
    expect(sm.summary.receipts).toBe('50.00');
    expect(sm.summary.expenses).toBe('20.00');
    expect(sm.summary.operatingResult).toBe('30.00');
    expect(sm.accounts.find((a) => a.id === caixaA()).balance).toBe('30.00');

    const rev = await manager.post(`/api/finance/transactions/${exp.body.id}/reverse`).send({ reason: 'Lançado errado' });
    expect(rev.status).toBe(201);
    sm = await summary();
    expect(sm.summary.expenses).toBe('0.00');
    expect(sm.accounts.find((a) => a.id === caixaA()).balance).toBe('50.00');
    expect(await prisma.financialTransaction.count()).toBe(3); // nada apagado
    expect((await manager.post(`/api/finance/transactions/${exp.body.id}/reverse`).send({ reason: 'De novo' })).status).toBe(400);
  });

  it('despesa precisa ser saída', async () => {
    const res = await manager.post('/api/finance/transactions').send({ unitId: s.unitA.id, accountId: caixaA(), direction: 'IN', kind: 'EXPENSE', amount: '20', description: 'x' });
    expect(res.status).toBe(400);
  });

  it('gerente não lança em unidade alheia', async () => {
    const res = await manager.post('/api/finance/transactions').send({ unitId: s.unitB.id, accountId: caixaB(), direction: 'OUT', kind: 'EXPENSE', amount: '20', description: 'Teste' });
    expect(res.status).toBe(403);
  });
});

describe('contas a pagar', () => {
  it('baixa parcial e total; não excede o valor', async () => {
    const bill = (await manager.post('/api/finance/bills').send({ unitId: s.unitA.id, kind: 'PAYABLE', description: 'Aluguel do imóvel', amount: '1000', dueDate: today })).body;
    await paidSale('50');
    await manager.post('/api/finance/transactions').send({ unitId: s.unitA.id, accountId: bancoA(), direction: 'IN', kind: 'INCOME', amount: '2000', description: 'Aporte' }).expect(201);
    expect((await manager.post(`/api/finance/bills/${bill.id}/pay`).send({ accountId: bancoA(), amount: '400' })).status).toBe(201);
    expect((await prisma.bill.findUnique({ where: { id: bill.id } })).status).toBe('PARTIAL');
    expect((await manager.post(`/api/finance/bills/${bill.id}/pay`).send({ accountId: bancoA(), amount: '600.01' })).status).toBe(400);
    expect((await manager.post(`/api/finance/bills/${bill.id}/pay`).send({ accountId: bancoA(), amount: '600' })).status).toBe(201);
    expect((await prisma.bill.findUnique({ where: { id: bill.id } })).status).toBe('PAID');
    const sm = await summary();
    expect(sm.summary.expenses).toBe('1000.00');
    expect(sm.summary.payablesOpen).toBe('0.00');
  });
});

describe('transferências e consolidado', () => {
  it('transferência entre unidades não vira receita nem despesa no consolidado', async () => {
    await paidSale('50');
    expect((await manager.post('/api/finance/transfers').send({ fromAccountId: caixaA(), toAccountId: caixaB(), amount: '30' })).status).toBe(403);
    const tr = await owner.post('/api/finance/transfers').send({ fromAccountId: caixaA(), toAccountId: caixaB(), amount: '30', description: 'Troco' });
    expect(tr.status).toBe(201);

    const c = (await owner.get(`/api/finance/consolidated?from=${today}&to=${today}`)).body;
    expect(c.total.receipts).toBe('50.00');
    expect(c.total.otherIncome).toBe('0.00');
    expect(c.total.expenses).toBe('0.00');
    expect(c.total.operatingResult).toBe('50.00');
    expect(c.available).toBe('50.00'); // o dinheiro só mudou de lugar
    expect(c.internalTransfers.count).toBe(1);
    expect(c.internalTransfers.amount).toBe('30.00');
    const a = c.accounts.find((x) => x.id === caixaA());
    const b = c.accounts.find((x) => x.id === caixaB());
    expect(a.balance).toBe('20.00');
    expect(b.balance).toBe('30.00');
    // A soma das unidades bate com o total
    const sumUnits = c.perUnit.reduce((acc, u) => acc + Number(u.operatingResult), 0);
    expect(sumUnits.toFixed(2)).toBe(c.total.operatingResult);
  });

  it('transferência na mesma unidade pelo gerente e estorno da transferência', async () => {
    await paidSale('50');
    const tr = await manager.post('/api/finance/transfers').send({ fromAccountId: caixaA(), toAccountId: bancoA(), amount: '40' });
    expect(tr.status).toBe(201);
    let sm = await summary(manager);
    expect(sm.accounts.find((a) => a.id === bancoA()).balance).toBe('40.00');
    expect(sm.summary.otherIncome).toBe('0.00');
    expect((await manager.post(`/api/finance/transfers/${tr.body.id}/reverse`).send({ reason: 'Conta errada' })).status).toBe(200);
    sm = await summary(manager);
    expect(sm.accounts.find((a) => a.id === bancoA()).balance).toBe('0.00');
    expect(sm.accounts.find((a) => a.id === caixaA()).balance).toBe('50.00');
    expect((await manager.post(`/api/finance/transfers/${tr.body.id}/reverse`).send({ reason: 'De novo' })).status).toBe(400);
  });

  it('somente o proprietário vê o consolidado', async () => {
    expect((await manager.get(`/api/finance/consolidated?from=${today}&to=${today}`)).status).toBe(403);
    const r = await loginAs(s.receptionistA);
    expect((await r.get(`/api/finance/summary?from=${today}&to=${today}`)).status).toBe(403);
  });
});

describe('fechamento de caixa', () => {
  it('registra diferença e, se pedido, lança ajuste de conciliação', async () => {
    await paidSale('50');
    const c1 = await manager.post('/api/finance/closings').send({ accountId: caixaA(), countedBalance: '45', notes: 'Faltou troco', createAdjustment: true });
    expect(c1.status).toBe(201);
    expect(c1.body.expectedBalance).toBe('50');
    expect(c1.body.difference).toBe('-5');
    const adj = await prisma.financialTransaction.findFirst({ where: { kind: 'ADJUSTMENT' } });
    expect(adj.direction).toBe('OUT');
    expect(adj.amount.toFixed(2)).toBe('5.00');
    const sm = await summary(manager);
    expect(sm.accounts.find((a) => a.id === caixaA()).balance).toBe('45.00');
    // movimentações do período ficam marcadas com o fechamento
    expect(await prisma.financialTransaction.count({ where: { cashClosingId: c1.body.id } })).toBe(1);
    // segundo fechamento começa onde o anterior terminou
    const c2 = await manager.post('/api/finance/closings').send({ accountId: caixaA(), countedBalance: '45' });
    expect(new Date(c2.body.periodStart).getTime()).toBe(new Date(c1.body.periodEnd).getTime());
    expect(c2.body.difference).toBe('0');
  });
});

describe('dashboards', () => {
  it('proprietário, gerente e barbeiro recebem dados reais do banco', async () => {
    await paidSale('50');
    const o = await owner.get(`/api/dashboard/owner?from=${today}&to=${today}`);
    expect(o.status).toBe(200);
    expect(o.body.summary.receipts).toBe('50.00');
    expect(o.body.top.services[0].name).toBe('Corte');
    expect(o.body.byMethod[0]).toEqual({ method: 'PIX', amount: '50.00' });
    expect(o.body.cashFlow).toHaveLength(1);
    const m = await manager.get(`/api/dashboard/manager?unitId=${s.unitA.id}&from=${today}&to=${today}`);
    expect(m.status).toBe(200);
    expect(m.body.productivity[0].name).toBe('João');
    expect((await manager.get(`/api/dashboard/owner?from=${today}&to=${today}`)).status).toBe(403);
    const b = await loginAs(s.b1.user);
    const bd = await b.get(`/api/dashboard/barber?from=${today}&to=${today}`);
    expect(bd.status).toBe(200);
    expect(bd.body.summary.servicesCount).toBe(1);
  });

  it('filtro por forma de pagamento', async () => {
    await paidSale('50');
    const o = await owner.get(`/api/dashboard/owner?from=${today}&to=${today}&method=CASH`);
    expect(o.body.summary.receipts).toBe('0.00');
  });
});

describe('relatórios', () => {
  it('relatório individual em JSON, CSV, Excel e PDF', async () => {
    await owner.post('/api/compensation/rules').send({ barberId: s.b1.barber.id, type: 'SERVICE_COMMISSION_PCT', percent: '40', validFrom: new Date(Date.now() - 60_000).toISOString() }).expect(201);
    await paidSale('50');
    const base = `/api/reports/barber?barberId=${s.b1.barber.id}&from=${today}&to=${today}`;
    const json = await owner.get(base);
    expect(json.status).toBe(200);
    expect(json.body.kpis.find(([k]) => k === 'Comissões geradas')[1]).toMatch(/20,00/);

    const csv = await owner.get(`${base}&format=csv`);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toMatch(/attachment; filename="relatorio-barbeiro-/);
    expect(csv.text.charCodeAt(0)).toBe(0xfeff);
    expect(csv.text).toContain('Corte');
    expect(csv.text).toContain('20,00');

    const xlsx = await owner.get(`${base}&format=xlsx`).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body);
    expect(wb.worksheets.map((w) => w.name)[0]).toBe('Resumo');
    expect(wb.worksheets.length).toBeGreaterThanOrEqual(4);

    const pdf = await owner.get(`${base}&format=pdf`).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('relatório consolidado identifica transferências eliminadas', async () => {
    await paidSale('50');
    await owner.post('/api/finance/transfers').send({ fromAccountId: caixaA(), toAccountId: caixaB(), amount: '30' }).expect(201);
    const r = await owner.get(`/api/reports/consolidated?from=${today}&to=${today}`);
    expect(r.status).toBe(200);
    const t = r.body.tables.find((x) => x.title.startsWith('Transferências internas'));
    expect(t.rows).toHaveLength(1);
    expect(r.body.kpis.find(([k]) => k.startsWith('Transferências internas'))[1]).toMatch(/30,00/);
  });

  it('relatório de unidade respeita o escopo do gerente', async () => {
    expect((await manager.get(`/api/reports/unit?unitId=${s.unitA.id}&from=${today}&to=${today}`)).status).toBe(200);
    expect((await manager.get(`/api/reports/unit?unitId=${s.unitB.id}&from=${today}&to=${today}`)).status).toBe(403);
    expect((await manager.get(`/api/reports/consolidated?from=${today}&to=${today}`)).status).toBe(403);
  });

  it('CSV neutraliza fórmulas (injeção em planilhas)', async () => {
    await prisma.barber.update({ where: { id: s.b1.barber.id }, data: { name: '=HYPERLINK("http://x")' } });
    const csv = await owner.get(`/api/reports/barber?barberId=${s.b1.barber.id}&from=${today}&to=${today}&format=csv`);
    expect(csv.text).not.toMatch(/;=HYPERLINK|^=HYPERLINK/m);
  });

  it('período inválido é recusado', async () => {
    expect((await owner.get(`/api/reports/consolidated?from=2026-12-31&to=2026-01-01`)).status).toBe(400);
  });

  it('agendamento futuro não aparece como receita', async () => {
    const r = await loginAs(s.receptionistA);
    await r.post('/api/appointments').send({ unitId: s.unitA.id, serviceIds: [s.service.id], barberId: s.b1.barber.id, startsAt: spAt(futureDate(1), '10:00'), clientId: s.client.id }).expect(201);
    const c = (await owner.get(`/api/finance/consolidated?from=${today}&to=${futureDate(2)}`)).body;
    expect(c.total.revenue).toBe('0.00');
    expect(c.total.receipts).toBe('0.00');
  });
});
