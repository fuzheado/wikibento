/**
 * The paged-viewer maths — turning a page source into the pictures a reader shows.
 *
 * Pure: no fetch, no DOM, no React. This module is what `iaBook` (IIIF, archive.org) and the Commons
 * document reader can share, so that facing pages and the right-to-left case are implemented **once** for
 * both (see docs/DOCUMENT-VIEWER.md).
 *
 * A **page source** is the contract, and it is deliberately tiny:
 *
 *   { pages: [{ index, label, image, annotationPage? }],   // image is a template, not a URL
 *     direction: 'left-to-right' | 'right-to-left',
 *     caps: { region, search, text, facing } }
 *
 * `image` is a template with `{w}` and optional `{region}` placeholders, so no source needs to know how the
 * viewer decides its width, and the viewer needs no branch for which archive it is talking to:
 *
 *   IIIF (archive.org):  https://iiif.archive.org/image/iiif/3/…/{region}/{w},/0/default.jpg
 *   Commons documents:   https://thumb.wikimedia.org/…/page{page}-{w}px-File.pdf.jpg   (no {region})
 *
 * Measured facts that shape the spread rules (docs/INTERNET-ARCHIVE.md, docs/DOCUMENT-VIEWER.md):
 *   · a scanned item's manifest carries `behavior: ["paged"]`, so spreads are meaningful;
 *   · `viewingDirection: "right-to-left"` is common — Arabic, Hebrew and Yiddish scans — and in a spread
 *     the LATER leaf belongs on the LEFT. Language is not a proxy for it;
 *   · IA publishes no chapter `structures`, so pairing cannot follow chapters: it is positional only.
 */

/** A page's image URL at a given width, and (where the source supports it) a region crop. */
export function pageImageUrl(page, width, region) {
  const template = String((page && page.image) || '');
  if (!template) return '';
  const w = Number(width) > 0 ? Math.round(Number(width)) : 700;
  return template.replace('{w}', String(w)).replace('{region}', region || 'full');
}

/** True when this source can crop a region out of a page (IIIF can; Wikimedia page thumbs cannot). */
export function canCrop(page) {
  return /{region}/.test(String((page && page.image) || ''));
}

/**
 * How a book is grouped into spreads.
 *
 * `offset` exists because whether leaf 0 is a cover or a text page is a property of the scan, not of the
 * API: offset 0 leaves the first leaf alone (the common case — a cover, then facing pages), offset 1 pairs
 * it with leaf 1 for scans that start on a text page.
 *
 *   16 pages, offset 0 → [0] [1,2] [3,4] … [15]
 *   16 pages, offset 1 → [0,1] [2,3] … [14,15]
 */
export function spreadPairs(pageCount, offset = 0) {
  const n = Math.max(0, Number(pageCount) || 0);
  const pairs = [];
  if (!n) return pairs;
  let i = 0;
  if (offset !== 1) { pairs.push([0]); i = 1; }
  for (; i < n; i += 2) pairs.push(i + 1 < n ? [i, i + 1] : [i]);
  return pairs;
}

/**
 * The order the pages of one spread are *displayed* in. Everything else in this module works in reading
 * order; this is the single place where right-to-left changes a picture rather than a label.
 */
export function spreadOrder(pair, direction) {
  const p = Array.isArray(pair) ? pair : [];
  return direction === 'right-to-left' ? [...p].reverse() : [...p];
}

/** Which spread contains a page — used when a search hit or a thumbnail jumps somewhere. */
export function spreadIndexOf(pageIndex, pairs) {
  const i = Number(pageIndex);
  if (!Array.isArray(pairs) || Number.isNaN(i)) return 0;
  const found = pairs.findIndex((p) => p.includes(i));
  return found < 0 ? 0 : found;
}

/**
 * The counter: "page 7" for a single leaf, "pages 4–5" for a spread. Always in reading order, never in
 * display order — a right-to-left book still says "pages 4–5", it simply shows 5 on the left.
 */
export function spreadLabel(labels, pair) {
  const raw = Array.isArray(pair) ? pair : [];
  if (!raw.length) return '';
  // Sorted, so handing it a right-to-left DISPLAY order can never produce "pages 5–4".
  const p = [...raw].sort((a, b) => a - b);
  const dash = '\u2013';
  if (p.length === 1) return `page ${labels[p[0]] ?? p[0] + 1}`;
  const first = labels[p[0]] ?? p[0] + 1;
  const last = labels[p[p.length - 1]] ?? p[p.length - 1] + 1;
  return `pages ${first}${dash}${last}`;
}

/**
 * Whether two pages fit side by side in this card. A spread halves the space per leaf, so below a
 * threshold it is worse than one page at a time — and the threshold is a viewport property, like the
 * timeline's label slots, not a data property.
 */
export const SPREAD_MIN_WIDTH = 820;

export function spreadsFit(cardWidth) {
  return Number(cardWidth) >= SPREAD_MIN_WIDTH;
}

/** The base zoom ladder. A source may cap it (see `zoomLadder`). */
export const PV_LADDER = [400, 700, 1000, 1400];

/**
 * The ladder for one source: the base steps that fit its ceiling, plus the ceiling itself.
 *
 * A Commons document render tops out at **960 px** — measured 2026-09-15: a request for 1200 and one for
 * 2000 both came back as 960. Without this cap the `+` button would climb to a step the server cannot
 * serve, and its label would be a lie about the pixels on screen.
 */
export function zoomLadder(maxWidth, base = PV_LADDER) {
  const cap = Number(maxWidth) > 0 ? Math.round(Number(maxWidth)) : Infinity;
  const kept = base.filter((w) => w <= cap);
  if (!kept.length) return [Math.min(cap, base[0])];
  if (Number.isFinite(cap) && !kept.includes(cap)) kept.push(cap);
  return kept;
}

/**
 * A typed page number (1-based, as a reader types it) → a valid 0-based index.
 * An out-of-range or unparseable entry clamps to the ends rather than throwing or landing nowhere —
 * the same rule that keeps navigation off the clamp trap (a page past the end is served as the last page,
 * not as an error).
 */
export function clampPage(value, count) {
  const n = Math.max(0, Number(count) || 0);
  if (!n) return 0;
  const v = Math.round(Number(value));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(n - 1, v - 1));
}

/** The zoom ladder, per leaf: in a spread each leaf gets about half the card, so the ladder halves too. */
export function leafWidth(ladderWidth, inSpread) {
  const w = Number(ladderWidth) > 0 ? Number(ladderWidth) : 700;
  return inSpread ? Math.max(240, Math.round(w / 2)) : w;
}

/**
 * A window of page indices for the thumbnail strip, centred on `pageIndex`. Rendering every thumbnail of a
 * 304-page book would be 304 image requests; a window keeps it to a handful while still showing where you
 * are. Returns `{ start, indices }`.
 */
export function stripWindow(pageCount, pageIndex, size = 15) {
  const n = Math.max(0, Number(pageCount) || 0);
  const span = Math.max(1, Math.min(Number(size) || 15, n));
  const start = Math.max(0, Math.min(n - span, Number(pageIndex) - Math.floor(span / 2)));
  const indices = [];
  for (let i = start; i < start + span && i < n; i += 1) indices.push(i);
  return { start, indices };
}
