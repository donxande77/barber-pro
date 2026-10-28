import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useUnit } from '../../auth/UnitContext.jsx';
import { api } from '../../lib/api.js';
import { minToHHMM, hhmmToMin, WEEKDAYS, phoneBR } from '../../lib/format.js';
import { PageHeader, Alert, Modal, Field, Pill, STATUS_TONE, Empty } from '../../components/ui.jsx';

const blank = {
  name: '', slug: '', timezone: 'America/Sao_Paulo', street: '', number: '', district: '', city: '', state: '', zipCode: '', phone: '', whatsapp: '',
  email: '', instagramUrl: '', cancellationPolicy: '', minCancelHours: 2, slotStepMinutes: 15, openingCash: '0', status: 'ACTIVE',
  hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, openMin: 540, closeMin: 1140 })),
};

export default function UnitsPage() {
  const { can } = useAuth();
  const { units, reload } = useUnit();
  const [editing, setEditing] = useState(null);
  return (
    <>
      <PageHeader title="Unidades" subtitle="Endereço, contatos, horários de funcionamento e regras de agendamento de cada unidade." actions={can('units:create') && <button className="btn-gold" onClick={() => setEditing(blank)}><Plus className="h-4 w-4" /> Nova unidade</button>} />
      {!units.length && <Empty title="Nenhuma unidade" action={can('units:create') && <button className="btn-gold" onClick={() => setEditing(blank)}>Cadastrar a primeira unidade</button>}>Cadastre a unidade para abrir a agenda, o caixa e o site.</Empty>}
      <ul className="grid gap-4 md:grid-cols-2">
        {units.map((u) => (
          <li key={u.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-heading text-2xl">{u.name}</p>
                <p className="text-sm text-muted">{[u.street, u.number, u.district, u.city].filter(Boolean).join(', ') || 'Endereço não informado'}</p>
              </div>
              <Pill tone={STATUS_TONE[u.status]}>{u.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}</Pill>
            </div>
            <p className="mt-2 text-sm">{u.phone ? phoneBR(u.phone) : ''}{u.whatsapp ? ` · WhatsApp ${phoneBR(u.whatsapp)}` : ''}</p>
            <p className="mt-2 text-xs text-muted">
              {WEEKDAYS.map((d, i) => {
                const h = u.hours.find((x) => x.weekday === i);
                return h ? `${d.slice(0, 3)} ${minToHHMM(h.openMin)}–${minToHHMM(h.closeMin)}` : null;
              }).filter(Boolean).join(' · ') || 'Sem horário definido'}
            </p>
            <button className="btn-ghost btn-sm mt-4" onClick={() => setEditing(u)}><Pencil className="h-3.5 w-3.5" /> Editar</button>
          </li>
        ))}
      </ul>
      {editing && <UnitForm unit={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function UnitForm({ unit, onClose, onSaved }) {
  const { can } = useAuth();
  const [f, setF] = useState(() => ({ ...blank, ...Object.fromEntries(Object.entries(unit).map(([k, v]) => [k, v ?? ''])), hours: unit.hours ?? blank.hours }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isNew = !unit.id;

  const toggleDay = (weekday) => {
    const has = f.hours.some((h) => h.weekday === weekday);
    setF({ ...f, hours: has ? f.hours.filter((h) => h.weekday !== weekday) : [...f.hours, { weekday, openMin: 540, closeMin: 1140 }].sort((a, b) => a.weekday - b.weekday) });
  };
  const setHour = (weekday, key, val) => setF({ ...f, hours: f.hours.map((h) => (h.weekday === weekday ? { ...h, [key]: hhmmToMin(val) } : h)) });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      name: f.name, slug: f.slug || f.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      timezone: f.timezone, street: f.street, number: f.number, district: f.district, city: f.city, state: f.state, zipCode: f.zipCode,
      phone: f.phone, whatsapp: f.whatsapp, email: f.email, instagramUrl: f.instagramUrl, cancellationPolicy: f.cancellationPolicy,
      minCancelHours: Number(f.minCancelHours), slotStepMinutes: Number(f.slotStepMinutes),
      hours: f.hours.map(({ weekday, openMin, closeMin }) => ({ weekday, openMin, closeMin })),
    };
    try {
      if (isNew) await api.post('/units', { ...body, openingCash: f.openingCash || '0' });
      else await api.patch(`/units/${unit.id}`, { ...body, ...(can('units:create') ? { status: f.status } : {}) });
      onSaved();
    } catch (err) {
      setError(err.fields?.length ? err.fields.map((x) => `${x.path}: ${x.message}`).join(' · ') : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open wide title={isNew ? 'Nova unidade' : `Editar ${unit.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" id="u-name"><input id="u-name" className="input" required value={f.name} onChange={set('name')} /></Field>
          <Field label="Endereço na web (identificador)" id="u-slug" hint="Ex.: centro, shopping-norte"><input id="u-slug" className="input" value={f.slug} onChange={set('slug')} /></Field>
          <Field label="Rua" id="u-street"><input id="u-street" className="input" value={f.street} onChange={set('street')} /></Field>
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <Field label="Número" id="u-num"><input id="u-num" className="input" value={f.number} onChange={set('number')} /></Field>
            <Field label="Bairro" id="u-dist"><input id="u-dist" className="input" value={f.district} onChange={set('district')} /></Field>
          </div>
          <div className="grid grid-cols-[2fr_1fr_1.4fr] gap-2">
            <Field label="Cidade" id="u-city"><input id="u-city" className="input" value={f.city} onChange={set('city')} /></Field>
            <Field label="UF" id="u-uf"><input id="u-uf" maxLength={2} className="input uppercase" value={f.state} onChange={set('state')} /></Field>
            <Field label="CEP" id="u-cep"><input id="u-cep" className="input" value={f.zipCode} onChange={set('zipCode')} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Telefone" id="u-phone"><input id="u-phone" className="input" value={f.phone} onChange={set('phone')} /></Field>
            <Field label="WhatsApp" id="u-wa"><input id="u-wa" className="input" value={f.whatsapp} onChange={set('whatsapp')} /></Field>
          </div>
          <Field label="E-mail" id="u-email"><input id="u-email" type="email" className="input" value={f.email} onChange={set('email')} /></Field>
          <Field label="Instagram (link)" id="u-ig"><input id="u-ig" className="input" placeholder="https://instagram.com/…" value={f.instagramUrl} onChange={set('instagramUrl')} /></Field>
        </div>

        <fieldset>
          <legend className="label">Horário de funcionamento</legend>
          <ul className="space-y-2">
            {WEEKDAYS.map((d, i) => {
              const h = f.hours.find((x) => x.weekday === i);
              return (
                <li key={d} className="flex flex-wrap items-center gap-3 text-sm">
                  <label className="flex w-28 items-center gap-2"><input type="checkbox" checked={!!h} onChange={() => toggleDay(i)} className="accent-[rgb(var(--bp-accent))]" /> {d}</label>
                  {h ? (
                    <>
                      <input type="time" className="input w-28 py-1.5" value={minToHHMM(h.openMin)} onChange={(e) => setHour(i, 'openMin', e.target.value)} aria-label={`${d} abre`} />
                      <span className="text-muted">às</span>
                      <input type="time" className="input w-28 py-1.5" value={minToHHMM(h.closeMin)} onChange={(e) => setHour(i, 'closeMin', e.target.value)} aria-label={`${d} fecha`} />
                    </>
                  ) : <span className="text-muted">Fechado</span>}
                </li>
              );
            })}
          </ul>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Intervalo da agenda" id="u-step">
            <select id="u-step" className="input" value={f.slotStepMinutes} onChange={set('slotStepMinutes')}>
              {[5, 10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>{m} minutos</option>)}
            </select>
          </Field>
          <Field label="Cancelamento online até (horas antes)" id="u-cancel"><input id="u-cancel" type="number" min={0} max={168} className="input" value={f.minCancelHours} onChange={set('minCancelHours')} /></Field>
          {isNew ? (
            <Field label="Saldo inicial do caixa (R$)" id="u-cash"><input id="u-cash" inputMode="decimal" className="input" value={f.openingCash} onChange={set('openingCash')} /></Field>
          ) : can('units:create') && (
            <Field label="Situação" id="u-status">
              <select id="u-status" className="input" value={f.status} onChange={set('status')}><option value="ACTIVE">Ativa</option><option value="INACTIVE">Inativa (sai do site)</option></select>
            </Field>
          )}
        </div>
        <Field label="Política de cancelamento da unidade" id="u-policy" hint="Aparece no site. Se vazio, usa a política geral do site.">
          <textarea id="u-policy" rows={3} className="input" value={f.cancellationPolicy} onChange={set('cancellationPolicy')} />
        </Field>
        <Alert>{error}</Alert>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-gold" disabled={busy}>Salvar unidade</button>
        </div>
      </form>
    </Modal>
  );
}
