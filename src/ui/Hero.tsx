import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item } from '../api/types';
import { isInProgress, representative } from '../api/catalog';
import { backdropOf, imageUrl, logoOf, preload } from '../api/images';
import { hasHover, isTV } from '../platform';
import { hrefItem } from '../router';
import { playItem } from '../player/launch';
import { t } from '../i18n';
import { Img } from './Img';
import { IconChevronLeft, IconChevronRight, IconInfo, IconPlay } from './icons';
import { genres, lengthLabel, overviewOf, yearLabel } from './meta';

const INTERVAL = 9000;
const backdropWidth = () => Math.min(window.innerWidth, 1920);

function backdropUrl(item: Item) {
  return imageUrl(backdropOf(item, representative(item)), backdropWidth());
}

export function Hero({ items }: { items: Item[] }) {
  const [index, setIndex] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const hovered = useRef(false);
  const n = items.length;
  const safe = n ? index % n : 0;

  const go = (to: number) => {
    if (n < 2) return;
    setPrev(safe);
    setIndex(((to % n) + n) % n);
  };

  useEffect(() => {
    if (n < 2) return;
    const timer = setTimeout(() => {
      if (hovered.current || document.hidden) setTick((x) => x + 1);
      else go(safe + 1);
    }, INTERVAL);
    return () => clearTimeout(timer);
  }, [safe, n, tick]);

  useEffect(() => {
    if (prev === null) return;
    const timer = setTimeout(() => setPrev(null), 1000);
    return () => clearTimeout(timer);
  }, [prev, safe]);

  useEffect(() => {
    if (n > 1) preload(backdropUrl(items[(safe + 1) % n]));
  }, [safe, n]);

  if (!n) return null;
  const item = items[safe];
  const rep = representative(item);
  const logo = logoOf(item, rep);
  const meta = [yearLabel(item), lengthLabel(item), ...genres(item, 2)].filter(Boolean);

  return (
    <section
      class="hero"
      data-nav-top
      onMouseEnter={() => (hovered.current = true)}
      onMouseLeave={() => (hovered.current = false)}
      onFocusCapture={() => setTick((x) => x + 1)}
    >
      <div class="hero-stage">
        {items.map((it, i) =>
          i === safe || i === prev ? (
            <div key={it.Id} class={'hero-slide' + (i === safe ? ' active' : '')}>
              <Img src={backdropUrl(it)} class="hero-img" eager />
            </div>
          ) : null,
        )}
      </div>
      <div class="hero-shade" />
      <div class="hero-content">
        <div class="hero-text" key={item.Id}>
          {logo ? (
            <Img src={imageUrl(logo, 640)} class="hero-logo" alt={item.Name} eager />
          ) : (
            <h1 class="hero-title">{item.Name}</h1>
          )}
          <div class="hero-meta">{meta.join(' · ')}</div>
          <p class="hero-overview">{overviewOf(item)}</p>
        </div>
        <div class="hero-actions">
          <button
            class="btn btn-primary"
            data-nav
            data-nav-autofocus
            data-key="hero:play"
            onClick={() => playItem(item)}
            onKeyDown={(e) => isTV && e.keyCode === 37 && go(safe - 1)}
          >
            <IconPlay /> {isInProgress(item) ? t('hero.resume') : t('hero.play')}
          </button>
          <a
            class="btn btn-secondary"
            data-nav
            data-key="hero:more"
            href={hrefItem(item.Id)}
            onKeyDown={(e) => isTV && e.keyCode === 39 && go(safe + 1)}
          >
            <IconInfo /> {t('hero.more')}
          </a>
        </div>
      </div>
      {hasHover && n > 1 && (
        <>
          <button class="hero-arrow left" onClick={() => go(safe - 1)} aria-label={t('hero.prev')} tabIndex={-1}>
            <IconChevronLeft size={40} />
          </button>
          <button class="hero-arrow right" onClick={() => go(safe + 1)} aria-label={t('hero.next')} tabIndex={-1}>
            <IconChevronRight size={40} />
          </button>
        </>
      )}
      {n > 1 && (
        <div class="hero-dots">
          {items.map((it, i) => (
            <button
              key={it.Id}
              class={'hero-dot' + (i === safe ? ' active' : '')}
              onClick={() => go(i)}
              aria-label={it.Name}
              tabIndex={-1}
            />
          ))}
        </div>
      )}
    </section>
  );
}
