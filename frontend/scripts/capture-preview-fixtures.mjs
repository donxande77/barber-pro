// Gera src/preview/fixtures.json a partir de uma API rodando com o seed de demonstração.
// Uso: (backend com db:seed-demo e PUBLIC_COMPANY_SLUG=barbearia-demonstracao rodando em :3333)
//      node scripts/capture-preview-fixtures.mjs
import fs from 'node:fs';

const BASE = process.env.API ?? 'http://localhost:3333/api';
const tz = 'America/Sao_Paulo';
const day = (o = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(Date.now() + o * 86_400_000));
const today = day();
const monthStart = `${today.slice(0, 8)}01`;
const from30 = day(-40);

async function session(email) {
  const res = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Demo2026senha' }) });
  if (!res.ok) throw new Error(`login ${email}: ${res.status}`);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return { cookie, me: await res.json() };
}

const fixtures = { generatedAt: new Date().toISOString(), today, routes: {} };
async function get(s, path, key = path) {
  const res = await fetch(`${BASE}${path}`, { headers: s ? { cookie: s.cookie } : {} });
  if (!res.ok) {
    console.warn('falhou', res.status, path);
    return null;
  }
  const data = await res.json();
  fixtures.routes[key] = data;
  return data;
}
const q = (o) => `?${new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== ''))}`;

const ownerS = await session('dono@demo.barberpro');
const owner = ownerS;
fixtures.me = owner.me;
const site = await get(null, '/public/site');
for (const u of site.units) {
  await get(null, `/public/units/${u.id}/catalog`);
  await get(null, `/public/posts?unitId=${u.id}`);
}
const allPosts = await get(null, '/public/posts');
for (const p of allPosts.posts) await get(null, `/public/posts/${p.id}`);
await get(owner, '/posts');
await get(owner, '/posts?status=PENDING');
await get(owner, '/posts?status=PUBLISHED');
await get(owner, '/posts?status=HIDDEN');

const units = await get(owner, '/units');
const unitId = units[0].id;
await get(owner, '/company');
await get(owner, '/service-categories');
await get(owner, '/services');
await get(owner, '/products');
await get(owner, '/barbers');
await get(owner, '/users');
await get(owner, '/finance/categories');
await get(owner, '/site/published');
await get(owner, '/site/draft');
await get(owner, '/site/versions');
await get(owner, '/audit?limit=200', '/audit');
await get(owner, '/clients?page=1', '/clients');
for (const u of units) {
  await get(owner, `/services?unitId=${u.id}`);
  await get(owner, `/products?unitId=${u.id}`);
  const barbers = await get(owner, `/barbers?unitId=${u.id}`);
  for (const b of barbers) {
    await get(owner, `/barbers/${b.id}`);
    await get(owner, `/compensation/statement${q({ barberId: b.id, unitId: u.id, from: monthStart, to: today })}`, `/compensation/statement?barberId=${b.id}`);
    await get(owner, `/reports/barber${q({ barberId: b.id, from: monthStart, to: today })}`, `/reports/barber?barberId=${b.id}`);
  }
  await get(owner, `/finance/accounts?unitId=${u.id}`);
  await get(owner, `/finance/accounts/options?unitId=${u.id}`);
  await get(owner, `/finance/summary${q({ unitId: u.id, from: monthStart, to: today })}`, `/finance/summary?unitId=${u.id}`);
  await get(owner, `/finance/transactions${q({ unitId: u.id, from: from30, to: today })}`, `/finance/transactions?unitId=${u.id}`);
  await get(owner, `/finance/bills?unitId=${u.id}`);
  await get(owner, `/finance/closings?unitId=${u.id}`);
  await get(owner, `/compensation/obligations${q({ unitId: u.id })}`, `/compensation/obligations?unitId=${u.id}`);
  await get(owner, `/compensation/payouts?unitId=${u.id}`);
  await get(owner, `/appointments${q({ unitId: u.id, from: day(-1), to: day(14) })}`, `/appointments?unitId=${u.id}`);
  const sales = await get(owner, `/sales${q({ unitId: u.id, from: from30, to: today })}`, `/sales?unitId=${u.id}`);
  for (const s of sales.slice(0, 12)) await get(owner, `/sales/${s.id}`);
  await get(owner, `/dashboard/manager${q({ unitId: u.id, from: monthStart, to: today })}`, `/dashboard/manager?unitId=${u.id}`);
  await get(owner, `/reports/unit${q({ unitId: u.id, from: monthStart, to: today })}`, `/reports/unit?unitId=${u.id}`);
  await get(owner, `/reviews?unitId=${u.id}&status=APPROVED`);
}
await get(owner, '/finance/accounts');
await get(owner, `/finance/transfers${q({ from: from30, to: today })}`, '/finance/transfers');
await get(owner, `/finance/consolidated${q({ from: monthStart, to: today })}`, '/finance/consolidated');
await get(owner, '/compensation/rules');
await get(owner, '/compensation/rules?includeEnded=true');
await get(owner, `/dashboard/owner${q({ from: monthStart, to: today })}`, '/dashboard/owner');
await get(owner, `/reports/consolidated${q({ from: monthStart, to: today })}`, '/reports/consolidated');
const clients = fixtures.routes['/clients'].items;
for (const c of clients.slice(0, 12)) await get(owner, `/clients/${c.id}`);

const out = new URL('../src/preview/fixtures.json', import.meta.url);
fs.writeFileSync(out, JSON.stringify(fixtures));
console.log('Rotas capturadas:', Object.keys(fixtures.routes).length, '→', out.pathname, `${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
