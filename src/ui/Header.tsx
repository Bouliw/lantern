import { useEffect, useState } from 'preact/hooks';
import { route } from '../router';
import { session } from '../api/client';
import { t } from '../i18n';
import { IconSearch } from './icons';

export function LanternMark({ size = 26 }: { size?: number }) {
  return (
    <svg class="lantern-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M13 5.5q3-4 6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <rect x="10.5" y="6.5" width="11" height="2.4" rx="1.2" fill="currentColor" />
      <path d="M11.2 10.5h9.6l2 13H9.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
      <path d="M16 13.5c2 2.3 2.6 4.1 2.6 5.6a2.6 2.6 0 0 1-5.2 0c0-1.5.7-3.3 2.6-5.6z" fill="var(--accent)" />
      <rect x="7.5" y="24.5" width="17" height="2.6" rx="1.3" fill="currentColor" />
    </svg>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span class="avatar" style={{ width: size, height: size, background: `hsl(${h} 65% 45%)` }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Header() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const path = route.value.path;
  const link = (href: string, label: string, active: boolean) => (
    <a href={href} data-nav class={'nav-link' + (active ? ' active' : '')} aria-current={active ? 'page' : undefined}>
      {label}
    </a>
  );
  return (
    <header class={'header' + (solid ? ' solid' : '')} data-nav-fixed>
      <a href="#/" class="brand" data-nav aria-label={t('nav.home')}>
        <LanternMark />
        <span class="brand-word">lantern</span>
      </a>
      <nav class="nav">
        {link('#/series', t('nav.series'), path.startsWith('/series'))}
        {link('#/sagas', t('nav.sagas'), path.startsWith('/sagas'))}
        {link('#/films', t('nav.films'), path.startsWith('/films'))}
      </nav>
      <div class="header-right">
        <a href="#/search" data-nav class={'icon-btn' + (path.startsWith('/search') ? ' active' : '')} aria-label={t('nav.search')}>
          <IconSearch />
        </a>
        <a href="#/settings" data-nav class="avatar-btn" aria-label={t('nav.settings')}>
          <Avatar name={session.value?.userName ?? '?'} />
        </a>
      </div>
    </header>
  );
}
