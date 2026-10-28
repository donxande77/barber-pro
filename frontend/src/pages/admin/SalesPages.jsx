import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Loader2, Copy, ArrowLeft, BadgeCheck } from 'lucide-react';
import { useUnit } from '../../auth/UnitContext.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { api } from '../../lib/api.js';
import { useApi, qs } from '../../lib/useApi.js';
import { brl, dateTimeBR, isoDay, LABELS } from '../../lib/format.js';
import { PageHeader, Spinner, Alert, Pill, STATUS_TONE, DataTable, Field, ConfirmButton, PeriodPicker, Modal } from '../../components/ui.jsx';

export function SalesListPage() {
  const { unitId } = useUnit();
  const navigate = useNavigate();
  const [f, setF] = useState({ from: isoDay(), to: isoDay(), status: '' });
  const { data, loading, error } = useApi(unitId ? `/sales${qs({ ...f, unitId })}` : null);
  const [busy, setBusy] = useState(false);
  const newSale = async () => {
    setBusy(true);
    try {
      const s = await api.post('/sales', { unitId });
      navigate(`/painel/atendimentos/${s.id}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title="Atendimentos e vendas"
        subtitle="Atendimentos abertos pela agenda e vendas avulsas de produtos. Fechar a venda não significa receber: os pagamentos são registrados na própria venda."
        actions={<button className="btn-gold" onClick={newSale} disabled={busy}><Plus className="h-4 w-4" /> Venda avulsa</button>}
      />
      <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <PeriodPicker from={f.from} to={f.to} onChange={(p) => setF({ ...f, ...p })} />
        <div className="w-40">
          <label className="label" htmlFor="s-status">Situação</label>
          <select id="s-status" className="input py-2" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">Todas</option>
            {Object.entries(LABELS.sale).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && (
        <DataTable
          rows={data}
          onRowClick={(s) => navigate(`/painel/atendimentos/${s.id}`)}
          empty="Nenhuma venda no período"
          columns={[
            { key: 'client', label: 'Cliente', render: (s) => s.client?.name ?? 'Sem cliente' },
            { key: 'createdAt', label: 'Aberta em', render: (s) => dateTimeBR(s.createdAt) },
            { key: 'items', label: 'Itens', render: (s) => s.items.map((i) => i.description).join(', ') || '—' },
            { key: 'status', label: 'Situação', render: (s) => <Pill tone={STATUS_TONE[s.status]}>{LABELS.sale[s.status]}</Pill> },
            { key: 'pay', label: 'Pagamento', render: (s) => (s.paymentStatus ? <Pill tone={STATUS_TONE[s.paymentStatus]}>{LABELS.payment[s.paymentStatus]}</Pill> : '—') },
            { key: 'total', label: 'Total', align: 'right', render: (s) => brl(s.total) },
          ]}
        />
      )}
    </>
  );
}

export function SaleDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data: sale, error, loading, reload, setData } = useApi(`/sales/${id}`);
  const [adding, setAdding] = useState(null);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading && !sale) return <Spinner />;
  if (error) return <Alert>{error.message}</Alert>;
  if (!sale) return null;
  const open = sale.status === 'OPEN';
  const run = async (fn) => {
    setBusy(true);
    setActionError('');
    try {
      setData(await fn());
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const reviewUrl = sale.appointment?.reviewToken ? `${window.location.origin}/avaliar/${sale.appointment.reviewToken}` : null;

  return (
    <>
      <Link to="/painel/atendimentos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Atendimentos</Link>
      <PageHeader
        title={sale.client?.name ?? 'Venda avulsa'}
        subtitle={`${sale.unit.name} · aberta em ${dateTimeBR(sale.createdAt)}${sale.closedAt ? ` · fechada em ${dateTimeBR(sale.closedAt)}` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <Pill tone={STATUS_TONE[sale.status]}>{LABELS.sale[sale.status]}</Pill>
            {sale.paymentStatus && <Pill tone={STATUS_TONE[sale.paymentStatus]}>{LABELS.payment[sale.paymentStatus]}</Pill>}
          </div>
        }
      />
      <Alert>{actionError}</Alert>
      <div className="mt-4 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-xl">Itens</h2>
            {open && (
              <div className="flex gap-2">
                <button className="btn-ghost btn-sm" onClick={() => setAdding('SERVICE')}><Plus className="h-3.5 w-3.5" /> Serviço</button>
                <button className="btn-ghost btn-sm" onClick={() => setAdding('PRODUCT')}><Plus className="h-3.5 w-3.5" /> Produto</button>
              </div>
            )}
          </div>
          {!sale.items.length && <p className="text-sm text-muted">Nenhum item. Adicione serviços ou produtos.</p>}
          <ul className="divide-y divide-white/5">
            {sale.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{i.quantity > 1 ? `${i.quantity}× ` : ''}{i.description}</p>
                  <p className="text-xs text-muted">
                    {i.kind === 'SERVICE' ? 'Serviço' : 'Produto'}{i.barber ? ` · ${i.barber.name}` : ''}
                    {Number(i.discount) > 0 ? ` · desconto ${brl(i.discount)}` : ''}
                    {i.commissionAmount != null && ` · comissão ${brl(i.commissionAmount)} (${Number(i.commissionPct).toLocaleString('pt-BR')}%)`}
                  </p>
                  {i.subscriptionId && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <Pill tone="gold"><BadgeCheck className="mr-1 h-3 w-3" />{i.subscription?.planSnapshot?.name ?? 'Plano mensal'}</Pill>
                      <span className="text-muted">{brl(i.coveredAmount)} coberto pelo plano</span>
                    </p>
                  )}
                </div>
                {open && i.kind === 'SERVICE' && i.subscriptionId && (
                  <button className="text-xs text-muted hover:text-gold" disabled={busy} onClick={() => run(() => api.patch(`/sales/${id}/items/${i.id}`, { covered: false }))}>Cobrar normalmente</button>
                )}
                {open && i.kind === 'SERVICE' && !i.subscriptionId && sale.client && (
                  <button className="text-xs text-muted hover:text-gold" disabled={busy} onClick={() => run(() => api.patch(`/sales/${id}/items/${i.id}`, { covered: true }))}>Usar plano</button>
                )}
                {open && !i.subscriptionId && <DiscountEditor item={i} onSave={(discount) => run(() => api.patch(`/sales/${id}/items/${i.id}`, { discount }))} />}
                <span className="num w-24 text-right">{brl(i.total)}</span>
                {open && (
                  <button className="text-muted hover:text-red-300" aria-label={`Remover ${i.description}`} onClick={() => run(() => api.delete(`/sales/${id}/items/${i.id}`))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-white/10 pt-3 font-heading text-2xl">
            <span>Total</span><span className="num">{brl(sale.total)}</span>
          </div>
          {open && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn-gold" disabled={busy || !sale.items.length} onClick={() => run(() => api.post(`/sales/${id}/close`))}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Fechar venda
              </button>
              <p className="w-full text-xs text-muted">Ao fechar: o estoque é baixado e as comissões são calculadas com as regras vigentes agora.</p>
            </div>
          )}
        </section>

        <section className="space-y-6">
          {sale.status === 'CLOSED' && (
            <div className="card p-5">
              <h2 className="font-heading text-xl">Pagamentos</h2>
              <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-muted">Recebido</dt><dd className="num text-right">{brl(sale.paidAmount)}</dd>
                <dt className="text-muted">A receber</dt><dd className="num text-right font-semibold">{brl(sale.balanceDue)}</dd>
              </dl>
              <ul className="mt-4 divide-y divide-white/5 text-sm">
                {sale.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className={`flex-1 ${p.status === 'REVERSED' ? 'text-muted line-through' : ''}`}>{LABELS.method[p.method]} · {p.account.name} · {dateTimeBR(p.paidAt)}</span>
                    <span className="num">{brl(p.amount)}</span>
                    {p.status === 'CONFIRMED' && can('finance:unit:manage') && (
                      <ConfirmButton needReason danger question="Estornar este pagamento? Nada é apagado: será lançada uma saída de estorno." confirmText="Estornar" onConfirm={async (reason) => setData(await api.post(`/payments/${p.id}/reverse`, { reason }))}>
                        Estornar
                      </ConfirmButton>
                    )}
                    {p.status === 'REVERSED' && <Pill tone="red">Estornado</Pill>}
                  </li>
                ))}
              </ul>
              {Number(sale.balanceDue) > 0 && <PaymentForm sale={sale} onPaid={setData} />}
            </div>
          )}
          {reviewUrl && (
            <div className="card p-5 text-sm">
              <h2 className="font-heading text-xl">Pedir avaliação</h2>
              <p className="mt-2 text-muted">Envie este link ao cliente. A avaliação aparece no site depois de aprovada.</p>
              <div className="mt-3 flex gap-2">
                <input readOnly className="input" value={reviewUrl} aria-label="Link de avaliação" onFocus={(e) => e.target.select()} />
                <button className="btn-ghost px-3" aria-label="Copiar link" onClick={() => navigator.clipboard?.writeText(reviewUrl).catch(() => {})}><Copy className="h-4 w-4" /></button>
              </div>
            </div>
          )}
          {sale.status !== 'CANCELLED' && (
            <div className="card p-5">
              <h2 className="font-heading text-lg">Cancelar venda</h2>
              <p className="mb-3 mt-1 text-xs text-muted">
                {sale.status === 'CLOSED' ? 'Estorne os pagamentos antes. O estoque volta e as comissões não pagas são canceladas.' : 'A venda aberta é descartada e o agendamento volta para confirmado.'}
              </p>
              <ConfirmButton needReason danger className="btn-danger btn-sm" question="Cancelar esta venda?" confirmText="Cancelar venda" onConfirm={async (reason) => setData(await api.post(`/sales/${id}/cancel`, { reason }))}>
                Cancelar venda
              </ConfirmButton>
            </div>
          )}
          {sale.cancelReason && <Alert tone="info">Cancelada: {sale.cancelReason}</Alert>}
        </section>
      </div>
      {adding && <AddItem kind={adding} sale={sale} onClose={() => setAdding(null)} onAdded={(s) => { setAdding(null); setData(s); }} />}
      <button className="sr-only" onClick={reload}>Atualizar</button>
    </>
  );
}

function DiscountEditor({ item, onSave }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(item.discount);
  if (!editing) return <button className="text-xs text-muted hover:text-gold" onClick={() => setEditing(true)}>Desconto</button>;
  return (
    <span className="flex items-center gap-1">
      <input className="input w-24 py-1" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} aria-label="Desconto em reais" />
      <button className="btn-gold btn-sm" onClick={() => { onSave(v || '0'); setEditing(false); }}>OK</button>
    </span>
  );
}

function PaymentForm({ sale, onPaid }) {
  const accounts = (useApi(`/finance/accounts/options${qs({ unitId: sale.unit.id })}`).data ?? []).filter((a) => a.status === 'ACTIVE');
  const [method, setMethod] = useState('PIX');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState(sale.balanceDue);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const acc = accountId || accounts[0]?.id;
  const pay = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const s = await api.post(`/sales/${sale.id}/payments`, { accountId: acc, method, amount, idempotencyKey: `${sale.id}-${crypto.randomUUID()}` });
      onPaid(s);
      setAmount(s.balanceDue);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={pay} className="mt-4 space-y-3 border-t border-white/5 pt-4">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Forma de pagamento">
        {Object.entries(LABELS.method).map(([k, v]) => (
          <button type="button" role="radio" aria-checked={method === k} key={k} onClick={() => setMethod(k)} className={`rounded-full border px-3 py-1 text-xs ${method === k ? 'border-gold bg-gold text-gold-contrast' : 'border-white/10'}`}>{v}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Conta" id="pay-acc">
          <select id="pay-acc" className="input" value={acc ?? ''} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Valor (R$)" id="pay-amount"><input id="pay-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
      <Alert>{error}</Alert>
      <button className="btn-gold w-full" disabled={busy || !acc}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Registrar recebimento</button>
    </form>
  );
}

function AddItem({ kind, sale, onClose, onAdded }) {
  const unitId = sale.unit.id;
  const services = (useApi(kind === 'SERVICE' ? `/services${qs({ unitId })}` : null).data ?? []).filter((s) => s.status === 'ACTIVE' && s.offers.some((o) => o.unitId === unitId && o.isActive));
  const products = (useApi(kind === 'PRODUCT' ? `/products${qs({ unitId })}` : null).data ?? []).filter((p) => p.status === 'ACTIVE');
  const barbers = (useApi(`/barbers${qs({ unitId })}`).data ?? []).filter((b) => b.status !== 'INACTIVE');
  const [itemId, setItemId] = useState('');
  const [barberId, setBarberId] = useState(sale.items.find((i) => i.barber)?.barber.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState('');
  const save = async () => {
    try {
      onAdded(await api.post(`/sales/${sale.id}/items`, {
        kind, ...(kind === 'SERVICE' ? { serviceId: itemId } : { productId: itemId }), barberId: barberId || undefined, quantity: Number(quantity),
      }));
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <Modal open title={kind === 'SERVICE' ? 'Adicionar serviço' : 'Adicionar produto'} onClose={onClose}>
      <div className="space-y-4">
        <Field label={kind === 'SERVICE' ? 'Serviço' : 'Produto'} id="ai-item">
          <select id="ai-item" className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Escolha…</option>
            {kind === 'SERVICE'
              ? services.map((s) => <option key={s.id} value={s.id}>{s.name} — {brl(s.offers.find((o) => o.unitId === unitId).price)}</option>)
              : products.map((p) => <option key={p.id} value={p.id}>{p.name} — {brl(p.price)} (estoque {p.stocks.find((s) => s.unitId === unitId)?.quantity ?? 0})</option>)}
          </select>
        </Field>
        <Field label={kind === 'SERVICE' ? 'Profissional' : 'Vendido por (para comissão)'} id="ai-barber">
          <select id="ai-barber" className="input" value={barberId} onChange={(e) => setBarberId(e.target.value)}>
            {kind === 'PRODUCT' && <option value="">Sem profissional</option>}
            {kind === 'SERVICE' && <option value="">Escolha…</option>}
            {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        {kind === 'PRODUCT' && <Field label="Quantidade" id="ai-qty"><input id="ai-qty" type="number" min={1} className="input" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>}
        <Alert>{error}</Alert>
        <button className="btn-gold w-full" disabled={!itemId || (kind === 'SERVICE' && !barberId)} onClick={save}>Adicionar</button>
      </div>
    </Modal>
  );
}
