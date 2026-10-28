import { useState } from 'react';
import { Star } from 'lucide-react';
import { useUnit } from '../../auth/UnitContext.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { api } from '../../lib/api.js';
import { useApi, qs } from '../../lib/useApi.js';
import { dateBR, dateTimeBR, LABELS } from '../../lib/format.js';
import { ROLE_LABELS } from '../../lib/schemas.js';
import { PageHeader, Spinner, Alert, Pill, STATUS_TONE, Empty, DataTable } from '../../components/ui.jsx';
import { ChangePasswordCard } from '../../components/ChangePasswordCard.jsx';

export function ReviewsPage() {
  const { unitId } = useUnit();
  const [status, setStatus] = useState('PENDING');
  const { data, loading, error, reload } = useApi(`/reviews${qs({ unitId, status })}`);
  const moderate = async (id, s) => {
    await api.patch(`/reviews/${id}`, { status: s });
    reload();
  };
  return (
    <>
      <PageHeader title="Avaliações" subtitle="Só clientes com atendimento concluído conseguem avaliar (pelo link enviado após o atendimento). Aprovadas aparecem no site." />
      <div className="mb-5 flex gap-2">
        {Object.entries(LABELS.review).map(([k, v]) => (
          <button key={k} className={`btn-ghost btn-sm ${status === k ? 'border-gold text-gold' : ''}`} onClick={() => setStatus(k)}>{v}</button>
        ))}
      </div>
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && !data.length && <Empty title="Nenhuma avaliação aqui" />}
      <ul className="grid gap-4 md:grid-cols-2">
        {data?.map((r) => (
          <li key={r.id} className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex text-gold" aria-label={`${r.rating} de 5`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`h-4 w-4 ${i < r.rating ? 'fill-current' : 'opacity-30'}`} />)}</span>
              <Pill tone={STATUS_TONE[r.status]}>{LABELS.review[r.status]}</Pill>
            </div>
            {r.comment && <p className="mt-3">“{r.comment}”</p>}
            <p className="mt-3 text-sm text-muted">{r.client.name} · {r.barber.name} · {r.unit.name} · {dateBR(r.createdAt)}</p>
            <div className="mt-4 flex gap-2">
              {r.status !== 'APPROVED' && <button className="btn-gold btn-sm" onClick={() => moderate(r.id, 'APPROVED')}>Publicar</button>}
              {r.status !== 'REJECTED' && <button className="btn-ghost btn-sm" onClick={() => moderate(r.id, 'REJECTED')}>Recusar</button>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

const ACTIONS = {
  'auth.login': 'Entrou no sistema', 'auth.lockout': 'Conta bloqueada por tentativas', 'auth.password_changed': 'Trocou a senha',
  'user.create': 'Criou usuário', 'user.update': 'Alterou usuário', 'unit.create': 'Criou unidade', 'unit.update': 'Alterou unidade',
  'sale.create': 'Abriu venda', 'sale.close': 'Fechou venda', 'sale.cancel': 'Cancelou venda', 'payment.create': 'Registrou pagamento',
  'payment.reverse': 'Estornou pagamento', 'finance.transaction': 'Lançamento financeiro', 'finance.reverse': 'Estornou movimentação',
  'transfer.create': 'Transferência', 'transfer.reverse': 'Estornou transferência', 'cash.close': 'Fechou caixa', 'bill.create': 'Criou conta',
  'bill.pay': 'Baixou conta', 'bill.cancel': 'Cancelou conta', 'compensation.rule_create': 'Criou regra de remuneração',
  'compensation.rule_end': 'Encerrou regra', 'compensation.payout': 'Pagamento a profissional', 'compensation.periodic': 'Gerou fixos/aluguéis',
  'site.published': 'Publicou o site', 'site.draft_saved': 'Salvou rascunho do site', 'client.anonymize': 'Anonimizou cliente',
};

export function AuditPage() {
  const [entity, setEntity] = useState('');
  const { data, loading } = useApi(`/audit${qs({ entity, limit: 200 })}`);
  return (
    <>
      <PageHeader title="Auditoria" subtitle="Quem fez o quê e quando. Senhas e tokens nunca são registrados." />
      <select className="input mb-5 w-56" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Filtrar por tipo">
        <option value="">Todos os registros</option>
        {['User', 'Unit', 'Sale', 'Payment', 'FinancialTransaction', 'Transfer', 'CashClosing', 'Bill', 'CompensationRule', 'BarberPayout', 'SiteConfigVersion', 'Client', 'Appointment'].map((e) => <option key={e} value={e}>{e}</option>)}
      </select>
      {loading && !data && <Spinner />}
      {data && (
        <DataTable
          rows={data}
          columns={[
            { key: 'createdAt', label: 'Quando', render: (a) => dateTimeBR(a.createdAt) },
            { key: 'user', label: 'Quem', render: (a) => a.user?.name ?? 'Site (cliente)' },
            { key: 'action', label: 'Ação', render: (a) => ACTIONS[a.action] ?? a.action },
            { key: 'entity', label: 'Registro', hideSm: true, render: (a) => `${a.entity} ${a.entityId?.slice(0, 8) ?? ''}` },
            { key: 'ip', label: 'IP', hideSm: true, render: (a) => a.ip ?? '—' },
          ]}
        />
      )}
    </>
  );
}

export function AccountPage() {
  const { user, company } = useAuth();
  return (
    <>
      <PageHeader title="Minha conta" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6 text-sm">
          <p className="font-heading text-2xl">{user.name}</p>
          <p className="mt-1 text-muted">{user.email}</p>
          <p className="mt-4">{ROLE_LABELS[user.role]} · {company?.name}</p>
        </section>
        <ChangePasswordCard />
      </div>
    </>
  );
}
