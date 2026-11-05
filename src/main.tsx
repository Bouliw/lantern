import { render } from 'preact';
import './platform';
import './styles/fonts.css';
import './styles/themes.css';
import './styles/base.css';
import './styles/player.css';
import { initServer } from './api/client';
import { initSpatialNav } from './nav/spatial';
import './state/settings';
import { App } from './app';

initServer();
initSpatialNav();
render(<App />, document.getElementById('app')!);

// Offline-friendly artwork and shell cache (needs a secure context: localhost or HTTPS).
if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
