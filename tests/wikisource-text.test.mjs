/**
 * Wikisource text-layer tests (ISSUE-82 v1.1, 2026-09-15).
 *
 * Fixtures are real wikitext from `Page:EB1926 - Supplement Volume 3.pdf/434` on en.wikisource — a page of
 * the 1926 Encyclopædia Britannica Supplement, **1,208 pages bulk-imported at quality level 1 ("Not
 * proofread")**, which is the ordinary case for a transcribed Commons document: the text exists, and it is
 * uncorrected OCR. The grade travels with the text precisely so that nobody mistakes one for the other.
 *
 * The stripping rules are an approximation of an edition's markup — `<noinclude>` headers, `{{rh}}` running
 * heads, `<section>` markers, template stacks, links and footnotes — so they are pinned here against the real
 * page rather than against something I invented.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROOFREAD_LABELS, qualityLabel, fileBaseName, pageTitleFor, indexTitleFor,
  transcriptionWiki, stripPageWikitext, pageTextBox,
} from '../src/lib/wikisourceText.js';

// The first 520 characters of the real page, untouched.
const HEAD_434 = '<noinclude><pagequality level="1" user="Cosmia Nebula" />{{rh||{{x-larger|RUMANIA}}|{{x-larger|389}}}}</noinclude><section begin="Ruhr" />by surprise at the bitter resistance of the dour Westphalians. They occupied the state-owned mines and the Reichsbank branches, but the hostility of the workers and a financial panic led them temporarily to withdraw their troops.';
// And its tail.
const TAIL_434 = 'the estimated population (1922) 16,250,000. This includes minorities, some being of very considerable size. They<section end="Rumania" /><noinclude></noinclude>';
const PAGE_1 = '<noinclude><pagequality level="1" user="Cosmia Nebula" /></noinclude>{{center|{{x-larger|THE}}<br/><br/>{{xxxx-larger|ENCYCLOPÆDIA BRITANNICA}}<br/><br/>A DICTIONARY OF ARTS, SCIENCES, LITERATURE AND GENERAL INFORMATION}}';

const COMMONS_USAGE = [
  { ns: 106, wiki: 'en.wikisource.org', title: 'Index:EB1926_-_Supplement_Volume_3.pdf' },
  { ns: 104, wiki: 'en.wikisource.org', title: 'Page:EB1926_-_Supplement_Volume_3.pdf/434' },
];

// ── titles ──────────────────────────────────────────────────────────────────────
test('fileBaseName: the Page: namespace wants the name without its prefix', () => {
  assert.equal(fileBaseName('File:The Three Hostages (1924).pdf'), 'The Three Hostages (1924).pdf');
  assert.equal(fileBaseName('https://commons.wikimedia.org/wiki/File:A_b.pdf'), 'A_b.pdf');
  assert.equal(fileBaseName(''), '');
});

test('pageTitleFor: 1-based, matching pagecount and the page{N}- render numbering', () => {
  assert.equal(pageTitleFor('File:EB1926 - Supplement Volume 3.pdf', 434), 'Page:EB1926 - Supplement Volume 3.pdf/434');
  assert.equal(pageTitleFor('File:X.djvu', 1), 'Page:X.djvu/1');
  assert.equal(pageTitleFor('File:X.djvu', 0), 'Page:X.djvu/1', 'never page 0 — Wikisource has no such page');
  assert.equal(pageTitleFor('File:X.djvu', '2.6'), 'Page:X.djvu/3', 'rounds, like a reader would expect');
  assert.equal(pageTitleFor('', 4), '');
  assert.equal(indexTitleFor('File:X.djvu'), 'Index:X.djvu');
});

// ── detection: is this file transcribed at all? ─────────────────────────────────
test('transcriptionWiki: a Page:/Index: usage on a Wikisource means the text exists', () => {
  assert.equal(transcriptionWiki(COMMONS_USAGE), 'en.wikisource');
  assert.equal(transcriptionWiki([{ ns: 104, wiki: 'de.wikisource.org' }]), 'de.wikisource');
  assert.equal(transcriptionWiki([{ ns: 106, wiki: 'en.wikisource.org' }]), 'en.wikisource');
});

test('transcriptionWiki: being *linked* somewhere is not a transcription', () => {
  // measured: the Mozart DjVu is used on it.wikipedia (ns12/ns6) and has no transcription anywhere
  assert.equal(transcriptionWiki([{ ns: 12, wiki: 'it.wikipedia.org' }, { ns: 6, wiki: 'it.wikipedia.org' }]), '');
  assert.equal(transcriptionWiki([{ ns: 0, wiki: 'www.wikidata.org' }]), '', 'a Wikidata item is not a transcription');
  assert.equal(transcriptionWiki([{ ns: 104, wiki: 'en.wikipedia.org' }]), '', 'the Page: namespace only exists on Wikisource');
  assert.equal(transcriptionWiki([]), '');
  assert.equal(transcriptionWiki(null), '');
  assert.equal(transcriptionWiki(null, 'en.wikisource'), 'en.wikisource', 'the caller may know better');
});

// ── the quality grade is the point ──────────────────────────────────────────────
test('qualityLabel: the wiki’s own wording wins, then the standard grades', () => {
  assert.equal(qualityLabel(1, 'Not proofread'), 'Not proofread');
  assert.equal(qualityLabel(3), 'Proofread');
  assert.equal(qualityLabel(4), 'Validated');
  assert.equal(qualityLabel(0), 'Without text');
  assert.equal(qualityLabel(2), 'Problematic');
  assert.equal(qualityLabel(99), 'Unknown quality');
  assert.equal(Object.keys(PROOFREAD_LABELS).length, 5, 'the five grades Wikisource uses');
});

// ── stripping the real page ─────────────────────────────────────────────────────
test('stripPageWikitext: the header (pagequality + running head) is gone', () => {
  const text = stripPageWikitext(HEAD_434);
  assert.ok(!/pagequality/.test(text), 'the quality tag is markup, not text');
  assert.ok(!/RUMANIA|389/.test(text), 'the running head belongs to the edition, not the page body');
  assert.ok(!/noinclude|section begin/.test(text));
});

test('stripPageWikitext: the body survives, from its first word', () => {
  const text = stripPageWikitext(HEAD_434);
  assert.ok(text.startsWith('by surprise at the bitter resistance of the dour Westphalians.'), text.slice(0, 80));
  assert.ok(/Reichsbank branches/.test(text));
});

test('stripPageWikitext: a section marker at the end of a sentence does not swallow it', () => {
  const text = stripPageWikitext(`${HEAD_434} ${TAIL_434}`);
  assert.ok(/considerable size\. They/.test(text), 'the sentence runs into the section end, which is markup');
  assert.ok(!/section end|Rumania"/.test(text));
});

test('stripPageWikitext: a template stack becomes the words it prints', () => {
  const text = stripPageWikitext(PAGE_1);
  assert.match(text, /THE\s+ENCYCLOPÆDIA BRITANNICA/, 'a <br/> in the heading is a line break, not a space');
  assert.match(text, /A DICTIONARY OF ARTS, SCIENCES/);
  assert.ok(!/[{}]/.test(text), 'no braces survive');
  assert.ok(!/\n\n\n/.test(text));
});

test('stripPageWikitext: formatting templates keep text, furniture templates go', () => {
  assert.equal(stripPageWikitext('{{nop}}'), '');
  assert.equal(stripPageWikitext('{{rh||A|B}}'), '', 'a running head outside <noinclude> is still furniture');
  assert.equal(stripPageWikitext('{{x-larger|RUMANIA}}'), 'RUMANIA');
  assert.equal(stripPageWikitext('{{center|{{x-larger|THE}}}}'), 'THE', 'nesting is expanded inside out');
  assert.equal(stripPageWikitext('{{lang|he|שלום}}'), 'שלום', 'a language template keeps its text, not the code');
});

test('stripPageWikitext: links keep their label, and a trailing plural survives', () => {
  assert.equal(stripPageWikitext('[[Ruhr|the Ruhr]] valley'), 'the Ruhr valley');
  assert.equal(stripPageWikitext('the [[Ruhr]]s'), 'the Ruhrs');
  assert.equal(stripPageWikitext('see [https://example.org the source]'), 'see the source');
  assert.equal(stripPageWikitext('[[File:Map.png|thumb|A map]]text'), 'text', 'embedded media is not page text');
});

test('stripPageWikitext: footnotes and markup do not leak into the prose', () => {
  const text = stripPageWikitext("A claim.<ref>Some note</ref> More.<ref name=x /> '''Bold''' and ''italic''.");
  assert.equal(text, 'A claim. More. Bold and italic.');
});

test('stripPageWikitext: entities, spacing and blank runs are tidied', () => {
  assert.equal(stripPageWikitext('a&nbsp;b'), 'a b');
  assert.equal(stripPageWikitext('x &mdash; y'), 'x \u2014 y');
  assert.equal(stripPageWikitext('word , next'), 'word, next', 'a space before punctuation is dropped');
  assert.equal(stripPageWikitext('a\n\n\n\nb'), 'a\n\nb');
  assert.equal(stripPageWikitext('<br/>one<br/>two'), 'one\ntwo');
  assert.equal(stripPageWikitext(null), '');
  assert.equal(stripPageWikitext('   '), '');
});

test('stripPageWikitext: a wikitables becomes its cell text (found on a real 10 KB page)', () => {
  // The unit tests used the first 520 chars of the page and passed while the whole page leaked `{|`/`|}`.
  const table = '{| style="margin:auto;"\n|+ Area\n|-\n| 1922 || 16,250,000\n|-\n| 1910 || 15,000,000\n|}';
  const text = stripPageWikitext(`before\n${table}\nafter`);
  assert.ok(!/[{}]/.test(text), `no table braces survive: ${text}`);
  assert.ok(!/\|\}|\{\|/.test(text));
  assert.match(text, /before/);
  assert.match(text, /Area/);
  assert.match(text, /1922 · 16,250,000/);
  assert.match(text, /1910 · 15,000,000/);
  assert.match(text, /after/);
});

test('stripPageWikitext: a table cell with its own styles keeps the words', () => {
  const text = stripPageWikitext('{|\n| style="text-align:right;" | 389\n| style="width:2em;" | \n|}');
  assert.ok(!/[{}|]/.test(text), `no table markup survives: ${text}`);
  assert.match(text, /389/);
});

// ── the payload the panel renders ───────────────────────────────────────────────
test('pageTextBox: one API page object → text, grade and a link to the transcription', () => {
  const box = pageTextBox({
    title: 'Page:EB1926 - Supplement Volume 3.pdf/434',
    proofread: { quality: 1, quality_text: 'Not proofread' },
    revisions: [{ slots: { main: { content: HEAD_434 } } }],
  }, 'File:EB1926 - Supplement Volume 3.pdf', 434, 'en.wikisource');
  assert.equal(box.label, 'Not proofread');
  assert.equal(box.quality, 1);
  assert.ok(box.text.length > 200);
  assert.ok(box.wikitextLength > box.text.length, 'the wikitext is longer than what it says');
  assert.equal(box.url, 'https://en.wikisource.org/wiki/Page:EB1926_-_Supplement_Volume_3.pdf/434');
});

test('pageTextBox: a page with no transcription is empty, not a crash', () => {
  const box = pageTextBox({ title: 'Page:X.pdf/3', proofread: { quality: 0, quality_text: 'Without text' } }, 'File:X.pdf', 3);
  assert.equal(box.text, '');
  assert.equal(box.label, 'Without text');
  assert.equal(box.url, 'https://en.wikisource.org/wiki/Page:X.pdf/3');
});
