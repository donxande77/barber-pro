import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useUnit } from '../../auth/UnitContext.jsx';
import { api } from '../../lib/api.js';
import { useApi, qs } from '../../lib/useApi.js';
import { brl, dateBR, isoDay, monthStart, LABELS } from '../../lib/format.js';
import { PageHeader, Spinner, Alert, Tabs, DataTable, Field, Pill, STATUS_TONE, Stat, PeriodPicker, ConfirmButton, Modal } from '../../components/ui.jsx';

/** Demonstrativo: calculado, devido, pago e pendente. Usado pelo gestor e pelo próprio barbeiro. */
export function Statement({ barberId, unitId }) {
  const [p, setP] = useState({ from: monthStart(), to: isoDay() });
  const { data, loading, error } = useApi(`/compensation/statement${qs({ barberId, unitId, ...p })}`);
  const s = data?.summary;
  return (
    <div className="space-y-6">
      <div className="card p-4"><PeriodPicker from={p.from} to={p.to} onChange={setP} /></div>
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {s && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Serviços realizados" value={s.servicesCount} hint={brl(s.servicesRevenue)} />
            <Stat label="Produtos vendidos" value={s.productsCount} hint={brl(s.productsRevenue)} />
            <Stat label="Faturamento atribuído" value={brl(s.revenue)} hint={`Descontos ${brl(s.discounts)}`} />
            <Stat label="Comissões geradas" value={brl(s.commissions)} />
            <Stat label="Total calculado" value={brl(s.calculated)} hint={`Fixo ${brl(s.fixed)} · bônus ${brl(s.bonuses)} · ajustes ${brl(s.adjustments)}`} />
            <Stat label="Devido" value={brl(s.due)} hint={`${brl(s.notYetDue)} aguardando o cliente pagar`} />
            <Stat label="Pago" value={brl(s.paid)} tone="gold" />
            <Stat label="Pendente" value={brl(s.pending)} hint={Number(s.pendingBefore) > 0 ? `+ ${brl(s.pendingBefore)} de períodos anteriores` : undefined} tone={Number(s.pending) > 0 ? 'red' : undefined} />
          </div>
          {(Number(s.chairRentDue) > 0 || Number(s.chairRentPaid) > 0) && (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Aluguel de cadeira devido" value={brl(s.chairRentDue)} />
              <Stat label="Aluguel pago" value={brl(s.chairRentPaid)} />
              <Stat label="Aluguel pendente" value={brl(s.chairRentPending)} />
            </div>
          )}
          <section>
            <h3 className="mb-3 font-heading text-xl">Lançamentos</h3>
            <DataTable
              rows={data.obligations}
              empty="Nenhum lançamento no período"
              columns={[
                { key: 'createdAt', label: 'Data', render: (o) => dateBR(o.createdAt) },
                { key: 'type', label: 'Tipo', render: (o) => LABELS.obligation[o.type] },
                { key: 'description', label: 'Descrição', hideSm: true },
                { key: 'amount', label: 'Valor', align: 'right', render: (o) => `${o.direction === 'RECEIVABLE_FROM_BARBER' ? '−' : ''}${brl(o.amount)}` },
                { key: 'settledAmount', label: 'Pago', align: 'right', render: (o) => brl(o.settledAmount) },
                { key: 'status', label: 'Situação', render: (o) => <Pill tone={o.status === 'CANCELLED' ? 'red' : o.status === 'SETTLED' ? 'green' : o.due ? 'amber' : 'gray'}>{o.status === 'CANCELLED' ? 'Cancelado' : o.status === 'SETTLED' ? 'Quitado' : o.due ? 'Devido' : 'Aguardando cliente'}</Pill> },
              ]}
            />
          </section>
          <section>
            <h3 className="mb-3 font-heading text-xl">Pagamentos recebidos</h3>
            <DataTable
              rows={data.payouts}
              empty="Nenhum pagamento no período"
              columns={[
                { key: 'paidAt', label: 'Data', render: (x) => dateBR(x.paidAt) },
                { key: 'unit', label: 'Unidade', render: (x) => x.unit.name },
                { key: 'dir', label: 'Tipo', render: (x) => (x.direction === 'PAYABLE_TO_BARBER' ? 'Pagamento ao profissional' : 'Aluguel pago pelo profissional') },
                { key: 'amount', label: 'Valor', align: 'right', render: (x) => brl(x.amount) },
              ]}
            />
          </section>
        </>
      )}
    </div>
  );
}

export function MyFinancePage() {
  return (
    <>
      <PageHeader title="Meu financeiro" subtitle="Comissões, remuneração, pagamentos recebidos e pendências. Comissão fica devida quando o cliente paga a venda." />
      <Statement />
    </>
  );
}

export default function CompensationPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState('statement');
  const tabs = [['statement', 'Demonstrativo'], ['obligations', 'Lançamentos'], ['payouts', 'Pagamentos'], ['rules', 'Regras'], ['periodic', 'Fixos e aluguéis']];
  return (
    <>
      <PageHeader title="Remuneração" subtitle="Comissões, remuneração fixa, aluguel de cadeira, bônus e pagamentos aos profissionais." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'statement' && <StatementTab />}
      {tab === 'obligations' && <ObligationsTab />}
      {tab === 'payouts' && <PayoutsTab />}
      {tab === 'rules' && <RulesTab canEdit={can('compensation:manage')} />}
      {tab === 'periodic' && <PeriodicTab />}
    </>
  );
}

function BarberSelect({ value, onChange, id = 'barber-sel' }) {
  const { unitId } = useUnit();
  const barbers = useApi(`/barbers${qs({ unitId })}`).data ?? [];
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Escolha o barbeiro…</option>
      {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );
}

function StatementTab() {
  const { unitId } = useUnit();
  const [barberId, setBarberId] = useState('');
  return (
    <div className="space-y-4">
      <div className="max-w-xs"><Field label="Barbeiro" id="st-b"><BarberSelect id="st-b" value={barberId} onChange={setBarberId} /></Field></div>
      {barberId ? <Statement barberId={barberId} unitId={unitId} /> : <p className="text-sm text-muted">Escolha um barbeiro para ver o demonstrativo na unidade selecionada.</p>}
    </div>
  );
}

function ObligationsTab() {
  const { unitId } = useUnit();
  const [status, setStatus] = useState('OPEN');
  const [adding, setAdding] = useState(false);
  const { data, loading, error, reload } = useApi(`/compensation/obligations${qs({ unitId, status })}`);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <label className="label" htmlFor="ob-st">Situação</label>
          <select id="ob-st" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(LABELS.obligationStatus).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button className="btn-gold ml-auto" onClick={() => setAdding(true)}>Lançar bônus ou ajuste</button>
      </div>
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && (
        <DataTable
          rows={data}
          empty="Nenhum lançamento"
          columns={[
            { key: 'barber', label: 'Barbeiro', render: (o) => o.barber.name },
            { key: 'type', label: 'Tipo', render: (o) => LABELS.obligation[o.type] },
            { key: 'description', label: 'Descrição', hideSm: true },
            { key: 'createdAt', label: 'Data', render: (o) => dateBR(o.createdAt) },
            { key: 'amount', label: 'Valor', align: 'right', render: (o) => `${o.direction === 'RECEIVABLE_FROM_BARBER' ? '−' : ''}${brl(o.amount)}` },
            { key: 'pending', label: 'Pendente', align: 'right', render: (o) => brl(o.pending) },
            { key: 'due', label: 'Situação', render: (o) => <Pill tone={STATUS_TONE[o.status] ?? (o.due ? 'amber' : 'gray')}>{o.status === 'OPEN' && !o.due ? 'Aguardando cliente' : LABELS.obligationStatus[o.status]}</Pill> },
            {
              key: 'act', label: '', render: (o) => ['BONUS', 'ADJUSTMENT', 'FIXED_SALARY', 'CHAIR_RENTAL'].includes(o.type) && o.status === 'OPEN' && Number(o.settledAmount) === 0 ? (
                <ConfirmButton danger needReason question="Cancelar este lançamento?" confirmText="Cancelar lançamento" onConfirm={async (reason) => { await api.post(`/compensation/obligations/${o.id}/cancel`, { reason }); reload(); }}>Cancelar</ConfirmButton>
              ) : null,
            },
          ]}
        />
      )}
      {adding && <ManualObligation onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

function ManualObligation({ onClose, onSaved }) {
  const { unitId } = useUnit();
  const [f, setF] = useState({ barberId: '', type: 'BONUS', direction: 'PAYABLE_TO_BARBER', amount: '', description: '' });
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post('/compensation/obligations', { ...f, unitId });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal open title="Bônus ou ajuste" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Barbeiro" id="mo-b"><BarberSelect id="mo-b" value={f.barberId} onChange={(barberId) => setF({ ...f, barberId })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo" id="mo-t"><select id="mo-t" className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="BONUS">Bônus</option><option value="ADJUSTMENT">Ajuste</option></select></Field>
          <Field label="Sentido" id="mo-d">
            <select id="mo-d" className="input" value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}>
              <option value="PAYABLE_TO_BARBER">A pagar ao barbeiro</option>
              <option value="RECEIVABLE_FROM_BARBER">A descontar do barbeiro</option>
            </select>
          </Field>
        </div>
        <Field label="Valor (R$)" id="mo-a"><input id="mo-a" required inputMode="decimal" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Descrição" id="mo-desc"><input id="mo-desc" required minLength={3} className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Alert>{error}</Alert>
        <button className="btn-gold w-full" disabled={!f.barberId}>Lançar</button>
      </form>
    </Modal>
  );
}

function PayoutsTab() {
  const { unitId } = useUnit();
  const { data, reload } = useApi(`/compensation/payouts${qs({ unitId })}`);
  const accounts = (useApi(`/finance/accounts${qs({ unitId })}`).data ?? []).filter((a) => a.status === 'ACTIVE');
  const [f, setF] = useState({ barberId: '', accountId: '', direction: 'PAYABLE_TO_BARBER', amount: '', notes: '' });
  const [msg, setMsg] = useState(null);
  const pending = useApi(f.barberId ? `/compensation/obligations${qs({ unitId, barberId: f.barberId })}` : null).data ?? [];
  const available = pending.filter((o) => o.direction === f.direction && o.due && ['OPEN', 'PARTIAL'].includes(o.status)).reduce((s, o) => s + Number(o.pending), 0);
  const pay = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post('/compensation/payouts', { ...f, unitId, accountId: f.accountId || accounts[0]?.id, notes: f.notes || null });
      setMsg({ ok: true, t: 'Pagamento registrado e lançado no caixa.' });
      setF({ ...f, amount: '', notes: '' });
      reload();
    } catch (err) {
      setMsg({ ok: false, t: err.message });
    }
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <form onSubmit={pay} className="card h-fit space-y-4 p-5">
        <h3 className="font-heading text-xl">Registrar pagamento</h3>
        <Field label="Barbeiro" id="po-b"><BarberSelect id="po-b" value={f.barberId} onChange={(barberId) => setF({ ...f, barberId })} /></Field>
        <Field label="Tipo" id="po-d">
          <select id="po-d" className="input" value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}>
            <option value="PAYABLE_TO_BARBER">Pagar ao barbeiro (comissão, fixo, bônus)</option>
            <option value="RECEIVABLE_FROM_BARBER">Receber aluguel de cadeira</option>
          </select>
        </Field>
        {f.barberId && <p className="text-sm text-muted">Saldo devido: <strong className="text-ink">{brl(available)}</strong></p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)" id="po-a"><input id="po-a" required inputMode="decimal" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Conta" id="po-acc">
            <select id="po-acc" className="input" value={f.accountId || accounts[0]?.id || ''} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Observação" id="po-n"><input id="po-n" className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {msg && <Alert tone={msg.ok ? 'ok' : 'error'}>{msg.t}</Alert>}
        <button className="btn-gold w-full" disabled={!f.barberId || !f.amount}>Registrar</button>
        <p className="text-xs text-muted">O valor quita os lançamentos devidos do mais antigo para o mais novo. Pagamento parcial é permitido.</p>
      </form>
      <DataTable
        rows={data}
        empty="Nenhum pagamento registrado"
        columns={[
          { key: 'paidAt', label: 'Data', render: (x) => dateBR(x.paidAt) },
          { key: 'barber', label: 'Barbeiro', render: (x) => x.barber.name },
          { key: 'direction', label: 'Tipo', render: (x) => (x.direction === 'PAYABLE_TO_BARBER' ? 'Pago ao barbeiro' : 'Aluguel recebido') },
          { key: 'account', label: 'Conta', render: (x) => x.account.name },
          { key: 'amount', label: 'Valor', align: 'right', render: (x) => brl(x.amount) },
        ]}
      />
    </div>
  );
}

function RulesTab({ canEdit }) {
  const [includeEnded, setIncludeEnded] = useState(false);
  const { data, loading, reload } = useApi(`/compensation/rules${qs({ includeEnded: includeEnded ? 'true' : '' })}`);
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeEnded} onChange={(e) => setIncludeEnded(e.target.checked)} className="accent-[rgb(var(--bp-accent))]" /> Mostrar regras encerradas</label>
        {canEdit && <button className="btn-gold ml-auto" onClick={() => setAdding(true)}>Nova regra</button>}
      </div>
      <Alert tone="info">Alterar um percentual cria uma nova regra a partir da data escolhida. Vendas anteriores mantêm o percentual que valia no momento.</Alert>
      {loading && !data && <Spinner />}
      {data && (
        <DataTable
          rows={data}
          empty="Nenhuma regra cadastrada"
          columns={[
            { key: 'barber', label: 'Barbeiro', render: (r) => r.barber.name },
            { key: 'type', label: 'Tipo', render: (r) => LABELS.rule[r.type] },
            { key: 'value', label: 'Valor', render: (r) => (r.percent != null ? `${Number(r.percent).toLocaleString('pt-BR')}%` : `${brl(r.amount)} ${LABELS.period[r.period]}`) },
            { key: 'scope', label: 'Aplica-se a', render: (r) => [r.unit?.name ?? 'Todas as unidades', r.service?.name, r.product?.name].filter(Boolean).join(' · ') },
            { key: 'validity', label: 'Vigência', render: (r) => `${dateBR(r.validFrom)} → ${r.validTo ? dateBR(r.validTo) : 'atual'}` },
            {
              key: 'act', label: '', render: (r) => canEdit && !r.validTo ? (
                <ConfirmButton question="Encerrar esta regra agora? Ela continua valendo para o passado." confirmText="Encerrar" onConfirm={async () => { await api.patch(`/compensation/rules/${r.id}/end`, { validTo: new Date().toISOString() }); reload(); }}>Encerrar</ConfirmButton>
              ) : null,
            },
          ]}
        />
      )}
      {adding && <RuleForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

function RuleForm({ onClose, onSaved }) {
  const { units } = useUnit();
  const services = useApi('/services').data ?? [];
  const products = useApi('/products').data ?? [];
  const [f, setF] = useState({ barberId: '', type: 'SERVICE_COMMISSION_PCT', unitId: '', serviceId: '', productId: '', percent: '', amount: '', period: 'MONTHLY', validFrom: isoDay(), notes: '' });
  const [error, setError] = useState('');
  const isPct = f.type.endsWith('_PCT');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/compensation/rules', {
        barberId: f.barberId, type: f.type, unitId: f.unitId || null,
        serviceId: f.type === 'SERVICE_COMMISSION_PCT' && f.serviceId ? f.serviceId : null,
        productId: f.type === 'PRODUCT_COMMISSION_PCT' && f.productId ? f.productId : null,
        ...(isPct ? { percent: f.percent } : { amount: f.amount, period: f.period }),
        validFrom: new Date(`${f.validFrom}T00:00:00-03:00`).toISOString(), notes: f.notes || null,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal open title="Nova regra de remuneração" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Barbeiro" id="r-b"><BarberSelect id="r-b" value={f.barberId} onChange={(barberId) => setF({ ...f, barberId })} /></Field>
        <Field label="Tipo" id="r-t"><select id="r-t" className="input" value={f.type} onChange={set('type')}>{Object.entries(LABELS.rule).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unidade" id="r-u"><select id="r-u" className="input" value={f.unitId} onChange={set('unitId')}><option value="">Todas as unidades do barbeiro</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          {f.type === 'SERVICE_COMMISSION_PCT' && <Field label="Serviço específico" id="r-s"><select id="r-s" className="input" value={f.serviceId} onChange={set('serviceId')}><option value="">Todos os serviços</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
          {f.type === 'PRODUCT_COMMISSION_PCT' && <Field label="Produto específico" id="r-p"><select id="r-p" className="input" value={f.productId} onChange={set('productId')}><option value="">Todos os produtos</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
        </div>
        {isPct ? (
          <Field label="Percentual (%)" id="r-pct"><input id="r-pct" required inputMode="decimal" className="input" value={f.percent} onChange={set('percent')} /></Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)" id="r-amt"><input id="r-amt" required inputMode="decimal" className="input" value={f.amount} onChange={set('amount')} /></Field>
            <Field label="Periodicidade" id="r-per"><select id="r-per" className="input" value={f.period} onChange={set('period')}><option value="MONTHLY">Mensal</option><option value="WEEKLY">Semanal</option></select></Field>
          </div>
        )}
        <Field label="Vale a partir de" id="r-from"><input id="r-from" type="date" required className="input" value={f.validFrom} onChange={set('validFrom')} /></Field>
        <Field label="Observação" id="r-n"><input id="r-n" className="input" value={f.notes} onChange={set('notes')} /></Field>
        <Alert>{error}</Alert>
        <button className="btn-gold w-full" disabled={!f.barberId}>Salvar regra</button>
      </form>
    </Modal>
  );
}

function PeriodicTab() {
  const { unitId, unit } = useUnit();
  const [month, setMonth] = useState(isoDay().slice(0, 7));
  const [msg, setMsg] = useState(null);
  const run = async () => {
    setMsg(null);
    try {
      const r = await api.post('/compensation/periodic', { unitId, month });
      setMsg({ ok: true, t: r.created ? `${r.created} lançamento(s) gerado(s).` : 'Nada novo para gerar: este mês já foi processado ou não há regras de fixo/aluguel.' });
    } catch (e) {
      setMsg({ ok: false, t: e.message });
    }
  };
  return (
    <div className="card max-w-lg space-y-4 p-5">
      <p className="text-sm text-ink/80">Gera a remuneração fixa e o aluguel de cadeira do mês para os barbeiros de <strong>{unit?.name}</strong>, conforme as regras vigentes. Pode rodar mais de uma vez: nada é duplicado.</p>
      <Field label="Mês de referência" id="pm"><input id="pm" type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
      {msg && <Alert tone={msg.ok ? 'ok' : 'error'}>{msg.t}</Alert>}
      <button className="btn-gold" onClick={run}>Gerar lançamentos do mês</button>
    </div>
  );
}
