import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Building2, Scissors, CalendarDays, Wallet, BarChart3, Palette, LogOut, Menu, X, UserRound,
  Receipt, Contact, Package, HandCoins, Star, ShieldCheck, ExternalLink, KeyRound,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { UnitProvider, UnitSelect, useUnit } from '../auth/UnitContext.jsx';
import { Logo } from '../components/Logo.jsx';
import { ROLE_LABELS } from '../lib/schemas.js';
import { resetTheme } from '../lib/theme.js';

const NAV = [
  { group: 'Operação' },
  { to: '/painel', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/painel/agenda', label: 'Agenda', icon: CalendarDays, permission: 'appointments:read' },
  { to: '/painel/atendimentos', label: 'Atendimentos e vendas', icon: Receipt, permission: 'sales:manage' },
  { to: '/painel/clientes', label: 'Clientes', icon: Contact, permission: 'clients:read' },
  { to: '/painel/meu-financeiro', label: 'Meu financeiro', icon: Wallet, permission: 'finance:own:read' },
  { group: 'Cadastros', permission: 'barbers:manage' },
  { to: '/painel/barbeiros', label: 'Barbeiros', icon: Scissors, permission: 'barbers:manage' },
  { to: '/painel/servicos', label: 'Serviços e preços', icon: Scissors, permission: 'catalog:manage' },
  { to: '/painel/produtos', label: 'Produtos e estoque', icon: Package, permission: 'stock:manage' },
  { group: 'Gestão', permission: 'finance:unit:read' },
  { to: '/painel/financeiro', label: 'Financeiro', icon: Wallet, permission: 'finance:unit:read' },
  { to: '/painel/remuneracao', label: 'Remuneração', icon: HandCoins, permission: 'payouts:manage' },
  { to: '/painel/relatorios', label: 'Relatórios', icon: BarChart3, permission: 'reports:barber' },
  { to: '/painel/avaliacoes', label: 'Avaliações', icon: Star, permission: 'reviews:moderate' },
  { group: 'Configurações', permission: 'units:update' },
  { to: '/painel/unidades', label: 'Unidades', icon: Building2, permission: 'units:update' },
  { to: '/painel/site', label: 'Site e aparência', icon: Palette, permission: 'site:manage' },
  { to: '/painel/usuarios', label: 'Usuários', icon: Users, permission: 'users:read' },
  { to: '/painel/auditoria', label: 'Auditoria', icon: ShieldCheck, permission: 'audit:read' },
];

function Sidebar({ onNavigate }) {
  const { user, company, can, logout } = useAuth();
  const items = NAV.filter((i) => !i.permission || can(i.permission));
  return (
    <nav aria-label="Menu principal" className="flex h-full flex-col">
      <Link to="/painel" className="flex items-center gap-3 px-5 py-5" onClick={onNavigate}>
        <Logo />
        <div className="min-w-0">
          <p className="font-heading text-lg leading-tight tracking-wide">Barber Pro</p>
          <p className="truncate text-xs text-muted">{company?.name}</p>
        </div>
      </Link>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items.map((item, i) =>
          item.group ? (
            <li key={item.group} className={`px-3 pb-1 text-[11px] text-muted/70 ${i ? 'pt-4' : ''}`}>{item.group}</li>
          ) : (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-gold/10 text-gold' : 'text-ink/80 hover:bg-white/5 hover:text-ink'}`}
              >
                <item.icon className="h-4 w-4 shrink-0" /> {item.label}
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
        <div className="grid grid-cols-2 gap-2">
          <Link to="/painel/minha-conta" onClick={onNavigate} className="btn-ghost btn-sm"><KeyRound className="h-3.5 w-3.5" /> Conta</Link>
          <button type="button" onClick={logout} className="btn-ghost btn-sm"><LogOut className="h-3.5 w-3.5" /> Sair</button>
        </div>
      </div>
    </nav>
  );
}

function TopBar({ onMenu }) {
  const { units } = useUnit();
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/5 bg-bg/90 px-4 py-2.5 backdrop-blur sm:px-6">
      <button aria-label="Abrir menu" onClick={onMenu} className="btn-ghost px-2.5 lg:hidden"><Menu className="h-5 w-5" /></button>
      {units.length > 1 && (
        <div className="w-44 sm:w-56">
          <UnitSelect />
        </div>
      )}
      {units.length === 1 && <p className="truncate text-sm text-muted">{units[0].name}</p>}
      <a href="/" target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1.5 text-xs text-muted hover:text-gold">
        Ver site <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </header>
  );
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => resetTheme(), []);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <UnitProvider>
      <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
        <aside className="hidden h-screen border-r border-white/5 bg-surface lg:sticky lg:top-0 lg:block"><Sidebar /></aside>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button aria-label="Fechar menu" className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
            <aside className="relative h-full w-72 max-w-[85vw] bg-surface">
              <button aria-label="Fechar menu" onClick={() => setOpen(false)} className="absolute right-3 top-5 text-muted"><X className="h-5 w-5" /></button>
              <Sidebar onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}
        <div className="min-w-0">
          <TopBar onMenu={() => setOpen(true)} />
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </UnitProvider>
  );
}
