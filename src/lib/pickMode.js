/**
 * "Shop and pick": choose a widget type as a brush, then click items in content you are already reading to place
 * cards for them (ISSUE-114). This module is the pure half — which widgets can consume a given kind of thing, and
 * what config a click produces. The interaction lives in App.jsx and WidgetFrame's `onSelect` path.
 *
 * The missing piece it depends on: a registry field can now declare WHAT it consumes (`kind: 'article'`), using the
 * same vocabulary `paramSources.js` validates (`article`, `page`, `commons-file`, `commons-category`,
 * `commons-gallery`, `wikidata-item`, `cim-category`). Before that annotation, `gallery.article`, `excerpt.article`
 * and `pageviews.article` were all "text" and nothing could answer "which widgets accept an ARTICLE?".
 */
import { fieldVisible } from './configFields.js';

/**
 * Which kinds a thing of each kind can also satisfy — the vocabulary is a small hierarchy, not a set of labels.
 *
 * `paramSources.js` defines `article` as the main namespace and `page` as the namespaces a page lookup covers, so an
 * article **is** a page and a Wiki Page widget renders one happily. Comparing the labels for equality made that a
 * refusal: Andrew armed "Wiki Page", clicked an article in an article list, and got "Wiki Page does not take a
 * article" (2026-09-24). The relation is one-way on purpose — a page is not necessarily an article, so a page value
 * still won't fill an `article` field.
 */
export const KIND_SUPERSET = { article: ['page'] };

/** The kinds that can accept a thing of this kind: itself, plus the broader kinds it belongs to. */
export function kindsAccepting(kind) {
  return [kind, ...(KIND_SUPERSET[kind] || [])];
}

/** "an article", "a wiki page" — for messages that read like sentences. Vowel-letter based, which is enough here. */
export function aOrAn(word) {
  return `${/^[aeiou]/i.test(String(word)) ? 'an' : 'a'} ${word}`;
}

/** What a widget accepts, in words: "an article", or "an article, a wiki page or a Commons file". */
export function acceptedKindsLabel(def) {
  const labels = [...new Set(kindFields(def).map((k) => KIND_LABELS[k.kind] || k.kind))];
  if (!labels.length) return 'nothing';
  if (labels.length === 1) return aOrAn(labels[0]);
  return `${labels.slice(0, -1).map(aOrAn).join(', ')} or ${aOrAn(labels[labels.length - 1])}`;
}

/** Kinds a field may declare — the ids `paramSources.js` can validate. */
export const KIND_IDS = ['article', 'page', 'commons-file', 'commons-category', 'commons-gallery', 'wikidata-item', 'cim-category'];

export const KIND_LABELS = {
  article: 'article', page: 'wiki page', 'commons-file': 'Commons file', 'commons-category': 'category',
  'commons-gallery': 'gallery page', 'wikidata-item': 'Wikidata item', 'cim-category': 'CIM category',
};

/**
 * Which wiki an item came from, read off its own URL — `https://de.wikipedia.org/wiki/X` → `de.wikipedia`,
 * `https://commons.wikimedia.org/wiki/File:X` → `commons.wikimedia`. The brush uses it so a spawned card targets the
 * wiki the reader was actually reading: the ISSUE-99 rule ("a reference beats a configured project") applied to a
 * click. An unknown or relative URL returns undefined, which leaves the widget's own default in place.
 */
export function projectFromUrl(url) {
  const m = /^https?:\/\/([a-z0-9-]+)\.([a-z]+)\.org\//i.exec(String(url || ''));
  return m ? `${m[1]}.${m[2]}` : undefined;
}

/**
 * What a Wikimedia link IS, read from the link itself — the ISSUE-99 rule ("a reference beats a configured project")
 * applied to a URL. A row that links to `en.wikipedia.org/wiki/Marie_Curie` is an article; one that links to
 * `commons.wikimedia.org/wiki/File:X.jpg` is a Commons file. Underscores become spaces and percent-escapes are decoded,
 * so the value is a title you could paste into a widget. Anything else — a namespace page like `Category:` or `Talk:`,
 * another site, a relative URL — names nothing the vocabulary can place, and returns null, which leaves the row an
 * ordinary link. This is what lets a generic renderer (RankingCard) offer a pick without the data layer declaring one.
 */
export function pickFromUrl(url) {
  const m = /^https?:\/\/([a-z0-9-]+)\.([a-z]+)\.org\/wiki\/(.+)$/i.exec(String(url || ''));
  if (!m) return null;
  const [, lang, family, raw] = m;
  let title;
  try { title = decodeURIComponent(raw).replace(/_/g, ' '); } catch { title = raw.replace(/_/g, ' '); }
  // A link into a section (`…/Kohat#History`) names the page, not the fragment: a card for "Kohat#History" would ask
  // the API for a title that does not exist.
  title = title.split('#')[0].trim();
  const project = `${lang}.${family}`;
  // A `File:` link is a file wherever it is linked from — the box's own links are local ones
  // (en.wikipedia.org/wiki/File:…), and a local file page is a pointer to the Commons file in all but a handful of
  // cases. The project stays the one the link came from, which is the honest answer to "where did this come from".
  if (/^file:/i.test(title) && (family === 'wikimedia' || family === 'wikipedia')) {
    const value = 'File:' + title.slice(5);
    return { kind: 'commons-file', value, label: value.slice(5), project };
  }
  const NS = /^(file|category|special|talk|user|user talk|help|template|portal|wikipedia|draft|module|book|timedtext|mediawiki):/i;
  if (family === 'wikipedia' && !NS.test(title)) return { kind: 'article', value: title, label: title, project };
  return null;
}

/**
 * The widgets whose rows can be picked, and what picking one places. The contract in one place: a test asserts every
 * key is a renderer that exists and every kind is one the app can resolve, and ISSUE-114's "what is pickable here"
 * hint will read it. The frame passes `picking` / `onPickItem` down; the row supplies the item.
 *
 * Deliberately absent (decided with Andrew, 2026-09-24): `SparqlCard` and `ListSourceCard`, because a row there can be
 * anything and "what is a row" is a design question (the answer is a kind declared on the row — ISSUE-96's typed
 * payloads). Also absent, with reasons worth keeping: `WikiPageCard` renders an **iframe** (nothing inside is our
 * DOM — the real prize for a later pass), `AssessmentsCard`'s rows are WikiProjects rather than the article the card
 * is about, and `FileTrafficCard` is a one-file chart with no rows at all.
 */
export const PICKABLE_RENDERERS = {
  ArticleListCard: 'article',
  TopPagesExpandedCard: 'article',
  RankingCard: 'derived',        // per row, from that row's own link: an article, or a Commons file
  GalleryGridCard: 'commons-file',
  GalleryListCard: 'commons-file',
  GlamCard: 'commons-file',      // the sample filmstrip
  StoryCard: 'commons-file',     // a story panel is one image from the article (ISSUE-119)
  CimTopFilesCard: 'commons-file',
};

/**
 * A config carrying only what the card will actually read: the registry defaults minus every field its own `showIf`
 * hides for this config. A field with no `showIf` is shared by every source and stays.
 *
 * Why this exists: a gallery config began life as `{...def.defaults}`, and the gallery's defaults hold values for ALL
 * FOUR of its sources — so an article gallery carried the default `page`, the default `category` and the default file
 * list as dead data. Harmless at render time (only `from`'s field is read) and not harmless to a comparison: it is
 * what made a second pick look like a duplicate (ISSUE-117). Andrew then spotted the leftover in an exported board,
 * 2026-09-24, inside a gallery whose source is an article:
 *   "files": "File:The Earth seen from Apollo 17.jpg\nFile:Airplane vortex edit.jpg\n…"
 *
 * Keys that are not config fields are kept: this trims what it understands and invents no policy about the rest.
 */
export function minimalConfig(def, config) {
  const out = {};
  for (const [key, value] of Object.entries(config || {})) {
    const field = (def?.configFields || []).find((f) => f.key === key);
    if (field && !fieldVisible(field, config, def?.defaults)) continue;
    out[key] = value;
  }
  return out;
}

/** The fields of one definition that consume a kind: `[{ field, kind }]`. */
export function kindFields(def) {
  return (def?.configFields || []).filter((f) => f.kind).map((f) => ({ field: f, kind: f.kind }));
}

/** Every widget type that can be a brush — one that consumes at least one kind of thing. */
export function brushableTypes(registry = {}) {
  return Object.entries(registry)
    .map(([type, def]) => ({ type, def, kinds: [...new Set(kindFields(def).map((k) => k.kind))] }))
    .filter((t) => t.kinds.length > 0)
    .sort((a, b) => String(a.def.name).localeCompare(String(b.def.name)));
}

/** The widget types that accept a given kind — this is what a click on an ARTICLE offers. */
export function typesForKind(kind, registry = {}) {
  return brushableTypes(registry).filter((t) => t.kinds.includes(kind));
}

/**
 * The config a brush click produces: the registry defaults, the item's value in the field that consumes its kind,
 * and the project when the item came from a wiki (so a spawned article card does not download the wrong one).
 * A field that holds a list gets the value as its single line — a spawn places one card for one item.
 *
 * It also points the widget's own SOURCE selector at the picked kind. A multi-source widget (the gallery has four:
 * an article, a Commons gallery page, a category, or a pasted list) declares each kind's field with a `showIf`, so
 * that field says which value of the selector makes it visible — `{ key: 'category', kind: 'commons-category',
 * showIf: { from: 'category' } }` means a category pick also sets `from: 'category'`. Without this, picking a
 * category from the menu spawned an *article* gallery: the value went into a field the card was not reading. Found
 * while fixing the false-twin bug below (2026-09-24).
 */
export function brushConfig(def, kind, value, { project } = {}) {
  const accepting = kindsAccepting(kind);
  const field = kindFields(def).find((k) => accepting.includes(k.kind))?.field;
  if (!field) return null;
  const config = { ...(def?.defaults || {}) };
  for (const [selector, want] of Object.entries(field.showIf || {})) {
    config[selector] = Array.isArray(want) ? want[0] : want;
  }
  if (field.type === 'textarea') config[field.key] = String(value);
  else config[field.key] = value;
  if (project && def?.configFields?.some((f) => f.key === 'project')) config.project = project;
  // Hand over only what the card reads: the other sources' defaults are dead weight, and they were once mistaken for
  // evidence of a duplicate.
  return minimalConfig(def, config);
}

/**
 * Is this click already on the board? Clicking the same row twice should not make a twin (ISSUE-114 step 3).
 *
 * Scoped to the field that consumes the picked **kind**, and to that field alone. The first version compared *every*
 * kind-declaring field, which made a second item of the same kind impossible for any widget that declares more than
 * one — the gallery declares four (`article`, `page`, `category`, `files`). Because `brushConfig` starts from the
 * registry defaults, two *different* articles produced configs that agreed on the three fields neither of them was
 * about (the default page, the default category, the default file list), so the second click was refused with
 * "already on the board". Reported by Andrew, 2026-09-24, with two articles.
 *
 * An empty pick is never a duplicate: a config whose field is blank carries no item to compare.
 *
 * "Already on the board" means the card would show the same thing, so both sides must be READINGS of that field:
 * the field has to be visible for the config in hand (the source selector points at this kind) and for the candidate
 * card's own config. Otherwise a spawned card's untouched defaults — a category field still holding "Featured
 * pictures" while its source is an article — look like a duplicate of a category you are only now picking.
 */
export function alreadyPlaced(def, widgets, widgetType, config, kind) {
  const accepting = kindsAccepting(kind);
  const field = kindFields(def).find((k) => accepting.includes(k.kind))?.field;
  if (!field) return false;                              // this kind cannot be placed by this widget at all
  if (!fieldVisible(field, config, def?.defaults)) return false;
  const value = String(config?.[field.key] ?? '');
  if (!value) return false;
  return (widgets || []).some((w) => w.widgetType === widgetType
    && fieldVisible(field, w.config, def?.defaults)
    && String(w.config?.[field.key] ?? '') === value);
}
