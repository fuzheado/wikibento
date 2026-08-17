/**
 * Intent-fixture interviewer (ISSUE-44 benchmark suite).
 *
 * Interview mode for building ground-truth intents without hand-editing
 * tests/intent-fixtures.mjs. Shows a widget card (name, description,
 * source, config fields), asks the human to type a natural Ask-box phrase
 * that should select that widget, captures the pre-fill subject, validates
 * against the manifest schema, and appends the entry.
 *
 * Modes:
 *   node scripts/interview-fixtures.mjs                 interactive loop
 *   node scripts/interview-fixtures.mjs --list          coverage report
 *   node scripts/interview-fixtures.mjs --add --widget mediaPlayer \
 *        --prompt "..." [--subject "File:A.webm\nFile:B.webm"] [--id ...]
 *                                                        programmatic add
 *                                                        (agent/CI path)
 *
 * The subject question only fires for widgets with an identity field
 * (article/category/file/domain/url/lang/…); subject-less widgets
 * (topWikipedias, sparql, markdown, cimLeaderboard) skip it and produce
 * requireSubject:false entries. Entries are validated with the same
 * assertFixtureSchema the npm test uses — a bad entry never lands.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { assertFixtureSchema } from '../tests/intent-benchmark-lib.mjs';

const FIXTURES_PATH = join(process.cwd(), 'tests/intent-fixtures.mjs');
const manifest = JSON.parse(await readFile(join(process.cwd(), 'public/manifest.json'), 'utf8'));
const defs = new Map(manifest.widgets.map((w) => [w.id, w]));
const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : undefined; };

// Fresh import of the fixtures file (cache-busting query) so coverage and
// counts reflect appends made earlier in this session.
const loadFixtures = async () => {
  const { INTENT_FIXTURES: list } = await import(`${FIXTURES_PATH}?t=${Date.now()}`);
  return list;
};

// Identity field per widget: which config key the user's phrase names, and
// what kind of value it takes. 'none' → subject-less widget.
const IDENTITY = {
  pageviews: { key: 'article', kind: 'article' },
  excerpt: { key: 'article', kind: 'article' },
  edithistory: { key: 'article', kind: 'article' },
  quality: { key: 'article', kind: 'article' },
  assessments: { key: 'article', kind: 'article' },
  gallery: { key: 'article', kind: 'article' },
  articleList: { key: 'articles', kind: 'articles' },
  categorySize: { key: 'category', kind: 'category' },
  glamorgan: { key: 'category', kind: 'category' },
  cimSnapshot: { key: 'category', kind: 'category' },
  cimTrend: { key: 'category', kind: 'category' },
  cimTopFiles: { key: 'category', kind: 'category' },
  cimTopWikis: { key: 'category', kind: 'category' },
  cimTopPages: { key: 'category', kind: 'category' },
  cimTopEditors: { key: 'category', kind: 'category' },
  linkcount: { key: 'domain', kind: 'domain' },
  fileUsage: { key: 'filename', kind: 'file' },
  panorama360: { key: 'filename', kind: 'file' },
  cimFileSpotlight: { key: 'filename', kind: 'file' },
  cimFileTraffic: { key: 'filename', kind: 'file' },
  fileGallery: { key: 'files', kind: 'files' },
  mediaPlayer: { key: 'files', kind: 'files' },
  waybackGallery: { key: 'url', kind: 'url' },
  wikiPage: { key: 'page', kind: 'page' },
  wikistats: { key: 'lang', kind: 'lang' },
  topPages: { key: 'lang', kind: 'lang' },
  topWikipedias: null,
  cimLeaderboard: null,
  sparql: null,
  markdown: null,
};

const KIND_HINT = {
  article: 'an article title (spaces fine, no prefix)',
  articles: 'article titles, one per line',
  category: 'the BARE category title (no Category: prefix, no quotes)',
  domain: 'a bare domain (no https:// or www.)',
  file: 'File:Name.ext with the File: prefix',
  files: 'File:Name.ext entries, one per line, each with the File: prefix',
  url: 'a full https:// URL',
  page: 'a page title (spaces fine, no prefix)',
  lang: 'a language code',
};

const selectOptions = (widgetDef, key) =>
  ((widgetDef?.configFields || []).find((f) => f.key === key)?.options) || [];

const existingFor = async (widgetId) => (await loadFixtures()).filter((f) => f.expected.widgetType === widgetId);
const coverage = async () => {
  const fixtures = await loadFixtures();
  const covered = new Set(fixtures.map((f) => f.expected.widgetType));
  const all = manifest.widgets.map((w) => w.id);
  return { covered: all.filter((id) => covered.has(id)), uncovered: all.filter((id) => !covered.has(id)) };
};

const promptText = async (rl, q) => {
  try {
    const a = await rl.question(`\n${q}\n> `);
    return String(a).trim();
  } catch (e) {
    if (e?.code === 'ABORT_ERR') return ''; // Ctrl+D → treat as blank (quit/skip paths handle it)
    throw e;
  }
};

const buildEntry = async ({ widgetId, phrase, subject, note }) => {
  const def = defs.get(widgetId);
  if (!def) throw new Error(`unknown widget: ${widgetId}`);
  const ident = IDENTITY[widgetId];
  const config = {};
  let requireSubject = false;
  if (ident && subject !== undefined && subject !== '') {
    if (ident.kind === 'lang') {
      const opts = selectOptions(def, ident.key);
      if (opts.length && !opts.some((o) => o.toLowerCase() === String(subject).toLowerCase())) {
        throw new Error(`lang "${subject}" not in options: ${opts.join(', ')}`);
      }
    }
    config[ident.key] = String(subject);
    requireSubject = true;
  }
  const n = (await existingFor(widgetId)).length + 1;
  return {
    id: argVal('--id') || `${widgetId.toLowerCase()}-${n}`,
    prompt: phrase,
    expected: { widgetType: widgetId, config },
    requireSubject,
    note: note || `added via interview (${new Date().toISOString().slice(0, 10)})`,
  };
};

const appendEntry = async (entry) => {
  const src = await readFile(FIXTURES_PATH, 'utf8');
  const marker = '];';
  const idx = src.lastIndexOf(marker);
  if (idx === -1) throw new Error('fixtures file: closing ]; not found');
  const entryText = `  {\n    id: '${entry.id}',\n    prompt: ${JSON.stringify(entry.prompt)},\n    expected: { widgetType: '${entry.expected.widgetType}', config: ${JSON.stringify(entry.expected.config)} },\n    requireSubject: ${entry.requireSubject},\n    note: ${JSON.stringify(entry.note)},\n  },\n`;
  const next = src.slice(0, idx) + entryText + marker;
  // Validate the FULL resulting fixture list before writing anything.
  const all = await loadFixtures();
  assertFixtureSchema([...all, entry], defs);
  await writeFile(FIXTURES_PATH, next);
  return { total: all.length + 1, count: (await existingFor(entry.expected.widgetType)).length };
};

const widgetCard = (w) =>
  `── ${w.icon} ${w.name} ─${'-'.repeat(Math.max(4, 50 - w.name.length))}\n` +
  `Category: ${w.category} · Type: ${w.type}\n${w.description}\nSource: ${w.dataSource}\n` +
  `Config: ${(w.configFields || []).map((f) => `${f.key} (${f.type}${f.options ? `: ${f.options.join('|')}` : ''})`).join(' · ') || '(none)'}`;

// ── modes ────────────────────────────────────────────────────────────────
if (args.includes('--list')) {
  const { covered, uncovered } = await coverage();
  console.log(`WikiBento intent-fixture coverage: ${covered.length}/${manifest.widgets.length} widgets covered, ${uncovered.length} uncovered`);
  console.log('\nUncovered (no training data — interview these first):');
  uncovered.forEach((id, i) => { const w = defs.get(id); console.log(`  ${i + 1}. ${w.icon} ${id.padEnd(16)} ${w.name}`); });
  console.log('\nCovered:');
  console.log('  ' + covered.join(', '));
  process.exit(0);
}

if (args.includes('--add')) {
  const widgetId = argVal('--widget');
  const phrase = argVal('--prompt');
  if (!widgetId || !phrase) { console.error('--add requires --widget <id> and --prompt "…"'); process.exit(2); }
  try {
    const entry = await buildEntry({ widgetId, phrase, subject: argVal('--subject'), note: argVal('--note') });
    const { total, count } = await appendEntry(entry);
    console.log(`Saved ${entry.id} → ${total} fixtures (${widgetId} now has ${count} entries)`);
  } catch (e) { console.error(`NOT saved: ${e.message}`); process.exit(1); }
  process.exit(0);
}

// ── interactive mode ─────────────────────────────────────────────────────
const rl = createInterface({ input, output });
console.log('WikiBento intent-fixture interviewer — type phrases a user would type into the Ask box.\n');

let again = true;
while (again) {
  const { covered, uncovered } = await coverage();
  console.log(`Coverage: ${covered.length}/${manifest.widgets.length} · ${uncovered.length} uncovered\n`);
  console.log('Uncovered widgets (interview these first):');
  uncovered.forEach((id, i) => { const w = defs.get(id); console.log(`  ${i + 1}. ${w.icon} ${id}`); });
  console.log('Covered (add another variant):');
  covered.forEach((id, i) => { const w = defs.get(id); console.log(`  ${uncovered.length + i + 1}. ${w.icon} ${id}`); });

  const pick = await promptText(rl, 'Enter a number or widget id (blank to quit):');
  if (!pick) break;
  const idx = parseInt(pick, 10);
  const id = idx > 0 ? [...uncovered, ...covered][idx - 1] : pick;
  const w = defs.get(id);
  if (!w) { console.log(`unknown widget: ${pick}`); continue; }

  console.log(`\n${widgetCard(w)}\n`);
  const ident = IDENTITY[id];
  if (!ident) {
    console.log('(subject-less widget — no config pre-fill expected)');
  } else {
    console.log(`Identity field: ${ident.key} — ${KIND_HINT[ident.kind]}${ident.kind === 'lang' ? `\nOptions: ${selectOptions(w, ident.key).join(', ')}` : ''}`);
  }

  const phrase = await promptText(rl, 'Q1. Type a phrase a user would type to ask for THIS widget (natural, as if typing into the Ask box):');
  if (!phrase) { console.log('skipped'); continue; }

  let subject = '';
  if (ident) {
    subject = await promptText(rl, `Q2. Pre-fill ${ident.key} with? (${KIND_HINT[ident.kind]}; blank = no pre-fill)`);
  }
  let note = '';
  try { note = await promptText(rl, 'Q3. Optional note (why this phrasing / what to watch for):'); } catch { /* keep blank */ }

  try {
    const entry = await buildEntry({ widgetId: id, phrase, subject, note: note || undefined });
    console.log(`\nPreview:\n${JSON.stringify(entry, null, 2)}`);
    const ok = await promptText(rl, 'Save? [y/n]');
    if (ok.toLowerCase() === 'y') {
      const { total, count } = await appendEntry(entry);
      console.log(`Saved → ${total} fixtures (${id} now has ${count} entries)\n`);
    } else {
      console.log('discarded\n');
    }
  } catch (e) {
    console.log(`NOT saved: ${e.message}\n`);
  }
}
rl.close();
console.log('Done. Run `node scripts/interview-fixtures.mjs --list` for coverage, or `npm test` to re-verify.');
