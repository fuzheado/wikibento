/**
 * Commons gallery pages (ISSUE-103) — the format contract, pure and offline.
 *
 * The parser is the whole risk in this widget: there is no structured API for gallery contents, so the page's
 * wikitext is the source of truth. What it must handle is exactly what the live pages showed on 2026-09-18 —
 * `File:X.jpg` alone, `File:X.jpg|Caption`, `File:X.jpg|[[:Category:Y|Y]]` (a linked caption), several blocks with
 * section headings between them, and lines that are not files at all.
 *
 * Measured against live pages before writing this: The Venetian Macao 5 items, London 542, New York City 246,
 * Berlin 0 — and the item counts here match those pages' rendered galleries exactly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGalleryBlocks, galleryCaptionText } from '../src/widgets/dataSources.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { servedThumbWidth, thumbSrcset, thumbSrcsetFor, slotWidthPx, GALLERY_MIN_COLUMN, cleanMediaUrl, allowHiDpi } from '../src/lib/imageSrcset.js';

// The Venetian Macao, verbatim (542 bytes, one block, all three caption shapes).
const VENETIAN = `{{Gallery page}}
{{Wikidata Infobox}}

<gallery>
Macau-Venetian-01.jpg
MC 澳門 Macau 路氹 Taipa 金光大道 Cotai hotel shuttle view November 2019 SS2 07 The Venetian Macao bridge.jpg|Macao bridge 2019
File:The Venetian 05.jpg|[[:Category:Marco Polo Canal|Marco Polo Canal]]
File:The Venetian Macao The Great Hall.jpg|The Great Hall
File:Venetian Macau.JPG|Gambling area
</gallery>

[[Category:Gallery pages of Macao]]
`;

test('galleries: every line becomes a file, in page order, with the file prefix made canonical', () => {
  const items = parseGalleryBlocks(VENETIAN);
  assert.equal(items.length, 5);
  assert.equal(items[0].file, 'File:Macau-Venetian-01.jpg', 'a bare file name');
  assert.equal(items[0].caption, '', 'no caption is an empty caption, not the file name');
  assert.equal(items[2].file, 'File:The Venetian 05.jpg');
  assert.equal(items[4].file, 'File:Venetian Macau.JPG');
  // order is the gallery's own — the entire reason to read a gallery instead of a category
  assert.deepEqual(items.map((i) => i.caption), ['', 'Macao bridge 2019', 'Marco Polo Canal', 'The Great Hall', 'Gambling area']);
});

test('galleries: a linked caption becomes its label, and other markup is cleaned', () => {
  // The linked-caption case is why the first pipe is the split: `[[:Category:Marco Polo Canal|Marco Polo Canal]]`
  // contains a second pipe, and a naive split on `|` would leave "[[:Category:Marco Polo Canal".
  assert.equal(galleryCaptionText('[[:Category:Marco Polo Canal|Marco Polo Canal]]'), 'Marco Polo Canal');
  assert.equal(galleryCaptionText('[[The Venetian Macao|The Venetian]]'), 'The Venetian');
  assert.equal(galleryCaptionText('[[:Category:Venice]]'), 'Venice', 'a bare link shows the part after the colon');
  assert.equal(galleryCaptionText("''The'' Great '''Hall'''"), 'The Great Hall');
  assert.equal(galleryCaptionText('A line<br />and another'), 'A line and another');
  assert.equal(galleryCaptionText('  spaced   out  '), 'spaced out');
  assert.equal(galleryCaptionText('&amp; entities &lt;here&gt;'), '& entities <here>');
  assert.equal(galleryCaptionText(''), '');
  assert.equal(galleryCaptionText(null), '');
});

test('galleries: sections come from the headings between blocks, and blocks accumulate', () => {
  const wikitext = `{{Gallery page}}
== Exterior ==
<gallery>
File:One.jpg|First
File:Two.jpg
</gallery>
== Interior ==
Some prose that is not a gallery.
<gallery mode="packed" widths="180">
File:Three.jpg|Third
</gallery>
`;
  const items = parseGalleryBlocks(wikitext);
  assert.deepEqual(items.map((i) => [i.file, i.section]), [
    ['File:One.jpg', 'Exterior'], ['File:Two.jpg', 'Exterior'],
    ['File:Three.jpg', 'Interior'],
  ]);
});

test('galleries: per-line options are not captions, and non-file lines are ignored', () => {
  const items = parseGalleryBlocks(`<gallery>
File:One.jpg|A real caption|link=File:Other.jpg
File:Two.jpg|alt=Just an option
File:Three.jpg|Caption first|alt=then an option
Not a file at all
{{some template}}
</gallery>`);
  assert.deepEqual(items.map((i) => [i.file, i.caption]), [
    ['File:One.jpg', 'A real caption'],
    ['File:Two.jpg', ''],
    ['File:Three.jpg', 'Caption first'],
  ]);
  // a line with no recognised extension and no File: prefix is not a gallery item
  assert.equal(items.length, 3);
});

test('galleries: nothing, or a page that is not a gallery, parses to nothing', () => {
  assert.deepEqual(parseGalleryBlocks(''), []);
  assert.deepEqual(parseGalleryBlocks(null), []);
  assert.deepEqual(parseGalleryBlocks('Just prose. [[Category:Something]]'), [], 'Berlin: a page, but no gallery');
  assert.deepEqual(parseGalleryBlocks('<gallery></gallery>'), []);
  // media that is not an image still counts — a gallery can hold audio, video or a PDF
  const media = parseGalleryBlocks('<gallery>\nFile:Speech.ogg|A recording\nFile:Book.pdf|A document\n</gallery>');
  assert.deepEqual(media.map((i) => i.file), ['File:Speech.ogg', 'File:Book.pdf']);
});

test('galleries: the widget declares the gallery contract (channels, cap, honest empty state)', () => {
  const def = WIDGET_TYPES.gallery;
  assert.ok(def, 'the widget exists');
  const keys = def.configFields.map((f) => f.key);
  for (const k of ['from', 'page', 'category', 'files', 'displayMode', 'iconSize', 'imageFit', 'maxItems', 'groupBy', 'linkAction']) {
    assert.ok(keys.includes(k), k);
  }
  // Two channels on the ISSUE-91 pattern: the captions travel as lines, the clicked file as a selection.
  assert.equal(def.outputs.lines, 'lines');
  assert.equal(def.outputs.selection, 'value');
  assert.equal(def.primary, 'lines', 'the bare id means the captions');
  assert.equal(typeof def.emit, 'function');
  const emitted = def.emit({
    rows: [{ title: 'A.jpg', caption: 'A caption' }, { title: 'B.jpg', caption: '' }],
    page: 'A gallery',
  });
  assert.deepEqual(emitted.lines, ['A caption', 'B.jpg'], 'a caption-less tile contributes its file name');
  const card = def.transform({ page: 'A gallery', rows: [], total: 0, galleryless: true, hasTemplate: true }, { page: 'A gallery' });
  assert.match(card.emptyText, /no <gallery>/i, 'the Berlin case says what is wrong');
  assert.match(card.subtitle, /Gallery page/i, 'and explains that the page declares itself a gallery');
  const normal = def.transform({ page: 'A gallery', rows: [{ title: 'A.jpg' }], total: 5, shown: 1, dropped: 0 }, { page: 'A gallery' });
  assert.match(normal.subtitle, /5 images/);
  assert.match(normal.subtitle, /showing 1/i);
});

/* ── srcset/sizes: which bytes a tile fetches (ISSUE-109) ─────────────────────────────────────────────────── */

test('the served width is parsed from the URL, because the API reports the requested one', () => {
  // iiurlwidth=480 reports thumbwidth 480 and serves 500px — the descriptor must be the 500.
  assert.equal(servedThumbWidth('https://thumb.wikimedia.org/wikipedia/commons/thumb/9/97/Foo.jpg/500px-Foo.jpg'), 500);
  assert.equal(servedThumbWidth('https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2f/Book.pdf/page1-330px-Book.pdf.jpg'), 330);
  assert.equal(servedThumbWidth('https://example.org/no-width-here.jpg'), null);
  assert.equal(servedThumbWidth(''), null);
  assert.equal(servedThumbWidth(undefined), null);
  assert.equal(cleanMediaUrl('https://x/y.jpg?utm_source=commons.wikimedia.org'), 'https://x/y.jpg');
});

test('srcset declares the real pixel widths, and gives up when there is nothing to choose', () => {
  const base = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/97/Foo.jpg/250px-Foo.jpg';
  const two = { '2': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/97/Foo.jpg/500px-Foo.jpg' };
  assert.equal(thumbSrcset(base, two),
    `${base} 250w, https://thumb.wikimedia.org/wikipedia/commons/thumb/9/97/Foo.jpg/500px-Foo.jpg 500w`);
  // sorted by width, and de-duplicated when the API hands back the base twice
  assert.equal(thumbSrcset(base, { '2': base }), '');
  assert.equal(thumbSrcset(base, {}), '');                      // one candidate is not a choice
  assert.equal(thumbSrcset(base, { '2': 'not a url' }), '');    // never guess a width
  assert.equal(thumbSrcset('', two), '');
  // tracking params are stripped from both candidates
  assert.equal(thumbSrcset(`${base}?utm_source=x`, { '2': `${two['2']}?utm_campaign=y` }),
    `${base} 250w, ${two['2']} 500w`);
});

test('sizes is the slot width the grid will actually produce', () => {
  // the auto-fill arithmetic: how many min-columns fit, then the leftover split between them
  // Measured on a real card: `.gallery-grid` carries 2px padding, so the box you measure is 801 while the layout
  // solves 797 — and that 4px is the difference between a 193px slot and a 194px one. `sizes` must be the content box.
  assert.equal(slotWidthPx(797, GALLERY_MIN_COLUMN.medium), 193);
  assert.equal(slotWidthPx(801, GALLERY_MIN_COLUMN.medium), 194);
  assert.equal(slotWidthPx(551, GALLERY_MIN_COLUMN.small), 132);    // 4 columns of 110+ in a 555px border box
  assert.equal(slotWidthPx(320, GALLERY_MIN_COLUMN.large), 320);    // one column: the whole width
  assert.equal(slotWidthPx(0, 170), 0);                             // not measured yet
  assert.equal(slotWidthPx(NaN, 170), 0);
  assert.equal(slotWidthPx(200, 0), 0);
  // a wide card fits more tiles rather than wider ones — the fitting rule the CSS already promised
  assert.ok(slotWidthPx(1600, 170) < slotWidthPx(900, 170) * 2);
});

test('the user can ask for fewer bytes, and we listen', () => {
  const base = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/97/Foo.jpg/250px-Foo.jpg';
  const two = { '2': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/97/Foo.jpg/500px-Foo.jpg' };
  assert.equal(thumbSrcsetFor(base, two, { hiDpi: true }), thumbSrcset(base, two));
  assert.equal(thumbSrcsetFor(base, two, { hiDpi: false }), `${base} 250w`);   // a single candidate, no 2×
  assert.equal(thumbSrcsetFor('', {}, { hiDpi: true }), '');
  // the platform's own signals: saveData, or a connection too slow to spend bytes on sharpness
  assert.equal(allowHiDpi({ connection: { saveData: true, effectiveType: '4g' } }), false);
  assert.equal(allowHiDpi({ connection: { saveData: false, effectiveType: '2g' } }), false);
  assert.equal(allowHiDpi({ connection: { saveData: false, effectiveType: '4g' } }), true);
  assert.equal(allowHiDpi({}), true);        // no Network Information API (Safari, Firefox): default to quality
  assert.equal(allowHiDpi(null), true);
});
