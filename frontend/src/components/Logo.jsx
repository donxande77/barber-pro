// Marca original do Barber Pro (poste de barbeiro estilizado). Substituível pelo logotipo
// enviado no painel de personalização (Fase 3).
export function Logo({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="rgb(var(--bp-graphite))" />
      <rect x="26" y="10" width="12" height="44" rx="6" fill="rgb(var(--bp-text))" />
      <path d="M26 18 L38 26 M26 30 L38 38 M26 42 L38 50" stroke="rgb(var(--bp-accent))" strokeWidth="4" strokeLinecap="round" />
      <rect x="22" y="6" width="20" height="6" rx="3" fill="rgb(var(--bp-accent))" />
      <rect x="22" y="52" width="20" height="6" rx="3" fill="rgb(var(--bp-accent))" />
    </svg>
  );
}
