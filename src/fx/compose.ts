/**
 * Background music composer: turns a style's song sheet (fx/songs.ts) into notes, one eighth
 * note at a time. Pure logic with no audio, so it can be run and checked on its own;
 * fx/music.ts plays what it writes.
 *
 * A song runs through a form of parts (intro, verse, chorus, bridge…), each with its own chord
 * progression and energy. Layers come in and out with the energy (bass, drums, arpeggio,
 * melody), chords are voiced close to the previous one so the harmony glides instead of
 * jumping, and the melody is built from short motifs that get an answer, come back varied and
 * leave room to breathe. Each pass through the form writes new motifs for some parts, so the
 * music keeps its identity without ever repeating exactly.
 */

export type Voice = 'epiano' | 'felt' | 'breath' | 'marimba' | 'pluck' | 'chip' | 'drop';
export type Scale = 'major' | 'minor' | 'dorian' | 'pentatonic';

export interface Part {
  /** Chords in Roman numerals relative to the key: `vi9`, `bVImaj7`, `V7b9@1` (1 bar). */
  prog: string[];
  /** Bars per chord, unless the chord says otherwise (default: the song's). */
  bars?: number;
  /** How many times the progression plays in this part. */
  reps?: number;
  /** 0..1: which layers play and how much the melody says. */
  energy: number;
  /** Melody instrument for this part (default: the song's). */
  voice?: Voice;
}

export interface Song {
  /** Tonic pitch class (0 = C). */
  key: number;
  scale: Scale;
  bpm: number;
  /** Default bars per chord. */
  bars: number;
  parts: Record<string, Part>;
  /** Order of the parts on the first pass, then on every later pass. */
  form: string[];
  loop: string[];
  /** MIDI range for chord voicings (pad, Rhodes, arpeggio). */
  range: [number, number];
  pad?: { wave: OscillatorType; cutoff: number; vel: number; attack?: number };
  /** Rhodes chord stabs. */
  comp?: boolean;
  bass: 'whole' | 'half' | 'pulse' | 'walk' | 'chip';
  bassVel: number;
  /** Soft drums from the given energy up. */
  drums?: { from: number; hat: number; kick?: number; snare?: number };
  /** Delay of the off-beat eighths, as a fraction of an eighth. */
  swing?: number;
  arp?: { voice: Voice; every: number; vel: number; octave: number; from: number };
  lead: { voice: Voice; low: number; high: number; notesPerBar: number; vel: number; from: number };
  reverb: number;
}

/** A sound to play, `at` seconds after the start of the current eighth. */
export type Ev =
  | { kind: 'pad'; at: number; notes: number[]; dur: number; vel: number; cutoff: number }
  | { kind: 'comp'; at: number; notes: number[]; vel: number }
  | { kind: 'bass'; at: number; note: number; dur: number; vel: number }
  | { kind: 'lead' | 'arp'; at: number; voice: Voice; note: number; dur: number; vel: number }
  | { kind: 'kick' | 'snare' | 'hat'; at: number; vel: number };

const SCALES: Record<Scale, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
};

const DEGREES: Record<string, number> = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };

/** Chord qualities as intervals from the root; upper-case numerals are major, lower-case minor. */
const MAJOR_CHORDS: Record<string, number[]> = {
  '': [0, 4, 7],
  add9: [0, 4, 7, 14],
  '6': [0, 4, 7, 9],
  '69': [0, 4, 7, 9, 14],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  'maj7#11': [0, 4, 7, 11, 18],
  '7': [0, 4, 7, 10],
  '9': [0, 4, 7, 10, 14],
  '13': [0, 4, 10, 14, 21],
  '7b9': [0, 4, 7, 10, 13],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10],
  '9sus4': [0, 5, 7, 10, 14],
};
const MINOR_CHORDS: Record<string, number[]> = {
  '': [0, 3, 7],
  add9: [0, 3, 7, 14],
  '6': [0, 3, 7, 9],
  '7': [0, 3, 7, 10],
  '9': [0, 3, 7, 10, 14],
  '11': [0, 3, 7, 10, 14, 17],
  'ø': [0, 3, 6, 10],
  dim: [0, 3, 6],
};

interface Chord {
  root: number;
  ivs: number[];
  pcs: number[];
  bars?: number;
}

const pc = (m: number) => ((m % 12) + 12) % 12;
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function parseChord(symbol: string, key: number): Chord {
  const [name, bars] = symbol.split('@');
  const m = /^([b#]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/.exec(name);
  const ivs = m && (m[2] === m[2].toLowerCase() ? MINOR_CHORDS : MAJOR_CHORDS)[m[3]];
  if (!m || !ivs) throw new Error(`Unknown chord: ${symbol}`);
  const root = pc(key + DEGREES[m[2].toUpperCase()] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0));
  return { root, ivs, pcs: [...new Set(ivs.map((i) => pc(root + i)))], bars: bars ? Number(bars) : undefined };
}

/** Close voicing: the inversion (with or without the root) that moves least from the last chord. */
export function voiceChord(ch: Chord, prev: number[], [lo, hi]: [number, number]): number[] {
  const full = ch.ivs.map((i) => lo + pc(ch.root - lo) + i);
  const sets = full.length >= 4 ? [full, full.slice(1)] : [full];
  const center = (lo + hi) / 2;
  let best = full;
  let bestCost = Infinity;
  sets.forEach((set, rootless) => {
    let v = [...set];
    for (let r = 0; r < set.length; r++) {
      for (const shift of [-12, 0, 12]) {
        const w = v.map((n) => n + shift);
        if (w[0] < lo || w[w.length - 1] > hi) continue;
        const move = prev.length ? mean(w.map((n) => Math.min(...prev.map((p) => Math.abs(p - n))))) : 0;
        const cost = move + Math.abs(mean(w) - center) * 0.25 + rootless * 0.6;
        if (cost < bestCost) {
          bestCost = cost;
          best = w;
        }
      }
      v = [...v.slice(1), v[0] + 12].sort((a, b) => a - b);
    }
  });
  return best;
}

/** The key's scale bent around the chord: chord tones in, notes a semitone off them out. */
export function chordScale(key: number, scale: Scale, chordPcs: number[]): number[] {
  const near = (a: number, b: number) => pc(a - b) === 1 || pc(b - a) === 1;
  const keyPcs = SCALES[scale].map((s) => pc(key + s));
  const keep = keyPcs.filter((s) => chordPcs.includes(s) || !chordPcs.some((c) => near(s, c)));
  return [...new Set([...keep, ...chordPcs])].sort((a, b) => a - b);
}

interface Placed {
  start: number;
  len: number;
  voicing: number[];
  bass: number;
  pcs: number[];
  pool: number[]; // melody notes that fit this chord, within the lead's range
}

interface Section {
  name: string;
  part: Part;
  start: number;
  len: number;
  energy: number;
  chords: Placed[];
}

/** A motif note: position in a two-bar phrase (eighths), length (eighths), scale steps moved. */
interface MNote {
  slot: number;
  len: number;
  step: number;
}

interface Motif {
  call: MNote[];
  answer: MNote[];
}

type Role = 'call' | 'answer' | 'rest';

const BASS_LOW = 28;
const BASS_HIGH = 45;
const LEGATO: Voice[] = ['epiano', 'felt', 'breath'];

export class Composer {
  private readonly song: Song;
  private readonly rand: () => number;
  private readonly eighth: number;
  private sections: Section[] = [];
  private passLen = 0;
  private pass = 0;
  private pos = 0;
  private sec = 0;
  private ch = 0;
  private voicing: number[] = [];
  private bassNote = 34;
  private walk: number[] = [];
  private lead: number;
  private phrase: { notes: MNote[]; i: number } | null = null;
  private motifs = new Map<string, Motif>();

  constructor(song: Song, rand: () => number = Math.random) {
    this.song = song;
    this.rand = rand;
    this.eighth = 60 / song.bpm / 2;
    this.lead = Math.round((song.lead.low + song.lead.high) / 2);
    this.build(song.form);
  }

  /** Length in seconds of one pass through the given form. */
  static duration(song: Song, form: string[]): number {
    let bars = 0;
    for (const name of form) {
      const part = song.parts[name];
      for (const sym of part.prog) bars += (parseChord(sym, song.key).bars ?? part.bars ?? song.bars) * (part.reps ?? 1);
    }
    return (bars * 8 * 60) / song.bpm / 2;
  }

  private pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.rand() * xs.length)];
  }

  private build(form: string[]) {
    const s = this.song;
    let step = 0;
    this.sections = form.map((name) => {
      const part = s.parts[name];
      const start = step;
      const chords: Placed[] = [];
      for (let r = 0; r < (part.reps ?? 1); r++) {
        for (const sym of part.prog) {
          const ch = parseChord(sym, s.key);
          const len = (ch.bars ?? part.bars ?? s.bars) * 8;
          this.voicing = voiceChord(ch, this.voicing, s.range);
          const low = BASS_LOW + pc(ch.root - BASS_LOW);
          this.bassNote = [low, low + 12]
            .filter((m) => m <= BASS_HIGH)
            .reduce((a, b) => (Math.abs(b - this.bassNote) < Math.abs(a - this.bassNote) ? b : a));
          const fit = chordScale(s.key, s.scale, ch.pcs);
          const pool: number[] = [];
          for (let m = s.lead.low; m <= s.lead.high; m++) if (fit.includes(pc(m))) pool.push(m);
          chords.push({ start: step, len, voicing: this.voicing, bass: this.bassNote, pcs: ch.pcs, pool });
          step += len;
        }
      }
      const jitter = this.pass ? (this.rand() - 0.5) * 0.12 : 0;
      const energy = clamp(part.energy + jitter, 0, 1);
      if (!this.motifs.has(name) || (this.pass > 0 && this.rand() < 0.5)) this.motifs.set(name, this.motif(energy));
      return { name, part, start, len: step - start, energy, chords };
    });
    this.passLen = step;
    this.sec = 0;
    this.ch = 0;
  }

  /** A two-bar call (rising then falling) and its answer (same rhythm, resolving down). */
  private motif(energy: number): Motif {
    const weight = (s: number) => (s === 0 ? 3 : s % 4 === 0 ? 2 : s % 2 === 0 ? 1.3 : 0.5);
    const count = clamp(Math.round(this.song.lead.notesPerBar * 2 * (0.75 + 0.5 * energy) * (0.85 + this.rand() * 0.3)), 2, 8);
    const slots = new Set<number>([this.rand() < 0.65 ? 0 : this.pick([1, 2, 3])]);
    while (slots.size < count) {
      const free = Array.from({ length: 14 }, (_, i) => i).filter((i) => !slots.has(i));
      let r = this.rand() * free.reduce((sum, i) => sum + weight(i), 0);
      for (const i of free) if ((r -= weight(i)) <= 0) {
        slots.add(i);
        break;
      }
    }
    const sorted = [...slots].sort((a, b) => a - b);
    const call = sorted.map((slot, i) => {
      const next = sorted[i + 1] ?? 16;
      const up = i < sorted.length / 2 ? 1 : -1;
      const r = this.rand();
      const size = this.rand() < 0.75 ? 1 : 2;
      const step = i === 0 ? 0 : r < 0.15 ? 0 : r < 0.75 ? up * size : -up * size;
      return { slot, len: Math.min(next - slot, i === sorted.length - 1 ? 6 : 4), step };
    });
    const answer = call.map((n) => ({ ...n }));
    const last = answer.length - 1;
    answer[last].step = this.rand() < 0.6 ? -1 : -2;
    answer[last].len = 6;
    if (last > 1 && this.rand() < 0.5) answer[last - 1].step = -1;
    return { call, answer };
  }

  /** The same motif with a small ornament: one inner note moves, sometimes one drops out. */
  private vary(notes: MNote[]): MNote[] {
    const out = notes.map((n) => ({ ...n }));
    if (out.length < 3) return out;
    const j = 1 + Math.floor(this.rand() * (out.length - 2));
    out[j].step += this.rand() < 0.5 ? 1 : -1;
    if (out.length > 3 && this.rand() < 0.3) out.splice(j, 1);
    return out;
  }

  private plan(energy: number): Role[] {
    if (energy >= 0.85) return ['call', 'answer', 'call', 'answer'];
    if (energy >= 0.55) return ['call', 'rest', 'answer', 'rest'];
    return ['call', 'rest', 'rest', 'rest'];
  }

  private chordAt(pos: number): Placed | undefined {
    for (const sec of this.sections) for (const c of sec.chords) if (pos >= c.start && pos < c.start + c.len) return c;
    return undefined;
  }

  private melodyNote(n: MNote, chord: Placed, last: boolean): number {
    const { low, high } = this.song.lead;
    const pool = chord.pool;
    let i = pool.reduce((best, m, k) => (Math.abs(m - this.lead) < Math.abs(pool[best] - this.lead) ? k : best), 0);
    let step = n.step;
    const center = (low + high) / 2;
    // Gravity: wandering too far from the middle of the range turns the line around.
    if (((this.lead > center + 5 && step > 0) || (this.lead < center - 5 && step < 0)) && this.rand() < 0.5) step = -step;
    i = clamp(i + step, 0, pool.length - 1);
    let m = pool[i];
    if (n.slot % 4 === 0 || last) {
      // Strong beats and phrase endings land on a chord tone.
      const tones = pool.filter((p) => chord.pcs.includes(pc(p)));
      const target = m;
      m = tones.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || (step >= 0 ? b - a : a - b))[0] ?? m;
    }
    this.lead = m;
    return m;
  }

  /** The sounds of the next eighth note. `density` < 1 thins the melody out (title pages). */
  next(density = 1): Ev[] {
    if (this.pos >= this.passLen) {
      this.pass++;
      this.pos = 0;
      this.build(this.song.loop);
    }
    const s = this.song;
    const e8 = this.eighth;
    const pos = this.pos++;
    while (pos >= this.sections[this.sec].start + this.sections[this.sec].len) {
      this.sec++;
      this.ch = 0;
      this.phrase = null;
    }
    const sec = this.sections[this.sec];
    while (pos >= sec.chords[this.ch].start + sec.chords[this.ch].len) this.ch++;
    const chord = sec.chords[this.ch];
    const e = sec.energy;
    const local = pos - chord.start;
    const inBar = pos % 8;
    const swing = s.swing && pos % 2 ? e8 * s.swing : 0;
    const r = () => this.rand();
    const out: Ev[] = [];

    if (s.pad && local === 0) {
      out.push({
        kind: 'pad',
        at: 0,
        notes: chord.voicing,
        dur: chord.len * e8,
        vel: s.pad.vel * (0.75 + 0.35 * e),
        cutoff: s.pad.cutoff * (0.7 + 0.45 * e),
      });
    }

    if (s.comp && e >= 0.4) {
      const hit = inBar === 0 ? 0.22 : inBar === 3 && r() < 0.7 ? 0.18 : inBar === 6 && e >= 0.9 && r() < 0.4 ? 0.16 : 0;
      if (hit) out.push({ kind: 'comp', at: swing, notes: chord.voicing, vel: hit * (0.85 + 0.3 * r()) });
    }

    if (e >= 0.3) this.bass(out, chord, pos, inBar, e);

    if (s.drums && e >= s.drums.from) {
      const d = s.drums;
      if (pos % 2) out.push({ kind: 'hat', at: swing, vel: d.hat * (0.8 + 0.4 * r()) });
      else if (e >= 0.9) out.push({ kind: 'hat', at: 0, vel: d.hat * 0.45 });
      if (d.kick && (inBar === 0 || inBar === 4)) out.push({ kind: 'kick', at: 0, vel: d.kick });
      if (d.kick && s.swing && inBar === 3 && r() < 0.3) out.push({ kind: 'kick', at: swing, vel: d.kick * 0.6 });
      if (d.snare && (inBar === 2 || inBar === 6)) out.push({ kind: 'snare', at: 0, vel: d.snare * (0.85 + 0.3 * r()) });
    }

    const a = s.arp;
    if (a && e >= a.from && pos % a.every === 0 && (density === 1 || pos % (a.every * 2) === 0)) {
      const tones = [...chord.voicing].sort((x, y) => x - y);
      const i = (pos / a.every) % Math.max(1, tones.length * 2 - 2);
      const note = tones[i < tones.length ? i : tones.length * 2 - 2 - i] + a.octave;
      out.push({ kind: 'arp', at: swing, voice: a.voice, note, dur: e8 * 0.9 * a.every, vel: a.vel * (0.85 + 0.3 * r()) });
    }

    if (e >= s.lead.from) {
      const rel = (pos - sec.start) % 16;
      const unit = Math.floor((pos - sec.start) / 16);
      if (rel === 0) {
        const role = this.plan(e)[unit % 4];
        const m = this.motifs.get(sec.name)!;
        if (role === 'rest') this.phrase = null;
        else if (role === 'answer') this.phrase = { notes: m.answer, i: 0 };
        else {
          const center = Math.round((s.lead.low + s.lead.high) / 2 + (r() - 0.5) * 6);
          this.lead = chord.pool.filter((p) => chord.pcs.includes(pc(p))).sort((x, y) => Math.abs(x - center) - Math.abs(y - center))[0] ?? center;
          this.phrase = { notes: unit % 4 >= 2 ? this.vary(m.call) : m.call, i: 0 };
        }
      }
      const ph = this.phrase;
      const n = ph?.notes[ph.i];
      if (ph && n && n.slot === rel) {
        ph.i++;
        const voice = sec.part.voice ?? s.lead.voice;
        const strong = n.slot % 4 === 0;
        if (density >= 1 || strong || r() < 0.5) {
          const note = this.melodyNote(n, chord, ph.i === ph.notes.length);
          const accent = n.slot % 8 === 0 ? 1 : strong ? 0.9 : n.slot % 2 === 0 ? 0.84 : 0.76;
          out.push({
            kind: 'lead',
            at: swing + (voice === 'chip' ? 0 : r() * 0.012),
            voice,
            note,
            dur: n.len * e8 * 0.95 + (LEGATO.includes(voice) ? e8 * 0.5 : 0),
            vel: s.lead.vel * accent * (0.85 + 0.2 * e) * (0.9 + 0.2 * r()),
          });
        }
      }
    }
    return out;
  }

  private bass(out: Ev[], chord: Placed, pos: number, inBar: number, e: number) {
    const s = this.song;
    const e8 = this.eighth;
    const root = chord.bass;
    const vel = s.bassVel;
    const remaining = chord.start + chord.len - pos;
    const up = (m: number) => (m > 52 ? m - 12 : m);
    const third = chord.pcs.includes(pc(root + 3)) ? 3 : 4;
    const style = s.bass === 'pulse' && e < 0.5 ? 'whole' : s.bass === 'walk' && e < 0.5 ? 'half' : s.bass;
    switch (style) {
      case 'whole':
        if (inBar !== 0) return;
        if (e >= 0.75 && remaining >= 8 && this.rand() < 0.5) {
          out.push({ kind: 'bass', at: 0, note: root, dur: 4 * e8 * 0.95, vel });
          out.push({ kind: 'bass', at: 4 * e8, note: up(root + this.pick([7, 12])), dur: 4 * e8 * 0.95, vel: vel * 0.7 });
        } else out.push({ kind: 'bass', at: 0, note: root, dur: Math.min(8, remaining) * e8 * 0.95, vel });
        return;
      case 'half':
        if (inBar === 0) out.push({ kind: 'bass', at: 0, note: root, dur: 4 * e8 * 0.9, vel });
        if (inBar === 4) out.push({ kind: 'bass', at: 0, note: up(root + this.pick([7, 7, 12])), dur: 4 * e8 * 0.9, vel: vel * 0.8 });
        return;
      case 'pulse':
        out.push({ kind: 'bass', at: 0, note: root + (pos % 2 ? 12 : 0), dur: e8 * 0.9, vel });
        return;
      case 'walk': {
        if (inBar % 2) return;
        if (inBar === 0) {
          const next = this.chordAt(pos + 8)?.bass ?? root;
          const target = next > root + 6 ? next - 12 : next < root - 6 ? next + 12 : next;
          this.walk = [root, up(root + this.pick([third, 7])), up(root + this.pick([7, 12, 10])), up(target + this.pick([-1, 1]))];
        }
        out.push({ kind: 'bass', at: 0, note: this.walk[inBar / 2], dur: e8 * 1.8, vel: vel * (inBar === 0 ? 1 : 0.85) });
        return;
      }
      case 'chip':
        if (inBar % 2 === 0) out.push({ kind: 'bass', at: 0, note: root + (inBar === 4 && e >= 0.6 ? 12 : 0), dur: 0.16, vel });
        return;
    }
  }
}
