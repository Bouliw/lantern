import type { Item } from '../api/types';
import { backdropOf, imageUrl, logoOf, posterOf, thumbOf, type ImageRef } from '../api/images';
import { representative } from '../api/catalog';
import { appearance } from '../state/settings';
import { hrefItem } from '../router';
import { Img } from './Img';
import { progressOf } from './meta';

const WIDTH = {
  landscape: { s: 320, m: 400, l: 520 },
  poster: { s: 200, m: 260, l: 320 },
};

export interface CardArt {
  image: ImageRef | null;
  logo: ImageRef | null;
  showTitle: boolean;
}

/** Landscape cards prefer the "thumb" artwork (title baked in), else backdrop + logo. */
export function cardArt(item: Item, shape: 'landscape' | 'poster'): CardArt {
  const rep = representative(item);
  if (shape === 'poster') {
    const image = posterOf(item) ?? posterOf(rep);
    return { image, logo: null, showTitle: !image };
  }
  const thumb = thumbOf(item);
  if (thumb) return { image: thumb, logo: null, showTitle: false };
  const image = backdropOf(item, rep);
  const logo = logoOf(item, rep);
  return { image, logo, showTitle: !logo };
}

export function cardImageUrls(item: Item): (string | undefined)[] {
  const a = appearance.value;
  const art = cardArt(item, a.cards);
  const w = WIDTH[a.cards][a.size];
  return [imageUrl(art.image, w), imageUrl(art.logo, 240)];
}

export interface CardEntry {
  item: Item;
  /** When set, the card starts playback of this item (e.g. the episode to resume). */
  play?: Item;
  caption?: string;
}

interface Props extends CardEntry {
  rowKey: string;
  index: number;
}

export function Card({ item, rowKey, index, play, caption }: Props) {
  const a = appearance.value;
  const art = cardArt(item, a.cards);
  const w = WIDTH[a.cards][a.size];
  const progress = play ? progressOf(play) : item.Type === 'Movie' ? progressOf(item) : 0;
  return (
    <a
      class={'card' + (caption ? ' has-caption' : '')}
      href={play ? `#/play/${play.Id}` : hrefItem(item.Id)}
      data-nav
      data-card={item.Id}
      data-key={`${rowKey}:${item.Id}`}
      style={{ '--i': Math.min(index, 10) } as any}
      aria-label={item.Name}
    >
      <div class="card-media">
        <Img src={imageUrl(art.image, w)} class="card-img" />
        {art.logo && <Img src={imageUrl(art.logo, 240)} class="card-logo" />}
        {art.showTitle && <span class="card-title">{item.Name}</span>}
        {progress > 0 && (
          <span class="card-progress">
            <span style={{ width: `${progress}%` }} />
          </span>
        )}
      </div>
      {caption && <span class="card-caption">{caption}</span>}
    </a>
  );
}
