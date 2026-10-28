import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../db/prisma.js';
import { truncateAll, createCompany, createUnit, createUser, createBarberUser, loginAs } from '../helpers/factory.js';

let company, unitA, unitB, owner, managerA, receptionistA, barberA;
let otherCompany, otherUnit, otherOwner;

beforeEach(async () => {
  await truncateAll();
  company = await createCompany('Barbearia Um');
  unitA = await createUnit(company.id, 'Centro');
  unitB = await createUnit(company.id, 'Bairro');
  owner = await createUser(company.id, 'OWNER');
  managerA = await createUser(company.id, 'MANAGER', { unitIds: [unitA.id] });
  receptionistA = await createUser(company.id, 'RECEPTIONIST', { unitIds: [unitA.id] });
  barberA = await createBarberUser(company.id, [unitA.id]);

  otherCompany = await createCompany('Concorrente');
  otherUnit = await createUnit(otherCompany.id, 'Outra');
  otherOwner = await createUser(otherCompany.id, 'OWNER');
});

describe('escopo de unidades', () => {
  it('proprietário vê todas as unidades da própria empresa — e só delas', async () => {
    const c = await loginAs(owner);
    const res = await c.get('/api/units');
    expect(res.status).toBe(200);
    expect(res.body.map((u) => u.id).sort()).toEqual([unitA.id, unitB.id].sort());
  });

  it('gerente vê somente as unidades autorizadas', async () => {
    const c = await loginAs(managerA);
    const res = await c.get('/api/units');
    expect(res.body.map((u) => u.id)).toEqual([unitA.id]);
    expect((await c.get(`/api/units/${unitA.id}`)).status).toBe(200);
    expect((await c.get(`/api/units/${unitB.id}`)).status).toBe(403);
  });

  it('barbeiro vê as unidades do seu vínculo ativo', async () => {
    const c = await loginAs(barberA.user);
    expect(c.me.unitIds).toEqual([unitA.id]);
    expect(c.me.user.barberId).toBe(barberA.barber.id);
    await prisma.barberUnit.updateMany({ where: { barberId: barberA.barber.id }, data: { isActive: false } });
    expect((await c.get('/api/units')).body).toEqual([]);
  });

  it('unidade de outra empresa responde 404 (não revela existência)', async () => {
    const c = await loginAs(owner);
    expect((await c.get(`/api/units/${otherUnit.id}`)).status).toBe(404);
  });

  it('ID malformado é rejeitado na validação', async () => {
    const c = await loginAs(owner);
    expect((await c.get('/api/units/123')).status).toBe(400);
  });

  it('alteração de acesso vale na próxima requisição', async () => {
    const c = await loginAs(managerA);
    await prisma.userUnitAccess.create({ data: { userId: managerA.id, unitId: unitB.id } });
    expect((await c.get(`/api/units/${unitB.id}`)).status).toBe(200);
  });
});

describe('gestão de usuários', () => {
  it('recepcionista e barbeiro não acessam usuários', async () => {
    for (const u of [receptionistA, barberA.user]) {
      const c = await loginAs(u);
      expect((await c.get('/api/users')).status).toBe(403);
      expect((await c.post('/api/users').send({})).status).toBe(403);
    }
  });

  it('proprietário cria gerente com unidades e o registro vai para a auditoria', async () => {
    const c = await loginAs(owner);
    const res = await c.post('/api/users').send({
      name: 'Gerente Novo',
      email: 'Gerente.Novo@Teste.dev',
      password: 'SenhaBoa2026',
      role: 'MANAGER',
      unitIds: [unitB.id],
    });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('gerente.novo@teste.dev');
    expect(res.body.unitIds).toEqual([unitB.id]);
    expect(res.body).not.toHaveProperty('passwordHash');
    const log = await prisma.auditLog.findFirst({ where: { action: 'user.create', entityId: res.body.id } });
    expect(log.userId).toBe(owner.id);
    expect(JSON.stringify(log.after)).not.toContain('argon2');
  });

  it('e-mail duplicado retorna 409', async () => {
    const c = await loginAs(owner);
    const res = await c.post('/api/users').send({
      name: 'Dup', email: managerA.email, password: 'SenhaBoa2026', role: 'MANAGER', unitIds: [unitA.id],
    });
    expect(res.status).toBe(409);
  });

  it('senha fraca é rejeitada', async () => {
    const c = await loginAs(owner);
    const res = await c.post('/api/users').send({
      name: 'Fraco', email: 'fraco@teste.dev', password: '123', role: 'MANAGER', unitIds: [unitA.id],
    });
    expect(res.status).toBe(400);
  });

  it('gerente cria recepcionista na própria unidade', async () => {
    const c = await loginAs(managerA);
    const res = await c.post('/api/users').send({
      name: 'Recep', email: 'recep2@teste.dev', password: 'SenhaBoa2026', role: 'RECEPTIONIST', unitIds: [unitA.id],
    });
    expect(res.status).toBe(201);
  });

  it('gerente NÃO cria usuário em unidade alheia', async () => {
    const c = await loginAs(managerA);
    const res = await c.post('/api/users').send({
      name: 'Recep', email: 'recep3@teste.dev', password: 'SenhaBoa2026', role: 'RECEPTIONIST', unitIds: [unitB.id],
    });
    expect(res.status).toBe(403);
  });

  it('gerente NÃO cria proprietário nem gerente (escalada de privilégio)', async () => {
    const c = await loginAs(managerA);
    for (const role of ['OWNER', 'MANAGER']) {
      const res = await c.post('/api/users').send({
        name: 'Usuário X', email: `x-${role}@teste.dev`, password: 'SenhaBoa2026', role, unitIds: [unitA.id],
      });
      expect(res.status, JSON.stringify(res.body)).toBe(403);
    }
  });

  it('gerente NÃO promove recepcionista a gerente', async () => {
    const c = await loginAs(managerA);
    const res = await c.patch(`/api/users/${receptionistA.id}`).send({ role: 'MANAGER' });
    expect(res.status).toBe(403);
  });

  it('gerente não enxerga usuários de outras unidades', async () => {
    const recepB = await createUser(company.id, 'RECEPTIONIST', { unitIds: [unitB.id] });
    const c = await loginAs(managerA);
    const list = await c.get('/api/users');
    expect(list.body.map((u) => u.id)).toEqual([receptionistA.id]);
    expect((await c.get(`/api/users/${recepB.id}`)).status).toBe(404);
    expect((await c.patch(`/api/users/${recepB.id}`).send({ name: 'Hack' })).status).toBe(404);
  });

  it('ao editar unidades, gerente não remove acessos que ele não gerencia', async () => {
    await prisma.userUnitAccess.create({ data: { userId: receptionistA.id, unitId: unitB.id } });
    const c = await loginAs(managerA);
    const res = await c.patch(`/api/users/${receptionistA.id}`).send({ unitIds: [unitA.id] });
    expect(res.status).toBe(200);
    expect(res.body.unitIds.sort()).toEqual([unitA.id, unitB.id].sort());
  });

  it('ninguém altera a própria função', async () => {
    const c = await loginAs(owner);
    const res = await c.patch(`/api/users/${owner.id}`).send({ role: 'MANAGER' });
    expect(res.status).toBe(400);
  });

  it('proprietário de outra empresa não vê nem altera usuários daqui', async () => {
    const c = await loginAs(otherOwner);
    expect((await c.get('/api/users')).body.map((u) => u.id)).toEqual([otherOwner.id]);
    expect((await c.get(`/api/users/${managerA.id}`)).status).toBe(404);
    expect((await c.patch(`/api/users/${managerA.id}`).send({ status: 'INACTIVE' })).status).toBe(404);
  });

  it('proprietário não concede unidade de outra empresa', async () => {
    const c = await loginAs(owner);
    const res = await c.post('/api/users').send({
      name: 'Usuário X', email: 'x@teste.dev', password: 'SenhaBoa2026', role: 'MANAGER', unitIds: [otherUnit.id],
    });
    expect(res.status).toBe(400);
  });
});

describe('auditoria', () => {
  it('somente o proprietário lê, e apenas da própria empresa', async () => {
    await loginAs(otherOwner); // gera log na outra empresa
    const o = await loginAs(owner);
    const res = await o.get('/api/audit');
    expect(res.status).toBe(200);
    expect(res.body.every((r) => r.companyId === company.id)).toBe(true);
    const m = await loginAs(managerA);
    expect((await m.get('/api/audit')).status).toBe(403);
  });
});
