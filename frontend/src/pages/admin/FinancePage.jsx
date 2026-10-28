import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useUnit } from '../../auth/UnitContext.jsx';
import { api } from '../../lib/api.js';
import { useApi, qs } from '../../lib/useApi.js';
import { brl, dateBR, dateTimeBR, isoDay, monthStart, LABELS } from '../../lib/format.js';
import { PageHeader, Spinner, Alert, Tabs, DataTable, Field, Pill, STATUS_TONE, Stat, PeriodPicker, ConfirmButton, Modal } from '../../components/ui.jsx';

export default function FinancePage() {
  const { can } = useAuth();
  const [tab, setTab] = useState('summary');
  const tabs = [
    ['summary', 'Resumo'], ['transactions', 'Movimentações'], ['bills', 'Contas a pagar e receber'], ['transfers', 'Transferências'],
    ['closings', 'Fechamento de caixa'], ['accounts', 'Contas'], ...(can('finance:consolidated:read') ? [['consolidated', 'Consolidado']] : []),
  ];
  return (
    <>
      <PageHeader title="Financeiro" subtitle="Movimentações confirmadas não são apagadas: correções são feitas por estorno, com registro de quem fez e por quê." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'summary' && <SummaryTab />}
      {tab === 'transactions' && <TransactionsTab />}
      {tab === 'bills' && <BillsTab />}
      {tab === 'transfers' && <TransfersTab />}
      {tab === 'closings' && <ClosingsTab />}
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'consolidated' && <ConsolidatedTab />}
    </>
  );
}

function SummaryGrid({ s, available }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Faturamento (vendas fechadas)" value={brl(s.revenue)} hint={`${s.salesCount} vendas`} />
      <Stat label="Recebimentos de vendas" value={brl(s.receipts)} />
      <Stat label="Outras receitas" value={brl(s.otherIncome)} />
      <Stat label="Despesas" value={brl(s.expenses)} hint={`inclui ${brl(s.payouts)} a profissionais`} />
      <Stat label="Resultado operacional" value={brl(s.operatingResult)} tone={Number(s.operatingResult) < 0 ? 'red' : 'gold'} hint="Recebimentos + receitas − despesas" />
      <Stat label="Saldo disponível" value={brl(available)} />
      <Stat label="Obrigações com profissionais" value={brl(s.pendingToBarbers)} />
      <Stat label="Contas a pagar em aberto" value={brl(s.payablesOpen)} hint={`a receber ${brl(s.receivablesOpen)}`} />
    </div>
  );
}

function SummaryTab() {
  const { unitId } = useUnit();
  const [p, setP] = useState({ from: monthStart(), to: isoDay() });
  const { data, loading, error } = useApi(`/finance/summary${qs({ unitId, ...p })}`);
  return (
    <div className="space-y-5">
      <div className="card p-4"><PeriodPicker from={p.from} to={p.to} onChange={setP} /></div>
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && (
        <>
          <SummaryGrid s={data.summary} available={data.available} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Custo dos produtos vendidos" value={brl(data.summary.cogs)} />
            <Stat label="Comissões do período" value={brl(data.summary.commissionsAccrued)} />
            <Stat label="Ajustes de conciliação" value={brl(data.summary.adjustments)} />
          </div>
          <section className="card p-5">
            <h2 className="mb-3 font-heading text-xl">Saldo por conta</h2>
            <ul className="divide-y divide-white/5 text-sm">
              {data.accounts.map((a) => <li key={a.id} className="flex justify-between py-2"><span>{a.name} <span className="text-muted">· {LABELS.account[a.type]}</span></span><span className="num">{brl(a.balance)}</span></li>)}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function TransactionsTab() {
  const { unitId } = useUnit();
  const { can } = useAuth();
  const [p, setP] = useState({ from: monthStart(), to: isoDay(), kind: '' });
  const { data, loading, error, reload } = useApi(`/finance/transactions${qs({ unitId, ...p })}`);
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <PeriodPicker from={p.from} to={p.to} onChange={(x) => setP({ ...p, ...x })} />
        <div className="w-48">
          <label className="label" htmlFor="tx-kind">Natureza</label>
          <select id="tx-kind" className="input py-2" value={p.kind} onChange={(e) => setP({ ...p, kind: e.target.value })}>
            <option value="">Todas</option>
            {Object.entries(LABELS.tx).filter(([k]) => k !== 'OPENING_BALANCE').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {can('finance:unit:manage') && <button className="btn-gold ml-auto" onClick={() => setAdding(true)}>Novo lançamento</button>}
      </div>
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && (
        <DataTable
          rows={data}
          empty="Nenhuma movimentação no período"
          columns={[
            { key: 'occurredAt', label: 'Data', render: (t) => dateTimeBR(t.occurredAt) },
            { key: 'kind', label: 'Natureza', render: (t) => <span>{LABELS.tx[t.kind]}{t.reversedBy && <Pill tone="red">estornada</Pill>}</span> },
            { key: 'description', label: 'Descrição', render: (t) => [t.description, t.category?.name].filter(Boolean).join(' · ') || '—' },
            { key: 'account', label: 'Conta', render: (t) => t.account.name },
            { key: 'amount', label: 'Valor', align: 'right', render: (t) => <span className={t.direction === 'IN' ? 'text-emerald-300' : 'text-red-300'}>{t.direction === 'IN' ? '+' : '−'}{brl(t.amount)}</span> },
            {
              key: 'act', label: '', render: (t) => can('finance:unit:manage') && !t.reversedBy && t.kind !== 'REVERSAL' && !t.payoutId ? (
                <ConfirmButton danger needReason question="Estornar? Será lançada uma movimentação inversa ligada a esta." confirmText="Estornar" onConfirm={async (reason) => { await api.post(`/finance/transactions/${t.id}/reverse`, { reason }); reload(); }}>Estornar</ConfirmButton>
              ) : null,
            },
          ]}
        />
      )}
      {adding && <TxForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

function AccountSelect({ id, value, onChange, unitId: forUnit }) {
  const { unitId } = useUnit();
  const accounts = (useApi(`/finance/accounts${qs({ unitId: forUnit ?? unitId })}`).data ?? []).filter((a) => a.status === 'ACTIVE');
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">Escolha a conta…</option>
      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({brl(a.balance)})</option>)}
    </select>
  );
}

function TxForm({ onClose, onSaved }) {
  const { unitId } = useUnit();
  const cats = useApi('/finance/categories').data ?? [];
  const [f, setF] = useState({ kind: 'EXPENSE', direction: 'OUT', accountId: '', amount: '', categoryId: '', description: '', occurredAt: '' });
  const [error, setError] = useState('');
  const setKind = (kind) => setF({ ...f, kind, direction: kind === 'INCOME' ? 'IN' : kind === 'EXPENSE' ? 'OUT' : f.direction, categoryId: '' });
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post('/finance/transactions', {
        unitId, ...f, categoryId: f.categoryId || null, occurredAt: f.occurredAt ? new Date(f.occurredAt).toISOString() : undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal open title="Novo lançamento" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="flex gap-2" role="radiogroup" aria-label="Natureza">
          {[['EXPENSE', 'Despesa'], ['INCOME', 'Receita'], ['ADJUSTMENT', 'Ajuste']].map(([k, v]) => (
            <button type="button" key={k} role="radio" aria-checked={f.kind === k} onClick={() => setKind(k)} className={`flex-1 rounded-lg border py-2 text-sm ${f.kind === k ? 'border-gold bg-gold/15 text-gold' : 'border-white/10'}`}>{v}</button>
          ))}
        </div>
        {f.kind === 'ADJUSTMENT' && (
          <Field label="Sentido" id="tx-dir"><select id="tx-dir" className="input" value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}><option value="IN">Entrada</option><option value="OUT">Saída</option></select></Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)" id="tx-a"><input id="tx-a" required inputMode="decimal" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Conta" id="tx-acc"><AccountSelect id="tx-acc" value={f.accountId} onChange={(accountId) => setF({ ...f, accountId })} /></Field>
        </div>
        {f.kind !== 'ADJUSTMENT' && (
          <Field label="Categoria" id="tx-cat">
            <select id="tx-cat" className="input" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
              <option value="">Sem categoria</option>
              {cats.filter((c) => c.kind === (f.kind === 'INCOME' ? 'INCOME' : 'EXPENSE')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Descrição" id="tx-d"><input id="tx-d" required minLength={2} className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Data (opcional, padrão agora)" id="tx-at"><input id="tx-at" type="datetime-local" className="input" value={f.occurredAt} onChange={(e) => setF({ ...f, occurredAt: e.target.value })} /></Field>
        <Alert>{error}</Alert>
        <button className="btn-gold w-full">Lançar</button>
      </form>
    </Modal>
  );
}

function BillsTab() {
  const { unitId } = useUnit();
  const [filter, setFilter] = useState({ kind: '', status: '' });
  const { data, loading, reload } = useApi(`/finance/bills${qs({ unitId, ...filter })}`);
  const cats = useApi('/finance/categories').data ?? [];
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40"><label className="label" htmlFor="b-k">Tipo</label><select id="b-k" className="input py-2" value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value })}><option value="">Todas</option><option value="PAYABLE">A pagar</option><option value="RECEIVABLE">A receber</option></select></div>
        <div className="w-40"><label className="label" htmlFor="b-s">Situação</label><select id="b-s" className="input py-2" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="">Todas</option>{Object.entries(LABELS.bill).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <button className="btn-gold ml-auto" onClick={() => setAdding(true)}>Nova conta</button>
      </div>
      {loading && !data && <Spinner />}
      {data && (
        <DataTable
          rows={data}
          empty="Nenhuma conta"
          columns={[
            { key: 'dueDate', label: 'Vencimento', render: (b) => <span className={b.status !== 'PAID' && b.status !== 'CANCELLED' && b.dueDate.slice(0, 10) < isoDay() ? 'text-red-300' : ''}>{dateBR(b.dueDate, 'UTC')}</span> },
            { key: 'kind', label: 'Tipo', render: (b) => (b.kind === 'PAYABLE' ? 'A pagar' : 'A receber') },
            { key: 'description', label: 'Descrição', render: (b) => [b.description, b.counterparty, b.category?.name].filter(Boolean).join(' · ') },
            { key: 'amount', label: 'Valor', align: 'right', render: (b) => brl(b.amount) },
            { key: 'open', label: 'Em aberto', align: 'right', render: (b) => brl(Number(b.amount) - Number(b.paidAmount)) },
            { key: 'status', label: 'Situação', render: (b) => <Pill tone={STATUS_TONE[b.status] ?? 'amber'}>{LABELS.bill[b.status]}</Pill> },
            {
              key: 'act', label: '', render: (b) => ['OPEN', 'PARTIAL'].includes(b.status) ? (
                <span className="flex flex-wrap justify-end gap-1.5">
                  <button className="btn-gold btn-sm" onClick={() => setPaying(b)}>{b.kind === 'PAYABLE' ? 'Pagar' : 'Receber'}</button>
                  {Number(b.paidAmount) === 0 && <ConfirmButton danger question="Cancelar esta conta?" confirmText="Cancelar conta" onConfirm={async () => { await api.post(`/finance/bills/${b.id}/cancel`); reload(); }}>Cancelar</ConfirmButton>}
                </span>
              ) : null,
            },
          ]}
        />
      )}
      {adding && <BillForm cats={cats} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {paying && <PayBill bill={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); reload(); }} />}
    </div>
  );
}

function BillForm({ cats, onClose, onSaved }) {
  const { unitId } = useUnit();
  const [f, setF] = useState({ kind: 'PAYABLE', description: '', counterparty: '', amount: '', dueDate: isoDay(), categoryId: '' });
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post('/finance/bills', { ...f, unitId, categoryId: f.categoryId || null });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal open title="Nova conta" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Tipo" id="bf-k"><select id="bf-k" className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, categoryId: '' })}><option value="PAYABLE">A pagar</option><option value="RECEIVABLE">A receber</option></select></Field>
        <Field label="Descrição" id="bf-d"><input id="bf-d" required className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label={f.kind === 'PAYABLE' ? 'Fornecedor' : 'Devedor'} id="bf-c"><input id="bf-c" className="input" value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)" id="bf-a"><input id="bf-a" required inputMode="decimal" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Vencimento" id="bf-due"><input id="bf-due" type="date" required className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        </div>
        <Field label="Categoria" id="bf-cat">
          <select id="bf-cat" className="input" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            <option value="">Sem categoria</option>
            {cats.filter((c) => c.kind === (f.kind === 'PAYABLE' ? 'EXPENSE' : 'INCOME')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Alert>{error}</Alert>
        <button className="btn-gold w-full">Salvar conta</button>
      </form>
    </Modal>
  );
}

function PayBill({ bill, onClose, onSaved }) {
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState((Number(bill.amount) - Number(bill.paidAmount)).toFixed(2));
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/finance/bills/${bill.id}/pay`, { accountId, amount });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal open title={`${bill.kind === 'PAYABLE' ? 'Pagar' : 'Receber'}: ${bill.description}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Conta" id="pb-acc"><AccountSelect id="pb-acc" unitId={bill.unitId} value={accountId} onChange={setAccountId} /></Field>
        <Field label="Valor (R$)" id="pb-a" hint="Pode ser parcial."><input id="pb-a" required inputMode="decimal" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Alert>{error}</Alert>
        <button className="btn-gold w-full">Confirmar</button>
      </form>
    </Modal>
  );
}

function TransfersTab() {
  const { can } = useAuth();
  const [p, setP] = useState({ from: monthStart(), to: isoDay() });
  const { data, reload } = useApi(`/finance/transfers${qs(p)}`);
  const allAccounts = (useApi('/finance/accounts').data ?? []).filter((a) => a.status === 'ACTIVE');
  const [f, setF] = useState({ fromAccountId: '', toAccountId: '', amount: '', description: '' });
  const [msg, setMsg] = useState(null);
  const from = allAccounts.find((a) => a.id === f.fromAccountId);
  const targets = allAccounts.filter((a) => a.id !== f.fromAccountId && (can('finance:consolidated:read') || a.unitId === from?.unitId));
  const save = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post('/finance/transfers', { ...f, description: f.description || null });
      setMsg({ ok: true, t: 'Transferência registrada.' });
      setF({ fromAccountId: '', toAccountId: '', amount: '', description: '' });
      reload();
    } catch (err) {
      setMsg({ ok: false, t: err.message });
    }
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <form onSubmit={save} className="card h-fit space-y-4 p-5">
        <h3 className="font-heading text-xl">Nova transferência</h3>
        <p className="text-xs text-muted">Dinheiro que muda de conta não é receita nem despesa e não entra no consolidado.{!can('finance:consolidated:read') && ' Transferências entre unidades são feitas pelo proprietário.'}</p>
        <Field label="De" id="tr-f"><select id="tr-f" required className="input" value={f.fromAccountId} onChange={(e) => setF({ ...f, fromAccountId: e.target.value, toAccountId: '' })}><option value="">Escolha…</option>{allAccounts.map((a) => <option key={a.id} value={a.id}>{a.unit.name} · {a.name} ({brl(a.balance)})</option>)}</select></Field>
        <Field label="Para" id="tr-t"><select id="tr-t" required className="input" value={f.toAccountId} onChange={(e) => setF({ ...f, toAccountId: e.target.value })}><option value="">Escolha…</option>{targets.map((a) => <option key={a.id} value={a.id}>{a.unit.name} · {a.name}</option>)}</select></Field>
        <Field label="Valor (R$)" id="tr-a"><input id="tr-a" required inputMode="decimal" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Descrição" id="tr-d"><input id="tr-d" className="input" placeholder="Ex.: depósito do caixa no banco" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {msg && <Alert tone={msg.ok ? 'ok' : 'error'}>{msg.t}</Alert>}
        <button className="btn-gold w-full">Transferir</button>
      </form>
      <div className="space-y-3">
        <PeriodPicker from={p.from} to={p.to} onChange={setP} />
        <DataTable
          rows={data}
          empty="Nenhuma transferência no período"
          columns={[
            { key: 'occurredAt', label: 'Data', render: (t) => dateTimeBR(t.occurredAt) },
            { key: 'from', label: 'De', render: (t) => `${t.fromUnit.name} · ${t.fromAccount.name}` },
            { key: 'to', label: 'Para', render: (t) => `${t.toUnit.name} · ${t.toAccount.name}` },
            { key: 'amount', label: 'Valor', align: 'right', render: (t) => brl(t.amount) },
            {
              key: 'act', label: '', render: (t) => (t.transactions.length ? <Pill tone="red">Estornada</Pill> : (
                <ConfirmButton danger needReason question="Estornar a transferência?" confirmText="Estornar" onConfirm={async (reason) => { await api.post(`/finance/transfers/${t.id}/reverse`, { reason }); reload(); }}>Estornar</ConfirmButton>
              )),
            },
          ]}
        />
      </div>
    </div>
  );
}

function ClosingsTab() {
  const { unitId } = useUnit();
  const { data, reload } = useApi(`/finance/closings${qs({ unitId })}`);
  const accounts = (useApi(`/finance/accounts${qs({ unitId })}`).data ?? []).filter((a) => a.status === 'ACTIVE');
  const [f, setF] = useState({ accountId: '', countedBalance: '', notes: '', createAdjustment: false });
  const [msg, setMsg] = useState(null);
  const acc = accounts.find((a) => a.id === (f.accountId || accounts[0]?.id));
  const diff = f.countedBalance !== '' && acc ? Number(f.countedBalance.replace(',', '.')) - Number(acc.balance) : null;
  const save = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post('/finance/closings', { ...f, accountId: acc.id, notes: f.notes || null });
      setMsg({ ok: true, t: 'Caixa fechado.' });
      setF({ ...f, countedBalance: '', notes: '' });
      reload();
    } catch (err) {
      setMsg({ ok: false, t: err.message });
    }
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <form onSubmit={save} className="card h-fit space-y-4 p-5">
        <h3 className="font-heading text-xl">Fechar caixa</h3>
        <Field label="Conta" id="cl-acc"><select id="cl-acc" className="input" value={acc?.id ?? ''} onChange={(e) => setF({ ...f, accountId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        {acc && <p className="text-sm">Saldo calculado pelo sistema: <strong className="num">{brl(acc.balance)}</strong></p>}
        <Field label="Valor contado (R$)" id="cl-c"><input id="cl-c" required inputMode="decimal" className="input" value={f.countedBalance} onChange={(e) => setF({ ...f, countedBalance: e.target.value })} /></Field>
        {diff !== null && !Number.isNaN(diff) && (
          <p className={`text-sm ${Math.abs(diff) < 0.005 ? 'text-emerald-300' : 'text-amber-300'}`}>{Math.abs(diff) < 0.005 ? 'Caixa confere.' : `Diferença de ${brl(diff)}`}</p>
        )}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-[rgb(var(--bp-accent))]" checked={f.createAdjustment} onChange={(e) => setF({ ...f, createAdjustment: e.target.checked })} /> Lançar ajuste para igualar o saldo ao valor contado (conciliação)</label>
        <Field label="Observações" id="cl-n"><textarea id="cl-n" rows={2} className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {msg && <Alert tone={msg.ok ? 'ok' : 'error'}>{msg.t}</Alert>}
        <button className="btn-gold w-full" disabled={!acc}>Fechar caixa</button>
      </form>
      <DataTable
        rows={data}
        empty="Nenhum fechamento"
        columns={[
          { key: 'closedAt', label: 'Fechado em', render: (c) => dateTimeBR(c.closedAt) },
          { key: 'account', label: 'Conta', render: (c) => c.account.name },
          { key: 'period', label: 'Período', hideSm: true, render: (c) => `${dateTimeBR(c.periodStart)} → ${dateTimeBR(c.periodEnd)}` },
          { key: 'expected', label: 'Calculado', align: 'right', render: (c) => brl(c.expectedBalance) },
          { key: 'counted', label: 'Contado', align: 'right', render: (c) => brl(c.countedBalance) },
          { key: 'difference', label: 'Diferença', align: 'right', render: (c) => <span className={Number(c.difference) === 0 ? '' : 'text-amber-300'}>{brl(c.difference)}</span> },
        ]}
      />
    </div>
  );
}

function AccountsTab() {
  const { unitId } = useUnit();
  const { data, reload } = useApi(`/finance/accounts${qs({ unitId })}`);
  const [f, setF] = useState({ name: '', type: 'BANK', openingBalance: '0' });
  const [error, setError] = useState('');
  const add = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/finance/accounts', { ...f, unitId });
      setF({ name: '', type: 'BANK', openingBalance: '0' });
      reload();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <form onSubmit={add} className="card h-fit space-y-4 p-5">
        <h3 className="font-heading text-xl">Nova conta</h3>
        <Field label="Nome" id="ac-n"><input id="ac-n" required className="input" placeholder="Ex.: Banco do Brasil, Maquininha" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Tipo" id="ac-t"><select id="ac-t" className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(LABELS.account).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Saldo inicial (R$)" id="ac-o"><input id="ac-o" inputMode="decimal" className="input" value={f.openingBalance} onChange={(e) => setF({ ...f, openingBalance: e.target.value })} /></Field>
        <Alert>{error}</Alert>
        <button className="btn-gold w-full">Criar conta</button>
      </form>
      <DataTable
        rows={data}
        columns={[
          { key: 'name', label: 'Conta' },
          { key: 'type', label: 'Tipo', render: (a) => LABELS.account[a.type] },
          { key: 'opening', label: 'Saldo inicial', align: 'right', render: (a) => brl(a.openingBalance) },
          { key: 'balance', label: 'Saldo atual', align: 'right', render: (a) => brl(a.balance) },
          {
            key: 'status', label: 'Situação', render: (a) => (
              <button className="text-xs underline-offset-2 hover:underline" onClick={async () => { await api.patch(`/finance/accounts/${a.id}`, { status: a.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }); reload(); }}>
                <Pill tone={STATUS_TONE[a.status]}>{a.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}</Pill>
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}

function ConsolidatedTab() {
  const [p, setP] = useState({ from: monthStart(), to: isoDay() });
  const { data, loading } = useApi(`/finance/consolidated${qs(p)}`);
  return (
    <div className="space-y-5">
      <div className="card p-4"><PeriodPicker from={p.from} to={p.to} onChange={setP} /></div>
      {loading && !data && <Spinner />}
      {data && (
        <>
          <SummaryGrid s={data.total} available={data.available} />
          <DataTable
            rows={data.perUnit.map((u) => ({ ...u, id: u.unit.id }))}
            columns={[
              { key: 'unit', label: 'Unidade', render: (u) => u.unit.name },
              { key: 'revenue', label: 'Faturamento', align: 'right', render: (u) => brl(u.revenue) },
              { key: 'receipts', label: 'Recebimentos', align: 'right', render: (u) => brl(u.receipts) },
              { key: 'otherIncome', label: 'Outras receitas', align: 'right', render: (u) => brl(u.otherIncome) },
              { key: 'expenses', label: 'Despesas', align: 'right', render: (u) => brl(u.expenses) },
              { key: 'operatingResult', label: 'Resultado', align: 'right', render: (u) => brl(u.operatingResult) },
            ]}
            footer={
              <tr>
                <td className="px-4 py-3">Total</td>
                {['revenue', 'receipts', 'otherIncome', 'expenses', 'operatingResult'].map((k) => <td key={k} className="num px-4 py-3 text-right">{brl(data.total[k])}</td>)}
              </tr>
            }
          />
          <p className="text-sm text-muted">
            Transferências internas no período: {data.internalTransfers.count} ({brl(data.internalTransfers.amount)}). Elas aparecem nos saldos das contas, mas não como receita nem despesa.
          </p>
        </>
      )}
    </div>
  );
}
