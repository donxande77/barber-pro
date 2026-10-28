import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, MapPin, Phone, Camera, Globe, MessageCircle } from 'lucide-react';
import { useSite } from './SiteContext.jsx';
import { Logo } from '../components/Logo.jsx';
import { phoneBR, waLink } from '../lib/format.js';

export function BrandMark({ config, className = 'h-9 w-9' }) {
  if (config?.brand.logoUrl) return <img src={config.brand.logoUrl} alt="" className={`${className} object-contain`} />;
  return <Logo className={className} />;
}

export default function PublicLayout() {
  const { config, error, isPreview, unit, units } = useSite();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const onHome = pathname === '/';

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <p className="font-heading text-3xl">Site indisponível no momento</p>
          <p className="mt-3 text-muted">{error.message} Tente novamente em instantes.</p>
        </div>
      </main>
    );
  }
  if (!config) {
    return <div className="grid min-h-screen place-items-center text-muted" role="status">Carregando…</div>;
  }

  const anchor = (id) => (onHome ? `#${id}` : `/#${id}`);
  const links = [
    ['Serviços', 'servicos'],
    ['Barbeiros', 'barbeiros'],
    ...(config.gallery.length ? [['Galeria', 'galeria']] : []),
    ['Unidades', 'unidades'],
  ];
  const whatsapp = unit?.whatsapp || config.social.whatsapp;

  return (
    <div className="flex min-h-screen flex-col">
      {isPreview && (
        <div className="sticky top-0 z-50 bg-gold px-4 py-1.5 text-center text-xs font-semibold text-gold-contrast">
          Pré-visualização do rascunho — ainda não publicado
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <BrandMark config={config} />
            <span className="truncate font-heading text-xl tracking-wide">{config.brand.name}</span>
          </Link>
          <nav aria-label="Seções do site" className="ml-auto hidden items-center gap-7 text-sm text-ink/80 md:flex">
            {links.map(([label, id]) => (
              <a key={id} href={anchor(id)} className="hover:text-gold">{label}</a>
            ))}
          </nav>
          <Link to="/agendar" className="btn-gold ml-auto md:ml-0">{config.hero.ctaLabel || 'Agendar'}</Link>
          <button className="btn-ghost px-2.5 md:hidden" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <nav aria-label="Menu" className="border-t border-white/5 px-4 pb-4 md:hidden">
            {links.map(([label, id]) => (
              <a key={id} href={anchor(id)} onClick={() => setOpen(false)} className="block py-3 text-lg font-heading">
                {label}
              </a>
            ))}
          </nav>
        )}
      </header>

      <div className="flex-1">
        <Outlet />
      </div>

      <footer className="border-t border-white/5 bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <BrandMark config={config} />
              <span className="font-heading text-2xl">{config.brand.name}</span>
            </div>
            {config.brand.tagline && <p className="mt-3 max-w-sm text-sm text-muted">{config.brand.tagline}</p>}
            <div className="mt-5 flex gap-3">
              {config.social.instagram && <a className="btn-ghost px-2.5" href={config.social.instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><Camera className="h-4 w-4" /></a>}
              {config.social.facebook && <a className="btn-ghost px-2.5" href={config.social.facebook} target="_blank" rel="noreferrer" aria-label="Facebook"><Globe className="h-4 w-4" /></a>}
              {whatsapp && <a className="btn-ghost px-2.5" href={waLink(whatsapp)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle className="h-4 w-4" /></a>}
            </div>
          </div>
          <div>
            <p className="font-heading text-lg">Unidades</p>
            <ul className="mt-3 space-y-3 text-sm text-muted">
              {units.map((u) => (
                <li key={u.id}>
                  <p className="text-ink">{u.name}</p>
                  {u.street && <p className="flex gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{u.street}{u.number ? `, ${u.number}` : ''}{u.city ? ` — ${u.city}` : ''}</p>}
                  {u.phone && <p className="flex gap-1.5"><Phone className="mt-0.5 h-3.5 w-3.5 shrink-0" />{phoneBR(u.phone)}</p>}
                </li>
              ))}
            </ul>
          </div>
          <div className="text-sm text-muted">
            <p className="font-heading text-lg text-ink">Informações</p>
            <ul className="mt-3 space-y-2">
              <li><Link to="/agendar" className="hover:text-gold">Agendar horário</Link></li>
              <li><a href={anchor('politicas')} className="hover:text-gold">Política de cancelamento</a></li>
              <li><Link to="/privacidade" className="hover:text-gold">Privacidade</Link></li>
              <li><NavLink to="/entrar" className="hover:text-gold">Área da equipe</NavLink></li>
            </ul>
          </div>
        </div>
        <p className="border-t border-white/5 px-4 py-5 text-center text-xs text-muted">
          © {new Date().getFullYear()} {config.brand.name}
        </p>
      </footer>
    </div>
  );
}
