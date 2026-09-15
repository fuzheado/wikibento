/**
 * A Wikisource transcription as the text layer for a Commons document — ISSUE-82, v1.1.
 *
 * A PDF or DjVu on Commons has **no text layer of its own**: the bytes carry no extractable text, and
 * Commons does not index document text. The text exists only where volunteers have transcribed the scan on
 * **Wikisource**, page by page, in the `Page:` namespace — and there it is retrievable:
 *
 *   action=query&prop=proofread|revisions&rvprop=content&rvslots=main
 *     titles=Page:EB1926 - Supplement Volume 3.pdf/434
 *   →  { proofread: { quality: 1, quality_text: "Not proofread" },
 *        revisions[0].slots.main.content: 10,737 chars of wikitext }
 *
 * One call per page returns the text AND the proofreading grade, which is what makes this honest rather than
 * merely convenient: a page at level 1 ("Not proofread") is *uncorrected OCR*, and a reader who is not told
 * that will trust it. Measured 2026-09-15: the whole of `EB1926 - Supplement Volume 3` sits at level 1 —
 * 1,208 pages bulk-imported by one user, never human-checked — so the label is the feature, not a nicety.
 *
 * This module is pure: titles in, readable text out. The wikitext is wikitext — templates, `<noinclude>`
 * headers, `<section>` markers and links are all part of the page — so `stripPageWikitext` is a considered
 * approximation, and the panel says where the text came from.
 */

/** Wikisource's page-quality grades (the API's own `quality` numbers, with its canonical wording). */
export const PROOFREAD_LABELS = {
  0: 'Without text',
  1: 'Not proofread',
  2: 'Problematic',
  3: 'Proofread',
  4: 'Validated',
};

/** How trustworthy the text is, in a phrase. Prefers the wiki's own wording. */
export function qualityLabel(quality, qualityText) {
  const text = String(qualityText || '').trim();
  if (text) return text;
  const q = Number(quality);
  return PROOFREAD_LABELS[q] || 'Unknown quality';
}

/** `File:X.pdf` → `X.pdf` (a `Page:` title carries the file name without its namespace). */
export function fileBaseName(file) {
  return String(file || '')
    .replace(/^https?:\/\/[^/]+\/wiki\//i, '')
    .replace(/^(file|image)\s*:\s*/i, '')
    .replace(/\+/g, ' ')
    .trim();
}

/** The `Page:` title for leaf `n` (1-based, as Wikisource numbers them — the same numbering as `pagecount`). */
export function pageTitleFor(file, n) {
  const base = fileBaseName(file);
  const page = Math.max(1, Math.round(Number(n) || 1));
  return base ? `Page:${base}/${page}` : '';
}

/** The `Index:` title for a file. */
export function indexTitleFor(file) {
  const base = fileBaseName(file);
  return base ? `Index:${base}` : '';
}

/**
 * Which Wikisource has transcribed this file, from a Commons `globalusage` response.
 *
 * The signal is a usage in the **Page:** namespace (104) or the **Index:** namespace (106) on a
 * `*.wikisource.org` wiki — a file merely *linked* from a Wikisource article is not a transcription
 * (measured: `File:Mozart Sonate (manuscript).djvu` is used on it.wikipedia and has no transcription;
 * `File:EB1926 - Supplement Volume 3.pdf` has 20 usages on en.wikisource, all ns104/106).
 */
export function transcriptionWiki(globalusage, fallback = '') {
  const rows = Array.isArray(globalusage) ? globalusage : [];
  for (const row of rows) {
    const ns = Number(row && row.ns);
    const wiki = String((row && row.wiki) || '');
    if ((ns === 104 || ns === 106) && /\.wikisource\.org$/.test(wiki)) return wiki.replace(/\.org$/, '');
  }
  return String(fallback || '');
}

/**
 * Wikitables → their cell text.
 *
 * Found the honest way: the unit tests used the first 520 characters of a real page and passed while the
 * whole 10 KB page leaked `{|` and `|}` into the panel — one of them contains a table. `<noinclude>`,
 * `{{rh}}` and `<section>` were handled; table syntax never was.
 */
function stripTables(text) {
  return text
    .split('\n')
    .filter((line) => !/^\s*\{\|/.test(line)          // {| … table open (with its styles)
      && !/^\s*\|\}/.test(line)                       // |} table close
      && !/^\s*\|-/.test(line))                        // |- row separator (but NOT |+ , a caption:
      //     the caption is text, and dropping it here would make the `|+` rule below dead code)
    .map((line) => line
      .replace(/^\s*\|[^|{}]*=\s*"[^"]*"\s*\|/, '')  // | style="x" | cell   → cell
      .replace(/^\s*\|\+\s*/, '')                     // |+ Caption           → Caption
      .replace(/^\s*\|\s?/, '')                        // | cell                → cell
      .replace(/\s*\|\|\s*/g, ' \u00b7 '))               // || between cells      → a separator
    .join('\n');
}

const DROP_TEMPLATES = /^(rh|running\s?header|nop|nops|gap|clear|clearleft|clearright|rule|dhr|double\s?rule|block\s?center\/(end|start)|div\s?end)$/i;
const KEEP_LAST_ARG = /^(lang|lang-[\w-]+|he|ar|ru|el|sa)$/i;

/** Expand one `{{…}}` template occurrence into its readable content (formatting templates keep their text). */
function expandTemplates(text) {
  let out = text;
  let depth = 0;
  const oneTemplate = /\{\{([^{}]*)\}\}/;
  while (depth < 12) {
    const m = out.match(oneTemplate);
    if (!m) break;
    const parts = m[1].split('|');
    const name = parts.shift().trim();
    const args = parts.filter((p) => !/^[\w\s-]+=[^=]*$/.test(p.trim()) || parts.length === 1);
    let replacement = '';
    if (!DROP_TEMPLATES.test(name)) {
      if (KEEP_LAST_ARG.test(name)) replacement = String(args[args.length - 1] || '').trim();
      else replacement = args.map((a) => a.trim()).filter(Boolean).join(' ');
    }
    out = out.slice(0, m.index) + replacement + out.slice(m.index + m[0].length);
    depth += 1;
  }
  return out;
}

/**
 * Page wikitext → the words on the page.
 *
 * Deliberately approximate, and ordered: the header/footer live in `<noinclude>` (drop), the body carries
 * `<section>` markers and templates (unwrap), and links/references keep their visible text.
 */
export function stripPageWikitext(wikitext) {
  let text = String(wikitext === null || wikitext === undefined ? '' : wikitext);
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<noinclude\b[^>]*>[\s\S]*?<\/noinclude\s*>/gi, ' ');
  text = text.replace(/<\/?includeonly\b[^>]*>/gi, '');
  text = text.replace(/<pagequality\b[^>]*\/?>/gi, ' ');
  text = text.replace(/<section\b[^>]*\/?>/gi, ' ');
  text = text.replace(/<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi, ' ');   // footnotes: not the body of the page
  text = text.replace(/<ref\b[^>]*\/>/gi, ' ');
  // Templates FIRST, tables second. The other order broke `{{rh||A|B}}` — a running head whose first
  // argument is empty — because the table rule turns `||` into a separator, leaving the template named
  // "rh · A" and its args wrong. Expanding first also handles `{{!}}`, the escaped pipe, for free.
  text = expandTemplates(text);
  text = stripTables(text);
  text = text.replace(/\[\[(file|image)\s*:[^\]]*\]\]/gi, ' ');      // embedded media
  text = text.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1');            // [[target|label]] → label
  text = text.replace(/\[\[([^\]]*)\]\]/g, '$1');                     // [[target]] → target
  text = text.replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, '$1');        // [url label] → label
  text = text.replace(/\[https?:\/\/\S*\]/g, ' ');
  text = text.replace(/<\s*br\s*\/?>/gi, '\n');
  text = text.replace(/<\s*\/\s*(p|div|poem|blockquote|li|tr)\s*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');                                // any remaining markup
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/'''?/g, '')                                             // bold/italic quotes
    // Wikitext indentation is a leading colon — and ONLY a colon. An earlier `^[:\s]+` also swallowed
    // blank lines, which silently joined paragraphs: the text still read as prose, so nothing complained.
    .replace(/^:+[ \t]*/gm, '');
  text = text
    .replace(/[ \t]+/g, ' ')
    // a space before punctuation is an artefact of the markup (dropped tags leave gaps behind)
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text;
}

/** The whole payload a page-text panel needs, from one API page object. */
export function pageTextBox(page, file, n, wiki = 'en.wikisource') {
  const title = String((page && page.title) || pageTitleFor(file, n));
  const proof = (page && page.proofread) || {};
  const revision = ((page && page.revisions) || [])[0] || {};
  const wikitext = (revision.slots && revision.slots.main && revision.slots.main.content) || '';
  const text = stripPageWikitext(wikitext);
  return {
    title,
    label: qualityLabel(proof.quality, proof.quality_text),
    quality: Number(proof.quality),
    wikitextLength: wikitext.length,
    text,
    // encodeURI, not encodeURIComponent: a wiki title keeps its `:` and `/` — Page:X.pdf/434 must not
    // become Page%3AX.pdf%2F434, which is a different (non-existent) page.
    url: `https://${String(wiki).replace(/\.org$/, '')}.org/wiki/${encodeURI(title.replace(/ /g, '_'))}`,
  };
}
