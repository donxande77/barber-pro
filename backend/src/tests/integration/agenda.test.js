import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../../db/prisma.js';
import { app, truncateAll, scenario, loginAs, futureDate, spAt } from '../helpers/factory.js';

let s, date;
const pub = () => request(app);

beforeEach(async () => {
  await truncateAll();
  s = await scenario();
  date = futureDate(3);
});

const book = (extra = {}) =>
  pub()
    .post('/api/public/appointments')
    .send({
      unitId: s.unitA.id,
      serviceIds: [s.service.id],
      barberId: s.b1.barber.id,
      startsAt: spAt(date, '10:00'),
      client: { name: 'Ana Souza', phone: '(11) 97777-1234' },
      consent: true,
      ...extra,
    });

describe('disponibilidade', () => {
  it('respeita expediente, intervalo de almoço e duração', async () => {
    const res = await pub().get(`/api/public/availability?unitId=${s.unitA.id}&date=${date}&serviceIds=${s.service.id},${s.beard.id}&barberId=${s.b1.barber.id}`);
    expect(res.status).toBe(200);
    const times = res.body.slots.map((x) => x.time);
    expect(res.body.durationMin).toBe(50);
    expect(times[0]).toBe('09:00');
    expect(times).not.toContain('11:15'); // 11:15 + 50 min invade o almoço (12:00)
    expect(times).toContain('11:00');
    expect(times).not.toContain('12:30');
    expect(times).toContain('13:00');
    expect(times.at(-1)).toBe('18:00'); // 18:00 + 50 = 18:50 ≤ 19:00
  });

  it('dia sem expediente da unidade não tem horários', async () => {
    const weekday = new Date(`${date}T12:00:00-03:00`).getDay();
    await prisma.unitHours.deleteMany({ where: { unitId: s.unitA.id, weekday } });
    const res = await pub().get(`/api/public/availability?unitId=${s.unitA.id}&date=${date}&serviceIds=${s.service.id}`);
    expect(res.body.slots).toEqual([]);
  });

  it('folga remove os horários do barbeiro', async () => {
    await prisma.barberTimeOff.create({ data: { barberId: s.b1.barber.id, startsAt: spAt(date, '09:00'), endsAt: spAt(date, '19:00') } });
    const res = await pub().get(`/api/public/availability?unitId=${s.unitA.id}&date=${date}&serviceIds=${s.service.id}&barberId=${s.b1.barber.id}`);
    expect(res.body.slots).toEqual([]);
  });

  it('agendamento em outra unidade também ocupa o barbeiro', async () => {
    await prisma.barberUnit.create({ data: { barberId: s.b1.barber.id, unitId: s.unitB.id } });
    await prisma.appointment.create({
      data: { unitId: s.unitB.id, clientId: s.client.id, barberId: s.b1.barber.id, startsAt: spAt(date, '10:00'), endsAt: spAt(date, '10:30'), source: 'INTERNAL', totalPrice: '55', totalDuration: 30 },
    });
    const res = await pub().get(`/api/public/availability?unitId=${s.unitA.id}&date=${date}&serviceIds=${s.service.id}&barberId=${s.b1.barber.id}`);
    expect(res.body.slots.map((x) => x.time)).not.toContain('10:00');
  });
});

describe('agendamento público', () => {
  it('cria o agendamento com preço e duração copiados, e o cliente pelo telefone', async () => {
    const res = await book();
    expect(res.status).toBe(201);
    expect(res.body.totalPrice).toBe('50');
    expect(res.body.manageUrl).toContain('/agendamento/');
    const a = await prisma.appointment.findFirst({ include: { client: true, items: true } });
    expect(a.status).toBe('SCHEDULED');
    expect(a.client.phone).toBe('11977771234');
    expect(a.client.consentAt).not.toBeNull();
    expect(a.items[0].serviceName).toBe('Corte');
  });

  it('agendamento NÃO gera receita nem venda', async () => {
    await book();
    expect(await prisma.sale.count()).toBe(0);
    expect(await prisma.financialTransaction.count()).toBe(0);
  });

  it('exige consentimento (LGPD)', async () => {
    const res = await book({ consent: false });
    expect(res.status).toBe(400);
  });

  it('mesmo horário e barbeiro: segundo pedido recebe 409', async () => {
    expect((await book()).status).toBe(201);
    const res = await book({ client: { name: 'Bruno', phone: '11966665555' } });
    expect(res.status).toBe(409);
  });

  it('pedidos simultâneos no mesmo horário: apenas um é aceito', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => book({ client: { name: `Cliente ${i}`, phone: `1195555000${i}` } })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await prisma.appointment.count()).toBe(1);
  });

  it('"qualquer profissional" distribui para quem está livre', async () => {
    await book();
    const res = await book({ barberId: null, client: { name: 'Bruno', phone: '11966665555' } });
    expect(res.status).toBe(201);
    expect(res.body.barber).toBe('Pedro');
  });

  it('horário fora do expediente é recusado', async () => {
    const res = await book({ startsAt: spAt(date, '07:00') });
    expect(res.status).toBe(409);
  });

  it('cliente cancela pelo link dentro do prazo; fora do prazo, não', async () => {
    const res = await book();
    const token = res.body.manageToken;
    const info = await pub().get(`/api/public/appointments/${token}`);
    expect(info.body.canCancel).toBe(true);
    expect(info.body).not.toHaveProperty('client');
    const cancel = await pub().post(`/api/public/appointments/${token}/cancel`).send({});
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('CANCELLED');

    // Agendamento daqui a 1 hora com prazo mínimo de 2 h
    const soon = await prisma.appointment.create({
      data: {
        unitId: s.unitA.id, clientId: s.client.id, barberId: s.b2.barber.id, startsAt: new Date(Date.now() + 3_600_000),
        endsAt: new Date(Date.now() + 5_400_000), source: 'PUBLIC', totalPrice: '50', totalDuration: 30, manageToken: 'x'.repeat(32),
      },
    });
    const late = await pub().post(`/api/public/appointments/${soon.manageToken}/cancel`).send({});
    expect(late.status).toBe(400);
  });
});

describe('agenda interna', () => {
  it('recepcionista agenda para cliente existente e remarca', async () => {
    const r = await loginAs(s.receptionistA);
    const res = await r.post('/api/appointments').send({ unitId: s.unitA.id, serviceIds: [s.service.id], barberId: s.b1.barber.id, startsAt: spAt(date, '14:00'), clientId: s.client.id });
    expect(res.status).toBe(201);
    const moved = await r.patch(`/api/appointments/${res.body.id}/reschedule`).send({ startsAt: spAt(date, '15:00') });
    expect(moved.status).toBe(200);
    expect(new Date(moved.body.startsAt).toISOString()).toBe(spAt(date, '15:00'));
    const list = await r.get(`/api/appointments?unitId=${s.unitA.id}&from=${date}`);
    expect(list.body).toHaveLength(1);
  });

  it('recepcionista não agenda em unidade alheia', async () => {
    const r = await loginAs(s.receptionistA);
    const res = await r.post('/api/appointments').send({ unitId: s.unitB.id, serviceIds: [s.service.id], startsAt: spAt(date, '14:00'), clientId: s.client.id });
    expect(res.status).toBe(403);
  });

  it('barbeiro vê somente a própria agenda', async () => {
    await book();
    await book({ barberId: s.b2.barber.id, client: { name: 'Bruno', phone: '11966665555' } });
    const b = await loginAs(s.b1.user);
    const list = await b.get(`/api/appointments?unitId=${s.unitA.id}&from=${date}&barberId=${s.b2.barber.id}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].barberId).toBe(s.b1.barber.id);
    const other = await prisma.appointment.findFirst({ where: { barberId: s.b2.barber.id } });
    expect((await b.get(`/api/appointments/${other.id}`)).status).toBe(404);
  });

  it('transições de situação válidas e inválidas', async () => {
    const res = await book();
    const id = (await prisma.appointment.findFirst()).id;
    const m = await loginAs(s.managerA);
    expect((await m.patch(`/api/appointments/${id}/status`).send({ status: 'CONFIRMED' })).status).toBe(200);
    expect((await m.patch(`/api/appointments/${id}/status`).send({ status: 'NO_SHOW' })).status).toBe(200);
    expect((await m.patch(`/api/appointments/${id}/status`).send({ status: 'CONFIRMED' })).status).toBe(400);
    expect(res.status).toBe(201);
  });
});
