import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Item } from '../api/types';
import { hasHover } from '../platform';
import { appearance } from '../state/settings';
import { t } from '../i18n';
import { Card, type CardEntry } from './Card';
import { IconChevronLeft, IconChevronRight } from './icons';

interface Props {
  title: string;
  items?: Item[];
  entries?: CardEntry[];
  rowKey: string;
}

export function Row({ title, items: plain, entries, rowKey }: Props) {
  const list: CardEntry[] = entries ?? (plain ?? []).map((item) => ({ item }));
  const items = list;
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = () => {
    const el = track.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  };

  useLayoutEffect(() => {
    if (!hasHover) return;
    update();
    const el = track.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length, appearance.value.size, appearance.value.cards]);

  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const smooth = appearance.value.motion !== 'off';
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.86), behavior: smooth ? 'smooth' : 'auto' });
  };

  let raf = 0;
  const onScroll = () => {
    if (!hasHover || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      update();
    });
  };

  return (
    <section class="row" data-row data-row-key={rowKey}>
      <h2 class="row-title">{title}</h2>
      <div class="row-viewport">
        {hasHover && edges.left && (
          <button class="row-arrow left" onClick={() => page(-1)} aria-label={t('rows.scrollLeft')} tabIndex={-1}>
            <IconChevronLeft size={32} />
          </button>
        )}
        <div class="row-track" data-row-track ref={track} onScroll={onScroll}>
          {items.map((e, i) => (
            <Card key={(e.play ?? e.item).Id} {...e} rowKey={rowKey} index={i} />
          ))}
        </div>
        {hasHover && edges.right && (
          <button class="row-arrow right" onClick={() => page(1)} aria-label={t('rows.scrollRight')} tabIndex={-1}>
            <IconChevronRight size={32} />
          </button>
        )}
      </div>
    </section>
  );
}
