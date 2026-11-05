/**
 * Page transitions (desktop, "juicy" animations).
 * - Opening a title from a card, the hero or the hover panel morphs its artwork into the
 *   title page's backdrop (View Transitions API).
 * - Other page changes use the style's own signature: a crossfade for Classic, a slide for
 *   Keynote, a red slash for P5, a black title card for Eva, a stepped fade for Pixel…
 */
import { catalog } from '../api/catalog';
import { hasHover } from '../platform';
import { t } from '../i18n';

type Commit = () => void;

let pendingArt: HTMLElement | null = null;
let pendingAt = 0;
let busy = false;

const root = () => document.documentElement;
const enabled = () => hasHover && root().dataset.motion === 'juicy';
const supportsVT = () => typeof (document as any).startViewTransition === 'function';
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function labelFor(parts: string[]): string {
  const [head, arg] = parts;
  switch (head) {
    case undefined:
      return t('nav.home');
    case 'series':
      return t('nav.series');
    case 'sagas':
      return t('nav.sagas');
    case 'films':
      return t('nav.films');
    case 'search':
      return t('nav.search');
    case 'settings':
      return t('nav.settings');
    case 'item':
      return catalog.value?.byId.get(arg)?.Name ?? '';
    default:
      return '';
  }
}

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

/** Eva: a black title card with the destination in big condensed serif. */
function titleCard(label: string, commit: Commit) {
  const card = document.createElement('div');
  card.className = 'title-card';
  const text = document.createElement('span');
  text.textContent = label;
  card.append(text);
  document.body.append(card);
  busy = true;
  setTimeout(commit, 110);
  setTimeout(() => card.classList.add('out'), 420);
  setTimeout(() => {
    card.remove();
    busy = false;
  }, 640);
}

/** Called by the router for every page change. */
export function transition(from: string[], to: string[], commit: Commit) {
  const art = pendingArt && performance.now() - pendingAt < 1500 && pendingArt.isConnected ? pendingArt : null;
  pendingArt = null;
  if (!enabled() || busy || to[0] === 'play' || from[0] === 'play') return commit();
  if (to[0] === 'item' && art && supportsVT()) return morph(art, commit);
  if (root().dataset.palette === 'eva') {
    const label = labelFor(to);
    return label ? titleCard(label, commit) : commit();
  }
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
