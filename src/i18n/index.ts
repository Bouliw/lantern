import { computed, effect, signal } from '@preact/signals';
import { en, type StringKey } from './en';
import { fr } from './fr';

export type Lang = 'en' | 'fr';
export type LangPref = 'auto' | Lang;

const KEY = 'lantern.lang';
const stored = (() => {
  try {
    return localStorage.getItem(KEY) as LangPref | null;
  } catch {
    return null;
  }
})();

/** Language preference for this device. */
export const langPref = signal<LangPref>(stored === 'fr' || stored === 'en' ? stored : 'auto');

function deviceLang(): Lang {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  return langs[0]?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export const lang = computed<Lang>(() => (langPref.value === 'auto' ? deviceLang() : langPref.value));

effect(() => {
  document.documentElement.lang = lang.value;
  try {
    localStorage.setItem(KEY, langPref.value);
  } catch {
    /* storage unavailable */
  }
});

const tables: Record<Lang, Record<StringKey, string>> = { en, fr };

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s = tables[lang.value][key] ?? en[key] ?? key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

export function formatRuntime(ticks?: number): string {
  if (!ticks) return '';
  const min = Math.round(ticks / 600_000_000);
  if (min < 60) return t('details.minutes', { n: min });
  return t('details.hm', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') });
}

export function formatClock(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export type { StringKey };
