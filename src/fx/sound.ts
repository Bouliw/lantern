/**
 * Interface sounds: short musical gestures played on synthesized instruments, in the key of
 * each style's background music (electric piano for Classic, bells for Eva and Glass,
 * marimba and water drops for Y2K, soft plucks for Neon, jazzy Rhodes for P5…).
 */
import { effect } from '@preact/signals';
import { appearance } from '../state/settings';
import { route } from '../router';
import { bell, chip, ctx, drop, epiano, hat, marimba, onAudio, pluck, setReverb, sfxBus, unlockAudio } from './audio';

export type Cue = 'move' | 'select' | 'open' | 'back' | 'play' | 'pause' | 'toggle' | 'error';

type Inst = 'epiano' | 'bell' | 'marimba' | 'pluck' | 'chip';
interface Kit {
  root: number; // MIDI note
  minor: boolean;
  inst: Inst;
  move: 'tick' | 'note' | 'drop';
  reverb: number;
}

const KITS: Record<string, Kit> = {
  classic: { root: 72, minor: false, inst: 'epiano', move: 'tick', reverb: 0.22 },
  eva: { root: 69, minor: true, inst: 'bell', move: 'tick', reverb: 0.4 },
  y2k: { root: 76, minor: false, inst: 'marimba', move: 'drop', reverb: 0.3 },
  neon: { root: 69, minor: true, inst: 'pluck', move: 'note', reverb: 0.38 },
  glass: { root: 84, minor: false, inst: 'bell', move: 'drop', reverb: 0.5 },
  keynote: { root: 77, minor: false, inst: 'marimba', move: 'tick', reverb: 0.16 },
  pixel: { root: 72, minor: false, inst: 'chip', move: 'note', reverb: 0.12 },
  p5: { root: 74, minor: true, inst: 'epiano', move: 'tick', reverb: 0.26 },
};

// Gestures as [semitones above the root, delay in s, velocity].
type Gesture = [number, number, number][];
const third = (k: Kit) => (k.minor ? 3 : 4);
const seventh = (k: Kit) => (k.minor ? 10 : 11);

function gesture(cue: Cue, k: Kit): Gesture {
  switch (cue) {
    case 'select':
      return [[7, 0, 0.42], [12, 0.035, 0.38]];
    case 'toggle':
      return [[third(k) + 12, 0, 0.36]];
    case 'open':
      return [[0, 0, 0.32], [third(k), 0.05, 0.32], [7, 0.1, 0.34], [seventh(k), 0.15, 0.3]];
    case 'back':
      return [[7, 0, 0.32], [0, 0.07, 0.3]];
    case 'play':
      return [[0, 0, 0.36], [7, 0.018, 0.32], [third(k) + 12, 0.036, 0.3], [14, 0.054, 0.26]];
    case 'pause':
      return [[7, 0, 0.3], [third(k), 0.06, 0.26]];
    case 'error':
      return [[-7, 0, 0.32], [-8, 0.09, 0.3]];
    case 'move':
      return [[19, 0, 0.14]];
  }
}

function strike(k: Kit, m: number, t: number, vel: number) {
  const out = sfxBus!;
  switch (k.inst) {
    case 'epiano':
      return epiano(out, t, m, 1.4, vel);
    case 'bell':
      return bell(out, t, m, 2.2, vel);
    case 'marimba':
      return marimba(out, t, m, 0.8, vel);
    case 'pluck':
      return pluck(out, t, m, 0.7, vel, { cutoff: 1500 });
    case 'chip':
      return chip(out, t, m, 0.18, vel * 1.4, 'square');
  }
}

let lastMove = 0;

const kitFor = (): Kit => KITS[document.documentElement.dataset.palette ?? 'classic'] ?? KITS.classic;

export function playSound(cue: Cue) {
  if (!ctx || !sfxBus || !appearance.value.sounds || document.hidden) return;
  const now = performance.now();
  if (cue === 'move') {
    if (now - lastMove < 45) return;
    lastMove = now;
  }
  const k = kitFor();
  setReverb('sfx', k.reverb);
  const t = ctx.currentTime + 0.004;
  if (cue === 'move' && k.move === 'tick') return hat(sfxBus, t, 0.5, 3200, 0.018);
  if (cue === 'move' && k.move === 'drop') return drop(sfxBus, t, k.root + 12, 0.35);
  for (const [semi, delay, vel] of gesture(cue, k)) strike(k, k.root + semi, t + delay, vel);
}

/** Section depth, so moving deeper sounds like "open" and coming back like "back". */
function depth(parts: string[]): number {
  const [head] = parts;
  if (!head) return 0;
  if (head === 'item') return 2;
  if (head === 'play') return 3;
  return 1;
}

export function initSound() {
  const opts = { capture: true, passive: true } as const;
  window.addEventListener('pointerdown', unlockAudio, opts);
  window.addEventListener('keydown', unlockAudio, opts);
  onAudio(() => setReverb('sfx', kitFor().reverb));

  // Controls that don't navigate get a click; links are covered by the route change below.
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(
        'button, [role="button"], .segment, .chip, .swatch, .theme-option, .tab',
      );
      if (!el || el.closest('a[href]')) return;
      const cue = el.dataset.sound;
      if (cue === 'none') return;
      playSound((cue as Cue) || 'select');
    },
    true,
  );

  let prev = depth(route.value.parts);
  let prevKey = route.value.key;
  effect(() => {
    const r = route.value;
    if (r.key === prevKey) return;
    const d = depth(r.parts);
    if (d === 3) playSound('play');
    else if (d > prev) playSound('open');
    else if (d < prev) playSound('back');
    else playSound('toggle');
    prev = d;
    prevKey = r.key;
  });
}
