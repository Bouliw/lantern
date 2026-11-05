import { serverUrl, session } from './client';
import type { Item } from './types';
import { isTV } from '../platform';

export type ImageType = 'Primary' | 'Backdrop' | 'Logo' | 'Thumb' | 'Chapter' | 'Banner';

export interface ImageRef {
  id: string;
  type: ImageType;
  tag?: string;
  index?: number;
}

const dpr = Math.min(window.devicePixelRatio || 1, isTV ? 1 : 2);

/** Rounds widths up to a few fixed sizes so the server and the browser can reuse cached copies. */
function bucket(px: number): number {
  const sizes = [160, 240, 320, 400, 480, 640, 800, 960, 1280, 1600, 1920, 2560];
  const want = px * dpr;
  return sizes.find((s) => s >= want) ?? 2560;
}

export function imageUrl(ref: ImageRef | null | undefined, width: number): string | undefined {
  if (!ref || !serverUrl.value) return undefined;
  const idx = ref.index != null ? `/${ref.index}` : '';
  const q = new URLSearchParams();
  if (ref.tag) q.set('tag', ref.tag);
  q.set('maxWidth', String(bucket(width)));
  q.set('quality', '90');
  return `${serverUrl.value}/Items/${ref.id}/Images/${ref.type}${idx}?${q}`;
}

export function trickplayUrl(itemId: string, width: number, sheet: number, mediaSourceId: string): string {
  const token = session.value?.token ?? '';
  return `${serverUrl.value}/Videos/${itemId}/Trickplay/${width}/${sheet}.jpg?MediaSourceId=${mediaSourceId}&ApiKey=${token}`;
}

// ---- Picking the right artwork --------------------------------------------------

export function backdropOf(item: Item | undefined, fallback?: Item): ImageRef | null {
  if (!item) return null;
  if (item.BackdropImageTags?.length) return { id: item.Id, type: 'Backdrop', tag: item.BackdropImageTags[0], index: 0 };
  if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.length)
    return { id: item.ParentBackdropItemId, type: 'Backdrop', tag: item.ParentBackdropImageTags[0], index: 0 };
  if (fallback) return backdropOf(fallback);
  return null;
}

export function logoOf(item: Item | undefined, fallback?: Item): ImageRef | null {
  if (!item) return null;
  if (item.ImageTags?.Logo) return { id: item.Id, type: 'Logo', tag: item.ImageTags.Logo };
  if (item.ParentLogoItemId && item.ParentLogoImageTag)
    return { id: item.ParentLogoItemId, type: 'Logo', tag: item.ParentLogoImageTag };
  if (fallback) return logoOf(fallback);
  return null;
}

export function thumbOf(item: Item | undefined): ImageRef | null {
  if (!item) return null;
  if (item.ImageTags?.Thumb) return { id: item.Id, type: 'Thumb', tag: item.ImageTags.Thumb };
  if (item.ParentThumbItemId && item.ParentThumbImageTag)
    return { id: item.ParentThumbItemId, type: 'Thumb', tag: item.ParentThumbImageTag };
  return null;
}

export function posterOf(item: Item | undefined): ImageRef | null {
  if (!item) return null;
  if (item.ImageTags?.Primary) return { id: item.Id, type: 'Primary', tag: item.ImageTags.Primary };
  if (item.SeriesId && item.SeriesPrimaryImageTag) return { id: item.SeriesId, type: 'Primary', tag: item.SeriesPrimaryImageTag };
  return null;
}

/** Episode / extra still: its own image, else the parent's backdrop. */
export function stillOf(item: Item | undefined, fallback?: Item): ImageRef | null {
  if (!item) return null;
  if (item.ImageTags?.Primary) return { id: item.Id, type: 'Primary', tag: item.ImageTags.Primary };
  if (item.ImageTags?.Thumb) return { id: item.Id, type: 'Thumb', tag: item.ImageTags.Thumb };
  return backdropOf(item, fallback);
}

// ---- Preloading ------------------------------------------------------------------

const loaded = new Set<string>();
const pending = new Map<string, Promise<void>>();

export function isLoaded(url?: string): boolean {
  return !!url && loaded.has(url);
}

export function markLoaded(url: string) {
  loaded.add(url);
}

export function preload(url?: string): Promise<void> {
  if (!url || loaded.has(url)) return Promise.resolve();
  const existing = pending.get(url);
  if (existing) return existing;
  const p = new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      loaded.add(url);
      pending.delete(url);
      resolve();
    };
    img.onerror = () => {
      pending.delete(url);
      resolve();
    };
    img.src = url;
  });
  pending.set(url, p);
  return p;
}

/** Preloads a batch a few at a time, when the browser is idle. */
export function preloadQueue(urls: (string | undefined)[], concurrency = 4) {
  const list = urls.filter((u): u is string => !!u && !loaded.has(u));
  let i = 0;
  const next = (): void => {
    if (i >= list.length) return;
    const url = list[i++];
    preload(url).then(next);
  };
  const start = () => {
    for (let k = 0; k < concurrency; k++) next();
  };
  const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void) => void);
  if (ric) ric(start);
  else setTimeout(start, 200);
}
