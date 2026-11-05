export const THEMES = ['classic', 'eva', 'y2k', 'neon', 'glass', 'keynote', 'pixel', 'p5'] as const;
export type ThemeId = (typeof THEMES)[number];

/** Default accent of each palette (also used for the swatch "Default"). */
export const THEME_ACCENT: Record<ThemeId, string> = {
  classic: '#e50914',
  eva: '#ff5a1f',
  y2k: '#1e7bff',
  neon: '#ff2bd6',
  glass: '#8ab4ff',
  keynote: '#2997ff',
  pixel: '#ff004d',
  p5: '#e60012',
};

/** Page background, used for the browser/OS chrome color. */
export const THEME_BG: Record<ThemeId, string> = {
  classic: '#141414',
  eva: '#0b0b0b',
  y2k: '#d9e1ea',
  neon: '#07051a',
  glass: '#0d1326',
  keynote: '#000000',
  pixel: '#111327',
  p5: '#0a0a0a',
};

export const ACCENT_CHOICES = ['#e50914', '#ff5a1f', '#ffc93c', '#3ddc84', '#00d1ff', '#2997ff', '#8b5cf6', '#ff2bd6', '#f5f5f7'];

export function inkFor(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#fff';
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => {
    const c = parseInt(x, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? '#000' : '#fff';
}
