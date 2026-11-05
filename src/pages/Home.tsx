import { useEffect, useMemo, useState } from 'preact/hooks';
import { catalog } from '../api/catalog';
import { lang, t } from '../i18n';
import { appearance } from '../state/settings';
import { heroItems, homeRows } from '../home/rows';
import { becauseYouWatched, type RecoRow } from '../reco/engine';
import { cardImageUrls } from '../ui/Card';
import { preloadQueue } from '../api/images';
import { Hero } from '../ui/Hero';
import { Row } from '../ui/Row';
import { Loading } from '../ui/Loading';

export function Home() {
  const c = catalog.value;
  const [reco, setReco] = useState<RecoRow[]>([]);
  const stamp = c ? c.key + c.fetchedAt : '';

  const rows = useMemo(() => (c ? homeRows(c, lang.value) : []), [stamp, lang.value]);
  const hero = useMemo(() => (c ? heroItems(c) : []), [stamp]);

  useEffect(() => {
    if (!c) return;
    let alive = true;
    becauseYouWatched(c)
      .then((r) => alive && setReco(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [stamp]);

  // Warm the image cache for every card on the page, a few at a time.
  useEffect(() => {
    if (!rows.length) return;
    const urls = rows.flatMap((r) => r.items.slice(0, 14).flatMap(cardImageUrls));
    preloadQueue(urls.slice(0, 160));
  }, [stamp, appearance.value.cards, appearance.value.size]);

  if (!c) return <Loading />;

  return (
    <main class="page home">
      <Hero items={hero} />
      <div class="rows">
        {rows.map((r) => (
          <Row key={r.key} rowKey={r.key} title={r.title} items={r.items} />
        ))}
        {reco.map((r) => (
          <Row
            key={'because-' + r.seed.Id}
            rowKey={'because-' + r.seed.Id}
            title={t('rows.because', { title: r.seed.Name })}
            items={r.items}
          />
        ))}
      </div>
    </main>
  );
}
