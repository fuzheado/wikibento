/**
 * Local smart-search fallback for the Ask panel (ISSUE-44, tier 1).
 * When the /api/ask ML relay is unavailable (down / rate-limited / offline),
 * this matcher scores manifest widgets against the user's prompt with
 * keyword overlap + curated intent patterns, and returns the same
 * { options: [{widgetType, config, mode?, reason}] } shape so the UI never
 * changes. No network, no key — the graceful-degradation tier.
 */

let manifestPromise = null;
export const loadManifest = () => {
  if (!manifestPromise) {
    manifestPromise = fetch('/manifest.json', { headers: { 'Accept': 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return manifestPromise;
};

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'from', 'in', 'on', 'at', 'with', 'how', 'what', 'want', 'can', 'me', 'my', 'i', 'show', 'see', 'like', 'some', 'that', 'this', 'it', 'is', 'are', 'do', 'does', 'widget', 'widgets', 'display', 'showing', 'look', 'using']);
const tokenize = (s) => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));

// Curated intent patterns: regex → { widgetType, config hint, reason }.
// Specific intents first; keyword scoring is the generic fallback.
const INTENT_PATTERNS = [
  { re: /random.{0,30}(photo|image|picture)/, w: 'categorySize', config: { category: 'Example' }, reason: 'Category Size shows the category breakdown and samples random photos from it.' },
  { re: /(how|often|where).{0,40}(file|image|photo).{0,30}(used|usage)/, w: 'fileUsage', reason: 'File Usage Map shows which wikis and pages use a file.' },
  { re: /(how|often).{0,30}(used|usage)/, w: 'fileUsage', reason: 'File Usage Map shows which wikis and pages use a file.' },
  { re: /(links?|linking).{0,30}(domain|example\.|site|pages?)/, w: 'linkcount', reason: 'External Link Count counts pages linking to a domain.' },
  { re: /(playlist|play|watch|video).{0,30}(video|audio|file)/, w: 'mediaPlayer', reason: 'Media Player plays Commons video/audio — one file or a jukebox playlist.' },
  { re: /(how many|count).{0,50}(articles|edits|users).{0,30}(wikipedia|edition|german|french|spanish|language)/, w: 'wikistats', reason: 'Wiki Stats shows aggregate article/edit/user counts for a language edition.' },
  { re: /(archive|snapshot|wayback)/, w: 'waybackGallery', reason: 'Wayback Snapshot Gallery shows archived captures of a website at chosen dates.' },
  { re: /panorama|360/, w: 'panorama360', reason: 'Panorama Viewer renders an equirectangular Commons file as a 360° view.' },
  { re: /3d|three.dimension|model/, w: 'panorama360', reason: 'Panorama Viewer is the closest current fit for 3D-like content (a 360° panorama).' },
  { re: /top.{0,20}(article|page)/, w: 'topPages', reason: 'Top Wikipedia Articles lists the most-visited articles of a language edition.' },
  { re: /(quality|fa|ga|class)/, w: 'quality', reason: 'Article Quality predicts an article\'s FA/GA/B/C/Start/Stub class.' },
  { re: /(edit|history|recent).{0,20}(edit|change)/, w: 'edithistory', reason: 'Edit History lists recent edits with byte deltas.' },
  { re: /(category|collection).{0,30}(size|how many|count)/, w: 'categorySize', reason: 'Category Size shows a category\'s file/page/subcat breakdown.' },
  { re: /(view|traffic|popular).{0,30}(category|file)/, w: 'cimTrend', reason: 'CIM Views Over Time charts a category\'s monthly pageview trend.' },
  { re: /sparql|query|wikidata/, w: 'sparql', reason: 'SPARQL Query runs any query against Wikidata or Commons.' },
  { re: /(embed|iframe|page).{0,20}(wiki|page)/, w: 'wikiPage', reason: 'Wiki Page embeds any MediaWiki page as an iframe.' },
  { re: /(note|text|markdown|write)/, w: 'markdown', reason: 'Text/Markdown is a free-form note card.' },
  { re: /gallery|images? (of|from|for) .{0,30}(article|page)/, w: 'gallery', reason: 'Article Gallery shows the significant images of an article.' },
  { re: /leaderboard|ranking|top 100|top100/, w: 'cimLeaderboard', reason: 'CIM Global Leaderboard ranks the most-viewed Commons categories.' },
];

export async function askLocal(prompt, manifestOverride) {
  const manifest = manifestOverride || await loadManifest();
  if (!manifest) return { options: [], source: 'local', error: 'manifest unavailable' };

  const tokens = tokenize(prompt);
  const text = prompt.toLowerCase();

  // 1) Curated intent patterns.
  const patternHits = [];
  for (const p of INTENT_PATTERNS) {
    if (p.re.test(text)) patternHits.push({ widgetType: p.w, config: { ...(p.config || {}) }, reason: p.reason });
  }

  // 2) Keyword scoring across the catalog.
  const scored = [];
  for (const w of manifest.widgets) {
    const corpus = `${w.name} ${w.description} ${w.dataSource} ${w.category}`.toLowerCase();
    let score = 0;
    const hits = [];
    for (const t of tokens) {
      if (corpus.includes(t)) { score += w.name.toLowerCase().includes(t) ? 3 : w.category.toLowerCase().includes(t) ? 2 : 1; hits.push(t); }
    }
    if (score > 0) scored.push({ widgetType: w.id, name: w.name, icon: w.icon, score, hits });
  }
  scored.sort((a, b) => b.score - a.score);

  // 3) Merge: pattern hits first (deduped), then top keyword scores.
  const options = [];
  const seen = new Set();
  for (const h of patternHits) {
    if (!seen.has(h.widgetType)) { seen.add(h.widgetType); options.push({ widgetType: h.widgetType, config: h.config, reason: h.reason }); }
  }
  for (const s of scored) {
    if (options.length >= 3) break;
    if (seen.has(s.widgetType)) continue;
    seen.add(s.widgetType);
    options.push({ widgetType: s.widgetType, config: {}, reason: `Matches: ${s.hits.slice(0, 4).join(', ')}` });
  }
  return { options, source: 'local' };
}
