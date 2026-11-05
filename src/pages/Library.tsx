import { useMemo } from 'preact/hooks';
import { SplitText } from '../ui/SplitText';
import { catalog } from '../api/catalog';
import { t } from '../i18n';
import { Card } from '../ui/Card';
import { Loading } from '../ui/Loading';

export type LibraryKind = 'series' | 'sagas' | 'films';

export function Library({ kind }: { kind: LibraryKind }) {
  const c = catalog.value;
  const items = useMemo(() => {
    if (!c) return [];
    const list = kind === 'series' ? c.series : kind === 'sagas' ? c.sagas : c.standalone;
    return [...list].sort((a, b) => (a.SortName ?? a.Name).localeCompare(b.SortName ?? b.Name));
  }, [c, kind]);
  if (!c) return <Loading />;
  return (
    <main class="page library">
      <h1 class="page-title" key={kind}><SplitText text={t(`nav.${kind}`)} /></h1>
      <div class="grid">
        {items.map((it, i) => (
          <Card key={it.Id} item={it} rowKey={kind} index={i} />
        ))}
      </div>
    </main>
  );
}
