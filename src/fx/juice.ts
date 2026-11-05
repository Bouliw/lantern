/**
 * "Juice": physical springs instead of fixed curves.
 * - Desktop: cards lift and tilt toward the cursor with a glare that follows it, buttons squash
 *   on press and bounce back, the hero drifts with the scroll (parallax).
 * - TV: everything stays instant; OK only gets a short, damped press so the remote feels alive.
 */
import { hasHover, isTV } from '../platform';

interface Spring {
  x: number;
  v: number;
  t: number;
}

interface State {
  lift: Spring;
  sx: Spring;
  sy: Spring;
  rx: Spring;
  ry: Spring;
  ty: Spring;
  stiff: number;
  damp: number;
}

const PRESSABLE =
  '.btn, .round-btn, .icon-btn, .segment, .chip, .tab, .theme-option, .swatch, .profile, .hero-dot, .episode, .nav-link';
const states = new Map<HTMLElement, State>();
const active = new Set<HTMLElement>();
let raf = 0;
let last = 0;

const juicy = () => document.documentElement.dataset.motion === 'juicy';
const spring = (x: number): Spring => ({ x, v: 0, t: x });
const springsOf = (s: State) => [s.lift, s.sx, s.sy, s.rx, s.ry, s.ty];

function state(el: HTMLElement): State {
  let s = states.get(el);
  if (!s) {
    s = { lift: spring(1), sx: spring(1), sy: spring(1), rx: spring(0), ry: spring(0), ty: spring(0), stiff: 380, damp: 22 };
    states.set(el, s);
    el.classList.add('springing');
  }
  return s;
}

function step(sp: Spring, dt: number, k: number, d: number): boolean {
  sp.v += (-k * (sp.x - sp.t) - d * sp.v) * dt;
  sp.x += sp.v * dt;
  return Math.abs(sp.v) > 0.002 || Math.abs(sp.x - sp.t) > 0.0005;
}

function write(el: HTMLElement, s: State) {
  const tilt = Math.abs(s.rx.x) > 0.01 || Math.abs(s.ry.x) > 0.01;
  el.style.transform =
    (tilt ? `perspective(900px) rotateX(${s.rx.x.toFixed(2)}deg) rotateY(${s.ry.x.toFixed(2)}deg) ` : '') +
    `translate3d(0, ${s.ty.x.toFixed(2)}px, 0) scale(${(s.lift.x * s.sx.x).toFixed(4)}, ${(s.lift.x * s.sy.x).toFixed(4)})`;
}

function frame(now: number) {
  const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
  last = now;
  for (const el of active) {
    const s = states.get(el);
    if (!s || !el.isConnected) {
      active.delete(el);
      states.delete(el);
      continue;
    }
    let moving = false;
    for (const sp of springsOf(s)) moving = step(sp, dt, s.stiff, s.damp) || moving;
    if (moving) {
      write(el, s);
      continue;
    }
    for (const sp of springsOf(s)) {
      sp.x = sp.t;
      sp.v = 0;
    }
    active.delete(el);
    const atRest = s.lift.t === 1 && s.sx.t === 1 && s.sy.t === 1 && s.rx.t === 0 && s.ry.t === 0 && s.ty.t === 0;
    if (atRest) {
      el.style.transform = '';
      el.classList.remove('springing');
      states.delete(el);
    } else write(el, s);
  }
  raf = active.size ? requestAnimationFrame(frame) : 0;
}

function kick(el: HTMLElement) {
  active.add(el);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

function press(el: HTMLElement) {
  const s = state(el);
  s.stiff = 520;
  s.damp = 18;
  s.sx.t = 1.04;
  s.sy.t = 0.9;
  kick(el);
}

function release(el: HTMLElement) {
  const s = states.get(el);
  if (!s) return;
  s.sx.t = 1;
  s.sy.t = 1;
  s.sy.v += 1.4; // overshoot: the bounce
  s.sx.v -= 0.8;
  kick(el);
}

let hoverCard: HTMLElement | null = null;
let revealer: IntersectionObserver | null = null;

/** Desktop: rows below the fold slide in, cards cascading, as they scroll into view. */
export function revealOnScroll(el: HTMLElement | null) {
  if (!el || !hasHover || !juicy() || typeof IntersectionObserver === 'undefined') return;
  if (el.getBoundingClientRect().top < window.innerHeight) return; // on screen: the regular entrance plays
  el.classList.add('reveal-wait');
  revealer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const row = e.target as HTMLElement;
        row.classList.remove('reveal-wait');
        row.classList.add('reveal-in');
        revealer!.unobserve(row);
      }
    },
    { rootMargin: '0px 0px -6% 0px' },
  );
  revealer.observe(el);
}

function enterCard(card: HTMLElement) {
  const s = state(card);
  s.stiff = 300;
  s.damp = 19;
  s.lift.t = 1.06;
  s.ty.t = -4;
  card.classList.add('tilting');
  kick(card);
}

function leaveCard(card: HTMLElement) {
  const s = state(card);
  s.lift.t = 1;
  s.ty.t = 0;
  s.rx.t = 0;
  s.ry.t = 0;
  card.classList.remove('tilting');
  if (hoverCard === card) hoverCard = null;
  kick(card);
}

/** Remote OK on TV: a quick squash done by the compositor, no rAF loop. */
function tvPress(el: HTMLElement) {
  const base = getComputedStyle(el).transform;
  const from = base && base !== 'none' ? base : '';
  el.animate(
    [{ transform: `${from} scale(1)` }, { transform: `${from} scale(0.93)` }, { transform: `${from} scale(1)` }],
    { duration: 150, easing: 'ease-out' },
  );
}

function initParallax() {
  let ticking = false;
  const apply = () => {
    ticking = false;
    const y = window.scrollY;
    const on = juicy() && y < window.innerHeight * 1.2;
    const stage = document.querySelector<HTMLElement>('.hero-stage');
    if (stage) stage.style.transform = on ? `translate3d(0, ${(y * 0.35).toFixed(1)}px, 0)` : '';
    // Title pages: the backdrop drifts away slowly while the title floats a little closer.
    const back = document.querySelector<HTMLElement>('.details-backdrop');
    const head = document.querySelector<HTMLElement>('.details-head');
    if (back) back.style.transform = on ? `translate3d(0, ${(y * 0.42).toFixed(1)}px, 0)` : '';
    if (head) {
      head.style.transform = on ? `translate3d(0, ${(y * 0.16).toFixed(1)}px, 0)` : '';
      head.style.opacity = on ? String(Math.max(0, 1 - y / (window.innerHeight * 0.8)).toFixed(3)) : '';
    }
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(apply);
      }
    },
    { passive: true },
  );
}

export function initJuice() {
  if (isTV) {
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.keyCode !== 13 || e.repeat) return;
        const el = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(`${PRESSABLE}, .card`);
        if (el && typeof el.animate === 'function') tvPress(el);
      },
      true,
    );
    return;
  }

  if (hasHover) {
    document.addEventListener('pointerover', (e) => {
      const card = juicy() ? (e.target as HTMLElement).closest<HTMLElement>('.card') : null;
      if (card === hoverCard) return;
      if (hoverCard) leaveCard(hoverCard);
      hoverCard = card;
      if (card) enterCard(card);
    });
    document.addEventListener(
      'pointermove',
      (e) => {
        const card = hoverCard;
        if (!card) return;
        const r = card.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        const s = state(card);
        s.ry.t = (x - 0.5) * 9;
        s.rx.t = (0.5 - y) * 7;
        card.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
        card.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
        kick(card);
      },
      { passive: true },
    );
    document.documentElement.addEventListener('pointerleave', () => hoverCard && leaveCard(hoverCard));
    // The hover panel opens on top of the card: let the card settle underneath.
    document.addEventListener('scroll', () => hoverCard && leaveCard(hoverCard), { capture: true, passive: true });
    initParallax();
  }

  document.addEventListener('pointerdown', (e) => {
    if (!juicy() || e.button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>(PRESSABLE);
    if (el) press(el);
  });
  const up = () => {
    for (const el of states.keys()) if (el.matches(PRESSABLE)) release(el);
  };
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
}
