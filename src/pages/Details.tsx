import { useEffect, useMemo, useState } from 'preact/hooks';
import { api, userId } from '../api/client';
import { ITEM_FIELDS, catalog, isInProgress, representative, sagaChildren } from '../api/catalog';
import { backdropOf, imageUrl, logoOf } from '../api/images';
import type { Item, ItemsResult } from '../api/types';
import { formatRuntime, lang, t } from '../i18n';
import { genreLabel } from '../i18n/genres';
import { navigate } from '../router';
import { nextEpisode } from '../player/launch';
import { EpisodeList } from '../ui/EpisodeList';
import { Img } from '../ui/Img';
import { IconPlay, IconReplay10, IconStar } from '../ui/icons';
import { Loading, Message } from '../ui/Loading';
import { lengthLabel, minutesLeft, overviewOf, rating, yearLabel } from '../ui/meta';

const GENERIC_SEASON = /^(season|saison|staffel|temporada|stagione|seizoen|series|s)\s*\d+$/i;
const SPECIALS = /^(specials?|sp[ée]ciaux|[ée]pisodes sp[ée]ciaux|extras?)$/i;

/** Seasons with their own names (e.g. a TV run, a film, a film series) are "parts", not seasons. */
export function usesParts(seasons: Item[]): boolean {
  const named = seasons.filter((s) => !SPECIALS.test(s.Name.trim()));
  return named.length > 0 && named.every((s) => !GENERIC_SEASON.test(s.Name.trim()));
}

function seasonTab(s: Item, parts: boolean): string {
  if (parts || SPECIALS.test(s.Name.trim())) return s.Name;
  return s.IndexNumber != null ? t('details.season', { n: s.IndexNumber }) : s.Name;
}

function episodeLabel(ep: Item, seasons: Item[], parts: boolean): string {
  if (parts) {
    const i = seasons.findIndex((s) => s.Id === ep.SeasonId);
    const part = i >= 0 ? t('details.part', { n: i + 1 }) : ep.SeasonName ?? '';
    return `${part} · ${t('details.episode', { n: ep.IndexNumber ?? 1 })}`;
  }
  return `S${ep.ParentIndexNumber ?? 1}:E${ep.IndexNumber ?? 1}`;
}

export function Details({ id }: { id: string }) {
  const cached = catalog.value?.byId.get(id);
  const [full, setFull] = useState<Item | null>(null);
  const [missing, setMissing] = useState(false);
  const [seasons, setSeasons] = useState<Item[] | null>(null);
  const [next, setNext] = useState<Item | null>(null);
  const [extras, setExtras] = useState<Item[]>([]);

  useEffect(() => {
    let alive = true;
    setFull(null);
    setMissing(false);
    setSeasons(null);
    setNext(null);
    setExtras([]);
    api<Item>(`/Users/${userId()}/Items/${id}`, { query: { Fields: ITEM_FIELDS } })
      .then((it) => {
        if (!alive) return;
        if (it.Type === 'Episode' && it.SeriesId) {
          navigate(`/item/${it.SeriesId}`, { replace: true });
          return;
        }
        setFull(it);
        if (it.Type === 'Series') {
          api<ItemsResult>(`/Shows/${id}/Seasons`, { query: { UserId: userId(), Fields: 'ChildCount' } })
            .then((r) => alive && setSeasons(r.Items))
            .catch(() => alive && setSeasons([]));
          nextEpisode(id).then((ep) => alive && setNext(ep));
        }
        if (it.Type === 'Movie') {
          api<Item[]>(`/Users/${userId()}/Items/${id}/SpecialFeatures`)
            .then((r) => alive && setExtras(Array.isArray(r) ? r : []))
            .catch(() => {});
        }
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [id]);

  const item = full ?? cached;
  if (!item) return missing ? <Message text={t('details.notFound')} /> : <Loading />;

  const rep = representative(item);
  const backdrop = backdropOf(item, rep);
  const logo = logoOf(item, rep);
  const parts = seasons ? usesParts(seasons) : false;

  // What the main button plays.
  let target: Item | null = null;
  if (item.Type === 'Series') target = next;
  else if (item.Type === 'BoxSet') {
    const kids = sagaChildren(item.Id);
    target = kids.find(isInProgress) ?? kids.find((k) => !k.UserData?.Played) ?? kids[0] ?? null;
  } else target = item;
  const resumable = !!target && isInProgress(target);
  let playLabel = resumable ? t('details.resume') : t('details.play');
  if (target && item.Type === 'Series' && seasons) {
    const label = episodeLabel(target, seasons, parts);
    playLabel = resumable ? t('details.resumeEpisode', { label }) : t('details.playEpisode', { label });
  } else if (target && item.Type === 'BoxSet') {
    playLabel = resumable ? t('details.resumeEpisode', { label: target.Name }) : t('details.playEpisode', { label: target.Name });
  }

  const r = rating(item);
  const length = item.Type === 'Series' && seasons ? t(parts ? 'details.partCount' : 'details.seasonCount', { n: seasons.length }) : lengthLabel(item);
  const meta = [yearLabel(item), length].filter(Boolean);

  return (
    <main class="page details">
      <section class="details-hero">
        <div class="details-backdrop">{backdrop && <Img src={imageUrl(backdrop, Math.min(window.innerWidth, 1920))} eager />}</div>
        <div class="details-shade" />
        <div class="details-head">
          {logo ? <Img src={imageUrl(logo, 640)} class="details-logo" alt={item.Name} eager /> : <h1 class="details-title">{item.Name}</h1>}
          <div class="meta-line">
            {meta.join(' · ')}
            {item.OfficialRating && <span class="badge">{item.OfficialRating}</span>}
            {r != null && (
              <span class="meta-rating">
                <IconStar size={14} /> {r.toFixed(1)}
              </span>
            )}
          </div>
          <div class="details-actions">
            {target && (
              <button class="btn btn-primary" data-nav data-nav-autofocus data-key="details:play" onClick={() => navigate(`/play/${target!.Id}`)}>
                <IconPlay /> {playLabel}
              </button>
            )}
            {target && resumable && (
              <button class="btn btn-secondary" data-nav data-key="details:restart" onClick={() => navigate(`/play/${target!.Id}?t=0`)}>
                <IconReplay10 /> {t('details.restart')}
              </button>
            )}
          </div>
          {target && resumable && (
            <div class="resume-bar">
              <span class="card-progress">
                <span style={{ width: `${Math.min(100, ((target.UserData?.PlaybackPositionTicks ?? 0) / (target.RunTimeTicks || 1)) * 100)}%` }} />
              </span>
              <span>{t('details.left', { n: minutesLeft(target) })}</span>
            </div>
          )}
          {item.Taglines?.[0] && <p class="tagline">{item.Taglines[0]}</p>}
          <p class="details-overview">{overviewOf(item)}</p>
        </div>
      </section>

      <div class="details-body">
        {item.Type === 'Series' && seasons && <SeriesEpisodes series={item} seasons={seasons} parts={parts} initial={next?.SeasonId} />}
        {item.Type === 'BoxSet' && <SagaFilms saga={item} />}
        {item.Type === 'Movie' && extras.length > 0 && <Extras movie={item} extras={extras} />}
        <Credits item={item} />
      </div>
    </main>
  );
}

function Tabs({ tabs, active, onPick, label }: { tabs: { id: string; label: string }[]; active: string; onPick: (id: string) => void; label: string }) {
  return (
    <div class="tabs" role="tablist" aria-label={label}>
      <span class="tabs-label">{label}</span>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          class={'tab' + (tab.id === active ? ' active' : '')}
          aria-selected={tab.id === active}
          data-nav
          data-key={`tab:${tab.id}`}
          onClick={() => onPick(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function SeriesEpisodes({ series, seasons, parts, initial }: { series: Item; seasons: Item[]; parts: boolean; initial?: string }) {
  const [active, setActive] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<Record<string, Item[]>>({});
  const current = active ?? (initial && seasons.some((s) => s.Id === initial) ? initial : seasons[0]?.Id);

  useEffect(() => {
    if (!current || episodes[current]) return;
    let alive = true;
    api<ItemsResult>(`/Shows/${series.Id}/Episodes`, { query: { UserId: userId(), SeasonId: current, Fields: 'Overview' } })
      .then((r) => alive && setEpisodes((e) => ({ ...e, [current]: r.Items })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [current]);

  if (!seasons.length || !current) return null;
  const list = episodes[current];
  return (
    <section class="details-section">
      <Tabs
        label={parts ? t('details.parts') : t('details.seasons')}
        tabs={seasons.map((s) => ({ id: s.Id, label: seasonTab(s, parts) }))}
        active={current}
        onPick={setActive}
      />
      {list ? <EpisodeList items={list} fallback={series} keyPrefix="ep" onPick={(ep) => navigate(`/play/${ep.Id}`)} /> : <Loading />}
    </section>
  );
}

function SagaFilms({ saga }: { saga: Item }) {
  const films = sagaChildren(saga.Id);
  return (
    <section class="details-section">
      <h2 class="section-title">{t('details.films')}</h2>
      <EpisodeList
        items={films}
        keyPrefix="film"
        numbered
        subtitle={(m) => [m.ProductionYear, formatRuntime(m.RunTimeTicks)].filter(Boolean).join(' · ')}
        onPick={(m) => navigate(`/item/${m.Id}`)}
      />
    </section>
  );
}

/** Extras are presented like a season of their own. */
function Extras({ movie, extras }: { movie: Item; extras: Item[] }) {
  const sorted = useMemo(() => [...extras].sort((a, b) => a.Name.localeCompare(b.Name, undefined, { numeric: true })), [extras]);
  return (
    <section class="details-section">
      <Tabs label={t('details.seasons')} tabs={[{ id: 'extras', label: `${t('details.extras')} (${extras.length})` }]} active="extras" onPick={() => {}} />
      <EpisodeList items={sorted} fallback={movie} keyPrefix="extra" onPick={(x) => navigate(`/play/${x.Id}`)} />
    </section>
  );
}

function Credits({ item }: { item: Item }) {
  const people = item.People ?? [];
  const cast = people.filter((p) => p.Type === 'Actor').slice(0, 10);
  const directors = people.filter((p) => p.Type === 'Director');
  const writers = people.filter((p) => p.Type === 'Writer').slice(0, 4);
  const genres = (item.Genres ?? []).map((g) => genreLabel(g, lang.value));
  const studios = (item.Studios ?? []).slice(0, 3).map((s) => s.Name);
  const rows: [string, string[]][] = [
    [t('details.cast'), cast.map((p) => p.Name)],
    [t('details.directors'), directors.map((p) => p.Name)],
    [t('details.writers'), writers.map((p) => p.Name)],
    [t('details.genres'), genres],
    [t('details.studios'), studios],
  ];
  const visible = rows.filter(([, v]) => v.length);
  if (!visible.length) return null;
  return (
    <section class="details-section credits">
      {visible.map(([label, values]) => (
        <p key={label}>
          <span class="credits-label">
            {label}
            {lang.value === 'fr' ? ' : ' : ': '}
          </span>
          {values.join(', ')}
        </p>
      ))}
    </section>
  );
}
