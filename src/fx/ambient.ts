/**
 * Ambient color: the page picks up the dominant color of the artwork on screen (hero slide,
 * opened title, focused or previewed card) and glows with it, like a TV with bias lighting.
 */
import type { Item } from '../api/types';
import { catalog, representative } from '../api/catalog';
import { backdropOf, imageUrl, posterOf, thumbOf } from '../api/images';
import { isTV } from '../platform';

const cache = new Map<string, string>();
let base: string | undefined;
let hint: string | undefined;
let shown: string | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let token = 0;

/** A tiny, separately cached version of the artwork (CORS-enabled, so the canvas can read it). */
export function ambientSource(item: Item | undefined): string | undefined {
  if (!item) return undefined;
  const rep = representative(item);
  const ref = backdropOf(item, rep) ?? thumbOf(item) ?? posterOf(item) ?? posterOf(rep);
  const url = imageUrl(ref, 160);
  return url && `${url}${url.includes('?') ? '&' : '?'}ambient=1`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Saturation-weighted average, then pushed to a vivid but not neon lightness. */
function extract(img: HTMLImageElement): string | null {
  const w = 24;
  const h = 14;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  if (!c) return null;
  c.drawImage(img, 0, 0, w, h);
  const data = c.getImageData(0, 0, w, h).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const weight = s * s * (1 - Math.abs(l - 0.5) * 1.6) + 0.02;
    if (weight <= 0) continue;
    r += data[i] * weight;
    g += data[i + 1] * weight;
    b += data[i + 2] * weight;
    total += weight;
  }
  if (!total) return null;
  const [hue, sat] = rgbToHsl(r / total, g / total, b / total);
  const s = Math.min(0.85, Math.max(0.25, sat * 1.35));
  return `hsl(${hue.toFixed(0)} ${(s * 100).toFixed(0)}% 52%)`;
}

function load(url: string): Promise<string | null> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      let color: string | null = null;
      try {
        color = extract(img);
      } catch {
        color = null; // tainted canvas: no ambient for this one
      }
      if (color) cache.set(url, color);
      resolve(color);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function apply() {
  const url = hint ?? base;
  if (url === shown) return;
  shown = url;
  const mine = ++token;
  const color = url ? await load(url) : null;
  if (mine !== token) return;
  const root = document.documentElement;
  if (color) {
    root.style.setProperty('--ambient-c', color);
    root.dataset.ambientLit = '1';
  } else {
    delete root.dataset.ambientLit;
  }
}

function schedule(delay: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void apply(), delay);
}

/** The page's own color (hero slide, opened title); undefined when the page has none. */
export function setAmbientBase(url: string | undefined) {
  base = url;
  schedule(hint ? 400 : 60);
}

/** A passing color (focused or previewed card); undefined returns to the page's color. */
export function setAmbientHint(url: string | undefined) {
  hint = url;
  schedule(url ? 280 : 450);
}

export function initAmbient() {
  if (!isTV) return;
  // On TV the focused card leads the color.
  document.addEventListener('focusin', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
    const item = card ? catalog.value?.byId.get(card.dataset.card!) : undefined;
    setAmbientHint(ambientSource(item));
  });
}
