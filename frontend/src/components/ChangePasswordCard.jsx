import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { passwordRule } from '../lib/schemas.js';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual.'),
    newPassword: passwordRule,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'As senhas não conferem.' });

export function ChangePasswordCard() {
  const [msg, setMsg] = useState(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ currentPassword, newPassword }) => {
    setMsg(null);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      reset({ currentPassword: '', newPassword: '', confirm: '' });
      setMsg({ ok: true, text: 'Senha alterada. Outras sessões abertas foram encerradas.' });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="card space-y-4 p-6">
      <div className="flex items-center gap-3 text-muted">
        <ShieldCheck className="h-5 w-5 text-gold" /> Alterar senha
      </div>
      {[
        ['currentPassword', 'Senha atual', 'current-password'],
        ['newPassword', 'Nova senha', 'new-password'],
        ['confirm', 'Confirmar nova senha', 'new-password'],
      ].map(([name, label, ac]) => (
        <div key={name}>
          <label htmlFor={name} className="label">{label}</label>
          <input id={name} type="password" autoComplete={ac} className="input" {...register(name)} />
          {errors[name] && <p className="field-error">{errors[name].message}</p>}
        </div>
      ))}
      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</p>}
      <button className="btn-gold" disabled={isSubmitting}>Salvar nova senha</button>
    </form>
  );
}
