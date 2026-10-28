// Identidade visual inicial (preto, grafite, branco e dourado).
// Tudo aqui é editável pelo painel na Fase 3 e versionado em SiteConfigVersion.
export const DEFAULT_SITE_CONFIG = {
  brand: {
    name: 'Barber Pro',
    tagline: 'Tradição, precisão e estilo.',
    logoUrl: null,
  },
  colors: {
    background: '#0B0B0C',
    surface: '#1C1C1F',
    graphite: '#2A2A2E',
    text: '#F5F5F4',
    muted: '#A8A29E',
    accent: '#C9A24A',
    accentContrast: '#0B0B0C',
  },
  fonts: { heading: 'Playfair Display', body: 'Inter' },
  hero: { title: 'Seu estilo, nossa assinatura.', subtitle: '', imageUrl: null, ctaLabel: 'Agendar horário' },
  about: { title: 'Sobre nós', text: '' },
  sections: ['hero', 'about', 'services', 'barbers', 'gallery', 'products', 'reviews', 'units', 'policies'],
  gallery: [],
  social: { instagram: null, facebook: null, tiktok: null, whatsapp: null },
  policies: { cancellation: '' },
};
