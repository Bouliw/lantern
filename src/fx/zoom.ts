/**
 * Profile pick: the chosen avatar grows to fill the screen, then the home page appears
 * behind a fading veil. Uses the Web Animations API, so it also runs on the TV.
 */
import { isTV } from '../platform';

export function zoomInto(el: HTMLElement | null | undefined): Promise<void> {
  if (!el || typeof el.animate !== 'function' || (!isTV && document.documentElement.dataset.motion === 'off')) {
    return Promise.resolve();
  }
  const r = el.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.classList.add('zoom-ghost');
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    margin: '0',
    zIndex: '9001',
  });
  const veil = document.createElement('div');
  veil.className = 'zoom-veil';
  document.body.append(veil, ghost);

  const dur = isTV ? 420 : 620;
  const scale = Math.max(innerWidth / r.width, innerHeight / r.height) * 1.5;
  const dx = innerWidth / 2 - (r.left + r.width / 2);
  const dy = innerHeight / 2 - (r.top + r.height / 2);
  const end = `translate(${dx}px, ${dy}px) scale(${scale.toFixed(2)})`;
  ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: 'translate(0, 0) scale(0.92)', opacity: 1, offset: 0.15 },
      { transform: end, opacity: 1, offset: 0.8 },
      { transform: end, opacity: 0 },
    ],
    { duration: dur, easing: 'cubic-bezier(0.7, 0, 0.2, 1)', fill: 'forwards' },
  );
  veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur * 0.75, easing: 'ease-in', fill: 'forwards' });

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
      // Let the next screen render, then lift the veil.
      setTimeout(() => {
        const a = veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: 'ease-out', fill: 'forwards' });
        a.onfinish = () => {
          veil.remove();
          ghost.remove();
        };
      }, 80);
    }, dur * 0.82);
  });
}
