import { useEffect, useMemo, useState } from 'preact/hooks';
import { catalog, type Catalog } from '../api/catalog';
import { api, userId } from '../api/client';
import type { ItemsResult } from '../api/types';
import { lang, t } from '../i18n';
import { appearance } from '../state/settings';
import { heroItems, homeRows, topRated } from '../home/rows';
import { becauseYouWatched, type RecoRow } from '../reco/engine';
import { cardImageUrls, type CardEntry } from '../ui/Card';
import { preloadQueue } from '../api/images';
import { Hero } from '../ui/Hero';
import { Row } from '../ui/Row';
import { Loading } from '../ui/Loading';

/** In-progress movies and episodes; an episode is shown with its series artwork. */
async function continueWatching(c: Catalog): Promise<CardEntry[]> {
  const res = await api<ItemsResult>(`/Users/${userId()}/Items/Resume`, {
    query: { Limit: 20, MediaTypes: 'Video', Fields: 'SeriesId', EnableTotalRecordCount: false },
  });
  const seen = new Set<string>();
  const out: CardEntry[] = [];
  for (const it of res.Items) {
    const unit = it.Type === 'Episode' && it.SeriesId ? c.byId.get(it.SeriesId) : c.byId.get(it.Id);
    if (!unit || seen.has(unit.Id)) continue;
    seen.add(unit.Id);
    const caption = it.Type === 'Episode' ? `${it.IndexNumber != null ? it.IndexNumber + '. ' : ''}${it.Name}` : undefined;
    out.push({ item: unit, play: it, caption });
  }
  return out;
}

export function Home() {
  const c = catalog.value;
  const [reco, setReco] = useState<RecoRow[]>([]);
  const [resume, setResume] = useState<CardEntry[]>([]);
  const stamp = c ? c.key + c.fetchedAt : '';

  const rows = useMemo(() => (c ? homeRows(c, lang.value) : []), [stamp, lang.value]);
  const hero = useMemo(() => (c ? heroItems(c) : []), [stamp]);
  const top10 = useMemo(() => (c ? topRated(c, 0).slice(0, 10) : []), [stamp]);

  useEffect(() => {
    if (!c) return;
    let alive = true;
    continueWatching(c)
      .then((r) => alive && setResume(r))
      .catch(() => {});
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
        {resume.length > 0 && <Row key="continue" rowKey="continue" title={t('rows.continue')} entries={resume} />}
        {rows.map((r) =>
          r.key === 'top' ? (
            <Row key="top" rowKey="top" title={t('rows.top10', { n: top10.length })} items={top10} top />
          ) : (
            <Row key={r.key} rowKey={r.key} title={r.title} items={r.items} />
          ),
        )}
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
