// Modo demonstração (somente para pré-visualizar o visual sem servidor).
// Simula as rotas da Fase 1 em memória. Ativado com VITE_PREVIEW=1 no build — nunca em produção.
const now = () => new Date().toISOString();
const id = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

export const DEMO_LOGIN = { email: 'demo@barberpro.dev', password: 'Demo2026senha' };

const PERMISSIONS = {
  OWNER: ['company:manage', 'units:create', 'units:update', 'units:read', 'users:read', 'users:manage', 'site:manage',
    'clients:read', 'clients:manage', 'barbers:manage', 'catalog:manage', 'compensation:manage', 'appointments:read',
    'appointments:manage', 'sales:manage', 'finance:unit:read', 'finance:unit:manage', 'finance:consolidated:read',
    'payouts:manage', 'reports:unit', 'reports:consolidated', 'audit:read'],
};

const db = {
  company: { id: id(), name: 'Barbearia Exemplo', slug: 'exemplo' },
  units: [
    { id: id(), name: 'Unidade Centro (exemplo)' },
    { id: id(), name: 'Unidade Jardins (exemplo)' },
  ],
  users: [],
  session: null,
};
db.users.push(
  { id: id(), name: 'Alexandre (demonstração)', email: DEMO_LOGIN.email, role: 'OWNER', status: 'ACTIVE', unitIds: [], createdAt: now(), barberId: null },
  { id: id(), name: 'Gerente Exemplo', email: 'gerente@exemplo.dev', role: 'MANAGER', status: 'ACTIVE', unitIds: [db.units[0].id], createdAt: now(), barberId: null },
  { id: id(), name: 'Recepção Exemplo', email: 'recepcao@exemplo.dev', role: 'RECEPTIONIST', status: 'ACTIVE', unitIds: [db.units[1].id], createdAt: now(), barberId: null },
);

const json = (status, body) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const err = (status, message, code = 'ERROR') => json(status, { error: { code, message } });

function me() {
  const u = db.session;
  return {
    user: { id: u.id, name: u.name, email: u.email, role: u.role, barberId: null },
    company: db.company,
    unitIds: db.units.map((x) => x.id),
    permissions: PERMISSIONS.OWNER,
    csrfToken: 'demo',
  };
}

async function handle(method, path, body) {
  await new Promise((r) => setTimeout(r, 250));
  if (path === '/auth/login' && method === 'POST') {
    const u = db.users.find((x) => x.email === String(body.email).toLowerCase());
    if (!u || body.password !== DEMO_LOGIN.password || u.email !== DEMO_LOGIN.email) {
      return err(401, 'E-mail ou senha incorretos.');
    }
    db.session = u;
    return json(200, me());
  }
  if (!db.session) return err(401, 'Faça login para continuar.');
  if (path === '/auth/me') return json(200, me());
  if (path === '/auth/logout') { db.session = null; return json(204); }
  if (path === '/auth/change-password') {
    if (body.currentPassword !== DEMO_LOGIN.password) return err(401, 'Senha atual incorreta.');
    return json(204);
  }
  if (path === '/units') return json(200, db.units);
  if (path === '/users' && method === 'GET') return json(200, db.users);
  if (path === '/users' && method === 'POST') {
    if (db.users.some((x) => x.email === body.email.toLowerCase())) return err(409, 'Já existe um registro com estes dados.');
    const u = { id: id(), ...body, email: body.email.toLowerCase(), status: 'ACTIVE', createdAt: now(), barberId: null };
    delete u.password;
    db.users.push(u);
    return json(201, u);
  }
  const m = path.match(/^\/users\/([^/]+)$/);
  if (m && method === 'PATCH') {
    const u = db.users.find((x) => x.id === m[1]);
    if (!u) return err(404, 'Usuário não encontrado.');
    Object.assign(u, body);
    return json(200, u);
  }
  return err(404, 'Rota não disponível na demonstração.');
}

export function installMockApi() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api')) return realFetch(input, init);
    const body = init.body ? JSON.parse(init.body) : {};
    return handle(init.method || 'GET', url.slice(4).split('?')[0], body);
  };
}
