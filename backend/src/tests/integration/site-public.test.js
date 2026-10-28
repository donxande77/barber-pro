import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../../db/prisma.js';
import { DEFAULT_SITE_CONFIG } from '../../services/site-defaults.js';
import { app, truncateAll, scenario, loginAs, futureDate, spAt } from '../helpers/factory.js';

let s, owner;
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

beforeEach(async () => {
  await truncateAll();
  s = await scenario();
  owner = await loginAs(s.owner);
});

const cfg = (over = {}) => ({ ...DEFAULT_SITE_CONFIG, ...over });

describe('personalização visual', () => {
  it('rascunho → publicar → site público mostra a versão publicada', async () => {
    const before = await request(app).get('/api/public/site');
    expect(before.body.config.brand.name).toBe('Barber Pro'); // padrão, sem publicação

    const draft = await owner.put('/api/site/draft').send({ data: cfg({ brand: { name: 'Navalha de Ouro', tagline: 'Desde 1998', logoUrl: null } }), note: 'Nova marca' });
    expect(draft.status).toBe(200);
    // Rascunho não aparece no site
    expect((await request(app).get('/api/public/site')).body.config.brand.name).toBe('Barber Pro');

    expect((await owner.post('/api/site/publish')).status).toBe(200);
    const pub = await request(app).get('/api/public/site');
    expect(pub.body.config.brand.name).toBe('Navalha de Ouro');
    expect(pub.body.units.map((u) => u.name).sort()).toEqual(['Bairro', 'Centro']);
    expect(pub.body.units[0]).not.toHaveProperty('companyId');
  });

  it('restaurar versão anterior cria rascunho e mantém o histórico', async () => {
    await owner.put('/api/site/draft').send({ data: cfg({ hero: { ...DEFAULT_SITE_CONFIG.hero, title: 'Versão A' } }) });
    await owner.post('/api/site/publish');
    await owner.put('/api/site/draft').send({ data: cfg({ hero: { ...DEFAULT_SITE_CONFIG.hero, title: 'Versão B' } }) });
    await owner.post('/api/site/publish');
    const versions = (await owner.get('/api/site/versions')).body;
    expect(versions.map((v) => v.status)).toEqual(['PUBLISHED', 'ARCHIVED']);
    const a = versions.find((v) => v.status === 'ARCHIVED');
    expect((await owner.post(`/api/site/versions/${a.id}/restore`)).status).toBe(201);
    await owner.post('/api/site/publish');
    expect((await request(app).get('/api/public/site')).body.config.hero.title).toBe('Versão A');
    expect(await prisma.siteConfigVersion.count()).toBe(3);
  });

  it('valida cores e seções', async () => {
    const bad = await owner.put('/api/site/draft').send({ data: cfg({ colors: { ...DEFAULT_SITE_CONFIG.colors, accent: 'red' } }) });
    expect(bad.status).toBe(400);
    const dup = await owner.put('/api/site/draft').send({ data: cfg({ sections: ['hero', 'hero'] }) });
    expect(dup.status).toBe(400);
  });

  it('somente o proprietário personaliza o site', async () => {
    const m = await loginAs(s.managerA);
    expect((await m.put('/api/site/draft').send({ data: cfg() })).status).toBe(403);
  });

  it('upload aceita PNG e recusa SVG/arquivos disfarçados', async () => {
    const ok = await owner.post('/api/uploads').send({ dataBase64: `data:image/png;base64,${PNG_1PX}` });
    expect(ok.status).toBe(201);
    expect(ok.body.url).toMatch(/^\/uploads\/[0-9a-f-]+\.png$/);
    const img = await request(app).get(ok.body.url);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    expect((await owner.post('/api/uploads').send({ dataBase64: svg, fileName: 'foto.png' })).status).toBe(400);
  });
});

describe('catálogo público', () => {
  it('mostra serviços com promoção vigente, barbeiros habilitados e não expõe custos', async () => {
    await prisma.serviceUnit.updateMany({
      where: { serviceId: s.service.id, unitId: s.unitA.id },
      data: { promoPrice: '40.00', promoStart: new Date(Date.now() - 3_600_000), promoEnd: new Date(Date.now() + 86_400_000) },
    });
    const res = await request(app).get(`/api/public/units/${s.unitA.id}/catalog`);
    expect(res.status).toBe(200);
    const corte = res.body.services.find((x) => x.name === 'Corte');
    expect(corte.price).toBe('40.00');
    expect(corte.regularPrice).toBe('50.00');
    expect(corte.promo).not.toBeNull();
    expect(res.body.barbers.map((b) => b.name).sort()).toEqual(['João', 'Pedro']);
    expect(JSON.stringify(res.body)).not.toMatch(/cost|commission|phone/i);
  });

  it('unidade de outra empresa ou inativa não aparece', async () => {
    await prisma.unit.update({ where: { id: s.unitB.id }, data: { status: 'INACTIVE' } });
    expect((await request(app).get(`/api/public/units/${s.unitB.id}/catalog`)).status).toBe(404);
  });
});

describe('avaliações reais', () => {
  it('só é possível avaliar com o link de um atendimento concluído; moderação antes de publicar', async () => {
    const r = await loginAs(s.receptionistA);
    const date = futureDate(1);
    const appt = (await r.post('/api/appointments').send({ unitId: s.unitA.id, serviceIds: [s.service.id], barberId: s.b1.barber.id, startsAt: spAt(date, '10:00'), clientId: s.client.id })).body;
    const sale = (await r.post('/api/sales').send({ unitId: s.unitA.id, appointmentId: appt.id })).body;
    await r.post(`/api/sales/${sale.id}/close`).expect(200);
    const token = (await prisma.appointment.findUnique({ where: { id: appt.id } })).reviewToken;

    expect((await request(app).get(`/api/public/reviews/${'a'.repeat(32)}`)).status).toBe(404);
    const info = await request(app).get(`/api/public/reviews/${token}`);
    expect(info.body.barber).toBe('João');
    expect((await request(app).post(`/api/public/reviews/${token}`).send({ rating: 5, comment: 'Excelente!' })).status).toBe(201);
    expect((await request(app).post(`/api/public/reviews/${token}`).send({ rating: 1 })).status).toBe(400);

    let cat = await request(app).get(`/api/public/units/${s.unitA.id}/catalog`);
    expect(cat.body.reviews).toHaveLength(0); // pendente de moderação
    const m = await loginAs(s.managerA);
    const review = (await m.get('/api/reviews?status=PENDING')).body[0];
    await m.patch(`/api/reviews/${review.id}`).send({ status: 'APPROVED' }).expect(200);
    cat = await request(app).get(`/api/public/units/${s.unitA.id}/catalog`);
    expect(cat.body.reviews[0].client).toBe('Carlos L.');
    expect(cat.body.rating).toEqual({ average: 5, count: 1 });
  });
});

describe('cadastros (unidades, barbeiros, serviços, estoque, clientes)', () => {
  it('proprietário cria unidade com horários e conta Caixa; gerente não cria', async () => {
    const res = await owner.post('/api/units').send({
      name: 'Shopping', slug: 'shopping', hours: [{ weekday: 1, openMin: 600, closeMin: 1320 }], openingCash: '150.00',
    });
    expect(res.status).toBe(201);
    expect(res.body.hours).toHaveLength(1);
    const acc = await prisma.financialAccount.findFirst({ where: { unitId: res.body.id } });
    expect(acc.openingBalance.toFixed(2)).toBe('150.00');
    const m = await loginAs(s.managerA);
    expect((await m.post('/api/units').send({ name: 'X1', slug: 'x1' })).status).toBe(403);
    expect((await m.patch(`/api/units/${s.unitA.id}`).send({ phone: '1133334444' })).status).toBe(200);
    expect((await m.patch(`/api/units/${s.unitB.id}`).send({ phone: '1133334444' })).status).toBe(403);
  });

  it('barbeiro: cadastro com vínculo, escala e acesso ao painel', async () => {
    const m = await loginAs(s.managerA);
    const b = await m.post('/api/barbers').send({
      name: 'Rafael', specialties: ['Degradê'], serviceIds: [s.service.id],
      units: [{ unitId: s.unitA.id, compensationModel: 'FIXED_PLUS_COMMISSION' }],
    });
    expect(b.status).toBe(201);
    expect((await m.post('/api/barbers').send({ name: 'Fora', units: [{ unitId: s.unitB.id, compensationModel: 'COMMISSION' }] })).status).toBe(403);
    const sch = await m.put(`/api/barbers/${b.body.id}/schedules/${s.unitA.id}`).send({ days: [{ weekday: 2, startMin: 540, endMin: 1080, breakStartMin: 720, breakEndMin: 780 }] });
    expect(sch.status).toBe(200);
    const login = await m.put(`/api/barbers/${b.body.id}/login`).send({ email: 'rafael@teste.dev', password: 'SenhaBoa2026' });
    expect(login.status).toBe(200);
    const res = await request(app).post('/api/auth/login').send({ email: 'rafael@teste.dev', password: 'SenhaBoa2026' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('BARBER');
    // Atualização parcial não apaga vínculos nem serviços
    const upd = await m.patch(`/api/barbers/${b.body.id}`).send({ bio: 'Especialista em degradê' });
    expect(upd.body.units).toHaveLength(1);
    expect(upd.body.serviceIds).toEqual([s.service.id]);
    expect(upd.body.units[0].compensationModel).toBe('FIXED_PLUS_COMMISSION');
  });

  it('gerente ajusta preço da própria unidade, mas não o nome do serviço', async () => {
    const m = await loginAs(s.managerA);
    const ok = await m.patch(`/api/services/${s.service.id}`).send({ offers: [{ unitId: s.unitA.id, price: '60', durationMin: 40 }] });
    expect(ok.status).toBe(200);
    expect(ok.body.offers.find((o) => o.unitId === s.unitA.id).price).toBe('60');
    expect(ok.body.offers.find((o) => o.unitId === s.unitB.id).price).toBe('55'); // outra unidade intacta
    expect((await m.patch(`/api/services/${s.service.id}`).send({ name: 'Outro nome' })).status).toBe(403);
    expect((await m.patch(`/api/services/${s.service.id}`).send({ offers: [{ unitId: s.unitB.id, price: '1', durationMin: 10 }] })).status).toBe(403);
  });

  it('estoque: entrada, inventário e transferência entre unidades', async () => {
    const res = await owner.post(`/api/products/${s.product.id}/stock`).send({ unitId: s.unitA.id, type: 'IN', quantity: 5, reason: 'Compra' });
    expect(res.body.stocks.find((x) => x.unitId === s.unitA.id).quantity).toBe(15);
    await owner.post(`/api/products/${s.product.id}/stock`).send({ unitId: s.unitA.id, type: 'ADJUSTMENT', quantity: 12 }).expect(200);
    const tr = await owner.post(`/api/products/${s.product.id}/stock-transfer`).send({ fromUnitId: s.unitA.id, toUnitId: s.unitB.id, quantity: 2 });
    expect(tr.body.stocks.find((x) => x.unitId === s.unitA.id).quantity).toBe(10);
    expect(tr.body.stocks.find((x) => x.unitId === s.unitB.id).quantity).toBe(2);
    expect((await owner.post(`/api/products/${s.product.id}/stock-transfer`).send({ fromUnitId: s.unitB.id, toUnitId: s.unitA.id, quantity: 3 })).status).toBe(400);
  });

  it('cliente: busca por telefone e anonimização (LGPD) preserva o histórico', async () => {
    const r = await loginAs(s.receptionistA);
    const found = await r.get('/api/clients?search=8888');
    expect(found.body.items.map((c) => c.name)).toEqual(['Carlos Lima']);
    expect((await r.post(`/api/clients/${s.client.id}/anonymize`)).status).toBe(403);
    const an = await owner.post(`/api/clients/${s.client.id}/anonymize`);
    expect(an.body.name).toBe('Cliente anonimizado');
    expect(an.body.phone).not.toContain('8888');
    expect((await r.get('/api/clients?search=Carlos')).body.items).toHaveLength(0);
  });
});
