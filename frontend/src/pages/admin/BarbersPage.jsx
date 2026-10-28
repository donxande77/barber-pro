import { useState } from 'react';
import { Plus, Pencil, CalendarClock, KeyRound } from 'lucide-react';
import { useUnit } from '../../auth/UnitContext.jsx';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { dateTimeBR, hhmmToMin, minToHHMM, WEEKDAYS, LABELS } from '../../lib/format.js';
import { PageHeader, Spinner, Alert, Modal, Field, Pill, STATUS_TONE, ImageInput, Tabs, Empty, ConfirmButton } from '../../components/ui.jsx';
import { Monogram } from '../../public/HomePage.jsx';

const STATUS = { ACTIVE: 'Ativo', INACTIVE: 'Inativo', ON_LEAVE: 'Afastado' };

export default function BarbersPage() {
  const { data, loading, error, reload } = useApi('/barbers');
  const [editing, setEditing] = useState(null);
  return (
    <>
      <PageHeader title="Barbeiros" subtitle="Cadastro, unidades, modelo de remuneração, serviços que atende, escala e acesso ao painel." actions={<button className="btn-gold" onClick={() => setEditing({})}><Plus className="h-4 w-4" /> Novo barbeiro</button>} />
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && !data.length && <Empty title="Nenhum barbeiro cadastrado" action={<button className="btn-gold" onClick={() => setEditing({})}>Cadastrar barbeiro</button>} />}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data?.map((b) => (
          <li key={b.id} className="card overflow-hidden">
            <button className="flex w-full items-center gap-4 p-4 text-left hover:bg-white/[0.02]" onClick={() => setEditing(b)}>
              <span className="h-16 w-16 shrink-0 overflow-hidden rounded-full">
                {b.photoUrl ? <img src={b.photoUrl} alt="" className="h-full w-full object-cover" /> : <Monogram name={b.name} className="h-full w-full text-2xl" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2"><span className="truncate font-heading text-xl">{b.name}</span><Pill tone={STATUS_TONE[b.status]}>{STATUS[b.status]}</Pill></span>
                <span className="block truncate text-sm text-muted">{b.units.filter((u) => u.isActive).map((u) => `${u.unit.name} (${LABELS.model[u.compensationModel]})`).join(', ') || 'Sem unidade'}</span>
                <span className="block text-xs text-muted">{b.login ? `Acesso: ${b.login.email}` : 'Sem acesso ao painel'}</span>
              </span>
              <Pencil className="h-4 w-4 text-muted" />
            </button>
          </li>
        ))}
      </ul>
      {editing && <BarberEditor barber={editing} onClose={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function BarberEditor({ barber, onClose }) {
  const [current, setCurrent] = useState(barber.id ? barber : null);
  const [tab, setTab] = useState('dados');
  return (
    <Modal open wide title={current ? current.name : 'Novo barbeiro'} onClose={onClose}>
      {current && (
        <Tabs value={tab} onChange={setTab} tabs={[['dados', 'Dados'], ['escala', 'Escala e folgas'], ['acesso', 'Acesso ao painel']]} />
      )}
      {(!current || tab === 'dados') && <BarberForm barber={current ?? {}} onSaved={(b) => { setCurrent(b); if (!current) setTab('escala'); }} />}
      {current && tab === 'escala' && <ScheduleEditor barberId={current.id} />}
      {current && tab === 'acesso' && <LoginEditor barber={current} onSaved={setCurrent} />}
    </Modal>
  );
}

function BarberForm({ barber, onSaved }) {
  const { units } = useUnit();
  const services = useApi('/services').data ?? [];
  const [f, setF] = useState({
    name: barber.name ?? '', photoUrl: barber.photoUrl ?? null, phone: barber.phone ?? '', email: barber.email ?? '', bio: barber.bio ?? '',
    specialties: (barber.specialties ?? []).join(', '), status: barber.status ?? 'ACTIVE', serviceIds: barber.serviceIds ?? [],
    units: (barber.units ?? []).filter((u) => u.isActive).map((u) => ({ unitId: u.unitId, compensationModel: u.compensationModel })),
  });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const linkOf = (unitId) => f.units.find((u) => u.unitId === unitId);
  const toggleUnit = (unitId) => setF({ ...f, units: linkOf(unitId) ? f.units.filter((u) => u.unitId !== unitId) : [...f.units, { unitId, compensationModel: 'COMMISSION' }] });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setOk('');
    const body = {
      name: f.name, photoUrl: f.photoUrl, phone: f.phone, email: f.email, bio: f.bio, status: f.status, serviceIds: f.serviceIds,
      specialties: f.specialties.split(',').map((s) => s.trim()).filter(Boolean),
      units: f.units.map((u) => ({ ...u, isActive: true })),
    };
    try {
      const b = barber.id ? await api.patch(`/barbers/${barber.id}`, body) : await api.post('/barbers', body);
      setOk('Dados salvos.');
      onSaved(b);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <ImageInput id="b-photo" label="Foto" value={f.photoUrl} onChange={(photoUrl) => setF({ ...f, photoUrl })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" id="b-name"><input id="b-name" required className="input" value={f.name} onChange={set('name')} /></Field>
          <Field label="Situação" id="b-status">
            <select id="b-status" className="input" value={f.status} onChange={set('status')}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          <Field label="Telefone" id="b-phone"><input id="b-phone" className="input" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="E-mail de contato" id="b-email"><input id="b-email" type="email" className="input" value={f.email} onChange={set('email')} /></Field>
        </div>
      </div>
      <Field label="Especialidades (separe por vírgula)" id="b-spec"><input id="b-spec" className="input" placeholder="Degradê, Barba, Navalhado" value={f.specialties} onChange={set('specialties')} /></Field>
      <Field label="Apresentação (aparece no site)" id="b-bio"><textarea id="b-bio" rows={3} className="input" value={f.bio} onChange={set('bio')} /></Field>

      <fieldset>
        <legend className="label">Unidades e modelo de remuneração</legend>
        <ul className="space-y-2">
          {units.map((u) => {
            const link = linkOf(u.id);
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 p-3 text-sm">
                <label className="flex flex-1 items-center gap-2"><input type="checkbox" checked={!!link} onChange={() => toggleUnit(u.id)} className="accent-[rgb(var(--bp-accent))]" /> {u.name}</label>
                {link && (
                  <select className="input w-auto py-1.5" value={link.compensationModel} aria-label={`Modelo em ${u.name}`}
                    onChange={(e) => setF({ ...f, units: f.units.map((x) => (x.unitId === u.id ? { ...x, compensationModel: e.target.value } : x)) })}>
                    {Object.entries(LABELS.model).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">O modelo define quais regras são aceitas (ex.: aluguel de cadeira + comissão só com o modelo combinado). Os valores ficam em Remuneração.</p>
      </fieldset>

      <fieldset>
        <legend className="label">Serviços que realiza</legend>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => {
            const on = f.serviceIds.includes(s.id);
            return (
              <button type="button" key={s.id} aria-pressed={on} onClick={() => setF({ ...f, serviceIds: on ? f.serviceIds.filter((x) => x !== s.id) : [...f.serviceIds, s.id] })}
                className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-gold bg-gold/15 text-gold' : 'border-white/10'}`}>{s.name}</button>
            );
          })}
          {!services.length && <p className="text-sm text-muted">Cadastre serviços primeiro.</p>}
        </div>
      </fieldset>
      <Alert>{error}</Alert>
      <Alert tone="ok">{ok}</Alert>
      <button className="btn-gold" disabled={busy}>Salvar dados</button>
    </form>
  );
}

function ScheduleEditor({ barberId }) {
  const { data: barber, reload } = useApi(`/barbers/${barberId}`);
  const { units } = useUnit();
  const [unitId, setUnitId] = useState(null);
  if (!barber) return <Spinner />;
  const links = barber.units.filter((l) => l.isActive && units.some((u) => u.id === l.unitId));
  const link = links.find((l) => l.unitId === unitId) ?? links[0];
  if (!link) return <p className="text-sm text-muted">Vincule o barbeiro a uma unidade para definir a escala.</p>;
  return (
    <div className="space-y-6">
      {links.length > 1 && (
        <select className="input w-56" value={link.unitId} onChange={(e) => setUnitId(e.target.value)} aria-label="Unidade da escala">
          {links.map((l) => <option key={l.unitId} value={l.unitId}>{l.unit.name}</option>)}
        </select>
      )}
      <WeekEditor key={link.id} barberId={barberId} link={link} onSaved={reload} />
      <TimeOffs barber={barber} onChanged={reload} />
    </div>
  );
}

function WeekEditor({ barberId, link, onSaved }) {
  const [days, setDays] = useState(() => link.schedules.map(({ weekday, startMin, endMin, breakStartMin, breakEndMin }) => ({ weekday, startMin, endMin, breakStartMin, breakEndMin })));
  const [msg, setMsg] = useState(null);
  const day = (i) => days.find((d) => d.weekday === i);
  const toggle = (i) => setDays(day(i) ? days.filter((d) => d.weekday !== i) : [...days, { weekday: i, startMin: 540, endMin: 1140, breakStartMin: 720, breakEndMin: 780 }]);
  const upd = (i, k, v) => setDays(days.map((d) => (d.weekday === i ? { ...d, [k]: v === '' ? null : hhmmToMin(v) } : d)));
  const save = async () => {
    setMsg(null);
    try {
      await api.put(`/barbers/${barberId}/schedules/${link.unitId}`, { days });
      setMsg({ ok: true, t: 'Escala salva.' });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, t: e.message });
    }
  };
  return (
    <div>
      <h3 className="mb-3 font-heading text-lg">Escala semanal — {link.unit.name}</h3>
      <ul className="space-y-2">
        {WEEKDAYS.map((d, i) => {
          const x = day(i);
          return (
            <li key={d} className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex w-28 items-center gap-2"><input type="checkbox" checked={!!x} onChange={() => toggle(i)} className="accent-[rgb(var(--bp-accent))]" /> {d}</label>
              {x ? (
                <>
                  <input type="time" className="input w-[6.5rem] py-1.5" value={minToHHMM(x.startMin)} onChange={(e) => upd(i, 'startMin', e.target.value)} aria-label={`${d} início`} />
                  <span className="text-muted">–</span>
                  <input type="time" className="input w-[6.5rem] py-1.5" value={minToHHMM(x.endMin)} onChange={(e) => upd(i, 'endMin', e.target.value)} aria-label={`${d} fim`} />
                  <span className="ml-2 text-xs text-muted">intervalo</span>
                  <input type="time" className="input w-[6.5rem] py-1.5" value={x.breakStartMin != null ? minToHHMM(x.breakStartMin) : ''} onChange={(e) => upd(i, 'breakStartMin', e.target.value)} aria-label={`${d} início do intervalo`} />
                  <span className="text-muted">–</span>
                  <input type="time" className="input w-[6.5rem] py-1.5" value={x.breakEndMin != null ? minToHHMM(x.breakEndMin) : ''} onChange={(e) => upd(i, 'breakEndMin', e.target.value)} aria-label={`${d} fim do intervalo`} />
                </>
              ) : <span className="text-muted">Folga</span>}
            </li>
          );
        })}
      </ul>
      {msg && <div className="mt-3"><Alert tone={msg.ok ? 'ok' : 'error'}>{msg.t}</Alert></div>}
      <button className="btn-gold mt-4" onClick={save}>Salvar escala</button>
    </div>
  );
}

function TimeOffs({ barber, onChanged }) {
  const [f, setF] = useState({ start: '', end: '', reason: '' });
  const [error, setError] = useState('');
  const add = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/barbers/${barber.id}/time-offs`, {
        startsAt: new Date(f.start).toISOString(), endsAt: new Date(f.end).toISOString(), reason: f.reason || null,
      });
      setF({ start: '', end: '', reason: '' });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 font-heading text-lg"><CalendarClock className="h-5 w-5 text-gold" /> Folgas e ausências</h3>
      <ul className="mb-4 divide-y divide-white/5 text-sm">
        {barber.timeOffs.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="flex-1">{dateTimeBR(t.startsAt)} → {dateTimeBR(t.endsAt)}{t.reason ? ` · ${t.reason}` : ''}</span>
            <ConfirmButton danger question="Remover esta folga?" confirmText="Remover" onConfirm={async () => { await api.delete(`/barbers/${barber.id}/time-offs/${t.id}`); onChanged(); }}>Remover</ConfirmButton>
          </li>
        ))}
        {!barber.timeOffs.length && <li className="py-2 text-muted">Nenhuma folga registrada.</li>}
      </ul>
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Início" id="to-s"><input id="to-s" type="datetime-local" required className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="Fim" id="to-e"><input id="to-e" type="datetime-local" required className="input" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        <Field label="Motivo" id="to-r"><input id="to-r" className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <button className="btn-ghost">Adicionar</button>
      </form>
      <Alert>{error}</Alert>
    </div>
  );
}

function LoginEditor({ barber, onSaved }) {
  const [email, setEmail] = useState(barber.login?.email ?? barber.email ?? '');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      onSaved(await api.put(`/barbers/${barber.id}/login`, { email, password }));
      setPassword('');
      setMsg({ ok: true, t: 'Acesso salvo. Informe a senha ao barbeiro e peça para trocá-la no primeiro acesso.' });
    } catch (err) {
      setMsg({ ok: false, t: err.message });
    }
  };
  return (
    <form onSubmit={save} className="space-y-4">
      <p className="text-sm text-muted">Com acesso, o barbeiro vê somente a própria agenda, seus atendimentos e seu financeiro.</p>
      {barber.login && <p className="text-sm">Situação atual: <Pill tone={STATUS_TONE[barber.login.status]}>{barber.login.status === 'ACTIVE' ? 'Ativo' : 'Desativado'}</Pill></p>}
      <Field label="E-mail de login" id="bl-email"><input id="bl-email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label={barber.login ? 'Nova senha' : 'Senha inicial'} id="bl-pass" hint="Mínimo de 10 caracteres, com letras e números."><input id="bl-pass" type="password" required autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {msg && <Alert tone={msg.ok ? 'ok' : 'error'}>{msg.t}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-gold"><KeyRound className="h-4 w-4" /> {barber.login ? 'Atualizar acesso' : 'Criar acesso'}</button>
        {barber.login?.status === 'ACTIVE' && (
          <ConfirmButton danger className="btn-danger" question="Desativar o acesso? As sessões abertas serão encerradas." confirmText="Desativar" onConfirm={async () => { await api.delete(`/barbers/${barber.id}/login`); onSaved({ ...barber, login: { ...barber.login, status: 'INACTIVE' } }); }}>
            Desativar acesso
          </ConfirmButton>
        )}
      </div>
    </form>
  );
}
