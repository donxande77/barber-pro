import { useState } from 'react';
import { Plus, Pencil, RefreshCw, Loader2, BadgeCheck } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useUnit, UnitSelect } from '../../auth/UnitContext.jsx';
import { api } from '../../lib/api.js';
import { useApi, qs } from '../../lib/useApi.js';
import { brl, dateBR, phoneBR, LABELS } from '../../lib/format.js';
import { PageHeader, Spinner, Alert, Modal, Field, Pill, STATUS_TONE, Empty, ConfirmButton, Tabs, DataTable, Stat } from '../../components/ui.jsx';

// Datas sem horário (colunas DATE) chegam como "AAAA-MM-DDT00:00:00Z": formata sem converter fuso.
const day = (v) => (v ? v.slice(0, 10).split('-').reverse().join('/') : '—');
const usageText = (u) => `${u.used}${u.quantity ? `/${u.quantity}` : ''} ${u.name}`;

export default function PlansPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState('subs');
  return (
    <>
      <PageHeader
        title="Planos mensais"
        subtitle="Assinaturas de corte e barba: o cliente paga a mensalidade e os serviços do plano saem sem custo no atendimento, dentro do limite do mês."
      />
      <Tabs value={tab} onChange={setTab} tabs={[['subs', 'Assinantes'], ['charges', 'Mensalidades'], ['plans', 'Planos']]} />
      {tab === 'subs' && <SubscriptionsTab />}
      {tab === 'charges' && <ChargesTab />}
      {tab === 'plans' && <PlansTab manage={can('plans:manage')} />}
    </>
  );
}

// ── Assinantes ──

function SubscriptionsTab() {
  const { unitId } = useUnit();
  const [status, setStatus] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useApi(unitId ? `/subscriptions${qs({ unitId, status, search: search.trim().length >= 2 ? search.trim() : undefined })}` : null, [unitId]);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(null);
  const mrr = (data ?? []).filter((s) => s.status === 'ACTIVE').reduce((a, s) => a + Number(s.price), 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <UnitSelect className="input w-auto py-2" />
        <select className="input w-auto py-2" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
          <option value="">Todas</option>
          {Object.entries(LABELS.subscription).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className="input w-full py-2 sm:w-64" placeholder="Buscar cliente" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar cliente" />
        <button className="btn-gold sm:ml-auto" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nova assinatura</button>
      </div>
      {status === 'ACTIVE' && data && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Assinantes ativos" value={data.length} />
          <Stat label="Mensalidades contratadas" value={brl(mrr)} hint="por mês" tone="gold" />
          <Stat label="Com mensalidade atrasada" value={data.filter((s) => s.paymentStatus !== 'OK').length} tone={data.some((s) => s.paymentStatus === 'BLOCKED') ? 'red' : undefined} />
        </div>
      )}
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && (
        <DataTable
          rows={data}
          empty="Nenhuma assinatura aqui."
          onRowClick={setOpen}
          columns={[
            { key: 'client', label: 'Cliente', render: (s) => <span>{s.client.name} <span className="text-xs text-muted">· {phoneBR(s.client.phone)}</span></span> },
            { key: 'plan', label: 'Plano', render: (s) => `${s.planSnapshot.name} · ${brl(s.price)}` },
            { key: 'usage', label: 'Uso no mês', render: (s) => (s.status === 'ACTIVE' ? s.usage.map(usageText).join(' · ') : '—') },
            { key: 'due', label: 'Vence todo dia', render: (s) => s.startDate.slice(8, 10) },
            { key: 'pay', label: 'Pagamento', render: (s) => (s.status === 'ACTIVE' ? <Pill tone={STATUS_TONE[s.paymentStatus]}>{LABELS.subPayment[s.paymentStatus]}</Pill> : '—') },
            { key: 'status', label: 'Situação', render: (s) => <Pill tone={STATUS_TONE[s.status]}>{LABELS.subscription[s.status]}</Pill> },
          ]}
        />
      )}
      {creating && <SubscribeForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {open && <SubscriptionModal id={open.id} onClose={() => { setOpen(null); reload(); }} />}
    </>
  );
}

function SubscribeForm({ onClose, onSaved }) {
  const { unitId, units } = useUnit();
  const [unit, setUnit] = useState(unitId);
  const plans = (useApi('/plans?status=ACTIVE').data ?? []).filter((p) => !p.unitId || p.unitId === unit);
  const accounts = (useApi(unit ? `/finance/accounts/options${qs({ unitId: unit })}` : null, [unit]).data ?? []).filter((a) => a.status === 'ACTIVE');
  const [search, setSearch] = useState('');
  const [client, setClient] = useState(null);
  const found = useApi(search.length >= 2 && !client ? `/clients${qs({ search, pageSize: 6 })}` : null).data?.items ?? [];
  const [planId, setPlanId] = useState('');
  const [paid, setPaid] = useState(true);
  const [method, setMethod] = useState('PIX');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const acc = accountId || accounts[0]?.id;
  const plan = plans.find((p) => p.id === planId);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/subscriptions', { clientId: client.id, planId, unitId: unit, ...(paid ? { payment: { accountId: acc, method } } : {}) });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="Nova assinatura" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        {units.length > 1 && (
          <Field label="Unidade que recebe as mensalidades" id="ns-unit">
            <select id="ns-unit" className="input" value={unit ?? ''} onChange={(e) => setUnit(e.target.value)}>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Cliente" id="ns-client">
          {client ? (
            <p className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
              <span>{client.name} <span className="text-muted">· {phoneBR(client.phone)}</span></span>
              <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setClient(null)}>Trocar</button>
            </p>
          ) : (
            <>
              <input id="ns-client" className="input" placeholder="Buscar por nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
              {found.length > 0 && (
                <ul className="mt-1 divide-y divide-white/5 rounded-lg border border-white/10">
                  {found.map((c) => (
                    <li key={c.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-white/5" onClick={() => setClient(c)}>{c.name} <span className="text-muted">· {phoneBR(c.phone)}</span></button></li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-muted">Cliente novo? Cadastre antes em Clientes.</p>
            </>
          )}
        </Field>
        <fieldset>
          <legend className="label">Plano</legend>
          {!plans.length && <p className="text-sm text-muted">Nenhum plano ativo para esta unidade. O proprietário cadastra na aba Planos.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {plans.map((p) => (
              <button type="button" key={p.id} aria-pressed={planId === p.id} onClick={() => setPlanId(p.id)} className={`rounded-xl border p-3 text-left ${planId === p.id ? 'border-gold bg-gold/10' : 'border-white/10'}`}>
                <p className="font-heading text-lg">{p.name}</p>
                <p className="num text-gold">{brl(p.price)}<span className="text-xs text-muted"> /mês</span></p>
                <p className="mt-1 text-xs text-muted">{p.items.map((i) => `${i.quantity ? `${i.quantity}×` : 'Ilimitado'} ${i.serviceName}`).join(' · ')}</p>
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="accent-[rgb(var(--bp-accent))]" /> Cliente pagou a 1ª mensalidade agora
        </label>
        {paid && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Forma de pagamento" id="ns-method">
              <select id="ns-method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {Object.entries(LABELS.method).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Conta" id="ns-acc">
              <select id="ns-acc" className="input" value={acc ?? ''} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </div>
        )}
        <p className="text-xs text-muted">A mensalidade vence todo mês no dia de hoje. Com mais de 5 dias de atraso, o plano deixa de cobrir serviços até o pagamento.</p>
        <Alert>{error}</Alert>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-gold" disabled={busy || !client || !plan || (paid && !acc)}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Assinar {plan ? `· ${brl(plan.price)}` : ''}</button>
        </div>
      </form>
    </Modal>
  );
}

function SubscriptionModal({ id, onClose }) {
  const { data: sub, setData, error } = useApi(`/subscriptions/${id}`);
  const [err, setErr] = useState('');
  const act = async (action, reason) => {
    setErr('');
    try {
      setData(await api.post(`/subscriptions/${id}/status`, { action, reason }));
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <Modal open wide title={sub ? `${sub.client.name} · ${sub.planSnapshot.name}` : 'Assinatura'} onClose={onClose}>
      {!sub && !error && <Spinner />}
      <Alert>{error?.message || err}</Alert>
      {sub && (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap gap-2">
            <Pill tone={STATUS_TONE[sub.status]}>{LABELS.subscription[sub.status]}</Pill>
            {sub.status === 'ACTIVE' && <Pill tone={STATUS_TONE[sub.paymentStatus]}>{LABELS.subPayment[sub.paymentStatus]}</Pill>}
            <span className="text-muted">Desde {day(sub.startDate)} · {brl(sub.price)}/mês · {sub.unit.name}</span>
          </div>
          {sub.status === 'ACTIVE' && (
            <section>
              <h3 className="font-heading text-lg">Uso de {day(sub.period.start)} a {day(addDay(sub.period.end, -1))}</h3>
              <ul className="mt-2 grid gap-2 sm:grid-cols-3">
                {sub.usage.map((u) => (
                  <li key={u.serviceId} className="rounded-lg border border-white/10 p-3">
                    <p className="text-muted">{u.name}</p>
                    <p className="num font-heading text-2xl">{u.used}<span className="text-sm text-muted"> / {u.quantity ?? '∞'}</span></p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="font-heading text-lg">Mensalidades recentes</h3>
            <ul className="mt-2 divide-y divide-white/5">
              {sub.charges.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="flex-1">{day(c.periodStart)} a {day(addDay(c.periodEnd, -1))}</span>
                  <span className="num">{brl(c.amount)}</span>
                  <Pill tone={STATUS_TONE[c.status]}>{LABELS.charge[c.status]}{c.paidAt ? ` em ${dateBR(c.paidAt)}` : ''}</Pill>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted">Receba e cancele mensalidades na aba Mensalidades.</p>
          </section>
          {sub.notes && <p className="text-muted">Observações: {sub.notes}</p>}
          {sub.cancelReason && <Alert tone="info">Cancelada: {sub.cancelReason}</Alert>}
          <div className="flex flex-wrap gap-2 border-t border-white/5 pt-4">
            {sub.status === 'ACTIVE' && <button className="btn-ghost btn-sm" onClick={() => act('pause')}>Pausar</button>}
            {sub.status === 'PAUSED' && <button className="btn-gold btn-sm" onClick={() => act('resume')}>Retomar</button>}
            {sub.status !== 'CANCELLED' && (
              <ConfirmButton needReason danger question="Cancelar a assinatura? Mensalidades em aberto também são canceladas." confirmText="Cancelar assinatura" onConfirm={(reason) => act('cancel', reason)}>
                Cancelar assinatura
              </ConfirmButton>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

const addDay = (iso, n) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString();
};

// ── Mensalidades ──

function ChargesTab() {
  const { unitId } = useUnit();
  const [status, setStatus] = useState('OPEN');
  const { data, loading, error, reload } = useApi(unitId ? `/subscription-charges${qs({ unitId, status })}` : null, [unitId]);
  const accounts = (useApi(unitId ? `/finance/accounts/options${qs({ unitId })}` : null, [unitId]).data ?? []).filter((a) => a.status === 'ACTIVE');
  const [paying, setPaying] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const generate = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await api.post('/subscription-charges/generate', { unitId });
      setMsg(r.created ? `${r.created} mensalidade(s) gerada(s).` : 'Tudo em dia: nenhuma mensalidade nova para gerar.');
      reload();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  const openTotal = (data ?? []).filter((c) => c.status === 'OPEN').reduce((a, c) => a + Number(c.amount), 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <UnitSelect className="input w-auto py-2" />
        <select className="input w-auto py-2" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
          <option value="">Todas</option>
          {Object.entries(LABELS.charge).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn-ghost sm:ml-auto" disabled={busy} onClick={generate}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Gerar mensalidades do mês
        </button>
      </div>
      {msg && <Alert tone="info">{msg}</Alert>}
      {status === 'OPEN' && data?.length > 0 && <p className="mb-3 text-sm text-muted">Em aberto: <span className="num text-ink">{brl(openTotal)}</span> · {data.filter((c) => c.overdue).length} vencida(s)</p>}
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && (
        <DataTable
          rows={data}
          empty="Nenhuma mensalidade aqui."
          columns={[
            { key: 'client', label: 'Cliente', render: (c) => c.subscription.client.name },
            { key: 'plan', label: 'Plano', render: (c) => c.subscription.planSnapshot.name },
            { key: 'due', label: 'Vencimento', render: (c) => <span className={c.overdue ? 'text-red-300' : ''}>{day(c.dueDate)}</span> },
            { key: 'amount', label: 'Valor', align: 'right', render: (c) => brl(c.amount) },
            { key: 'status', label: 'Situação', render: (c) => <Pill tone={c.overdue ? 'red' : STATUS_TONE[c.status]}>{c.overdue ? 'Vencida' : LABELS.charge[c.status]}{c.method ? ` · ${LABELS.method[c.method]}` : ''}</Pill> },
            {
              key: 'act', label: '', render: (c) => c.status === 'OPEN' && (
                <div className="flex flex-wrap justify-end gap-1.5">
                  <button className="btn-gold btn-sm" onClick={(e) => { e.stopPropagation(); setPaying(c); }}>Receber</button>
                  <ConfirmButton needReason question="Cancelar esta mensalidade?" confirmText="Cancelar" onConfirm={async (reason) => { await api.post(`/subscription-charges/${c.id}/cancel`, { reason }); reload(); }}>Cancelar</ConfirmButton>
                </div>
              ),
            },
          ]}
        />
      )}
      <p className="mt-3 text-xs text-muted">Recebimento lançado por engano? Estorne a movimentação em Financeiro: a mensalidade volta a ficar em aberto.</p>
      {paying && <PayCharge charge={paying} accounts={accounts} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); reload(); }} />}
    </>
  );
}

function PayCharge({ charge, accounts, onClose, onPaid }) {
  const [method, setMethod] = useState('PIX');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const acc = accountId || accounts[0]?.id;
  const pay = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/subscription-charges/${charge.id}/pay`, { accountId: acc, method });
      onPaid();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={`Receber ${brl(charge.amount)}`} onClose={onClose}>
      <form onSubmit={pay} className="space-y-4">
        <p className="text-sm text-muted">{charge.subscription.client.name} · {charge.subscription.planSnapshot.name} · vencimento {day(charge.dueDate)}</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Forma de pagamento">
          {Object.entries(LABELS.method).map(([k, v]) => (
            <button type="button" role="radio" aria-checked={method === k} key={k} onClick={() => setMethod(k)} className={`rounded-full border px-3 py-1 text-xs ${method === k ? 'border-gold bg-gold text-gold-contrast' : 'border-white/10'}`}>{v}</button>
          ))}
        </div>
        <Field label="Conta" id="pc-acc">
          <select id="pc-acc" className="input" value={acc ?? ''} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Alert>{error}</Alert>
        <button className="btn-gold w-full" disabled={busy || !acc}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Registrar recebimento</button>
      </form>
    </Modal>
  );
}

// ── Planos ──

function PlansTab({ manage }) {
  const { data, loading, error, reload } = useApi('/plans');
  const [editing, setEditing] = useState(null);
  return (
    <>
      {manage && (
        <div className="mb-4 flex justify-end">
          <button className="btn-gold" onClick={() => setEditing({})}><Plus className="h-4 w-4" /> Novo plano</button>
        </div>
      )}
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && !data.length && (
        <Empty title="Nenhum plano cadastrado" action={manage && <button className="btn-gold" onClick={() => setEditing({})}>Criar o primeiro plano</button>}>
          Exemplos: "Plano Corte" com 4 cortes por mês, ou "Corte + Barba" com cortes e barbas ilimitados.
        </Empty>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data?.map((p) => (
          <li key={p.id} className={`card p-5 ${p.highlight ? 'ring-1 ring-gold/60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-heading text-2xl leading-tight">{p.name}</p>
                <p className="num text-xl text-gold">{brl(p.price)}<span className="text-xs text-muted"> /mês</span></p>
              </div>
              <Pill tone={STATUS_TONE[p.status]}>{p.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</Pill>
            </div>
            {p.description && <p className="mt-2 text-sm text-muted">{p.description}</p>}
            <ul className="mt-3 space-y-1 text-sm">
              {p.items.map((i) => <li key={i.id} className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-gold" /> {i.quantity ? `${i.quantity}×` : 'Ilimitado:'} {i.serviceName}</li>)}
            </ul>
            <p className="mt-3 text-xs text-muted">
              {p.unit ? `Só na unidade ${p.unit.name}` : 'Vale em todas as unidades'} · {p.activeSubscribers} assinante(s) · {p.commissionOnCovered ? 'comissão sobre o preço do serviço' : 'sem comissão nos serviços cobertos'}
            </p>
            {manage && <button className="btn-ghost btn-sm mt-3" onClick={() => setEditing(p)}><Pencil className="h-3.5 w-3.5" /> Editar</button>}
          </li>
        ))}
      </ul>
      {editing && <PlanForm plan={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function PlanForm({ plan, onClose, onSaved }) {
  const { units } = useUnit();
  const services = (useApi('/services').data ?? []).filter((s) => s.status === 'ACTIVE');
  const [f, setF] = useState({
    name: plan.name ?? '', description: plan.description ?? '', price: plan.price ? String(plan.price).replace('.', ',') : '',
    unitId: plan.unitId ?? '', status: plan.status ?? 'ACTIVE', highlight: plan.highlight ?? false, commissionOnCovered: plan.commissionOnCovered ?? true,
    sortOrder: plan.sortOrder ?? 0,
  });
  // items: { [serviceId]: quantity ('' = ilimitado) }
  const [items, setItems] = useState(() => Object.fromEntries((plan.items ?? []).map((i) => [i.serviceId, i.quantity ?? ''])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (id) => {
    const next = { ...items };
    if (id in next) delete next[id];
    else next[id] = 4;
    setItems(next);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      ...f, description: f.description || null, unitId: f.unitId || null, sortOrder: Number(f.sortOrder) || 0,
      items: Object.entries(items).map(([serviceId, q]) => ({ serviceId, quantity: q === '' ? null : Number(q) })),
    };
    try {
      if (plan.id) await api.patch(`/plans/${plan.id}`, body);
      else await api.post('/plans', body);
      onSaved();
    } catch (err) {
      setError(err.fields?.length ? err.fields.map((x) => x.message).join(' · ') : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open wide title={plan.id ? 'Editar plano' : 'Novo plano'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Nome" id="pl-name"><input id="pl-name" required className="input" placeholder="Ex.: Plano Corte + Barba" value={f.name} onChange={set('name')} /></Field>
          <Field label="Mensalidade (R$)" id="pl-price"><input id="pl-price" required className="input" inputMode="decimal" placeholder="189,90" value={f.price} onChange={set('price')} /></Field>
        </div>
        <Field label="Descrição (aparece no site)" id="pl-desc"><textarea id="pl-desc" rows={2} className="input" value={f.description} onChange={set('description')} /></Field>
        <fieldset>
          <legend className="label">Serviços incluídos e limite por mês (vazio = ilimitado)</legend>
          <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
            {services.map((s) => {
              const on = s.id in items;
              return (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <label className="flex flex-1 items-center gap-2">
                    <input type="checkbox" checked={on} onChange={() => toggle(s.id)} className="accent-[rgb(var(--bp-accent))]" /> {s.name}
                  </label>
                  {on && (
                    <input
                      className="input w-24 py-1" inputMode="numeric" placeholder="ilimitado" aria-label={`Limite de ${s.name} por mês`}
                      value={items[s.id]} onChange={(e) => setItems({ ...items, [s.id]: e.target.value.replace(/\D/g, '') })}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Vale em" id="pl-unit">
            <select id="pl-unit" className="input" value={f.unitId} onChange={set('unitId')}>
              <option value="">Todas as unidades</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Situação" id="pl-status">
            <select id="pl-status" className="input" value={f.status} onChange={set('status')}>
              <option value="ACTIVE">Ativo (aparece no site)</option>
              <option value="INACTIVE">Inativo (não aceita novas assinaturas)</option>
            </select>
          </Field>
          <Field label="Ordem no site" id="pl-order"><input id="pl-order" className="input" inputMode="numeric" value={f.sortOrder} onChange={set('sortOrder')} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.highlight} onChange={(e) => setF({ ...f, highlight: e.target.checked })} className="accent-[rgb(var(--bp-accent))]" /> Destacar como "mais escolhido" no site
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.commissionOnCovered} onChange={(e) => setF({ ...f, commissionOnCovered: e.target.checked })} className="accent-[rgb(var(--bp-accent))]" /> Barbeiro recebe comissão sobre o preço de tabela dos serviços cobertos
        </label>
        {plan.id && <p className="text-xs text-muted">Mudanças valem para novas assinaturas. Quem já assinou mantém preço e serviços contratados.</p>}
        <Alert>{error}</Alert>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-gold" disabled={busy || !Object.keys(items).length}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
