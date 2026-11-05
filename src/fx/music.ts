/**
 * Background music: a small generative composer that plays quietly while browsing, in the
 * mood of the current style (lounge Rhodes for Classic, melancholic strings and bells for
 * Eva, Frutiger-aero marimba for Y2K, synthwave for Neon, acid jazz for P5…).
 * Never the same twice; it fades out in the player, when the app is hidden, or when turned off.
 */
import { effect } from '@preact/signals';
import { appearance, resolvedParts } from '../state/settings';
import { route } from '../router';
import { bass, bell, chip, ctx, drop, epiano, hat, marimba, musicBus, onAudio, pad, pluck, setReverb } from './audio';

type Voice = 'epiano' | 'bell' | 'marimba' | 'pluck' | 'chip' | 'drop';

interface Song {
  bpm: number;
  chords: number[][];
  roots: number[];
  bars: number; // bars per chord
  pad?: { wave: OscillatorType; cutoff: number; vel: number };
  comp?: boolean; // Rhodes stabs instead of a pad
  bass: 'whole' | 'pulse' | 'walk' | 'chip';
  bassVel: number;
  hats?: number;
  swing?: number;
  arp?: { voice: Voice; every: number; vel: number; octave: number };
  lead: { voice: Voice; prob: number; low: number; high: number; dur: number; vel: number };
  scale: number[]; // pitch classes
  reverb: number;
}

const MAJOR = (k: number) => [0, 2, 4, 5, 7, 9, 11].map((x) => (x + k) % 12);
const MINOR = (k: number) => [0, 2, 3, 5, 7, 8, 10].map((x) => (x + k) % 12);

const SONGS: Record<string, Song> = {
  classic: {
    bpm: 72,
    chords: [[60, 64, 67, 71, 74], [57, 60, 64, 67, 71], [53, 57, 60, 64, 67], [55, 59, 62, 64, 69]],
    roots: [36, 33, 41, 43],
    bars: 2,
    pad: { wave: 'triangle', cutoff: 1500, vel: 0.9 },
    bass: 'whole',
    bassVel: 0.6,
    lead: { voice: 'epiano', prob: 0.16, low: 72, high: 86, dur: 1.8, vel: 0.3 },
    scale: MAJOR(0),
    reverb: 0.5,
  },
  eva: {
    bpm: 60,
    chords: [[57, 60, 64, 71], [53, 57, 60, 64], [55, 60, 64, 67], [52, 55, 59, 62]],
    roots: [33, 29, 31, 28],
    bars: 2,
    pad: { wave: 'sawtooth', cutoff: 850, vel: 1 },
    bass: 'whole',
    bassVel: 0.55,
    lead: { voice: 'bell', prob: 0.12, low: 69, high: 84, dur: 3, vel: 0.28 },
    scale: MINOR(9),
    reverb: 0.62,
  },
  y2k: {
    bpm: 86,
    chords: [[64, 68, 71, 75], [61, 64, 68, 71, 75], [57, 61, 64, 68, 71], [59, 64, 66, 68]],
    roots: [40, 37, 45, 47],
    bars: 2,
    pad: { wave: 'triangle', cutoff: 2600, vel: 0.7 },
    bass: 'whole',
    bassVel: 0.45,
    arp: { voice: 'drop', every: 2, vel: 0.2, octave: 12 },
    lead: { voice: 'marimba', prob: 0.14, low: 76, high: 88, dur: 0.8, vel: 0.3 },
    scale: MAJOR(4),
    reverb: 0.45,
  },
  neon: {
    bpm: 84,
    chords: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 60, 64, 71], [55, 59, 62, 64]],
    roots: [33, 29, 36, 31],
    bars: 2,
    pad: { wave: 'sawtooth', cutoff: 1100, vel: 0.85 },
    bass: 'pulse',
    bassVel: 0.32,
    hats: 0.22,
    lead: { voice: 'pluck', prob: 0.14, low: 69, high: 84, dur: 0.6, vel: 0.3 },
    scale: MINOR(9),
    reverb: 0.45,
  },
  glass: {
    bpm: 56,
    chords: [[62, 66, 69, 73, 76], [59, 62, 66, 69, 76], [55, 59, 62, 66, 69], [57, 62, 64, 66, 69]],
    roots: [38, 35, 31, 33],
    bars: 2,
    pad: { wave: 'sine', cutoff: 2200, vel: 1.1 },
    bass: 'whole',
    bassVel: 0.35,
    lead: { voice: 'bell', prob: 0.1, low: 81, high: 93, dur: 3.5, vel: 0.22 },
    scale: MAJOR(2),
    reverb: 0.7,
  },
  keynote: {
    bpm: 66,
    chords: [[53, 57, 60, 64], [57, 60, 64, 67], [58, 62, 65, 69], [55, 60, 64, 69]],
    roots: [41, 45, 46, 36],
    bars: 2,
    pad: { wave: 'triangle', cutoff: 1300, vel: 0.7 },
    bass: 'whole',
    bassVel: 0.45,
    lead: { voice: 'marimba', prob: 0.1, low: 77, high: 89, dur: 0.8, vel: 0.26 },
    scale: MAJOR(5),
    reverb: 0.35,
  },
  pixel: {
    bpm: 100,
    chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    roots: [48, 45, 41, 43],
    bars: 1,
    bass: 'chip',
    bassVel: 0.9,
    arp: { voice: 'chip', every: 1, vel: 0.45, octave: 12 },
    lead: { voice: 'chip', prob: 0.2, low: 72, high: 84, dur: 0.2, vel: 0.6 },
    scale: [0, 2, 4, 7, 9],
    reverb: 0.15,
  },
  p5: {
    bpm: 92,
    chords: [[53, 57, 60, 64], [53, 57, 59, 64], [52, 55, 59, 62], [55, 58, 61, 64]],
    roots: [38, 43, 36, 33],
    bars: 1,
    comp: true,
    bass: 'walk',
    bassVel: 0.6,
    hats: 0.3,
    swing: 0.32,
    lead: { voice: 'epiano', prob: 0.12, low: 74, high: 86, dur: 1.2, vel: 0.28 },
    scale: MINOR(2).map((x) => (x === 10 ? 11 : x)), // dorian
    reverb: 0.3,
  },
};

const LEVEL = 0.45;

function play(voice: Voice, t: number, m: number, dur: number, vel: number) {
  const out = musicBus!;
  switch (voice) {
    case 'epiano':
      return epiano(out, t, m, dur, vel);
    case 'bell':
      return bell(out, t, m, dur, vel);
    case 'marimba':
      return marimba(out, t, m, dur, vel);
    case 'pluck':
      return pluck(out, t, m, dur, vel, { cutoff: 1400 });
    case 'chip':
      return chip(out, t, m, dur, vel);
    case 'drop':
      return drop(out, t, m, vel);
  }
}

function leadPool(s: Song): number[] {
  const pool: number[] = [];
  for (let m = s.lead.low; m <= s.lead.high; m++) if (s.scale.includes(m % 12)) pool.push(m);
  return pool;
}

function schedule(s: Song, step: number, t: number, state: { idx: number; pool: number[] }) {
  const eighth = 60 / s.bpm / 2;
  const perChord = 8 * s.bars;
  const ci = Math.floor(step / perChord) % s.chords.length;
  const chord = s.chords[ci];
  const root = s.roots[ci];
  const local = step % perChord;
  const inBar = step % 8;
  const at = s.swing && step % 2 ? t + eighth * s.swing : t;
  const out = musicBus!;

  if (local === 0 && s.pad) pad(out, t, chord, perChord * eighth, s.pad.vel, { wave: s.pad.wave, cutoff: s.pad.cutoff });
  if (s.comp && (inBar === 0 || inBar === 3)) chord.forEach((m, i) => epiano(out, at + i * 0.012, m, 1.1, 0.2));

  switch (s.bass) {
    case 'whole':
      if (local === 0) bass(out, t, root, perChord * eighth * 0.95, s.bassVel);
      break;
    case 'pulse':
      pluck(out, t, root + (step % 2 ? 12 : 0), eighth * 0.9, s.bassVel, { cutoff: 480, detune: 4 });
      break;
    case 'walk':
      if (inBar % 2 === 0) {
        const nextRoot = s.roots[(ci + 1) % s.roots.length];
        const line = [root, root + 7, root + 12, nextRoot + (nextRoot > root ? -1 : 1)];
        bass(out, t, line[(inBar / 2) % 4], eighth * 1.8, s.bassVel);
      }
      break;
    case 'chip':
      if (inBar % 2 === 0) chip(out, t, root - 12, 0.16, s.bassVel, 'triangle');
      break;
  }

  if (s.hats && step % 2) hat(out, at, s.hats);

  if (s.arp && step % s.arp.every === 0) {
    const tones = [...chord].sort((a, b) => a - b);
    const i = (step / s.arp.every) % (tones.length * 2 - 2);
    const up = i < tones.length ? i : tones.length * 2 - 2 - i; // up and down
    play(s.arp.voice, at, tones[up] + s.arp.octave, eighth * 0.9, s.arp.vel);
  }

  const strong = inBar % 2 === 0;
  if (Math.random() < s.lead.prob * (strong ? 1.3 : 0.6)) {
    const { pool } = state;
    state.idx = Math.max(0, Math.min(pool.length - 1, state.idx + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
    let m = pool[state.idx];
    // On the downbeat, land on a chord tone.
    if (inBar === 0) {
      const pcs = chord.map((c) => c % 12);
      const near = pool.filter((p) => pcs.includes(p % 12)).sort((a, b) => Math.abs(a - m) - Math.abs(b - m))[0];
      if (near != null) {
        m = near;
        state.idx = pool.indexOf(near);
      }
    }
    play(s.lead.voice, at, m, s.lead.dur, s.lead.vel * (0.8 + Math.random() * 0.4));
  }
}

let current: { key: string; stop: () => void } | null = null;

function fadeTo(level: number, seconds: number) {
  if (!ctx || !musicBus) return;
  const g = musicBus.gain;
  const now = ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(level, now + seconds);
}

function begin(key: string) {
  const c = ctx!;
  const s = SONGS[key] ?? SONGS.classic;
  const eighth = 60 / s.bpm / 2;
  const pool = leadPool(s);
  const state = { idx: Math.floor(pool.length / 2), pool };
  let step = 0;
  let next = c.currentTime + 0.15;
  let alive = true;
  setReverb('music', s.reverb);
  const id = setInterval(() => {
    if (!alive) return;
    while (next < c.currentTime + 0.3) {
      schedule(s, step, next, state);
      next += eighth;
      step++;
    }
  }, 60);
  fadeTo(LEVEL, 3);
  current = {
    key,
    stop: () => {
      alive = false;
      clearInterval(id);
    },
  };
}

function sync() {
  if (!ctx || !musicBus) return;
  const a = appearance.value;
  const want = a.music && route.value.parts[0] !== 'play' && !document.hidden;
  const key = resolvedParts(a).palette;
  if (!want) {
    if (current) {
      current.stop();
      current = null;
      fadeTo(0, 1.2);
    }
    return;
  }
  if (current?.key === key) return;
  current?.stop();
  begin(key);
}

export function initMusic() {
  onAudio(sync);
  effect(() => {
    void appearance.value;
    void route.value;
    sync();
  });
  document.addEventListener('visibilitychange', sync);
}
