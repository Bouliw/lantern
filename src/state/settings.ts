import { computed, effect, signal } from '@preact/signals';
import { api, load, persist, serverUrl, session, userId } from '../api/client';
import { THEMES, THEME_BG, inkFor, type ThemeId } from '../themes/themes';
import { isTV } from '../platform';

export type Motion = 'juicy' | 'subtle' | 'off';
export type CardShape = 'landscape' | 'poster';
export type CardSize = 's' | 'm' | 'l';
export type Scope = 'profile' | 'device';

export interface Appearance {
  theme: ThemeId | 'custom';
  custom: { palette: ThemeId; type: ThemeId; shape: ThemeId };
  accent: string | null;
  motion: Motion;
  cards: CardShape;
  size: CardSize;
  /** Interface sounds. */
  sounds: boolean;
  /** Tint the page with the colors of the artwork on screen. */
  ambient: boolean;
  /** Generative background music in the style's mood. */
  music: boolean;
  /** Animated page changes (computer only). */
  transitions: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'classic',
  custom: { palette: 'classic', type: 'classic', shape: 'classic' },
  accent: null,
  motion: 'juicy',
  cards: 'landscape',
  size: 'm',
  sounds: true,
  ambient: true,
  music: true,
  transitions: true,
};

const SCOPE_KEY = 'lantern.appearance.scope';
const DEVICE_KEY = 'lantern.appearance.device';
const PREF_ID = 'lantern';
const PREF_CLIENT = 'lantern';

const profileKey = () => `lantern.appearance.profile.${serverUrl.value}|${userId()}`;

/** Style ids used by earlier versions. */
const RENAMED: Record<string, ThemeId> = { titlecard: 'eva', chrome: 'y2k', ransom: 'p5' };

function sanitize(a: Partial<Appearance> | null | undefined): Appearance {
  const merged = { ...DEFAULT_APPEARANCE, ...(a ?? {}) } as Appearance;
  merged.custom = { ...DEFAULT_APPEARANCE.custom, ...(a?.custom ?? {}) };
  merged.theme = (RENAMED[merged.theme] ?? merged.theme) as Appearance['theme'];
  for (const k of ['palette', 'type', 'shape'] as const) merged.custom[k] = RENAMED[merged.custom[k]] ?? merged.custom[k];
  const ok = (t: string): t is ThemeId => (THEMES as readonly string[]).includes(t);
  if (merged.theme !== 'custom' && !ok(merged.theme)) merged.theme = 'classic';
  for (const k of ['palette', 'type', 'shape'] as const) if (!ok(merged.custom[k])) merged.custom[k] = 'classic';
  return merged;
}

export const scope = signal<Scope>(load<Scope>(SCOPE_KEY, 'profile'));
const deviceAppearance = signal<Appearance | null>(load<Appearance | null>(DEVICE_KEY, null));
const profileAppearance = signal<Appearance | null>(null);

export const appearance = computed<Appearance>(() =>
  sanitize(scope.value === 'device' ? deviceAppearance.value : profileAppearance.value ?? deviceAppearance.value),
);

export function setAppearance(patch: Partial<Appearance>) {
  const next = sanitize({ ...appearance.value, ...patch });
  if (scope.value === 'device') {
    deviceAppearance.value = next;
    persist(DEVICE_KEY, next);
  } else {
    profileAppearance.value = next;
    persist(profileKey(), next);
    scheduleSync(next);
  }
}

export function setScope(next: Scope) {
  const current = appearance.value;
  scope.value = next;
  persist(SCOPE_KEY, next);
  setAppearance(current);
}

export function resetAppearance() {
  setAppearance({ ...DEFAULT_APPEARANCE });
}

/** Loads the profile's appearance: cached copy first, then the copy stored on the server. */
export async function loadProfileAppearance() {
  if (!session.value) return;
  profileAppearance.value = load<Appearance | null>(profileKey(), null);
  try {
    const prefs = await api<{ CustomPrefs?: Record<string, string> }>(`/DisplayPreferences/${PREF_ID}`, {
      query: { userId: userId(), client: PREF_CLIENT },
    });
    const raw = prefs?.CustomPrefs?.appearance;
    if (raw) {
      const a = sanitize(JSON.parse(raw));
      profileAppearance.value = a;
      persist(profileKey(), a);
    }
  } catch {
    /* offline: keep the cached copy */
  }
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSync(a: Appearance) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const query = { userId: userId(), client: PREF_CLIENT };
      const prefs = await api<Record<string, any>>(`/DisplayPreferences/${PREF_ID}`, { query });
      prefs.CustomPrefs = { ...(prefs.CustomPrefs ?? {}), appearance: JSON.stringify(a) };
      await api(`/DisplayPreferences/${PREF_ID}`, { method: 'POST', query, body: prefs });
    } catch {
      /* will retry on the next change */
    }
  }, 800);
}

export function resolvedParts(a: Appearance) {
  return a.theme === 'custom' ? a.custom : { palette: a.theme, type: a.theme, shape: a.theme };
}

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

effect(() => {
  const a = appearance.value;
  const root = document.documentElement;
  const parts = resolvedParts(a);
  root.dataset.palette = parts.palette;
  root.dataset.type = parts.type;
  root.dataset.shape = parts.shape;
  root.dataset.motion = isTV ? 'off' : reduceMotion.matches && a.motion === 'juicy' ? 'subtle' : a.motion;
  root.dataset.cards = a.cards;
  root.dataset.size = a.size;
  root.dataset.ambient = a.ambient ? 'on' : 'off';
  if (a.accent) {
    root.style.setProperty('--accent', a.accent);
    root.style.setProperty('--accent-ink', inkFor(a.accent));
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-ink');
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BG[parts.palette]);
});
