/**
 * A gallery has four sources, and this is the only place that decides which one a widget means.
 *
 * The rename (2026-09-18): `commonsGallery`, `gallery` and `fileGallery` became one widget, because they shared a
 * renderer and a row shape and differed by exactly one field — the source. The old type ids still work: `widgetDef()`
 * resolves them to the merged definition, and the source is inferred here, from the fields the old boards carry.
 *
 * Why inference rather than a migration pass: a board is not always ours to rewrite. Saved boards, shared `#/z/`
 * links and borrowed boards all arrive with an old shape, and rewriting them on load means every reader of a widget
 * must agree about when that happened. Inferring the source from the config is stateless, so it cannot be missed.
 */

export const GALLERY_TYPE = 'gallery';
export const GALLERY_SOURCES = ['article', 'page', 'list', 'category'];

export const SOURCE_LABELS = {
  article: 'An article',
  page: 'A Commons gallery page',
  category: 'A wiki category',
  list: 'A list of files',
};

/** Old type id → the source it meant, when the config does not say otherwise. */
export const LEGACY_GALLERY_IDS = { commonsGallery: 'page', fileGallery: 'list' };

/**
 * Which source does this config mean?
 *
 * An explicit `from` wins, because that is what the merged widget writes. Failing that, the field that is present
 * decides — which is exactly how the four old widgets were distinguishable from each other. `files` is checked
 * before `category` so a board that carries both (possible in hand-written JSON) keeps behaving like the pasted
 * list it started as.
 */
export function inferGallerySource(config = {}, typeId) {
  const from = config && config.from;
  if (GALLERY_SOURCES.includes(from)) return from;
  if (config && config.page) return 'page';
  if (config && (config.files || config.order) && !config.category) return 'list';
  if (config && config.category) return 'category';
  if (config && config.article) return 'article';
  return LEGACY_GALLERY_IDS[typeId] || 'article';
}

/** Is this the id of a gallery that used to be its own widget? */
export function isLegacyGalleryId(typeId) {
  return Object.prototype.hasOwnProperty.call(LEGACY_GALLERY_IDS, typeId);
}

/**
 * The project a source defaults to. Held here rather than in the registry's `defaults`, because a static default
 * cannot depend on the source — and one default (`en.wikipedia`) applied to a Commons gallery page is not a cosmetic
 * bug, it is a page that does not exist. `wiki` is the name the category source shipped with for a day; `project` is
 * the name the gallery family has always used, so `project` wins and `wiki` is still read.
 */
export function galleryProject(config = {}, source = 'article') {
  const explicit = config.project || config.wiki;
  if (explicit) return explicit;
  return source === 'article' ? 'en.wikipedia' : 'commons.wikimedia';
}
