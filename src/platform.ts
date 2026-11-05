export type PlatformKind = 'tv' | 'desktop' | 'touch';

const ua = navigator.userAgent;
const params = new URLSearchParams(location.search);

/** webOS (and other TV browsers). `?tv=1` forces TV mode for testing on a computer. */
export const isTV: boolean =
  params.get('tv') === '1' || /Web0S|webOS|NetCast|SmartTV|Tizen/i.test(ua) || 'PalmSystem' in window;

/** Running from a package (webOS app) rather than from a web server. */
export const isPackaged = location.protocol === 'file:';

export const hasHover = !isTV && matchMedia('(hover: hover) and (pointer: fine)').matches;

export const platform: PlatformKind = isTV ? 'tv' : hasHover ? 'desktop' : 'touch';

export const isAppleWebKit = /AppleWebKit/.test(ua) && !/Chrome|Chromium|Android|Web0S/i.test(ua);
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function deviceLabel(): string {
  if (isTV) return 'TV';
  if (isIOS) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android';
  if (/Mac/i.test(ua)) return isAppleWebKit ? 'Safari (Mac)' : 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'Web';
}

document.documentElement.dataset.platform = platform;
