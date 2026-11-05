import { signal } from '@preact/signals';
import { api, load, persist, serverUrl, session, userId } from './client';
import type { Item, ItemsResult } from './types';

/**
 * The whole library (movies, series, sagas) is loaded in one go and cached on the device.
 * Rows, search and recommendations are then computed locally, so navigation never waits
 * on the server and the media drive is not touched.
 */
export interface CatalogData {
  movies: Item[];
  series: Item[];
  sagas: Item[];
  /** saga id -> its movie ids, in release order */
  sagaMovies: Record<string, string[]>;
  fetchedAt: number;
}

export interface Catalog extends CatalogData {
  key: string;
  byId: Map<string, Item>;
  /** movie id -> saga id */
  sagaOf: Map<string, string>;
  /** movies that are not part of a saga */
  standalone: Item[];
}

export const catalog = signal<Catalog | null>(null);
export const catalogError = signal<boolean>(false);

export const ITEM_FIELDS = [
  'Overview',
  'Genres',
  'People',
  'Studios',
  'Tags',
  'ProviderIds',
  'DateCreated',
  'DateLastMediaAdded',
  'Taglines',
  'OriginalTitle',
  'SortName',
  'ChildCount',
  'RecursiveItemCount',
  'PremiereDate',
  'EndDate',
  'Status',
].join(',');

const CREW = new Set(['Director', 'Writer']);

/** Keeps the cached catalog small: crew plus the top-billed cast. */
function slim(item: Item): Item {
  const people = item.People ?? [];
  const cast = people.filter((p) => p.Type === 'Actor').slice(0, 12);
  const crew = people.filter((p) => CREW.has(p.Type)).slice(0, 6);
  return { ...item, People: [...crew, ...cast].map(({ Name, Id, Role, Type }) => ({ Name, Id, Role, Type })) };
}

function cacheKey(): string {
  return `lantern.catalog.${serverUrl.value}|${userId()}`;
}

function index(data: CatalogData, key: string): Catalog {
  const byId = new Map<string, Item>();
  for (const it of data.movies) byId.set(it.Id, it);
  for (const it of data.series) byId.set(it.Id, it);
  for (const it of data.sagas) byId.set(it.Id, it);
  const sagaOf = new Map<string, string>();
  for (const sagaId in data.sagaMovies) {
    const ids = data.sagaMovies[sagaId]
      .filter((id) => byId.has(id))
      .sort((a, b) => releaseKey(byId.get(a)!) - releaseKey(byId.get(b)!));
    data.sagaMovies[sagaId] = ids;
    for (const id of ids) if (!sagaOf.has(id)) sagaOf.set(id, sagaId);
  }
  const standalone = data.movies.filter((m) => !sagaOf.has(m.Id));
  return { ...data, key, byId, sagaOf, standalone };
}

function releaseKey(it: Item): number {
  if (it.PremiereDate) return Date.parse(it.PremiereDate);
  return it.ProductionYear ? Date.UTC(it.ProductionYear, 0, 1) : 0;
}

async function fetchAll(): Promise<CatalogData> {
  const uid = userId();
  const common = {
    Recursive: true,
    Fields: ITEM_FIELDS,
    EnableImageTypes: 'Primary,Backdrop,Logo,Thumb',
    ImageTypeLimit: 1,
    SortBy: 'SortName',
    EnableTotalRecordCount: false,
  };
  const [media, boxsets] = await Promise.all([
    api<ItemsResult>(`/Users/${uid}/Items`, { query: { ...common, IncludeItemTypes: 'Movie,Series' } }),
    api<ItemsResult>(`/Users/${uid}/Items`, { query: { ...common, IncludeItemTypes: 'BoxSet' } }),
  ]);
  const movies = media.Items.filter((i) => i.Type === 'Movie').map(slim);
  const series = media.Items.filter((i) => i.Type === 'Series').map(slim);
  const movieIds = new Set(movies.map((m) => m.Id));
  const children = await Promise.all(
    boxsets.Items.map((b) =>
      api<ItemsResult>(`/Users/${uid}/Items`, {
        query: { ParentId: b.Id, EnableImages: false, EnableUserData: false, EnableTotalRecordCount: false },
      }).catch(() => ({ Items: [] as Item[], TotalRecordCount: 0 })),
    ),
  );
  const sagas: Item[] = [];
  const sagaMovies: Record<string, string[]> = {};
  boxsets.Items.forEach((b, i) => {
    const ids = children[i].Items.filter((c) => movieIds.has(c.Id)).map((c) => c.Id);
    if (ids.length) {
      sagaMovies[b.Id] = ids;
      sagas.push(slim(b));
    }
  });
  return { movies, series, sagas, sagaMovies, fetchedAt: Date.now() };
}

let inflight: Promise<void> | null = null;

/** Shows the cached catalog at once, then refreshes it in the background. */
export function loadCatalog(force = false): Promise<void> {
  const s = session.value;
  if (!s) return Promise.resolve();
  const key = cacheKey();
  if (!catalog.value || catalog.value.key !== key) {
    const cached = load<CatalogData | null>(key, null);
    catalog.value = cached ? index(cached, key) : null;
  }
  if (inflight) return inflight;
  if (!force && catalog.value && Date.now() - catalog.value.fetchedAt < 60_000) return Promise.resolve();
  inflight = fetchAll()
    .then((data) => {
      if (session.value !== s) return;
      persist(key, data);
      catalog.value = index(data, key);
      catalogError.value = false;
    })
    .catch(() => {
      if (!catalog.value) catalogError.value = true;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function clearCatalog() {
  catalog.value = null;
}

/** Saga for a movie, if any. */
export function sagaOf(movieId: string): Item | undefined {
  const c = catalog.value;
  const sid = c?.sagaOf.get(movieId);
  return sid ? c!.byId.get(sid) : undefined;
}

export function sagaChildren(sagaId: string): Item[] {
  const c = catalog.value;
  if (!c) return [];
  return (c.sagaMovies[sagaId] ?? []).map((id) => c.byId.get(id)!).filter(Boolean);
}

/** A saga stands in for its movies in rows ("sagas grouped"). */
export function displayFor(item: Item): Item {
  if (item.Type !== 'Movie') return item;
  return sagaOf(item.Id) ?? item;
}

/** First child with a given artwork, used when a saga lacks its own logo or overview. */
export function representative(item: Item): Item | undefined {
  if (item.Type !== 'BoxSet') return undefined;
  const kids = sagaChildren(item.Id);
  return kids.find((k) => k.ImageTags?.Logo) ?? kids[0];
}

export function isInProgress(item: Item): boolean {
  const p = item.UserData?.PlaybackPositionTicks ?? 0;
  return p > 0 && !item.UserData?.Played;
}
