import { Check, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSite } from './SiteContext.jsx';
import { brl, waLink } from '../lib/format.js';

const itemText = (i) => (i.quantity ? `${i.quantity} ${i.serviceName.toLowerCase()} por mês` : `${i.serviceName} à vontade`);

/** Planos mensais: o cliente conhece os planos e chama a unidade para assinar (não há pagamento online). */
export function PlansSection() {
  const { plans, unit, config } = useSite();
  if (!plans.length) return null;
  const whatsapp = unit?.whatsapp || config.social.whatsapp;

  return (
    <section className="border-b border-white/5 bg-surface/40" aria-labelledby="planos-t">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
        <div id="planos" className="mb-10 max-w-2xl">
          <p className="font-heading text-sm uppercase tracking-[0.25em] text-gold">Assinatura</p>
          <h2 id="planos-t" className="mt-2 font-heading text-4xl font-semibold sm:text-5xl">Planos mensais</h2>
          <p className="mt-4 text-ink/75">Pague um valor fixo por mês e mantenha o visual em dia. Os serviços do plano saem sem custo no atendimento, dentro do limite do mês.</p>
        </div>
        <ul className={`grid gap-5 ${plans.length === 1 ? 'max-w-md' : plans.length === 2 ? 'md:grid-cols-2 lg:max-w-4xl' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
          {plans.map((p) => {
            const text = `Olá! Quero assinar o ${p.name} (${brl(p.price)}/mês)${unit ? ` na unidade ${unit.name}` : ''}.`;
            return (
              <li key={p.id} className={`relative flex flex-col rounded-2xl border p-6 sm:p-7 ${p.highlight ? 'border-gold/70 bg-gold/[0.06]' : 'border-white/10 bg-bg'}`}>
                {p.highlight && (
                  <span className="absolute -top-3 left-6 rounded-full bg-gold px-3 py-1 text-xs font-semibold text-gold-contrast">Mais escolhido</span>
                )}
                <p className="font-heading text-2xl">{p.name}</p>
                <p className="mt-3 flex items-baseline gap-1">
                  <span className="num font-heading text-5xl font-semibold text-gold">{brl(p.price)}</span>
                  <span className="text-sm text-muted">/mês</span>
                </p>
                {p.description && <p className="mt-3 text-sm text-ink/75">{p.description}</p>}
                <ul className="mt-5 space-y-2.5 text-sm">
                  {p.items.map((i) => (
                    <li key={i.serviceName} className="flex gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" /> {itemText(i)}
                    </li>
                  ))}
                  {p.unit && <li className="text-xs text-muted">Válido na unidade {p.unit.name}</li>}
                </ul>
                <div className="mt-auto pt-7">
                  {whatsapp ? (
                    <a href={waLink(whatsapp, text)} target="_blank" rel="noreferrer" className={`${p.highlight ? 'btn-gold' : 'btn-ghost'} w-full justify-center py-3`}>
                      <MessageCircle className="h-4 w-4" /> Quero assinar
                    </a>
                  ) : (
                    <Link to="/agendar" className={`${p.highlight ? 'btn-gold' : 'btn-ghost'} w-full justify-center py-3`}>Agende e assine na barbearia</Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-6 text-xs text-muted">A assinatura é feita na barbearia. A mensalidade vence todo mês no dia da contratação; com atraso acima de 5 dias, os serviços do plano ficam suspensos até o pagamento.</p>
      </div>
    </section>
  );
}
