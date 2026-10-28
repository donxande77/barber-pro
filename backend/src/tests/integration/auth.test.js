import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../../db/prisma.js';
import { app, truncateAll, createCompany, createUnit, createUser, loginAs, PASSWORD } from '../helpers/factory.js';

let company, unit, owner;

beforeEach(async () => {
  await truncateAll();
  company = await createCompany();
  unit = await createUnit(company.id);
  owner = await createUser(company.id, 'OWNER');
});

describe('login', () => {
  it('autentica, define cookie HttpOnly e devolve token CSRF e permissões', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: owner.email, password: PASSWORD });
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/bp_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(res.body.csrfToken).toBeTruthy();
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.permissions).toContain('finance:consolidated:read');
    expect(res.body.unitIds).toEqual([unit.id]);
  });

  it('guarda apenas o hash do token de sessão no banco', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: owner.email, password: PASSWORD });
    const token = res.headers['set-cookie'][0].split(';')[0].split('=')[1];
    const sessions = await prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).not.toBe(token);
    expect(sessions[0].tokenHash).toHaveLength(64);
  });

  it('senha armazenada com Argon2id', async () => {
    const u = await prisma.user.findUnique({ where: { id: owner.id } });
    expect(u.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('mesma mensagem para e-mail inexistente e senha errada', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'ninguem@x.dev', password: 'qualquer' });
    const b = await request(app).post('/api/auth/login').send({ email: owner.email, password: 'errada' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('bloqueia a conta após 5 senhas erradas, mesmo que a 6ª esteja correta', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ email: owner.email, password: 'errada' });
    }
    const res = await request(app).post('/api/auth/login').send({ email: owner.email, password: PASSWORD });
    expect(res.status).toBe(423);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'auth.lockout' } });
    expect(audit).not.toBeNull();
  });

  it('usuário inativo não entra', async () => {
    const inactive = await createUser(company.id, 'MANAGER', { unitIds: [unit.id], status: 'INACTIVE' });
    const res = await request(app).post('/api/auth/login').send({ email: inactive.email, password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('valida a entrada', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('sessão', () => {
  it('/me exige login', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  it('logout revoga a sessão no servidor', async () => {
    const c = await loginAs(owner);
    expect((await c.get('/api/auth/me')).status).toBe(200);
    expect((await c.post('/api/auth/logout')).status).toBe(204);
    const s = await prisma.session.findFirst();
    expect(s.revokedAt).not.toBeNull();
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  it('sessão expirada é recusada', async () => {
    const c = await loginAs(owner);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  it('sessão ociosa além do limite é recusada', async () => {
    const c = await loginAs(owner);
    await prisma.session.updateMany({ data: { lastSeenAt: new Date(Date.now() - 3 * 3_600_000) } });
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  it('desativar o usuário derruba as sessões abertas', async () => {
    const manager = await createUser(company.id, 'MANAGER', { unitIds: [unit.id] });
    const m = await loginAs(manager);
    const o = await loginAs(owner);
    expect((await o.patch(`/api/users/${manager.id}`).send({ status: 'INACTIVE' })).status).toBe(200);
    expect((await m.get('/api/auth/me')).status).toBe(401);
  });

  it('trocar a senha encerra as outras sessões e mantém a atual', async () => {
    const s1 = await loginAs(owner);
    const s2 = await loginAs(owner);
    const res = await s1.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'NovaSenha2026x' });
    expect(res.status).toBe(204);
    expect((await s1.get('/api/auth/me')).status).toBe(200);
    expect((await s2.get('/api/auth/me')).status).toBe(401);
  });
});

describe('CSRF e origem', () => {
  it('recusa alteração autenticada sem X-CSRF-Token', async () => {
    const c = await loginAs(owner);
    const res = await c.agent.post('/api/auth/logout');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN');
  });

  it('recusa token CSRF de outra sessão', async () => {
    const a = await loginAs(owner);
    const other = await createUser(company.id, 'OWNER');
    const b = await loginAs(other);
    const res = await a.agent.post('/api/auth/logout').set('X-CSRF-Token', b.csrf);
    expect(res.status).toBe(403);
  });

  it('recusa origem não autorizada', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://site-malicioso.example')
      .send({ email: owner.email, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_ORIGIN');
  });

  it('aceita a origem do frontend configurada', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ email: owner.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('recusa corpo que não seja JSON (formulário HTML de outro site)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .type('form')
      .send({ email: owner.email, password: PASSWORD });
    expect(res.status).toBe(415);
  });
});

describe('cabeçalhos de segurança', () => {
  it('Helmet ativo e sem X-Powered-By', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('erros internos não vazam detalhes', async () => {
    const res = await request(app).get('/api/rota-que-nao-existe');
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|prisma/i);
  });
});
