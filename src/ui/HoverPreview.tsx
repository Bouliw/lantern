import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item } from '../api/types';
import { catalog, representative } from '../api/catalog';
import { backdropOf, imageUrl, logoOf, thumbOf } from '../api/images';
import { hasHover } from '../platform';
import { hrefItem, route } from '../router';
import { playItem } from '../player/launch';
import { t } from '../i18n';
import { Img } from './Img';
import { IconChevronDown, IconPlay, IconStar } from './icons';
import { genres, lengthLabel, overviewOf, rating, yearLabel } from './meta';
import { liveAllowed, startLive } from '../fx/live';
import { ambientSource, setAmbientHint } from '../fx/ambient';

interface State {
  item: Item;
  rect: DOMRect;
}

const DELAY = 400;

/**
 * Desktop hover card: the card gives a small bounce on hover, and after ~0.4 s a larger
 * preview opens on top of it with artwork, actions and a short summary.
 */
export function HoverPreview() {
  const [state, setState] = useState<State | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasHover) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let current: HTMLElement | null = null;

    const hide = () => {
      clearTimeout(timer);
      current = null;
      setState(null);
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.hover-panel')) {
        clearTimeout(hideTimer);
        return;
      }
      const card = target.closest<HTMLElement>('[data-card]');
      if (card === current) return;
      clearTimeout(timer);
      current = card;
      if (!card) {
        hideTimer = setTimeout(() => setState(null), 120);
        return;
      }
      setState(null);
      timer = setTimeout(() => {
        const item = catalog.value?.byId.get(card.dataset.card!);
        if (item && card.isConnected && card.matches(':hover')) setState({ item, rect: card.getBoundingClientRect() });
      }, DELAY);
    };

    const onScroll = () => {
      if (current || panelRef.current) hide();
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer);
      clearTimeout(hideTimer);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('scroll', onScroll, { capture: true } as any);
      window.removeEventListener('blur', hide);
    };
  }, []);

  // Close on navigation.
  useEffect(() => setState(null), [route.value.key]);

  // The panel tints the page and its artwork comes alive.
  const shown = state?.item;
  useEffect(() => {
    setAmbientHint(ambientSource(shown));
    const box = panelRef.current?.querySelector<HTMLElement>('.hp-media');
    if (!shown || !box || !liveAllowed()) return;
    let stop: (() => void) | undefined;
    const timer = setTimeout(() => (stop = startLive(box, shown)), 350);
    return () => {
      clearTimeout(timer);
      stop?.();
    };
  }, [shown?.Id]);

  if (!state) return null;
  const { item, rect } = state;
  const rep = representative(item);
  const width = Math.min(Math.max(rect.width * 1.5, 340), 520);
  const imgH = (width * 9) / 16;
  const pad = 16;
  const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, pad), window.innerWidth - width - pad);
  const top = Math.max(rect.top + rect.height / 2 - imgH / 2, 72);
  const originX = rect.left + rect.width / 2 - left;
  const originY = rect.top + rect.height / 2 - top;
  const art = thumbOf(item) ?? backdropOf(item, rep);
  const logo = thumbOf(item) ? null : logoOf(item, rep);
  const r = rating(item);
  const meta = [yearLabel(item), lengthLabel(item)].filter(Boolean);

  return (
    <div
      ref={panelRef}
      class="hover-panel"
      style={{ left: `${left}px`, top: `${top}px`, width: `${width}px`, transformOrigin: `${originX}px ${originY}px` }}
      onMouseLeave={() => setState(null)}
    >
      <a class="hp-media" href={hrefItem(item.Id)}>
        <Img src={imageUrl(art, width)} class="hp-img" eager />
        {logo && <Img src={imageUrl(logo, 300)} class="hp-logo" eager />}
        {!art && <span class="hp-title">{item.Name}</span>}
      </a>
      <div class="hp-body">
        <div class="hp-actions">
          <button class="round-btn primary" onClick={() => playItem(item)} aria-label={t('hero.play')}>
            <IconPlay size={20} />
          </button>
          <a class="round-btn" href={hrefItem(item.Id)} aria-label={t('hero.more')}>
            <IconChevronDown size={22} />
          </a>
          <span class="hp-name">{item.Name}</span>
        </div>
        <div class="hp-meta">
          {meta.join(' · ')}
          {item.OfficialRating && <span class="badge">{item.OfficialRating}</span>}
          {r != null && (
            <span class="hp-rating">
              <IconStar size={13} /> {r.toFixed(1)}
            </span>
          )}
        </div>
        <div class="hp-genres">{genres(item).join(' • ')}</div>
        <p class="hp-overview">{overviewOf(item)}</p>
      </div>
    </div>
  );
}
