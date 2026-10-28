import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Loader2, Phone, MessageCircle } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useUnit } from '../../auth/UnitContext.jsx';
import { api } from '../../lib/api.js';
import { useApi, qs } from '../../lib/useApi.js';
import { addDays, brl, isoDay, longDate, timeBR, LABELS, phoneBR, waLink } from '../../lib/format.js';
import { PageHeader, Spinner, Alert, Pill, STATUS_TONE, Modal, Field, ConfirmButton, Empty } from '../../components/ui.jsx';

export default function AgendaPage() {
  const { can } = useAuth();
  const { unitId, unit } = useUnit();
  const tz = unit?.timezone ?? 'America/Sao_Paulo';
  const [date, setDate] = useState(() => isoDay(0, tz));
  const [barberFilter, setBarberFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);
  const manage = can('appointments:manage');
  const { data, error, loading, reload } = useApi(unitId ? `/appointments${qs({ unitId, from: date })}` : null);
  const barbers = useApi(manage && unitId ? `/barbers${qs({ unitId })}` : null).data ?? [];

  const visible = (data ?? []).filter((a) => !barberFilter || a.barberId === barberFilter);
  const columns = useMemo(() => {
    const ids = [...new Set(visible.map((a) => a.barberId))];
    return ids.map((id) => ({ barber: visible.find((a) => a.barberId === id).barber, items: visible.filter((a) => a.barberId === id) }));
  }, [visible]);

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle={unit?.name}
        actions={manage && <button className="btn-gold" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Novo agendamento</button>}
      />
      <div className="card mb-5 flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1">
          <button className="btn-ghost px-2.5" aria-label="Dia anterior" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="h-4 w-4" /></button>
          <input type="date" className="input w-40 py-2" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Data" />
          <button className="btn-ghost px-2.5" aria-label="Próximo dia" onClick={() => setDate(addDays(date, 1))}><ChevronRight className="h-4 w-4" /></button>
          <button className="btn-ghost btn-sm" onClick={() => setDate(isoDay(0, tz))}>Hoje</button>
        </div>
        <p className="text-sm capitalize text-muted">{longDate(`${date}T12:00:00Z`, 'UTC')}</p>
        {manage && barbers.length > 1 && (
          <select className="input ml-auto w-44 py-2" value={barberFilter} onChange={(e) => setBarberFilter(e.target.value)} aria-label="Filtrar barbeiro">
            <option value="">Todos os barbeiros</option>
            {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && !visible.length && <Empty title="Nenhum agendamento neste dia" action={manage && <button className="btn-gold" onClick={() => setCreating(true)}>Agendar</button>} />}

      {columns.length > 0 && (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))` }}>
          {columns.map((col) => (
            <section key={col.barber.id} className="min-w-0">
              <h2 className="mb-2 font-heading text-lg">{col.barber.name}</h2>
              <ul className="space-y-2">
                {col.items.map((a) => (
                  <li key={a.id}>
                    <button
                      onClick={() => setSelected(a)}
                      className={`w-full rounded-xl border p-3 text-left transition hover:border-gold/60 ${['CANCELLED', 'NO_SHOW'].includes(a.status) ? 'border-white/5 opacity-50' : 'border-white/10 bg-surface'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="num font-heading text-lg">{timeBR(a.startsAt, tz)}–{timeBR(a.endsAt, tz)}</span>
                        <Pill tone={STATUS_TONE[a.status]}>{LABELS.appointment[a.status]}</Pill>
                      </div>
                      <p className="mt-1 truncate font-medium">{a.client.name}</p>
                      <p className="truncate text-xs text-muted">{a.items.map((i) => i.serviceName).join(' + ')} · {brl(a.totalPrice)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {creating && <NewAppointment onClose={() => setCreating(false)} onSaved={(d) => { setCreating(false); setDate(d); reload(); }} defaultDate={date} />}
      {selected && <AppointmentDetail appt={selected} tz={tz} manage={manage} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); reload(); }} />}
    </>
  );
}

function AppointmentDetail({ appt, tz, manage, onClose, onChanged }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const act = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const status = (s, reason) => api.patch(`/appointments/${appt.id}/status`, { status: s, reason }).then(onChanged);
  const startSale = () => act(async () => {
    const sale = appt.sale && appt.sale.status !== 'CANCELLED' ? appt.sale : await api.post('/sales', { unitId: appt.unitId, appointmentId: appt.id });
    navigate(`/painel/atendimentos/${sale.id}`);
  });
  const open = ['SCHEDULED', 'CONFIRMED'].includes(appt.status);
  const wa = waLink(appt.client.phone, `Olá, ${appt.client.name.split(' ')[0]}! Confirmando seu horário em ${longDate(appt.startsAt, tz)} às ${timeBR(appt.startsAt, tz)}.`);

  return (
    <Modal open title={`${timeBR(appt.startsAt, tz)} · ${appt.client.name}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={STATUS_TONE[appt.status]}>{LABELS.appointment[appt.status]}</Pill>
          <span className="text-muted">{appt.source === 'PUBLIC' ? 'Agendado pelo site' : 'Agendado pela equipe'}</span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted">Data</dt><dd className="capitalize">{longDate(appt.startsAt, tz)}, {timeBR(appt.startsAt, tz)}–{timeBR(appt.endsAt, tz)}</dd>
          <dt className="text-muted">Barbeiro</dt><dd>{appt.barber.name}</dd>
          <dt className="text-muted">Serviços</dt><dd>{appt.items.map((i) => `${i.serviceName} (${brl(i.price)})`).join(', ')}</dd>
          <dt className="text-muted">Total</dt><dd className="num">{brl(appt.totalPrice)}</dd>
          {appt.notes && <><dt className="text-muted">Obs.</dt><dd>{appt.notes}</dd></>}
          {appt.cancelReason && <><dt className="text-muted">Motivo</dt><dd>{appt.cancelReason}</dd></>}
        </dl>
        {manage && appt.client.phone && (
          <div className="flex flex-wrap gap-2">
            <a className="btn-ghost btn-sm" href={`tel:${appt.client.phone}`}><Phone className="h-3.5 w-3.5" /> {phoneBR(appt.client.phone)}</a>
            {wa && <a className="btn-ghost btn-sm" href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>}
          </div>
        )}
        <Alert>{error}</Alert>
        {manage && (
          <div className="flex flex-wrap gap-2 border-t border-white/5 pt-4">
            {['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'].includes(appt.status) && can('sales:manage') && (
              <button className="btn-gold btn-sm" disabled={busy} onClick={startSale}>
                {busy && <Loader2 className="h-3 w-3 animate-spin" />} {appt.status === 'CHECKED_IN' ? 'Abrir atendimento' : 'Iniciar atendimento'}
              </button>
            )}
            {appt.status === 'COMPLETED' && appt.sale && (
              <button className="btn-ghost btn-sm" onClick={() => navigate(`/painel/atendimentos/${appt.sale.id}`)}>Ver venda</button>
            )}
            {appt.status === 'SCHEDULED' && <button className="btn-ghost btn-sm" disabled={busy} onClick={() => act(() => status('CONFIRMED'))}>Confirmar presença</button>}
            {open && <button className="btn-ghost btn-sm" onClick={() => setRescheduling(true)}>Remarcar</button>}
            {open && <ConfirmButton question="Marcar como não compareceu?" confirmText="Não compareceu" onConfirm={() => status('NO_SHOW')}>Não compareceu</ConfirmButton>}
            {['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'].includes(appt.status) && (
              <ConfirmButton danger needReason question="Cancelar este agendamento?" confirmText="Cancelar agendamento" className="btn-danger btn-sm" onConfirm={(r) => status('CANCELLED', r)}>Cancelar</ConfirmButton>
            )}
          </div>
        )}
        {rescheduling && <Reschedule appt={appt} tz={tz} onDone={onChanged} />}
      </div>
    </Modal>
  );
}

function SlotPicker({ unitId, serviceIds, barberId, date, value, onChange }) {
  const { data, loading, error } = useApi(unitId && serviceIds.length && date ? `/availability${qs({ unitId, date, serviceIds: serviceIds.join(','), barberId })}` : null);
  if (!serviceIds.length) return <p className="text-sm text-muted">Escolha os serviços para ver os horários.</p>;
  if (loading) return <Spinner label="Buscando horários…" />;
  if (error) return <Alert>{error.message}</Alert>;
  if (!data?.slots.length) return <p className="text-sm text-muted">Sem horários livres neste dia.</p>;
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
      {data.slots.map((s) => (
        <button
          type="button"
          key={s.startsAt}
          onClick={() => onChange(s)}
          className={`num rounded-lg border py-2 text-sm ${value?.startsAt === s.startsAt ? 'border-gold bg-gold font-semibold text-gold-contrast' : 'border-white/10 hover:border-gold/60'}`}
        >
          {s.time}
        </button>
      ))}
    </div>
  );
}

function Reschedule({ appt, tz, onDone }) {
  const [date, setDate] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(appt.startsAt)));
  const [slot, setSlot] = useState(null);
  const [error, setError] = useState('');
  const save = async () => {
    try {
      await api.patch(`/appointments/${appt.id}/reschedule`, { startsAt: slot.startsAt });
      onDone();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <div className="space-y-3 rounded-xl border border-white/10 p-4">
      <p className="font-medium">Novo horário com {appt.barber.name}</p>
      <input type="date" className="input" value={date} onChange={(e) => { setDate(e.target.value); setSlot(null); }} aria-label="Nova data" />
      <SlotPicker unitId={appt.unitId} serviceIds={appt.items.map((i) => i.serviceId)} barberId={appt.barberId} date={date} value={slot} onChange={setSlot} />
      <Alert>{error}</Alert>
      <button className="btn-gold btn-sm" disabled={!slot} onClick={save}>Salvar novo horário</button>
    </div>
  );
}

function NewAppointment({ onClose, onSaved, defaultDate }) {
  const { unitId } = useUnit();
  const services = (useApi(`/services${qs({ unitId })}`).data ?? []).filter((s) => s.status === 'ACTIVE' && s.offers.some((o) => o.unitId === unitId && o.isActive));
  const barbers = (useApi(`/barbers${qs({ unitId })}`).data ?? []).filter((b) => b.status === 'ACTIVE');
  const [search, setSearch] = useState('');
  const [client, setClient] = useState(null);
  const [newClient, setNewClient] = useState(null);
  const [serviceIds, setServiceIds] = useState([]);
  const [barberId, setBarberId] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [slot, setSlot] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const found = useApi(search.length >= 2 && !client ? `/clients${qs({ search, pageSize: 6 })}` : null).data?.items ?? [];

  useEffect(() => setSlot(null), [serviceIds, barberId, date]);
  const eligible = barbers.filter((b) => serviceIds.every((id) => b.serviceIds.includes(id)));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/appointments', {
        unitId, serviceIds, barberId: barberId || null, startsAt: slot.startsAt, notes: notes || null,
        ...(client ? { clientId: client.id } : { client: newClient }),
      });
      onSaved(date);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const clientOk = client || (newClient?.name?.length >= 2 && newClient?.phone?.replace(/\D/g, '').length >= 10);

  return (
    <Modal open wide title="Novo agendamento" onClose={onClose}>
      <div className="space-y-5">
        <Field label="Cliente" id="na-client">
          {client ? (
            <div className="flex items-center justify-between rounded-lg border border-gold/40 px-3 py-2 text-sm">
              <span>{client.name} · {phoneBR(client.phone)}</span>
              <button className="text-xs text-muted hover:text-ink" onClick={() => setClient(null)}>Trocar</button>
            </div>
          ) : newClient ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="input" placeholder="Nome" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} aria-label="Nome do cliente" />
              <input className="input" placeholder="Telefone com DDD" inputMode="tel" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} aria-label="Telefone" />
              <button className="text-left text-xs text-muted hover:text-ink" onClick={() => setNewClient(null)}>Buscar cliente cadastrado</button>
            </div>
          ) : (
            <div>
              <input id="na-client" className="input" placeholder="Buscar por nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
              {found.length > 0 && (
                <ul className="mt-1 divide-y divide-white/5 rounded-lg border border-white/10">
                  {found.map((c) => (
                    <li key={c.id}><button className="w-full px-3 py-2 text-left text-sm hover:bg-white/5" onClick={() => setClient(c)}>{c.name} <span className="text-muted">· {phoneBR(c.phone)}</span></button></li>
                  ))}
                </ul>
              )}
              <button className="mt-2 text-xs text-gold" onClick={() => setNewClient({ name: search.replace(/\d/g, '').trim(), phone: search.replace(/\D/g, '') })}>+ Cadastrar novo cliente</button>
            </div>
          )}
        </Field>

        <fieldset>
          <legend className="label">Serviços</legend>
          <div className="flex flex-wrap gap-2">
            {services.map((s) => {
              const o = s.offers.find((x) => x.unitId === unitId);
              const on = serviceIds.includes(s.id);
              return (
                <button type="button" key={s.id} aria-pressed={on} onClick={() => setServiceIds(on ? serviceIds.filter((x) => x !== s.id) : [...serviceIds, s.id])}
                  className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-gold bg-gold/15 text-gold' : 'border-white/10'}`}>
                  {s.name} · {brl(o.price)} · {o.durationMin}min
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Barbeiro" id="na-barber">
            <select id="na-barber" className="input" value={barberId} onChange={(e) => setBarberId(e.target.value)}>
              <option value="">Primeiro disponível</option>
              {eligible.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Data" id="na-date"><input id="na-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <SlotPicker unitId={unitId} serviceIds={serviceIds} barberId={barberId || undefined} date={date} value={slot} onChange={setSlot} />
        <Field label="Observações" id="na-notes"><input id="na-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <Alert>{error}</Alert>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-gold" disabled={!slot || !clientOk || busy} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Agendar</button>
        </div>
      </div>
    </Modal>
  );
}
