import type { Item } from '../api/types';
import { imageUrl, stillOf } from '../api/images';
import { formatRuntime } from '../i18n';
import { Img } from './Img';
import { IconPlay } from './icons';
import { progressOf } from './meta';

interface Props {
  items: Item[];
  /** Artwork used when an entry has no still of its own. */
  fallback?: Item;
  keyPrefix: string;
  onPick: (item: Item) => void;
  numbered?: boolean;
  subtitle?: (item: Item) => string;
}

/** Netflix-style list: still, number, title, runtime and a short summary. */
export function EpisodeList({ items, fallback, keyPrefix, onPick, numbered = true, subtitle }: Props) {
  return (
    <ol class="episodes">
      {items.map((ep, i) => {
        const progress = progressOf(ep);
        return (
          <li key={ep.Id}>
            <button class="episode" data-nav data-key={`${keyPrefix}:${ep.Id}`} onClick={() => onPick(ep)}>
              {numbered && <span class="episode-num">{ep.IndexNumber ?? i + 1}</span>}
              <span class="episode-still">
                <Img src={imageUrl(stillOf(ep, fallback), 400)} />
                <span class="episode-play">
                  <IconPlay size={28} />
                </span>
                {progress > 0 && (
                  <span class="card-progress">
                    <span style={{ width: `${progress}%` }} />
                  </span>
                )}
              </span>
              <span class="episode-text">
                <span class="episode-head">
                  <span class="episode-name">{ep.Name}</span>
                  <span class="episode-time">{subtitle ? subtitle(ep) : formatRuntime(ep.RunTimeTicks)}</span>
                </span>
                {ep.Overview && <span class="episode-overview">{ep.Overview}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
