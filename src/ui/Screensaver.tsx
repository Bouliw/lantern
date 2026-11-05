import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Item } from '../api/types';
import { catalog, representative } from '../api/catalog';
import { backdropOf, imageUrl, logoOf, preload } from '../api/images';
import { saverMinutes } from '../state/settings';
import { route } from '../router';
import { lang } from '../i18n';
import { pushKeyHandler } from '../nav/spatial';
import { Img } from './Img';

const SLIDE = 12000;
const INPUT = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'] as const;

const artOf = (it: Item) => imageUrl(backdropOf(it, representative(it)), Math.min(1920, window.innerWidth * (window.devicePixelRatio || 1)));

/**
 * Screen saver: after a while without input (outside the player), the library's artwork
 * drifts by slowly with the time and the title. Any key, click or move brings the app back.
 */
export function Screensaver() {
  const minutes = saverMinutes.value;
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!minutes) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (route.value.parts[0] !== 'play' && !document.hidden && catalog.value) setOn(true);
      }, minutes * 60000);
    };
    for (const e of INPUT) window.addEventListener(e, arm, { capture: true, passive: true });
    arm();
    return () => {
      clearTimeout(timer);
      for (const e of INPUT) window.removeEventListener(e, arm, { capture: true } as any);
    };
  }, [minutes]);

  return on ? <Saver onExit={() => setOn(false)} /> : null;
}

function Saver({ onExit }: { onExit: () => void }) {
  const items = useMemo(() => {
    const c = catalog.value;
    if (!c) return [];
    const pool = [...c.standalone, ...c.series, ...c.sagas].filter((it) => backdropOf(it, representative(it)));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }, []);
  const [i, setI] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const slides = setInterval(() => setI((x) => x + 1), SLIDE);
    const clock = setInterval(() => setNow(new Date()), 10000);
    return () => {
      clearInterval(slides);
      clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    if (items.length > 1) preload(artOf(items[(i + 1) % items.length]));
  }, [i]);

  // Any input wakes the app up, without acting on the page underneath.
  useEffect(() => {
    const start = performance.now();
    const wake = (e: Event) => {
      if (e.type === 'pointermove' && performance.now() - start < 1000) return;
      e.stopPropagation();
      if (e.type !== 'pointermove' && e.type !== 'wheel') e.preventDefault();
      onExit();
    };
    const opts = { capture: true } as const;
    for (const e of ['pointerdown', 'pointermove', 'wheel', 'touchstart']) window.addEventListener(e, wake, opts);
    const pop = pushKeyHandler(() => {
      onExit();
      return true;
    });
    return () => {
      for (const e of ['pointerdown', 'pointermove', 'wheel', 'touchstart']) window.removeEventListener(e, wake, opts);
      pop();
    };
  }, []);

  if (!items.length) return null;
  const n = items.length;
  const shown = [i - 1, i].filter((k) => k >= 0);
  const item = items[i % n];
  const logo = logoOf(item, representative(item));
  const locale = lang.value === 'fr' ? 'fr-FR' : 'en-US';

  return (
    <div class="saver" aria-hidden="true">
      {shown.map((k) => {
        const it = items[k % n];
        return (
          <div key={k} class={'saver-slide' + (k === i ? ' on' : '') + (k % 2 ? ' alt' : '')}>
            <Img src={artOf(it)} class="saver-img" eager />
          </div>
        );
      })}
      <div class="saver-shade" />
      <div class="saver-clock">
        <span class="saver-time">{now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
        <span class="saver-date">{now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>
      <div class="saver-title" key={item.Id}>
        {logo ? <Img src={imageUrl(logo, 420)} class="saver-logo" eager /> : <span class="saver-name">{item.Name}</span>}
      </div>
    </div>
  );
}
