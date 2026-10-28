import { useState } from 'react';
import { Plus, Pencil, Trash2, ArrowLeftRight, History } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useUnit } from '../../auth/UnitContext.jsx';
import { api } from '../../lib/api.js';
import { useApi, qs } from '../../lib/useApi.js';
import { brl, dateTimeBR } from '../../lib/format.js';
import { PageHeader, Spinner, Alert, Modal, Field, Pill, STATUS_TONE, ImageInput, Empty, DataTable } from '../../components/ui.jsx';

const toLocalInput = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

// ───────────── Serviços ─────────────

export function ServicesPage() {
  const { can } = useAuth();
  const isOwner = can('company:manage');
  const { units } = useUnit();
  const { data, loading, error, reload } = useApi('/services');
  const cats = useApi('/service-categories');
  const [editing, setEditing] = useState(null);
  const [catOpen, setCatOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Serviços e preços"
        subtitle="Preço, duração e promoção por unidade. Mudanças de preço não alteram agendamentos e vendas já feitos."
        actions={isOwner && (
          <>
            <button className="btn-ghost" onClick={() => setCatOpen(true)}>Categorias</button>
            <button className="btn-gold" onClick={() => setEditing({})}><Plus className="h-4 w-4" /> Novo serviço</button>
          </>
        )}
      />
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && !data.length && <Empty title="Nenhum serviço" action={isOwner && <button className="btn-gold" onClick={() => setEditing({})}>Cadastrar serviço</button>}>Ex.: corte tradicional, degradê, infantil, barba, sobrancelha e combos.</Empty>}
      {data?.length > 0 && (
        <DataTable
          rows={data}
          onRowClick={setEditing}
          columns={[
            { key: 'name', label: 'Serviço', render: (s) => <span className="flex items-center gap-3">{s.imageUrl && <img src={s.imageUrl} alt="" className="h-9 w-9 rounded object-cover" />}<span>{s.name}{s.isCombo && <span className="ml-2 text-xs text-gold">combo</span>}</span></span> },
            { key: 'category', label: 'Categoria', render: (s) => s.category?.name ?? '—' },
            ...units.map((u) => ({
              key: u.id, label: u.name, align: 'right',
              render: (s) => {
                const o = s.offers.find((x) => x.unitId === u.id && x.isActive);
                return o ? `${brl(o.price)} · ${o.durationMin}min` : '—';
              },
            })),
            { key: 'status', label: 'Situação', render: (s) => <Pill tone={STATUS_TONE[s.status]}>{s.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</Pill> },
          ]}
        />
      )}
      {editing && <ServiceForm service={editing} categories={cats.data ?? []} isOwner={isOwner} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {catOpen && <CategoriesModal cats={cats} onClose={() => { setCatOpen(false); reload(); }} />}
    </>
  );
}

function CategoriesModal({ cats, onClose }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post('/service-categories', { name, sortOrder: (cats.data?.length ?? 0) + 1 });
      setName('');
      cats.reload();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal open title="Categorias de serviço" onClose={onClose}>
      <ul className="mb-4 divide-y divide-white/5 text-sm">
        {cats.data?.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2">
            {c.name}
            <button className="text-muted hover:text-red-300" aria-label={`Excluir ${c.name}`} onClick={async () => { await api.delete(`/service-categories/${c.id}`); cats.reload(); }}><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <input className="input" placeholder="Nova categoria (ex.: Cortes)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome da categoria" />
        <button className="btn-gold" disabled={name.trim().length < 2}>Adicionar</button>
      </form>
      <Alert>{error}</Alert>
    </Modal>
  );
}

function ServiceForm({ service, categories, isOwner, onClose, onSaved }) {
  const { units } = useUnit();
  const barbers = useApi('/barbers').data ?? [];
  const [f, setF] = useState({
    name: service.name ?? '', description: service.description ?? '', imageUrl: service.imageUrl ?? null, categoryId: service.categoryId ?? '',
    isCombo: service.isCombo ?? false, commissionPct: service.commissionPct ?? '', status: service.status ?? 'ACTIVE',
    barberIds: service.barberIds ?? [],
    offers: units.map((u) => {
      const o = service.offers?.find((x) => x.unitId === u.id);
      return {
        unitId: u.id, enabled: !!o?.isActive, price: o?.price ?? '', durationMin: o?.durationMin ?? 30,
        promoPrice: o?.promoPrice ?? '', promoStart: toLocalInput(o?.promoStart), promoEnd: toLocalInput(o?.promoEnd),
      };
    }),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setOffer = (unitId, k, v) => setF({ ...f, offers: f.offers.map((o) => (o.unitId === unitId ? { ...o, [k]: v } : o)) });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const offers = f.offers.filter((o) => o.enabled).map((o) => ({
      unitId: o.unitId, price: o.price, durationMin: Number(o.durationMin), isActive: true,
      promoPrice: o.promoPrice || null,
      promoStart: o.promoPrice && o.promoStart ? new Date(o.promoStart).toISOString() : null,
      promoEnd: o.promoPrice && o.promoEnd ? new Date(o.promoEnd).toISOString() : null,
    }));
    const base = {
      name: f.name, description: f.description, imageUrl: f.imageUrl, categoryId: f.categoryId || null, isCombo: f.isCombo,
      commissionPct: f.commissionPct === '' ? null : f.commissionPct, status: f.status, barberIds: f.barberIds,
    };
    try {
      if (!service.id) await api.post('/services', { ...base, offers });
      else await api.patch(`/services/${service.id}`, isOwner ? { ...base, offers } : { offers });
      onSaved();
    } catch (err) {
      setError(err.fields?.length ? err.fields.map((x) => x.message).join(' · ') : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open wide title={service.id ? service.name : 'Novo serviço'} onClose={onClose}>
      <form onSubmit={save} className="space-y-5">
        <fieldset disabled={!isOwner} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <ImageInput id="s-img" label="Imagem" value={f.imageUrl} onChange={(imageUrl) => setF({ ...f, imageUrl })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" id="s-name"><input id="s-name" required className="input" value={f.name} onChange={set('name')} /></Field>
              <Field label="Categoria" id="s-cat">
                <select id="s-cat" className="input" value={f.categoryId} onChange={set('categoryId')}>
                  <option value="">Sem categoria</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Comissão padrão (%)" id="s-pct" hint="Usada quando o barbeiro não tem regra própria."><input id="s-pct" inputMode="decimal" className="input" value={f.commissionPct} onChange={set('commissionPct')} /></Field>
              <Field label="Situação" id="s-status">
                <select id="s-status" className="input" value={f.status} onChange={set('status')}><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option></select>
              </Field>
            </div>
          </div>
          <Field label="Descrição" id="s-desc"><textarea id="s-desc" rows={2} className="input" value={f.description} onChange={set('description')} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isCombo} onChange={(e) => setF({ ...f, isCombo: e.target.checked })} className="accent-[rgb(var(--bp-accent))]" /> É um combo (ex.: corte + barba)</label>
        </fieldset>

        <fieldset>
          <legend className="label">Preço e duração por unidade</legend>
          <ul className="space-y-3">
            {f.offers.map((o) => {
              const unit = units.find((u) => u.id === o.unitId);
              return (
                <li key={o.unitId} className="rounded-lg border border-white/10 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={o.enabled} onChange={(e) => setOffer(o.unitId, 'enabled', e.target.checked)} className="accent-[rgb(var(--bp-accent))]" /> Disponível em {unit?.name}</label>
                  {o.enabled && (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                      <Field label="Preço (R$)" id={`p-${o.unitId}`}><input id={`p-${o.unitId}`} required inputMode="decimal" className="input" value={o.price} onChange={(e) => setOffer(o.unitId, 'price', e.target.value)} /></Field>
                      <Field label="Duração (min)" id={`d-${o.unitId}`}><input id={`d-${o.unitId}`} type="number" min={5} step={5} className="input" value={o.durationMin} onChange={(e) => setOffer(o.unitId, 'durationMin', e.target.value)} /></Field>
                      <Field label="Promoção (R$)" id={`pp-${o.unitId}`}><input id={`pp-${o.unitId}`} inputMode="decimal" className="input" value={o.promoPrice} onChange={(e) => setOffer(o.unitId, 'promoPrice', e.target.value)} /></Field>
                      <Field label="Início" id={`ps-${o.unitId}`}><input id={`ps-${o.unitId}`} type="datetime-local" className="input" value={o.promoStart} onChange={(e) => setOffer(o.unitId, 'promoStart', e.target.value)} /></Field>
                      <Field label="Fim" id={`pe-${o.unitId}`}><input id={`pe-${o.unitId}`} type="datetime-local" className="input" value={o.promoEnd} onChange={(e) => setOffer(o.unitId, 'promoEnd', e.target.value)} /></Field>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>

        {isOwner && (
          <fieldset>
            <legend className="label">Profissionais habilitados</legend>
            <div className="flex flex-wrap gap-2">
              {barbers.map((b) => {
                const on = f.barberIds.includes(b.id);
                return <button type="button" key={b.id} aria-pressed={on} onClick={() => setF({ ...f, barberIds: on ? f.barberIds.filter((x) => x !== b.id) : [...f.barberIds, b.id] })} className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-gold bg-gold/15 text-gold' : 'border-white/10'}`}>{b.name}</button>;
              })}
            </div>
          </fieldset>
        )}
        <Alert>{error}</Alert>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-gold" disabled={busy}>Salvar serviço</button>
        </div>
      </form>
    </Modal>
  );
}

// ───────────── Produtos e estoque ─────────────

export function ProductsPage() {
  const { can } = useAuth();
  const isOwner = can('company:manage');
  const { unitId, units } = useUnit();
  const { data, loading, error, reload } = useApi('/products');
  const [editing, setEditing] = useState(null);
  const [moving, setMoving] = useState(null);
  const [history, setHistory] = useState(null);
  const stockOf = (p) => p.stocks.find((s) => s.unitId === unitId);
  return (
    <>
      <PageHeader title="Produtos e estoque" subtitle="Estoque da unidade selecionada. Vendas baixam o estoque automaticamente ao fechar." actions={isOwner && <button className="btn-gold" onClick={() => setEditing({})}><Plus className="h-4 w-4" /> Novo produto</button>} />
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && (
        <DataTable
          rows={data}
          empty="Nenhum produto cadastrado"
          columns={[
            { key: 'name', label: 'Produto', render: (p) => <span>{p.name}{p.sku && <span className="ml-2 text-xs text-muted">{p.sku}</span>}</span> },
            { key: 'price', label: 'Preço', align: 'right', render: (p) => brl(p.price) },
            ...(isOwner ? [{ key: 'cost', label: 'Custo', align: 'right', render: (p) => brl(p.cost) }] : []),
            {
              key: 'stock', label: 'Estoque', align: 'right',
              render: (p) => {
                const s = stockOf(p);
                return <span className={s && s.quantity <= s.minQuantity ? 'text-amber-300' : ''}>{s?.quantity ?? 0}{s?.minQuantity ? ` (mín. ${s.minQuantity})` : ''}</span>;
              },
            },
            { key: 'status', label: 'Situação', render: (p) => <Pill tone={STATUS_TONE[p.status]}>{p.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</Pill> },
            {
              key: 'act', label: 'Ações', render: (p) => (
                <span className="flex flex-wrap justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button className="btn-ghost btn-sm" onClick={() => setMoving({ product: p, mode: 'move' })}>Movimentar</button>
                  {units.length > 1 && <button className="btn-ghost btn-sm" aria-label="Transferir entre unidades" onClick={() => setMoving({ product: p, mode: 'transfer' })}><ArrowLeftRight className="h-3.5 w-3.5" /></button>}
                  <button className="btn-ghost btn-sm" aria-label="Histórico" onClick={() => setHistory(p)}><History className="h-3.5 w-3.5" /></button>
                  {isOwner && <button className="btn-ghost btn-sm" aria-label="Editar" onClick={() => setEditing(p)}><Pencil className="h-3.5 w-3.5" /></button>}
                </span>
              ),
            },
          ]}
        />
      )}
      {editing && <ProductForm product={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {moving && <StockModal {...moving} onClose={() => setMoving(null)} onSaved={() => { setMoving(null); reload(); }} />}
      {history && <MovementsModal product={history} onClose={() => setHistory(null)} />}
    </>
  );
}

function ProductForm({ product, onClose, onSaved }) {
  const [f, setF] = useState({
    name: product.name ?? '', description: product.description ?? '', imageUrl: product.imageUrl ?? null, sku: product.sku ?? '',
    price: product.price ?? '', cost: product.cost ?? '', commissionPct: product.commissionPct ?? '', status: product.status ?? 'ACTIVE',
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setError('');
    const body = { ...f, sku: f.sku || null, commissionPct: f.commissionPct === '' ? null : f.commissionPct };
    try {
      if (product.id) await api.patch(`/products/${product.id}`, body);
      else await api.post('/products', body);
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal open title={product.id ? product.name : 'Novo produto'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <ImageInput id="p-img" label="Foto" value={f.imageUrl} onChange={(imageUrl) => setF({ ...f, imageUrl })} />
        <Field label="Nome" id="p-name"><input id="p-name" required className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Descrição" id="p-desc"><textarea id="p-desc" rows={2} className="input" value={f.description} onChange={set('description')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço de venda (R$)" id="p-price"><input id="p-price" required inputMode="decimal" className="input" value={f.price} onChange={set('price')} /></Field>
          <Field label="Custo (R$)" id="p-cost"><input id="p-cost" required inputMode="decimal" className="input" value={f.cost} onChange={set('cost')} /></Field>
          <Field label="Comissão padrão (%)" id="p-pct"><input id="p-pct" inputMode="decimal" className="input" value={f.commissionPct} onChange={set('commissionPct')} /></Field>
          <Field label="Código (SKU)" id="p-sku"><input id="p-sku" className="input" value={f.sku} onChange={set('sku')} /></Field>
        </div>
        <Field label="Situação" id="p-status"><select id="p-status" className="input" value={f.status} onChange={set('status')}><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option></select></Field>
        <Alert>{error}</Alert>
        <button className="btn-gold w-full">Salvar produto</button>
      </form>
    </Modal>
  );
}

function StockModal({ product, mode, onClose, onSaved }) {
  const { unitId, units } = useUnit();
  const [f, setF] = useState({ type: 'IN', quantity: '', reason: '', unitCost: '', minQuantity: product.stocks.find((s) => s.unitId === unitId)?.minQuantity ?? 0, toUnitId: units.find((u) => u.id !== unitId)?.id ?? '' });
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'transfer') await api.post(`/products/${product.id}/stock-transfer`, { fromUnitId: unitId, toUnitId: f.toUnitId, quantity: Number(f.quantity), reason: f.reason || null });
      else await api.post(`/products/${product.id}/stock`, { unitId, type: f.type, quantity: Number(f.quantity || 0), reason: f.reason || null, unitCost: f.unitCost || undefined, minQuantity: Number(f.minQuantity) });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };
  const current = product.stocks.find((s) => s.unitId === unitId)?.quantity ?? 0;
  return (
    <Modal open title={`${mode === 'transfer' ? 'Transferir' : 'Movimentar'} — ${product.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-muted">Estoque atual nesta unidade: <strong className="text-ink">{current}</strong></p>
        {mode === 'move' ? (
          <>
            <Field label="Tipo" id="sm-type">
              <select id="sm-type" className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                <option value="IN">Entrada (compra, devolução)</option>
                <option value="OUT">Saída (perda, uso interno)</option>
                <option value="ADJUSTMENT">Inventário (informar quantidade contada)</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={f.type === 'ADJUSTMENT' ? 'Quantidade contada' : 'Quantidade'} id="sm-q"><input id="sm-q" type="number" min={0} className="input" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
              <Field label="Estoque mínimo" id="sm-min"><input id="sm-min" type="number" min={0} className="input" value={f.minQuantity} onChange={(e) => setF({ ...f, minQuantity: e.target.value })} /></Field>
            </div>
            {f.type === 'IN' && <Field label="Custo unitário (R$)" id="sm-cost"><input id="sm-cost" inputMode="decimal" className="input" value={f.unitCost} onChange={(e) => setF({ ...f, unitCost: e.target.value })} /></Field>}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Para a unidade" id="sm-to">
              <select id="sm-to" className="input" value={f.toUnitId} onChange={(e) => setF({ ...f, toUnitId: e.target.value })}>
                {units.filter((u) => u.id !== unitId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Quantidade" id="sm-tq"><input id="sm-tq" type="number" min={1} max={current} className="input" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
          </div>
        )}
        <Field label="Motivo" id="sm-r"><input id="sm-r" className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <Alert>{error}</Alert>
        <button className="btn-gold w-full">Salvar</button>
      </form>
    </Modal>
  );
}

const MOVE_LABELS = { IN: 'Entrada', OUT: 'Saída', ADJUSTMENT: 'Ajuste', SALE: 'Venda', SALE_REVERSAL: 'Venda cancelada', TRANSFER_IN: 'Transferência recebida', TRANSFER_OUT: 'Transferência enviada' };
function MovementsModal({ product, onClose }) {
  const { unitId } = useUnit();
  const { data, loading } = useApi(`/products/${product.id}/movements${qs({ unitId })}`);
  return (
    <Modal open wide title={`Histórico — ${product.name}`} onClose={onClose}>
      {loading && <Spinner />}
      {data && (
        <ul className="divide-y divide-white/5 text-sm">
          {data.map((m) => (
            <li key={m.id} className="flex flex-wrap gap-3 py-2">
              <span className="num w-36 text-muted">{dateTimeBR(m.createdAt)}</span>
              <span className="flex-1">{MOVE_LABELS[m.type]}{m.reason ? ` · ${m.reason}` : ''}</span>
              <span className={`num ${['OUT', 'SALE', 'TRANSFER_OUT'].includes(m.type) ? 'text-red-300' : 'text-emerald-300'}`}>{['OUT', 'SALE', 'TRANSFER_OUT'].includes(m.type) ? '−' : '+'}{m.quantity}</span>
            </li>
          ))}
          {!data.length && <li className="py-2 text-muted">Sem movimentações.</li>}
        </ul>
      )}
    </Modal>
  );
}

