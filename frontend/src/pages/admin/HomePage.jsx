import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { ChangePasswordCard } from '../../components/ChangePasswordCard.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { api } from '../../lib/api.js';
import { ROLE_LABELS } from '../../lib/schemas.js';

// Os dashboards com indicadores entram na Fase 9. Aqui só mostramos dados reais já disponíveis.
export default function HomePage() {
  const { user, company } = useAuth();
  const [units, setUnits] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/units').then(setUnits).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-gold">{company?.name}</p>
        <h1 className="mt-2 font-heading text-3xl sm:text-4xl">Olá, {user?.name?.split(' ')[0]}</h1>
        <p className="mt-2 text-muted">Você está conectado como {ROLE_LABELS[user?.role]?.toLowerCase()}.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-center gap-3 text-muted">
            <Building2 className="h-5 w-5 text-gold" /> Unidades no seu acesso
          </div>
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          {units === null && !error && <p className="mt-3 text-sm text-muted">Carregando…</p>}
          {units && units.length === 0 && (
            <p className="mt-3 text-sm text-muted">Nenhuma unidade cadastrada ainda. O cadastro de unidades chega na Fase 2.</p>
          )}
          {units && units.length > 0 && (
            <ul className="mt-3 space-y-1">
              {units.map((u) => (
                <li key={u.id} className="text-sm">{u.name}</li>
              ))}
            </ul>
          )}
        </div>
        <ChangePasswordCard />
      </section>
    </div>
  );
}
