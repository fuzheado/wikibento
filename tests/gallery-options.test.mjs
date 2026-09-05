/**
 * Article Gallery options (GitHub issue fuzheado/wikibento#3) —
 * includeAll / hideDecorative / groupBy constitution.
 *
 * Heuristic vectors are REAL files verified live 2026-09-05 against
 * /page/media-list payloads (see the fetchArticleGallery comment in
 * src/widgets/dataSources.js): countries' infobox flags/seals/emblems,
 * National Gallery London's lead logo, List of presidents of Harvard
 * University's coat of arms + Noimage.svg placeholder, and content photos
 * that must never be hidden (Einstein, Harvard president portraits).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDecorativeImageTitle, selectGalleryCandidates, assignRowGroups } from '../src/widgets/dataSources.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { validateDashboard } from '../src/lib/dashboardConfig.js';

const galleryDef = WIDGET_TYPES.gallery;
const transform = galleryDef.transform;

// ── decorative filename heuristic (hideDecorative) ──────────

test('decorative heuristic: real decorative files are detected', () => {
  const decorative = [
    'File:Flag_of_France.svg',
    'File:Flag_of_the_United_Kingdom_(1-2).svg',
    'File:Flag_of_India.svg',
    'File:Coat_of_arms_of_Germany.svg',
    'File:Coat_of_Arms_of_Joseph_Willard.svg',
    'File:Greater_coat_of_arms_of_the_United_States.svg',
    'File:Escudo de Madrid.svg',
    'File:Wappen Landkreis Barnim.svg',
    'File:Imperial_Seal_of_Japan.svg',
    'File:Emblem_of_India.svg',
    'File:National_Gallery_London_logo.svg',
    'File:Logo of the BBC.svg',
    'File:Locator map of Auvergne-Rhône-Alpes.svg',
    'File:BlankMap-World-noborders.png',
    'File:EU-France_(orthographic_projection).svg',
    'File:Noimage.svg',
    'File:Icon of note.svg',
  ];
  for (const t of decorative) assert.equal(isDecorativeImageTitle(t), true, `expected decorative: ${t}`);
});

test('decorative heuristic: real content images are never matched (no false positives)', () => {
  const content = [
    'File:Harvard_Alumni_Day_2025_-_Alan_Garber_28_(cropped).jpg',
    'File:HarvardUniversityPresidents1829-1862.jpg',
    'File:Portrait_of_Increase_Mather,_1688.jpg',
    'File:Urian_Oakes_tomb_-_Cambridge,_MA.jpg',
    'File:Benjamin_Wadsworth.jpg',
    'File:John_Singleton_Copley_-_Edward_Holyoke_(1689-1769)_-_H6_-_Harvard_Art_Museums.jpg',
    'File:Albert_Einstein_Head_cleaned.jpg',
    'File:Albert_Einstein_1921_by_F_Schmutzer_(3x4_close_cropped).jpg',
    'File:Hermann_einstein.jpg',
    'File:Van_Eyck_-_Arnolfini_Portrait.jpg',
    'File:National_Gallery_London_2013_March.jpg',
    'File:Crested_hawk-eagle_(Nisaetus_cirrhatus_cirrhatus)_with_Indian_garden_lizard.jpg',
    'File:Bengal_tiger_in_Sanjay_Dubri_Tiger_Reserve_December_2024_by_Tisha_Mukherjee_11.jpg',
    'File:Flagstaff House, Kolkata.jpg', // 'flag' inside a word
  ];
  for (const t of content) assert.equal(isDecorativeImageTitle(t), false, `expected content image: ${t}`);
});

// ── includeAll / hideDecorative candidate selection ─────────

const img = (title, captionHtml, extra = {}) => ({ type: 'image', title, caption: captionHtml ? { html: captionHtml } : undefined, srcset: [{ scale: '1x', src: `//x/${title}` }], ...extra });

test('default (includeAll off): only captioned images pass; decorative filter is inert', () => {
  const items = [
    img('File:Portrait_of_Increase_Mather,_1688.jpg', null, { section_id: 4 }),
    img('File:Flag_of_France.svg', null, { section_id: 0 }),
    img('File:HarvardUniversityPresidents1829-1862.jpg', '<p>Composite portrait</p>', { section_id: 2 }),
  ];
  const { kept, decorative } = selectGalleryCandidates(items, { includeAll: false, hideDecorative: false });
  assert.equal(kept.length, 1);
  assert.equal(kept[0].title, 'File:HarvardUniversityPresidents1829-1862.jpg');
  assert.equal(decorative, 0, 'decorative counting only happens with includeAll');
  const def = selectGalleryCandidates(items, {}); // hideDecorative default true — still inert
  assert.equal(def.kept.length, 1);
  assert.equal(def.decorative, 0);
});

test('includeAll keeps caption-less portraits but drops decorative files (hideDecorative default true)', () => {
  const items = [
    img('File:Portrait_of_Increase_Mather,_1688.jpg', null, { section_id: 4 }), // president portrait — keep
    img('File:Coat_of_Arms_of_Joseph_Willard.svg', null, { section_id: 4 }),     // decorative — hide
    img('File:Noimage.svg', null, { section_id: 4 }),                            // placeholder — hide
    img('File:HarvardUniversityPresidents1829-1862.jpg', '<p>Composite</p>', { section_id: 2 }), // captioned — keep
  ];
  const { kept, decorative } = selectGalleryCandidates(items, { includeAll: true }); // hideDecorative true
  assert.equal(decorative, 2);
  assert.deepEqual(kept.map((k) => k.title), [
    'File:Portrait_of_Increase_Mather,_1688.jpg',
    'File:HarvardUniversityPresidents1829-1862.jpg',
  ]);
});

test('includeAll + hideDecorative=false keeps everything caption-less (user disables the filter)', () => {
  const items = [
    img('File:Portrait_of_Increase_Mather,_1688.jpg', null),
    img('File:Flag_of_France.svg', null),
    img('File:Coat_of_Arms_of_Joseph_Willard.svg', null),
  ];
  const { kept, decorative } = selectGalleryCandidates(items, { includeAll: true, hideDecorative: false });
  assert.equal(decorative, 0);
  assert.equal(kept.length, 3);
});

test('captioned decorative files are NEVER decorative-filtered, even with includeAll+hideDecorative', () => {
  const items = [img('File:Flag_of_France.svg', '<p>The national flag</p>')];
  const { kept, decorative } = selectGalleryCandidates(items, { includeAll: true, hideDecorative: true });
  assert.equal(decorative, 0);
  assert.equal(kept.length, 1);
});

test('title-less stubs and non-image items are never candidates', () => {
  const items = [
    { type: 'image' },                                                    // no title
    { type: 'audio', title: 'File:Intro.ogg', caption: { html: '<p>x</p>' } },
    img('File:Real.jpg', '<p>cap</p>'),
  ];
  const { kept } = selectGalleryCandidates(items, { includeAll: true, hideDecorative: false });
  assert.equal(kept.length, 1);
  assert.equal(kept[0].title, 'File:Real.jpg');
});

// ── groupBy row annotation ──────────────────────────────────

const row = (title, sectionId, galleryId) => ({ title, sectionId, galleryId: galleryId ?? null, caption: '' });

test('groupBy section: rows keyed per section; labels from heading map, "Section N"/Introduction fallbacks', () => {
  const headings = new Map([[2, 'Childhood, youth and education'], [4, 'First scientific papers (1900–1905)']]);
  const rows = assignRowGroups(
    [row('A lead photo.jpg', 0, null), row('B parents.jpg', 2, null), row('C paper.jpg', 4, null), row('D orphan.jpg', 99, null)],
    'section', headings,
  );
  assert.deepEqual(rows.map((r) => r.group), [
    { key: 's:0', label: 'Section: Introduction' },
    { key: 's:2', label: 'Section: Childhood, youth and education' },
    { key: 's:4', label: 'Section: First scientific papers (1900–1905)' },
    { key: 's:99', label: 'Section 99' }, // unknown heading → numeric fallback
  ]);
});

test('groupBy gallery: gallery blocks get their own numbered groups; other images keep section groups', () => {
  // Real structure from the National Gallery, London media-list payload
  // (2026-09-05): gallery runs mwAq4 (sec 10) → mwAt8 (sec 11) → mwBFM (sec 18).
  const rows = assignRowGroups([
    row('File:Logo.svg', 0, null),
    row('File:Building.jpg', 10, null),
    row('File:Facade.jpg', 10, 'mwAq4'),
    row('File:Interior.jpg', 10, 'mwAq4'),
    row('File:Hall.jpg', 11, 'mwAt8'),
    row('File:Painting.jpg', 18, 'mwBFM'),
    row('File:Van Gogh 127.jpg', 18, 'mwBFM'),
  ], 'gallery', new Map());
  assert.deepEqual(rows.map((r) => [r.title, r.group.key, r.group.label]), [
    ['File:Logo.svg', 's:0', 'Section: Introduction'],
    ['File:Building.jpg', 's:10', 'Section 10'],
    ['File:Facade.jpg', 'g:mwAq4', 'Gallery 1'],
    ['File:Interior.jpg', 'g:mwAq4', 'Gallery 1'],
    ['File:Hall.jpg', 'g:mwAt8', 'Gallery 2'],
    ['File:Painting.jpg', 'g:mwBFM', 'Gallery 3'],
    ['File:Van Gogh 127.jpg', 'g:mwBFM', 'Gallery 3'],
  ]);
});

test('groupBy none (default): rows untouched — no group field', () => {
  const rows = assignRowGroups([row('A.jpg', 2, null), row('B.jpg', 2, 'mwX')], 'none', new Map());
  assert.equal(rows[0].group, undefined);
  assert.equal(rows[1].group, undefined);
});

// ── registry: transform subtitle/empty-state + config fields ─

test('gallery transform: default mode keeps the legacy subtitle/empty wording', () => {
  const out = transform(
    { article: 'List_of_presidents_of_Harvard_University', rows: [], dropped: 0, decorative: 0, includeAll: false, groupBy: 'none' },
    { article: 'List_of_presidents_of_Harvard_University' }, // legacy config — no new keys
  );
  assert.equal(out.subtitle, '0 images');
  assert.equal(out.emptyText, 'No captioned images found');
});

test('gallery transform: includeAll empty state never claims captioned-only; counts decorative hides', () => {
  const rows = [
    { title: 'Portrait of Increase Mather', caption: '', showFileName: true, thumbUrl: '//x/1.jpg' },
    { title: 'Flag of France', caption: 'The flag', showFileName: false, thumbUrl: '//x/2.jpg' },
  ];
  const out = transform(
    { article: 'France', rows, dropped: 1, decorative: 2, includeAll: true, groupBy: 'none' },
    { includeAll: true, hideDecorative: true, groupBy: 'none' },
  );
  assert.equal(out.subtitle, '2 images · 1 filtered (tiny) · 2 decorative hidden');
  assert.match(out.emptyText, /^No images found/);
  assert.ok(!/captioned/i.test(out.emptyText));
  assert.equal(out.rows[0].showFileName, true, 'caption-less rows get the file-name label');
  const empty = transform(
    { article: 'X', rows: [], dropped: 4, decorative: 1, includeAll: true, groupBy: 'none' },
    { includeAll: true, hideDecorative: true },
  );
  assert.equal(empty.emptyText, 'All images filtered (tiny/decorative)');
});

test('gallery transform: grouped modes append a groups note to the subtitle', () => {
  const out = transform(
    { article: 'A', rows: [], dropped: 0, decorative: 0, includeAll: true, groupBy: 'section' },
    { includeAll: true, groupBy: 'section' },
  );
  assert.equal(out.subtitle, '0 images · section groups');
  const g = transform(
    { article: 'A', rows: [], dropped: 0, decorative: 0, includeAll: false, groupBy: 'gallery' },
    { includeAll: false, groupBy: 'gallery' },
  );
  assert.equal(g.subtitle, '0 images · gallery groups');
});

test('gallery registry: new config fields validate (booleans typed, groupBy enum)', () => {
  const dashboard = (config) => ({
    widgets: [{ id: 'g1', widgetType: 'gallery', config }],
    layout: [{ i: 'g1', x: 0, y: 0, w: 6, h: 4 }],
  });
  const ok = validateDashboard(dashboard({ article: 'France', includeAll: true, hideDecorative: false, groupBy: 'section' }));
  assert.equal(ok.valid, true);
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.warnings.length, 0);
  const badBool = validateDashboard(dashboard({ includeAll: 'yes' }));
  assert.equal(badBool.valid, false);
  assert.ok(badBool.errors.find((e) => e.includes('"includeAll" must be true or false')));
  const badEnum = validateDashboard(dashboard({ groupBy: 'sections' }));
  assert.equal(badEnum.valid, false);
  assert.ok(badEnum.errors.find((e) => e.includes('"groupBy" must be one of none, section, gallery')));
});

test('gallery registry: new options declared in defaults + configFields + fetcher wiring', () => {
  assert.equal(galleryDef.defaults.includeAll, false);
  assert.equal(galleryDef.defaults.hideDecorative, true);
  assert.equal(galleryDef.defaults.groupBy, 'none');
  const keys = galleryDef.configFields.map((f) => f.key);
  assert.ok(keys.includes('includeAll') && keys.includes('hideDecorative') && keys.includes('groupBy'));
  assert.equal(galleryDef.configFields.find((f) => f.key === 'groupBy').options.map((o) => o.value).join(','), 'none,section,gallery');
  // fetcher receives an options object (5th positional param stays optional)
  const fetchSrc = galleryDef.fetch.toString();
  assert.match(fetchSrc, /fetchArticleGallery\(/);
  assert.match(fetchSrc, /includeAll:\s*config\.includeAll/);
  assert.match(fetchSrc, /groupBy:\s*config\.groupBy/);
});
