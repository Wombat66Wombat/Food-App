// One theme for the whole app: light/dark (or follow the phone), an accent palette,
// or colors taken from your wallpaper.

import { state } from './core.js';

export const PALETTES = {
  green: { name: 'Matcha', light: '#16a34a', dark: '#22c55e' },
  ocean: { name: 'Ocean', light: '#0369a1', dark: '#38bdf8' },
  violet: { name: 'Lavender', light: '#7c3aed', dark: '#a78bfa' },
  sunset: { name: 'Sunset', light: '#c2410c', dark: '#fb923c' },
  rose: { name: 'Rose', light: '#e11d48', dark: '#fb7185' },
  teal: { name: 'Lagoon', light: '#0f766e', dark: '#2dd4bf' },
  mono: { name: 'Graphite', light: '#334155', dark: '#cbd5e1' },
};

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Text color that stays readable on top of the accent.
export const onColor = (hex) => (luminance(hex) > 0.4 ? '#0b1210' : '#ffffff');

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return rgbToHex(f(0), f(8), f(4));
}

// Pick the most prominent colorful tone of an image, tuned for light and dark mode.
export function accentFromPixels(data) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue;
    const [, s, l] = rgbToHsl(r, g, b);
    if (l < 0.08 || l > 0.95) continue;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const w = 0.15 + s * s * 3 * (1 - Math.abs(l - 0.5));
    const cur = buckets.get(key) || { w: 0, r: 0, g: 0, b: 0 };
    cur.w += w; cur.r += r * w; cur.g += g * w; cur.b += b * w;
    buckets.set(key, cur);
  }
  let best = null;
  for (const v of buckets.values()) if (!best || v.w > best.w) best = v;
  if (!best) return { light: PALETTES.green.light, dark: PALETTES.green.dark };
  const [h, s] = rgbToHsl(best.r / best.w, best.g / best.w, best.b / best.w);
  const sat = s < 0.12 ? s : Math.max(s, 0.5);
  return { light: hslToHex(h, Math.min(sat, 0.85), 0.4), dark: hslToHex(h, Math.min(sat, 0.8), 0.66) };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Read a wallpaper photo: returns a small JPEG to store + the accent colors.
export async function processWallpaper(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.72);

    const s = document.createElement('canvas');
    s.width = 48;
    s.height = 48;
    const sctx = s.getContext('2d');
    sctx.drawImage(img, 0, 0, 48, 48);
    const accent = accentFromPixels(sctx.getImageData(0, 0, 48, 48).data);
    return { dataUrl, accent };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function currentAccent() {
  const t = state.settings.theme;
  if (t.palette === 'wallpaper' && t.wallAccent) return t.wallAccent;
  return PALETTES[t.palette] || PALETTES.green;
}

const systemDark = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : { matches: false };
export const isDark = () => {
  const mode = state.settings.theme.mode;
  return mode === 'dark' || (mode === 'system' && systemDark.matches);
};

export function applyTheme() {
  const t = state.settings.theme;
  const root = document.documentElement;
  if (t.mode === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = t.mode;

  const accent = currentAccent();
  root.style.setProperty('--brand-light', accent.light);
  root.style.setProperty('--brand-dark', accent.dark);
  root.style.setProperty('--on-brand-light', onColor(accent.light));
  root.style.setProperty('--on-brand-dark', onColor(accent.dark));

  const showWall = Boolean(t.wallpaperBg && t.wallpaper);
  document.body.classList.toggle('has-wallpaper', showWall);
  if (showWall) root.style.setProperty('--wallpaper', `url("${t.wallpaper}")`);
  else root.style.removeProperty('--wallpaper');

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = isDark() ? '#0e1411' : accent.light;
}

systemDark.addEventListener?.('change', applyTheme);
