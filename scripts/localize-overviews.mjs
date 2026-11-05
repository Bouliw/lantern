#!/usr/bin/env node
// Looks up summaries in other languages for movies, series and collections, through the Jellyfin
// server's own metadata providers, and writes them to a JSON file that Lantern reads to show
// summaries in the interface language.
//
//   node scripts/localize-overviews.mjs --server http://localhost:8096 --token-file <file> --out overviews.json [--langs en,fr]
//
// Needs an administrator token. Existing entries are kept, so later runs only look up new titles.
// Summaries that were locked in Jellyfin (custom text) are left as they are.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const server = (opt('server') ?? process.env.JELLYFIN_URL ?? 'http://localhost:8096').replace(/\/+$/, '');
const tokenFile = opt('token-file');
const token = opt('token') ?? (tokenFile ? readFileSync(tokenFile, 'utf8').trim() : process.env.JELLYFIN_TOKEN);
const out = opt('out') ?? 'overviews.json';
const langs = (opt('langs') ?? 'en,fr').split(',').map((l) => l.trim().toLowerCase()).filter(Boolean);
if (!token) {
  console.error('Missing --token or --token-file (administrator API key).');
  process.exit(1);
}

const headers = {
  Authorization: `MediaBrowser Client="Lantern", Device="server", DeviceId="lantern-localize", Version="0.1.0", Token="${token}"`,
  'Content-Type': 'application/json',
};
async function api(method, path, body) {
  const res = await fetch(server + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const COUNTRY = { en: 'US', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', pt: 'BR', nl: 'NL', ja: 'JP', ko: 'KR', zh: 'CN' };
const SEARCH = { Movie: 'Movie', Series: 'Series', BoxSet: 'BoxSet' };
const short = (l) => (l || '').slice(0, 2).toLowerCase();

const data = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { version: 1, items: {} };
const config = await api('GET', '/System/Configuration');
const serverLang = short(config.PreferredMetadataLanguage) || 'en';

// Which language each title's own metadata is in (per library).
const titles = new Map();
for (const folder of await api('GET', '/Library/VirtualFolders')) {
  const libLang = short(folder.LibraryOptions?.PreferredMetadataLanguage) || serverLang;
  const res = await api(
    'GET',
    `/Items?ParentId=${folder.ItemId}&Recursive=true&IncludeItemTypes=Movie,Series,BoxSet&Fields=ProviderIds,LockedFields&EnableImages=false`,
  );
  for (const it of res.Items) titles.set(it.Id, { it, libLang });
}

let added = 0;
for (const id of Object.keys(data.items)) if (!titles.has(id)) delete data.items[id];
for (const [id, { it, libLang }] of titles) {
  if (it.LockData || it.LockedFields?.includes('Overview')) continue;
  const ids = it.ProviderIds ?? {};
  if (!Object.keys(ids).length) continue;
  for (const lang of langs) {
    if (lang === libLang || data.items[id]?.[lang] !== undefined) continue;
    try {
      const results = await api('POST', `/Items/RemoteSearch/${SEARCH[it.Type]}`, {
        SearchInfo: { Name: it.Name, Year: it.ProductionYear, ProviderIds: ids, MetadataLanguage: lang, MetadataCountryCode: COUNTRY[lang] ?? '' },
        ItemId: id,
        SearchProviderName: 'TheMovieDb',
      });
      const match = results.find((r) => r.ProviderIds?.Tmdb && r.ProviderIds.Tmdb === ids.Tmdb) ?? results[0];
      (data.items[id] ??= {})[lang] = match?.Overview ?? '';
      if (match?.Overview) added++;
    } catch (err) {
      console.error(`${it.Name} (${lang}): ${err.message}`);
    }
  }
}

data.updated = new Date().toISOString();
writeFileSync(out + '.tmp', JSON.stringify(data));
renameSync(out + '.tmp', out);
console.log(`${added} summaries added, ${Object.keys(data.items).length} titles in ${out}`);
