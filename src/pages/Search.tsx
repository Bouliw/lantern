import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { catalog, type Catalog } from '../api/catalog';
import type { Item } from '../api/types';
import { navigate, route } from '../router';
import { t } from '../i18n';
import { genreLabel } from '../i18n/genres';
import { isTV } from '../platform';
import { Card } from '../ui/Card';
import { IconSearch } from '../ui/icons';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function scoreOf(item: Item, q: string): number {
  const name = norm(item.Name);
  if (name === q) return 120;
  if (name.startsWith(q)) return 100;
  if (name.split(' ').some((w) => w.startsWith(q))) return 85;
  if (name.includes(q)) return 70;
  if (item.OriginalTitle && norm(item.OriginalTitle).includes(q)) return 60;
  if (item.People?.some((p) => norm(p.Name).split(' ').some((w) => w.startsWith(q)) || norm(p.Name).startsWith(q))) return 40;
  if (item.Genres?.some((g) => norm(g).startsWith(q) || norm(genreLabel(g, 'en')).startsWith(q))) return 25;
  return 0;
}

export function searchCatalog(c: Catalog, text: string): Item[] {
  const q = norm(text);
  if (!q) return [];
  const pool = [...c.movies, ...c.series, ...c.sagas];
  return pool
    .map((item) => ({ item, s: scoreOf(item, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.item.Name.localeCompare(b.item.Name))
    .map((x) => x.item);
}

export function Search() {
  const c = catalog.value;
  const [text, setText] = useState(route.value.query.get('q') ?? '');
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => (c ? searchCatalog(c, text) : []), [c, text]);

  useEffect(() => {
    if (!isTV) input.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => navigate(`/search${text ? '?q=' + encodeURIComponent(text) : ''}`, { replace: true }), 300);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <main class="page search">
      <label class="search-field">
        <IconSearch />
        <input
          ref={input}
          type="search"
          data-nav
          data-nav-autofocus
          value={text}
          placeholder={t('search.placeholder')}
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
        />
      </label>
      {text.trim() && !results.length && <p class="search-empty">{t('search.empty', { q: text.trim() })}</p>}
      {!text.trim() && <p class="search-empty">{t('search.hint')}</p>}
      <div class="grid">
        {results.map((it, i) => (
          <Card key={it.Id} item={it} rowKey="search" index={i} />
        ))}
      </div>
    </main>
  );
}
