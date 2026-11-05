/**
 * Shared audio engine: one AudioContext (created on the first gesture), a gentle compressor,
 * a soft synthetic room reverb, and two buses (interface sounds, background music).
 * The instruments below are small synthesized voices: electric piano, felt piano, bell,
 * marimba, plucks, a breathy lead, pads, soft drums… shaped with real envelopes so nothing
 * sounds like a raw oscillator.
 */
import { isTV } from '../platform';

export let ctx: AudioContext | null = null;
export let sfxBus: GainNode | null = null;
export let musicBus: GainNode | null = null;
let sfxSend: GainNode | null = null;
let musicSend: GainNode | null = null;
let noise: AudioBuffer | null = null;
const waiting: (() => void)[] = [];

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Runs `fn` once audio is available (right away if it already is). */
export function onAudio(fn: () => void) {
  if (ctx) fn();
  else waiting.push(fn);
}

function impulse(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 3.2);
      lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45; // darker, less hiss
      d[i] = lp * env * (i < c.sampleRate * 0.012 ? i / (c.sampleRate * 0.012) : 1);
    }
  }
  return buf;
}

export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return;
  const c: AudioContext = new AC({ latencyHint: 'interactive' });
  ctx = c;

  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -22;
  comp.knee.value = 14;
  comp.ratio.value = 3;
  comp.attack.value = 0.006;
  comp.release.value = 0.3;
  comp.connect(c.destination);

  const reverb = c.createConvolver();
  reverb.buffer = impulse(c, isTV ? 1.2 : 2.4);
  const ret = c.createGain();
  ret.gain.value = 0.8;
  reverb.connect(ret).connect(comp);

  sfxBus = c.createGain();
  sfxBus.gain.value = 0.55;
  sfxBus.connect(comp);
  sfxSend = c.createGain();
  sfxSend.gain.value = 0.28;
  sfxBus.connect(sfxSend).connect(reverb);

  musicBus = c.createGain();
  musicBus.gain.value = 0;
  musicBus.connect(comp);
  musicSend = c.createGain();
  musicSend.gain.value = 0.5;
  musicBus.connect(musicSend).connect(reverb);

  noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  waiting.splice(0).forEach((fn) => fn());
}

export function setReverb(bus: 'sfx' | 'music', amount: number) {
  const send = bus === 'sfx' ? sfxSend : musicSend;
  if (send) send.gain.value = amount;
}

// ---- Building blocks ---------------------------------------------------------------------

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function osc(type: OscillatorType, f: number, t: number, stop: number, out: AudioNode, detune = 0) {
  const o = ctx!.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.detune.value = detune;
  o.connect(out);
  o.start(t);
  o.stop(stop);
  return o;
}

// ---- Instruments (vel 0..1) ----------------------------------------------------------------

/** Warm electric piano (two-operator FM with a soft tine). */
export function epiano(out: AudioNode, t: number, m: number, dur: number, vel: number) {
  const c = ctx!;
  const f = mtof(m);
  const g = c.createGain();
  env(g, t, 0.32 * vel, 0.004, dur);
  g.connect(out);
  const car = osc('sine', f, t, t + dur + 0.05, g);
  const mod = c.createOscillator();
  mod.frequency.value = f;
  const idx = c.createGain();
  idx.gain.setValueAtTime(f * (1.2 + vel * 1.6), t);
  idx.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.5);
  mod.connect(idx).connect(car.frequency);
  mod.start(t);
  mod.stop(t + dur + 0.05);
  const tine = c.createGain();
  env(tine, t, 0.035 * vel, 0.002, 0.06);
  tine.connect(out);
  osc('sine', f * 7.02, t, t + 0.1, tine);
}

/** Struck bell / celesta: inharmonic partials that die out from the top. */
export function bell(out: AudioNode, t: number, m: number, dur: number, vel: number) {
  const f = mtof(m);
  const partials: [number, number, number][] = [
    [1, 1, 1],
    [2, 0.4, 0.55],
    [2.76, 0.28, 0.4],
    [4.07, 0.12, 0.25],
    [5.4, 0.07, 0.16],
  ];
  for (const [ratio, gain, life] of partials) {
    const g = ctx!.createGain();
    env(g, t, 0.18 * vel * gain, 0.003, dur * life);
    g.connect(out);
    osc('sine', f * ratio, t, t + dur * life + 0.05, g);
  }
}

/** Wooden marimba: round fundamental plus a quick overtone knock. */
export function marimba(out: AudioNode, t: number, m: number, dur: number, vel: number) {
  const f = mtof(m);
  const g = ctx!.createGain();
  env(g, t, 0.34 * vel, 0.003, Math.min(dur, 0.9));
  g.connect(out);
  osc('sine', f, t, t + 1, g);
  const k = ctx!.createGain();
  env(k, t, 0.09 * vel, 0.002, 0.07);
  k.connect(out);
  osc('sine', f * 3.93, t, t + 0.1, k);
}

/** Filtered pluck (synthwave lead, soft bass). */
export function pluck(
  out: AudioNode,
  t: number,
  m: number,
  dur: number,
  vel: number,
  opts: { wave?: OscillatorType; cutoff?: number; detune?: number } = {},
) {
  const c = ctx!;
  const f = mtof(m);
  const cutoff = opts.cutoff ?? 1600;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(cutoff * 4, t);
  lp.frequency.exponentialRampToValueAtTime(cutoff, t + 0.22);
  const g = c.createGain();
  env(g, t, 0.16 * vel, 0.004, dur);
  lp.connect(g).connect(out);
  const wave = opts.wave ?? 'sawtooth';
  const d = opts.detune ?? 7;
  osc(wave, f, t, t + dur + 0.05, lp, -d);
  osc(wave, f, t, t + dur + 0.05, lp, d);
}

/** Soft chip voice: a filtered square, like an 8-bit console played quietly. */
export function chip(out: AudioNode, t: number, m: number, dur: number, vel: number, wave: OscillatorType = 'square') {
  const c = ctx!;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const g = c.createGain();
  env(g, t, 0.07 * vel, 0.004, dur);
  lp.connect(g).connect(out);
  osc(wave, mtof(m), t, t + dur + 0.05, lp);
}

/** Water drop: a quick upward bloop (Frutiger-era interfaces). */
export function drop(out: AudioNode, t: number, m: number, vel: number) {
  const c = ctx!;
  const f = mtof(m);
  const g = c.createGain();
  env(g, t, 0.22 * vel, 0.004, 0.16);
  g.connect(out);
  const o = osc('sine', f * 0.7, t, t + 0.25, g);
  o.frequency.exponentialRampToValueAtTime(f * 1.3, t + 0.06);
}

/** A node that places what goes into it left (-1) or right (+1) of `out`. */
export function panned(out: AudioNode, pan: number): AudioNode {
  const c = ctx!;
  if (typeof c.createStereoPanner !== 'function') return out;
  const p = c.createStereoPanner();
  p.pan.value = pan;
  p.connect(out);
  return p;
}

/**
 * Pad chord: slow attack, detuned pairs through a gentle filter. With `spread`, the two
 * detuned layers sit left and right and the filter breathes open and closed over the chord.
 */
export function pad(
  out: AudioNode,
  t: number,
  notes: number[],
  dur: number,
  vel: number,
  opts: { wave?: OscillatorType; cutoff?: number; attack?: number; release?: number; spread?: boolean } = {},
) {
  const c = ctx!;
  const attack = opts.attack ?? 1.6;
  const release = opts.release ?? 2.4;
  const cutoff = opts.cutoff ?? 1400;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  if (opts.spread) {
    lp.frequency.setValueAtTime(cutoff * 0.7, t);
    lp.frequency.linearRampToValueAtTime(cutoff * 1.15, t + Math.max(attack, dur * 0.6));
    lp.frequency.linearRampToValueAtTime(cutoff * 0.8, t + dur + release);
  }
  const g = c.createGain();
  const peak = (0.06 * vel) / Math.sqrt(notes.length);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + Math.max(attack, dur - 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  lp.connect(g);
  const left = opts.spread ? panned(lp, -0.55) : lp;
  const right = opts.spread ? panned(lp, 0.55) : lp;
  g.connect(out);
  const wave = opts.wave ?? 'triangle';
  for (const n of notes) {
    osc(wave, mtof(n), t, t + dur + release + 0.05, left, -6);
    osc(wave, mtof(n), t, t + dur + release + 0.05, right, 6);
  }
}

/** Felt piano: a soft hammer, warm and round, darkening as it rings (no bright attack). */
export function felt(out: AudioNode, t: number, m: number, dur: number, vel: number) {
  const c = ctx!;
  const f = mtof(m);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.4;
  lp.frequency.setValueAtTime(Math.min(3200, f * 2.2 + 400 * vel), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(260, f * 1.1), t + 1.2);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3 * vel, t + 0.014);
  g.gain.exponentialRampToValueAtTime(0.12 * vel, t + 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4 + dur);
  lp.connect(g).connect(out);
  const end = t + 0.45 + dur;
  osc('triangle', f, t, end, lp, -2);
  osc('sine', f, t, end, lp, 2);
  const h = c.createGain();
  h.gain.value = 0.18;
  h.connect(lp);
  osc('sine', f * 2, t, end, h, 1);
}

/** Breathy lead: a flute-like tone that blooms in slowly, with a vibrato that fades in. */
export function breath(out: AudioNode, t: number, m: number, dur: number, vel: number) {
  const c = ctx!;
  const f = mtof(m);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(5000, f * 2.5);
  const g = c.createGain();
  const peak = 0.13 * vel;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.09);
  g.gain.setValueAtTime(peak, t + Math.max(0.11, dur * 0.7));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
  lp.connect(g).connect(out);
  const end = t + dur + 0.55;
  const body = c.createGain();
  body.gain.value = 0.35;
  body.connect(lp);
  const a = osc('sine', f, t, end, lp);
  const b = osc('triangle', f, t, end, body, 5);
  const lfo = c.createOscillator();
  lfo.frequency.value = 4.8;
  const depth = c.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(f * 0.004, t + 0.6);
  lfo.connect(depth);
  depth.connect(a.frequency);
  depth.connect(b.frequency);
  lfo.start(t);
  lfo.stop(end);
}

/** Soft kick: a short sine thump that drops in pitch. */
export function kick(out: AudioNode, t: number, vel: number) {
  const g = ctx!.createGain();
  env(g, t, 0.55 * vel, 0.003, 0.28);
  g.connect(out);
  const o = osc('sine', 120, t, t + 0.35, g);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
}

/** Round bass. */
export function bass(out: AudioNode, t: number, m: number, dur: number, vel: number) {
  const c = ctx!;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 520;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3 * vel, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.18 * vel, t + 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lp.connect(g).connect(out);
  osc('triangle', mtof(m), t, t + dur + 0.05, lp);
  osc('sine', mtof(m), t, t + dur + 0.05, lp);
}

/** Brushed hat / soft tick, from filtered noise. */
export function hat(out: AudioNode, t: number, vel: number, freq = 7500, len = 0.05) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = freq;
  const g = c.createGain();
  env(g, t, 0.08 * vel, 0.002, len);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + len + 0.02);
}
