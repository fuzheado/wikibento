/**
 * Direct media URLs in the player (ISSUE-39 extension for the Internet Archive family, 2026-09-15).
 *
 * The question this answers: *can a widget play video or audio?* Yes — the player already streamed
 * Commons files through `<video>`/`<audio>`; these tests pin the second half, that a **direct media URL**
 * (archive.org's `download/{id}/{file}`) becomes a playable row with **no API call at all**.
 *
 * Two measured facts shape the code (docs/INTERNET-ARCHIVE.md):
 *   · archive.org serves Range requests — `206` + `content-range: bytes 0-1023/68512128` for an mp4 —
 *     so seeking and progressive playback work with no proxy and no CORS requirement;
 *   · the same item's `.ogv` reports `canPlayType: ""` in Chromium while its `.mp4` reaches
 *     `readyState=4`, which is why the MIME type is passed to `<source>` and why an unknown extension
 *     falls back to `video` (a video element plays an audio track; the reverse is not true).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mediaKindFromUrl, mediaMimeFromUrl, directMediaRow, fetchMediaPlaylist,
} from '../src/widgets/dataSources.js';
import { joinGalleryCaptions, parseGalleryTemplates, fileKey, collapseToChapters } from '../src/widgets/dataSources.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';

const IA_FILM = 'https://archive.org/download/AboutBan1935/AboutBan1935.mp4';
const IA_AUDIO = 'https://archive.org/download/art_of_war_librivox/art_of_war_01-02_sun_tzu_64kb.mp3';

test('mediaKindFromUrl: video and audio extensions, and a safe default', () => {
  for (const u of ['a.mp4', 'a.ogv', 'a.webm', 'a.mpg', 'a.mpeg', 'a.mov', 'a.mkv']) {
    assert.equal(mediaKindFromUrl(u), 'video', u);
  }
  for (const u of ['a.mp3', 'a.ogg', 'a.oga', 'a.opus', 'a.flac', 'a.wav', 'a.m4a', 'a.aac']) {
    assert.equal(mediaKindFromUrl(u), 'audio', u);
  }
  assert.equal(mediaKindFromUrl('a.unknown'), 'video', 'unknown extensions default to video');
  assert.equal(mediaKindFromUrl('https://x/y/z.MP4'), 'video', 'case-insensitive');
  assert.equal(mediaKindFromUrl(IA_FILM), 'video');
  assert.equal(mediaKindFromUrl('https://x/y/file.mp3?_gl=1*abc#t=30'), 'audio', 'query/fragment ignored');
});

test('mediaMimeFromUrl: a real MIME type for <source type>, empty when unknown', () => {
  assert.equal(mediaMimeFromUrl('a.mp4'), 'video/mp4');
  assert.equal(mediaMimeFromUrl('a.ogv'), 'video/ogg');
  assert.equal(mediaMimeFromUrl('a.webm'), 'video/webm');
  assert.equal(mediaMimeFromUrl('a.mp3'), 'audio/mpeg');
  assert.equal(mediaMimeFromUrl('a.ogg'), 'audio/ogg');
  assert.equal(mediaMimeFromUrl('a.flac'), 'audio/flac');
  assert.equal(mediaMimeFromUrl('a.xyz'), '', 'unknown → no type, so the browser decides');
  assert.equal(mediaMimeFromUrl(IA_FILM), 'video/mp4');
});

test('directMediaRow: a playable row built from the URL alone', () => {
  const r = directMediaRow(`${IA_FILM}?utm_source=ia`);
  assert.equal(r.mediaType, 'video');
  assert.equal(r.direct, true);
  assert.equal(r.missing, false);
  assert.equal(r.originalUrl, IA_FILM, 'the query junk is stripped');
  assert.equal(r.derivatives.length, 1);
  assert.equal(r.derivatives[0].src, IA_FILM);
  assert.equal(r.derivatives[0].type, 'video/mp4');
  assert.equal(r.title, 'AboutBan1935', 'the filename becomes the title');
  assert.equal(r.pageUrl, IA_FILM, 'a direct URL has no wiki page — it is its own link');
  assert.equal(r.duration, 0, 'no API call means no duration yet; the element reports it');
});

test('directMediaRow: titles are prettified, and odd URLs do not throw', () => {
  assert.equal(directMediaRow('https://x/a_b%20c.mp3').title, 'a b c');
  assert.equal(directMediaRow('https://x/y/no-extension').title, 'no-extension');
  assert.equal(directMediaRow('not a url').title, 'not a url');
  assert.equal(directMediaRow('').mediaType, 'video');
});

test('fetchMediaPlaylist: URL-only input never calls an API — an unroutable host still resolves', async () => {
  // If this touched the Commons videoinfo API the call would fail or hang on the bogus host; it must not.
  const { rows, missing } = await fetchMediaPlaylist('https://example.invalid/film.mp4\nhttps://example.invalid/song.flac');
  assert.equal(rows.length, 2);
  assert.equal(missing, 0);
  assert.deepEqual(rows.map((r) => r.mediaType), ['video', 'audio']);
  assert.ok(rows.every((r) => r.direct === true));
});

test('fetchMediaPlaylist: input order is preserved for URL playlists', async () => {
  const { rows } = await fetchMediaPlaylist(`${IA_AUDIO}\n${IA_FILM}\nhttps://example.invalid/third.ogg`);
  assert.deepEqual(rows.map((r) => r.mediaType), ['audio', 'video', 'audio']);
  assert.equal(rows[1].title, 'AboutBan1935');
});

test('fetchMediaPlaylist: blank input is still a friendly error, not a crash', async () => {
  await assert.rejects(() => fetchMediaPlaylist('   \n  \n'), /Commons file or media URL/);
  await assert.rejects(() => fetchMediaPlaylist(''), /Commons file or media URL/);
});

test('the player widget advertises direct URLs in its own UI copy', () => {
  const w = WIDGET_TYPES.mediaPlayer;
  assert.ok(w, 'mediaPlayer must stay registered');
  const field = (w.configFields || []).find((f) => f.key === 'files');
  assert.ok(field, 'the files field must exist');
  const copy = `${field.label} ${field.hint || ''} ${field.placeholder || ''}`;
  assert.match(copy, /https?:\/\//i,
    'the field copy must show a media URL, or nobody will know an archive.org file can be pasted in');
  assert.match(copy, /archive\.org/i, 'and it may as well name the case that motivated it');
});

// ISSUE-119 — an article's galleries are not always <gallery> tags. The Metropolitan Museum of Art uses four
// {{gallery}} TEMPLATES and no tags at all, which is why the first version of this join found nothing (0 of the 63
// gallery images got a caption) while media-list had reported those images with an empty caption.
test('gallery captions are joined from {{gallery}} templates as well as <gallery> tags', () => {
  const wikitext = [
    '{{gallery',
    '|height=150',
    '|mode=packed',
    '|File:Silver-gilt bowl MET gr74.51.4554.R.jpg|[[Phoenician metal bowls|Phoenician metal bowl]] from 725 to 675 BCE',
    '|File:WLA metmuseum Tabernacle of Cherves 2.jpg|Tabernacle of Cherves, {{Circa|1220}}–30',
    '}}',
    '<gallery>',
    'File:Dogs, jackals.jpg|A dog and a jackal',
    '</gallery>',
  ].join('\n');
  const rows = [
    { title: 'Silver-gilt bowl MET gr74.51.4554.R.jpg' },   // the row's title: prefix stripped, underscores as spaces
    { title: 'WLA metmuseum Tabernacle of Cherves 2.jpg' },
    { title: 'Dogs, jackals.jpg' },
    { title: 'Not in any gallery.jpg' },
    { title: 'Already captioned.jpg', caption: 'kept' },
  ];
  assert.equal(joinGalleryCaptions(rows, wikitext), 3);
  assert.equal(rows[0].caption, 'Phoenician metal bowl from 725 to 675 BCE');   // a wiki link becomes its label
  assert.equal(rows[0].showFileName, false);
  assert.match(rows[1].caption, /^Tabernacle of Cherves/);
  assert.equal(rows[2].caption, 'A dog and a jackal');
  assert.equal(rows[3].caption, undefined, 'a file in no gallery keeps no caption');
  assert.equal(rows[4].caption, 'kept', 'an existing caption is never overwritten');
  // The key both lookups share: the title the API returns and the title media-list gave differ exactly here.
  assert.equal(fileKey('File:Queen_Mother_Pendant_Mask-_Iyoba_MET_DP231460.jpg'), 'Queen Mother Pendant Mask- Iyoba MET DP231460.jpg');
  assert.equal(fileKey('file:lower.jpg'), 'Lower.jpg');
});

// ISSUE-119 — a story's chapters are the TOP-LEVEL headings, not every sub-heading. Grouped by raw section ids the
// Met article produced 26 chapters of one image each where the prototype's <h2> walk found 6.
test('sub-sections collapse onto the chapter that contains them', () => {
  const sections = [
    { index: '1', line: 'Collections', toclevel: '1', level: '2' },
    { index: '2', line: 'European paintings', toclevel: '2', level: '3' },
    { index: '3', line: 'Arms and armor', toclevel: '2', level: '3' },
    { index: '4', line: 'History', toclevel: '1', level: '2' },
    { index: '5', line: '19th century', toclevel: '2', level: '3' },
  ];
  const map = collapseToChapters(sections);
  assert.deepEqual(map.get(1), { key: 1, label: 'Collections' });
  assert.deepEqual(map.get(2), { key: 1, label: 'Collections' }, 'a sub-section belongs to the chapter before it');
  assert.deepEqual(map.get(3), { key: 1, label: 'Collections' });
  assert.deepEqual(map.get(4), { key: 4, label: 'History' });
  assert.deepEqual(map.get(5), { key: 4, label: 'History' });
});
