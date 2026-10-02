#!/usr/bin/env node
/**
 * The board guide — the contract for anyone writing a WikiBento board from OUTSIDE the app.
 *
 * WHY THIS FILE IS AN ASSEMBLY STEP, NOT A DOCUMENT.
 *
 * The Phase 2 audit of the Ask advisor measured the thing this file exists for. Given the *catalog* and nothing else, a
 * capable model picked the right widget 93% of the time and produced a reply the app could use **0%** of the time (48/48
 * misses) — it invented its own envelope. The catalog was never the missing piece: the SHAPE is, plus the value
 * vocabulary, plus a way to check the result.
 *
 * All of that already exists in this repository, so this script does not write a second copy of it:
 *
 *   - the prose is the repo's own spec, included VERBATIM from docs/JSON-FORMAT.md and docs/WIRING-BOARDS.md (one copy;
 *     editing either doc changes the served guide, and `--check` fails until it is regenerated);
 *   - the catalog, the gates and the value vocabularies are read from public/manifest.json, so a widget added tomorrow
 *     appears here without anyone remembering to;
 *   - the shipping chains are lifted out of docs/WIDGET-MAP.md, which is itself generated from the manifest — one copy
 *     again, and the assertion below fails loudly if that page's shape changes.
 *
 * Output is served by deploy/server.js at /board-guide.md (public/ is copied into dist/ by vite, so it ships with a
 * deploy like any other asset), and it is the same text an outside model reads before it writes anything.
 *
 * Usage:
 *   node scripts/board-guide.mjs            # write public/board-guide.md (+ the served copy of the JSON Schema)
 *   node scripts/board-guide.mjs --check    # fail if the committed file is not what the sources say
 *   npm run guide:board
 */
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Stated once, used everywhere below — and checked against the README, because a door that points at the wrong
// repository or the wrong host is worse than one with no pointers at all.
const LIVE = 'https://wikibento.toolforge.org';
const REPO = 'https://github.com/fuzheado/wikibento';
const CHECK = process.argv.includes('--check');
const read = async (p) => readFile(join(root, p), 'utf8');
const today = new Date().toLocaleDateString('en-CA');   // local date, not UTC

const readme = await read('README.md');
for (const [what, url] of [['the live host', LIVE], ['the repository', REPO]]) {
  if (!readme.includes(url)) {
    console.error(`✘ README.md does not mention ${what} (${url}) — the guide points readers at it, so fix one of the two`);
    process.exit(1);
  }
}

const manifest = JSON.parse(await read('public/manifest.json'));
const widgets = manifest.widgets;
const allowList = JSON.parse(await read('public/cim-allow-list.json'));

// `{{` cannot be written inside a JS template literal (it starts an interpolation), and the reference grammar is
// exactly what an outside producer has to copy — so the guide is assembled with a marker which is turned back into a
// brace at the end. Nothing clever: the served page shows `{{param}}`, unaltered.
const P = '@@P@@';

// The types that need THIS deployment's relay. Derived from the manifest (`relay`, which comes from `needsRelay` on
// the widget definition) — it used to be a hand-written list here, and the widget map keeps its own, which is how three
// copies of one fact drift apart. The assertion keeps the sentence from silently becoming "(none)".
const relayTypes = widgets.filter((w) => w.relay).map((w) => w.id);
if (relayTypes.length < 3) {
  console.error(`✘ expected the relay-needing types in the manifest, found ${relayTypes.length}: ${relayTypes.join(', ') || 'none'}`);
  process.exit(1);
}

// ── the prose sources: included verbatim, minus their own H1 (this file supplies it) ────────────────────────────────
const spec = await read('docs/JSON-FORMAT.md');
const wiring = await read('docs/WIRING-BOARDS.md');

/**
 * Rewrite a document's relative links to absolute ones.
 *
 * The two appended specs are repository files, and this page is served from the tool host: `](GUIDE.md)` on the door
 * pointed at <https://wikibento.toolforge.org/GUIDE.md>, which 404s — a broken pointer in the one document whose job
 * is to be the way in. Links to docs that are also SERVED here (the manifest, the schema) keep pointing at this host;
 * everything else in the repository goes to GitHub. Fragments and absolute links are left alone.
 */
const absLinks = (md) => md.replace(/\]\(([^)\s]+)\)/g, (whole, href) => {
  if (/^(https?:|mailto:|#)/.test(href)) return whole;
  const [path, frag] = href.split('#');
  if (!path) return whole;
  if (path === 'dashboard.schema.json') return `](${LIVE}/dashboard.schema.json${frag ? `#${frag}` : ''})`;
  if (path === 'manifest.json') return `](${LIVE}/manifest.json${frag ? `#${frag}` : ''})`;
  // Every other relative path is a file in the repository — .md, .js, .png, .pdf alike. The first version handled only
  // `.md`, so a link added to a doc in a different form slipped through as a 404 on this host (found 2026-10-02 by the
  // docs-facts rule that forbids relative links in a served page: it named `boardDoctor.js`).
  const rel = path.replace(/^\.\//, '').replace(/^\.\.\//, '');
  const inRepo = /^(docs|src|public|scripts|tests|deploy)\//.test(rel) ? rel : `docs/${rel}`;
  return `](${REPO}/blob/main/${inRepo}${frag ? `#${frag}` : ''})`;
});

/** Demote a document's headings one level so the two included docs nest under this file's sections. */
const demote = (md) => md.replace(/^(#+)(?=\s)/gm, '#$1');
/** The document's body from its first `##` onward — the H1 and its intro are the document's own framing. */
const body = (md) => md.slice(md.indexOf('\n## ')).trim();

// ── the catalog: one line per type, from the manifest, so ids and field names are never guessed ────────────────────
const fieldLine = (f) => {
  const bits = [`\`${f.key}\`:${f.type}`];
  if (Array.isArray(f.options) && f.options.length) {
    const vals = f.options.map((o) => (typeof o === 'string' ? o : o.value)).filter(Boolean);
    bits.push(`[${vals.slice(0, 6).join(' | ')}${vals.length > 6 ? ' | …' : ''}]`);
  }
  if (f.kinds) bits.push(`kinds:${f.kinds.join('/')}`);
  if (f.showIf) {
    const [sel, val] = Object.entries(f.showIf)[0] || [];
    if (sel) bits.push(`only when \`${sel}\` is ${Array.isArray(val) ? val.map((v) => `\`${v}\``).join(' or ') : `\`${val}\``}`);
  }
  return bits.join(' ');   // no separator glued `only when` onto the previous token
};
// The manifest's `defaults` is the list of KEYS whose value the registry supplies (not a map of values), so this reads
// it as "these fields may be omitted". Written the other way round it printed `0="category"` — the first version of
// this guide did, visible only by reading the output.
const defaultsLine = (w) => {
  const d = w.defaults;
  const keys = Array.isArray(d) ? d : Object.keys(d || {});
  if (!keys.length) return 'none — every field must be set (or left blank, where the field allows it)';
  return `may be omitted: ${keys.map((k) => `\`${k}\``).join(', ')}`;
};
/**
 * What a widget publishes, in the form a producer has to copy.
 *
 * Two shapes exist and both travel in the manifest (outputs as `kind`, or as named channels with a `primary`): with
 * channels, `{ {widget:id} }` / `source: "id"` means the PRIMARY channel, and the others are addressed as
 * `source: "id#channel"`. Saying only "publishes" hid that — and the channel grammar is the half the app's own
 * validator used to reject (2026-10-01).
 */
const publishes = (w) => {
  if (!w.outputs) return '';
  if (w.outputs.kind) return ` · publishes \`${w.outputs.kind}\` (the bare id)`;
  const prim = w.primary;
  const channels = Object.entries(w.outputs).map(([name, kind]) => `\`#${name}\` (\`${kind}\`)${name === prim ? ' ← the bare id' : ''}`);
  return ` · publishes: ${channels.join(' · ')}`;
};

const catalog = widgets.map((w) => {
  const gates = [];
  if (String(w.dataSource || '').startsWith('CIM ')) gates.push('CIM-allow-list');
  if (w.experimental) gates.push('experimental');
  if (w.intensity === 'high') gates.push('heavy (many API calls)');
  return [
    `### \`${w.id}\` — ${w.name}${gates.length ? ` · ${gates.join(' · ')}` : ''}`,
    `${w.description || ''}`,
    '',
    `- role: \`${w.nodeKind || '—'}\`${w.consumesSource ? ' · consumes another widget\'s output (a `source` field)' : ''}${publishes(w)}`,
    `- reads: ${w.dataSource || '—'}`,
    `- fields: ${(w.configFields || []).map(fieldLine).join(' · ') || '(none)'}`,
    `- defaults: ${defaultsLine(w)}`,
    '',
  ].join('\n');
}).join('\n');

// ── the two families in the catalog ────────────────────────────────────────────────────────────────────────────────
// The preamble used to say "the catalog is about Wikimedia data". That was wrong, and Andrew caught it (2026-10-02):
// a second family reads the Internet Archive. Derived from the manifest so the sentence stays true when a type is
// added or retired — and asserted, because a preamble that lists the wrong widgets is the failure this page exists to
// prevent.
const IA_NOTE = {
  iaItem: 'an Internet Archive item — its metadata, engagement views and thumbnail',
  iaBook: "a book's pages, with images and full-text search inside",
  mediaPlayer: 'audio or video — a Commons file, or a direct archive.org/download/… URL',
  waybackGallery: 'how a URL looked on given dates (Wayback Machine)',
};
const iaFamily = widgets.filter((w) => /archive\.org|wayback/i.test(w.dataSource || '')).map((w) => w.id);
// IA_NOTE is also the display ORDER (item → book → media → web archive), which reads better than manifest order for a
// list whose point is "there is more here than Wikipedia". Checked in BOTH directions: a family member with no
// description, or a description left behind by a retired type, both fail rather than sit there looking plausible.
const iaOrdered = Object.keys(IA_NOTE).filter((id) => iaFamily.includes(id));
if (iaOrdered.length < 4 || iaOrdered.length !== iaFamily.length) {
  console.error(`✘ the Internet Archive family changed (manifest: ${iaFamily.join(', ') || 'none'}; described: ${iaOrdered.join(', ') || 'none'})`
    + ' — update IA_NOTE and the preamble in this script');
  process.exit(1);
}

// ── gates: the ones an outside producer gets wrong by choosing a widget that cannot load ───────────────────────────
const cim = widgets.filter((w) => String(w.dataSource || '').startsWith('CIM ')).map((w) => w.id);
const experimental = widgets.filter((w) => w.experimental).map((w) => w.id);

// ── the shipping chains: lifted from the generated widget map so the two cannot disagree ────────────────────────────
const mapText = await read('docs/WIDGET-MAP.md');
/**
 * The introduction is the README's own opening, quoted — not a second description of the project written here (which
 * would be one more thing to keep true). It stops before the README's "no backend, no login, no proxy" sentence:
 * *this deployment* does run a relay for a few types (the map image service refuses browser-shaped requests, two other
 * sources send no CORS header), and §3 lists them. A door that repeats a claim its own §3 contradicts is worse than a
 * door with no introduction.
 */
const readmeIntro = (() => {
  // The README's opening PARAGRAPH — anchored on where it starts and on the paragraph break, not on a phrase inside it:
  // the first version pinned the last sentence (and then Andrew rewrote the paragraph, which is exactly the sort of edit
  // this extraction must survive). The sanity check is light but real: if the paragraph no longer mentions the
  // Speak/Translate chain, the guide is quoting the wrong thing and says so.
  const intro = (readme.match(/^WikiBento is a drag-and-drop[\s\S]*?(?=\n\n)/m) || [])[0];
  if (!intro || !intro.includes('ISSUE-97')) {
    console.error('✘ README.md no longer opens with the paragraph the guide quotes (expected the opening paragraph, '
      + 'ending with the Speak/Translate chain) — update the extraction in this script');
    process.exit(1);
  }
  return intro;
})();

const chains = (mapText.match(/^- \*\*Shipping chains\*\*: (.+)$/m) || [])[1];
if (!chains) {
  console.error('✘ docs/WIDGET-MAP.md has no "Shipping chains" bullet — the guide lifts it from there on purpose.');
  console.error('  Regenerate the map (`npm run map:widgets`) or fix the bullet, then run this again.');
  process.exit(1);
}

// ── the coverage assertion: every registered type is described, or nothing is written ──────────────────────────────
const missing = widgets.filter((w) => !catalog.includes(`### \`${w.id}\``)).map((w) => w.id);
if (missing.length) {
  console.error(`✘ the catalog would omit: ${missing.join(', ')} — refusing to write an incomplete guide`);
  process.exit(1);
}

const guide = `<!-- Generated by scripts/board-guide.mjs — do not edit by hand. Run \`npm run guide:board\`. -->
# Writing a WikiBento board

**Served at <${LIVE}/board-guide.md> · generated ${today} from
\`public/manifest.json\` (catalog v${manifest.version}), \`docs/JSON-FORMAT.md\`, \`docs/WIRING-BOARDS.md\` and
\`docs/WIDGET-MAP.md\`.**

This is what you read before writing a WikiBento board outside WikiBento — in a chat, in a notebook, in another tool.
It contains everything the app's ⬆ **Import** panel accepts, so a board written from this page imports with no
warnings.

**Why it exists.** WikiBento's own advisor was measured on ${widgets.length} widget types: given the catalog *alone* it
chose the right widget **93%** of the time and produced a usable envelope **0%** of the time — forty-eight replies, forty-
eight different inventions of the top-level shape. The catalog is not the hard part. **The shape is**, and the value
vocabulary, and a way to check the result. Those are the first four sections; the last two are the repository's own
specification, included verbatim.

A note on reading it: this host serves only this page, the manifest and the schema, so links to other repository
files are absolute GitHub links (§0 lists the useful ones). Reading this page never requires them.

---

## 0. What WikiBento is, if you have never seen it

${readmeIntro}

Read this page and you can write a board without ever opening the app — and if you are a model: §1 is the shape,
§2 is the field names, §6 is how to check the result before handing it over.

What a card needs is a **subject**, and the catalog is broader than it looks. Most of it reads **Wikimedia** — an
article, a Commons category or file, a Wikidata item, a wiki, a language, a Wikisource text, Wikistats — and
${iaFamily.length} types read the **Internet Archive** instead:

${iaOrdered.map((id) => `- \`${id}\` — ${IA_NOTE[id]}`).join('\n')}

A few read other public sources, which is worth knowing before choosing one: \`map\` draws Wikimedia's own map service
over **OpenStreetMap** data, \`sparql\` can go to Wikidata's WDQS *or* the third-party **QLever** endpoint, and
\`topPages\` reads a third-party pageviews mirror. Whatever a card fetches, it says so: the \`reads:\` line under every
type in §2 is the authority, and §3 lists the gates (precomputed data, relays, experimental types). So the useful half
of "which widget" is knowing what the user's subject *is* — an item in an archive counts.

**Where to read more** — this page is self-contained for *writing* a board. These are for the rest of it: what the app
looks like, and what each card is *for*.

- [The README](${REPO}#readme) — what it is, the demo boards, screenshots.
- [The GUIDE](${REPO}/blob/main/docs/GUIDE.md) — using the app: cards, the ⚙ panel, params, sharing, print.
- [The widget catalog](${REPO}/blob/main/docs/WIDGET-CATALOG.md) — every type in prose, with what each one is for.
- [**The widget map**](${REPO}/blob/main/docs/widget-map.pdf) — all ${widgets.length} types on **one page** (A4
  landscape), grouped by what you must supply, with the gates and the shipping chains. The best two minutes a human
  can spend before writing a board.
- [The board specification](${REPO}/blob/main/docs/JSON-FORMAT.md) — Appendix A here, with the repository's own
  cross-links; [wiring](${REPO}/blob/main/docs/WIRING-BOARDS.md) is Appendix B.
- Try it on a real board: <${LIVE}/?config=/demos.json> (the hub) — and the app's own Ask panel writes these boards
  from a sentence.

---

## 1. The envelope — what Import accepts

A board is one JSON object with four keys. \`widgets\` and \`layout\` are required; \`version\` and \`params\` are optional.

\`\`\`json
{
  "version": 1,
  "params": {
    "article": { "label": "Article", "type": "buttons", "options": ["Albert Einstein", "Marie Curie"], "value": "Albert Einstein" }
  },
  "widgets": [
    { "id": "lede", "widgetType": "excerpt", "config": { "article": "${P}{article}}" } },
    { "id": "views", "widgetType": "pageviews", "config": { "article": "${P}{article}}" } },
    { "id": "controls", "widgetType": "boardControls", "config": { "title": "Choose an article" } }
  ],
  "layout": [
    { "i": "lede", "x": 0, "y": 0, "w": 8, "h": 4 },
    { "i": "views", "x": 8, "y": 0, "w": 4, "h": 4 },
    { "i": "controls", "x": 0, "y": 4, "w": 12, "h": 3 }
  ]
}
\`\`\`

The four rules that decide whether that imports:

1. **\`layout\` is not optional, and every \`i\` must match a \`widget.id\` exactly.** This is the single most common miss:
   a list of widgets with \`w\`/\`h\` *inside* each widget is **not** a board (that is the shape WikiBento's own advisor
   returns to the app, which builds the layout itself) — Import wants a separate \`layout\` array.
2. **\`widgetType\` is an exact id from the catalog below** — never a name, never invented. \`\"gallery\"\`, not
   \`\"Gallery\"\` or \`\"image_gallery\"\`.
3. **\`config\` keys are the fields listed for that type**, spelled exactly. An unknown key is dropped with a warning;
   a missing one falls back to the type's default (also listed).
4. **\`${P}{param}}\` and \`${P}{widget:id}}\` are references, not values.** A \`params\` name must be declared at the
   top level, and a \`${P}{widget:…}}\` id must be a \`widget.id\` in the same board. The app resolves them at render
   time — see §5.

Accepted with a warning rather than refused: an unknown config key, an unreadable value (a number field holding
\`"twelve"\`), \`w\` outside 1–12, a params name outside \`[A-Za-z0-9_-]\`. **Refused**: a \`widgetType\` that is not
registered, a \`layout\` that is not an array, a \`params\` entry that is not an object, a malformed \`version\`. The
severity model is in §6.

**Machine-readable:** the JSON Schema for this envelope is served at
<https://wikibento.toolforge.org/dashboard.schema.json>, and the full catalog (every field, every gate, machine-readable)
at <https://wikibento.toolforge.org/manifest.json> — both with \`Access-Control-Allow-Origin: *\`, so a browser-based tool
can read them too.

## 2. The catalog — ${widgets.length} types

Ids are exact; \`fields:\` lists the config keys with their types, and \`\`[a | b]\`\` the allowed values of a select.
Where a field says \`(only when …)\` it applies to one source mode of that widget.

${catalog}
## 3. Gates — widgets that cannot load in some situations

- **CIM (Commons Impact Metrics) is precomputed for a curated allow list of ${allowList.count.toLocaleString()} Commons
  categories** (mostly GLAM, archive, museum and library collections). These types read it and **only work for a category
  on that list**: ${cim.map((id) => `\`${id}\``).join(', ')}. For any other category use \`glamorgan\` or \`categorySize\`,
  which are live and work for any category. A category outside the list is not an error in the board — the card says so
  and names the request process — but it is an empty card.
- **Needs this deployment's relay**: a few types depend on a same-origin relay that WikiBento itself runs (the map image
  service refuses browser-shaped requests; two others read sources with no CORS header). They render **in WikiBento**;
  the config is still valid anywhere. The ${relayTypes.length} are: ${relayTypes.map((id) => `\`${id}\``).join(', ')}. For a
  board meant for another host, prefer a type that reads its source directly.
- **Experimental**: ${experimental.length ? experimental.map((id) => `\`${id}\``).join(', ') : '(none declared)'} —
  shipped but not yet proven in the field; the catalog marks them and the Add-widget panel says so.
- **Heavy**: a type whose \`dataSource\` implies many upstream calls (a gallery over a large category, a page rendering a
  whole article) is marked \`heavy\` in the catalog above. Nothing forbids it; a board of them is slow.

## 4. Shipping chains — combinations that are known to work

${chains}

The rule behind them: a **card shows what it fetched**, and **nothing is wired by default**. Wiring is one field —
either a \`source\` field naming the producing widget's \`id\`, or a \`{{widget:<id>}}\` reference inside a text field.
Chains are read left to right; a consumer waits for its producer.

## 5. The two reference grammars

| written | means | where it may appear |
|---|---|---|
| \`${P}{name}}\` | the value of board parameter \`name\` (declared in \`params\`) | any string config field |
| \`${P}{widget:id}}\` | the output of another card on the board | any string field, and free-text fields |
| \`source: "id"\` | consume another card's output through the typed \`source\` field (a picker in the ⚙ panel) | only fields of type \`source\` |
| \`source: "id#channel"\` | the same, choosing WHICH output: a widget can publish more than one (the Translator publishes its text and its speech) | only the widget's own channels, as listed in its catalog entry |

An id in a reference must exist on the same board; a channel must be one the producer publishes. A dangling reference is
not repaired — the card that consumes it is dropped, with a warning, because a consumer whose producer is missing would
otherwise wait forever. (This was a real bug in the app's own validator until 2026-10-02: it treated a valid
\`id#channel\` reference as dangling and deleted the card.)

## 6. Check it before you ship it

1. **Paste it into ⬆ Import.** It validates and reports: errors that block (an unregistered type, a broken layout), and
   warnings for everything it repaired. Nothing is written to the reader's board until they accept. With a terminal,
   \`npm run check:board -- board.json\` runs the same checks before you paste anything, and says which rule each
   finding comes from — useful when the board came from a chat, where fixing it in the conversation is cheaper.
2. **Then look at it.** A board that imports cleanly can still show an empty card: a category with no CIM data, a wiki
   the field does not accept, a title that does not exist. Import validates the *shape*; the widgets validate the world,
   in their own error states.
3. **Trim nothing by hand.** The app drops config keys equal to the registry default when it *writes* a board (Export,
   share, localStorage). A board does not have to be minimal to be right.

${P}{param}} must name a declared param; ${P}{widget:id}} must name a card on the board.

---

# Appendix A — the dashboard JSON specification, included verbatim

${absLinks(demote(body(spec)))}

# Appendix B — wiring boards together, included verbatim

${absLinks(demote(body(wiring)))}
`;

const outPath = 'public/board-guide.md';
const finalGuide = guide.replaceAll(P, '{');
const existing = existsSync(join(root, outPath)) ? await read(outPath) : null;

if (CHECK) {
  if (existing !== finalGuide) {
    console.error(`✘ ${outPath} is not what its sources say — run \`npm run guide:board\``);
    console.error(`  (guide ${finalGuide.length} bytes, file ${existing === null ? 'missing' : `${existing.length} bytes`})`);
    process.exit(1);
  }
  console.log(`✔ ${outPath} matches its sources (${widgets.length} types, ${finalGuide.length} bytes)`);
  process.exit(0);
}

await writeFile(join(root, outPath), finalGuide);
// The JSON Schema is served too, so an outside tool can validate instead of parsing prose. One source
// (docs/dashboard.schema.json), one copy — regenerated here rather than duplicated by hand.
await writeFile(join(root, 'public/dashboard.schema.json'), await read('docs/dashboard.schema.json'));
console.log(`✔ ${outPath} — ${widgets.length} types, ${finalGuide.length} bytes`);
console.log('✔ public/dashboard.schema.json — served copy of docs/dashboard.schema.json');
