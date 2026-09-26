/**
 * Wikipedia boxes — the render path for a faithfully-rendered template (ISSUE-90).
 *
 * The interesting tests here are the defensive ones. The content is MediaWiki-sanitised, but it is written by
 * strangers and rendered in our document, so these check that we enforce our own rules rather than inheriting
 * someone else's: allowlisted tags and attributes, rewritten URLs (the API returns `/wiki/…` and `//upload…`,
 * both measured), and CSS that is allowed to style the box and nothing else.
 *
 * When the live API response is in `cache/` (the measurement cache, gitignored), the last block runs the same
 * functions over the real markup — the strongest check available offline. Without it, those tests skip.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  BOX_PRESETS, transclusionFor, boxApiUrl, boxPageUrl, boxWasStrippedForMobile, boxRelayUrl, parseBoxResponse, splitBoxHtml,
  rewriteBoxUrls, sanitizeBoxHtml, prepareBoxHtml, filterScopedCss, isAllowedBoxAsset, boxLines,
  expandBoxTokens, boxLooksLikeNotice, openBoxLinksNewTab, boxLinkTarget, boxLinkSelection,
} from '../src/lib/wikiBox.js';
import { pageApiUrl, pageSectionsApiUrl, resolveSectionIndex } from '../src/lib/wikiBox.js';

// ── the transclusion trick ────────────────────────────────────────────────────────────────────────

test('a box renders as a transclusion, not as the template page', () => {
  // This is the whole reason the box arrives without its documentation furniture: `<noinclude>` (where the doc
  // box and the categories live) is skipped when a template is transcluded.
  assert.equal(transclusionFor('In the news'), '{{In the news}}');
  assert.equal(transclusionFor('  Did you know  '), '{{Did you know}}');
});

test('a box name may be a full invocation — that is what makes dated boxes work', () => {
  assert.equal(transclusionFor('In the news'), '{{In the news}}');
  // measured: the wrapper {{Picture of the day}} returns a notice off the Main Page, while the dated subpage
  // returns the real box. Magic words make it self-updating.
  assert.equal(transclusionFor('POTD/{{CURRENTYEAR}}-{{CURRENTMONTH}}-{{CURRENTDAY2}}'),
    '{{POTD/{{CURRENTYEAR}}-{{CURRENTMONTH}}-{{CURRENTDAY2}}}}');
  // an explicit invocation is respected, not double-wrapped
  assert.equal(transclusionFor('{{Did you know}}'), '{{Did you know}}');
  assert.equal(transclusionFor('  {{Did you know}}  '), '{{Did you know}}');
});

test('an unusable box name is still refused', () => {
  for (const bad of ['', '   ', null, undefined]) {
    assert.throws(() => transclusionFor(bad), /box name/, `expected a refusal for ${JSON.stringify(bad)}`);
  }
  assert.throws(() => transclusionFor('A\nB'), /span lines/);
  assert.throws(() => transclusionFor('x'.repeat(201)), /too long/);
});

test('{date} tokens expand, so a dated box stays current without editing the board', () => {
  const when = new Date(Date.UTC(2026, 8, 16, 12));
  assert.equal(expandBoxTokens('POTD/{date}', when), 'POTD/2026-09-16');
  assert.equal(expandBoxTokens('Wikipedia:Selected anniversaries/{monthname} {day}', when),
    'Wikipedia:Selected anniversaries/September 16');
  assert.equal(expandBoxTokens('X/{year}-{month}-{day}', when), 'X/2026-09-16');
  // anything unrecognised is left as written — the wiki judges it, not us
  assert.equal(expandBoxTokens('Odd/{unknown}/{date}', when), 'Odd/{unknown}/2026-09-16');
  assert.equal(expandBoxTokens('In the news', when), 'In the news');
});

test('a maintenance notice is recognised for what it is', () => {
  const notice = '<div class="mw-parser-output"><table class="imbox"><tr><td>This image was selected as picture of the day on the English Wikipedia for 2026-08-31.</td></tr></table></div>';
  assert.equal(boxLooksLikeNotice(notice), true);
  const real = '<div class="mw-parser-output"><ul class="hlist"><li>a real box</li></ul></div>';
  assert.equal(boxLooksLikeNotice(real), false);
  // an imbox that says something else is not ours to explain
  assert.equal(boxLooksLikeNotice('<table class="imbox"><td>Unrelated maintenance.</td></table>'), false);
});

test('the API URL asks for the parse of the transclusion, CORS-enabled', () => {
  const url = new URL(boxApiUrl({ project: 'en.wikipedia', box: 'In the news' }));
  assert.equal(url.hostname, 'en.wikipedia.org');
  assert.equal(url.searchParams.get('action'), 'parse');
  assert.equal(url.searchParams.get('text'), '{{In the news}}');
  assert.equal(url.searchParams.get('prop'), 'text');
  assert.equal(url.searchParams.get('origin'), '*', 'the browser calls this directly');
  assert.equal(url.searchParams.get('formatversion'), '2');
});

test('the credit URL is the page the box came from', () => {
  assert.equal(new URL(boxPageUrl({ project: 'en.wikipedia', box: 'In the news' })).pathname,
    '/wiki/Template:In_the_news');
  assert.equal(new URL(boxPageUrl({ project: 'en.wikipedia', box: "Today's featured article" })).pathname,
    "/wiki/Template:Today's_featured_article");
});

test('the five Main Page boxes are offered as presets', () => {
  for (const box of ['In the news', 'Did you know', 'On this day', 'Picture of the day']) {
    assert.ok(BOX_PRESETS.includes(box) || BOX_PRESETS.some((p) => p.includes(box)), box);
  }
});

// ── reading the response ──────────────────────────────────────────────────────────────────────────

test('an API error becomes a message a user could act on', () => {
  assert.throws(() => parseBoxResponse({ error: { code: 'badvalue', info: 'The text is invalid.' } }),
    /The text is invalid/);
  assert.throws(() => parseBoxResponse({}), /rendered empty/);
  assert.throws(() => parseBoxResponse({ parse: { text: '   ' } }), /rendered empty/);
});

test('the inline TemplateStyles are separated from the markup', () => {
  const { styles, body } = splitBoxHtml('<div>hi</div><style data-mw-deduplicate="TemplateStyles:r1">.mw-parser-output .a{color:red}</style>');
  assert.deepEqual(styles, ['.mw-parser-output .a{color:red}']);
  assert.equal(body, '<div>hi</div>');
  assert.ok(!body.includes('<style'));
});

// ── URL rewriting (measured: the API returns relative and protocol-relative URLs) ─────────────────

test('wiki-relative and protocol-relative URLs become absolute', () => {
  const html = '<a href="/wiki/File:X.jpg">x</a><img src="//thumb.wikimedia.org/a/b.jpg">';
  const out = rewriteBoxUrls(html, { wikiBase: 'https://en.wikipedia.org' });
  assert.ok(out.includes('href="https://en.wikipedia.org/wiki/File:X.jpg"'));
  assert.ok(out.includes('src="https://thumb.wikimedia.org/a/b.jpg"'));
});

test('srcset lists are rewritten element by element', () => {
  const out = rewriteBoxUrls('<img srcset="//upload.wikimedia.org/a.jpg 1.5x, /wiki/b.jpg 2x, https://c/d.jpg 3x">');
  assert.ok(out.includes('https://upload.wikimedia.org/a.jpg 1.5x'), out);
  assert.ok(out.includes('https://en.wikipedia.org/wiki/b.jpg 2x'), out);
  assert.ok(out.includes('https://c/d.jpg 3x'), out);
});

test('an absolute URL is left alone', () => {
  const html = '<a href="https://example.org/x">y</a>';
  assert.equal(rewriteBoxUrls(html), html);
});

// ── the sanitiser ─────────────────────────────────────────────────────────────────────────────────

test('scripts, frames, forms and their contents are removed', () => {
  const dirty = 'a<script>alert(1)</script>b<iframe src="https://evil"></iframe>c<form><input></form>d';
  const clean = sanitizeBoxHtml(dirty);
  assert.ok(!/script|iframe|form|input/i.test(clean), clean);
  assert.ok(clean.includes('a') && clean.includes('b') && clean.includes('c') && clean.includes('d'), 'text kept');
});

test('event handlers, inline styles and unknown attributes are dropped', () => {
  const clean = sanitizeBoxHtml('<a href="https://en.wikipedia.org/wiki/X" onclick="steal()" style="position:fixed" data-mw=\'{}\'>x</a>');
  assert.ok(!/onclick/.test(clean));
  assert.ok(!/style=/.test(clean), 'inline styles could escape the card');
  assert.ok(!/data-mw/.test(clean));
  assert.ok(clean.includes('href="https://en.wikipedia.org/wiki/X"'), 'the real link survives');
});

test('a root-relative URL is refused by the sanitiser, and absolute by the pipeline', () => {
  // Deliberate: if rewriting ever failed, a surviving `/wiki/X` would send the reader to wikibento instead of
  // Wikipedia. Dropping it loses a link; following it would be an invisible wrong turn.
  assert.equal(sanitizeBoxHtml('<a href="/wiki/X">x</a>'), '<a>x</a>');
  assert.ok(prepareBoxHtml('<a href="/wiki/X">x</a>').includes('href="https://en.wikipedia.org/wiki/X"'));
});

test('a link in a box opens in a new tab, so a click cannot replace the board', () => {
  // The bug: MediaWiki's own markup has no target (on the wiki, replacing the page IS the point). Here it threw
  // away the reader's whole board. 22 other places in this app already open content links in a new tab.
  const out = prepareBoxHtml('<ul><li><a href="/wiki/Weddell_Sea">Weddell Sea</a></li></ul>');
  assert.ok(out.includes('target="_blank"'), out);
  assert.ok(out.includes('rel="noopener noreferrer"'), out);
  assert.ok(out.includes('href="https://en.wikipedia.org/wiki/Weddell_Sea"'), 'and the URL is still absolute');
});

test('a box may ask for something else, and is left alone', () => {
  const out = openBoxLinksNewTab('<a href="https://x/y" target="_self">x</a>');
  assert.equal((out.match(/target=/g) || []).length, 1, out);
  assert.ok(out.includes('target="_self"'));
});

test('the new-tab rewrite survives the sanitiser (it runs first, deliberately)', () => {
  // Order matters: sanitise-then-rewrite would have the attribute stripped as unknown.
  const out = prepareBoxHtml('<a href="/wiki/X">x</a>');
  assert.ok(out.includes('target="_blank"'), 'the attribute must not be filtered out');
  assert.ok(!/onclick/i.test(out));
});

test('closing tags stay closing tags', () => {
  // The bug this caught: `</p>` was re-emitted as `<p>`, doubling every element while the text still read fine.
  const clean = sanitizeBoxHtml('<div><p>a</p><ul><li>b</li></ul></div>');
  assert.equal((clean.match(/<p>/g) || []).length, 1);
  assert.equal((clean.match(/<\/p>/g) || []).length, 1);
  assert.equal((clean.match(/<li>/g) || []).length, 1);
  assert.equal((clean.match(/<\/li>/g) || []).length, 1);
  assert.equal(clean, '<div><p>a</p><ul><li>b</li></ul></div>');
});

test('a project name is not mistaken for a host just because it contains a dot', () => {
  assert.equal(new URL(boxApiUrl({ project: 'en.wikipedia', box: 'X' })).hostname, 'en.wikipedia.org');
  assert.equal(new URL(boxApiUrl({ project: 'de.wikipedia', box: 'X' })).hostname, 'de.wikipedia.org');
  assert.equal(new URL(boxApiUrl({ project: 'en.wikipedia.org', box: 'X' })).hostname, 'en.wikipedia.org');
  assert.ok(new URL(boxApiUrl({ project: 'en.wikisource', box: 'X' })).hostname === 'en.wikisource.org');
});

test('javascript: and data: URLs are refused', () => {
  const clean = sanitizeBoxHtml('<a href="javascript:alert(1)">x</a><img src="data:image/png;base64,AAA">');
  assert.ok(!/javascript:/.test(clean), clean);
  assert.ok(!/data:/.test(clean), clean);
});

test('fragments survive, and the sanitiser is idempotent (no duplication or drift)', () => {
  const once = sanitizeBoxHtml('<div class="a"><a href="#cite_note-1">[1]</a><p>text</p></div>');
  assert.ok(once.includes('href="#cite_note-1"'));
  assert.equal(sanitizeBoxHtml(once), once, 'running the sanitiser twice must change nothing');
  assert.equal((once.match(/<p>/g) || []).length, 1, 'exactly one paragraph, not two');
});

test('media tags a box actually uses are kept', () => {
  const clean = sanitizeBoxHtml('<div class="thumbinner"><img src="/x.jpg" alt="a"><div class="thumbcaption">cap</div></div>');
  assert.ok(clean.includes('<div') && clean.includes('<img') && clean.includes('thumbcaption'));
});

// ── the CSS filter: the box may style itself, nothing else ───────────────────────────────────────

test('scoped rules are kept and page-level rules are dropped', () => {
  const css = '.mw-parser-output .itn-img{float:right} body{background:red} html{margin:0} .unrelated{x:1}';
  const out = filterScopedCss(css);
  assert.ok(out.includes('.mw-parser-output .itn-img'));
  assert.ok(!/body\{/.test(out) && !/html\{/.test(out) && !/\.unrelated/.test(out), out);
});

test('a mixed selector list is refused whole, not half-applied', () => {
  const out = filterScopedCss('.mw-parser-output .a, body .b { color: red }');
  assert.equal(out.trim(), '', 'a rule that could reach outside is not kept at all');
});

test('@media wrappers survive with scoped rules inside them, and die without', () => {
  const kept = filterScopedCss('@media (min-width:600px){.mw-parser-output .x{display:block}}');
  assert.ok(kept.includes('@media (min-width:600px)') && kept.includes('.mw-parser-output .x'), kept);
  const dropped = filterScopedCss('@media print{body{display:none}}');
  assert.equal(dropped.trim(), '');
});

test('@font-face and @keyframes are dropped with their bodies', () => {
  const out = filterScopedCss('@font-face{font-family:x;src:url(https://evil/f.woff)} .mw-parser-output .a{color:red}');
  assert.ok(!/font-face|evil/.test(out), out);
  assert.ok(out.includes('.mw-parser-output .a'));
});

test('comments are stripped and nested rules do not duplicate', () => {
  const out = filterScopedCss('/* note */ .mw-parser-output .a{color:red} /* another */');
  assert.equal((out.match(/color:red/g) || []).length, 1, out);
  assert.ok(!out.includes('/*'), out);
});

// ── assets ────────────────────────────────────────────────────────────────────────────────────────

test('only Wikimedia hosts count as box assets', () => {
  for (const ok of ['https://upload.wikimedia.org/a.jpg', 'https://thumb.wikimedia.org/b.jpg',
    'https://en.wikipedia.org/x.png', 'https://commons.wikimedia.org/y']) {
    assert.equal(isAllowedBoxAsset(ok), true, ok);
  }
  for (const bad of ['https://evil.example/a.jpg', 'http://upload.wikimedia.org/a.jpg', 'javascript:alert(1)',
    'https://notwikimedia.org.evil.com/a.jpg']) {
    assert.equal(isAllowedBoxAsset(bad), false, bad);
  }
});

// ── what a click means (ISSUE-91) ────────────────────────────────────────────────────────────────

test('a clicked link names a page, from the URL not the display text', () => {
  // The display text of a piped link can be prose; the *title* is what a consumer can act on.
  const t = boxLinkTarget('https://en.wikipedia.org/wiki/Weddell_Sea', 'the Weddell Sea');
  assert.equal(t.title, 'Weddell Sea');
  assert.equal(t.kind, 'article');
  assert.equal(t.text, 'the Weddell Sea');
  assert.equal(boxLinkSelection('https://en.wikipedia.org/wiki/Weddell_Sea'), 'Weddell Sea');
});

test('underscores, percent-encoding and fragments are all handled', () => {
  assert.equal(boxLinkSelection('https://en.wikipedia.org/wiki/Sea_of_Japan'), 'Sea of Japan');
  assert.equal(boxLinkSelection('https://en.wikipedia.org/wiki/C%C3%B4te_d%27Ivoire'), "Côte d'Ivoire");
  assert.equal(boxLinkSelection('https://en.wikipedia.org/wiki/Weddell_Sea#Geography'), 'Weddell Sea');
  assert.equal(boxLinkSelection('/wiki/Mediterranean_Sea'), 'Mediterranean Sea', 'relative links still name a page');
});

test('namespaces are reported, not silently treated as articles', () => {
  assert.equal(boxLinkTarget('https://en.wikipedia.org/wiki/File:X.jpg').kind, 'file');
  assert.equal(boxLinkTarget('https://en.wikipedia.org/wiki/Category:Seas').kind, 'category');
  assert.equal(boxLinkTarget('https://en.wikipedia.org/wiki/Template:Seas').kind, 'template');
  assert.equal(boxLinkTarget('https://example.org/whatever').kind, 'external');
  assert.equal(boxLinkSelection('https://example.org/whatever', 'Somewhere'), 'Somewhere',
    'an off-wiki link still has a title worth passing on');
});

test('nothing to select yields null rather than an empty selection', () => {
  assert.equal(boxLinkSelection(''), null);
  assert.equal(boxLinkSelection(null), null);
  assert.equal(boxLinkSelection('https://en.wikipedia.org/wiki/'), null);
});

// ── what the widget emits ─────────────────────────────────────────────────────────────────────────

test('the box emits its items as plain lines', () => {
  const html = '<div><ul><li>First <b>item</b> &amp; more</li><li>Second</li><li> </li></ul></div>';
  assert.deepEqual(boxLines(html), ['First item & more', 'Second'], 'tags gone, entities decoded, blanks dropped');
});

test('a box with no list still emits its text rather than nothing', () => {
  assert.deepEqual(boxLines('<p>Just a paragraph.</p>'), ['Just a paragraph.']);
  assert.deepEqual(boxLines(''), []);
});

test('the real box has items to emit', { skip: !realResponse }, () => {
  const lines = boxLines(prepareBoxHtml(splitBoxHtml(realResponse).body));
  assert.ok(lines.length >= 5, `expected several news items, got ${lines.length}`);
  assert.ok(lines.every((l) => !/[<>]/.test(l)), 'no markup leaks into an emitted line');
});

// ── the real thing, when the measurement cache is present ─────────────────────────────────────────

const cacheDir = join(process.cwd(), 'cache');
const realResponse = (() => {
  if (!existsSync(cacheDir)) return null;
  for (const f of readdirSync(cacheDir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const body = readFileSync(join(cacheDir, f), 'utf8');
      if (body.includes('itn-img') || body.includes('current-events')) {
        const html = JSON.parse(body).parse?.text;
        if (html) return html;
      }
    } catch { /* not an API response */ }
  }
  return null;
})();

test('the real In-the-news response survives the whole path', { skip: !realResponse }, () => {
  const { styles, body } = splitBoxHtml(realResponse);
  const clean = sanitizeBoxHtml(rewriteBoxUrls(body, { wikiBase: 'https://en.wikipedia.org' }));
  assert.ok(styles.length >= 1, 'TemplateStyles travel inline with the markup');
  assert.ok(clean.length > 1000, `the box should keep its content (${clean.length} chars)`);
  assert.equal((clean.match(/href="\/(?!\/)/g) || []).length, 0, 'no root-relative hrefs survive');
  assert.equal((clean.match(/(href|src)="\/\//g) || []).length, 0, 'no protocol-relative URLs survive');
  assert.equal(/<script/i.test(clean), false);
  assert.equal((clean.match(/ on[a-z]+=/gi) || []).length, 0);
  assert.ok((clean.match(/<li/g) || []).length > 5, 'the items are there');
  assert.ok((clean.match(/<img/g) || []).length >= 1, 'and the picture is there');
  // the styles must come through the filter intact enough to do their job
  const css = filterScopedCss(styles.join('\n'));
  assert.ok(css.includes('.mw-parser-output'), 'scoped selectors survive');
  assert.ok(!/(^|\n)\s*(html|body|:root)\s*\{/.test(css), 'and nothing page-level gets through');
});

/* ── ISSUE-100: the mobile strip, and the relay that undoes it ─────────────────────────────────── */

test('wikiBox: the mobile strip has an exact signature, not a guess', () => {
  // Measured 2026-09-16: the same action=parse request returns 22,820 bytes / 161 links for a desktop
  // User-Agent and 5,780 bytes / 0 links for an iPhone one. MobileFrontend removes `.navbox` and leaves its
  // stylesheet behind — which is the tell.
  const stripped = '<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr"><div class="navbox-styles"></div>\n\n\n</div>';
  const full = '<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr"><div class="navbox-styles">.navbox{}</div><div class="navbox"><table class="nowraplinks hlist navbox-inner"><tr><th class="navbox-title">x</th></tr></table></div></div>';
  assert.equal(boxWasStrippedForMobile(stripped), true);
  assert.equal(boxWasStrippedForMobile(full), false);
  // the navbox stylesheet's own CSS text must not be mistaken for the element (it lives in a <style>, not a class)
  assert.equal(boxWasStrippedForMobile('<style>.navbox-styles{display:none}</style><div class="navbox">x</div>'), false);
  // a box that simply has no navbox at all is NOT stripped — every other box in the corpus (POTD, In the news,
  // the selected anniversaries, infoboxes) came back byte-identical on a phone UA, so this stays targeted
  assert.equal(boxWasStrippedForMobile('<div class="thumb"><img src="x"></div>'), false);
  assert.equal(boxWasStrippedForMobile(''), false);
  assert.equal(boxWasStrippedForMobile(null), false);
});

test('wikiBox: the relay URL is a pure function of the API URL', () => {
  const api = boxApiUrl({ project: 'en.wikipedia', box: 'List of seas' });
  const relay = boxRelayUrl(api);
  assert.match(relay, /^\/api\/proxy\?url=/);
  assert.equal(decodeURIComponent(relay.split('url=')[1]), api, 'round trip');
  assert.equal(boxRelayUrl(''), '');
  assert.equal(boxRelayUrl(null), '');
});

// ISSUE-123 — the page side of the Wikipedia Box. Measured on the Met article: the lead is 33 KB of HTML and 107
// clickable links against 880 KB and 3,178 for the whole page, which is why "blank" means the lead.
test('a page URL addresses a title, with or without a section', () => {
  const whole = pageApiUrl({ project: 'en.wikipedia', page: 'Metropolitan Museum of Art' });
  assert.match(whole, /action=parse/);
  assert.match(whole, /page=Metropolitan\+Museum\+of\+Art/);
  assert.match(whole, /section=0/, 'no section means THE LEAD — 33 KB, 107 links, against 880 KB and 3,178 for the page');
  assert.match(pageApiUrl({ project: 'en.wikipedia', page: 'X', section: '0' }), /section=0/);
  assert.equal(/section=/.test(pageApiUrl({ project: 'en.wikipedia', page: 'X', section: 'all' })), false);
  assert.match(pageApiUrl({ project: 'en.wikipedia', page: 'X', section: '  ' }), /section=0/, 'whitespace is the lead too');
  assert.throws(() => pageApiUrl({ project: 'en.wikipedia', page: '  ' }), /page title/);
  assert.match(pageSectionsApiUrl({ project: 'de.wikipedia', page: 'X' }), /de\.wikipedia\.org/);
});

test('a heading name resolves to the index the parse API wants — or refuses with the names it has', () => {
  const sections = [{ index: '1', line: 'Collections' }, { index: '5', line: 'Asian art' }];
  assert.equal(resolveSectionIndex(sections, 'asian art').index, '5', 'matching ignores case');
  assert.equal(resolveSectionIndex(sections, '  Asian Art  ').index, '5', 'and surrounding whitespace');
  assert.equal(resolveSectionIndex(sections, '3').index, '3', 'a number passes through');
  assert.equal(resolveSectionIndex(sections, '').index, null, 'blank is the whole page');
  assert.equal(resolveSectionIndex(sections, 'all').index, null);
  const miss = resolveSectionIndex(sections, 'Egyptian art');
  assert.equal(miss.index, null);
  assert.match(miss.error, /no section called "Egyptian art"/);
  assert.deepEqual(miss.names, ['Collections', 'Asian art'], 'the refusal names the alternatives');
});
