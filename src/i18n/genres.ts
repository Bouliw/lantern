// Jellyfin stores genre names in the library's metadata language.
// Known TMDB genres are shown in the interface language; anything else is shown as-is.
const PAIRS: [en: string, fr: string][] = [
  ['Action', 'Action'],
  ['Adventure', 'Aventure'],
  ['Animation', 'Animation'],
  ['Comedy', 'Comédie'],
  ['Crime', 'Crime'],
  ['Documentary', 'Documentaire'],
  ['Drama', 'Drame'],
  ['Family', 'Familial'],
  ['Fantasy', 'Fantastique'],
  ['History', 'Histoire'],
  ['Horror', 'Horreur'],
  ['Music', 'Musique'],
  ['Mystery', 'Mystère'],
  ['Romance', 'Romance'],
  ['Science Fiction', 'Science-Fiction'],
  ['TV Movie', 'Téléfilm'],
  ['Thriller', 'Thriller'],
  ['War', 'Guerre'],
  ['Western', 'Western'],
  ['Action & Adventure', 'Action & Aventure'],
  ['Kids', 'Enfants'],
  ['News', 'Actualités'],
  ['Reality', 'Réalité'],
  ['Sci-Fi & Fantasy', 'Science-Fiction & Fantastique'],
  ['Soap', 'Feuilleton'],
  ['Talk', 'Talk-show'],
  ['War & Politics', 'Guerre & Politique'],
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const lookup = new Map<string, [string, string]>();
for (const p of PAIRS) {
  lookup.set(norm(p[0]), p);
  lookup.set(norm(p[1]), p);
}

/** Plural, row-friendly labels for a few genres. */
const ROW_LABELS: Record<string, [string, string]> = {
  documentary: ['Documentaries', 'Documentaires'],
  'science fiction': ['Science fiction', 'Science-fiction'],
  'sci-fi & fantasy': ['Sci-fi & fantasy', 'Science-fiction & fantastique'],
  comedy: ['Comedies', 'Comédies'],
  drama: ['Dramas', 'Drames'],
  thriller: ['Thrillers', 'Thrillers'],
  western: ['Westerns', 'Westerns'],
};

export function genreLabel(name: string, lang: 'en' | 'fr', forRow = false): string {
  const pair = lookup.get(norm(name));
  if (!pair) return name;
  if (forRow) {
    const row = ROW_LABELS[norm(pair[0])];
    if (row) return lang === 'fr' ? row[1] : row[0];
  }
  return lang === 'fr' ? pair[1] : pair[0];
}

/** Stable key so "Comédie" and "Comedy" count as the same genre. */
export function genreKey(name: string): string {
  const pair = lookup.get(norm(name));
  return pair ? norm(pair[0]) : norm(name);
}
