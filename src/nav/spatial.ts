import { playSound } from '../fx/sound';
/**
 * Remote-control navigation for TVs.
 * - Elements with [data-nav] are focusable targets.
 * - [data-row] groups cards: left/right stays inside the row, up/down jumps to the
 *   closest row and lands on the card last focused there.
 * - The topmost [data-nav-layer] (player, dialogs) traps focus.
 * Everything is instant: no smooth scrolling, the page simply follows the focus.
 */
import { isTV } from '../platform';

export type Dir = 'left' | 'right' | 'up' | 'down';
const KEY_DIR: Record<number, Dir> = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };

export const KEY = {
  enter: 13,
  back: 461,
  escape: 27,
  backspace: 8,
  play: 415,
  pause: 19,
  playPause: 179,
  stop: 413,
  rewind: 412,
  forward: 417,
};

export function isBackKey(e: KeyboardEvent): boolean {
  return e.keyCode === KEY.back || e.key === 'GoBack' || e.key === 'BrowserBack';
}

type KeyHandler = (e: KeyboardEvent) => boolean;
const handlers: KeyHandler[] = [];

/** Handlers run newest-first before default navigation; return true to consume the key. */
export function pushKeyHandler(h: KeyHandler): () => void {
  handlers.push(h);
  return () => {
    const i = handlers.lastIndexOf(h);
    if (i >= 0) handlers.splice(i, 1);
  };
}

export function runKeyHandlers(e: KeyboardEvent): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) if (handlers[i](e)) return true;
  return false;
}

function topLayer(): ParentNode {
  const layers = document.querySelectorAll('[data-nav-layer]');
  return layers.length ? layers[layers.length - 1] : document;
}

function visible(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled') || el.closest('[hidden],[aria-hidden="true"]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function focusables(root: ParentNode = topLayer()): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-nav]')).filter(visible);
}

const rowOf = (el: Element) => el.closest<HTMLElement>('[data-row]');

function score(from: DOMRect, to: DOMRect, dir: Dir): number | null {
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;
  let primary: number;
  let overlap: boolean;
  let offset: number;
  if (dir === 'left' || dir === 'right') {
    if (dir === 'right' ? tx <= fx + 1 || to.right <= from.right : tx >= fx - 1 || to.left >= from.left) return null;
    primary = dir === 'right' ? Math.max(0, to.left - from.right) : Math.max(0, from.left - to.right);
    overlap = to.top < from.bottom && to.bottom > from.top;
    offset = Math.abs(ty - fy);
  } else {
    if (dir === 'down' ? ty <= fy + 1 || to.bottom <= from.bottom : ty >= fy - 1 || to.top >= from.top) return null;
    primary = dir === 'down' ? Math.max(0, to.top - from.bottom) : Math.max(0, from.top - to.bottom);
    overlap = to.left < from.right && to.right > from.left;
    offset = Math.abs(tx - fx);
  }
  return primary + (overlap ? 0 : offset * 2) + offset * 0.05;
}

function rowItems(row: HTMLElement) {
  return focusables(row);
}

export function focusElement(el: HTMLElement | null | undefined, opts: { scroll?: boolean } = {}) {
  if (!el) return;
  if (isTV && el !== document.activeElement) playSound('move');
  el.focus({ preventScroll: true });
  const row = rowOf(el);
  if (row) {
    const items = rowItems(row);
    row.dataset.lastIndex = String(Math.max(0, items.indexOf(el)));
    alignInRow(row, el);
  }
  if (opts.scroll !== false) followFocus(el, row);
}

/** Keeps the focused card at the start of its row (clamped at the end). */
function alignInRow(row: HTMLElement, el: HTMLElement) {
  const track = row.querySelector<HTMLElement>('[data-row-track]');
  if (!track) return;
  const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
  const max = track.scrollWidth - track.clientWidth;
  track.scrollLeft = Math.max(0, Math.min(el.offsetLeft - pad, max));
}

/** Vertically centers the focused row (or element); the hero pins the page to the top. */
function followFocus(el: HTMLElement, row: HTMLElement | null) {
  if (el.closest('[data-nav-fixed],[data-nav-layer]')) return;
  if (el.closest('[data-nav-top]')) {
    window.scrollTo(0, 0);
    return;
  }
  const r = (row ?? el).getBoundingClientRect();
  const y = window.scrollY + r.top + r.height / 2 - window.innerHeight / 2;
  window.scrollTo(0, Math.max(0, y));
}

export function move(dir: Dir): boolean {
  const root = topLayer();
  const all = focusables(root);
  const current = document.activeElement as HTMLElement | null;
  if (!current || !all.includes(current)) {
    focusFirst(root);
    return true;
  }
  const row = rowOf(current);
  if (row && (dir === 'left' || dir === 'right')) {
    const items = rowItems(row);
    const i = items.indexOf(current);
    const next = items[dir === 'left' ? i - 1 : i + 1];
    if (next) focusElement(next);
    return true;
  }
  const from = current.getBoundingClientRect();
  let best: { el?: HTMLElement; row?: HTMLElement } | null = null;
  let bestScore = Infinity;
  const seen = new Set<HTMLElement>();
  const inHeader = !!current.closest('[data-nav-fixed]');
  const horizontal = dir === 'left' || dir === 'right';
  for (const el of all) {
    if (el === current) continue;
    if (horizontal && !inHeader && el.closest('[data-nav-fixed]')) continue;
    const r = rowOf(el);
    if (r) {
      if (r === row || seen.has(r)) continue;
      seen.add(r);
      const track = r.querySelector<HTMLElement>('[data-row-track]') ?? r;
      const s = score(from, track.getBoundingClientRect(), dir);
      if (s !== null && s < bestScore) {
        bestScore = s;
        best = { row: r };
      }
    } else {
      const s = score(from, el.getBoundingClientRect(), dir);
      if (s !== null && s < bestScore) {
        bestScore = s;
        best = { el };
      }
    }
  }
  if (!best) return false;
  if (best.row) {
    const items = rowItems(best.row);
    focusElement(items[Number(best.row.dataset.lastIndex) || 0] ?? items[0]);
  } else focusElement(best.el);
  return true;
}

export function focusFirst(root: ParentNode = topLayer()) {
  const auto = root.querySelector<HTMLElement>('[data-nav-autofocus]');
  const target = auto && visible(auto) ? auto : focusables(root).find((el) => !el.closest('[data-nav-fixed]'));
  focusElement(target ?? focusables(root)[0]);
}

/** Restores focus to an element by its data-key (used when coming back to a page). */
export function focusByKey(key?: string): boolean {
  if (!key) return false;
  const el = document.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
  if (!el || !visible(el)) return false;
  focusElement(el);
  return true;
}

export function initSpatialNav() {
  document.addEventListener(
    'keydown',
    (e) => {
      if (runKeyHandlers(e)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (!isTV) return;
      const dir = KEY_DIR[e.keyCode];
      const target = e.target as HTMLElement;
      if (dir) {
        if (target instanceof HTMLInputElement && (dir === 'left' || dir === 'right')) {
          const atStart = target.selectionStart === 0;
          const atEnd = target.selectionEnd === target.value.length;
          if ((dir === 'left' && !atStart) || (dir === 'right' && !atEnd)) return;
        }
        e.preventDefault();
        move(dir);
        return;
      }
      if (e.keyCode === KEY.enter && target?.matches?.('[data-nav]') && !/^(A|BUTTON|INPUT|SELECT)$/.test(target.tagName)) {
        e.preventDefault();
        target.click();
      }
    },
    true,
  );
  if (isTV) {
    // Magic Remote pointer: hovering focuses, like the native TV apps.
    document.addEventListener('mouseover', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]');
      if (el && el !== document.activeElement) focusElement(el, { scroll: false });
    });
  }
}
