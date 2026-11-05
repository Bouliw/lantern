import { signal } from '@preact/signals';
import { load, persist } from './client';
import { isPackaged } from '../platform';

/**
 * Summaries in other languages, prepared on the server by scripts/localize-overviews.mjs.
 * Shape: { [itemId]: { [lang]: summary } }. Missing file = library summaries only.
 */
const KEY = 'lantern.overviews';
export const overviews = signal<Record<string, Record<string, string>>>(load(KEY, {}));

export async function loadOverviews() {
  const base = window.LANTERN_CONFIG?.web ?? (isPackaged ? null : '.');
  if (!base) return;
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/overviews.json`, { cache: 'no-cache' });
    if (!res.ok) return;
    const data = await res.json();
    const items = data?.items ?? {};
    overviews.value = items;
    persist(KEY, items);
  } catch {
    /* keep the cached copy */
  }
}

export function localizedOverview(id: string | undefined, lang: string): string | undefined {
  return id ? overviews.value[id]?.[lang] || undefined : undefined;
}
