import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus, X, Loader2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ROLE_LABELS, userSchema } from '../../lib/schemas.js';

export default function UsersPage() {
  const { can, user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [units, setUnits] = useState([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, un] = await Promise.all([api.get('/users'), api.get('/units')]);
      setUsers(u);
      setUnits(un);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unitName = (id) => units.find((u) => u.id === id)?.name ?? '—';

  const toggleStatus = async (u) => {
    const next = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (next === 'INACTIVE' && import.meta.env.VITE_PREVIEW !== '1' && !window.confirm(`Desativar ${u.name}? As sessões abertas serão encerradas.`)) return;
    try {
      await api.patch(`/users/${u.id}`, { status: next });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl">Usuários</h1>
          <p className="mt-1 text-sm text-muted">Equipe com acesso ao painel. Acessos de barbeiros são criados no cadastro do barbeiro.</p>
        </div>
        {can('users:manage') && (
          <button className="btn-gold" onClick={() => setShowForm(true)}>
            <UserPlus className="h-4 w-4" /> Novo usuário
          </button>
        )}
      </header>

      {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      {showForm && (
        <UserForm
          units={units}
          isOwner={me.role === 'OWNER'}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-white/5 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-5 py-3 font-medium">Nome</th>
              <th className="px-5 py-3 font-medium">Função</th>
              <th className="px-5 py-3 font-medium">Unidades</th>
              <th className="px-5 py-3 font-medium">Situação</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {users === null && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-muted">Carregando…</td></tr>
            )}
            {users?.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-muted">Nenhum usuário.</td></tr>
            )}
            {users?.map((u) => (
              <tr key={u.id} className="border-b border-white/5 last:border-0">
                <td className="px-5 py-3">
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-muted">{u.email}</p>
                </td>
                <td className="px-5 py-3">{ROLE_LABELS[u.role]}</td>
                <td className="px-5 py-3 text-muted">
                  {u.role === 'OWNER' ? 'Todas' : u.unitIds.map(unitName).join(', ') || '—'}
                </td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${u.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-muted'}`}>
                    {u.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  {can('users:manage') && u.id !== me.id && u.role !== 'BARBER' && (
                    <button className="text-xs text-muted hover:text-gold" onClick={() => toggleStatus(u)}>
                      {u.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserForm({ units, isOwner, onClose, onSaved }) {
  const [serverError, setServerError] = useState('');
  const roles = isOwner ? ['MANAGER', 'RECEPTIONIST', 'OWNER'] : ['RECEPTIONIST'];
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(userSchema),
    defaultValues: { name: '', email: '', password: '', role: roles[0], unitIds: [] },
  });
  const role = watch('role');

  const onSubmit = async (data) => {
    setServerError('');
    try {
      await api.post('/users', { ...data, unitIds: data.role === 'OWNER' ? [] : data.unitIds });
      onSaved();
    } catch (e) {
      e.fields?.forEach((f) => setError(f.path, { message: f.message }));
      setServerError(e.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="card space-y-5 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl">Novo usuário</h2>
        <button type="button" aria-label="Fechar" onClick={onClose} className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="u-name">Nome</label>
          <input id="u-name" className="input" {...register('name')} />
          {errors.name && <p className="field-error">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="u-email">E-mail</label>
          <input id="u-email" type="email" className="input" autoComplete="off" {...register('email')} />
          {errors.email && <p className="field-error">{errors.email.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="u-pass">Senha inicial</label>
          <input id="u-pass" type="password" className="input" autoComplete="new-password" {...register('password')} />
          {errors.password && <p className="field-error">{errors.password.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="u-role">Função</label>
          <select id="u-role" className="input" {...register('role')}>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
      </div>

      {role !== 'OWNER' && (
        <fieldset>
          <legend className="label">Unidades com acesso</legend>
          {units.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma unidade disponível. Cadastre unidades primeiro (Fase 2).</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {units.map((u) => (
                <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm has-[:checked]:border-gold/60 has-[:checked]:bg-gold/10">
                  <input type="checkbox" value={u.id} className="accent-[rgb(var(--bp-accent))]" {...register('unitIds')} />
                  {u.name}
                </label>
              ))}
            </div>
          )}
          {errors.unitIds && <p className="field-error">{errors.unitIds.message}</p>}
        </fieldset>
      )}

      {serverError && <p role="alert" className="text-sm text-red-300">{serverError}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-gold" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Criar usuário
        </button>
      </div>
    </form>
  );
}
