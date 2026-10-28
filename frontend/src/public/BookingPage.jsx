import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronLeft, Loader2, CalendarCheck, Users } from 'lucide-react';
import { useSite } from './SiteContext.jsx';
import { Monogram } from './HomePage.jsx';
import { api } from '../lib/api.js';
import { qs } from '../lib/useApi.js';
import { addDays, brl, isoDay, longDate, timeBR, WEEKDAYS_SHORT } from '../lib/format.js';

const STEPS = ['Unidade', 'Serviços', 'Profissional', 'Data e hora', 'Seus dados', 'Confirmação'];

const clientSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome.'),
  phone: z.string().refine((v) => /^\d{10,11}$/.test(v.replace(/\D/g, '')), 'Informe DDD + número.'),
  email: z.union([z.literal(''), z.email('E-mail inválido.')]),
  notes: z.string().max(300).optional(),
  consent: z.literal(true, { message: 'É preciso aceitar para continuar.' }),
});

function Progress({ step }) {
  return (
    <ol className="mb-8 flex gap-1.5" aria-label="Etapas do agendamento">
      {STEPS.map((s, i) => (
        <li key={s} className="flex-1">
          <div className={`h-1 rounded-full ${i <= step ? 'bg-gold' : 'bg-white/10'}`} />
          <span className={`mt-2 hidden text-xs sm:block ${i === step ? 'text-ink' : 'text-muted'}`} aria-current={i === step ? 'step' : undefined}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export default function BookingPage() {
  const { units, unitId, setUnitId, catalog, unit } = useSite();
  const [params] = useSearchParams();
  const [step, setStep] = useState(unitId ? 1 : 0);
  const [serviceIds, setServiceIds] = useState([]);
  const [barberId, setBarberId] = useState(params.get('barbeiro') || null);
  const [date, setDate] = useState(null);
  const [slot, setSlot] = useState(null);
  const [slots, setSlots] = useState({ loading: false, data: null, error: null });
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState('');
  // Corte escolhido no mural (referência para o barbeiro)
  const [reference, setReference] = useState(null);
  const [refApplied, setRefApplied] = useState(false);
  const corteId = params.get('corte');

  const services = useMemo(() => catalog.data?.services ?? [], [catalog.data]);
  const barbers = useMemo(() => catalog.data?.barbers ?? [], [catalog.data]);
  const chosen = services.filter((s) => serviceIds.includes(s.id));
  const total = chosen.reduce((acc, s) => acc + Number(s.price), 0);
  const duration = chosen.reduce((acc, s) => acc + s.durationMin, 0);
  const eligibleBarbers = barbers.filter((b) => serviceIds.every((id) => b.serviceIds.includes(id)));
  const tz = unit?.timezone ?? 'America/Sao_Paulo';
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(isoDay(0, tz), i)), [tz]);
  const openWeekdays = new Set(unit?.hours.map((h) => h.weekday));

  useEffect(() => {
    if (!corteId) return;
    api
      .get(`/public/posts/${corteId}`)
      .then((p) => {
        setReference(p);
        if (p.unitId) {
          setUnitId(p.unitId);
          setStep(1);
        }
        if (p.barber) setBarberId(p.barber.id);
      })
      .catch(() => setReference(null));
  }, [corteId, setUnitId]);

  // Quando o catálogo da unidade chega, marca os serviços do corte escolhido
  useEffect(() => {
    if (!reference || refApplied || !catalog.data) return;
    const available = new Set(catalog.data.services.map((x) => x.id));
    setServiceIds(reference.serviceIds.filter((id) => available.has(id)).slice(0, 6));
    setRefApplied(true);
  }, [reference, refApplied, catalog.data]);

  // Profissional pré-escolhido que não atende os serviços é descartado
  useEffect(() => {
    if (barberId && serviceIds.length && !eligibleBarbers.some((b) => b.id === barberId)) setBarberId(null);
  }, [barberId, serviceIds, eligibleBarbers]);

  useEffect(() => {
    if (step !== 3 || !date) return;
    setSlot(null);
    setSlots({ loading: true, data: null, error: null });
    api
      .get(`/public/availability${qs({ unitId, date, serviceIds: serviceIds.join(','), barberId })}`)
      .then((data) => setSlots({ loading: false, data, error: null }))
      .catch((error) => setSlots({ loading: false, data: null, error }));
  }, [step, date, unitId, serviceIds, barberId]);

  const form = useForm({ resolver: zodResolver(clientSchema), defaultValues: { name: '', phone: '', email: '', notes: '', consent: false } });

  const submit = form.handleSubmit(async (v) => {
    setSubmitError('');
    try {
      const r = await api.post('/public/appointments', {
        unitId, serviceIds, barberId, startsAt: slot.startsAt, referencePostId: reference?.id ?? null,
        client: { name: v.name, phone: v.phone, email: v.email || null }, notes: v.notes || null, consent: true,
      });
      setResult(r);
      setStep(5);
    } catch (e) {
      setSubmitError(e.message);
      if (e.status === 409) {
        setStep(3);
        setDate((d) => d); // força nova busca
        setSlots((s) => ({ ...s }));
      }
    }
  });

  const back = () => setStep((s) => Math.max(units.length > 1 ? 0 : 1, s - 1));
  const toggleService = (id) => setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, 6)));

  if (result) {
    return (
      <main className="mx-auto max-w-xl px-4 py-14 sm:px-6">
        <div className="card p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gold text-gold-contrast"><CalendarCheck className="h-7 w-7" /></span>
          <h1 className="mt-5 font-heading text-4xl">Horário reservado</h1>
          <p className="mt-3 text-ink/80">
            {longDate(result.startsAt, tz)}, às {timeBR(result.startsAt, tz)} com {result.barber} — {result.unit}.
          </p>
          <p className="mt-1 text-muted">{result.services.join(' + ')} · {brl(result.totalPrice)} (pagamento na unidade)</p>
          {result.reference && <p className="mt-1 text-sm text-gold">Referência enviada ao profissional: {result.reference.title}</p>}
          <div className="mt-6 rounded-lg border border-white/10 p-4 text-left text-sm">
            <p className="text-muted">Guarde este link para consultar ou cancelar:</p>
            <Link to={`/agendamento/${result.manageToken}`} className="mt-1 block break-all text-gold underline">{result.manageUrl}</Link>
          </div>
          <Link to="/" className="btn-ghost mt-8">Voltar ao início</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-6 flex items-center gap-3">
        {step > (units.length > 1 ? 0 : 1) && (
          <button onClick={back} className="btn-ghost px-2.5" aria-label="Voltar etapa"><ChevronLeft className="h-5 w-5" /></button>
        )}
        <h1 className="font-heading text-4xl">Agendar horário</h1>
      </div>
      <Progress step={step} />
      {reference && (
        <div className="mb-6 flex items-center gap-4 rounded-xl border border-gold/30 bg-gold/[0.06] p-3">
          <img src={reference.imageUrls[reference.imageUrls.length >= 2 ? 1 : 0]} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">Corte de referência</p>
            <p className="truncate font-heading text-lg">{reference.title}</p>
            {reference.barber && <p className="truncate text-xs text-muted">feito por {reference.barber.name}</p>}
          </div>
          <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setReference(null)}>Remover</button>
        </div>
      )}

      {step === 0 && (
        <section>
          <h2 className="mb-4 text-lg">Em qual unidade?</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {units.map((u) => (
              <li key={u.id}>
                <button
                  onClick={() => { setUnitId(u.id); setServiceIds([]); setStep(1); }}
                  className={`w-full rounded-xl border p-5 text-left transition hover:border-gold ${u.id === unitId ? 'border-gold' : 'border-white/10'}`}
                >
                  <p className="font-heading text-2xl">{u.name}</p>
                  <p className="mt-1 text-sm text-muted">{[u.street, u.number, u.district].filter(Boolean).join(', ') || u.city}</p>
                </button>
              </li>
            ))}
          </ul>
          {!units.length && <p className="text-muted">Nenhuma unidade disponível para agendamento.</p>}
        </section>
      )}

      {step === 1 && (
        <section>
          <h2 className="mb-1 text-lg">O que vamos fazer?</h2>
          <p className="mb-5 text-sm text-muted">Escolha um ou mais serviços.</p>
          {catalog.loading && <p className="text-muted">Carregando…</p>}
          <ul className="divide-y divide-white/5 rounded-xl border border-white/10">
            {services.map((s) => {
              const on = serviceIds.includes(s.id);
              return (
                <li key={s.id}>
                  <button onClick={() => toggleService(s.id)} aria-pressed={on} className="flex w-full items-center gap-4 p-4 text-left hover:bg-white/[0.03]">
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${on ? 'border-gold bg-gold text-gold-contrast' : 'border-white/25'}`}>
                      {on && <Check className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{s.name}</span>
                      <span className="text-sm text-muted">{s.durationMin} min</span>
                    </span>
                    <span className="num font-heading text-lg">{brl(s.price)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <StickyBar disabled={!serviceIds.length} onNext={() => setStep(2)} summary={serviceIds.length ? `${chosen.length} serviço(s) · ${duration} min · ${brl(total)}` : 'Nenhum serviço escolhido'} />
        </section>
      )}

      {step === 2 && (
        <section>
          <h2 className="mb-5 text-lg">Com quem?</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            <li>
              <button onClick={() => { setBarberId(null); setStep(3); }} className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left hover:border-gold ${!barberId ? 'border-gold' : 'border-white/10'}`}>
                <span className="grid h-14 w-14 place-items-center rounded-full bg-graphite"><Users className="h-6 w-6 text-gold" /></span>
                <span><span className="block font-heading text-xl">Primeiro disponível</span><span className="text-sm text-muted">Mais opções de horário</span></span>
              </button>
            </li>
            {eligibleBarbers.map((b) => (
              <li key={b.id}>
                <button onClick={() => { setBarberId(b.id); setStep(3); }} className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left hover:border-gold ${barberId === b.id ? 'border-gold' : 'border-white/10'}`}>
                  <span className="h-14 w-14 shrink-0 overflow-hidden rounded-full">
                    {b.photoUrl ? <img src={b.photoUrl} alt="" className="h-full w-full object-cover" /> : <Monogram name={b.name} className="h-full w-full text-xl" />}
                  </span>
                  <span className="min-w-0"><span className="block font-heading text-xl">{b.name}</span><span className="text-sm text-muted">{b.specialties?.join(', ')}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === 3 && (
        <section>
          <h2 className="mb-4 text-lg">Quando?</h2>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2" role="listbox" aria-label="Dia">
            {days.map((d) => {
              const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
              const closed = !openWeekdays.has(wd);
              return (
                <button
                  key={d}
                  role="option"
                  aria-selected={d === date}
                  disabled={closed}
                  onClick={() => setDate(d)}
                  className={`flex w-16 shrink-0 flex-col items-center rounded-xl border py-3 transition disabled:opacity-30 ${d === date ? 'border-gold bg-gold text-gold-contrast' : 'border-white/10 hover:border-gold/60'}`}
                >
                  <span className="text-xs">{WEEKDAYS_SHORT[wd]}</span>
                  <span className="num font-heading text-2xl">{d.slice(8)}</span>
                  <span className="text-[10px]">{['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(d.slice(5, 7)) - 1]}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-6">
            {!date && <p className="text-muted">Escolha um dia para ver os horários livres.</p>}
            {submitError && <p role="alert" className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{submitError}</p>}
            {slots.loading && <p className="flex items-center gap-2 text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Buscando horários…</p>}
            {slots.error && <p className="text-red-300">{slots.error.message}</p>}
            {slots.data && !slots.data.slots.length && <p className="text-muted">Sem horários livres neste dia. Tente outro dia ou outro profissional.</p>}
            {slots.data?.slots.length > 0 && (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {slots.data.slots.map((s) => (
                  <button
                    key={s.startsAt}
                    onClick={() => setSlot(s)}
                    aria-pressed={slot?.startsAt === s.startsAt}
                    className={`num rounded-lg border py-2.5 text-sm transition ${slot?.startsAt === s.startsAt ? 'border-gold bg-gold font-semibold text-gold-contrast' : 'border-white/10 hover:border-gold/60'}`}
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            )}
          </div>
          <StickyBar disabled={!slot} onNext={() => { setSubmitError(''); setStep(4); }} summary={slot ? `${longDate(slot.startsAt, tz)}, ${slot.time}` : 'Escolha um horário'} />
        </section>
      )}

      {step === 4 && (
        <section>
          <div className="mb-6 rounded-xl border border-gold/30 bg-gold/[0.06] p-5">
            <p className="font-heading text-xl">{chosen.map((s) => s.name).join(' + ')}</p>
            <p className="mt-1 text-sm text-ink/80">
              {unit?.name} · {longDate(slot.startsAt, tz)}, {slot.time} · {barberId ? barbers.find((b) => b.id === barberId)?.name : 'primeiro disponível'}
            </p>
            <p className="mt-2 num font-heading text-2xl text-gold">{brl(total)} <span className="text-sm text-muted">· {duration} min · pagamento na unidade</span></p>
          </div>
          <form onSubmit={submit} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="b-name">Nome</label>
                <input id="b-name" className="input" autoComplete="name" {...form.register('name')} />
                {form.formState.errors.name && <p className="field-error">{form.formState.errors.name.message}</p>}
              </div>
              <div>
                <label className="label" htmlFor="b-phone">Celular (WhatsApp)</label>
                <input id="b-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" {...form.register('phone')} />
                {form.formState.errors.phone && <p className="field-error">{form.formState.errors.phone.message}</p>}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="b-email">E-mail (opcional)</label>
              <input id="b-email" className="input" type="email" autoComplete="email" {...form.register('email')} />
              {form.formState.errors.email && <p className="field-error">{form.formState.errors.email.message}</p>}
            </div>
            <div>
              <label className="label" htmlFor="b-notes">Observações (opcional)</label>
              <textarea id="b-notes" rows={2} className="input" {...form.register('notes')} />
            </div>
            <label className="flex items-start gap-3 text-sm text-ink/80">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--bp-accent))]" {...form.register('consent')} />
              <span>
                Concordo com o uso dos meus dados para agendamento e contato, conforme a{' '}
                <Link to="/privacidade" target="_blank" className="text-gold underline">política de privacidade</Link>.
              </span>
            </label>
            {form.formState.errors.consent && <p className="field-error">{form.formState.errors.consent.message}</p>}
            {submitError && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{submitError}</p>}
            <button className="btn-gold w-full py-3 text-base" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar agendamento
            </button>
          </form>
        </section>
      )}
    </main>
  );
}

function StickyBar({ summary, disabled, onNext }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-8 flex items-center gap-4 border-t border-white/10 bg-bg/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
      <p className="min-w-0 flex-1 truncate text-sm text-ink/80">{summary}</p>
      <button className="btn-gold" disabled={disabled} onClick={onNext}>Continuar</button>
    </div>
  );
}
