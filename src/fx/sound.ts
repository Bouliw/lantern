/**
 * Interface sounds, synthesized with WebAudio (no audio files to ship or load).
 * Each palette has its own voice: soft sines for Classic, terminal beeps for Eva, 8-bit
 * slides for Pixel, a jazzy stab for P5…
 */
import { effect } from '@preact/signals';
import { appearance } from '../state/settings';
import { route } from '../router';

export type Cue = 'move' | 'select' | 'open' | 'back' | 'play' | 'pause' | 'toggle' | 'error';

interface Note {
  f: number; // start frequency (Hz)
  to?: number; // glide target
  at?: number; // delay (s)
  d: number; // duration (s)
  g?: number; // gain
  w?: OscillatorType;
  lp?: number; // low-pass cutoff
  bell?: boolean; // add an inharmonic partial
}
type Voice = Partial<Record<Cue, Note[]>> & { noise?: Partial<Record<Cue, number>> };

const up = (f: number, ratio: number, w: OscillatorType, d = 0.09, g = 0.5): Note[] => [
  { f, d, w, g },
  { f: f * ratio, d: d * 1.3, w, g, at: d * 0.7 },
];
const down = (f: number, ratio: number, w: OscillatorType, d = 0.09, g = 0.5): Note[] => [
  { f: f * ratio, d, w, g },
  { f, d: d * 1.3, w, g, at: d * 0.7 },
];

const VOICES: Record<string, Voice> = {
  classic: {
    move: [{ f: 1400, d: 0.03, w: 'sine', g: 0.25 }],
    select: [{ f: 880, d: 0.07, w: 'sine', g: 0.45 }],
    toggle: [{ f: 1046, d: 0.05, w: 'sine', g: 0.35 }],
    open: up(523, 1.5, 'sine'),
    back: down(523, 1.5, 'sine'),
    play: up(440, 1.26, 'sine', 0.08),
    pause: down(440, 1.26, 'sine', 0.08),
    error: [{ f: 220, d: 0.18, w: 'triangle', g: 0.5 }],
  },
  eva: {
    move: [{ f: 1760, d: 0.025, w: 'square', g: 0.12 }],
    select: [
      { f: 1320, d: 0.04, w: 'square', g: 0.16 },
      { f: 1320, d: 0.04, w: 'square', g: 0.16, at: 0.07 },
    ],
    toggle: [{ f: 990, d: 0.04, w: 'square', g: 0.14 }],
    open: [
      { f: 880, d: 0.04, w: 'square', g: 0.14 },
      { f: 1320, d: 0.04, w: 'square', g: 0.14, at: 0.06 },
      { f: 1760, d: 0.06, w: 'square', g: 0.14, at: 0.12 },
    ],
    back: [
      { f: 1320, d: 0.04, w: 'square', g: 0.14 },
      { f: 880, d: 0.06, w: 'square', g: 0.14, at: 0.06 },
    ],
    play: [{ f: 660, to: 1320, d: 0.09, w: 'square', g: 0.14 }],
    pause: [{ f: 1320, to: 660, d: 0.09, w: 'square', g: 0.14 }],
    error: [
      { f: 180, d: 0.12, w: 'sawtooth', g: 0.2, lp: 900 },
      { f: 180, d: 0.12, w: 'sawtooth', g: 0.2, lp: 900, at: 0.16 },
    ],
  },
  y2k: {
    move: [{ f: 2093, d: 0.05, w: 'sine', g: 0.18, bell: true }],
    select: [{ f: 1568, d: 0.18, w: 'sine', g: 0.35, bell: true }],
    toggle: [{ f: 1760, d: 0.1, w: 'sine', g: 0.28, bell: true }],
    open: [
      { f: 1046, d: 0.14, w: 'sine', g: 0.3, bell: true },
      { f: 1568, d: 0.22, w: 'sine', g: 0.3, bell: true, at: 0.07 },
    ],
    back: [
      { f: 1568, d: 0.14, w: 'sine', g: 0.3, bell: true },
      { f: 1046, d: 0.22, w: 'sine', g: 0.3, bell: true, at: 0.07 },
    ],
    play: [{ f: 1318, d: 0.2, w: 'sine', g: 0.32, bell: true }],
    pause: [{ f: 988, d: 0.2, w: 'sine', g: 0.32, bell: true }],
    error: [{ f: 330, d: 0.25, w: 'triangle', g: 0.4 }],
  },
  neon: {
    move: [{ f: 220, to: 330, d: 0.05, w: 'sawtooth', g: 0.18, lp: 1600 }],
    select: [{ f: 220, to: 440, d: 0.12, w: 'sawtooth', g: 0.28, lp: 2400 }],
    toggle: [{ f: 330, d: 0.08, w: 'sawtooth', g: 0.22, lp: 1800 }],
    open: [{ f: 110, to: 440, d: 0.22, w: 'sawtooth', g: 0.3, lp: 2600 }],
    back: [{ f: 440, to: 110, d: 0.22, w: 'sawtooth', g: 0.3, lp: 2000 }],
    play: [{ f: 165, to: 330, d: 0.16, w: 'sawtooth', g: 0.3, lp: 2200 }],
    pause: [{ f: 330, to: 165, d: 0.16, w: 'sawtooth', g: 0.3, lp: 1600 }],
    error: [{ f: 82, d: 0.25, w: 'sawtooth', g: 0.35, lp: 600 }],
  },
  glass: {
    move: [{ f: 2637, d: 0.06, w: 'triangle', g: 0.12, bell: true }],
    select: [{ f: 1975, d: 0.3, w: 'triangle', g: 0.25, bell: true }],
    toggle: [{ f: 2349, d: 0.18, w: 'triangle', g: 0.2, bell: true }],
    open: [
      { f: 1567, d: 0.25, w: 'triangle', g: 0.22, bell: true },
      { f: 2349, d: 0.35, w: 'triangle', g: 0.22, bell: true, at: 0.08 },
    ],
    back: [
      { f: 2349, d: 0.25, w: 'triangle', g: 0.22, bell: true },
      { f: 1567, d: 0.35, w: 'triangle', g: 0.22, bell: true, at: 0.08 },
    ],
    play: [{ f: 1760, d: 0.3, w: 'triangle', g: 0.24, bell: true }],
    pause: [{ f: 1318, d: 0.3, w: 'triangle', g: 0.24, bell: true }],
    error: [{ f: 392, d: 0.3, w: 'triangle', g: 0.3 }],
  },
  keynote: {
    move: [{ f: 3000, d: 0.012, w: 'sine', g: 0.12 }],
    select: [{ f: 1200, d: 0.03, w: 'sine', g: 0.3 }],
    toggle: [{ f: 1600, d: 0.02, w: 'sine', g: 0.22 }],
    open: [{ f: 600, to: 900, d: 0.08, w: 'sine', g: 0.3 }],
    back: [{ f: 900, to: 600, d: 0.08, w: 'sine', g: 0.3 }],
    play: [{ f: 800, d: 0.05, w: 'sine', g: 0.3 }],
    pause: [{ f: 600, d: 0.05, w: 'sine', g: 0.3 }],
    error: [{ f: 200, d: 0.12, w: 'sine', g: 0.4 }],
    noise: { move: 0.06, select: 0.12, toggle: 0.1 },
  },
  pixel: {
    move: [{ f: 1046, d: 0.03, w: 'square', g: 0.1 }],
    select: [
      { f: 988, d: 0.05, w: 'square', g: 0.13 },
      { f: 1319, d: 0.16, w: 'square', g: 0.13, at: 0.05 },
    ],
    toggle: [{ f: 784, to: 1046, d: 0.06, w: 'square', g: 0.12 }],
    open: [{ f: 392, to: 1568, d: 0.16, w: 'square', g: 0.12 }],
    back: [{ f: 1568, to: 392, d: 0.16, w: 'square', g: 0.12 }],
    play: [
      { f: 523, d: 0.05, w: 'square', g: 0.12 },
      { f: 659, d: 0.05, w: 'square', g: 0.12, at: 0.05 },
      { f: 784, d: 0.08, w: 'square', g: 0.12, at: 0.1 },
    ],
    pause: [
      { f: 784, d: 0.05, w: 'square', g: 0.12 },
      { f: 523, d: 0.08, w: 'square', g: 0.12, at: 0.05 },
    ],
    error: [{ f: 196, to: 98, d: 0.3, w: 'square', g: 0.14 }],
  },
  p5: {
    move: [{ f: 1568, d: 0.03, w: 'triangle', g: 0.2 }],
    select: [
      // maj7 stab
      { f: 523, d: 0.16, w: 'triangle', g: 0.2 },
      { f: 659, d: 0.16, w: 'triangle', g: 0.2 },
      { f: 784, d: 0.16, w: 'triangle', g: 0.2 },
      { f: 988, d: 0.16, w: 'triangle', g: 0.2 },
    ],
    toggle: [{ f: 1175, d: 0.06, w: 'triangle', g: 0.25 }],
    open: [
      { f: 587, d: 0.2, w: 'triangle', g: 0.18 },
      { f: 740, d: 0.2, w: 'triangle', g: 0.18 },
      { f: 880, d: 0.2, w: 'triangle', g: 0.18 },
      { f: 1109, d: 0.2, w: 'triangle', g: 0.18 },
    ],
    back: [{ f: 880, to: 440, d: 0.12, w: 'triangle', g: 0.28 }],
    play: [{ f: 659, to: 1319, d: 0.1, w: 'triangle', g: 0.28 }],
    pause: [{ f: 1319, to: 659, d: 0.1, w: 'triangle', g: 0.28 }],
    error: [{ f: 147, d: 0.22, w: 'triangle', g: 0.4 }],
    noise: { move: 0.08, select: 0.18, open: 0.2, back: 0.14, toggle: 0.1 },
  },
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let lastMove = 0;

function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return;
  ctx = new AC() as AudioContext;
  master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

function note(n: Note, t0: number) {
  const c = ctx!;
  const t = t0 + (n.at ?? 0);
  const g = c.createGain();
  const peak = n.g ?? 0.4;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + n.d);
  let out: AudioNode = g;
  if (n.lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = n.lp;
    g.connect(f);
    out = f;
  }
  out.connect(master!);
  const partials = n.bell ? [1, 2.76] : [1];
  for (const p of partials) {
    const o = c.createOscillator();
    o.type = n.w ?? 'sine';
    o.frequency.setValueAtTime(n.f * p, t);
    if (n.to) o.frequency.exponentialRampToValueAtTime(n.to * p, t + n.d * 0.8);
    if (p !== 1) {
      const pg = c.createGain();
      pg.gain.value = 0.35;
      o.connect(pg).connect(g);
    } else o.connect(g);
    o.start(t);
    o.stop(t + n.d + 0.02);
  }
}

function noise(gain: number, t: number) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 3500;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(f).connect(g).connect(master!);
  src.start(t);
  src.stop(t + 0.06);
}

export function playSound(cue: Cue) {
  if (!ctx || !appearance.value.sounds || document.hidden) return;
  const now = performance.now();
  if (cue === 'move') {
    if (now - lastMove < 35) return;
    lastMove = now;
  }
  const palette = document.documentElement.dataset.palette ?? 'classic';
  const voice = VOICES[palette] ?? VOICES.classic;
  const notes = voice[cue] ?? VOICES.classic[cue];
  if (!notes) return;
  const t = ctx.currentTime + 0.005;
  for (const n of notes) note(n, t);
  const nz = voice.noise?.[cue];
  if (nz) noise(nz, t);
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
  window.addEventListener('pointerdown', unlock, opts);
  window.addEventListener('keydown', unlock, opts);

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
