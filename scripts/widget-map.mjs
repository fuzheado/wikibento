#!/usr/bin/env node
/**
 * The widget map — one page that makes 42 widget types graspable (2026-10-01, asked by Andrew:
 * *"40 some widgets is hard to grasp for human being, and I'm a very visual person"*).
 *
 * It is **generated from `public/manifest.json`**, so the inventory cannot drift from the registry: the taxonomy below
 * decides *grouping* (the editorial part), while names, families, node kinds and the emit/consume facts are read out of
 * the catalog. The script fails loudly if a widget is unclassified or a group names something that no longer exists —
 * the same discipline as `docs-facts`, because a map that quietly omits the widget you just added is worse than none.
 *
 * The rationalisation, in one sentence per row: **the rows are what you must supply, the columns of the layout are what
 * you get, the colours are the Add-widget panel's own families, and the badges are the gates** — CIM needs a category
 * from the Commons Impact Metrics allow list, a few widgets need our relay server, one is alpha, nine are static (no
 * fetch), thirteen publish something another card can consume, and five consume another card's output.
 *
 *   node scripts/widget-map.mjs            # writes docs/widget-map.svg + .pdf + .png
 *   node scripts/widget-map.mjs --svg      # SVG only (no browser needed)
 *
 * The PDF/PNG need the repo's own Playwright (`playwright-core`); the SVG alone needs nothing.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SVG_ONLY = process.argv.includes('--svg');

/**
 * The rows: what you must supply, ordered from "nothing" to "a feed from another card". Every widget appears exactly
 * once — that is asserted below, and it is the whole point: the registry may grow, but nothing may go unplaced.
 */
const ROWS = [
  {
    id: 'own-text',
    label: 'Nothing but your own text',
    note: 'you bring the words (or the switch) — no subject to look up',
    ids: ['markdown', 'qrCode', 'speaker', 'translate', 'boardControls', 'listSource'],
  },
  {
    id: 'platform',
    label: 'Nothing at all — a platform-wide ranking',
    note: 'aggregate statistics about wikis and articles, no subject of yours',
    ids: ['topPages', 'topWikipedias', 'wikistats'],
  },
  {
    id: 'page',
    label: 'A page',
    note: 'an article, a template, any wiki page — you name it, the wiki is a setting',
    ids: ['pageviews', 'excerpt', 'edithistory', 'quality', 'assessments', 'articleList', 'wikiPage', 'wikiBox'],
  },
  {
    id: 'category',
    label: 'A Commons category',
    note: 'any category, walked live',
    ids: ['categorySize', 'glamorgan'],
  },
  {
    id: 'cim',
    label: 'A category in the CIM allow list',
    note: 'Commons Impact Metrics — precomputed, and only for ~1,775 registered primary categories',
    gate: 'cim',
    ids: ['cimSnapshot', 'cimTrend', 'cimTopFiles', 'cimTopWikis', 'cimTopPages', 'cimTopEditors', 'cimLeaderboard', 'cimFileSpotlight', 'cimFileTraffic'],
  },
  {
    id: 'files',
    label: 'Files & media',
    note: 'a file, a list of files, or a category/article that yields them',
    ids: ['gallery', 'fileUsage', 'mediaPlayer', 'panorama360', 'documentReader'],
  },
  {
    id: 'url',
    label: 'A URL, a domain or an archive item',
    note: 'something that lives elsewhere: a site, a domain, an archive.org identifier',
    ids: ['waybackGallery', 'linkcount', 'iaItem', 'iaBook'],
  },
  {
    id: 'query-place',
    label: 'A query or a place',
    note: 'you write the query, or give a coordinate / QID / page title',
    ids: ['sparql', 'map'],
  },
  {
    id: 'feed',
    label: "Another card's output",
    note: 'a transformer, a reducer and a readout — useless until something publishes to them',
    ids: ['filterLines', 'lineCount', 'echo'],
  },
];

/** The panel's own families — the colour key, so the map matches the Add-widget panel the reader already sees. */
const FAMILY_COLOURS = {
  'Articles': '#3b82f6',
  'Categories & GLAM': '#8b5cf6',
  'Files & Media': '#06b6d4',
  'Rankings & Platforms': '#f59e0b',
  'Content & Embeds': '#22c55e',
  'Queries & Power': '#ec4899',
  'Dataflow': '#eab308',
  'Web & History': '#14b8a6',
};

/** Facts the manifest does not carry, declared here with the reason (all verified against the registry/docs). */
const STATIC = new Set(['markdown', 'qrCode', 'boardControls', 'speaker', 'wikiPage', 'listSource', 'filterLines', 'lineCount', 'echo']); // the README's own nine
const RELAY = new Set(['map', 'topPages', 'waybackGallery']);   // /api/staticmap · top.hatnote.com · /api/wayback-gallery
const ALPHA = new Set(['waybackGallery']);                      // README: "alpha"

/** How each renderer family reads to a person — the shape of what you get. */
const SHAPE = {
  stat: { icon: '#', label: 'a number or a mini-report' },
  trend: { icon: '📈', label: 'a chart over time' },
  table: { icon: '🏆', label: 'rows: a ranking, a list, a table' },
  media: { icon: '🖼', label: 'pictures, media, a document' },
  query: { icon: '⌗', label: 'a live query result' },
  embed: { icon: '▤', label: 'a framed page or picture' },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A few names are too long for a 112 px chip; the map shows the short form (the panel keeps the full one). */
const NAME_OVERRIDES = {
  'Speaker (text-to-speech)': 'Speaker (TTS)',
  'Top Wikipedia Articles': 'Top Articles',
  'WikiProject Assessment': 'WikiProject Assess.',
  'CIM Global Leaderboard': 'CIM Leaderboard',
  'Wayback Snapshot Gallery': 'Wayback Gallery',
  '360° Panorama Viewer': '360° Panorama',
  'Video / Media Player': 'Media Player',
  'GLAM Category Usage': 'GLAM Usage (live)',
  'Article Quality (ORES)': 'Quality (ORES)',
  'Translator (MinT)': 'Translator (MinT)',
  'IA Item Stats': 'IA Item Stats',
  'CIM Category Snapshot': 'CIM Snapshot',
  'CIM Views Over Time': 'CIM Views / time',
  'CIM File Spotlight': 'CIM File Spotlight',
  'CIM File Traffic': 'CIM File Traffic',
  'CIM Top Editors': 'CIM Top Editors',
  'CIM Top Pages': 'CIM Top Pages',
  'CIM Top Files': 'CIM Top Files',
  'CIM Top Wikis': 'CIM Top Wikis',
};
const displayName = (w) => NAME_OVERRIDES[w.name] || w.name;
const shortName = (name, max = 23) => (name.length <= max ? name : `${name.slice(0, max - 1)}…`);
const dateLabel = new Date().toLocaleDateString('en-CA');   // local date, not UTC (a 23:39 session is one day, not two)

const manifest = JSON.parse(await readFile(join(root, 'public/manifest.json'), 'utf8'));
const widgets = manifest.widgets;
const byId = new Map(widgets.map((w) => [w.id, w]));

// ── the coverage assertion: every widget exactly once, and every id real ──────────────────────────────────────────
const placed = new Map();
for (const row of ROWS) {
  for (const id of row.ids) {
    if (!byId.has(id)) { console.error(`✘ the map names "${id}", which is not in the registry (${manifest.widgetCount} types)`); process.exit(1); }
    if (placed.has(id)) { console.error(`✘ "${id}" is in two rows: ${placed.get(id)} and ${row.id}`); process.exit(1); }
    placed.set(id, row.id);
  }
}
const unplaced = widgets.map((w) => w.id).filter((id) => !placed.has(id));
if (unplaced.length) {
  console.error(`✘ ${unplaced.length} widget(s) unclassified — add them to a ROWS entry in scripts/widget-map.mjs: ${unplaced.join(', ')}`);
  process.exit(1);
}
console.log(`✔ taxonomy covers ${placed.size}/${manifest.widgetCount} widget types`);

// ── the page ──────────────────────────────────────────────────────────────────────────────────────────────────────
const W = 1122;                       // A4 landscape at 96 dpi (the PDF scales it to paper)
const H = 794;
const PAD = 22;
const LEFT_W = 706;                   // the grouped inventory
const RIGHT_X = PAD + LEFT_W + 18;    // the relations panel
const RIGHT_W = W - RIGHT_X - PAD;
const svg = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">`);
svg.push(`<rect width="${W}" height="${H}" fill="#0f1115"/>`);
svg.push(`<rect x="0" y="0" width="${W}" height="4" fill="#3b82f6"/>`);

svg.push(`<text x="${PAD}" y="34" fill="#f3f4f6" font-size="21" font-weight="700">WikiBento — the ${widgets.length} widget types, and how they relate</text>`);
svg.push(`<text x="${PAD}" y="52" fill="#9ca3af" font-size="10.5">Rows: what you must supply. Colours: the Add-widget panel's own families. Badges: what gates a card. Generated from public/manifest.json — ${dateLabel}</text>`);
svg.push(`<text x="${PAD}" y="67" fill="#6b7280" font-size="9.5">${widgets.length} types = 33 data-driven + 9 static · 13 publish an output another card can consume · 5 consume another card's output · 9 need a category from the Commons Impact Metrics allow list</text>`);

// rows
let y = 84;
const ROW_GAP = 6;
for (const row of ROWS) {
  const chips = row.ids.map((id) => byId.get(id));
  // Six chips to a line at 100 px keeps every row to one or two lines, which is what lets the legend band fit.
  const CW = 100;
  const CH = 23;
  const GAP = 4;
  const perLine = Math.floor((LEFT_W - 8) / (CW + GAP));
  const lines = Math.ceil(chips.length / perLine);
  const rowH = 26 + lines * (CH + GAP) + 2;
  const accent = row.gate === 'cim' ? '#8b5cf6' : '#1f2937';
  svg.push(`<rect x="${PAD}" y="${y}" width="${LEFT_W}" height="${rowH}" rx="5" fill="#161a21" stroke="#242a33"/>`);
  svg.push(`<rect x="${PAD}" y="${y}" width="4" height="${rowH}" rx="2" fill="${accent}"/>`);
  svg.push(`<text x="${PAD + 12}" y="${y + 13}" fill="#e5e7eb" font-size="10.5" font-weight="700">${esc(row.label)}</text>`);
  svg.push(`<text x="${PAD + 12}" y="${y + 23}" fill="#7f8794" font-size="8.2">${esc(row.note)}</text>`);
  const startX = PAD + 12;
  const startY = y + 27;
  chips.forEach((w, i) => {
    const cx = startX + (i % perLine) * (CW + GAP);
    const cy = startY + Math.floor(i / perLine) * (CH + GAP);
    const colour = FAMILY_COLOURS[w.category] || '#6b7280';
    const shape = SHAPE[w.type] || SHAPE.stat;
    const badges = [];
    if (STATIC.has(w.id)) badges.push('⚡');
    if (RELAY.has(w.id)) badges.push('🔌');
    if (ALPHA.has(w.id)) badges.push('α');
    if (w.outputs) badges.push('✧');
    if (w.consumesSource) badges.push('⇢');
    svg.push(`<rect x="${cx}" y="${cy}" width="${CW}" height="${CH}" rx="4" fill="#0f1115" stroke="${colour}" stroke-opacity="0.75"/>`);
    svg.push(`<rect x="${cx}" y="${cy}" width="3" height="${CH}" rx="1.5" fill="${colour}"/>`);
    svg.push(`<text x="${cx + 7}" y="${cy + 10.5}" fill="#f9fafb" font-size="8.4" font-weight="600">${esc(shortName(displayName(w), 19))}</text>`);
    svg.push(`<text x="${cx + 7}" y="${cy + 19.5}" fill="#8b93a1" font-size="7.8">${shape.icon} ${esc(badges.join(' '))}${badges.length ? ' ' : ''}<tspan fill="#5f6875">${esc(w.nodeKind)}</tspan></text>`);
  });
  y += rowH + ROW_GAP;
}

// ── relations: the dataflow graph, and how a board is wired ───────────────────────────────────────────────────────
const rx = RIGHT_X;
const relH = y - 84 - ROW_GAP;
svg.push(`<rect x="${rx}" y="84" width="${RIGHT_W}" height="${relH}" rx="5" fill="#161a21" stroke="#242a33"/>`);
svg.push(`<text x="${rx + 12}" y="100" fill="#e5e7eb" font-size="11" font-weight="700">How they relate</text>`);
svg.push(`<text x="${rx + 12}" y="113" fill="#7f8794" font-size="8.6">A card publishes a value on the board; another card reads it.</text>`);

const chain = (x0, y0, boxes, kind) => {
  let x = x0;
  boxes.forEach((label, i) => {
    const bw = Math.max(64, Math.min(104, label.length * 4.9 + 12));
    svg.push(`<rect x="${x}" y="${y0}" width="${bw}" height="19" rx="4" fill="#0f1115" stroke="#3b82f6" stroke-opacity="0.7"/>`);
    svg.push(`<text x="${x + 6}" y="${y0 + 13}" fill="#dbeafe" font-size="8.2">${esc(label)}</text>`);
    x += bw;
    if (i < boxes.length - 1) {
      svg.push(`<path d="M${x + 2} ${y0 + 9.5} L${x + 11} ${y0 + 9.5}" stroke="#60a5fa" stroke-width="1.4" marker-end="url(#arrow)"/>`);
      x += 15;
    }
  });
  // The note goes UNDER the chain: a label appended to the right is the first thing to run off the panel.
  svg.push(`<text x="${x0}" y="${y0 + 29}" fill="#6b7280" font-size="7.8">${esc(kind)}</text>`);
};

svg.push(`<defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#60a5fa"/></marker></defs>`);

let cy = 130;
svg.push(`<text x="${rx + 12}" y="${cy}" fill="#9ca3af" font-size="9" font-weight="700">SHIPPING CHAINS</text>`);
cy += 12;
chain(rx + 12, cy, ['Article Excerpt', 'Translator', 'Speaker'], 'text → language → voice');
cy += 46;
chain(rx + 12, cy, ['Text List', 'Filter Lines', 'Line Count', 'Value Display'], 'lines → a number');
cy += 46;
chain(rx + 12, cy, ['Gallery', 'Media Player', 'Article List'], 'files / lines → a card');

cy += 40;
svg.push(`<text x="${rx + 12}" y="${cy}" fill="#9ca3af" font-size="9" font-weight="700">BOARD PARAMETERS (a hub, not a chain)</text>`);
cy += 12;
svg.push(`<rect x="${rx + 12}" y="${cy}" width="120" height="20" rx="4" fill="#0f1115" stroke="#22c55e" stroke-opacity="0.7"/>`);
svg.push(`<text x="${rx + 19}" y="${cy + 13.5}" fill="#dcfce7" font-size="8.6">Board Controls</text>`);
svg.push(`<text x="${rx + 140}" y="${cy + 13.5}" fill="#86efac" font-size="9">→ {{name}} in any field</text>`);
cy += 20;
svg.push(`<text x="${rx + 12}" y="${cy + 10}" fill="#7f8794" font-size="8.4">one click re-aims every card that references it</text>`);

// A board, in four lines: what the JSON actually contains (the half the catalog cannot teach).
cy += 26;
svg.push(`<text x="${rx + 12}" y="${cy}" fill="#9ca3af" font-size="9" font-weight="700">A BOARD IS…</text>`);
cy += 11;
['widgets: {id, widgetType, config}', 'layout: {i, x, y, w, h} for each id', 'params: named inputs, used as {{name}}', 'references: source id, or {{widget:id}} in text'].forEach((line, i) => {
  svg.push(`<text x="${rx + 19}" y="${cy + 9 + i * 11.5}" fill="#cbd5e1" font-size="8.2">• ${esc(line)}</text>`);
});
cy += 60;

cy += 30;
const emitters = widgets.filter((w) => w.outputs);
svg.push(`<text x="${rx + 12}" y="${cy}" fill="#9ca3af" font-size="9" font-weight="700">THE ${emitters.length} PUBLISHERS (✧) — WHAT THEY EMIT</text>`);
cy += 12;
const kindOf = (w) => {
  if (w.outputs.kind) return w.outputs.kind;
  const primary = w.primary && w.outputs[w.primary] ? w.outputs[w.primary] : Object.values(w.outputs)[0];
  const others = Object.values(w.outputs).filter((k) => k !== primary);
  return [primary, ...others].slice(0, 2).join('/');
};
emitters.forEach((w, i) => {
  const col = i % 2;
  const line = Math.floor(i / 2);
  const x = rx + 12 + col * ((RIGHT_W - 24) / 2);
  const yy = cy + line * 14;
  svg.push(`<text x="${x}" y="${yy + 9}" fill="#d1d5db" font-size="8.2">✧ ${esc(shortName(displayName(w), 20))} <tspan fill="#6b7280">${esc(shortName(kindOf(w), 18))}</tspan></text>`);
});
cy += Math.ceil(emitters.length / 2) * 14 + 10;

const consumers = widgets.filter((w) => w.consumesSource);
svg.push(`<text x="${rx + 12}" y="${cy}" fill="#9ca3af" font-size="9" font-weight="700">THE ${consumers.length} CONSUMERS (⇢)</text>`);
cy += 11;
svg.push(`<text x="${rx + 12}" y="${cy + 9}" fill="#d1d5db" font-size="8.4">${esc(consumers.map((w) => shortName(w.name, 22)).join(' · '))}</text>`);
cy += 20;
svg.push(`<text x="${rx + 12}" y="${cy + 9}" fill="#7f8794" font-size="8.4">a ${esc('source')} field names the publisher; {{widget:id}} works in any text field</text>`);

// ── legend + footer, across the bottom ────────────────────────────────────────────────────────────────────────────
const ly = y + 6;
const LH = H - ly - PAD;
svg.push(`<rect x="${PAD}" y="${ly}" width="${W - PAD * 2}" height="${LH}" rx="5" fill="#161a21" stroke="#242a33"/>`);

// three columns: badges · families · what you get
const colA = PAD + 14;
const colB = PAD + 430;
const colC = PAD + 800;
svg.push(`<text x="${colA}" y="${ly + 15}" fill="#9ca3af" font-size="9" font-weight="700">BADGES</text>`);
const badgeText = [
  ['✧', 'publishes an output another card can consume'],
  ['⇢', 'consumes another card’s output'],
  ['⚡', 'static — renders from config, no fetch'],
  ['🔌', 'needs our relay (map image, hatnote ranking, archive CDX)'],
  ['α', 'alpha'],
];
badgeText.forEach(([b, text], i) => {
  svg.push(`<text x="${colA}" y="${ly + 30 + i * 12}" fill="#cbd5e1" font-size="8.4">${b}  ${esc(text)}</text>`);
});

svg.push(`<text x="${colB}" y="${ly + 15}" fill="#9ca3af" font-size="9" font-weight="700">FAMILIES (the Add-widget panel)</text>`);
Object.entries(FAMILY_COLOURS).forEach(([family, colour], i) => {
  const x = colB + (i % 2) * 190;
  const yy = ly + 30 + Math.floor(i / 2) * 12;
  svg.push(`<text x="${x}" y="${yy}" font-size="8.4"><tspan fill="${colour}">■</tspan> <tspan fill="#9ca3af">${esc(family)}</tspan></text>`);
});

svg.push(`<text x="${colC}" y="${ly + 15}" fill="#9ca3af" font-size="9" font-weight="700">WHAT YOU GET</text>`);
Object.values(SHAPE).forEach((s, i) => {
  const x = colC + (i % 2) * 165;
  const yy = ly + 30 + Math.floor(i / 2) * 12;
  svg.push(`<text x="${x}" y="${yy}" fill="#cbd5e1" font-size="8.4">${s.icon}  ${esc(s.label)}</text>`);
});

svg.push(`<text x="${W - PAD - 14}" y="${H - PAD - 7}" fill="#5f6875" font-size="7.6" text-anchor="end">generated by scripts/widget-map.mjs from public/manifest.json · ${dateLabel}</text>`);
svg.push('</svg>');

const svgText = svg.join('\n');
await writeFile(join(root, 'docs/widget-map.svg'), svgText);
console.log('✔ docs/widget-map.svg');

// ── the text twin: same taxonomy, greppable, and what the docs gate checks ────────────────────────────────────────
const md = [];
md.push('# The widget map — 42 types, grouped by what you must supply');
md.push('');
md.push(`*One page, generated from \`public/manifest.json\` by \`scripts/widget-map.mjs\` (${dateLabel}). The picture is`);
md.push('[widget-map.pdf](widget-map.pdf) (A4 landscape) · [widget-map.png](widget-map.png) · [widget-map.svg](widget-map.svg).*');
md.push('');
md.push('**Why this exists.** Forty-two widget types is more than a person can hold in mind, and the Add-widget panel orders');
md.push('them by *topic* — which does not answer the question a board-builder actually has: *what do I have, and what can it');
md.push('show me?* So the map groups by **what you must supply**, colours by the panel\'s own families, and badges the gates.');
md.push('');
md.push('| badge | meaning |');
md.push('|---|---|');
md.push('| ✧ | publishes an output another card can consume |');
md.push('| ⇢ | consumes another card\'s output |');
md.push('| ⚡ | static — renders from config, no fetch at all |');
md.push('| 🔌 | needs our relay server (`/api/staticmap`, the hatnote ranking, the archive CDX) |');
md.push('| α | alpha |');
md.push('');
for (const row of ROWS) {
  md.push(`## ${row.label} (${row.ids.length})`);
  md.push('');
  md.push(`*${row.note}*`);
  md.push('');
  for (const id of row.ids) {
    const w = byId.get(id);
    const badges = [];
    if (w.outputs) badges.push('✧');
    if (w.consumesSource) badges.push('⇢');
    if (STATIC.has(id)) badges.push('⚡');
    if (RELAY.has(id)) badges.push('🔌');
    if (ALPHA.has(id)) badges.push('α');
    md.push(`- **${displayName(w)}** \`${id}\` — ${w.category}, ${w.nodeKind}${badges.length ? ` ${badges.join(' ')}` : ''}: ${shortName(w.description, 150)}`);
  }
  md.push('');
}
md.push('## How they relate');
md.push('');
md.push(`- **Board parameters** — Board Controls declares \`params\`; any config field may reference \`{{name}}\`, so one click re-aims every card that uses it.`);
md.push(`- **${emitters.length} publishers (✧)**: ${emitters.map((w) => `\`${w.id}\` (${kindOf(w)})`).join(', ')}.`);
md.push(`- **${consumers.length} consumers (⇢)**: ${consumers.map((w) => `\`${w.id}\``).join(', ')} — a \`source\` field names a publisher; \`{{widget:id}}\` works in any text field.`);
md.push('- **Shipping chains**: Article Excerpt → Translator → Speaker (text → language → voice) · Text List → Filter Lines → Line Count → Value Display (lines → a number) · Gallery → Media Player / Article List (files and lines → a card).');
md.push('- The CIM row is a **gate, not a topic**: those nine widgets only answer for a category from the Commons Impact Metrics allow list (~1,775 registered primary categories; additions go through a Phabricator request). `glamorgan` next to them walks any category live — slower, but nobody\'s list has to contain it.');
md.push('');
md.push('Regenerate with `npm run map:widgets` (adds the PDF/PNG through the repo\'s Playwright; `--svg` writes just the vector).');
md.push('');
await writeFile(join(root, 'docs/WIDGET-MAP.md'), md.join('\n'));
console.log('✔ docs/WIDGET-MAP.md');

if (SVG_ONLY) process.exit(0);

// ── the PDF and a PNG preview, through the repo's own Playwright ──────────────────────────────────────────────────
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  console.error('playwright-core not resolvable — run npm install (or use --svg)');
  process.exit(2);
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  // The SVG is sized in CSS pixels (A4 landscape at 96 dpi); for PRINT it must be told to fill the sheet, or Chrome
  // lays it out at 1122 px and pushes a second, empty page — measured: 2 pages until this style was added.
  await page.setContent(`<html><head><style>
    @page { size: A4 landscape; margin: 0 }
    html, body { margin: 0; padding: 0 }
    svg { display: block; width: 100vw; height: 100vh }
  </style></head><body>${svgText}</body></html>`);
  await page.pdf({ path: join(root, 'docs/widget-map.pdf'), landscape: true, format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  await page.screenshot({ path: join(root, 'docs/widget-map.png'), fullPage: false });
} finally {
  await browser.close();
}
console.log('✔ docs/widget-map.pdf · docs/widget-map.png');
