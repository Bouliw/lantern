/** Minimal WebVTT parser + lookup, so subtitles render the same on every device. */
export interface Cue {
  start: number;
  end: number;
  html: string;
}

function toSeconds(stamp: string): number {
  const parts = stamp.trim().replace(',', '.').split(':');
  let s = 0;
  for (const p of parts) s = s * 60 + parseFloat(p);
  return s;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Keeps <i>, <b>, <u>; drops every other tag (voices, classes, positioning). */
function sanitize(text: string): string {
  return escape(text)
    .replace(/&lt;(\/?)(i|b|u)&gt;/gi, '<$1$2>')
    .replace(/&lt;\/?[a-z][^&]*?&gt;/gi, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/\n/g, '<br>');
}

export function parseVtt(raw: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = raw.replace(/\r/g, '').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const start = toSeconds(a);
    const end = toSeconds(b.trim().split(/\s+/)[0]);
    const text = lines.slice(i + 1).join('\n').trim();
    if (text && isFinite(start) && isFinite(end)) cues.push({ start, end, html: sanitize(text) });
  }
  return cues.sort((x, y) => x.start - y.start);
}

/** Active cues at time t (binary search on start, then scan back). */
export function cuesAt(cues: Cue[], t: number): Cue[] {
  let lo = 0;
  let hi = cues.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) lo = mid + 1;
    else hi = mid;
  }
  const out: Cue[] = [];
  for (let i = lo - 1; i >= 0 && i >= lo - 20; i--) if (cues[i].end > t) out.unshift(cues[i]);
  return out;
}
