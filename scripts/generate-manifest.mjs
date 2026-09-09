/**
 * Generate public/manifest.json — the machine-readable widget catalog used by
 * (a) the /api/ask relay's system prompt (server-owned, so the LLM only ever
 * sees this source of truth) and (b) the client-side local smart-search
 * fallback (src/lib/askLocal.js).
 *
 * v3 (2026-09-09, ASK-ARCHITECTURE.md plan items 1-3):
 * - Escape-aware string reading: descriptions containing apostrophes
 *   ('Consume another widget\'s output…') are no longer truncated at the
 *   first quote (was: filterLines/lineCount/cimTrend/cimTopWikis/
 *   cimTopPages ended mid-word).
 * - Dataflow metadata per widget: nodeKind (Node Algebra role), outputs
 *   {kind} for the five emitters (registry-declared next to `emit`),
 *   consumesSource (derived: any config field of type 'source'), timeScope.
 * - Richer config fields: label / hint / placeholder now carried into the
 *   manifest (previously only key/type/options).
 *
 * The registry (src/widgets/index.js) is a plain object literal with
 * consistent formatting; this script extracts each entry's metadata without
 * importing it (the registry pulls in JSX, so plain node can't load it).
 * Run as part of `npm test` / `npm run build` (see package.json), BEFORE
 * vite build so Vite copies the file from public/ into dist/.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = await readFile(join(root, 'src/widgets/index.js'), 'utf8');

// renderer → type family (mirrors TYPE_BY_RENDERER in AddWidgetPanel.jsx —
// keep in sync when new renderers are added).
const TYPE_BY_RENDERER = {
  StatCard: 'stat', GlamCard: 'stat', CimSnapshotCard: 'stat',
  ExcerptCard: 'stat', QualityCard: 'stat',
  TrendCard: 'trend', FileTrafficCard: 'trend',
  RankingCard: 'table', TopPagesExpandedCard: 'table', EditHistoryCard: 'table',
  AssessmentsCard: 'table', ArticleListCard: 'table',
  GalleryGridCard: 'media', GalleryListCard: 'media', CimTopFilesCard: 'media',
  WaybackGalleryCard: 'media', PanoramaCard: 'media',
  SparqlCard: 'query', TranslateCard: 'query',
  MarkdownCard: 'embed', WikiPageCard: 'embed', SpeakerCard: 'embed',
  ListSourceCard: 'table', EchoCard: 'table',
};

// Default Node Algebra role when the registry entry doesn't declare one.
const DEFAULT_NODE_KIND = 'source';

// ── Escape-aware string reading ────────────────────────────────────────────
// Read a JS single- or double-quoted string whose opening quote is at
// `openIdx` in `str`. Handles backslash escapes so apostrophes inside
// descriptions ('widget\'s') don't terminate the read early.
function readQuoted(str, openIdx) {
  const quote = str[openIdx];
  let out = '';
  let i = openIdx + 1;
  while (i < str.length) {
    const c = str[i];
    if (c === '\\' && i + 1 < str.length) {
      const n = str[i + 1];
      out += n === quote || n === '\\' || n === "'" || n === '"' ? n : c + n;
      i += 2;
      continue;
    }
    if (c === quote) return { value: out, end: i };
    out += c;
    i += 1;
  }
  return { value: out, end: str.length };
}

// Extract one string-typed property (description, name, timeScope, label, …)
// from a block. Property position: start of string, after '{', or after ','.
function prop(block, name) {
  const re = new RegExp(`(^|[,\\{])\\s*${name}\\s*:\\s*(["'])`);
  const m = block.match(re);
  if (!m) return undefined;
  const quoteIdx = m.index + m[0].length - 1;
  return readQuoted(block, quoteIdx).value;
}

// ── Shared consts referenced inside entries ────────────────────────────────
// configFields constants (CIM_CATEGORY_FIELD …): const name → first {key,type}.
const constFields = {};
for (const m of src.matchAll(/const\s+(\w+)\s*=\s*\{\s*key:\s*'(\w+)'[\s\S]*?type:\s*'(\w+)'/g)) {
  constFields[m[1]] = { key: m[2], type: m[3] };
}
// Option arrays (PROJECT_OPTIONS, CIM_SCOPES, …): const name → option values.
const constArrays = {};
for (const m of src.matchAll(/const\s+(\w+)\s*=\s*\[([\s\S]*?)\n\];/g)) {
  const values = [...m[2].matchAll(/value:\s*'([^']*)'/g)].map((x) => x[1]);
  if (values.length) constArrays[m[1]] = values;
}

// Parse one configFields entry slice `{ key: …, type: …, … }`.
function parseField(slice) {
  const key = prop(slice, 'key');
  const type = prop(slice, 'type');
  if (!key) return null;
  const field = { key, type };
  for (const p of ['label', 'hint', 'placeholder']) {
    const v = prop(slice, p);
    if (v !== undefined) field[p] = v;
  }
  const om = slice.match(/options:\s*\[([\s\S]*?)\]/);
  if (om) {
    for (const v of om[1].matchAll(/value:\s*'([^']*)'/g)) field.options ??= [], field.options.push(v[1]);
  } else {
    const ref = (slice.match(/options:\s*([A-Z][A-Z0-9_]+)/) || [])[1];
    if (ref && constArrays[ref]) field.options = [...constArrays[ref]];
  }
  return field;
}

// ── Entry extraction ───────────────────────────────────────────────────────
const widgets = [];
const blockRe = /\n {2}(\w+): \{/g;
let m;
while ((m = blockRe.exec(src)) !== null) {
  const id = m[1];
  // Find the entry's closing brace: `\n  },` at 2-space indent, brace-depth aware.
  let depth = 1;
  let i = src.indexOf('{', m.index + m[0].length - 1);
  let j = i + 1;
  for (; j < src.length && depth > 0; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  const block = src.slice(i, j + 1);

  const description = prop(block, 'description');
  if (description === undefined) continue; // skip helper objects (CIM_CATEGORY_FIELD…)

  // configFields entries `{ key: '…', … }`, brace-depth aware.
  const configFields = [];
  const cfRe = /\{\s*key:\s*'(\w+)'/g;
  let cfm;
  while ((cfm = cfRe.exec(block)) !== null) {
    let depth2 = 1;
    let k = block.indexOf('{', cfm.index);
    let end = k + 1;
    for (; end < block.length && depth2 > 0; end++) {
      const c = block[end];
      if (c === '{') depth2++;
      else if (c === '}') { depth2--; if (depth2 === 0) break; }
    }
    const field = parseField(block.slice(cfm.index, end + 1));
    if (field) configFields.push(field);
  }
  // Resolve constant references (CIM_CATEGORY_FIELD etc.) inside configFields.
  for (const ref of block.matchAll(/configFields:\s*\[([^\]]*)\]/g)) {
    for (const ident of ref[1].matchAll(/\b([A-Z][A-Z0-9_]+)\b/g)) {
      if (constFields[ident[1]] && !configFields.some((f) => f.key === constFields[ident[1]].key)) {
        configFields.push(constFields[ident[1]]);
      }
    }
  }

  // Top-level default keys (for pre-filling configs).
  const defaults = [];
  const dStart = block.indexOf('defaults: {');
  if (dStart !== -1) {
    let depth3 = 1;
    let k = block.indexOf('{', dStart);
    let end = k + 1;
    for (; end < block.length && depth3 > 0; end++) {
      const c = block[end];
      if (c === '{') depth3++;
      else if (c === '}') { depth3--; if (depth3 === 0) break; }
    }
    const dBody = block.slice(k + 1, end);
    for (const d of dBody.matchAll(/^\s+(\w+):/gm)) {
      if (!defaults.includes(d[1])) defaults.push(d[1]);
    }
  }

  const renderer = prop(block, 'renderer');
  const outputsKind = (block.match(/outputs:\s*\{\s*kind:\s*'(\w+)'/) || [])[1];
  const nodeKind = (block.match(/nodeKind:\s*'(\w+)'/) || [])[1] || DEFAULT_NODE_KIND;
  const widget = {
    id,
    name: prop(block, 'name') || id,
    icon: prop(block, 'icon') || '📦',
    description,
    dataSource: prop(block, 'dataSource') || '',
    category: prop(block, 'category') || '',
    type: TYPE_BY_RENDERER[renderer] || 'stat',
    intensity: prop(block, 'intensity') || 'low',
    experimental: /experimental:\s*true/.test(block),
    timeScope: prop(block, 'timeScope') || 'point',
    nodeKind,
    consumesSource: configFields.some((f) => f.type === 'source'),
    configFields,
    defaults,
  };
  if (outputsKind) widget.outputs = { kind: outputsKind };
  widgets.push(widget);
}

if (widgets.length < 25) {
  console.error(`manifest generation failed: only ${widgets.length} widgets extracted (expected ≥ 25)`);
  process.exit(1);
}

const manifest = {
  version: 3,
  generatedAt: new Date().toISOString(),
  widgetCount: widgets.length,
  widgets,
};

await writeFile(join(root, 'public/manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`manifest.json v${manifest.version}: ${widgets.length} widgets → public/manifest.json`);
