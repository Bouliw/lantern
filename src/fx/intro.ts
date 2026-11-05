/**
 * Opening sting: the lantern lights up, the name settles in, then the app appears.
 * Once per session (each launch on the TV), any key or click skips it. The look follows
 * the style (fx.css); the sound plays when the platform lets audio start on its own.
 */
import { isTV } from '../platform';
import { appearance } from '../state/settings';
import { ctx, unlockAudio } from './audio';
import { playSting } from './sound';

const KEY = 'lantern.intro';
const LENGTH = 1900;

const MARK = `<svg class="intro-mark" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M13 5.5q3-4 6 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <rect x="10.5" y="6.5" width="11" height="2.4" rx="1.2" fill="currentColor"/>
  <path d="M11.2 10.5h9.6l2 13H9.2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path class="intro-flame" d="M16 13.5c2 2.3 2.6 4.1 2.6 5.6a2.6 2.6 0 0 1-5.2 0c0-1.5.7-3.3 2.6-5.6z" fill="var(--accent)"/>
  <rect x="7.5" y="24.5" width="17" height="2.6" rx="1.3" fill="currentColor"/>
</svg>`;

export function showIntro() {
  try {
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, '1');
  } catch {
    /* private mode: just play it */
  }
  if (!isTV && appearance.value.motion === 'off') return;

  const el = document.createElement('div');
  el.className = 'intro';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="intro-band"></div><div class="intro-bloom"></div><div class="intro-stage">${MARK}<div class="intro-word">${[
    ...'lantern',
  ]
    .map((c, i) => `<span style="--ci:${i}">${c}</span>`)
    .join('')}</div></div>`;
  document.body.append(el);

  unlockAudio(); // allowed without a gesture on the TV; elsewhere it waits for the first click
  setTimeout(() => {
    if (ctx?.state === 'running' && appearance.value.sounds) playSting();
  }, 250);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el.classList.add('out');
    window.removeEventListener('keydown', skip, true);
    window.removeEventListener('pointerdown', skip, true);
    setTimeout(() => el.remove(), 450);
  };
  const skip = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    finish();
  };
  window.addEventListener('keydown', skip, true);
  window.addEventListener('pointerdown', skip, true);
  setTimeout(finish, LENGTH);
}
