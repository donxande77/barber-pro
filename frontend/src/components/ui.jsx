import { useEffect, useRef, useState } from 'react';
import { Loader2, X, Upload } from 'lucide-react';
import { api } from '../lib/api.js';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-heading text-3xl font-medium sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Field({ label, error, hint, children, id }) {
  return (
    <div className="min-w-0">
      {label && <label className="label" htmlFor={id}>{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export function Alert({ children, tone = 'error' }) {
  if (!children) return null;
  const cls = tone === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : tone === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-gold/30 bg-gold/10 text-ink';
  return <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</p>;
}

export function Spinner({ label = 'Carregando…' }) {
  return (
    <p className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </p>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
      <p className="font-heading text-xl">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const PILL = {
  gold: 'bg-gold/15 text-gold',
  green: 'bg-emerald-500/15 text-emerald-300',
  red: 'bg-red-500/15 text-red-300',
  blue: 'bg-sky-500/15 text-sky-300',
  gray: 'bg-white/5 text-muted',
  amber: 'bg-amber-500/15 text-amber-300',
};
export function Pill({ tone = 'gray', children }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${PILL[tone]}`}>{children}</span>;
}

export const STATUS_TONE = {
  SCHEDULED: 'blue', CONFIRMED: 'gold', CHECKED_IN: 'amber', COMPLETED: 'green', CANCELLED: 'red', NO_SHOW: 'gray',
  OPEN: 'amber', CLOSED: 'green', PAID: 'green', PARTIAL: 'amber', UNPAID: 'red', SETTLED: 'green',
  PENDING: 'amber', APPROVED: 'green', REJECTED: 'red', ACTIVE: 'green', INACTIVE: 'gray', ON_LEAVE: 'amber',
};

/** Painel modal: folha inferior no celular, janela centralizada no desktop. */
export function Modal({ open, onClose, title, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('input, select, textarea, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/70" aria-label="Fechar" onClick={onClose} tabIndex={-1} />
      <div
        ref={ref}
        className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl sm:p-6 ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="font-heading text-2xl">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:text-ink" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Botão que pede confirmação na própria tela antes de executar. */
export function ConfirmButton({ children, confirmText = 'Confirmar', question, onConfirm, className = 'btn-ghost btn-sm', danger = false, needReason = false }) {
  const [state, setState] = useState('idle');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  if (state === 'idle') return <button type="button" className={className} onClick={() => setState('ask')}>{children}</button>;
  const run = async () => {
    setState('busy');
    setError('');
    try {
      await onConfirm(reason);
      setState('idle');
      setReason('');
    } catch (e) {
      setError(e.message);
      setState('ask');
    }
  };
  return (
    <div className="w-full space-y-2 rounded-lg border border-white/10 p-3 text-sm sm:w-auto">
      {question && <p>{question}</p>}
      {needReason && <input className="input" placeholder="Motivo (obrigatório)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo" />}
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className={danger ? 'btn-danger btn-sm' : 'btn-gold btn-sm'} disabled={state === 'busy' || (needReason && reason.trim().length < 3)} onClick={run}>
          {state === 'busy' && <Loader2 className="h-3 w-3 animate-spin" />} {confirmText}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setState('idle')}>Voltar</button>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className="flex min-w-max gap-1 rounded-xl border border-white/5 bg-surface p-1">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={value === key}
            onClick={() => onChange(key)}
            className={`rounded-lg px-3.5 py-2 text-sm transition ${value === key ? 'bg-gold text-gold-contrast font-semibold' : 'text-ink/75 hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Tabela que vira lista de cartões no celular. columns: [{ key, label, render?, align? , hideSm? }] */
export function DataTable({ columns, rows, rowKey = 'id', empty = 'Nada por aqui ainda.', onRowClick, footer }) {
  if (!rows?.length) return <Empty title={empty} />;
  return (
    <div className="card overflow-hidden">
      <table className="hidden w-full text-left text-sm md:table">
        <thead className="border-b border-white/5 text-xs text-muted">
          <tr>{columns.map((c) => <th key={c.key} className={`px-4 py-3 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[rowKey]} onClick={onRowClick ? () => onRowClick(r) : undefined} className={`border-b border-white/5 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-white/[0.03]' : ''}`}>
              {columns.map((c) => <td key={c.key} className={`px-4 py-3 align-top ${c.align === 'right' ? 'num text-right' : ''}`}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot className="border-t border-white/10 font-semibold">{footer}</tfoot>}
      </table>
      <ul className="divide-y divide-white/5 md:hidden">
        {rows.map((r) => (
          <li key={r[rowKey]} onClick={onRowClick ? () => onRowClick(r) : undefined} className={`space-y-1.5 p-4 ${onRowClick ? 'cursor-pointer active:bg-white/[0.03]' : ''}`}>
            {columns.filter((c) => !c.hideSm).map((c, i) => (
              <div key={c.key} className={i === 0 ? 'font-medium' : 'flex justify-between gap-3 text-sm'}>
                {i > 0 && <span className="text-muted">{c.label}</span>}
                <span className={i > 0 && c.align === 'right' ? 'num text-right' : 'min-w-0 text-right'}>{c.render ? c.render(r) : r[c.key]}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Stat({ label, value, hint, tone }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`num mt-1 font-heading text-2xl ${tone === 'red' ? 'text-red-300' : tone === 'gold' ? 'text-gold' : ''}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Envio de imagem (PNG, JPG, WEBP até 5 MB) para /api/uploads. */
export function ImageInput({ value, onChange, label = 'Imagem', id }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError('Imagem muito grande (máximo 5 MB).');
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      setError('');
      try {
        const r = await api.post('/uploads', { fileName: file.name, dataBase64: reader.result });
        onChange(r.url);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-3">
        {value ? <img src={value} alt="" className="h-16 w-16 rounded-lg object-cover ring-1 ring-white/10" /> : <div className="h-16 w-16 rounded-lg bg-graphite" />}
        <label htmlFor={id} className="btn-ghost btn-sm cursor-pointer">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} {value ? 'Trocar' : 'Enviar'}
        </label>
        <input id={id} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={pick} />
        {value && <button type="button" className="text-xs text-muted hover:text-red-300" onClick={() => onChange(null)}>Remover</button>}
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

/** Período (de/até) com atalhos. */
export function PeriodPicker({ from, to, onChange }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const presets = [
    ['Hoje', today, today],
    ['Mês atual', `${today.slice(0, 8)}01`, today],
    ['30 dias', new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() - 29 * 86_400_000)), today],
  ];
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label" htmlFor="pp-from">De</label>
        <input id="pp-from" type="date" className="input py-2" value={from} max={to} onChange={(e) => onChange({ from: e.target.value, to })} />
      </div>
      <div>
        <label className="label" htmlFor="pp-to">Até</label>
        <input id="pp-to" type="date" className="input py-2" value={to} min={from} onChange={(e) => onChange({ from, to: e.target.value })} />
      </div>
      {presets.map(([l, f, t]) => (
        <button key={l} type="button" className={`btn-ghost btn-sm ${from === f && to === t ? 'border-gold text-gold' : ''}`} onClick={() => onChange({ from: f, to: t })}>{l}</button>
      ))}
    </div>
  );
}
