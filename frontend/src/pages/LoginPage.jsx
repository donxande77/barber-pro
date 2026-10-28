import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { Lock, Mail, Loader2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { loginSchema } from '../lib/schemas.js';
import { Logo } from '../components/Logo.jsx';

export default function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: import.meta.env.VITE_PREVIEW === '1'
      ? { email: 'dono@demo.barberpro', password: 'Demo2026senha' }
      : { email: '', password: '' },
  });

  if (status === 'authenticated') return <Navigate to="/painel" replace />;

  const onSubmit = async ({ email, password }) => {
    setServerError('');
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname ?? '/painel', { replace: true });
    } catch (e) {
      setServerError(e.message);
    }
  };

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(var(--bp-accent)/0.12),transparent_60%)]"
      />
      <div className="card relative w-full max-w-sm p-8 shadow-2xl shadow-black/40">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="mb-4 h-14 w-14" />
          <h1 className="font-heading text-3xl font-semibold">Barber Pro</h1>
          <p className="mt-1 text-sm text-muted">Acesso da equipe</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div>
            <label htmlFor="email" className="label">E-mail</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input id="email" type="email" autoComplete="username" className="input pl-9" {...register('email')}
                aria-invalid={!!errors.email} />
            </div>
            {errors.email && <p className="field-error">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="label">Senha</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input id="password" type="password" autoComplete="current-password" className="input pl-9"
                {...register('password')} aria-invalid={!!errors.password} />
            </div>
            {errors.password && <p className="field-error">{errors.password.message}</p>}
          </div>

          {serverError && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {serverError}
            </p>
          )}

          <button type="submit" className="btn-gold w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Entrar
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          <Link to="/" className="hover:text-gold">← Voltar ao site</Link>
        </p>
      </div>
    </main>
  );
}
