import { Link } from 'react-router-dom';
import { Logo } from '../../components/Logo.jsx';

// Página provisória. O site público completo (unidades, serviços, barbeiros, galeria,
// agendamento) é construído na Fase 3 com conteúdo vindo da API.
export default function PublicHome() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-6 text-center">
      <div aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(var(--bp-accent)/0.10),transparent_65%)]" />
      <div className="relative max-w-xl">
        <Logo className="mx-auto mb-8 h-16 w-16" />
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Barber Pro</p>
        <h1 className="mt-4 font-heading text-4xl leading-tight sm:text-6xl">Site em preparação</h1>
        <p className="mt-5 text-muted">
          Em breve: unidades, serviços, profissionais e agendamento online.
        </p>
        <Link to="/entrar" className="btn-ghost mt-10">Área da equipe</Link>
      </div>
    </main>
  );
}
