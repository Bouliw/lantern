import { useState } from 'preact/hooks';
import { isLoaded, markLoaded } from '../api/images';

interface Props {
  src?: string;
  alt?: string;
  class?: string;
  eager?: boolean;
}

/** Image that fades in once decoded (instantly when already cached) and hides itself on error. */
export function Img({ src, alt = '', class: cls, eager }: Props) {
  const [okSrc, setOkSrc] = useState<string | null>(isLoaded(src) ? src! : null);
  const [badSrc, setBadSrc] = useState<string | null>(null);
  if (!src || badSrc === src) return null;
  const ready = okSrc === src || isLoaded(src);
  return (
    <img
      class={cls}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      data-ready={ready ? '1' : '0'}
      onLoad={() => {
        markLoaded(src);
        setOkSrc(src);
      }}
      onError={() => setBadSrc(src)}
    />
  );
}
