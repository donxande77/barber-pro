// Modo demonstração (somente para pré-visualizar sem servidor).
// Responde com dados reais capturados de uma API rodando com o seed de DEMONSTRAÇÃO
// (scripts/capture-preview-fixtures.mjs). Ativado só com VITE_PREVIEW=1 no build.
import rawFixtures from './fixtures.json';

// Imagens enviadas (/uploads/...) são publicadas junto com a demonstração, em caminho relativo.
const fixtures = JSON.parse(JSON.stringify(rawFixtures).replaceAll('"/uploads/', '"./uploads/'));

export const DEMO_LOGIN = { email: 'dono@demo.barberpro', password: 'Demo2026senha' };
let logged = false;

const json = (status, body) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const err = (status, message) => json(status, { error: { code: 'DEMO', message } });
const tz = 'America/Sao_Paulo';
const localDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso));

const ID_PARAMS = ['unitId', 'barberId'];
function lookup(path, params) {
  const routes = fixtures.routes;
  const exact = params.toString() ? `${path}?${params}` : path;
  if (routes[exact] !== undefined) return routes[exact];
  // Escolhe a resposta capturada com os mesmos filtros de unidade/barbeiro; ignora datas.
  let best;
  let bestScore = -Infinity;
  for (const k of Object.keys(routes).filter((x) => x.split('?')[0] === path)) {
    const kp = new URLSearchParams(k.split('?')[1] ?? '');
    if (ID_PARAMS.some((p) => kp.get(p) && params.get(p) && kp.get(p) !== params.get(p))) continue;
    let score = 0;
    for (const [key, v] of kp) score += params.get(key) === v ? 2 : -0.5;
    for (const p of ID_PARAMS) if (params.get(p) && !kp.get(p)) score -= 1;
    if (score > bestScore) {
      best = k;
      bestScore = score;
    }
  }
  return best !== undefined ? routes[best] : undefined;
}

const inRange = (iso, from, to) => {
  const d = localDay(iso);
  return (!from || d >= from) && (!to || d <= to);
};

function filterList(path, params, data) {
  const from = params.get('from');
  const to = params.get('to') ?? from;
  if (!Array.isArray(data)) return data;
  if (path === '/appointments') return data.filter((a) => inRange(a.startsAt, from, to) && (!params.get('barberId') || a.barberId === params.get('barberId')));
  if (path === '/sales') return data.filter((s) => inRange(s.createdAt, from, to) && (!params.get('status') || s.status === params.get('status')));
  if (path === '/finance/transactions') return data.filter((t) => inRange(t.occurredAt, from, to) && (!params.get('kind') || t.kind === params.get('kind')));
  if (path === '/compensation/obligations' && params.get('status')) return data.filter((o) => o.status === params.get('status'));
  if (path === '/compensation/obligations' && params.get('barberId')) return data.filter((o) => o.barberId === params.get('barberId'));
  if (path === '/finance/bills') return data.filter((b) => (!params.get('kind') || b.kind === params.get('kind')) && (!params.get('status') || b.status === params.get('status')));
  if (path === '/reviews') return data.filter((r) => !params.get('status') || r.status === params.get('status'));
  return data;
}

/** Horários sintéticos para a demonstração (o servidor real calcula pela escala e agenda). */
function fakeSlots(params) {
  const date = params.get('date');
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const slots = [];
  if (weekday !== 0) {
    for (let m = 540; m <= 1110; m += 30) {
      if (m >= 720 && m < 780) continue;
      if ((m / 30 + Number(date.slice(8))) % 5 === 0) continue;
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      const startsAt = new Date(`${date}T${hh}:${mm}:00-03:00`);
      if (startsAt > new Date()) slots.push({ time: `${hh}:${mm}`, startsAt: startsAt.toISOString(), barberCount: 1, barberIds: [] });
    }
  }
  return { date, durationMin: 30, slots, barbers: [] };
}

async function handle(method, url, body) {
  await new Promise((r) => setTimeout(r, 180));
  const [path, query] = url.split('?');
  const params = new URLSearchParams(query ?? '');

  if (path === '/auth/login') {
    if (String(body.email).toLowerCase() !== DEMO_LOGIN.email || body.password !== DEMO_LOGIN.password) return err(401, 'E-mail ou senha incorretos.');
    logged = true;
    return json(200, fixtures.me);
  }
  if (path === '/auth/logout') {
    logged = false;
    return json(204);
  }
  if (path === '/availability' || path === '/public/availability') return json(200, fakeSlots(params));
  if (method === 'POST' && path === '/public/appointments') {
    const startsAt = body.startsAt;
    return json(201, { manageToken: 'demonstracao', manageUrl: `${location.origin}/agendamento/demonstracao`, startsAt, endsAt: startsAt, barber: 'Profissional da demonstração', unit: 'Unidade da demonstração', services: ['Serviço escolhido'], totalPrice: '0' });
  }
  if (path.startsWith('/public/appointments/')) {
    return json(200, { status: 'SCHEDULED', startsAt: new Date(Date.now() + 86_400_000).toISOString(), endsAt: new Date(Date.now() + 90_000_000).toISOString(), totalPrice: '55.00', services: ['Degradê'], barber: 'Rafael (demonstração)', unit: { name: 'Centro (demonstração)', timezone: tz, minCancelHours: 2 }, canCancel: false, cancelDeadline: new Date().toISOString() });
  }
  if (path.startsWith('/public/')) {
    const data = lookup(path, params);
    if (data === undefined) return err(404, 'Não disponível na demonstração.');
    if (path === '/public/posts' && params.get('tag')) return json(200, { ...data, posts: data.posts.filter((p) => p.tags.includes(params.get('tag'))) });
    return json(200, data);
  }
  if (!logged) return err(401, 'Faça login para continuar.');
  if (path === '/auth/me') return json(200, fixtures.me);
  if (method !== 'GET') return err(400, 'Demonstração: alterações não são salvas. Instale o sistema para usar de verdade.');
  const data = lookup(path, params);
  if (data === undefined) return err(404, 'Esta tela não tem dados na demonstração.');
  return json(200, filterList(path, params, data));
}

export function installMockApi() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api')) return realFetch(input, init);
    let body = {};
    try {
      body = init.body ? JSON.parse(init.body) : {};
    } catch {
      body = {};
    }
    return handle(init.method || 'GET', url.slice(4), body);
  };
}
