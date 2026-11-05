/**
 * Interface sounds: short musical gestures played on synthesized instruments, in the key of
 * each style's background music (electric piano for Classic, felt piano for Eva and Glass,
 * marimba and water drops for Y2K, soft plucks for Neon, jazzy Rhodes for P5…). They sit in
 * a warm middle register and stay within an octave, so they never get shrill or intrusive.
 */
import { effect } from '@preact/signals';
import { appearance } from '../state/settings';
import { route } from '../router';
import { chip, ctx, drop, epiano, felt, hat, marimba, onAudio, pad, pluck, setReverb, sfxBus, unlockAudio } from './audio';

export type Cue = 'move' | 'select' | 'open' | 'back' | 'play' | 'pause' | 'toggle' | 'error';

type Inst = 'epiano' | 'felt' | 'marimba' | 'pluck' | 'chip';
interface Kit {
  root: number; // MIDI note
  minor: boolean;
  inst: Inst;
  move: 'tick' | 'note' | 'drop';
  reverb: number;
}

const KITS: Record<string, Kit> = {
  classic: { root: 63, minor: false, inst: 'epiano', move: 'tick', reverb: 0.22 },
  eva: { root: 64, minor: true, inst: 'felt', move: 'tick', reverb: 0.3 },
  y2k: { root: 64, minor: false, inst: 'marimba', move: 'drop', reverb: 0.26 },
  neon: { root: 57, minor: true, inst: 'pluck', move: 'note', reverb: 0.3 },
  glass: { root: 62, minor: false, inst: 'felt', move: 'tick', reverb: 0.34 },
  keynote: { root: 65, minor: false, inst: 'marimba', move: 'tick', reverb: 0.16 },
  pixel: { root: 60, minor: false, inst: 'chip', move: 'note', reverb: 0.12 },
  p5: { root: 62, minor: true, inst: 'epiano', move: 'tick', reverb: 0.24 },
};

// Gestures as [semitones above the root, delay in s, velocity].
type Gesture = [number, number, number][];
const third = (k: Kit) => (k.minor ? 3 : 4);
const seventh = (k: Kit) => (k.minor ? 10 : 11);

function gesture(cue: Cue, k: Kit): Gesture {
  switch (cue) {
    case 'select':
      return [[0, 0, 0.38], [7, 0.035, 0.34]];
    case 'toggle':
      return [[third(k), 0, 0.32]];
    case 'open':
      return [[0, 0, 0.3], [third(k), 0.05, 0.3], [7, 0.1, 0.32], [seventh(k), 0.15, 0.26]];
    case 'back':
      return [[7, 0, 0.3], [0, 0.07, 0.28]];
    case 'play':
      return [[0, 0, 0.34], [7, 0.02, 0.3], [12, 0.04, 0.26]];
    case 'pause':
      return [[7, 0, 0.28], [third(k), 0.06, 0.24]];
    case 'error':
      return [[-5, 0, 0.3], [-7, 0.09, 0.28]];
    case 'move':
      return [[12, 0, 0.1]];
  }
}

function strike(k: Kit, m: number, t: number, vel: number) {
  const out = sfxBus!;
  switch (k.inst) {
    case 'epiano':
      return epiano(out, t, m, 1.4, vel);
    case 'felt':
      return felt(out, t, m, 1.4, vel * 1.15);
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
  if (cue === 'move' && k.move === 'tick') return hat(sfxBus, t, 0.35, 2600, 0.014);
  if (cue === 'move' && k.move === 'drop') return drop(sfxBus, t, k.root, 0.28);
  for (const [semi, delay, vel] of gesture(cue, k)) strike(k, k.root + semi, t + delay, vel);
}

/** Opening sting: a soft chord swells, then the style's instrument rises through it. */
export function playSting() {
  if (!ctx || !sfxBus) return;
  const k = kitFor();
  setReverb('sfx', Math.max(k.reverb, 0.38));
  const t = ctx.currentTime + 0.02;
  const chord = [0, 7, third(k) + 12, seventh(k) + 12].map((s) => k.root - 12 + s);
  pad(sfxBus, t, chord, 1.1, 1.5, { wave: 'triangle', cutoff: 1800, attack: 0.45, release: 1.6 });
  [0, third(k), 7, 12].forEach((s, i) => strike(k, k.root + s, t + 0.35 + i * 0.08, 0.3 - i * 0.025));
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
