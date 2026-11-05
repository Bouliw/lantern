import { useEffect, useLayoutEffect } from 'preact/hooks';
import { serverUrl, session, setServer } from './api/client';
import { catalog, catalogError, loadCatalog } from './api/catalog';
import { loadProfileAppearance } from './state/settings';
import { loadOverviews } from './api/overviews';
import { recall, route, goBack } from './router';
import { t } from './i18n';
import { isTV } from './platform';
import { focusByKey, focusFirst, isBackKey, KEY, pushKeyHandler } from './nav/spatial';
import { Header } from './ui/Header';
import { HoverPreview } from './ui/HoverPreview';
import { Message } from './ui/Loading';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { Details } from './pages/Details';
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';
import { Profiles, ServerSetup } from './pages/Profiles';
import { Player } from './player/Player';

function Page() {
  const r = route.value;
  const [head, arg] = r.parts;
  switch (head) {
    case undefined:
      return <Home />;
    case 'series':
    case 'sagas':
    case 'films':
      return <Library kind={head} />;
    case 'item':
      return <Details key={arg} id={arg} />;
    case 'search':
      return <Search />;
    case 'settings':
      return <Settings />;
    default:
      return <Home />;
  }
}

export function App() {
  const server = serverUrl.value;
  const s = session.value;
  const r = route.value;

  useEffect(() => {
    if (!s) return;
    void loadCatalog();
    void loadProfileAppearance();
    void loadOverviews();
  }, [s?.userId, s?.token]);

  // Refresh when coming back to the app (watched state, new arrivals).
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && loadCatalog();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  // TV back key: pages go back; the player and dialogs register their own handlers first.
  useEffect(
    () =>
      pushKeyHandler((e) => {
        if (!isTV) return false;
        const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
        if (isBackKey(e) || (e.keyCode === KEY.backspace && !typing)) {
          if (route.value.path !== '/') goBack();
          return true;
        }
        return false;
      }),
    [],
  );

  // Restore scroll and focus when returning to a page; start at the top otherwise.
  useLayoutEffect(() => {
    if (r.parts[0] === 'play') return;
    const mem = recall(r.key);
    window.scrollTo(0, mem?.scrollY ?? 0);
    // Coming from the top menu: keep the focus there, so switching category is one press away.
    const fromHeader = !!(document.activeElement as HTMLElement | null)?.closest?.('[data-nav-fixed]');
    if (isTV && !fromHeader) {
      requestAnimationFrame(() => {
        if (!focusByKey(mem?.focusKey)) focusFirst();
        if (mem) window.scrollTo(0, mem.scrollY);
      });
    }
  }, [r.path, !!catalog.value, !!s]);

  if (!server) return <ServerSetup onDone={(url) => setServer(url)} />;
  if (!s)
    return (
      <Profiles
        onServer={() => {
          serverUrl.value = null;
        }}
      />
    );
  if (r.parts[0] === 'play' && r.parts[1]) {
    const tq = r.query.get('t');
    return <Player key={r.parts[1]} id={r.parts[1]} startTicks={tq != null ? Number(tq) : null} />;
  }
  if (catalogError.value && !catalog.value)
    return <Message text={t('common.offline')} action={{ label: t('common.retry'), run: () => loadCatalog(true) }} />;
  return (
    <>
      <Header />
      <Page />
      <HoverPreview />
    </>
  );
}
