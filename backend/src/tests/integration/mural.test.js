import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../../db/prisma.js';
import { importFolderServices } from '../../../prisma/seed-services.js';
import { app, truncateAll, scenario, loginAs, futureDate, spAt, createCompany } from '../helpers/factory.js';

let s, owner;
const IMG = ['/uploads/a.jpg', '/uploads/b.jpg'];

beforeEach(async () => {
  await truncateAll();
  s = await scenario();
  owner = await loginAs(s.owner);
});

const newPost = (client, extra = {}) =>
  client.post('/api/posts').send({ title: 'Degradê com risco', imageUrls: IMG, tags: ['degradê', 'Risco'], serviceIds: [s.service.id], barberId: s.b1.barber.id, unitId: s.unitA.id, ...extra });

describe('mural de cortes — gestão', () => {
  it('proprietário publica direto; etiquetas são normalizadas', async () => {
    const res = await newPost(owner);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PUBLISHED');
    expect(res.body.tags).toEqual(['Degradê', 'Risco']);
    expect(res.body.publishedAt).toBeTruthy();
  });

  it('exige de 1 a 4 fotos', async () => {
    expect((await newPost(owner, { imageUrls: [] })).status).toBe(400);
    expect((await newPost(owner, { imageUrls: [...IMG, ...IMG, '/uploads/c.jpg'] })).status).toBe(400);
    expect((await newPost(owner, { imageUrls: ['javascript:alert(1)'] })).status).toBe(400);
  });

  it('barbeiro envia o próprio corte, que fica aguardando aprovação; não publica nem destaca', async () => {
    const b = await loginAs(s.b1.user);
    const res = await newPost(b, { status: 'PUBLISHED', featured: true, barberId: s.b2.barber.id });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.featured).toBe(false);
    expect(res.body.barberId).toBe(s.b1.barber.id); // sempre o próprio
    expect((await request(app).get('/api/public/posts')).body.posts).toHaveLength(0);
    // Gerente aprova
    const m = await loginAs(s.managerA);
    expect((await m.patch(`/api/posts/${res.body.id}`).send({ status: 'PUBLISHED' })).status).toBe(200);
    expect((await request(app).get('/api/public/posts')).body.posts).toHaveLength(1);
    // Barbeiro edita: volta para aprovação
    const edit = await b.patch(`/api/posts/${res.body.id}`).send({ title: 'Degradê navalhado' });
    expect(edit.body.status).toBe('PENDING');
  });

  it('barbeiro não vê nem altera publicações de outro barbeiro', async () => {
    const other = (await newPost(owner, { barberId: s.b2.barber.id })).body;
    const b = await loginAs(s.b1.user);
    expect((await b.get('/api/posts')).body).toHaveLength(0);
    expect((await b.patch(`/api/posts/${other.id}`).send({ title: 'Hack' })).status).toBe(404);
    expect((await b.delete(`/api/posts/${other.id}`)).status).toBe(404);
  });

  it('recepcionista não acessa o mural do painel', async () => {
    const r = await loginAs(s.receptionistA);
    expect((await r.get('/api/posts')).status).toBe(403);
  });

  it('serviço de outra empresa é recusado', async () => {
    const other = await createCompany('Outra');
    const svc = await prisma.service.create({ data: { companyId: other.id, name: 'Corte X' } });
    expect((await newPost(owner, { serviceIds: [svc.id] })).status).toBe(400);
  });
});

describe('mural de cortes — site e agendamento', () => {
  it('lista só publicados, filtra por etiqueta e calcula o preço estimado na unidade', async () => {
    await newPost(owner, { serviceIds: [s.service.id, s.beard.id] });
    await newPost(owner, { title: 'Oculto', tags: ['Social'], status: 'HIDDEN' });
    const res = await request(app).get(`/api/public/posts?unitId=${s.unitA.id}`);
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].estimate).toBe('85.00'); // corte 50 + barba 35
    expect(res.body.posts[0].services.map((x) => x.name).sort()).toEqual(['Barba', 'Corte']);
    expect(res.body.posts[0].barber.name).toBe('João');
    expect(res.body.tags).toEqual(['Degradê', 'Risco']);
    expect((await request(app).get('/api/public/posts?tag=Social')).body.posts).toHaveLength(0);
    // publicação de uma unidade não aparece na outra
    expect((await request(app).get(`/api/public/posts?unitId=${s.unitB.id}`)).body.posts).toHaveLength(0);
  });

  it('cliente agenda escolhendo o corte; a equipe vê a referência', async () => {
    const post = (await newPost(owner)).body;
    const date = futureDate(3);
    const res = await request(app).post('/api/public/appointments').send({
      unitId: s.unitA.id, serviceIds: [s.service.id], barberId: s.b1.barber.id, startsAt: spAt(date, '10:00'),
      client: { name: 'Ana', phone: '11977771234' }, consent: true, referencePostId: post.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.reference.title).toBe('Degradê com risco');
    const r = await loginAs(s.receptionistA);
    const list = await r.get(`/api/appointments?unitId=${s.unitA.id}&from=${date}`);
    expect(list.body[0].referencePost.title).toBe('Degradê com risco');
    const admin = await owner.get('/api/posts');
    expect(admin.body[0].bookings).toBe(1);
  });

  it('referência oculta ou inexistente é recusada', async () => {
    const post = (await newPost(owner, { status: 'HIDDEN' })).body;
    const res = await request(app).post('/api/public/appointments').send({
      unitId: s.unitA.id, serviceIds: [s.service.id], startsAt: spAt(futureDate(3), '10:00'),
      client: { name: 'Ana', phone: '11977771234' }, consent: true, referencePostId: post.id,
    });
    expect(res.status).toBe(400);
  });

  it('excluir a publicação mantém o agendamento (sem a referência)', async () => {
    const post = (await newPost(owner)).body;
    await request(app).post('/api/public/appointments').send({
      unitId: s.unitA.id, serviceIds: [s.service.id], barberId: s.b1.barber.id, startsAt: spAt(futureDate(3), '11:00'),
      client: { name: 'Ana', phone: '11977771234' }, consent: true, referencePostId: post.id,
    }).expect(201);
    expect((await owner.delete(`/api/posts/${post.id}`)).status).toBe(204);
    const a = await prisma.appointment.findFirst();
    expect(a.referencePostId).toBeNull();
  });
});

describe('serviços do folder', () => {
  it('importa os 10 serviços com imagem e descrição, sem duplicar', async () => {
    const first = await importFolderServices(s.company.id);
    expect(first).toHaveLength(10);
    const again = await importFolderServices(s.company.id);
    expect(again).toHaveLength(0);
    const svc = await prisma.service.findFirst({ where: { name: 'Barboterapia' }, include: { category: true } });
    expect(svc.imageUrl).toBe('/uploads/servico-barboterapia.jpg');
    expect(svc.category.name).toBe('Barba e rosto');
    const img = await request(app).get(svc.imageUrl);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
  });
});
