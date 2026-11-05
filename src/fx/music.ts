/**
 * Background music: plays quietly while browsing, in the mood of the current style (lounge
 * Rhodes for Classic, strings and piano for Eva, Frutiger-aero marimba for Y2K, synthwave for
 * Neon, soft piano and pads for Glass, acid jazz for P5…). fx/compose.ts writes the notes from
 * the song sheets in fx/songs.ts: several minutes of form before it loops, never the same
 * twice. It fades out in the player, when the app is hidden, or when turned off.
 */
import { effect } from '@preact/signals';
import { appearance, resolvedParts } from '../state/settings';
import { route } from '../router';
import { bass, breath, chip, ctx, drop, epiano, felt, hat, kick, marimba, musicBus, onAudio, pad, panned, pluck, setReverb } from './audio';
import { Composer, type Ev, type Song, type Voice } from './compose';
import { SONGS } from './songs';

const LEVEL = 0.45;
/** Page mood: quieter and sparser on a title page, full on the home page and libraries. */
let mood = 1;
let density = 1;
/** Ducking while a live thumbnail plays. */
let duck = 1;

/** Where each layer sits in the stereo field. */
let outs: Record<'pad' | 'lead' | 'arp' | 'comp' | 'bass' | 'drums', AudioNode> | null = null;

function routing() {
  if (!outs) {
    const bus = musicBus!;
    outs = {
      pad: bus,
      bass: bus,
      lead: panned(bus, 0.15),
      arp: panned(bus, -0.3),
      comp: panned(bus, -0.12),
      drums: panned(bus, 0.08),
    };
  }
  return outs;
}

function voice(out: AudioNode, v: Voice, t: number, m: number, dur: number, vel: number) {
  switch (v) {
    case 'epiano':
      return epiano(out, t, m, dur, vel);
    case 'felt':
      return felt(out, t, m, dur, vel);
    case 'breath':
      return breath(out, t, m, dur, vel);
    case 'marimba':
      return marimba(out, t, m, dur, vel);
    case 'pluck':
      return pluck(out, t, m, dur, vel, { cutoff: 1400 });
    case 'chip':
      return chip(out, t, m, Math.min(dur, 0.35), vel);
    case 'drop':
      return drop(out, t, m, vel);
  }
}

function perform(e: Ev, t: number, s: Song) {
  const o = routing();
  const at = t + e.at;
  switch (e.kind) {
    case 'pad':
      return pad(o.pad, at, e.notes, e.dur, e.vel, {
        wave: s.pad!.wave,
        cutoff: e.cutoff,
        attack: s.pad!.attack,
        spread: true,
      });
    case 'comp':
      return e.notes.forEach((m, i) => epiano(o.comp, at + i * 0.012, m, 1.1, e.vel));
    case 'bass':
      if (s.bass === 'chip') return chip(o.bass, at, e.note, e.dur, e.vel, 'triangle');
      if (s.bass === 'pulse' && e.dur < 0.5) return pluck(o.bass, at, e.note, e.dur, e.vel, { cutoff: 480, detune: 4 });
      return bass(o.bass, at, e.note, e.dur, e.vel);
    case 'lead':
    case 'arp':
      return voice(e.kind === 'lead' ? o.lead : o.arp, e.voice, at, e.note, e.dur, e.vel);
    case 'kick':
      return kick(o.drums, at, e.vel);
    case 'snare':
      return hat(o.drums, at, e.vel, 1800, 0.12);
    case 'hat':
      return hat(o.drums, at, e.vel);
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
  const song = SONGS[key] ?? SONGS.classic;
  const composer = new Composer(song);
  const eighth = 60 / song.bpm / 2;
  let next = c.currentTime + 0.15;
  let alive = true;
  setReverb('music', song.reverb);
  const id = setInterval(() => {
    if (!alive) return;
    // After a stall (busy main thread), pick up from now instead of firing a burst of notes.
    if (next < c.currentTime) next = c.currentTime + 0.05;
    while (next < c.currentTime + 0.3) {
      for (const e of composer.next(density)) perform(e, next, song);
      next += eighth;
    }
  }, 60);
  fadeTo(LEVEL * mood * duck, 3);
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
  const page = route.value.parts[0];
  const nextMood = page === 'item' ? 0.6 : page === 'settings' || page === 'search' ? 0.8 : 1;
  density = page === 'item' ? 0.5 : 1;
  if (nextMood !== mood) {
    mood = nextMood;
    if (current) fadeTo(LEVEL * mood * duck, 1.6);
  }
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

/** Lowers the music while something else should be heard or watched (live thumbnails). */
export function duckMusic(on: boolean) {
  const next = on ? 0.45 : 1;
  if (next === duck) return;
  duck = next;
  if (current) fadeTo(LEVEL * mood * duck, on ? 0.5 : 1.2);
}
