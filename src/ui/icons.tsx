import type { JSX } from 'preact';

type P = { size?: number; class?: string };

function svg(path: JSX.Element, { size = 24, class: cls }: P, viewBox = '0 0 24 24') {
  return (
    <svg class={'icon ' + (cls ?? '')} width={size} height={size} viewBox={viewBox} fill="currentColor" aria-hidden="true">
      {path}
    </svg>
  );
}

export const IconPlay = (p: P) => svg(<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />, p);
export const IconPause = (p: P) => svg(<path d="M6 4h4v16H6zM14 4h4v16h-4z" />, p);
export const IconInfo = (p: P) =>
  svg(
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-1 7v6h2v-6h-2zm0-4v2h2V7h-2z" />,
    p,
  );
export const IconChevronLeft = (p: P) => svg(<path d="M15.4 4.6 8 12l7.4 7.4 1.4-1.4-6-6 6-6z" />, p);
export const IconChevronRight = (p: P) => svg(<path d="m8.6 4.6 7.4 7.4-7.4 7.4-1.4-1.4 6-6-6-6z" />, p);
export const IconChevronDown = (p: P) => svg(<path d="m4.6 8.6 7.4 7.4 7.4-7.4-1.4-1.4-6 6-6-6z" />, p);
export const IconSearch = (p: P) =>
  svg(<path d="M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z" />, p);
export const IconBack = (p: P) => svg(<path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" />, p);
export const IconReplay10 = (p: P) =>
  svg(
    <path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8zm-1.9 11H9.2v-3.3l-1 .3v-.7l1.8-.6h.1V16zm4.3-1.8c0 .6-.1 1.1-.4 1.4-.3.3-.6.5-1.1.5s-.8-.2-1.1-.5c-.3-.3-.4-.8-.4-1.4v-.7c0-.6.1-1.1.4-1.4.3-.3.6-.5 1.1-.5s.8.2 1.1.5c.3.3.4.8.4 1.4v.7zm-.9-.8c0-.4 0-.6-.1-.8-.1-.2-.3-.3-.5-.3s-.4.1-.5.3c-.1.2-.1.4-.1.8v.9c0 .4 0 .6.1.8.1.2.3.3.5.3s.4-.1.5-.3c.1-.2.1-.5.1-.8v-.9z" />,
    p,
  );
export const IconForward10 = (p: P) =>
  svg(
    <path d="M12 5V2l5 4-5 4V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8zm-1.9 11H9.2v-3.3l-1 .3v-.7l1.8-.6h.1V16zm4.3-1.8c0 .6-.1 1.1-.4 1.4-.3.3-.6.5-1.1.5s-.8-.2-1.1-.5c-.3-.3-.4-.8-.4-1.4v-.7c0-.6.1-1.1.4-1.4.3-.3.6-.5 1.1-.5s.8.2 1.1.5c.3.3.4.8.4 1.4v.7zm-.9-.8c0-.4 0-.6-.1-.8-.1-.2-.3-.3-.5-.3s-.4.1-.5.3c-.1.2-.1.4-.1.8v.9c0 .4 0 .6.1.8.1.2.3.3.5.3s.4-.1.5-.3c.1-.2.1-.5.1-.8v-.9z" />,
    p,
  );
export const IconVolume = (p: P) =>
  svg(<path d="M4 9v6h4l5 5V4L8 9H4zm12.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />, p);
export const IconMute = (p: P) =>
  svg(<path d="M4 9v6h4l5 5V4L8 9H4zm12.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" />, p);
export const IconSubtitles = (p: P) =>
  svg(<path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z" />, p);
export const IconChapters = (p: P) => svg(<path d="M3 5h2v2H3zm4 0h14v2H7zM3 11h2v2H3zm4 0h14v2H7zm-4 6h2v2H3zm4 0h14v2H7z" />, p);
export const IconNext = (p: P) => svg(<path d="M5 5.5v13a1 1 0 0 0 1.5.86L15 14.2V18h2V6h-2v3.8L6.5 4.64A1 1 0 0 0 5 5.5z" />, p);
export const IconFullscreen = (p: P) => svg(<path d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z" />, p);
export const IconFullscreenExit = (p: P) => svg(<path d="M8 4h2v6H4V8h4V4zm6 0h2v4h4v2h-6V4zM4 14h6v6H8v-4H4v-2zm10 0h6v2h-4v4h-2v-6z" />, p);
export const IconCheck = (p: P) => svg(<path d="m9 16.2-4.2-4.2-1.4 1.4L9 19 21 7l-1.4-1.4z" />, p);
export const IconGear = (p: P) =>
  svg(
    <path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.3 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5L19.4 13zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)" />,
    p,
  );
export const IconStar = (p: P) => svg(<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />, p);
