import type { Catalog } from '../api/catalog';
import type { Item } from '../api/types';
import { t, type Lang } from '../i18n';
import { genreKey, genreLabel } from '../i18n/genres';
import { rating } from '../ui/meta';

export interface RowDef {
  key: string;
  title: string;
  items: Item[];
}

const byName = (a: Item, b: Item) => (a.SortName ?? a.Name).localeCompare(b.SortName ?? b.Name);

/** Replaces saga films by their saga, keeping the first position and removing duplicates. */
export function grouped(c: Catalog, items: Item[]): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const it of items) {
    const sid = it.Type === 'Movie' ? c.sagaOf.get(it.Id) : undefined;
    const unit = sid ? c.byId.get(sid)! : it;
    if (!unit || seen.has(unit.Id)) continue;
    seen.add(unit.Id);
    out.push(unit);
  }
  return out;
}

const added = (it: Item) => Date.parse(it.DateLastMediaAdded ?? it.DateCreated ?? '') || 0;

export function recentlyAdded(c: Catalog, limit = 20): Item[] {
  const all = [...c.movies, ...c.series].sort((a, b) => added(b) - added(a));
  return grouped(c, all).slice(0, limit);
}

export function topRated(c: Catalog, min = 7): Item[] {
  return [...c.standalone, ...c.series, ...c.sagas]
    .filter((it) => (rating(it) ?? 0) >= min)
    .sort((a, b) => (rating(b) ?? 0) - (rating(a) ?? 0));
}

function genreRows(c: Catalog, lang: Lang, maxRows = 8): RowDef[] {
  const groups = new Map<string, { label: string; items: Item[] }>();
  for (const it of grouped(c, [...c.movies, ...c.series].sort(byName))) {
    const names = it.Genres?.length ? it.Genres : [];
    const kids = it.Type === 'BoxSet' ? (c.sagaMovies[it.Id] ?? []).map((id) => c.byId.get(id)!) : [];
    const all = new Set([...names, ...kids.flatMap((k) => k?.Genres ?? [])]);
    for (const g of all) {
      const key = genreKey(g);
      const entry = groups.get(key) ?? { label: genreLabel(g, lang, true), items: [] };
      if (!entry.items.includes(it)) entry.items.push(it);
      groups.set(key, entry);
    }
  }
  return [...groups.entries()]
    .filter(([, g]) => g.items.length >= 2)
    .sort((a, b) => b[1].items.length - a[1].items.length || a[1].label.localeCompare(b[1].label))
    .slice(0, maxRows)
    .map(([key, g]) => ({ key: 'genre-' + key, title: g.label, items: g.items }));
}

export function homeRows(c: Catalog, lang: Lang): RowDef[] {
  const rows: RowDef[] = [
    { key: 'recent', title: t('rows.recent'), items: recentlyAdded(c) },
    { key: 'films', title: t('rows.films'), items: [...c.standalone].sort(byName) },
    { key: 'series', title: t('rows.series'), items: [...c.series].sort(byName) },
    { key: 'sagas', title: t('rows.sagas'), items: [...c.sagas].sort(byName) },
    { key: 'top', title: t('rows.topRated'), items: topRated(c) },
    ...genreRows(c, lang),
  ];
  return rows.filter((r) => r.items.length > 0);
}

/** Banner picks: newest arrivals and best rated, only titles with a backdrop. */
export function heroItems(c: Catalog, max = 6): Item[] {
  const hasArt = (it: Item) =>
    !!it.BackdropImageTags?.length ||
    (it.Type === 'BoxSet' && (c.sagaMovies[it.Id] ?? []).some((id) => c.byId.get(id)?.BackdropImageTags?.length));
  const recent = recentlyAdded(c, 10).filter(hasArt);
  const top = topRated(c, 0).filter(hasArt);
  const out: Item[] = [];
  for (let i = 0; out.length < max && (i < recent.length || i < top.length); i++) {
    for (const it of [recent[i], top[i]]) if (it && !out.includes(it) && out.length < max) out.push(it);
  }
  return out;
}
