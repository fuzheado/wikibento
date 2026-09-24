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
  const field = kindFields(def).find((k) => k.kind === kind)?.field;
  if (!field) return null;
  const config = { ...(def?.defaults || {}) };
  for (const [selector, want] of Object.entries(field.showIf || {})) {
    config[selector] = Array.isArray(want) ? want[0] : want;
  }
  if (field.type === 'textarea') config[field.key] = String(value);
  else config[field.key] = value;
  if (project && def?.configFields?.some((f) => f.key === 'project')) config.project = project;
  return config;
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
  const field = kindFields(def).find((k) => k.kind === kind)?.field;
  if (!field) return false;                              // this kind cannot be placed by this widget at all
  if (!fieldVisible(field, config, def?.defaults)) return false;
  const value = String(config?.[field.key] ?? '');
  if (!value) return false;
  return (widgets || []).some((w) => w.widgetType === widgetType
    && fieldVisible(field, w.config, def?.defaults)
    && String(w.config?.[field.key] ?? '') === value);
}
