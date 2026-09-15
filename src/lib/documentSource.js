/**
 * A Commons document (PDF or DjVu) as a page source for the shared reader — ISSUE-82.
 *
 * Pure: no fetch, no DOM. One `imageinfo` response in, the `PagedViewer` page-source contract out
 * (see src/lib/pagedViewer.js).
 *
 * Why one API call is enough for a 329-page book: `imageinfo` returns `pagecount` and a page-1
 * `thumburl`, and that URL is a template once the page token and the width token are rewritten —
 * measured 2026-09-15 on `File:The Three Hostages (1924).pdf` (329 pages) and
 * `File:Mozart Sonate (manuscript).djvu` (96 pages). PDF and DjVu behave identically, so one code path
 * serves both.
 *
 * The traps this module exists to absorb (docs/DOCUMENT-VIEWER.md), all measured:
 *
 *  1. **Document renders have a 960 px ceiling.** Asked 320 → `330px`, 700 → `960px`, 960 → 960,
 *     1200 → **960**, 2000 → **960**. So `DOCUMENT_MAX_WIDTH` is advertised on the source and the reader's
 *     zoom ladder stops there — otherwise `+` would lie above 700 px.
 *  2. **The API's `thumbwidth` describes neither the URL nor the file** (it said 1200 while the URL and
 *     the delivered image were 960). Layout must use the image's own dimensions.
 *  3. **Hand-built thumb URLs 400.** A 50 MB report refused every URL we constructed while the API's own
 *     `thumburl` served it — so the template is derived FROM the API's URL, keeping its host, its hash
 *     directories and its percent-encoding untouched. If the shape is not what we expect we produce no
 *     pages at all and let the card show its notice, rather than a grid of broken images.
 *  4. **An out-of-range page is clamped, not refused** (page 189 of 188 returned page 188, byte for byte) —
 *     hence the viewer clamps navigation, and there is no probing for a 404 anywhere.
 *  5. **There is no region API** for Wikimedia page renders, so `caps.region` is false and the reader must
 *     not offer the word-box crop it offers for IIIF pages. That is what the capability flags are for.
 */

/** Document page renders top out here (measured: 1200 and 2000 both come back as 960). */
export const DOCUMENT_MAX_WIDTH = 960;

/**
 * The widths a document page render is actually SERVED at — and this is not a range.
 *
 * Measured 2026-09-15 on `File:PDF metadata.pdf` and `File:Mozart Sonate (manuscript).djvu` (identical
 * results, so it is a property of document rendering, not of one file):
 *
 *   served     120 · 250 · 330 · 500 · 960 · 1280
 *   **400**     70 · 150 · 200 · 320 · 400 · 640 · 700 · 800 · 1024 · 1200
 *
 * A 400 here is not a harmless miss: it is an HTML error page, which Chrome then refuses to hand to an
 * `<img>` at all (`net::ERR_BLOCKED_BY_ORB`) — so a width we invent shows as a blank page with no visible
 * reason. That is why the ladder below is a list of widths that exist rather than a maximum, and why
 * `iiurlwidth` (which rewrites to a legal width) is how the first URL is obtained.
 *
 * The set is NOT MediaWiki's image-thumbnail set: 150, 200, 400, 640, 800 and 1024 all fail for documents
 * even though they are standard image widths.
 */
export const DOCUMENT_WIDTHS = [330, 500, 960];

/** Thumbnail-strip width for a document (120 is in the served set; the viewer's 70 is not). */
export const DOCUMENT_STRIP_WIDTH = 120;

/** `Description`/`Artist` from extmetadata arrive as HTML fragments. */
function plain(value, limit = 280) {
  const text = String(value === null || value === undefined ? '' : value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/**
 * Whatever the user typed → a canonical `File:` title, or '' if it cannot be one.
 * Accepts `Name.pdf`, `File:Name.pdf`, or a Commons file URL (which is what the address bar gives you).
 */
export function normalizeCommonsFile(input) {
  let value = String(input === null || input === undefined ? '' : input).trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) {
    // …/wiki/File:Name.pdf, …/wiki/Special:Redirect/file/Name.pdf, or ?title=File:Name.pdf. The /wiki/ and
    // ?title= forms are only file URLs when they name a File:/Image: page — otherwise any wiki link at all
    // (…/wiki/Main_Page) would be read as a file name.
    const special = value.match(/\/Special:Redirect\/file\/([^?#]+)/);
    const wiki = value.match(/\/wiki\/([^?#]+)/);
    const query = value.match(/[?&]title=([^&#]+)/);
    let raw = '';
    if (special) raw = special[1];
    else if (wiki && /^(file|image)\s*:/i.test(decodeURIComponent(wiki[1]))) raw = wiki[1];
    else if (query && /^(file|image)\s*:/i.test(decodeURIComponent(query[1]))) raw = query[1];
    if (!raw) return '';
    value = decodeURIComponent(raw).replace(/_/g, ' ');
  }
  value = value.replace(/\s+/g, ' ').trim();
  value = value.replace(/^(file|image)\s*:/i, '');
  if (!value) return '';
  return `File:${value}`;
}

/** Does this `imageinfo` describe a document *type* (whatever its page count)? */
export function isDocumentType(imageinfo) {
  if (!imageinfo) return false;
  const media = String(imageinfo.mediatype || '').toUpperCase();
  return media === 'OFFICE' || media === 'TEXT' || /pdf|djvu|tiff/i.test(String(imageinfo.mime || ''));
}

/** Is this a document we can actually page through (right type AND pages to show)? */
export function isDocument(imageinfo) {
  return isDocumentType(imageinfo) && (Number((imageinfo || {}).pagecount) || 0) > 0;
}

/**
 * The API's page-1 thumbnail URL → a template for page `n` with a `{w}` width placeholder.
 * Everything except the page token and the width token is the API's own string, so the host, the hash
 * directories and the percent-encoding stay correct. Returns '' when the URL is not the shape we expect.
 */
export function derivePageTemplate(thumburl, pageNumber) {
  const clean = String(thumburl || '').split('?')[0].split('#')[0];
  if (!clean) return '';
  const n = Math.max(1, Math.round(Number(pageNumber) || 1));
  const template = clean.replace(/page\d+-\d+px-/, `page${n}-{w}px-`);
  return template === clean ? '' : template;
}

/**
 * An `imageinfo` response → the shared page-source contract, or a source with no pages and a `notice`
 * that says why (the reader renders notices with the links, which is the honest degradation).
 */
export function documentPageSource(imageinfo, title, project = 'commons.wikimedia') {
  const file = normalizeCommonsFile(title) || String(title || '').trim();
  const wiki = String(project || 'commons.wikimedia').trim() || 'commons.wikimedia';
  const info = imageinfo || {};
  const pageCount = Number(info.pagecount) || 0;
  const mime = String(info.mime || '');
  const format = /djvu/i.test(mime) ? 'DjVu' : /pdf/i.test(mime) ? 'PDF' : /tiff/i.test(mime) ? 'TIFF' : (mime || 'document');
  const sizeMB = (Number(info.size) || 0) / 1e6;
  const ext = info.extmetadata || {};
  const credits = [plain(ext.Artist?.value, 80), plain(ext.LicenseShortName?.value, 60)].filter(Boolean).join(' · ');
  const description = plain(ext.ImageDescription?.value, 280);

  const links = [
    { label: 'File page', href: String(info.descriptionurl || '') },
    { label: 'Open the original', href: String(info.url || '') },
  ].filter((l) => l.href);

  const base = {
    // The canonical `File:` title (needed to address a Wikisource `Page:` — see wikisourceText.js) and the
    // display title (no namespace, no extension) are two different things.
    file,
    title: file.replace(/^File:\s*/i, '').replace(/\.[A-Za-z0-9]+$/, '').replace(/_/g, ' '),
    href: String(info.descriptionurl || ''),
    pageUrl: String(info.descriptionurl || ''),
    links,
    description,
    credits,
    project: wiki,
    direction: 'left-to-right',   // a Commons file carries no reading direction; paged left-to-right
    caps: {
      region: false,               // no region API on Wikimedia page renders (trap 5)
      search: false,               // no text layer unless Wikisource proofread it — v1.1
      text: false,
      facing: true,                // a scanned book's leaves pair up
      maxWidth: DOCUMENT_MAX_WIDTH,
      widths: DOCUMENT_WIDTHS,     // only widths the server actually serves (see above)
      stripWidth: DOCUMENT_STRIP_WIDTH,
    },
    spread: 'auto',
  };

  if (!file) {
    return { ...base, pages: [], pageCount: 0, notice: 'Enter a Commons file name, e.g. File:The Three Hostages (1924).pdf' };
  }
  if (!pageCount) {
    return {
      ...base,
      pages: [],
      pageCount: 0,
      // The type is the useful distinction here: a PDF that reports no pages is a *different* problem from
      // a JPEG, and saying "not a PDF or DjVu" about a PDF is simply wrong.
      notice: isDocumentType(info)
        ? 'This file reported no page count.'
        : `This is not a PDF or DjVu document (${mime || 'unknown type'}) — open the file page to view it.`,
    };
  }

  const pages = Array.from({ length: pageCount }, (_, i) => ({
    index: i,
    label: String(i + 1),          // `imageinfo` publishes no page labels, so pages are numbered
    image: derivePageTemplate(info.thumburl, i + 1),
  }));

  if (!pages[0].image) {
    return {
      ...base,
      pages: [],
      pageCount: 0,
      notice: `Wikimedia did not return a renderable page URL for this file — open the file page to view it (${format}).`,
    };
  }

  return {
    ...base,
    pages,
    pageCount,
    subtitle: [
      `${pageCount} page${pageCount === 1 ? '' : 's'}`,
      format,
      sizeMB >= 1 ? `${sizeMB >= 100 ? Math.round(sizeMB) : sizeMB.toFixed(1)} MB` : '',
      info.width && info.height ? `${info.width}×${info.height} page` : '',
    ].filter(Boolean).join(' · '),
    notice: '',
  };
}
