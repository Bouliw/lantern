/**
 * Content-based recommendations, computed on the device.
 *
 * Every title becomes a weighted feature vector (genres, directors, writers, top-billed cast,
 * studios, tags, decade, title words). Weights are scaled by inverse document frequency, so a
 * shared director or lead actor counts far more than a shared "Drama" genre.
 *
 * "Because you watched X" ranks candidates by:
 *   similarity(X, candidate)                      — what X is like
 * + 0.25 × similarity(taste profile, candidate)   — what the viewer tends to finish
 * + a bonus when Jellyfin's own "similar" list agrees
 * + a strong bonus for the next unwatched film of X's saga.
 * Titles already watched are pushed down rather than hidden.
 */
import type { Catalog } from '../api/catalog';
import type { Item, ItemsResult } from '../api/types';
import { api, userId } from '../api/client';
import { genreKey } from '../i18n/genres';

type Vec = Map<string, number>;

const WEIGHT = {
  genre: 1.0,
  director: 2.2,
  writer: 1.2,
  actor: 1.0,
  studio: 0.5,
  tag: 0.8,
  decade: 0.35,
  title: 0.9,
};

const STOP = new Set(
  'the a an of and or in on to for with from part chapter vol volume le la les de du des un une et ou en au aux chapitre partie'.split(' '),
);

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

function titleWords(s?: string): string[] {
  if (!s) return [];
  return norm(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
}

function rawFeatures(items: Item[]): Vec {
  const f: Vec = new Map();
  const add = (k: string, v: number) => f.set(k, Math.max(f.get(k) ?? 0, v));
  for (const it of items) {
    for (const g of it.Genres ?? []) add('g:' + genreKey(g), WEIGHT.genre);
    for (const s of (it.Studios ?? []).slice(0, 3)) add('s:' + norm(s.Name), WEIGHT.studio);
    for (const tag of (it.Tags ?? []).slice(0, 20)) add('t:' + norm(tag), WEIGHT.tag);
    let rank = 0;
    for (const p of it.People ?? []) {
      if (p.Type === 'Director') add('d:' + p.Id, WEIGHT.director);
      else if (p.Type === 'Writer') add('w:' + p.Id, WEIGHT.writer);
      else if (p.Type === 'Actor' && rank < 10) add('a:' + p.Id, WEIGHT.actor * Math.pow(0.85, rank++));
    }
    if (it.ProductionYear) add('y:' + Math.floor(it.ProductionYear / 10), WEIGHT.decade);
    for (const w of [...titleWords(it.Name), ...titleWords(it.OriginalTitle)]) add('n:' + w, WEIGHT.title);
  }
  return f;
}

function magnitude(v: Vec): number {
  let s = 0;
  for (const x of v.values()) s += x * x;
  return Math.sqrt(s);
}

function cosine(a: Vec, b: Vec): number {
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, x] of small) {
    const y = big.get(k);
    if (y) dot += x * y;
  }
  const m = magnitude(a) * magnitude(b);
  return m ? dot / m : 0;
}

export interface Seed {
  item: Item;
  lastPlayed: number;
  weight: number;
}

export class Recommender {
  private vectors = new Map<string, Vec>();
  /** Units shown in rows: standalone movies, series and sagas. */
  readonly units: Item[];

  constructor(private c: Catalog) {
    const raw = new Map<string, Vec>();
    const df = new Map<string, number>();
    const all = [...c.movies, ...c.series];
    for (const it of all) {
      const v = rawFeatures([it]);
      raw.set(it.Id, v);
      for (const k of v.keys()) df.set(k, (df.get(k) ?? 0) + 1);
    }
    for (const s of c.sagas) raw.set(s.Id, rawFeatures(c.sagaMovies[s.Id].map((id) => c.byId.get(id)!).filter(Boolean)));
    const n = all.length || 1;
    for (const [id, v] of raw) {
      const w: Vec = new Map();
      for (const [k, x] of v) w.set(k, x * Math.log(1 + n / (df.get(k) ?? 1)));
      this.vectors.set(id, w);
    }
    this.units = [...c.standalone, ...c.series, ...c.sagas];
  }

  vector(id: string): Vec {
    return this.vectors.get(id) ?? new Map();
  }

  /** Taste profile: recent and completed titles weigh more. */
  profile(seeds: Seed[]): Vec {
    const p: Vec = new Map();
    const now = Date.now();
    for (const s of seeds) {
      const days = Math.max(0, (now - s.lastPlayed) / 86_400_000);
      const w = s.weight * Math.pow(0.5, days / 30) * (s.item.UserData?.IsFavorite ? 1.5 : 1);
      for (const [k, x] of this.vector(s.item.Id)) p.set(k, (p.get(k) ?? 0) + x * w);
    }
    return p;
  }

  similarTo(seed: Item, profile: Vec, serverSimilar: Set<string>, limit = 12): Item[] {
    const c = this.c;
    const seedSaga = seed.Type === 'Movie' ? c.sagaOf.get(seed.Id) : seed.Type === 'BoxSet' ? seed.Id : undefined;
    const sv = this.vector(seed.Id);
    const scored: { item: Item; score: number }[] = [];
    for (const cand of this.units) {
      if (cand.Id === seed.Id || cand.Id === seedSaga) continue;
      const cv = this.vector(cand.Id);
      let score = cosine(sv, cv) + 0.25 * cosine(profile, cv);
      if (serverSimilar.has(cand.Id)) score += 0.12;
      if (cand.UserData?.Played) score *= 0.35;
      if (score > 0.03) scored.push({ item: cand, score });
    }
    if (seedSaga) {
      const films = c.sagaMovies[seedSaga] ?? [];
      const next = films.map((id) => c.byId.get(id)!).find((m) => m && m.Id !== seed.Id && !m.UserData?.Played);
      if (next) scored.push({ item: next, score: 10 });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.item);
  }
}

let cached: { key: string; engine: Recommender } | null = null;

export function recommender(c: Catalog): Recommender {
  const key = c.key + c.fetchedAt;
  if (!cached || cached.key !== key) cached = { key, engine: new Recommender(c) };
  return cached.engine;
}

/** Recently watched titles (episodes fold into their series), newest first. */
export async function watchHistory(c: Catalog): Promise<Seed[]> {
  const base = {
    Recursive: true,
    IncludeItemTypes: 'Movie,Episode',
    SortBy: 'DatePlayed',
    SortOrder: 'Descending',
    Limit: 40,
    Fields: 'SeriesId',
    EnableImages: false,
    EnableTotalRecordCount: false,
  };
  const uid = userId();
  const [played, resumable] = await Promise.all([
    api<ItemsResult>(`/Users/${uid}/Items`, { query: { ...base, Filters: 'IsPlayed' } }).catch(() => ({ Items: [] as Item[] })),
    api<ItemsResult>(`/Users/${uid}/Items`, { query: { ...base, Filters: 'IsResumable' } }).catch(() => ({ Items: [] as Item[] })),
  ]);
  const seeds = new Map<string, Seed>();
  for (const it of [...played.Items, ...resumable.Items]) {
    const unit = it.Type === 'Episode' ? (it.SeriesId ? c.byId.get(it.SeriesId) : undefined) : c.byId.get(it.Id);
    if (!unit) continue;
    const when = Date.parse(it.UserData?.LastPlayedDate ?? '') || 0;
    const weight = it.UserData?.Played ? 1 : Math.min(1, Math.max(0.25, (it.UserData?.PlayedPercentage ?? 0) / 100));
    const prev = seeds.get(unit.Id);
    if (prev) {
      prev.lastPlayed = Math.max(prev.lastPlayed, when);
      prev.weight = Math.min(2, prev.weight + weight * 0.5);
    } else seeds.set(unit.Id, { item: unit, lastPlayed: when, weight });
  }
  return [...seeds.values()].sort((a, b) => b.lastPlayed - a.lastPlayed);
}

export interface RecoRow {
  seed: Item;
  items: Item[];
}

/** "Because you watched…" rows for the most recent distinct titles. */
export async function becauseYouWatched(c: Catalog, maxRows = 2): Promise<RecoRow[]> {
  const seeds = await watchHistory(c);
  if (!seeds.length) return [];
  const engine = recommender(c);
  const profile = engine.profile(seeds);
  const rows: RecoRow[] = [];
  const usedSagas = new Set<string>();
  for (const s of seeds) {
    if (rows.length >= maxRows) break;
    const saga = c.sagaOf.get(s.item.Id);
    if (saga) {
      if (usedSagas.has(saga)) continue;
      usedSagas.add(saga);
    }
    let similar = new Set<string>();
    try {
      const res = await api<ItemsResult>(`/Items/${s.item.Id}/Similar`, { query: { userId: userId(), limit: 12 } });
      similar = new Set(res.Items.map((i) => c.sagaOf.get(i.Id) ?? i.Id));
    } catch {
      /* the local score is enough */
    }
    const items = engine.similarTo(s.item, profile, similar);
    if (items.length >= 2) rows.push({ seed: s.item, items });
  }
  return rows;
}
