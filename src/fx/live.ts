/**
 * Live thumbnails: after a short pause on a title, its artwork turns into a quick silent
 * montage made of the trickplay frames Jellyfin already generated (one sheet, ~6 fps).
 * Desktop: inside the hover panel. TV: inside the focused card.
 */
import type { Item, ItemsResult, TrickplayInfo } from '../api/types';
import { api, userId } from '../api/client';
import { catalog, representative } from '../api/catalog';
import { preload, trickplayUrl } from '../api/images';
import { appearance } from '../state/settings';
import { isTV } from '../platform';

interface Source {
  id: string;
  sourceId: string;
  info: TrickplayInfo;
  width: number;
}

const FIELDS = 'Trickplay,MediaSources';
const sources = new Map<string, Promise<Source | null>>();

function pick(item: Item | undefined): Source | null {
  if (!item?.Trickplay) return null;
  const entry = Object.entries(item.Trickplay)[0];
  if (!entry) return null;
  const [sourceId, byWidth] = entry;
  const widths = Object.keys(byWidth).map(Number).sort((a, b) => a - b);
  const width = widths.find((w) => w >= 240) ?? widths[widths.length - 1];
  return width ? { id: item.Id, sourceId, info: byWidth[String(width)], width } : null;
}

async function resolve(item: Item): Promise<Source | null> {
  try {
    if (item.Type === 'Series') {
      const res = await api<ItemsResult>(`/Shows/${item.Id}/Episodes`, { query: { UserId: userId(), Limit: 1, Fields: FIELDS } });
      return pick(res.Items[0]);
    }
    const target = item.Type === 'BoxSet' ? representative(item) : item;
    if (!target) return null;
    return pick(await api<Item>(`/Users/${userId()}/Items/${target.Id}`, { query: { Fields: FIELDS } }));
  } catch {
    return null;
  }
}

function sourceOf(item: Item): Promise<Source | null> {
  let p = sources.get(item.Id);
  if (!p) {
    p = resolve(item);
    sources.set(item.Id, p);
  }
  return p;
}

/** Starts the montage inside `box` (an artwork container); returns a stop function. */
export function startLive(box: HTMLElement, item: Item): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let el: HTMLDivElement | null = null;

  void (async () => {
    const src = await sourceOf(item);
    if (stopped || !src) return;
    const { info } = src;
    const perSheet = info.TileWidth * info.TileHeight;
    const sheets = Math.ceil(info.ThumbnailCount / perSheet);
    const sheet = Math.min(sheets - 1, Math.floor(sheets * 0.3));
    const count = Math.min(perSheet, info.ThumbnailCount - sheet * perSheet);
    if (count < 4) return;
    const url = trickplayUrl(src.id, src.width, sheet, src.sourceId);
    await preload(url);
    if (stopped || !box.isConnected) return;

    const rect = box.getBoundingClientRect();
    const boxAr = rect.width / Math.max(1, rect.height);
    const ar = info.Width / info.Height;
    const frame = document.createElement('div');
    frame.className = 'live-frame';
    if (ar >= boxAr) {
      const w = (ar / boxAr) * 100;
      Object.assign(frame.style, { height: '100%', width: `${w}%`, left: `${(100 - w) / 2}%`, top: '0' });
    } else {
      const h = (boxAr / ar) * 100;
      Object.assign(frame.style, { width: '100%', height: `${h}%`, top: `${(100 - h) / 2}%`, left: '0' });
    }
    frame.style.backgroundImage = `url("${url}")`;
    frame.style.backgroundSize = `${info.TileWidth * 100}% ${info.TileHeight * 100}%`;
    const tw = info.TileWidth;
    const th = info.TileHeight;
    let i = 0;
    const show = () => {
      const col = i % tw;
      const row = Math.floor(i / tw);
      frame.style.backgroundPosition = `${tw > 1 ? (col / (tw - 1)) * 100 : 0}% ${th > 1 ? (row / (th - 1)) * 100 : 0}%`;
      i = (i + 1) % count;
    };
    show();
    el = document.createElement('div');
    el.className = 'live';
    el.append(frame);
    const img = box.querySelector('img');
    if (img) img.after(el);
    else box.prepend(el);
    requestAnimationFrame(() => el?.classList.add('on'));
    timer = setInterval(show, 170);
  })();

  return () => {
    stopped = true;
    clearInterval(timer);
    el?.remove();
  };
}

/** Live previews are part of the content, but "Animations: off" on a computer turns them off. */
export const liveAllowed = () => isTV || appearance.value.motion !== 'off';

/** TV: the focused card comes alive after a short dwell. */
export function initLiveFocus() {
  if (!isTV) return;
  let stop: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    clearTimeout(timer);
    stop?.();
    stop = null;
  };
  document.addEventListener('focusin', (e) => {
    clear();
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
    if (!card || appearance.value.cards !== 'landscape') return;
    timer = setTimeout(() => {
      const item = catalog.value?.byId.get(card.dataset.card!);
      const box = card.querySelector<HTMLElement>('.card-media');
      if (item && box && document.activeElement === card) stop = startLive(box, item);
    }, 900);
  });
  document.addEventListener('focusout', (e) => {
    if ((e.target as HTMLElement).closest?.('[data-card]')) clear();
  });
}
