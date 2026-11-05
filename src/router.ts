import { signal } from '@preact/signals';
import { transition } from './fx/transitions';

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
  key: string;
}

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const clean = path.startsWith('/') ? path : '/' + path;
  return { path: clean, parts: clean.split('/').filter(Boolean), query: new URLSearchParams(qs), key: raw };
}

export const route = signal<Route>(parse());

interface Memory { scrollY: number; focusKey?: string }
const memory = new Map<string, Memory>();
let lastKey = route.value.key;

/** Remember where we were on the page we are leaving (scroll + focused element). */
function remember(key: string) {
  const active = document.activeElement as HTMLElement | null;
  memory.set(key, { scrollY: window.scrollY, focusKey: active?.dataset?.key });
}

export function recall(key: string): Memory | undefined {
  return memory.get(key);
}

window.addEventListener('hashchange', () => {
  const next = parse();
  if (next.key === lastKey) return;
  remember(lastKey);
  lastKey = next.key;
  transition(route.value.parts, next.parts, () => {
    if (lastKey === next.key) route.value = next;
  });
});

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = '#' + (to.startsWith('/') ? to : '/' + to);
  if (hash === location.hash || (hash === '#/' && !location.hash)) return;
  remember(route.value.key);
  if (opts.replace) {
    history.replaceState(null, '', hash);
    lastKey = parse().key;
    route.value = parse();
  } else {
    location.hash = hash;
  }
}

export function goBack() {
  remember(route.value.key);
  if (history.length > 1 && route.value.path !== '/') history.back();
  else navigate('/', { replace: true });
}

export const hrefItem = (id: string) => `#/item/${id}`;
export const hrefPlay = (id: string, startTicks?: number) =>
  `#/play/${id}${startTicks != null ? `?t=${Math.floor(startTicks)}` : ''}`;
