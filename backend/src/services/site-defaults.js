// Identidade visual inicial (preto, grafite, branco e dourado).
// Tudo aqui é editável pelo painel e versionado em SiteConfigVersion.
export const DEFAULT_SITE_CONFIG = {
  brand: {
    name: 'Barber Pro',
    tagline: 'Tradição, precisão e estilo.',
    logoUrl: null,
  },
  colors: {
    background: '#0B0B0C',
    surface: '#161618',
    graphite: '#2A2A2E',
    text: '#F5F5F4',
    muted: '#A8A29E',
    accent: '#C9A24A',
    accentContrast: '#0B0B0C',
  },
  fonts: { heading: 'Oswald', body: 'Manrope' },
  hero: {
    title: 'Corte de respeito. Barba no ponto.',
    subtitle: 'Escolha a unidade, o serviço e o profissional. Seu horário confirmado em menos de um minuto.',
    imageUrl: null,
    ctaLabel: 'Agendar horário',
  },
  about: {
    title: 'A casa',
    text: 'Edite este texto no painel em "Site e aparência" para contar a história da sua barbearia.',
    imageUrl: null,
  },
  sections: ['hero', 'services', 'lookbook', 'promotions', 'barbers', 'about', 'gallery', 'products', 'reviews', 'units', 'policies'],
  gallery: [],
  social: { instagram: null, facebook: null, tiktok: null, whatsapp: null },
  policies: { cancellation: '' },
};
