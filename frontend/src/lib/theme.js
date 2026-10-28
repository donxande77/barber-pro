// Aplica a identidade visual publicada (cores e fontes) como variáveis CSS.
export const FONT_STACKS = {
  'Playfair Display': "'Playfair Display', Georgia, serif",
  'Cormorant Garamond': "'Cormorant Garamond', Georgia, serif",
  'DM Serif Display': "'DM Serif Display', Georgia, serif",
  'Bebas Neue': "'Bebas Neue', 'Arial Narrow', sans-serif",
  Oswald: "'Oswald', 'Arial Narrow', sans-serif",
  Inter: "'Inter', system-ui, sans-serif",
  Manrope: "'Manrope', system-ui, sans-serif",
  Lato: "'Lato', system-ui, sans-serif",
};

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

const loaded = new Set(['Oswald', 'Manrope']);
function loadFont(family) {
  if (!family || loaded.has(family)) return;
  loaded.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

export function applyTheme(config, target = document.documentElement) {
  if (!config) return;
  const c = config.colors;
  const vars = {
    '--bp-bg': c.background,
    '--bp-surface': c.surface,
    '--bp-graphite': c.graphite,
    '--bp-text': c.text,
    '--bp-muted': c.muted,
    '--bp-accent': c.accent,
    '--bp-accent-contrast': c.accentContrast,
  };
  for (const [k, v] of Object.entries(vars)) if (/^#[0-9a-f]{6}$/i.test(v ?? '')) target.style.setProperty(k, hexToRgb(v));
  loadFont(config.fonts?.heading);
  loadFont(config.fonts?.body);
  if (FONT_STACKS[config.fonts?.heading]) target.style.setProperty('--bp-font-heading', FONT_STACKS[config.fonts.heading]);
  if (FONT_STACKS[config.fonts?.body]) target.style.setProperty('--bp-font-body', FONT_STACKS[config.fonts.body]);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && c.background) meta.setAttribute('content', c.background);
}

/** Remove as variáveis do tema publicado (o painel usa sempre o tema padrão). */
export function resetTheme(target = document.documentElement) {
  for (const k of ['--bp-bg', '--bp-surface', '--bp-graphite', '--bp-text', '--bp-muted', '--bp-accent', '--bp-accent-contrast', '--bp-font-heading', '--bp-font-body']) {
    target.style.removeProperty(k);
  }
}
