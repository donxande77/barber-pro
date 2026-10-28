import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, Scissors } from 'lucide-react';
import { api } from '../lib/api.js';
import { qs } from '../lib/useApi.js';
import { brl } from '../lib/format.js';
import { useSite } from './SiteContext.jsx';

/** Busca as publicações do mural (filtradas pela unidade escolhida, se houver). */
function usePosts({ tag, barberId } = {}) {
  const { unitId } = useSite();
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    api
      .get(`/public/posts${qs({ unitId, tag, barberId })}`)
      .then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((error) => alive && setState({ loading: false, data: null, error }));
    return () => {
      alive = false;
    };
  }, [unitId, tag, barberId]);
  return state;
}

/** Cartão: mostra o "depois"; tocar/passar o mouse revela o "antes" quando houver duas fotos. */
function PostCard({ post, onOpen }) {
  const hasBefore = post.imageUrls.length >= 2;
  const after = post.imageUrls[hasBefore ? 1 : 0];
  return (
    <li className="break-inside-avoid">
      <button onClick={() => onOpen(post)} className="group relative block w-full overflow-hidden rounded-xl text-left ring-1 ring-white/5 focus-visible:ring-gold" aria-label={`Ver ${post.title}`}>
        <img src={after} alt="" loading="lazy" className="w-full object-cover transition duration-500 group-hover:opacity-0" />
        {hasBefore && (
          <img src={post.imageUrls[0]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:opacity-100" />
        )}
        {hasBefore && (
          <span className="absolute left-2 top-2 rounded bg-bg/80 px-2 py-0.5 text-[11px] text-ink/90 transition group-hover:opacity-0">depois</span>
        )}
        {hasBefore && (
          <span className="absolute left-2 top-2 rounded bg-gold px-2 py-0.5 text-[11px] text-gold-contrast opacity-0 transition group-hover:opacity-100">antes</span>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg/70 to-transparent px-3 pb-3 pt-10">
          <span className="block font-heading text-lg leading-tight">{post.title}</span>
          <span className="block text-xs text-ink/70">
            {post.barber ? post.barber.name : 'Equipe'}{post.estimate ? ` · a partir de ${brl(post.estimate)}` : ''}
          </span>
        </span>
      </button>
    </li>
  );
}

export function PostModal({ post, onClose }) {
  const navigate = useNavigate();
  const [i, setI] = useState(post.imageUrls.length >= 2 ? 1 : 0);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  const n = post.imageUrls.length;
  const label = n === 2 ? (i === 0 ? 'Antes' : 'Depois') : `${i + 1} de ${n}`;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={post.title}>
      <button className="absolute inset-0 bg-black/80" aria-label="Fechar" onClick={onClose} tabIndex={-1} />
      <div className="relative grid max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-surface sm:max-w-4xl sm:grid-cols-[1.2fr_1fr] sm:rounded-2xl">
        <div className="relative bg-black">
          <img src={post.imageUrls[i]} alt={`${post.title} — ${label}`} className="max-h-[60vh] w-full object-contain sm:max-h-[80vh]" />
          {n > 1 && (
            <>
              <button className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-bg/70 p-2" aria-label="Foto anterior" onClick={() => setI((i - 1 + n) % n)}><ChevronLeft className="h-5 w-5" /></button>
              <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-bg/70 p-2" aria-label="Próxima foto" onClick={() => setI((i + 1) % n)}><ChevronRight className="h-5 w-5" /></button>
              <span className="absolute left-3 top-3 rounded bg-gold px-2 py-0.5 text-xs font-semibold text-gold-contrast">{label}</span>
            </>
          )}
        </div>
        <div className="flex flex-col gap-4 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-heading text-3xl leading-tight">{post.title}</h3>
            <button onClick={onClose} aria-label="Fechar" className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>
          </div>
          {post.description && <p className="text-ink/80">{post.description}</p>}
          {post.tags.length > 0 && <p className="flex flex-wrap gap-1.5">{post.tags.map((t) => <span key={t} className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs">{t}</span>)}</p>}
          <dl className="space-y-2 text-sm">
            {post.barber && <div className="flex gap-2"><dt className="text-muted">Feito por</dt><dd>{post.barber.name}</dd></div>}
            {post.unit && <div className="flex gap-2"><dt className="text-muted">Unidade</dt><dd>{post.unit.name}</dd></div>}
            {post.services?.length > 0 && <div className="flex gap-2"><dt className="text-muted">Serviços</dt><dd>{post.services.map((s) => s.name).join(' + ')}</dd></div>}
            {post.estimate && <div className="flex gap-2"><dt className="text-muted">Valor</dt><dd className="num font-heading text-xl text-gold">{brl(post.estimate)}</dd></div>}
          </dl>
          <button className="btn-gold mt-auto py-3 text-base" onClick={() => navigate(`/agendar?corte=${post.id}`)}>
            <Scissors className="h-4 w-4" /> Quero este corte
          </button>
          <p className="text-xs text-muted">Ao agendar, o profissional recebe esta foto como referência.</p>
        </div>
      </div>
    </div>
  );
}

function MuralGrid({ limit, showFilters = true }) {
  const [tag, setTag] = useState('');
  const [open, setOpen] = useState(null);
  const { data, loading, error } = usePosts({ tag: tag || undefined });
  const posts = limit ? data?.posts.slice(0, limit) : data?.posts;
  if (loading && !data) return <p className="text-muted">Carregando cortes…</p>;
  if (error) return <p className="text-red-300">{error.message}</p>;
  if (!data?.posts.length && !tag) return <p className="text-muted">Em breve, os trabalhos da nossa equipe aqui.</p>;
  return (
    <>
      {showFilters && data.tags.length > 1 && (
        <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Estilo">
          {['', ...data.tags].map((t) => (
            <button key={t || 'todos'} role="radio" aria-checked={tag === t} onClick={() => setTag(t)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${tag === t ? 'border-gold bg-gold text-gold-contrast' : 'border-white/15 hover:border-gold/60'}`}>
              {t || 'Todos'}
            </button>
          ))}
        </div>
      )}
      <ul className="columns-2 gap-3 md:columns-3 lg:columns-4 [&>li]:mb-3">
        {posts.map((p) => <PostCard key={p.id} post={p} onOpen={setOpen} />)}
      </ul>
      {!posts.length && <p className="text-muted">Nenhum corte com este estilo.</p>}
      {open && <PostModal post={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Seção da página inicial. */
export function MuralSection() {
  return (
    <section className="border-b border-white/5" aria-labelledby="mural-t">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4" id="mural">
          <div>
            <h2 id="mural-t" className="font-heading text-4xl font-semibold sm:text-5xl">Mural de cortes</h2>
            <p className="mt-2 max-w-xl text-ink/70">Trabalhos feitos aqui. Gostou de um? Toque e agende com a foto como referência.</p>
          </div>
          <Link to="/mural" className="btn-ghost">Ver o mural completo</Link>
        </div>
        <MuralGrid limit={8} showFilters={false} />
      </div>
    </section>
  );
}

/** Página dedicada /mural. */
export function MuralPage() {
  const { units, unitId, setUnitId } = useSite();
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="font-heading text-5xl font-semibold">Mural de cortes</h1>
      <p className="mt-3 max-w-2xl text-ink/75">Escolha um estilo, veja o antes e depois e agende o mesmo corte com o profissional que fez.</p>
      {units.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-2" role="radiogroup" aria-label="Unidade">
          <button role="radio" aria-checked={!unitId} onClick={() => setUnitId(null)} className={`rounded-full border px-4 py-1.5 text-sm ${!unitId ? 'border-gold text-gold' : 'border-white/15'}`}>Todas as unidades</button>
          {units.map((u) => (
            <button key={u.id} role="radio" aria-checked={u.id === unitId} onClick={() => setUnitId(u.id)} className={`rounded-full border px-4 py-1.5 text-sm ${u.id === unitId ? 'border-gold text-gold' : 'border-white/15'}`}>{u.name}</button>
          ))}
        </div>
      )}
      <div className="mt-8"><MuralGrid /></div>
    </main>
  );
}
