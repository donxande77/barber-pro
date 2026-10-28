import { useState } from 'react';
import { Printer, FileSpreadsheet, FileText, FileDown, Loader2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useUnit } from '../../auth/UnitContext.jsx';
import { useApi, qs } from '../../lib/useApi.js';
import { brl, dateTimeBR, isoDay, monthStart, LABELS } from '../../lib/format.js';
import { PageHeader, Spinner, Alert, Tabs, Field, PeriodPicker } from '../../components/ui.jsx';
import { Logo } from '../../components/Logo.jsx';

async function download(url, fallbackName) {
  if (import.meta.env.VITE_PREVIEW === '1') throw new Error('Na demonstração os arquivos não são gerados. Com o sistema instalado, o download sai em PDF, Excel ou CSV.');
  const res = await fetch(`/api${url}`, { credentials: 'same-origin' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? 'Não foi possível gerar o arquivo.');
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function ReportsPage() {
  const { can, user } = useAuth();
  const { unitId, units } = useUnit();
  const kinds = [
    ...(can('reports:barber') ? [['barber', user.role === 'BARBER' ? 'Meu relatório' : 'Individual (barbeiro)']] : []),
    ...(can('reports:unit') ? [['unit', 'Unidade']] : []),
    ...(can('reports:consolidated') ? [['consolidated', 'Consolidado']] : []),
  ];
  const [kind, setKind] = useState(kinds[0][0]);
  const [f, setF] = useState({ from: monthStart(), to: isoDay(), barberId: '', unitId: '', method: '' });
  const barbers = useApi(user.role !== 'BARBER' && can('reports:barber') ? '/barbers' : null).data ?? [];
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const params =
    kind === 'barber'
      ? { barberId: user.role === 'BARBER' ? undefined : f.barberId, unitId: f.unitId || undefined, from: f.from, to: f.to }
      : kind === 'unit'
        ? { unitId: f.unitId || unitId, from: f.from, to: f.to, method: f.method || undefined }
        : { from: f.from, to: f.to, method: f.method || undefined };
  const ready = kind !== 'barber' || user.role === 'BARBER' || f.barberId;
  const path = `/reports/${kind}`;
  const { data, loading, error: loadError } = useApi(ready ? `${path}${qs(params)}` : null);

  const exportAs = async (format) => {
    setBusy(format);
    setError('');
    try {
      await download(`${path}${qs({ ...params, format })}`, `relatorio.${format}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <div className="no-print">
        <PageHeader title="Relatórios" subtitle="Visualize, imprima em A4 ou exporte em PDF, Excel e CSV." />
        {kinds.length > 1 && <Tabs tabs={kinds} value={kind} onChange={setKind} />}
        <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
          <PeriodPicker from={f.from} to={f.to} onChange={(p) => setF({ ...f, ...p })} />
          {kind === 'barber' && user.role !== 'BARBER' && (
            <div className="w-48">
              <Field label="Barbeiro" id="rp-b">
                <select id="rp-b" className="input py-2" value={f.barberId} onChange={(e) => setF({ ...f, barberId: e.target.value })}>
                  <option value="">Escolha…</option>
                  {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
            </div>
          )}
          {kind !== 'consolidated' && units.length > 0 && (
            <div className="w-48">
              <Field label="Unidade" id="rp-u">
                <select id="rp-u" className="input py-2" value={f.unitId || (kind === 'unit' ? unitId : '')} onChange={(e) => setF({ ...f, unitId: e.target.value })}>
                  {kind === 'barber' && <option value="">Todas</option>}
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
            </div>
          )}
          {kind !== 'barber' && (
            <div className="w-40">
              <Field label="Forma de pagamento" id="rp-m">
                <select id="rp-m" className="input py-2" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
                  <option value="">Todas</option>
                  {Object.entries(LABELS.method).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
          )}
        </div>
        {data && (
          <div className="mb-5 flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir (A4)</button>
            <button className="btn-ghost" disabled={!!busy} onClick={() => exportAs('pdf')}>{busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} PDF</button>
            <button className="btn-ghost" disabled={!!busy} onClick={() => exportAs('xlsx')}>{busy === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel</button>
            <button className="btn-ghost" disabled={!!busy} onClick={() => exportAs('csv')}>{busy === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} CSV</button>
          </div>
        )}
        <Alert>{error || loadError?.message}</Alert>
        {!ready && <p className="text-sm text-muted">Escolha o barbeiro para gerar o relatório.</p>}
        {loading && !data && <Spinner label="Gerando relatório…" />}
      </div>
      {data && <ReportSheet r={data} />}
    </>
  );
}

/** Folha A4: o mesmo conteúdo do PDF, com CSS de impressão (ver index.css). */
function ReportSheet({ r }) {
  return (
    <article className="print-sheet card mx-auto max-w-[210mm] p-6 sm:p-10">
      <header className="flex items-start gap-4 border-b border-gold/50 pb-4">
        {r.logoUrl ? <img src={r.logoUrl} alt="" className="h-12 w-12 object-contain" /> : <Logo className="h-12 w-12" />}
        <div className="min-w-0">
          <p className="font-heading text-2xl">{r.company}</p>
          <h2 className="text-lg">{r.title}</h2>
          <p className="text-sm text-muted">{r.subtitle}</p>
        </div>
      </header>
      <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {r.filters.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="text-muted">{k}:</dt><dd>{v}</dd></div>)}
      </dl>
      <dl className="mt-6 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
        {r.kpis.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-white/5 py-1">
            <dt className="text-muted">{k}</dt><dd className="num font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {r.tables.map((t) => (
        <section key={t.title} className="mt-8">
          <h3 className="mb-2 font-heading text-lg">{t.title}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-white/10 text-muted">
                <tr>{t.columns.map((c) => <th key={c.key} className={`py-2 pr-3 font-medium ${c.money ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {!t.rows.length && <tr><td colSpan={t.columns.length} className="py-3 text-muted">Nenhum registro no período.</td></tr>}
                {t.rows.map((row, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {t.columns.map((c) => <td key={c.key} className={`py-1.5 pr-3 ${c.money ? 'num text-right' : ''}`}>{c.money ? (row[c.key] === '' || row[c.key] == null ? '' : brl(row[c.key])) : String(row[c.key] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
              {t.totals && (
                <tfoot className="font-semibold">
                  <tr>{t.columns.map((c, i) => <td key={c.key} className={`py-2 pr-3 ${c.money ? 'num text-right' : ''}`}>{i === 0 ? 'Total' : t.totals[c.key] != null ? brl(t.totals[c.key]) : ''}</td>)}</tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      ))}
      <footer className="mt-10 border-t border-white/5 pt-3 text-xs text-muted">Gerado em {dateTimeBR(r.generatedAt)} por {r.generatedBy}</footer>
    </article>
  );
}
