import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { api } from '../../lib/api.js';
import { useApi, qs } from '../../lib/useApi.js';
import { brl, dateBR, dateTimeBR, phoneBR, LABELS } from '../../lib/format.js';
import { PageHeader, Spinner, Alert, DataTable, Modal, Field, ConfirmButton, Pill, STATUS_TONE } from '../../components/ui.jsx';

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.'),
  phone: z.string().refine((v) => /^\d{10,13}$/.test(v.replace(/\D/g, '')), 'Telefone com DDD.'),
  email: z.union([z.literal(''), z.email('E-mail inválido.')]),
  birthDate: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export default function ClientsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const { data, loading, error, reload } = useApi(`/clients${qs({ search, page })}`);
  return (
    <>
      <PageHeader title="Clientes" actions={can('clients:manage') && <button className="btn-gold" onClick={() => setEditing({})}><Plus className="h-4 w-4" /> Novo cliente</button>} />
      <div className="relative mb-5 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input className="input pl-9" placeholder="Buscar por nome, telefone ou e-mail" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Buscar clientes" />
      </div>
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && (
        <>
          <DataTable
            rows={data.items}
            empty={search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            onRowClick={(c) => setViewing(c.id)}
            columns={[
              { key: 'name', label: 'Nome' },
              { key: 'phone', label: 'Telefone', render: (c) => phoneBR(c.phone) },
              { key: 'email', label: 'E-mail', render: (c) => c.email ?? '—', hideSm: true },
              { key: 'createdAt', label: 'Cliente desde', render: (c) => dateBR(c.createdAt) },
            ]}
          />
          {data.total > data.pageSize && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <button className="btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button>
              <span className="text-muted">Página {page} de {Math.ceil(data.total / data.pageSize)}</span>
              <button className="btn-ghost btn-sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Próxima</button>
            </div>
          )}
        </>
      )}
      {editing && <ClientForm client={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {viewing && <ClientDetail id={viewing} onClose={() => setViewing(null)} onEdit={(c) => { setViewing(null); setEditing(c); }} onChanged={() => { setViewing(null); reload(); }} />}
    </>
  );
}

function ClientForm({ client, onClose, onSaved }) {
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: client.name ?? '', phone: client.phone ?? '', email: client.email ?? '', birthDate: client.birthDate?.slice(0, 10) ?? '', notes: client.notes ?? '' },
  });
  const submit = handleSubmit(async (v) => {
    setError('');
    try {
      const body = { ...v, birthDate: v.birthDate || null };
      if (client.id) await api.patch(`/clients/${client.id}`, body);
      else await api.post('/clients', body);
      onSaved();
    } catch (e) {
      setError(e.status === 409 ? 'Já existe um cliente com este telefone.' : e.message);
    }
  });
  return (
    <Modal open title={client.id ? 'Editar cliente' : 'Novo cliente'} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Nome" id="c-name" error={errors.name?.message}><input id="c-name" className="input" {...register('name')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefone" id="c-phone" error={errors.phone?.message}><input id="c-phone" className="input" inputMode="tel" {...register('phone')} /></Field>
          <Field label="Nascimento" id="c-birth"><input id="c-birth" type="date" className="input" {...register('birthDate')} /></Field>
        </div>
        <Field label="E-mail" id="c-email" error={errors.email?.message}><input id="c-email" type="email" className="input" {...register('email')} /></Field>
        <Field label="Observações" id="c-notes"><textarea id="c-notes" rows={3} className="input" {...register('notes')} /></Field>
        <Alert>{error}</Alert>
        <button className="btn-gold w-full" disabled={isSubmitting}>Salvar cliente</button>
      </form>
    </Modal>
  );
}

function ClientDetail({ id, onClose, onEdit, onChanged }) {
  const { can } = useAuth();
  const { data, loading, error } = useApi(`/clients/${id}`);
  return (
    <Modal open wide title={data?.name ?? 'Cliente'} onClose={onClose}>
      {loading && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && (
        <div className="space-y-5 text-sm">
          <p>{phoneBR(data.phone)}{data.email ? ` · ${data.email}` : ''}{data.birthDate ? ` · nascimento ${dateBR(data.birthDate, 'UTC')}` : ''}</p>
          {data.notes && <p className="text-muted">{data.notes}</p>}
          <div className="flex flex-wrap gap-2">
            {can('clients:manage') && <button className="btn-ghost btn-sm" onClick={() => onEdit(data)}>Editar</button>}
            {can('company:manage') && (
              <ConfirmButton danger className="btn-danger btn-sm" question="Anonimizar remove nome, telefone e e-mail de forma definitiva (pedido do titular — LGPD). O histórico de vendas é mantido sem identificação." confirmText="Anonimizar" onConfirm={async () => { await api.post(`/clients/${id}/anonymize`); onChanged(); }}>
                Anonimizar (LGPD)
              </ConfirmButton>
            )}
          </div>
          {data.subscriptions?.length > 0 && (
            <>
              <h3 className="font-heading text-lg">Planos mensais</h3>
              <ul className="divide-y divide-white/5">
                {data.subscriptions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="flex-1">{s.planSnapshot.name} <span className="text-muted">· desde {dateBR(s.startDate, 'UTC')} · {s.unit.name}</span></span>
                    <span className="num">{brl(s.price)}/mês</span>
                    <Pill tone={STATUS_TONE[s.status]}>{LABELS.subscription[s.status]}</Pill>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3 className="font-heading text-lg">Histórico</h3>
          {!data.appointments.length && <p className="text-muted">Sem atendimentos nas suas unidades.</p>}
          <ul className="divide-y divide-white/5">
            {data.appointments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="num">{dateTimeBR(a.startsAt, a.unit.timezone)}</span>
                <span className="flex-1 text-muted">{a.items.map((i) => i.serviceName).join(' + ')} · {a.barber.name} · {a.unit.name}</span>
                <span className="num">{brl(a.totalPrice)}</span>
                <Pill tone={STATUS_TONE[a.status]}>{LABELS.appointment[a.status]}</Pill>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
