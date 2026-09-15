/**
 * Internet Archive book helpers — IIIF Presentation v3 + Image API v3 + Content Search.
 * Pure: no fetch, no DOM. See tests/ia-book.test.mjs.
 *
 * Everything here was measured against live items on 2026-09-15 (the evidence table is in
 * docs/INTERNET-ARCHIVE.md). Four traps are encoded as functions rather than comments:
 *
 *  1. **The manifest is the authority on page count.** `goodytwoshoes00newyiala` reports
 *     `imagecount: 20` in its item metadata; its manifest lists **16** canvases. Never derive
 *     the page count from metadata.
 *  2. **Canvas ids are 0-based (`$0/canvas`), the labels are 1-based (`"1"`).** Take the human
 *     page number from the *label* and the leaf from the *id*.
 *  3. **Out-of-range leaves are not errors.** `…/iiif/{id}$0/full/…` → HTTP 500 while `$20`/`$21`
 *     on a 16-page book return **HTTP 200 with a ~1.4 KB blank filler image**. So we never probe
 *     for 404, and we never build `$N` image URLs at all: each canvas carries its own
 *     fully-qualified v3 service id, which is what we use.
 *  4. **Search hits are IIIF v1 (`resources`, not `hits`)** and carry the leaf plus the bounding
 *     box of the matched word — `…$2/canvas#xywh=727,190,335,42` — which is both a page jump and
 *     a zoom-to-word crop.
 */
const IIIF_IMAGE_V3 = 'https://iiif.archive.org/image/iiif/3';

/** IIIF v3 labels are language maps: `{none: ['Goody Two-Shoes']}`, `{en: ['…']}`, or a plain string. */
export function labelText(label) {
  if (label === null || label === undefined) return '';
  if (typeof label === 'string') return label.trim();
  if (Array.isArray(label)) return label.map(labelText).filter(Boolean).join(' ');
  if (typeof label === 'object') {
    // Prefer a real language, then `none` (IA's usual bucket), then whatever is there.
    const keys = Object.keys(label);
    const order = [...keys.filter((k) => k && k !== 'none'), ...keys.filter((k) => k === 'none')];
    for (const k of order) {
      const t = labelText(label[k]);
      if (t) return t;
    }
  }
  return '';
}

/**
 * An image from a IIIF Image API service id at a given width.
 * `serviceId` may be the bare service (`…/image/iiif/3/<path>`) or a full image URL — either way
 * we keep the part before the first IIIF parameter segment, so callers cannot double-append.
 */
export function serviceImageUrl(serviceId, width = 400, region = 'full') {
  const id = String(serviceId || '').trim().replace(/\/+$/, '');
  if (!id) return '';
  const base = id.replace(/\/(full|square|\d+,\d+,\d+,\d+)\/.*$/, '');
  const w = Number(width) > 0 ? Math.round(Number(width)) : 400;
  return `${base}/${region}/${w},/0/default.jpg`;
}

/** `#xywh=727,190,335,42` → the region string, or null. */
export function xywhRegion(on) {
  const m = String(on || '').match(/#xywh=(\d+),(\d+),(\d+),(\d+)/);
  if (!m) return null;
  const [x, y, w, h] = m.slice(1).map(Number);
  if (!(w > 0 && h > 0)) return null;
  return `${x},${y},${w},${h}`;
}

/** The leaf number out of a canvas id or a search hit's `on` (`…$2/canvas` → 2). */
export function leafOf(value) {
  const m = String(value || '').match(/\$(\d+)(?:\/canvas)?/);
  return m ? Number(m[1]) : null;
}

function canvasServiceId(canvas) {
  const body = canvas?.items?.[0]?.items?.[0]?.body;
  if (!body) return '';
  const svc = body.service;
  const svcId = Array.isArray(svc) ? svc[0]?.id || svc[0]?.['@id'] : svc?.id || svc?.['@id'];
  // A v3 image body's own `id` is already a IIIF URL; a service id is the cleaner base.
  return String(svcId || body.id || '');
}

/**
 * A IIIF v3 manifest → the page list a viewer needs. `pages[]` is in reading order and each page
 * carries the leaf (for the annotation/search mapping), the human label, its image service and its
 * pixel size. Returns an empty page list for anything that is not a v3 manifest (the caller then
 * shows the plain IIIF/Presentation fallback rather than a broken viewer).
 */
export function pagesFromManifest(manifest) {
  const canvases = Array.isArray(manifest?.items) ? manifest.items : [];
  const pages = canvases.map((c, index) => ({
    index,
    leaf: leafOf(c?.id),
    label: labelText(c?.label) || String(index + 1),
    serviceId: canvasServiceId(c),
    width: Number(c?.width) || 0,
    height: Number(c?.height) || 0,
    annotationPage: Array.isArray(c?.annotations) ? c.annotations[0]?.id || '' : '',
  }));
  return {
    pages,
    title: labelText(manifest?.label),
    summary: labelText(manifest?.summary),
    viewingDirection: manifest?.viewingDirection || 'left-to-right',
    behavior: Array.isArray(manifest?.behavior) ? manifest.behavior : [],
    searchService: searchServiceId(manifest),
    rendering: renderingLinks(manifest),
  };
}

/** The IIIF Content Search service id, if the manifest advertises one. */
export function searchServiceId(manifest) {
  const svc = manifest?.service;
  const list = Array.isArray(svc) ? svc : svc ? [svc] : [];
  for (const s of list) {
    const profile = String(s?.profile || '');
    const type = String(s?.['@type'] || s?.type || '');
    if (/search/i.test(profile) || /SearchService/i.test(type)) return String(s?.['@id'] || s?.id || '');
  }
  return '';
}

/** `rendering` entries → `[{label, href, format}]`, so a card can link DjVu/PDF/EPUB/text. */
export function renderingLinks(manifest) {
  const list = Array.isArray(manifest?.rendering) ? manifest.rendering : [];
  return list
    .map((r) => ({ label: labelText(r?.label) || String(r?.format || ''), href: String(r?.id || ''), format: String(r?.format || '') }))
    .filter((r) => r.href);
}

/**
 * IIIF Content Search → a hit list. Accepts v1 (`resources[]`) and v2 (`hits[]`) shapes, because IA
 * serves v1 (`@type: sc:AnnotationList`) and other IIIF servers serve v2. Each hit keeps the page
 * index it belongs to (matched through the leaf), the matched text and its region on the page.
 */
export function searchHits(json, pages = []) {
  const raw = Array.isArray(json?.resources) ? json.resources : Array.isArray(json?.hits) ? json.hits : [];
  return raw.map((h) => {
    const on = String(h?.on || h?.target || '');
    const leaf = leafOf(on);
    const pageIndex = leaf === null ? -1 : pages.findIndex((p) => p.leaf === leaf);
    const chars = h?.resource?.chars ?? h?.body?.value ?? h?.body?.chars ?? '';
    return {
      pageIndex,
      leaf,
      label: pageIndex >= 0 ? pages[pageIndex].label : (leaf === null ? '' : String(leaf)),
      text: stripOcrHtml(String(chars)).trim(),
      region: xywhRegion(on),
      href: String(h?.['@id'] || h?.id || ''),
    };
  }).filter((h) => h.text || h.pageIndex >= 0);
}

/** OCR text arrives as an HTML-ish fragment (`<span>…</span>`), and as v1 `chars` or v2 `value`. */
export function stripOcrHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    // Dropping a tag leaves a space behind: "<em>I</em>." became "I ." — tighten before punctuation.
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

/** Per-page OCR annotations (`…/annotations/{id}/{id}_djvu.xml/{page}.json`) → one text block. */
export function pageText(json) {
  const items = Array.isArray(json?.items) ? json.items : Array.isArray(json?.resources) ? json.resources : [];
  return items
    .map((a) => stripOcrHtml(a?.body?.value ?? a?.resource?.chars ?? ''))
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

/** Derivative links offered by an item's metadata (`files[]`), for the "open the real thing" row. */
export function bookLinks(meta, identifier) {
  const files = Array.isArray(meta?.files) ? meta.files : [];
  const name = (re) => files.find((f) => re.test(String(f?.name || '')))?.['name'];
  const url = (n) => (n ? `https://archive.org/download/${encodeURIComponent(identifier)}/${n.split('/').map(encodeURIComponent).join('/')}` : '');
  const pdf = name(/_bw\.pdf$/i) || name(/\.pdf$/i);
  const epub = name(/\.epub$/i);
  const text = name(/_djvu\.txt$/i);
  const djvu = name(/\.djvu$/i);
  return [
    { label: 'PDF', href: url(pdf) },
    { label: 'EPUB', href: url(epub) },
    { label: 'OCR text', href: url(text) },
    { label: 'DjVu', href: url(djvu) },
  ].filter((l) => l.href);
}

/** The IIIF presentation manifest URL for an identifier. */
export function manifestUrl(identifier) {
  return `https://iiif.archive.org/iiif/${encodeURIComponent(String(identifier || '').trim())}/manifest.json`;
}

export { IIIF_IMAGE_V3 };
