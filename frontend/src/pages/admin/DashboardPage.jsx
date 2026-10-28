import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend,
} from 'recharts';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useUnit, UnitSelect } from '../../auth/UnitContext.jsx';
import { useApi, qs } from '../../lib/useApi.js';
import { brl, isoDay, monthStart, timeBR, LABELS, dateBR } from '../../lib/format.js';
import { PageHeader, Stat, Spinner, Alert, Pill, STATUS_TONE, PeriodPicker, Empty } from '../../components/ui.jsx';

const axis = { stroke: 'rgb(var(--bp-muted))', fontSize: 11 };
const grid = 'rgb(var(--bp-muted) / 0.15)';
const tooltipStyle = { background: 'rgb(var(--bp-surface))', border: '1px solid rgb(var(--bp-graphite))', borderRadius: 8, color: 'rgb(var(--bp-text))' };
const money = (v) => brl(v);
const compact = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : v);

function CashFlowChart({ data }) {
  if (!data?.length) return <Empty title="Sem movimentações no período" />;
  const rows = data.map((d) => ({ day: d.day.slice(8, 10) + '/' + d.day.slice(5, 7), Entradas: Number(d.in), Saídas: Number(d.out) }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={compact} width={52} />
          <Tooltip contentStyle={tooltipStyle} formatter={money} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="Entradas" stroke="rgb(var(--bp-accent))" fill="rgb(var(--bp-accent) / 0.25)" strokeWidth={2} />
          <Area type="monotone" dataKey="Saídas" stroke="#f87171" fill="rgb(248 113 113 / 0.12)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function HBar({ data, valueKey = 'revenue', nameKey = 'name', height = 240 }) {
  if (!data?.length) return <Empty title="Sem vendas no período" />;
  const rows = data.map((d) => ({ name: d[nameKey], value: Number(d[valueKey]) }));
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid stroke={grid} horizontal={false} />
          <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={compact} />
          <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={110} />
          <Tooltip contentStyle={tooltipStyle} formatter={money} cursor={{ fill: 'rgb(var(--bp-text) / 0.04)' }} />
          <Bar dataKey="value" name="Faturamento" fill="rgb(var(--bp-accent))" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Panel({ title, children, action }) {
  return (
    <section className="card min-w-0 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-heading text-xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpis({ s, available }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Faturamento (vendas fechadas)" value={brl(s.revenue)} hint={`${s.salesCount} vendas`} />
      <Stat label="Recebimentos" value={brl(s.receipts)} hint={`+ ${brl(s.otherIncome)} outras receitas`} />
      <Stat label="Despesas" value={brl(s.expenses)} hint={`${brl(s.payouts)} a profissionais`} />
      <Stat label="Resultado operacional" value={brl(s.operatingResult)} tone={Number(s.operatingResult) < 0 ? 'red' : 'gold'} />
      <Stat label="Saldo disponível" value={brl(available)} />
      <Stat label="Pendente com profissionais" value={brl(s.pendingToBarbers)} />
      <Stat label="Contas a pagar" value={brl(s.payablesOpen)} />
      <Stat label="Contas a receber" value={brl(s.receivablesOpen)} />
    </div>
  );
}

function Filters({ f, setF, showUnit = true, barbers, services }) {
  return (
    <div className="card mb-6 flex flex-wrap items-end gap-3 p-4">
      <PeriodPicker from={f.from} to={f.to} onChange={(p) => setF({ ...f, ...p })} />
      {showUnit && (
        <div className="w-48"><span className="label">Unidade</span><UnitSelect allowAll value={f.unitId} onChange={(unitId) => setF({ ...f, unitId })} /></div>
      )}
      {barbers && (
        <div className="w-44">
          <label className="label" htmlFor="f-barber">Barbeiro</label>
          <select id="f-barber" className="input py-2" value={f.barberId} onChange={(e) => setF({ ...f, barberId: e.target.value })}>
            <option value="">Todos</option>
            {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      {services && (
        <div className="w-44">
          <label className="label" htmlFor="f-service">Serviço</label>
          <select id="f-service" className="input py-2" value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}>
            <option value="">Todos</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <div className="w-40">
        <label className="label" htmlFor="f-method">Forma de pagamento</label>
        <select id="f-method" className="input py-2" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
          <option value="">Todas</option>
          {Object.entries(LABELS.method).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
    </div>
  );
}

function OwnerDashboard() {
  const [f, setF] = useState({ from: monthStart(), to: isoDay(), unitId: '', barberId: '', serviceId: '', method: '' });
  const { data, error, loading } = useApi(`/dashboard/owner${qs(f)}`);
  const barbers = useApi('/barbers').data;
  const services = useApi('/services').data;
  return (
    <>
      <PageHeader title="Visão da empresa" subtitle="Indicadores consolidados. Transferências entre unidades não entram como receita nem despesa." />
      <Filters f={f} setF={setF} barbers={barbers} services={services} />
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && (
        <div className="space-y-6">
          <Kpis s={data.summary} available={data.available} />
          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Fluxo de caixa"><CashFlowChart data={data.cashFlow} /></Panel>
            <Panel title="Comparativo entre unidades">
              {data.perUnit.length ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer>
                    <BarChart data={data.perUnit.map((u) => ({ name: u.unit.name, Faturamento: Number(u.revenue), Despesas: Number(u.expenses), Resultado: Number(u.operatingResult) }))}>
                      <CartesianGrid stroke={grid} vertical={false} />
                      <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} />
                      <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={compact} width={52} />
                      <Tooltip contentStyle={tooltipStyle} formatter={money} cursor={{ fill: 'rgb(var(--bp-text) / 0.04)' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Faturamento" fill="rgb(var(--bp-accent))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Despesas" fill="#f87171" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Resultado" fill="rgb(var(--bp-text) / 0.7)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <Empty title="Nenhuma unidade" />}
            </Panel>
            <Panel title="Serviços mais vendidos"><HBar data={data.top.services} /></Panel>
            <Panel title="Produtos mais vendidos"><HBar data={data.top.products} /></Panel>
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Recebimentos por forma de pagamento">
              {data.byMethod.length ? (
                <ul className="space-y-2 text-sm">
                  {data.byMethod.map((m) => (
                    <li key={m.method} className="flex justify-between"><span>{LABELS.method[m.method]}</span><span className="num">{brl(m.amount)}</span></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">Sem recebimentos.</p>}
            </Panel>
            <Panel title="Saldo por conta">
              <ul className="space-y-2 text-sm">
                {data.accounts.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3"><span className="truncate">{a.unit.name} · {a.name}</span><span className="num">{brl(a.balance)}</span></li>
                ))}
              </ul>
            </Panel>
            <Panel title="Produtividade">
              <ul className="space-y-2 text-sm">
                {data.productivity.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3"><span>{p.name} <span className="text-muted">· {p.services} serviços</span></span><span className="num">{brl(p.revenue)}</span></li>
                ))}
                {!data.productivity.length && <li className="text-muted">Sem atendimentos.</li>}
              </ul>
            </Panel>
          </div>
          {data.internalTransfers.count > 0 && (
            <p className="text-sm text-muted">{data.internalTransfers.count} transferência(s) interna(s) no período ({brl(data.internalTransfers.amount)}) eliminadas do consolidado.</p>
          )}
        </div>
      )}
    </>
  );
}

function ManagerDashboard() {
  const { unitId } = useUnit();
  const [f, setF] = useState({ from: monthStart(), to: isoDay(), serviceId: '', method: '' });
  const { data, error, loading } = useApi(unitId ? `/dashboard/manager${qs({ ...f, unitId })}` : null);
  const services = useApi('/services').data;
  return (
    <>
      <PageHeader title={data?.unit?.name ?? 'Unidade'} subtitle="Indicadores, agenda do dia e estoque da unidade selecionada." />
      <Filters f={f} setF={setF} showUnit={false} services={services} />
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && !data.empty && (
        <div className="space-y-6">
          <Kpis s={data.summary} available={data.available} />
          <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
            <Panel title="Agenda de hoje" action={<Link to="/painel/agenda" className="text-sm text-gold">Abrir agenda</Link>}>
              <TodayList items={data.today} tz={data.unit.timezone} />
            </Panel>
            <Panel title="Caixa">
              <ul className="space-y-2 text-sm">
                {data.accounts.map((a) => <li key={a.id} className="flex justify-between"><span>{a.name}</span><span className="num">{brl(a.balance)}</span></li>)}
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                {data.appointmentsByStatus.map((s) => <Pill key={s.status} tone={STATUS_TONE[s.status]}>{LABELS.appointment[s.status]}: {s.count}</Pill>)}
              </div>
            </Panel>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Fluxo de caixa"><CashFlowChart data={data.cashFlow} /></Panel>
            <Panel title="Produtividade por barbeiro"><HBar data={data.productivity} /></Panel>
            <Panel title="Serviços mais vendidos"><HBar data={data.top.services} /></Panel>
            <Panel title="Estoque baixo">
              {data.lowStock.length ? (
                <ul className="space-y-2 text-sm">
                  {data.lowStock.map((p) => <li key={p.name} className="flex justify-between"><span>{p.name}</span><span className="num text-amber-300">{p.quantity} (mín. {p.minQuantity})</span></li>)}
                </ul>
              ) : <p className="text-sm text-muted">Nenhum produto abaixo do mínimo.</p>}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

function TodayList({ items, tz }) {
  if (!items?.length) return <p className="text-sm text-muted">Nenhum agendamento hoje.</p>;
  return (
    <ul className="divide-y divide-white/5">
      {items.map((a) => (
        <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
          <span className="num w-12 font-heading text-lg">{timeBR(a.startsAt, tz)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{a.client.name}</span>
            <span className="block truncate text-xs text-muted">{a.items.map((i) => i.serviceName).join(' + ')} · {a.barber.name}</span>
          </span>
          <Pill tone={STATUS_TONE[a.status]}>{LABELS.appointment[a.status]}</Pill>
        </li>
      ))}
    </ul>
  );
}

function ReceptionDashboard() {
  const { unitId, unit } = useUnit();
  const today = isoDay(0, unit?.timezone);
  const { data, loading, error } = useApi(unitId ? `/appointments${qs({ unitId, from: today })}` : null);
  return (
    <>
      <PageHeader title="Hoje" subtitle={unit?.name} actions={<Link to="/painel/agenda" className="btn-gold">Abrir agenda</Link>} />
      {loading && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && <div className="card p-5"><TodayList items={data} tz={unit?.timezone} /></div>}
    </>
  );
}

function BarberDashboard() {
  const [f, setF] = useState({ from: monthStart(), to: isoDay() });
  const { data, error, loading } = useApi(`/dashboard/barber${qs(f)}`);
  return (
    <>
      <PageHeader title="Meu painel" subtitle="Sua agenda, seus atendimentos e sua remuneração." />
      <div className="card mb-6 p-4"><PeriodPicker from={f.from} to={f.to} onChange={(p) => setF({ ...f, ...p })} /></div>
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Serviços realizados" value={data.summary.servicesCount} hint={brl(data.summary.servicesRevenue)} />
            <Stat label="Produtos vendidos" value={data.summary.productsCount} hint={brl(data.summary.productsRevenue)} />
            <Stat label="Comissões" value={brl(data.summary.commissions)} tone="gold" />
            <Stat label="Pendente a receber" value={brl(data.summary.pending)} hint={`${brl(data.summary.notYetDue)} aguardando pagamento do cliente`} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Próximos atendimentos">
              {data.upcoming.length ? (
                <ul className="divide-y divide-white/5">
                  {data.upcoming.map((a) => (
                    <li key={a.id} className="py-2.5 text-sm">
                      <span className="num font-heading">{dateBR(a.startsAt, a.unit.timezone)} {timeBR(a.startsAt, a.unit.timezone)}</span> · {a.client.name}
                      <span className="block text-xs text-muted">{a.items.map((i) => i.serviceName).join(' + ')} · {a.unit.name}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">Nenhum atendimento futuro.</p>}
            </Panel>
            <Panel title="Comissões por dia">
              {data.commissionsByDay.length ? (
                <div className="h-56 w-full">
                  <ResponsiveContainer>
                    <BarChart data={data.commissionsByDay.map((d) => ({ day: `${d.day.slice(8)}/${d.day.slice(5, 7)}`, value: Number(d.amount) }))}>
                      <CartesianGrid stroke={grid} vertical={false} />
                      <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} />
                      <YAxis tick={axis} tickLine={false} axisLine={false} width={48} />
                      <Tooltip contentStyle={tooltipStyle} formatter={money} />
                      <Bar dataKey="value" name="Comissão" fill="rgb(var(--bp-accent))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="text-sm text-muted">Sem comissões no período.</p>}
            </Panel>
          </div>
          <Link to="/painel/meu-financeiro" className="btn-ghost">Ver demonstrativo completo</Link>
        </div>
      )}
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  if (user.role === 'OWNER') return <OwnerDashboard />;
  if (user.role === 'MANAGER') return <ManagerDashboard />;
  if (user.role === 'BARBER') return <BarberDashboard />;
  return <ReceptionDashboard />;
}
