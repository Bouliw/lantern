import { api, userId } from '../api/client';
import { isInProgress, sagaChildren } from '../api/catalog';
import type { Item, ItemsResult } from '../api/types';
import { navigate } from '../router';

/** What "Play" means for a title: the movie itself, the next episode, or the next film of a saga. */
export async function resolvePlayable(item: Item): Promise<Item | null> {
  switch (item.Type) {
    case 'BoxSet': {
      const kids = sagaChildren(item.Id);
      return kids.find(isInProgress) ?? kids.find((k) => !k.UserData?.Played) ?? kids[0] ?? null;
    }
    case 'Series':
      return nextEpisode(item.Id);
    default:
      return item;
  }
}

export async function nextEpisode(seriesId: string): Promise<Item | null> {
  try {
    const next = await api<ItemsResult>('/Shows/NextUp', {
      query: { SeriesId: seriesId, UserId: userId(), Limit: 1, EnableResumable: true, Fields: 'Overview' },
    });
    if (next.Items[0]) return next.Items[0];
    const first = await api<ItemsResult>(`/Shows/${seriesId}/Episodes`, { query: { UserId: userId(), Limit: 1 } });
    return first.Items[0] ?? null;
  } catch {
    return null;
  }
}

/** Opens the player. Without a start time the player resumes where the user stopped. */
export async function playItem(item: Item, opts: { fromStart?: boolean } = {}) {
  const target = await resolvePlayable(item);
  if (!target) return;
  navigate(`/play/${target.Id}${opts.fromStart ? '?t=0' : ''}`);
}
