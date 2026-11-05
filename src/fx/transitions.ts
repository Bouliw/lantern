/**
 * Page transitions (desktop, "juicy" animations).
 * - Opening a title from a card, the hero or the hover panel morphs its artwork into the
 *   title page's backdrop (View Transitions API).
 * - Other page changes wipe the old page away while the new one slides in behind a band in
 *   the style's own look (red slash for P5, hazard stripes for Eva, neon scan for Neon…).
 *   The app stays visible the whole time; the shapes and colors live in fx.css.
 */
import { hasHover } from '../platform';
import { appearance } from '../state/settings';

type Commit = () => void;

let pendingArt: HTMLElement | null = null;
let pendingAt = 0;
let busy = false;

const root = () => document.documentElement;
const enabled = () => hasHover && root().dataset.motion === 'juicy' && appearance.value.transitions;
const supportsVT = () => typeof (document as any).startViewTransition === 'function';
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function viewTransition(kind: string, update: () => Promise<void>) {
  busy = true;
  const vt = (document as any).startViewTransition(update);
  const done = () => {
    busy = false;
    if (root().dataset.vt === kind) delete root().dataset.vt;
  };
  vt.finished.then(done, done);
}

function morph(art: HTMLElement, commit: Commit) {
  art.style.setProperty('view-transition-name', 'lantern-art');
  viewTransition('morph', async () => {
    art.style.removeProperty('view-transition-name');
    root().dataset.vt = 'morph';
    commit();
    await wait(40);
  });
}

function wipe(commit: Commit) {
  root().dataset.vt = 'wipe';
  viewTransition('wipe', async () => {
    commit();
    await wait(40);
  });
}

/** Called by the router for every page change. */
export function transition(from: string[], to: string[], commit: Commit) {
  const art = pendingArt && performance.now() - pendingAt < 1500 && pendingArt.isConnected ? pendingArt : null;
  pendingArt = null;
  if (!enabled() || busy || to[0] === 'play' || from[0] === 'play') return commit();
  if (to[0] === 'item' && art && supportsVT()) return morph(art, commit);
  if (supportsVT()) return wipe(commit);
  commit();
}

export function initTransitions() {
  if (!hasHover) return;
  document.addEventListener(
    'click',
    (e) => {
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#/item/"]');
      if (!link) return;
      pendingArt =
        link.closest('.card')?.querySelector<HTMLElement>('.card-media') ??
        link.closest('.hover-panel')?.querySelector<HTMLElement>('.hp-media') ??
        (link.closest('.hero') ? document.querySelector<HTMLElement>('.hero-slide.active') : null);
      pendingAt = performance.now();
    },
    true,
  );
}
