/**
 * Commons document source tests (ISSUE-82, 2026-09-15).
 *
 * Fixtures are trimmed real `imageinfo` responses, measured 2026-09-15:
 *   File:The Three Hostages (1924).pdf     329 pages, 34.2 MB, mediatype OFFICE, "From internet archive"
 *   File:Mozart Sonate (manuscript).djvu    96 pages, 17.6 MB, mediatype OFFICE, image/vnd.djvu
 *   File:PDF metadata.pdf                     2 pages, 0.2 MB  (the fast E2E fixture)
 *
 * The point of most of these is the four traps in docs/DOCUMENT-VIEWER.md: the 960 px ceiling, a
 * `thumbwidth` that describes nothing, hand-built URLs that 400, and a page past the end being CLAMPED
 * rather than refused. A wrong page URL here does not throw — it shows a broken image in a reader.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_MAX_WIDTH, DOCUMENT_WIDTHS, DOCUMENT_STRIP_WIDTH,
  normalizeCommonsFile, isDocument, isDocumentType, derivePageTemplate, documentPageSource,
} from '../src/lib/documentSource.js';
import { zoomLadder, clampPage, PV_LADDER, sourceWidths, stripThumbWidth } from '../src/lib/pagedViewer.js';

const THUMB = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e2/The_Three_Hostages_%281924%29.pdf/page1-960px-The_Three_Hostages_%281924%29.pdf.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo';
const INFO = {
  pagecount: 329,
  mime: 'application/pdf',
  mediatype: 'OFFICE',
  size: 34196066,
  width: 1275,
  height: 1950,
  url: 'https://upload.wikimedia.org/wikipedia/commons/e/e2/The_Three_Hostages_%281924%29.pdf',
  descriptionurl: 'https://commons.wikimedia.org/wiki/File:The_Three_Hostages_(1924).pdf',
  thumburl: THUMB,
  extmetadata: {
    ImageDescription: { value: '<p>From <b>internet archive</b></p>' },
    Artist: { value: '<a href="#">John Buchan</a>' },
    LicenseShortName: { value: 'Public domain' },
  },
};
const DJVU = { ...INFO, pagecount: 96, mime: 'image/vnd.djvu', size: 17558219, thumburl: THUMB.replace('_Three_Hostages_%281924%29.pdf', 'Mozart_Sonate_%28manuscript%29.djvu') };

// ── the file name the user typed ────────────────────────────────────────────────
test('normalizeCommonsFile: bare names, File: names and Commons URLs all land on one title', () => {
  assert.equal(normalizeCommonsFile('Name.djvu'), 'File:Name.djvu');
  assert.equal(normalizeCommonsFile('File:Name.djvu'), 'File:Name.djvu');
  assert.equal(normalizeCommonsFile('file:Name.djvu'), 'File:Name.djvu');
  assert.equal(normalizeCommonsFile('  Name.djvu  '), 'File:Name.djvu');
  assert.equal(normalizeCommonsFile('https://commons.wikimedia.org/wiki/File:The_Three_Hostages_(1924).pdf'), 'File:The Three Hostages (1924).pdf');
  assert.equal(normalizeCommonsFile('https://commons.wikimedia.org/wiki/Special:Redirect/file/Name.djvu'), 'File:Name.djvu');
  assert.equal(normalizeCommonsFile('https://commons.wikimedia.org/w/index.php?title=File:Name.djvu&action=view'), 'File:Name.djvu');
  assert.equal(normalizeCommonsFile(''), '');
  assert.equal(normalizeCommonsFile('   '), '');
  assert.equal(normalizeCommonsFile('https://example.org/not/a/wiki/page'), '');
});

test('isDocumentType vs isDocument: a PDF with no page count is a PDF, not a JPEG', () => {
  assert.equal(isDocumentType({ mediatype: 'OFFICE', mime: 'application/pdf' }), true);
  assert.equal(isDocument({ mediatype: 'OFFICE', mime: 'application/pdf' }), false, 'no pages to page through');
  assert.equal(isDocumentType({ mediatype: 'BITMAP', mime: 'image/jpeg' }), false);
});

test('isDocument: PDF, DjVu and TIFF are documents; a JPEG is not', () => {
  assert.equal(isDocument({ pagecount: 329, mediatype: 'OFFICE', mime: 'application/pdf' }), true);
  assert.equal(isDocument({ pagecount: 96, mediatype: 'OFFICE', mime: 'image/vnd.djvu' }), true);
  assert.equal(isDocument({ pagecount: 4, mediatype: 'OFFICE', mime: 'image/tiff' }), true);
  assert.equal(isDocument({ mediatype: 'BITMAP', mime: 'image/jpeg' }), false);
  assert.equal(isDocument({ pagecount: 0, mediatype: 'OFFICE', mime: 'application/pdf' }), false);
  assert.equal(isDocument(null), false);
});

// ── the template: derived from the API's URL, never hand-built ─────────────────
test('derivePageTemplate: rewrites the page token and the width token, and nothing else', () => {
  const t = derivePageTemplate(THUMB, 1);
  assert.match(t, /\/page1-\{w\}px-The_Three_Hostages_%281924%29\.pdf\.jpg$/);
  assert.ok(!t.includes('?'), 'the utm junk is stripped');
  assert.match(t, /^https:\/\/thumb\.wikimedia\.org\/wikipedia\/commons\/thumb\/e\/e2\//, 'host and hash dirs are the API\'s');
  assert.match(t, /%281924%29/, 'percent-encoding survives untouched');
  // another page
  assert.match(derivePageTemplate(THUMB, 188), /\/page188-\{w\}px-/);
  // whatever width the API happened to use is replaced too (it is bucketed, not ours)
  assert.match(derivePageTemplate('https://thumb.wikimedia.org/a/page1-330px-F.djvu.jpg', 2), /page2-\{w\}px-F\.djvu\.jpg$/);
  // a `lossy-` prefix is kept — it is part of the URL the API gave us
  assert.match(derivePageTemplate('https://thumb.wikimedia.org/a/lossy-page1-960px-F.pdf.jpg', 3), /lossy-page3-\{w\}px-/);
});

test('derivePageTemplate: an unexpected shape yields NOTHING, so the card can explain itself', () => {
  for (const bad of ['', null, undefined, 'https://example.org/plain.jpg', 'https://thumb.wikimedia.org/a/no-page-token.jpg']) {
    assert.equal(derivePageTemplate(bad, 2), '', `${bad} should not produce a template`);
  }
});

// ── the source ──────────────────────────────────────────────────────────────────
test('documentPageSource: one call becomes the whole page list, numbered', () => {
  const src = documentPageSource(INFO, 'File:The Three Hostages (1924).pdf');
  assert.equal(src.pages.length, 329);
  assert.equal(src.pageCount, 329);
  assert.equal(src.pages[0].label, '1');
  assert.equal(src.pages[0].index, 0);
  assert.equal(src.pages[328].label, '329');
  assert.match(src.pages[328].image, /\/page329-\{w\}px-/);
  assert.equal(src.notice, '');
});

test('the served width set is a LIST, not a range — measured on a PDF and a DjVu', () => {
  // 120/250/330/500/960/1280 are served; 70/150/200/320/400/640/700/800/1024/1200 return a 400 HTML page,
  // which Chrome blocks as ERR_BLOCKED_BY_ORB — a blank page with no visible reason.
  assert.deepEqual(DOCUMENT_WIDTHS, [330, 500, 960]);
  assert.equal(DOCUMENT_STRIP_WIDTH, 120, 'the viewer default of 70 is NOT served for documents');
  assert.ok(DOCUMENT_WIDTHS.every((w) => w <= DOCUMENT_MAX_WIDTH));
  for (const bad of [400, 640, 700, 800, 1024]) {
    assert.ok(!DOCUMENT_WIDTHS.includes(bad), `${bad} is not served for documents and must not be offered`);
  }
});

// 2026-09-18: these expected [400, 700, 960] — widths that are not pre-rendered. A page thumbnail is built by
// substituting into a `{w}px-` template and has no API to rewrite it, so 400 and 700 answer HTTP 400 (measured:
// 330/500/960 → 200, 400/700/1000/1400 → 400). The pinned test suite was locking in the broken steps; the ladder
// is now the pre-rendered one (src/lib/thumbWidths.js).
test('sourceWidths: a source that states its widths is believed; one that caps a ladder is capped', () => {
  assert.deepEqual(sourceWidths({ widths: [960, 330, 500] }), [330, 500, 960], 'sorted, and no duplicates');
  assert.deepEqual(sourceWidths({ widths: [500, 500, 330] }), [330, 500]);
  assert.deepEqual(sourceWidths({ maxWidth: 960 }), [330, 500, 960], 'a IIIF source caps the base ladder');
  assert.deepEqual(sourceWidths({}), PV_LADDER, 'no caps at all → the base ladder');
  assert.deepEqual(sourceWidths({ widths: [] }), PV_LADDER, 'an empty list is not a statement');
});

test('stripThumbWidth: 70 by default, 120 where the server needs it', () => {
  assert.equal(stripThumbWidth({}), 70);
  assert.equal(stripThumbWidth({ stripWidth: DOCUMENT_STRIP_WIDTH }), 120);
  assert.equal(stripThumbWidth(null), 70);
  assert.equal(stripThumbWidth({ stripWidth: 0 }), 70);
});

test('documentPageSource: caps tell the truth about what this source can do', () => {
  const caps = documentPageSource(INFO, 'File:X.pdf').caps;
  assert.equal(caps.region, false, 'Wikimedia page renders have no region API');
  assert.equal(caps.search, false, 'no text layer unless Wikisource proofread it');
  assert.equal(caps.text, false);
  assert.equal(caps.facing, true);
  assert.equal(caps.maxWidth, DOCUMENT_MAX_WIDTH);
  assert.deepEqual(caps.widths, DOCUMENT_WIDTHS);
  assert.equal(caps.stripWidth, DOCUMENT_STRIP_WIDTH);
});

test('documentPageSource: header facts, credit and the two links out', () => {
  const src = documentPageSource(INFO, 'File:The Three Hostages (1924).pdf');
  assert.equal(src.title, 'The Three Hostages (1924)');
  assert.equal(src.file, 'File:The Three Hostages (1924).pdf', 'the canonical title, for a Wikisource Page: title');
  assert.equal(src.subtitle, '329 pages · PDF · 34.2 MB · 1275×1950 page');
  assert.equal(src.description, 'From internet archive');
  assert.equal(src.credits, 'John Buchan · Public domain');
  assert.equal(src.href, INFO.descriptionurl);
  assert.equal(src.pageUrl, INFO.descriptionurl);
  assert.deepEqual(src.links.map((l) => l.label), ['File page', 'Open the original']);
  assert.equal(src.links[1].href, INFO.url);
});

test('documentPageSource: a DjVu is the same source, labelled DjVu', () => {
  const src = documentPageSource(DJVU, 'File:Mozart Sonate (manuscript).djvu');
  assert.equal(src.pages.length, 96);
  assert.match(src.subtitle, /^96 pages · DjVu · 17\.6 MB/);
});

test('documentPageSource: a non-document is refused politely, with its links', () => {
  const src = documentPageSource({ mime: 'image/jpeg', mediatype: 'BITMAP', descriptionurl: 'https://commons.wikimedia.org/wiki/File:X.jpg' }, 'File:X.jpg');
  assert.equal(src.pages.length, 0);
  assert.match(src.notice, /not a PDF or DjVu document/);
  assert.equal(src.links[0].href, 'https://commons.wikimedia.org/wiki/File:X.jpg', 'the way out is still offered');
});

test('documentPageSource: a URL we cannot template produces a notice, NOT broken pages', () => {
  const src = documentPageSource({ ...INFO, thumburl: 'https://example.org/nothing-like-a-thumb.jpg' }, 'File:X.pdf');
  assert.equal(src.pages.length, 0, 'no pages at all — an empty grid of broken images is worse than an explanation');
  assert.equal(src.pageCount, 0);
  assert.match(src.notice, /did not return a renderable page URL/);
});

test('documentPageSource: a missing page count and an empty file name each say so', () => {
  assert.match(documentPageSource({ mime: 'application/pdf', mediatype: 'OFFICE' }, 'File:X.pdf').notice, /no page count/);
  assert.match(documentPageSource(INFO, '').notice, /Enter a Commons file name/);
});

// ── the viewer maths the document source depends on ────────────────────────────
test('zoomLadder: a source with no ceiling keeps the base ladder', () => {
  assert.deepEqual(zoomLadder(undefined), PV_LADDER);
  assert.deepEqual(zoomLadder(0), PV_LADDER);
});

test('zoomLadder: a 960 ceiling stops the ladder there, and says so', () => {
  assert.deepEqual(zoomLadder(DOCUMENT_MAX_WIDTH), [330, 500, 960]);
  assert.ok(!zoomLadder(DOCUMENT_MAX_WIDTH).includes(1400), 'the step the server cannot serve is gone');
  assert.deepEqual(zoomLadder(1000), [330, 500, 960], 'a ceiling already on the ladder is not duplicated');
  // 320 is not served (see the list above), so a 320px source is rendered at the largest step that exists and
  assert.deepEqual(zoomLadder(320), [250], 'a ceiling below the first step snaps DOWN to a width that exists');
  assert.deepEqual(zoomLadder(1100), [330, 500, 960]);
});

test('clampPage: a typed page number becomes a valid index, out-of-range input clamps', () => {
  assert.equal(clampPage(1, 16), 0);
  assert.equal(clampPage(16, 16), 15);
  assert.equal(clampPage('5', 16), 4);
  assert.equal(clampPage(0, 16), 0, 'below the start clamps to the first page');
  assert.equal(clampPage(999, 16), 15, 'past the end clamps to the last page — the same rule as the server');
  assert.equal(clampPage(-3, 16), 0);
  assert.equal(clampPage('abc', 16), 0);
  assert.equal(clampPage('', 16), 0);
  assert.equal(clampPage(5, 0), 0, 'no pages at all');
  assert.equal(clampPage(2.4, 16), 1, 'a fractional entry rounds');
});
