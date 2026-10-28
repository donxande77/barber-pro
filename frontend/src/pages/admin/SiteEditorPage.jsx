import { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Eye, EyeOff, Trash2, ExternalLink, RotateCcw } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { dateTimeBR } from '../../lib/format.js';
import { FONT_STACKS } from '../../lib/theme.js';
import { PageHeader, Spinner, Alert, Tabs, Field, ImageInput, Pill, ConfirmButton } from '../../components/ui.jsx';

const SECTION_LABELS = {
  hero: 'Banner principal', about: 'Sobre a barbearia', services: 'Serviços e preços', promotions: 'Promoções', barbers: 'Barbeiros',
  gallery: 'Galeria de cortes', products: 'Produtos', reviews: 'Avaliações', units: 'Unidades, endereço e horários', policies: 'Política de cancelamento',
};
const COLOR_LABELS = {
  background: 'Fundo', surface: 'Superfície (cartões)', graphite: 'Grafite', text: 'Texto', muted: 'Texto secundário', accent: 'Destaque (dourado)', accentContrast: 'Texto sobre o destaque',
};

export default function SiteEditorPage() {
  const published = useApi('/site/published');
  const draft = useApi('/site/draft');
  const versions = useApi('/site/versions');
  const [cfg, setCfg] = useState(null);
  const [note, setNote] = useState('');
  const [tab, setTab] = useState('brand');
  const [msg, setMsg] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (cfg || published.loading || draft.loading) return;
    const base = draft.data?.data ?? published.data;
    if (base) setCfg(structuredClone(base));
  }, [cfg, published, draft]);

  if (!cfg) return <Spinner />;
  const up = (path, value) => {
    const next = structuredClone(cfg);
    let o = next;
    const keys = path.split('.');
    keys.slice(0, -1).forEach((k) => (o = o[k]));
    o[keys.at(-1)] = value;
    setCfg(next);
    setDirty(true);
  };
  const flash = (ok, t) => setMsg({ ok, t });

  const saveDraft = async () => {
    try {
      await api.put('/site/draft', { data: cfg, note: note || undefined });
      setDirty(false);
      draft.reload();
      versions.reload();
      flash(true, 'Rascunho salvo. Use "Pré-visualizar" para conferir antes de publicar.');
      return true;
    } catch (e) {
      flash(false, e.fields?.length ? e.fields.map((f) => `${f.path}: ${f.message}`).join(' · ') : e.message);
      return false;
    }
  };
  const publish = async () => {
    if (dirty && !(await saveDraft())) return;
    try {
      await api.post('/site/publish');
      draft.reload();
      versions.reload();
      published.reload();
      flash(true, 'Publicado. O site já mostra a nova versão.');
    } catch (e) {
      flash(false, e.message);
    }
  };
  const preview = async () => {
    if (dirty && !(await saveDraft())) return;
    window.open('/?preview=draft', '_blank', 'noopener');
  };

  const sectionsOn = cfg.sections;
  const allSections = [...sectionsOn, ...Object.keys(SECTION_LABELS).filter((s) => !sectionsOn.includes(s))];
  const move = (key, dir) => {
    const arr = [...sectionsOn];
    const i = arr.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    up('sections', arr);
  };

  return (
    <>
      <PageHeader
        title="Site e aparência"
        subtitle="Edite marca, cores, textos, imagens e a ordem das seções. Salve como rascunho, pré-visualize e publique. Versões anteriores podem ser restauradas."
        actions={
          <>
            <button className="btn-ghost" onClick={preview}><ExternalLink className="h-4 w-4" /> Pré-visualizar</button>
            <button className="btn-ghost" onClick={saveDraft} disabled={!dirty}>Salvar rascunho</button>
            <button className="btn-gold" onClick={publish}>Publicar</button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        {draft.data ? <Pill tone="amber">Rascunho v{draft.data.version} em edição</Pill> : <Pill tone="green">Editando a partir da versão publicada</Pill>}
        {dirty && <span className="text-amber-300">Alterações não salvas</span>}
        <input className="input w-64 py-1.5" placeholder="Nota da versão (opcional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Nota da versão" />
      </div>
      {msg && <div className="mb-4"><Alert tone={msg.ok ? 'ok' : 'error'}>{msg.t}</Alert></div>}

      <Tabs value={tab} onChange={setTab} tabs={[['brand', 'Marca e cores'], ['home', 'Banner e textos'], ['sections', 'Seções'], ['gallery', 'Galeria'], ['social', 'Contatos e políticas'], ['versions', 'Versões']]} />

      {tab === 'brand' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card space-y-4 p-5">
            <Field label="Nome da marca" id="se-name"><input id="se-name" className="input" value={cfg.brand.name} onChange={(e) => up('brand.name', e.target.value)} /></Field>
            <Field label="Frase de apresentação" id="se-tag"><input id="se-tag" className="input" value={cfg.brand.tagline} onChange={(e) => up('brand.tagline', e.target.value)} /></Field>
            <ImageInput id="se-logo" label="Logotipo (PNG com fundo transparente fica melhor)" value={cfg.brand.logoUrl} onChange={(v) => up('brand.logoUrl', v)} />
            <div className="grid grid-cols-2 gap-3">
              {['heading', 'body'].map((k) => (
                <Field key={k} label={k === 'heading' ? 'Fonte dos títulos' : 'Fonte do texto'} id={`se-f-${k}`}>
                  <select id={`se-f-${k}`} className="input" value={cfg.fonts[k]} onChange={(e) => up(`fonts.${k}`, e.target.value)}>
                    {Object.keys(FONT_STACKS).map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Field>
              ))}
            </div>
          </section>
          <section className="card p-5">
            <h2 className="mb-4 font-heading text-xl">Cores</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {Object.entries(COLOR_LABELS).map(([k, label]) => (
                <li key={k} className="flex items-center gap-3">
                  <input type="color" value={cfg.colors[k]} onChange={(e) => up(`colors.${k}`, e.target.value)} className="h-10 w-12 cursor-pointer rounded border border-white/10 bg-transparent" aria-label={label} />
                  <div className="min-w-0">
                    <p className="text-sm">{label}</p>
                    <input className="input mt-1 py-1 font-mono text-xs" value={cfg.colors[k]} onChange={(e) => up(`colors.${k}`, e.target.value)} aria-label={`${label} (hexadecimal)`} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-xl p-5" style={{ background: cfg.colors.background, color: cfg.colors.text, fontFamily: FONT_STACKS[cfg.fonts.body] }}>
              <p style={{ fontFamily: FONT_STACKS[cfg.fonts.heading], fontSize: 28, lineHeight: 1 }}>{cfg.brand.name}</p>
              <p style={{ color: cfg.colors.muted }} className="mt-2 text-sm">{cfg.brand.tagline}</p>
              <span className="mt-4 inline-block rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: cfg.colors.accent, color: cfg.colors.accentContrast }}>{cfg.hero.ctaLabel}</span>
            </div>
          </section>
        </div>
      )}

      {tab === 'home' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card space-y-4 p-5">
            <h2 className="font-heading text-xl">Banner principal</h2>
            <Field label="Título" id="se-ht"><input id="se-ht" className="input" value={cfg.hero.title} onChange={(e) => up('hero.title', e.target.value)} /></Field>
            <Field label="Subtítulo" id="se-hs"><textarea id="se-hs" rows={3} className="input" value={cfg.hero.subtitle} onChange={(e) => up('hero.subtitle', e.target.value)} /></Field>
            <Field label="Texto do botão" id="se-cta"><input id="se-cta" className="input" value={cfg.hero.ctaLabel} onChange={(e) => up('hero.ctaLabel', e.target.value)} /></Field>
            <ImageInput id="se-hi" label="Imagem de fundo do banner" value={cfg.hero.imageUrl} onChange={(v) => up('hero.imageUrl', v)} />
          </section>
          <section className="card space-y-4 p-5">
            <h2 className="font-heading text-xl">Sobre a barbearia</h2>
            <Field label="Título" id="se-at"><input id="se-at" className="input" value={cfg.about.title} onChange={(e) => up('about.title', e.target.value)} /></Field>
            <Field label="Texto" id="se-ax"><textarea id="se-ax" rows={7} className="input" value={cfg.about.text} onChange={(e) => up('about.text', e.target.value)} /></Field>
            <ImageInput id="se-ai" label="Foto do ambiente" value={cfg.about.imageUrl} onChange={(v) => up('about.imageUrl', v)} />
          </section>
        </div>
      )}

      {tab === 'sections' && (
        <section className="card max-w-xl p-5">
          <p className="mb-4 text-sm text-muted">Ordem das seções na página inicial. Seções ocultas não aparecem no site. Serviços, barbeiros e produtos vêm dos cadastros.</p>
          <ul className="space-y-2">
            {allSections.map((key) => {
              const on = sectionsOn.includes(key);
              const i = sectionsOn.indexOf(key);
              return (
                <li key={key} className={`flex items-center gap-2 rounded-lg border p-3 ${on ? 'border-white/10' : 'border-dashed border-white/10 opacity-60'}`}>
                  <span className="flex-1 text-sm">{SECTION_LABELS[key]}</span>
                  {on && <button className="btn-ghost btn-sm" aria-label="Subir" disabled={i === 0} onClick={() => move(key, -1)}><ArrowUp className="h-3.5 w-3.5" /></button>}
                  {on && <button className="btn-ghost btn-sm" aria-label="Descer" disabled={i === sectionsOn.length - 1} onClick={() => move(key, 1)}><ArrowDown className="h-3.5 w-3.5" /></button>}
                  <button className="btn-ghost btn-sm" aria-label={on ? 'Ocultar' : 'Mostrar'} onClick={() => up('sections', on ? sectionsOn.filter((s) => s !== key) : [...sectionsOn, key])}>
                    {on ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === 'gallery' && (
        <section className="card p-5">
          <p className="mb-4 text-sm text-muted">Fotos de cortes, ferramentas e ambiente. Use fotos próprias, em boa resolução (PNG, JPG ou WEBP até 5 MB).</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cfg.gallery.map((g, i) => (
              <li key={i} className="rounded-xl border border-white/10 p-3">
                <img src={g.imageUrl} alt="" className="aspect-[4/3] w-full max-w-full rounded-lg object-cover" />
                <input className="input mt-2 py-1.5" placeholder="Legenda" value={g.caption} onChange={(e) => up('gallery', cfg.gallery.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} aria-label={`Legenda da foto ${i + 1}`} />
                <button className="mt-2 flex items-center gap-1 text-xs text-muted hover:text-red-300" onClick={() => up('gallery', cfg.gallery.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /> Remover</button>
              </li>
            ))}
            <li className="grid place-items-center rounded-xl border border-dashed border-white/10 p-6">
              <ImageInput id="se-g-new" label="Adicionar foto" value={null} onChange={(v) => v && up('gallery', [...cfg.gallery, { imageUrl: v, caption: '' }])} />
            </li>
          </ul>
        </section>
      )}

      {tab === 'social' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card space-y-4 p-5">
            <h2 className="font-heading text-xl">Redes e WhatsApp</h2>
            {['instagram', 'facebook', 'tiktok'].map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)} id={`se-${k}`}><input id={`se-${k}`} className="input" placeholder="https://…" value={cfg.social[k] ?? ''} onChange={(e) => up(`social.${k}`, e.target.value || null)} /></Field>
            ))}
            <Field label="WhatsApp geral (com DDD)" id="se-wa" hint="Cada unidade pode ter o próprio WhatsApp no cadastro da unidade."><input id="se-wa" className="input" value={cfg.social.whatsapp ?? ''} onChange={(e) => up('social.whatsapp', e.target.value || null)} /></Field>
          </section>
          <section className="card space-y-4 p-5">
            <h2 className="font-heading text-xl">Política de cancelamento geral</h2>
            <textarea rows={8} className="input" value={cfg.policies.cancellation} onChange={(e) => up('policies.cancellation', e.target.value)} aria-label="Política de cancelamento" />
            <p className="text-xs text-muted">O prazo para cancelar online é definido em cada unidade.</p>
          </section>
        </div>
      )}

      {tab === 'versions' && (
        <section className="card p-5">
          <ul className="divide-y divide-white/5 text-sm">
            {versions.data?.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="num w-10 font-heading text-lg">v{v.version}</span>
                <Pill tone={v.status === 'PUBLISHED' ? 'green' : v.status === 'DRAFT' ? 'amber' : 'gray'}>{v.status === 'PUBLISHED' ? 'Publicada' : v.status === 'DRAFT' ? 'Rascunho' : 'Anterior'}</Pill>
                <span className="flex-1 text-muted">{v.note ?? ''} · {dateTimeBR(v.publishedAt ?? v.createdAt)}</span>
                {v.status === 'ARCHIVED' && !draft.data && (
                  <ConfirmButton question="Restaurar esta versão como novo rascunho? Nada é apagado." confirmText="Restaurar" onConfirm={async () => { const d = await api.post(`/site/versions/${v.id}/restore`); setCfg(d.data); setDirty(false); draft.reload(); versions.reload(); flash(true, 'Versão restaurada como rascunho. Revise e publique.'); }}>
                    <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                  </ConfirmButton>
                )}
                {v.status === 'DRAFT' && (
                  <ConfirmButton danger question="Descartar o rascunho?" confirmText="Descartar" onConfirm={async () => { await api.delete('/site/draft'); setCfg(structuredClone(published.data)); setDirty(false); draft.reload(); versions.reload(); }}>Descartar</ConfirmButton>
                )}
              </li>
            ))}
            {!versions.data?.length && <li className="py-3 text-muted">Nenhuma versão salva ainda. O site usa a aparência padrão.</li>}
          </ul>
          {draft.data && <p className="mt-3 text-xs text-muted">Para restaurar uma versão anterior, publique ou descarte o rascunho atual.</p>}
        </section>
      )}
    </>
  );
}
