import { projectConfigOf } from './reference.js';

/**
 * Projects — every wiki, ordered by what you actually use (ISSUE-93).
 *
 * The problem: 21 of the 42 widget types ask which wiki to work on, and five of them offered a hardcoded list —
 * `topPages` 30 languages, `wikistats` 13, `pageviews` 6, `linkcount` 3, `categorySize` 2. The site matrix says
 * how many there really are: **374 languages, 364 wikis** (measured 2026-09-16, `action=sitematrix`, 121 KB). A
 * six-option select covers 1.6% of what exists, and most Wikimedia content is not in English.
 *
 * The answer Andrew asked for is *not* an alphabetical list of 364 — it is a list ordered by usefulness:
 *
 *   1. the projects **this user** has used recently (the app already does this for widgets, as
 *      `wikibento-recent-widgets`; this mirrors it as `wikibento-recent-projects`);
 *   2. a **user default** — one setting, "my wiki", so the common case is zero clicks;
 *   3. a **curated shortlist** of the languages and sister projects that carry the most content, as suggestions;
 *   4. **everything else**, searchable — type `zh`, `中文` or `wikisource`.
 *
 * Ranking is convenience; *completeness is the point*. The list is the whole matrix, and this module only decides
 * what order to show it in.
 *
 * The parsing and ordering here are pure (a storage object is injected), because the interesting behaviour is the
 * ordering rules, and those deserve tests rather than a browser.
 */

/** The site matrix, trimmed to the fields we use. `smsiteprop` cuts the response from 121 KB to what is needed. */
export const SITEMATRIX_URL = 'https://meta.wikimedia.org/w/api.php?action=sitematrix&format=json'
  + '&formatversion=2&origin=*&smsiteprop=code|dbname|url|name|localname';

/** Where the (small, trimmed) list is mirrored so a first paint never waits on a 121 KB fetch. */
export const PROJECTS_CACHE_KEY = 'wikibento-projects';
export const PROJECTS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The recently-used list, mirroring AddWidgetPanel's `wikibento-recent-widgets`. */
export const RECENT_KEY = 'wikibento-recent-projects';
export const RECENT_CAP = 8;

/** The default a user sets once, so the common case needs no click. */
export const DEFAULT_KEY = 'wikibento-default-project';

/**
 * Families the app can actually work with — the ones our widgets fetch from. Everything else in the matrix (the
 * chapter wikis, `advisorswiki`, the `*.wikimedia.org` governance sites) is not content, and offering it in a
 * picker of *content* projects would be noise: measured, `specials` alone carries dozens of them.
 */
const CONTENT_FAMILIES = ['wiki', 'wikisource', 'wiktionary', 'wikibooks', 'wikinews', 'wikiquote', 'wikiversity', 'wikivoyage'];

/** The non-language projects worth offering, with the labels people use. */
export const SPECIAL_PROJECTS = [
  { dbname: 'wikidata', label: 'Wikidata', host: 'www.wikidata.org', family: 'wikidata', lang: null },
  { dbname: 'commonswiki', label: 'Wikimedia Commons', host: 'commons.wikimedia.org', family: 'commons', lang: null },
  { dbname: 'metawiki', label: 'Meta-Wiki', host: 'meta.wikimedia.org', family: 'meta', lang: null },
  { dbname: 'specieswiki', label: 'Wikispecies', host: 'species.wikimedia.org', family: 'species', lang: null },
];

/**
 * English names for the languages people actually type. The site matrix returns the *native* name (`中文`, `العربية`),
 * which is right for display and useless for search: measured, typing "chinese" against the real matrix matched
 * nothing at all. So each option carries both — `中文 · Chinese` — and search looks at both.
 *
 * This is a search aid, not a language list: the matrix stays the authority on what exists (374 languages).
 */
export const LANGUAGE_EN = {
  en: 'English', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', pt: 'Portuguese', nl: 'Dutch',
  ru: 'Russian', uk: 'Ukrainian', pl: 'Polish', cs: 'Czech', sv: 'Swedish', no: 'Norwegian', da: 'Danish',
  fi: 'Finnish', is: 'Icelandic', hu: 'Hungarian', ro: 'Romanian', bg: 'Bulgarian', el: 'Greek', tr: 'Turkish',
  ar: 'Arabic', he: 'Hebrew', fa: 'Persian', hi: 'Hindi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu', ur: 'Urdu',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian', ms: 'Malay',
  ca: 'Catalan', eu: 'Basque', gl: 'Galician', sr: 'Serbian', hr: 'Croatian', sl: 'Slovenian', lt: 'Lithuanian',
  lv: 'Latvian', et: 'Estonian', af: 'Afrikaans', sw: 'Swahili', yo: 'Yoruba', ha: 'Hausa', am: 'Amharic',
};

/**
 * The curated shortlist: the Wikipedias with the most content, the sister projects in the most-used languages, and
 * the multilingual hubs. Suggestions, not a limit — measured, this is 18 of 364.
 */
export const COMMON_PROJECTS = [
  'enwiki', 'dewiki', 'frwiki', 'eswiki', 'jawiki', 'ruwiki', 'zhwiki', 'itwiki', 'ptwiki', 'arwiki', 'plwiki', 'nlwiki',
  'commonswiki', 'wikidata', 'metawiki',
  'enwikisource', 'dewikisource', 'enwiktionary',
];

const FAMILY_LABELS = {
  wiki: 'Wikipedia', wikisource: 'Wikisource', wiktionary: 'Wiktionary', wikibooks: 'Wikibooks',
  wikinews: 'Wikinews', wikiquote: 'Wikiquote', wikiversity: 'Wikiversity', wikivoyage: 'Wikivoyage',
};

/**
 * `action=sitematrix` → a flat list, in the shape the rest of the app speaks (dbname, host, family, lang, label).
 *
 * Measured shape: numeric keys per language, each `{ code, name, localname, dir, site: [{ dbname, url, code }] }`,
 * plus a `specials` array that mixes the hubs we want (wikidata, commons) with dozens of chapter wikis we do not.
 * A project whose family the app cannot fetch from is dropped rather than shown and then failing.
 */
export function parseSiteMatrix(json) {
  const out = [];
  const push = (dbname, label, host, family, lang, dir, langName, langEn) => {
    if (!dbname || out.some((p) => p.dbname === dbname)) return;
    // `config` is the dotted form the app stores (`en.wikipedia`); `dbname` is the wire form. One mapping decides
    // both (reference.js), so this module never re-invents it — the mistake ISSUE-92 recorded.
    out.push({
      dbname, label, host, family, dir: dir || 'ltr', config: projectConfigOf(dbname),
      lang, langName: langName || null,
      langEn: langEn || LANGUAGE_EN[lang] || null,
    });
  };
  const sm = json && json.sitematrix;
  if (sm && typeof sm === 'object') {
    for (const [key, value] of Object.entries(sm)) {
      if (!/^\d+$/.test(key) || !value || typeof value !== 'object') continue;
      const langName = value.localname || value.name || value.code || '';
      const langEn = LANGUAGE_EN[value.code] || null;
      for (const site of value.site || []) {
        if (!CONTENT_FAMILIES.includes(site.code)) continue;
        const family = site.code === 'wiki' ? 'wikipedia' : site.code;
        // "German Wikipedia (Deutsch)" — the English name first, because that is how the list is searched and how
        // most people will read it, with the localised name kept beside it for the person it is local to.
        const familyLabel = FAMILY_LABELS[site.code] || family;
        const labelText = langEn
          ? `${langEn} ${familyLabel}${langName && langName !== langEn ? ` (${langName})` : ''}`
          : `${langName} ${familyLabel}`;
        push(site.dbname, labelText, hostOf(site.url), family,
          value.code || null, value.dir, langName, langEn);
      }
    }
  }
  for (const special of SPECIAL_PROJECTS) {
    const inMatrix = !sm || (Array.isArray(sm.specials) && sm.specials.some((s) => s && s.dbname === special.dbname));
    if (inMatrix) out.push({ ...special, config: projectConfigOf(special.dbname), dir: 'ltr', langName: null, langEn: null });
  }
  return out.sort((a, b) => a.dbname.localeCompare(b.dbname));
}

/** `https://en.wikipedia.org` → `en.wikipedia.org`, tolerating a missing scheme. */
function hostOf(url) {
  return String(url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/**
 * One entry per **language**, for the widgets that take a bare language code (`wikistats`, `topPages`) rather than a
 * project. Wikipedia is the representative site, because that is what a language code means in those APIs.
 */
export function languageList(projects) {
  const seen = new Map();
  for (const p of projects) {
    if (p.family !== 'wikipedia' || !p.lang || seen.has(p.lang)) continue;
    seen.set(p.lang, { lang: p.lang, label: p.langName || p.lang, dbname: p.dbname, dir: p.dir || 'ltr' });
  }
  return [...seen.values()].sort((a, b) => a.lang.localeCompare(b.lang));
}

/**
 * The order a picker should show: recent → default → curated shortlist → everything else (alphabetical *within*
 * its group, which is the only place alphabetical belongs). Pure, so the rules can be tested without a browser.
 */
export function orderProjects(projects, { recent = [], defaultProject = null, mode = 'project' } = {}) {
  const rank = (p) => {
    const key = mode === 'language' ? p.lang : p.dbname;
    const ri = recent.indexOf(key);
    if (ri !== -1) return [0, ri];
    if (defaultProject && key === defaultProject) return [1, 0];
    const ci = COMMON_PROJECTS.indexOf(key);
    if (ci !== -1) return [2, ci];
    return [3, 0];
  };
  return [...projects].sort((a, b) => {
    const [ga, ia] = rank(a);
    const [gb, ib] = rank(b);
    if (ga !== gb) return ga - gb;
    if (ga === 0 || ga === 2) return ia - ib;
    return String(a.label).localeCompare(String(b.label));
  });
}

/** Filter for the picker's search box: matches a label, a dbname or a language code, case- and accent-tolerant. */
export function filterProjects(projects, query, { mode = 'project' } = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return projects;
  const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const needle = fold(q);
  // Ranked, not merely filtered: typing `enwiki` should put `enwiki` first even though `enwikisource` also contains
  // it. Exact beats prefix beats substring, and within a rank the caller's order (recency, default, curated) stands.
  const score = (p) => {
    const keys = [p.dbname, p.lang, p.label, p.langName, p.langEn, p.family].map(fold).filter(Boolean);
    if (keys.some((k) => k === needle)) return 0;
    if (keys.some((k) => k.startsWith(needle))) return 1;
    return 2;
  };
  return projects
    .map((p, i) => ({ p, i, s: score(p) }))
    .filter(({ p, s }) => s < 2 || [p.label, p.dbname, p.lang, p.langName, p.langEn, p.family].map(fold).join(' ').includes(needle))
    .sort((a, b) => (a.s - b.s) || (a.i - b.i))
    .map(({ p }) => p);
}

/**
 * What a pick should store. Project fields keep the app's long-standing dotted form (`en.wikipedia`) because that
 * is what every existing board holds and what the fetchers expect; a *reference* may carry the dbname, and the
 * resolver normalises either. Language fields store the bare code.
 */
export function toFieldValue(project, { mode = 'project' } = {}) {
  if (!project) return '';
  if (mode === 'language') return project.lang || '';
  return project.config || project.dbname || '';
}

/** The label to show for a stored value (a dbname, or a bare language code). */
export function labelFor(projects, value, { mode = 'project' } = {}) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  const found = mode === 'language' ? projects.find((p) => p.lang === v) : projects.find((p) => p.dbname === v);
  if (!found) return v;
  // A language field wants the language ("Deutsch"), a project field wants the wiki ("Deutsch Wikipedia").
  return mode === 'language' ? (found.langEn || found.langName || found.label) : found.label;
}

// ── the user's own memory (storage injected, so this is testable without a browser) ─────────────────

/** Recently used projects, newest first. Corrupt or absent storage is simply "nothing yet". */
export function readRecentProjects(storage, { key = RECENT_KEY, cap = RECENT_CAP } = {}) {
  try {
    const raw = storage && storage.getItem ? storage.getItem(key) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v) => typeof v === 'string' && v).slice(0, cap);
  } catch { return []; }
}

/** Note a project as used. Newest first, no duplicates, capped — the same shape as the widget MRU. */
export function noteRecentProject(storage, value, { key = RECENT_KEY, cap = RECENT_CAP } = {}) {
  const v = String(value ?? '').trim();
  if (!v) return readRecentProjects(storage, { key, cap });
  const next = [v, ...readRecentProjects(storage, { key, cap }).filter((x) => x !== v)].slice(0, cap);
  try { if (storage && storage.setItem) storage.setItem(key, JSON.stringify(next)); } catch { /* full or blocked */ }
  return next;
}

/** The user's "my wiki", or null. */
export function readDefaultProject(storage, { key = DEFAULT_KEY } = {}) {
  try {
    const v = storage && storage.getItem ? storage.getItem(key) : null;
    return v && String(v).trim() ? String(v).trim() : null;
  } catch { return null; }
}

export function writeDefaultProject(storage, value, { key = DEFAULT_KEY } = {}) {
  try {
    if (!value) storage.removeItem(key);
    else storage.setItem(key, String(value));
  } catch { /* ignore */ }
  return value || null;
}

/**
 * The trimmed list as it is mirrored in storage: a version, when it was fetched, and the projects. The version is
 * bumped when the shape changes, so a stale mirror from an older build is discarded rather than misread.
 */
export function packProjects(projects, at = Date.now()) {
  return JSON.stringify({ v: 1, at, projects });
}

export function readPackedProjects(raw, { ttlMs = PROJECTS_CACHE_TTL_MS, now = Date.now() } = {}) {
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.projects) || !parsed.projects.length) return null;
    if (typeof parsed.at !== 'number' || now - parsed.at > ttlMs) return null;
    return parsed.projects;
  } catch { return null; }
}
