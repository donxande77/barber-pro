import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, Building2, Scissors, CalendarDays, Wallet, BarChart3, Palette, LogOut, Menu, X, UserRound,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { Logo } from '../components/Logo.jsx';
import { ROLE_LABELS } from '../lib/schemas.js';

// "phase" indica módulos ainda não implementados: aparecem desabilitados, sem telas falsas.
const NAV = [
  { to: '/painel', label: 'Início', icon: LayoutDashboard, end: true },
  { to: '/painel/usuarios', label: 'Usuários', icon: Users, permission: 'users:read' },
  { label: 'Unidades', icon: Building2, permission: 'units:read', phase: 2 },
  { label: 'Site e aparência', icon: Palette, permission: 'site:manage', phase: 3 },
  { label: 'Barbeiros e serviços', icon: Scissors, permission: 'catalog:manage', phase: 4 },
  { label: 'Agenda', icon: CalendarDays, permission: 'appointments:read', phase: 5 },
  { label: 'Financeiro', icon: Wallet, permission: 'finance:unit:read', phase: 7 },
  { label: 'Meu financeiro', icon: Wallet, permission: 'finance:own:read', phase: 7 },
  { label: 'Relatórios', icon: BarChart3, permission: 'reports:unit', phase: 9 },
];

export default function AdminLayout() {
  const { user, company, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((i) => !i.permission || can(i.permission));

  const sidebar = (
    <nav aria-label="Menu principal" className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-6">
        <Logo />
        <div className="min-w-0">
          <p className="font-heading text-lg leading-tight">Barber Pro</p>
          <p className="truncate text-xs text-muted">{company?.name}</p>
        </div>
      </div>
      <ul className="flex-1 space-y-1 px-3">
        {items.map((item) =>
          item.phase ? (
            <li key={item.label}>
              <span className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted/50"
                title={`Disponível na Fase ${item.phase}`}>
                <item.icon className="h-4 w-4" /> {item.label}
                <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Fase {item.phase}</span>
              </span>
            </li>
          ) : (
            <li key={item.label}>
              <NavLink to={item.to} end={item.end} onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    isActive ? 'bg-gold/10 text-gold' : 'text-ink/80 hover:bg-white/5 hover:text-ink'
                  }`}>
                <item.icon className="h-4 w-4" /> {item.label}
              </NavLink>
            </li>
          ),
        )}
      </ul>
      <div className="border-t border-white/5 p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-graphite"><UserRound className="h-4 w-4 text-muted" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="text-xs text-muted">{ROLE_LABELS[user?.role]}</p>
          </div>
        </div>
        <button type="button" onClick={logout} className="btn-ghost w-full">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden border-r border-white/5 bg-surface lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Fechar menu" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-72 bg-surface">{sidebar}</aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="flex items-center gap-3 border-b border-white/5 px-4 py-3 lg:hidden">
          <button aria-label="Abrir menu" onClick={() => setOpen(true)} className="btn-ghost px-2.5">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="font-heading text-lg">Barber Pro</span>
        </header>
        <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
