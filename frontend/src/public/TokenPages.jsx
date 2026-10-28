import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, Star } from 'lucide-react';
import { api } from '../lib/api.js';
import { brl, dateBR, longDate, phoneBR, timeBR, waLink } from '../lib/format.js';
import { useSite } from './SiteContext.jsx';

const STATUS = {
  SCHEDULED: 'Agendado', CONFIRMED: 'Confirmado', CHECKED_IN: 'Em atendimento', COMPLETED: 'Concluído', CANCELLED: 'Cancelado', NO_SHOW: 'Não compareceu',
};

/** Página do link enviado ao cliente: ver e cancelar o agendamento. */
export function ManageBookingPage() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/public/appointments/${token}`).then(setInfo).catch((e) => setError(e.message));
  }, [token]);

  const cancel = async () => {
    setBusy(true);
    try {
      setInfo(await api.post(`/public/appointments/${token}/cancel`, {}));
      setConfirming(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <h1 className="font-heading text-4xl">Seu agendamento</h1>
      {error && <p role="alert" className="mt-6 rounded-lg bg-red-500/10 px-3 py-2 text-red-300">{error}</p>}
      {!info && !error && <p className="mt-6 text-muted">Carregando…</p>}
      {info && (
        <div className="card mt-6 p-6">
          <p className={`inline-block rounded-full px-3 py-1 text-xs ${info.status === 'CANCELLED' ? 'bg-red-500/15 text-red-300' : 'bg-gold/15 text-gold'}`}>{STATUS[info.status]}</p>
          <p className="mt-4 font-heading text-3xl">{info.services.join(' + ')}</p>
          <p className="mt-2 text-ink/80">
            {longDate(info.startsAt, info.unit.timezone)}, às {timeBR(info.startsAt, info.unit.timezone)} · {info.barber}
          </p>
          <p className="text-muted">{info.unit.name} · {brl(info.totalPrice)}</p>
          {info.canCancel && !confirming && (
            <button className="btn-danger mt-6" onClick={() => setConfirming(true)}>Cancelar agendamento</button>
          )}
          {confirming && (
            <div className="mt-6 rounded-lg border border-red-500/30 p-4">
              <p>Cancelar este horário? Ele ficará livre para outra pessoa.</p>
              <div className="mt-3 flex gap-3">
                <button className="btn-danger" onClick={cancel} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Sim, cancelar</button>
                <button className="btn-ghost" onClick={() => setConfirming(false)}>Manter</button>
              </div>
            </div>
          )}
          {!info.canCancel && ['SCHEDULED', 'CONFIRMED'].includes(info.status) && (
            <p className="mt-6 text-sm text-muted">
              O cancelamento online vai até {info.unit.minCancelHours} h antes ({dateBR(info.cancelDeadline, info.unit.timezone)} {timeBR(info.cancelDeadline, info.unit.timezone)}).
              {' '}Para alterar, fale com a unidade{info.unit.phone ? `: ${phoneBR(info.unit.phone)}` : '.'}
              {info.unit.whatsapp && <> · <a className="text-gold underline" href={waLink(info.unit.whatsapp)} target="_blank" rel="noreferrer">WhatsApp</a></>}
            </p>
          )}
          {info.status === 'CANCELLED' && <Link to="/agendar" className="btn-gold mt-6">Agendar outro horário</Link>}
        </div>
      )}
    </main>
  );
}

/** Avaliação vinculada a um atendimento concluído. */
export function ReviewPage() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/public/reviews/${token}`).then(setInfo).catch((e) => setError(e.message));
  }, [token]);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/public/reviews/${token}`, { rating, comment: comment || null });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <h1 className="font-heading text-4xl">Como foi o atendimento?</h1>
      {error && <p role="alert" className="mt-6 rounded-lg bg-red-500/10 px-3 py-2 text-red-300">{error}</p>}
      {info && (info.alreadyReviewed || done) && (
        <p className="card mt-6 p-6 text-ink/85">Obrigado pela avaliação! Ela aparece no site depois de revisada pela equipe.</p>
      )}
      {info && !info.alreadyReviewed && !done && (
        <form onSubmit={send} className="card mt-6 space-y-5 p-6">
          <p className="text-ink/80">{info.services.join(' + ')} com {info.barber} — {info.unit}, {dateBR(info.date)}</p>
          <fieldset>
            <legend className="label">Sua nota</legend>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} onClick={() => setRating(n)} aria-label={`${n} estrela${n > 1 ? 's' : ''}`} aria-pressed={rating === n} className="p-1 text-gold">
                  <Star className={`h-9 w-9 ${n <= rating ? 'fill-current' : 'opacity-30'}`} />
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="r-comment">Comentário (opcional)</label>
            <textarea id="r-comment" rows={4} maxLength={1000} className="input" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <button className="btn-gold" disabled={!rating || busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Enviar avaliação</button>
        </form>
      )}
    </main>
  );
}

export function PrivacyPage() {
  const { config } = useSite();
  return (
    <main className="mx-auto max-w-3xl px-4 py-14 text-ink/85 sm:px-6">
      <h1 className="font-heading text-4xl text-ink">Privacidade</h1>
      <div className="mt-6 space-y-4 leading-relaxed">
        <p>{config.brand.name} usa seus dados (nome, telefone e, se informado, e-mail) somente para agendar, confirmar e prestar os serviços, e para falar com você sobre o seu atendimento.</p>
        <p>Os dados não são vendidos nem compartilhados com terceiros para publicidade. Registros de atendimento e de pagamento são guardados pelo prazo exigido pela legislação fiscal.</p>
        <p>Você pode pedir a qualquer momento acesso, correção ou exclusão dos seus dados pessoais (Lei 13.709/2018 — LGPD) falando com qualquer unidade.</p>
        <p>Avaliações publicadas no site mostram apenas seu primeiro nome e a inicial do sobrenome.</p>
      </div>
      <Link to="/" className="btn-ghost mt-10">Voltar ao início</Link>
    </main>
  );
}
