import { useState } from 'react';
import { Plus, Star, Pencil } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useUnit } from '../../auth/UnitContext.jsx';
import { api } from '../../lib/api.js';
import { useApi, qs } from '../../lib/useApi.js';
import { PageHeader, Spinner, Alert, Modal, Field, Pill, ImageInput, Empty, ConfirmButton, Tabs } from '../../components/ui.jsx';

const STATUS = { PENDING: ['Aguardando aprovação', 'amber'], PUBLISHED: ['Publicado', 'green'], HIDDEN: ['Oculto', 'gray'] };

export default function MuralAdminPage() {
  const { can } = useAuth();
  const manage = can('mural:manage');
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useApi(`/posts${qs({ status })}`);
  const [editing, setEditing] = useState(null);
  const setPostStatus = async (p, s) => {
    await api.patch(`/posts/${p.id}`, { status: s });
    reload();
  };
  const pending = data?.filter((p) => p.status === 'PENDING').length ?? 0;

  return (
    <>
      <PageHeader
        title="Mural de cortes"
        subtitle={manage
          ? 'Publique trabalhos da equipe com fotos de antes e depois. O cliente escolhe um corte no site e agenda com a foto como referência.'
          : 'Envie fotos dos seus cortes. Eles aparecem no site depois da aprovação da gerência.'}
        actions={<button className="btn-gold" onClick={() => setEditing({})}><Plus className="h-4 w-4" /> {manage ? 'Publicar corte' : 'Enviar corte'}</button>}
      />
      <Tabs value={status} onChange={setStatus} tabs={[['', 'Todos'], ['PENDING', `Aguardando aprovação${pending && !status ? ` (${pending})` : ''}`], ['PUBLISHED', 'Publicados'], ['HIDDEN', 'Ocultos']]} />
      {loading && !data && <Spinner />}
      <Alert>{error?.message}</Alert>
      {data && !data.length && <Empty title="Nenhum corte aqui" action={<button className="btn-gold" onClick={() => setEditing({})}>Adicionar o primeiro</button>}>Fotos bem iluminadas, de frente e de lado, valorizam o trabalho. Duas fotos viram "antes e depois".</Empty>}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data?.map((p) => (
          <li key={p.id} className="card overflow-hidden">
            <div className="relative grid grid-cols-2 gap-px bg-black">
              {p.imageUrls.slice(0, 2).map((u, i) => (
                <img key={u + i} src={u} alt="" className={`aspect-square w-full object-cover ${p.imageUrls.length === 1 ? 'col-span-2 aspect-[2/1]' : ''}`} />
              ))}
              {p.featured && <span className="absolute right-2 top-2 rounded-full bg-gold p-1 text-gold-contrast" title="Destaque"><Star className="h-3.5 w-3.5 fill-current" /></span>}
            </div>
            <div className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-heading text-lg leading-tight">{p.title}</p>
                <Pill tone={STATUS[p.status][1]}>{STATUS[p.status][0]}</Pill>
              </div>
              <p className="text-xs text-muted">{p.barber?.name ?? 'Equipe'} · {p.unit?.name ?? 'Todas as unidades'}</p>
              {p.tags.length > 0 && <p className="text-xs text-gold">{p.tags.join(' · ')}</p>}
              <p className="text-xs text-muted">{p.bookings} agendamento(s) com este corte como referência</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button className="btn-ghost btn-sm" onClick={() => setEditing(p)}><Pencil className="h-3.5 w-3.5" /> Editar</button>
                {manage && p.status !== 'PUBLISHED' && <button className="btn-gold btn-sm" onClick={() => setPostStatus(p, 'PUBLISHED')}>{p.status === 'PENDING' ? 'Aprovar' : 'Publicar'}</button>}
                {manage && p.status === 'PUBLISHED' && <button className="btn-ghost btn-sm" onClick={() => setPostStatus(p, 'HIDDEN')}>Ocultar</button>}
                <ConfirmButton danger question="Excluir este corte do mural? Agendamentos já feitos continuam valendo." confirmText="Excluir" onConfirm={async () => { await api.delete(`/posts/${p.id}`); reload(); }}>Excluir</ConfirmButton>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {editing && <PostForm post={editing} manage={manage} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function PostForm({ post, manage, onClose, onSaved }) {
  const { units } = useUnit();
  const services = (useApi('/services').data ?? []).filter((s) => s.status === 'ACTIVE');
  const barbers = useApi(manage ? '/barbers' : null).data ?? [];
  const [f, setF] = useState({
    title: post.title ?? '', description: post.description ?? '', imageUrls: post.imageUrls ?? [], tags: (post.tags ?? []).join(', '),
    serviceIds: post.serviceIds ?? [], barberId: post.barberId ?? '', unitId: post.unitId ?? '', featured: post.featured ?? false,
    status: post.status ?? 'PUBLISHED',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleService = (id) => setF({ ...f, serviceIds: f.serviceIds.includes(id) ? f.serviceIds.filter((x) => x !== id) : [...f.serviceIds, id] });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      title: f.title, description: f.description || null, imageUrls: f.imageUrls,
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), serviceIds: f.serviceIds, unitId: f.unitId || null,
      ...(manage ? { barberId: f.barberId || null, featured: f.featured, status: f.status } : {}),
    };
    try {
      if (post.id) await api.patch(`/posts/${post.id}`, body);
      else await api.post('/posts', body);
      onSaved();
    } catch (err) {
      setError(err.fields?.length ? err.fields.map((x) => x.message).join(' · ') : err.message);
    } finally {
      setBusy(false);
    }
  };

  const slots = [0, 1, 2, 3].slice(0, Math.min(4, f.imageUrls.length + 1));
  return (
    <Modal open wide title={post.id ? 'Editar corte' : manage ? 'Publicar corte' : 'Enviar corte'} onClose={onClose}>
      <form onSubmit={save} className="space-y-5">
        <fieldset>
          <legend className="label">Fotos (até 4). Com duas, a primeira é o "antes" e a segunda o "depois".</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {slots.map((i) => (
              <ImageInput
                key={i}
                id={`mp-img-${i}`}
                label={f.imageUrls.length >= 2 || i > 0 ? (i === 0 ? 'Antes' : i === 1 ? 'Depois' : `Foto ${i + 1}`) : 'Foto'}
                value={f.imageUrls[i] ?? null}
                onChange={(url) => {
                  const next = [...f.imageUrls];
                  if (url) next[i] = url;
                  else next.splice(i, 1);
                  setF({ ...f, imageUrls: next.filter(Boolean) });
                }}
              />
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do corte" id="mp-title"><input id="mp-title" required className="input" placeholder="Ex.: Degradê navalhado com risco" value={f.title} onChange={set('title')} /></Field>
          <Field label="Estilos (separe por vírgula)" id="mp-tags" hint="Viram filtros no site: Degradê, Social, Barba, Infantil…"><input id="mp-tags" className="input" value={f.tags} onChange={set('tags')} /></Field>
        </div>
        <Field label="Descrição" id="mp-desc"><textarea id="mp-desc" rows={2} className="input" value={f.description} onChange={set('description')} /></Field>
        <fieldset>
          <legend className="label">Serviços para fazer este corte (já vêm marcados quando o cliente agenda)</legend>
          <div className="flex flex-wrap gap-2">
            {services.map((s) => {
              const on = f.serviceIds.includes(s.id);
              return <button type="button" key={s.id} aria-pressed={on} onClick={() => toggleService(s.id)} className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-gold bg-gold/15 text-gold' : 'border-white/10'}`}>{s.name}</button>;
            })}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          {manage && (
            <Field label="Feito por" id="mp-barber">
              <select id="mp-barber" className="input" value={f.barberId} onChange={set('barberId')}>
                <option value="">Equipe (sem profissional)</option>
                {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Aparece em" id="mp-unit">
            <select id="mp-unit" className="input" value={f.unitId} onChange={set('unitId')}>
              <option value="">Todas as unidades</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          {manage && (
            <Field label="Situação" id="mp-status">
              <select id="mp-status" className="input" value={f.status} onChange={set('status')}>
                {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
          )}
          {manage && (
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} className="accent-[rgb(var(--bp-accent))]" /> Destacar no início do mural
            </label>
          )}
        </div>
        <Alert>{error}</Alert>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-gold" disabled={busy || !f.imageUrls.length || f.title.trim().length < 2}>{manage ? 'Salvar' : 'Enviar para aprovação'}</button>
        </div>
      </form>
    </Modal>
  );
}
