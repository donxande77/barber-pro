import { Link } from 'react-router-dom';
import { Clock, MapPin, Phone, MessageCircle, Star, Camera, Tag } from 'lucide-react';
import { useSite } from './SiteContext.jsx';
import { brl, phoneBR, waLink, WEEKDAYS, minToHHMM, dateBR } from '../lib/format.js';

/** Seletor de unidade: o visitante escolhe antes de ver serviços, profissionais e horários. */
function UnitPicker({ compact = false }) {
  const { units, unitId, setUnitId } = useSite();
  if (units.length <= 1) return null;
  return (
    <div className={compact ? '' : 'card p-5'}>
      <p className="text-sm text-muted">{unitId ? 'Unidade' : 'Escolha a unidade para ver serviços, preços e horários'}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Unidade">
        {units.map((u) => (
          <button
            key={u.id}
            role="radio"
            aria-checked={u.id === unitId}
            onClick={() => setUnitId(u.id)}
            className={`rounded-full border px-4 py-2 text-sm transition ${u.id === unitId ? 'border-gold bg-gold text-gold-contrast' : 'border-white/15 hover:border-gold/60'}`}
          >
            {u.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Hero() {
  const { config, unit } = useSite();
  const { hero, brand } = config;
  return (
    <section className="relative overflow-hidden border-b border-white/5">
      {hero.imageUrl && (
        <>
          <img src={hero.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
          <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-bg/30" aria-hidden="true" />
        </>
      )}
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[auto_1fr] md:py-24">
        {/* Poste de barbeiro: assinatura visual da casa */}
        <div className="hidden w-5 overflow-hidden rounded-full ring-1 ring-white/10 md:block" aria-hidden="true">
          <div className="barber-pole h-full w-full" />
        </div>
        <div className="max-w-3xl">
          <p className="font-heading text-lg tracking-wide text-gold">{brand.name}</p>
          <h1 className="mt-4 font-heading text-5xl font-semibold leading-[0.95] sm:text-7xl">{hero.title || brand.tagline}</h1>
          {hero.subtitle && <p className="mt-6 max-w-xl text-lg text-ink/75">{hero.subtitle}</p>}
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link to="/agendar" className="btn-gold px-6 py-3 text-base">{hero.ctaLabel || 'Agendar horário'}</Link>
            <a href="#servicos" className="btn-ghost px-6 py-3 text-base">Ver serviços e preços</a>
          </div>
          {unit && (
            <p className="mt-6 flex items-center gap-2 text-sm text-muted">
              <MapPin className="h-4 w-4 text-gold" /> {unit.name}
            </p>
          )}
        </div>
      </div>
      <div className="barber-pole h-1.5 md:hidden" aria-hidden="true" />
    </section>
  );
}

function SectionTitle({ id, title, children }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4" id={id}>
      <h2 className="font-heading text-4xl font-semibold sm:text-5xl">{title}</h2>
      {children}
    </div>
  );
}

function NeedUnit() {
  return (
    <div className="max-w-xl">
      <UnitPicker />
    </div>
  );
}

function Services() {
  const { unitId, catalog } = useSite();
  if (!unitId) return <NeedUnit />;
  if (catalog.loading) return <p className="text-muted">Carregando serviços…</p>;
  if (catalog.error) return <p className="text-red-300">{catalog.error.message}</p>;
  const services = catalog.data?.services ?? [];
  if (!services.length) return <p className="text-muted">Os serviços desta unidade serão publicados em breve.</p>;
  const groups = services.reduce((acc, s) => {
    const k = s.category ?? 'Serviços';
    (acc[k] ??= []).push(s);
    return acc;
  }, {});
  return (
    <div className="grid gap-x-16 gap-y-12 md:grid-cols-2">
      {Object.entries(groups).map(([cat, items]) => (
        <div key={cat}>
          <h3 className="mb-5 border-b border-gold/40 pb-2 font-heading text-2xl text-gold">{cat}</h3>
          <ul className="space-y-6">
            {items.map((s) => (
              <li key={s.id} className="flex gap-4">
                {s.imageUrl && <img src={s.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" loading="lazy" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <span className="font-heading text-xl">{s.name}</span>
                    <span className="leader" aria-hidden="true" />
                    <span className="num font-heading text-xl">
                      {s.promo && <s className="mr-2 text-sm text-muted">{brl(s.regularPrice)}</s>}
                      {brl(s.price)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {s.durationMin} min{s.description ? ` · ${s.description}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Promotions() {
  const { catalog } = useSite();
  const promos = (catalog.data?.services ?? []).filter((s) => s.promo);
  if (!promos.length) return null;
  return (
    <section className="border-y border-gold/30 bg-gold/[0.06]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="flex items-center gap-3 font-heading text-3xl"><Tag className="h-6 w-6 text-gold" /> Promoções</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {promos.map((s) => (
            <li key={s.id} className="rounded-xl border border-gold/30 p-5">
              <p className="font-heading text-xl">{s.name}</p>
              <p className="mt-2 num">
                <s className="text-muted">{brl(s.regularPrice)}</s> <span className="ml-2 font-heading text-2xl text-gold">{brl(s.price)}</span>
              </p>
              <p className="mt-1 text-xs text-muted">Válida até {dateBR(s.promo.endsAt)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Monogram({ name, className = 'h-full w-full text-5xl' }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return (
    <div className={`grid place-items-center bg-graphite font-heading text-gold ${className}`} aria-hidden="true">
      {initials}
    </div>
  );
}

function Barbers() {
  const { unitId, catalog } = useSite();
  if (!unitId) return <NeedUnit />;
  const barbers = catalog.data?.barbers ?? [];
  if (catalog.loading) return <p className="text-muted">Carregando equipe…</p>;
  if (!barbers.length) return <p className="text-muted">Equipe em breve.</p>;
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {barbers.map((b) => (
        <li key={b.id} className="group overflow-hidden rounded-2xl border border-white/5 bg-surface">
          <div className="aspect-[4/5] max-w-full overflow-hidden">
            {b.photoUrl ? (
              <img src={b.photoUrl} alt={`Foto de ${b.name}`} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
            ) : (
              <Monogram name={b.name} />
            )}
          </div>
          <div className="p-5">
            <p className="font-heading text-2xl">{b.name}</p>
            {b.specialties?.length > 0 && <p className="mt-1 text-sm text-gold">{b.specialties.join(', ')}</p>}
            {b.bio && <p className="mt-3 text-sm text-muted">{b.bio}</p>}
            <Link to={`/agendar?barbeiro=${b.id}`} className="btn-ghost mt-5 w-full">Agendar com {b.name.split(' ')[0]}</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function About() {
  const { config } = useSite();
  const { about } = config;
  if (!about.text && !about.title) return null;
  return (
    <div className={`grid items-center gap-10 ${about.imageUrl ? 'md:grid-cols-2' : ''}`}>
      <div className="max-w-2xl">
        <h2 className="font-heading text-4xl font-semibold sm:text-5xl">{about.title}</h2>
        <p className="mt-6 whitespace-pre-line text-lg leading-relaxed text-ink/80">{about.text}</p>
      </div>
      {about.imageUrl && <img src={about.imageUrl} alt="" className="aspect-[4/3] max-w-full rounded-2xl object-cover" loading="lazy" />}
    </div>
  );
}

function Gallery() {
  const { config } = useSite();
  if (!config.gallery.length) return null;
  return (
    <ul className="columns-2 gap-3 md:columns-3 [&>li]:mb-3">
      {config.gallery.map((g, i) => (
        <li key={i} className="break-inside-avoid overflow-hidden rounded-xl">
          <figure>
            <img src={g.imageUrl} alt={g.caption || `Foto ${i + 1} da galeria`} className="w-full object-cover" loading="lazy" />
            {g.caption && <figcaption className="bg-surface px-3 py-2 text-xs text-muted">{g.caption}</figcaption>}
          </figure>
        </li>
      ))}
    </ul>
  );
}

function Products() {
  const { unitId, catalog } = useSite();
  const products = catalog.data?.products ?? [];
  if (!unitId || !products.length) return null;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.id} className="rounded-xl border border-white/5 bg-surface p-4">
          {p.imageUrl ? (
            <img src={p.imageUrl} alt={p.name} className="aspect-square w-full max-w-full rounded-lg object-cover" loading="lazy" />
          ) : (
            <div className="grid aspect-square place-items-center rounded-lg bg-graphite font-heading text-3xl text-muted" aria-hidden="true">{p.name[0]}</div>
          )}
          <p className="mt-3 font-heading text-lg">{p.name}</p>
          {p.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{p.description}</p>}
          <div className="mt-2 flex items-center justify-between">
            <span className="num font-heading text-lg text-gold">{brl(p.price)}</span>
            <span className={`text-xs ${p.available ? 'text-emerald-300' : 'text-muted'}`}>{p.available ? 'Disponível na unidade' : 'Esgotado'}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Stars({ value }) {
  return (
    <span className="flex gap-0.5 text-gold" aria-label={`${value} de 5 estrelas`}>
      {Array.from({ length: 5 }, (_, i) => <Star key={i} className={`h-4 w-4 ${i < value ? 'fill-current' : 'opacity-30'}`} />)}
    </span>
  );
}

function Reviews() {
  const { unitId, catalog } = useSite();
  const reviews = catalog.data?.reviews ?? [];
  if (!unitId || !reviews.length) return null;
  return (
    <>
      {catalog.data.rating && (
        <p className="-mt-4 mb-8 flex items-center gap-3 text-muted">
          <span className="font-heading text-4xl text-ink">{catalog.data.rating.average.toLocaleString('pt-BR')}</span>
          <Stars value={Math.round(catalog.data.rating.average)} />
          <span className="text-sm">{catalog.data.rating.count} avaliações de clientes atendidos</span>
        </p>
      )}
      <ul className="grid gap-4 md:grid-cols-3">
        {reviews.slice(0, 9).map((r) => (
          <li key={r.id} className="rounded-xl border border-white/5 p-5">
            <Stars value={r.rating} />
            {r.comment && <p className="mt-3 text-ink/85">“{r.comment}”</p>}
            <p className="mt-4 text-sm text-muted">{r.client} · atendido por {r.barber}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

function Units() {
  const { units, config } = useSite();
  if (!units.length) return <p className="text-muted">Unidades em breve.</p>;
  return (
    <ul className="grid gap-6 md:grid-cols-2">
      {units.map((u) => {
        const wa = waLink(u.whatsapp || config.social.whatsapp, `Olá! Gostaria de falar com a unidade ${u.name}.`);
        const address = [u.street && `${u.street}${u.number ? `, ${u.number}` : ''}`, u.district, u.city && `${u.city}${u.state ? `/${u.state}` : ''}`].filter(Boolean).join(' — ');
        return (
          <li key={u.id} className="card p-6">
            <p className="font-heading text-3xl">{u.name}</p>
            {address && (
              <a className="mt-3 flex gap-2 text-sm text-ink/80 hover:text-gold" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}>
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" /> {address}
              </a>
            )}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {u.phone && <span className="flex items-center gap-2"><Phone className="h-4 w-4 text-gold" /> {phoneBR(u.phone)}</span>}
              {wa && <a href={wa} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-gold"><MessageCircle className="h-4 w-4 text-gold" /> WhatsApp</a>}
              {u.instagramUrl && <a href={u.instagramUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-gold"><Camera className="h-4 w-4 text-gold" /> Instagram</a>}
            </div>
            <table className="mt-5 w-full text-sm">
              <caption className="mb-2 flex items-center gap-2 text-left text-muted"><Clock className="h-4 w-4 text-gold" /> Horários</caption>
              <tbody>
                {WEEKDAYS.map((d, i) => {
                  const h = u.hours.find((x) => x.weekday === i);
                  return (
                    <tr key={d} className="border-t border-white/5">
                      <th scope="row" className="py-1.5 text-left font-normal text-muted">{d}</th>
                      <td className="num py-1.5 text-right">{h ? `${minToHHMM(h.openMin)} – ${minToHHMM(h.closeMin)}` : 'Fechado'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </li>
        );
      })}
    </ul>
  );
}

function Policies() {
  const { config, unit, units } = useSite();
  const unitPolicy = unit?.cancellationPolicy;
  const text = unitPolicy || config.policies.cancellation;
  const hours = unit?.minCancelHours ?? units[0]?.minCancelHours;
  return (
    <div className="max-w-3xl text-ink/80">
      <h2 className="font-heading text-3xl text-ink">Política de cancelamento</h2>
      {text && <p className="mt-4 whitespace-pre-line">{text}</p>}
      {hours != null && (
        <p className="mt-4">
          Você pode cancelar pelo link recebido no agendamento até <strong className="text-ink">{hours} {hours === 1 ? 'hora' : 'horas'}</strong> antes do horário. Depois disso, fale com a unidade.
        </p>
      )}
    </div>
  );
}

const SECTIONS = {
  hero: () => <Hero />,
  about: () => <Wrap id="sobre"><About /></Wrap>,
  services: () => (
    <Wrap id="servicos" title="Serviços e preços" extra={<UnitPicker compact />}>
      <Services />
      <Link to="/agendar" className="btn-gold mt-10">Agendar horário</Link>
    </Wrap>
  ),
  promotions: () => <Promotions />,
  barbers: () => <Wrap id="barbeiros" title="Barbeiros"><Barbers /></Wrap>,
  gallery: () => <GalleryWrap />,
  products: () => <ProductsWrap />,
  reviews: () => <ReviewsWrap />,
  units: () => <Wrap id="unidades" title="Unidades"><Units /></Wrap>,
  policies: () => <Wrap id="politicas"><Policies /></Wrap>,
};

function Wrap({ id, title, extra, children }) {
  return (
    <section className="border-b border-white/5" aria-labelledby={title ? `${id}-t` : undefined}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
        {title && (
          <SectionTitle id={id} title={<span id={`${id}-t`}>{title}</span>}>{extra}</SectionTitle>
        )}
        {!title && <span id={id} />}
        {children}
      </div>
    </section>
  );
}

function GalleryWrap() {
  const { config } = useSite();
  if (!config.gallery.length) return null;
  return <Wrap id="galeria" title="Galeria"><Gallery /></Wrap>;
}
function ProductsWrap() {
  const { unitId, catalog } = useSite();
  if (!unitId || !catalog.data?.products?.length) return null;
  return <Wrap id="produtos" title="Produtos"><Products /></Wrap>;
}
function ReviewsWrap() {
  const { unitId, catalog } = useSite();
  if (!unitId || !catalog.data?.reviews?.length) return null;
  return <Wrap id="avaliacoes" title="O que dizem os clientes"><Reviews /></Wrap>;
}

export default function HomePage() {
  const { config } = useSite();
  return (
    <main>
      {config.sections.map((key) => {
        const Section = SECTIONS[key];
        return Section ? <Section key={key} /> : null;
      })}
    </main>
  );
}
