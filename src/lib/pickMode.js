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
/** Kinds a field may declare — the ids `paramSources.js` can validate. */
export const KIND_IDS = ['article', 'page', 'commons-file', 'commons-category', 'commons-gallery', 'wikidata-item', 'cim-category'];

export const KIND_LABELS = {
  article: 'article', page: 'wiki page', 'commons-file': 'Commons file', 'commons-category': 'category',
  'commons-gallery': 'gallery page', 'wikidata-item': 'Wikidata item', 'cim-category': 'CIM category',
};

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
 */
export function brushConfig(def, kind, value, { project } = {}) {
  const field = kindFields(def).find((k) => k.kind === kind)?.field;
  if (!field) return null;
  const config = { ...(def?.defaults || {}) };
  if (field.type === 'textarea') config[field.key] = String(value);
  else config[field.key] = value;
  if (project && def?.configFields?.some((f) => f.key === 'project')) config.project = project;
  return config;
}

/** Is this click already on the board? Clicking the same row twice should not make a twin (ISSUE-114 step 3). */
export function alreadyPlaced(def, widgets, widgetType, config) {
  const kinds = kindFields(def);
  return (widgets || []).some((w) => {
    if (w.widgetType !== widgetType) return false;
    return kinds.some(({ field }) => String(w.config?.[field.key] ?? '') === String(config?.[field.key] ?? ''));
  });
}
