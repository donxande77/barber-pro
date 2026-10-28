// DADOS DE DEMONSTRAÇÃO — apenas para testar o sistema localmente.
// Cria uma empresa fictícia separada ("Barbearia Demonstração"). Nunca rode em produção.
// Uso: npm run db:seed-demo   (login: dono@demo.barberpro / Demo2026senha)
import 'dotenv/config';
import { prisma } from '../src/db/prisma.js';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/utils/crypto.js';
import { createAppointment } from '../src/services/appointment.service.js';
import { createSale, closeSale, addPayment, addItem } from '../src/services/sale.service.js';
import { createRule, createPayout, generatePeriodic } from '../src/services/compensation.service.js';
import { createTransaction, createTransfer, createBill, payBill } from '../src/services/finance.service.js';
import { DEFAULT_SITE_CONFIG } from '../src/services/site-defaults.js';
import { importFolderServices } from './seed-services.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (env.isProd) {
  console.error('Seed de demonstração bloqueado em produção.');
  process.exit(1);
}

const SLUG = 'barbearia-demonstracao';
const PASSWORD = 'Demo2026senha';
const tz = 'America/Sao_Paulo';
const day = (offset) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(Date.now() + offset * 86_400_000));
const at = (offset, hhmm) => new Date(`${day(offset)}T${hhmm}:00-03:00`);

async function main() {
  const existing = await prisma.company.findUnique({ where: { slug: SLUG } });
  if (existing) {
    console.log('A empresa de demonstração já existe. Para recriar, apague o banco de desenvolvimento e rode as migrações de novo.');
    return;
  }
  const passwordHash = await hashPassword(PASSWORD);
  const company = await prisma.company.create({ data: { name: 'Barbearia Demonstração', slug: SLUG } });
  const hours = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, openMin: 540, closeMin: 1200 })).concat([{ weekday: 6, openMin: 480, closeMin: 1080 }]);
  const mkUnit = (name, slug, street, district) =>
    prisma.unit.create({
      data: {
        companyId: company.id, name, slug, street, number: '100', district, city: 'São Paulo', state: 'SP', phone: '1130000000', whatsapp: '11999990000',
        cancellationPolicy: 'Cancelamentos com menos de 2 horas de antecedência podem ser cobrados no próximo atendimento.',
        hours: { create: hours },
        accounts: { create: [{ name: 'Caixa', type: 'CASH', openingBalance: '300.00' }, { name: 'Banco', type: 'BANK', openingBalance: '2000.00' }] },
      },
      include: { accounts: true },
    });
  const centro = await mkUnit('Centro (demonstração)', 'centro', 'Rua Exemplo', 'Centro');
  const jardins = await mkUnit('Jardins (demonstração)', 'jardins', 'Alameda Exemplo', 'Jardins');
  const acc = (u, n) => u.accounts.find((a) => a.name === n).id;

  const owner = await prisma.user.create({ data: { companyId: company.id, name: 'Dono (demonstração)', email: 'dono@demo.barberpro', passwordHash, role: 'OWNER' } });
  await prisma.user.create({ data: { companyId: company.id, name: 'Gerente Centro (demonstração)', email: 'gerente@demo.barberpro', passwordHash, role: 'MANAGER', unitAccess: { create: [{ unitId: centro.id }] } } });
  await prisma.user.create({ data: { companyId: company.id, name: 'Recepção Centro (demonstração)', email: 'recepcao@demo.barberpro', passwordHash, role: 'RECEPTIONIST', unitAccess: { create: [{ unitId: centro.id }] } } });
  const ctx = { user: owner, unitIds: [centro.id, jardins.id], ip: null };

  const cat = async (name, sortOrder) => prisma.serviceCategory.create({ data: { companyId: company.id, name, sortOrder } });
  const cortes = await cat('Cortes', 1);
  const barba = await cat('Barba e acabamento', 2);
  const combos = await cat('Combos', 3);
  const svc = (name, categoryId, desc, pA, pB, dur, isCombo = false) =>
    prisma.service.create({
      data: {
        companyId: company.id, name, categoryId, description: desc, isCombo,
        offers: { create: [{ unitId: centro.id, price: pA, durationMin: dur }, { unitId: jardins.id, price: pB, durationMin: dur }] },
      },
    });
  const S = {
    trad: await svc('Corte tradicional', cortes.id, 'Tesoura e máquina, finalização com pomada.', '45.00', '55.00', 30),
    degrade: await svc('Degradê', cortes.id, 'Transição na máquina e navalha.', '55.00', '65.00', 40),
    infantil: await svc('Corte infantil', cortes.id, 'Até 12 anos.', '35.00', '40.00', 30),
    barba: await svc('Barba', barba.id, 'Toalha quente, navalha e balm.', '35.00', '40.00', 30),
    sobr: await svc('Sobrancelha', barba.id, 'Acabamento na navalha.', '15.00', '18.00', 10),
    combo: await svc('Corte + barba', combos.id, 'O clássico da casa.', '75.00', '90.00', 60, true),
  };
  // Serviços do folder, com preços fictícios só para a demonstração
  const DEMO_PRICES = {
    'Kone hindu': '40.00', Sobrancelhas: '20.00', Barboterapia: '60.00', 'Camuflagem cabelo e barba': '70.00', 'Limpeza de pele': '80.00',
    'Hidratação cabelo e barba': '45.00', Selagem: '120.00', 'Epilação nariz e orelha': '25.00', 'Alinhamento capilar': '110.00', 'Epilação faixa de barba': '30.00',
  };
  const folder = await importFolderServices(company.id, {
    offers: (f) => [centro, jardins].map((u, i) => ({ unitId: u.id, price: (Number(DEMO_PRICES[f.name]) + i * 5).toFixed(2), durationMin: f.durationMin })),
  });
  const F = Object.fromEntries(folder.map((f) => [f.name, f]));

  // Promoção vigente
  await prisma.serviceUnit.updateMany({
    where: { serviceId: S.combo.id, unitId: centro.id },
    data: { promoPrice: '65.00', promoStart: at(-2, '00:00'), promoEnd: at(10, '23:59') },
  });

  const prod = (name, price, cost, qa, qb) =>
    prisma.product.create({ data: { companyId: company.id, name, price, cost, commissionPct: '10.00', stocks: { create: [{ unitId: centro.id, quantity: qa, minQuantity: 3 }, { unitId: jardins.id, quantity: qb, minQuantity: 3 }] } } });
  const P = { pomada: await prod('Pomada modeladora', '45.00', '18.00', 40, 30), oleo: await prod('Óleo para barba', '39.00', '15.00', 2, 6), shampoo: await prod('Shampoo', '32.00', '12.00', 9, 9) };

  const allServices = [...Object.values(S), ...folder].map((s) => ({ serviceId: s.id }));
  const mkBarber = async (name, bio, specialties, links, login) => {
    const user = login ? await prisma.user.create({ data: { companyId: company.id, name, email: login, passwordHash, role: 'BARBER' } }) : null;
    const b = await prisma.barber.create({
      data: {
        companyId: company.id, name, bio, specialties, userId: user?.id ?? null,
        services: { create: allServices },
        units: { create: links.map(([unitId, compensationModel]) => ({ unitId, compensationModel })) },
      },
      include: { units: true },
    });
    for (const l of b.units) {
      await prisma.barberSchedule.createMany({
        data: [1, 2, 3, 4, 5, 6].map((weekday) => ({ barberUnitId: l.id, weekday, startMin: 540, endMin: weekday === 6 ? 1080 : 1200, breakStartMin: 720, breakEndMin: 780 })),
      });
    }
    return b;
  };
  const rafael = await mkBarber('Rafael (demonstração)', 'Especialista em degradê e desenhos.', ['Degradê', 'Navalhado'], [[centro.id, 'COMMISSION']], 'rafael@demo.barberpro');
  const bruno = await mkBarber('Bruno (demonstração)', 'Barba clássica com toalha quente.', ['Barba', 'Corte tradicional'], [[centro.id, 'FIXED_PLUS_COMMISSION']]);
  const diego = await mkBarber('Diego (demonstração)', 'Aluga a cadeira e atende com hora marcada.', ['Corte infantil', 'Degradê'], [[jardins.id, 'CHAIR_RENTAL_PLUS_COMMISSION']]);

  const from = at(-40, '00:00');
  await createRule(ctx, { barberId: rafael.id, type: 'SERVICE_COMMISSION_PCT', percent: '40', validFrom: from });
  await createRule(ctx, { barberId: rafael.id, type: 'PRODUCT_COMMISSION_PCT', percent: '10', validFrom: from });
  await createRule(ctx, { barberId: bruno.id, type: 'FIXED_SALARY', amount: '1500', period: 'MONTHLY', validFrom: from });
  await createRule(ctx, { barberId: bruno.id, type: 'SERVICE_COMMISSION_PCT', percent: '20', validFrom: from });
  await createRule(ctx, { barberId: diego.id, type: 'CHAIR_RENTAL', amount: '200', period: 'WEEKLY', validFrom: from });
  await createRule(ctx, { barberId: diego.id, type: 'SERVICE_COMMISSION_PCT', percent: '90', validFrom: from });

  const names = ['Carlos Andrade', 'Marcos Lima', 'Paulo Souza', 'Thiago Rocha', 'Felipe Nunes', 'Lucas Prado', 'André Matos', 'Gustavo Reis', 'Rodrigo Alves', 'Vinícius Costa', 'Eduardo Pires', 'Henrique Dias'];
  const clients = [];
  for (const [i, name] of names.entries()) {
    clients.push(await prisma.client.create({ data: { companyId: company.id, name: `${name} (demonstração)`, phone: `119999910${String(i).padStart(2, '0')}`, consentAt: new Date() } }));
  }

  // Histórico: vendas fechadas e pagas nos últimos 25 dias (datas ajustadas só nesta demonstração)
  const methods = ['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH'];
  const plan = [
    [centro, rafael, [S.degrade.id]], [centro, bruno, [S.combo.id]], [centro, rafael, [S.trad.id, S.barba.id]],
    [jardins, diego, [S.degrade.id]], [jardins, diego, [S.infantil.id]], [centro, bruno, [S.barba.id, S.sobr.id]],
  ];
  let n = 0;
  for (let d = 25; d >= 1; d--) {
    for (const [i, [unit, barber, serviceIds]] of plan.entries()) {
      if ((d + i) % 3 === 0) continue;
      const client = clients[(n++) % clients.length];
      const items = serviceIds.map((serviceId) => ({ kind: 'SERVICE', serviceId, barberId: barber.id }));
      let sale = await createSale(ctx, { unitId: unit.id, clientId: client.id, items });
      if (n % 4 === 0) sale = await addItem(ctx, sale.id, { kind: 'PRODUCT', productId: P.pomada.id, barberId: barber.id, quantity: 1, discount: '0' });
      sale = await closeSale(ctx, sale.id);
      const accountId = acc(unit, 'Caixa');
      const method = methods[n % methods.length];
      // Algumas vendas recentes ficam com pagamento parcial (mostra "a receber" e comissão ainda não devida)
      const partial = d <= 2 && i === 1;
      await addPayment(ctx, sale.id, { accountId, method, amount: partial ? '30.00' : sale.total });
      const when = at(-d, `${String(10 + i).padStart(2, '0')}:00`);
      await prisma.sale.update({ where: { id: sale.id }, data: { createdAt: when, closedAt: when } });
      await prisma.payment.updateMany({ where: { saleId: sale.id }, data: { paidAt: when } });
      const itemIds = (await prisma.saleItem.findMany({ where: { saleId: sale.id }, select: { id: true } })).map((x) => x.id);
      await prisma.barberObligation.updateMany({ where: { saleItemId: { in: itemIds } }, data: { createdAt: when } });
      await prisma.financialTransaction.updateMany({ where: { payment: { saleId: sale.id } }, data: { occurredAt: when } });
    }
  }

  // Despesas, contas, transferência, remuneração
  const month = day(0).slice(0, 7);
  await generatePeriodic(ctx, { unitId: centro.id, month });
  await generatePeriodic(ctx, { unitId: jardins.id, month });
  await createTransaction(ctx, { unitId: centro.id, accountId: acc(centro, 'Banco'), direction: 'OUT', kind: 'EXPENSE', amount: '420.00', description: 'Energia elétrica', occurredAt: at(-12, '09:00') });
  await createTransaction(ctx, { unitId: jardins.id, accountId: acc(jardins, 'Banco'), direction: 'OUT', kind: 'EXPENSE', amount: '180.00', description: 'Material de limpeza', occurredAt: at(-8, '09:00') });
  const aluguel = await createBill(ctx, { unitId: centro.id, kind: 'PAYABLE', description: 'Aluguel do imóvel', counterparty: 'Imobiliária Exemplo', amount: '3500.00', dueDate: day(5) });
  await payBill(ctx, aluguel.id, { accountId: acc(centro, 'Banco'), amount: '1500.00' });
  await createBill(ctx, { unitId: jardins.id, kind: 'PAYABLE', description: 'Internet', amount: '150.00', dueDate: day(12) });
  await createTransfer(ctx, { fromAccountId: acc(centro, 'Caixa'), toAccountId: acc(centro, 'Banco'), amount: '500.00', description: 'Depósito do caixa' });
  await createTransfer(ctx, { fromAccountId: acc(centro, 'Banco'), toAccountId: acc(jardins, 'Banco'), amount: '800.00', description: 'Reforço de caixa entre unidades' });
  await createPayout(ctx, { barberId: rafael.id, unitId: centro.id, accountId: acc(centro, 'Banco'), direction: 'PAYABLE_TO_BARBER', amount: '300.00' });
  await createPayout(ctx, { barberId: diego.id, unitId: jardins.id, accountId: acc(jardins, 'Caixa'), direction: 'RECEIVABLE_FROM_BARBER', amount: '400.00' });

  // Agenda futura (pelos mesmos serviços do site)
  const future = [[1, '10:00', rafael, centro, [S.degrade.id]], [1, '11:00', bruno, centro, [S.combo.id]], [1, '14:00', rafael, centro, [S.trad.id]], [2, '15:00', diego, jardins, [S.infantil.id]], [0, '18:00', bruno, centro, [S.barba.id]]];
  for (const [i, [offset, time, barber, unit, serviceIds]] of future.entries()) {
    const startsAt = at(offset, time);
    if (startsAt < new Date()) continue;
    try {
      await createAppointment({ ctx, unitId: unit.id, serviceIds, barberId: barber.id, startsAt, clientId: clients[i].id, source: i % 2 ? 'PUBLIC' : 'INTERNAL' });
    } catch {
      /* domingo ou fora do expediente: ignora */
    }
  }

  // Avaliações aprovadas ligadas a atendimentos concluídos
  const done = await prisma.sale.findMany({ where: { unitId: centro.id, status: 'CLOSED' }, take: 3, include: { items: true } });
  for (const [i, s] of done.entries()) {
    const barberId = s.items[0].barberId;
    const ap = await prisma.appointment.create({
      data: { unitId: centro.id, clientId: s.clientId, barberId, startsAt: at(-30 - i, '10:00'), endsAt: at(-30 - i, '10:40'), status: 'COMPLETED', source: 'PUBLIC', totalPrice: s.total, totalDuration: 40 },
    });
    await prisma.review.create({
      data: { unitId: centro.id, appointmentId: ap.id, clientId: s.clientId, barberId, rating: [5, 5, 4][i], comment: ['Atendimento pontual e corte perfeito.', 'Ambiente ótimo, voltarei.', 'Gostei muito da barba.'][i], status: 'APPROVED' },
    });
  }

  // Mural de cortes (fotos do folder, recortadas)
  const here = path.dirname(fileURLToPath(import.meta.url));
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
  const img = (f) => {
    fs.copyFileSync(path.join(here, 'assets', 'mural', f), path.join(env.UPLOAD_DIR, `mural-${f}`));
    return `/uploads/mural-${f}`;
  };
  const muralPosts = [
    { title: 'Alinhamento com volume controlado', description: 'Cachos alinhados, laterais baixas e acabamento com navalha.', imageUrls: [img('alinhamento-antes.jpg'), img('alinhamento-depois.jpg')], tags: ['Alinhamento', 'Degradê'], serviceIds: [F['Alinhamento capilar'].id, S.degrade.id], barberId: rafael.id, unitId: centro.id, featured: true },
    { title: 'Selagem com topete', description: 'Fios disciplinados e brilho, mantendo o movimento natural.', imageUrls: [img('selagem-antes.jpg'), img('selagem-depois.jpg')], tags: ['Selagem', 'Topete'], serviceIds: [F.Selagem.id, S.trad.id], barberId: rafael.id, unitId: null },
    { title: 'Grisalho natural', description: 'Camuflagem de cabelo e barba: suaviza os fios brancos sem pintar.', imageUrls: [img('camuflagem-antes.jpg'), img('camuflagem-depois.jpg')], tags: ['Camuflagem', 'Barba'], serviceIds: [F['Camuflagem cabelo e barba'].id, S.barba.id], barberId: bruno.id, unitId: centro.id },
    { title: 'Barba com linha definida', description: 'Epilação na faixa da barba para um contorno limpo por cerca de 20 dias.', imageUrls: [img('faixa-barba-antes.jpg'), img('faixa-barba-depois.jpg')], tags: ['Barba'], serviceIds: [S.barba.id, F['Epilação faixa de barba'].id], barberId: bruno.id, unitId: null },
  ];
  const postIds = [];
  for (const [i, p] of muralPosts.entries()) {
    const post = await prisma.haircutPost.create({ data: { ...p, companyId: company.id, status: 'PUBLISHED', publishedAt: new Date(), sortOrder: i, createdById: owner.id } });
    postIds.push(post.id);
  }
  // Um envio do barbeiro aguardando aprovação
  await prisma.haircutPost.create({ data: { companyId: company.id, title: 'Degradê navalhado (aguardando aprovação)', imageUrls: [img('selagem-depois.jpg')], tags: ['Degradê'], serviceIds: [S.degrade.id], barberId: rafael.id, unitId: centro.id, status: 'PENDING', createdById: owner.id } });
  // Agendamento futuro que veio do mural
  try {
    const d = new Date(Date.now() + 3 * 86_400_000).getDay() === 0 ? 4 : 3;
    await createAppointment({ ctx: null, unitId: centro.id, serviceIds: [F['Alinhamento capilar'].id, S.degrade.id], barberId: rafael.id, startsAt: at(d, '15:00'), client: { name: 'Cliente do mural (demonstração)', phone: '11999992000' }, source: 'PUBLIC', referencePostId: postIds[0] });
  } catch {
    /* horário indisponível na demonstração */
  }

  await prisma.siteConfigVersion.create({
    data: {
      companyId: company.id, version: 1, status: 'PUBLISHED', publishedAt: new Date(), note: 'Demonstração',
      data: {
        ...DEFAULT_SITE_CONFIG,
        brand: { ...DEFAULT_SITE_CONFIG.brand, name: 'Barbearia Demonstração', tagline: 'Dados fictícios para conhecer o sistema.' },
        about: { ...DEFAULT_SITE_CONFIG.about, title: 'A casa', text: 'Esta é uma barbearia de demonstração. Troque estes textos, cores, fotos e a ordem das seções em "Site e aparência", no painel.' },
        policies: { cancellation: 'Avise com antecedência se não puder comparecer: assim liberamos o horário para outro cliente.' },
      },
    },
  });

  console.log('Demonstração criada. Logins (senha Demo2026senha): dono@demo.barberpro, gerente@demo.barberpro, recepcao@demo.barberpro, rafael@demo.barberpro');
  console.log('Para o site público mostrar esta empresa, defina PUBLIC_COMPANY_SLUG=barbearia-demonstracao no .env');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
