/**
 * References — a page, plus which wiki it is on (ISSUE-92).
 *
 * The gap this closes: a card that publishes *a page* published only its title. "Weddell Sea" from a live
 * `List of seas` box was indistinguishable from "Weddell Sea" on any other wiki, in any language — so a consumer
 * could not tell whether it had been handed an enwiki article, a Wikisource chapter, or a Wikidata item. Measured
 * 2026-09-16: `excerpt` emitted prose with no article at all, and the new `selection` channel emitted a bare
 * title. URLs elsewhere in the app carry their context (an Internet Archive URL knows where it came from); the
 * *reference-shaped* emitters were the ones losing it.
 *
 * The form is one string, because the wire is text (see the Emitter Contract in WIDGET-DEVELOPMENT.md):
 *
 *     enwiki:Weddell Sea          dewiki:Weddellmeer        enwikisource:The Charterhouse of Parma
 *     commonswiki:File:KM Virgo.jpg                         wikidata:Q1094710
 *
 * Why the **dbname** and not a nickname: `enwiki`, `dewiki`, `commonswiki`, `enwikisource`, `wikidata` are what
 * every Wikimedia API, dump and replica already call these wikis (the site matrix returns 364 of them, measured —
 * meta.wikimedia.org `action=sitematrix`), so nothing has to be translated on the way out. The app's own config
 * fields say `en.wikipedia`; `dbnameOf` maps that form to the canonical one rather than making users learn it.
 *
 * Parsing is unambiguous because a dbname ends in a known family suffix and a page title does not have to: in
 * `File:KM Virgo.jpg` the part before the colon is `File` (not a wiki), so it stays a title. A bare title parses as
 * a title — no project — which is what keeps every existing value and config working unchanged.
 */

/** The families a dbname can end in, longest first so `enwikisource` is not read as `enwiki`. */
const FAMILIES = [
  'wikisource', 'wiktionary', 'wikiversity', 'wikivoyage', 'wikiquote', 'wikibooks', 'wikinews', 'wiki',
];

const SPECIAL = {
  wikidata: { host: 'www.wikidata.org', family: 'wikidata', lang: null },
  commonswiki: { host: 'commons.wikimedia.org', family: 'commons', lang: null },
  metawiki: { host: 'meta.wikimedia.org', family: 'meta', lang: null },
  specieswiki: { host: 'species.wikimedia.org', family: 'species', lang: null },
  mediawikiwiki: { host: 'www.mediawiki.org', family: 'mediawiki', lang: null },
};

/** `engithub`? no — but `enwiki`, `zh_min_nanwiki` and `be_x_oldwiki` are real, so separators are allowed. */
const DBNAME_RE = new RegExp(`^([a-z][a-z0-9_-]*(?:${FAMILIES.join('|')}))$`, 'i');

const SITE_SUFFIX = {
  wikipedia: 'wiki', wikisource: 'wikisource', wiktionary: 'wiktionary', wikibooks: 'wikibooks',
  wikinews: 'wikinews', wikiquote: 'wikiquote', wikiversity: 'wikiversity', wikivoyage: 'wikivoyage',
};

/**
 * Any way the app writes a project → the canonical dbname.
 *
 *   `en.wikipedia` → `enwiki`          `commons.wikimedia` → `commonswiki`
 *   `en.wikisource` → `enwikisource`   `www.wikidata` → `wikidata`      `dewiki` → `dewiki`
 *
 * Returns null when it cannot tell, so a caller can fall back rather than guess.
 */
export function dbnameOf(project) {
  const raw = String(project ?? '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (!raw) return null;
  if (raw in SPECIAL) return raw;
  if (DBNAME_RE.test(raw)) return raw;
  // the dotted form the configs use: <lang>.<family>[.org]
  const m = raw.match(/^([a-z0-9_-]+)\.(wikipedia|wikisource|wiktionary|wikibooks|wikinews|wikiquote|wikiversity|wikivoyage|wikimedia|wikidata)(?:\.org)?$/);
  if (!m) return null;
  const [, lang, family] = m;
  if (family === 'wikidata') return 'wikidata';
  if (family === 'wikimedia') return lang === 'commons' ? 'commonswiki' : `${lang}wiki`;
  return `${lang}${SITE_SUFFIX[family]}`;
}

/** Where a project lives, for building URLs or API calls. */
export function projectSite(project) {
  const dbname = dbnameOf(project);
  if (!dbname) return null;
  if (dbname in SPECIAL) return { dbname, ...SPECIAL[dbname] };
  for (const family of FAMILIES) {
    if (!dbname.endsWith(family)) continue;
    const lang = dbname.slice(0, -family.length);
    if (!lang) break;
    // `wiki` is the dbname suffix for Wikipedia; every other family is already the word in the host.
    const host = family === 'wiki' ? `${lang}.wikipedia.org` : `${lang}.${family}.org`;
    return { dbname, host, family: family === 'wiki' ? 'wikipedia' : family, lang };
  }
  return null;
}

/**
 * A dbname → the **dotted form the app's config fields and fetchers use**: `enwiki` → `en.wikipedia`,
 * `commonswiki` → `commons.wikimedia`, `wikidata` → `www.wikidata`.
 *
 * Two names for the same wiki, and the boundary between them is not cosmetic: the *wire* form is the dbname
 * (what every API and dump calls these wikis), while the app's own fetchers build `https://${project}.org` from
 * the dotted form. Handing a dbname to one of those produces `https://enwiki.org` — a plausible-looking wrong
 * answer that fails as a DNS error rather than as a type error. Measured 2026-09-16 while converting the page
 * widgets to accept references: every one of them broke this way until the helper returned both.
 */
export function projectConfigOf(project) {
  const site = projectSite(project);
  if (!site) return String(project ?? '').trim();
  if (site.dbname === 'wikidata') return 'www.wikidata';
  return site.host.replace(/\.org$/, '');
}

/** A reference string for a page on a project: `enwiki:Weddell Sea`, or the bare title when the project is unknown. */
export function projectRef(project, title) {
  const clean = String(title ?? '').trim();
  if (!clean) return '';
  const dbname = dbnameOf(project);
  return dbname ? `${dbname}:${clean}` : clean;
}

/**
 * Anything → `{ project, title, isRef }`. A value with no readable project prefix is a title, unchanged: that is
 * what makes every existing emitted value and every existing config keep working.
 */
export function parseRef(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { project: null, title: '', isRef: false };
  const colon = raw.indexOf(':');
  if (colon > 0) {
    const head = raw.slice(0, colon);
    const dbname = dbnameOf(head);
    // A dbname-shaped head is a project; anything else (`File`, `Category`, `enwiki` typos like `enwikipedia`) is
    // left in the title rather than silently eaten.
    if (dbname && dbname === head.toLowerCase()) {
      return { project: dbname, title: raw.slice(colon + 1).trim(), isRef: true };
    }
  }
  return { project: null, title: raw, isRef: false };
}

/** The title part of a value, whether or not it carries a project. */
export function titleOf(value) {
  return parseRef(value).title;
}

/** The project part of a value, or null when it carries none. */
export function projectOf(value) {
  return parseRef(value).project;
}

/**
 * Resolve a widget's page config in one step: a value that may be a reference, plus the widget's own project field
 * as the fallback. This is what every page-taking widget calls, so "accepts a reference" is one implementation
 * rather than twelve (ISSUE-92).
 *
 *   resolvePageConfig({ article: 'enwiki:Weddell Sea' }, { field: 'article' })
 *     → { project: 'enwiki', title: 'Weddell Sea', isRef: true }
 *   resolvePageConfig({ article: 'Weddell Sea', project: 'de.wikipedia' }, { field: 'article' })
 *     → { project: 'dewiki',  title: 'Weddell Sea', isRef: false }
 *
 * The reference wins over the configured project, because a value that says where it is from is better evidence
 * than a field the board was built with.
 */
export function resolvePageConfig(config, { field, projectField = 'project', fallbackProject = 'en.wikipedia' } = {}) {
  const raw = config && typeof config === 'object' ? config[field] : '';
  const parsed = parseRef(raw);
  const configured = config && typeof config === 'object' ? config[projectField] : null;
  const project = parsed.project || dbnameOf(configured) || dbnameOf(fallbackProject) || null;
  // `project` is the canonical dbname (the wire form); `projectConfig` is what the app's fetchers and config
  // fields take. Callers that fetch use the second; anything that *publishes* uses the first.
  return { project, projectConfig: projectConfigOf(project), title: parsed.title, isRef: parsed.isRef };
}

/** `resolvePageConfig` under the name call sites use. */
export function pageRef(config, field, projectField = 'project') {
  return resolvePageConfig(config, { field, projectField });
}

/**
 * The same, for a field that holds *several* pages, one per line (an Article List, a gallery of files): each line
 * may carry its own reference, and lines that do not inherit the widget's project.
 *
 *   resolveRefLines('enwiki:Foo\nde:Bar', 'en.wikipedia') → [{ project: 'enwiki', title: 'Foo' }, { project: 'dewiki', title: 'Bar' }]
 */
export function resolveRefLines(text, project) {
  const fallback = dbnameOf(project);
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parsed = parseRef(line);
      const project = parsed.project || fallback;
      return { project, projectConfig: projectConfigOf(project), title: parsed.title, isRef: parsed.isRef };
    });
}

/**
 * Re-aim a reference at a different project, keeping the title — what a consumer does when it is configured for
 * another wiki than the value it was handed. `null` project keeps whatever the value carried.
 */
export function withProject(value, project) {
  const { title } = parseRef(value);
  const dbname = dbnameOf(project);
  if (!dbname || !title) return String(value ?? '');
  return `${dbname}:${title}`;
}
