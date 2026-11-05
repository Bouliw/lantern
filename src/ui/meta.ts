import { representative, sagaChildren } from '../api/catalog';
import type { Item } from '../api/types';
import { formatRuntime, lang, t } from '../i18n';
import { genreLabel } from '../i18n/genres';
import { localizedOverview } from '../api/overviews';

export function yearLabel(item: Item): string {
  if (item.Type === 'BoxSet') {
    const years = sagaChildren(item.Id).map((k) => k.ProductionYear).filter((y): y is number => !!y);
    if (!years.length) return item.ProductionYear ? String(item.ProductionYear) : '';
    const min = Math.min(...years);
    const max = Math.max(...years);
    return min === max ? String(min) : `${min}–${max}`;
  }
  if (item.Type === 'Series' && item.ProductionYear) {
    const end = item.EndDate ? new Date(item.EndDate).getFullYear() : null;
    return end && end !== item.ProductionYear ? `${item.ProductionYear}–${end}` : String(item.ProductionYear);
  }
  return item.ProductionYear ? String(item.ProductionYear) : '';
}

export function rating(item: Item): number | undefined {
  if (item.Type === 'BoxSet') {
    const r = sagaChildren(item.Id)
      .map((k) => k.CommunityRating)
      .filter((x): x is number => typeof x === 'number');
    return r.length ? r.reduce((a, b) => a + b, 0) / r.length : undefined;
  }
  return item.CommunityRating;
}

/** "2 h 05 min", "4 parts", "3 movies"… */
export function lengthLabel(item: Item): string {
  if (item.Type === 'BoxSet') return t('details.filmCount', { n: sagaChildren(item.Id).length });
  if (item.Type === 'Series') {
    const n = item.ChildCount ?? 0;
    return n ? t('details.seasonCount', { n }) : '';
  }
  return formatRuntime(item.RunTimeTicks);
}

export function genres(item: Item, max = 3): string[] {
  const list = item.Genres?.length ? item.Genres : representative(item)?.Genres ?? [];
  return list.slice(0, max).map((g) => genreLabel(g, lang.value));
}

export function overviewOf(item: Item): string {
  const l = lang.value;
  const rep = representative(item);
  return (
    localizedOverview(item.Id, l) || item.Overview || localizedOverview(rep?.Id, l) || rep?.Overview || ''
  );
}

export function progressOf(item: Item): number {
  const ud = item.UserData;
  if (!ud || ud.Played) return 0;
  if (ud.PlayedPercentage && ud.PlayedPercentage > 0) return Math.min(100, ud.PlayedPercentage);
  if (ud.PlaybackPositionTicks && item.RunTimeTicks) return Math.min(100, (ud.PlaybackPositionTicks / item.RunTimeTicks) * 100);
  return 0;
}

export function minutesLeft(item: Item): number {
  const pos = item.UserData?.PlaybackPositionTicks ?? 0;
  if (!item.RunTimeTicks || !pos) return 0;
  return Math.max(1, Math.round((item.RunTimeTicks - pos) / 600_000_000));
}
