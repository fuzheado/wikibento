/**
 * Generate public/manifest.json — the machine-readable widget catalog used by
 * (a) the /api/ask relay's system prompt (server-owned, so the LLM only ever
 * sees this source of truth) and (b) the client-side local smart-search
 * fallback (src/lib/askLocal.js).
 *
 * The registry (src/widgets/index.js) is a plain object literal with
 * consistent 2-space formatting; this script extracts each entry's metadata
 * without importing it (the registry pulls in JSX, so plain node can't load
 * it). Run as part of `npm run build` (BEFORE vite build so Vite copies the
 * file from public/ into dist/).
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
  SparqlCard: 'query',
  MarkdownCard: 'embed', WikiPageCard: 'embed',
};

// Shared config-field constants referenced inside configFields arrays
// (e.g. CIM_CATEGORY_FIELD). Resolve them from their `const` definitions.
const constFields = {};
for (const m of src.matchAll(/const\s+(\w+)\s*=\s*\{\s*key:\s*'(\w+)'[\s\S]*?type:\s*'(\w+)'/g)) {
  constFields[m[1]] = { key: m[2], type: m[3] };
}

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
    else if (c === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const block = src.slice(i, j + 1);
  if (!/name:\s*'/.test(block)) continue; // skip helper objects (e.g. CIM_CATEGORY_FIELD)

  const q = (field) => { const f = block.match(new RegExp(`${field}:\\s*'([^']*)'`)); return f ? f[1] : undefined; };
  const renderer = q('renderer');
  const configFields = [];
  const cfRe = /\{\s*key:\s*'(\w+)'[\s\S]*?type:\s*'(\w+)'/g;
  let cf;
  while ((cf = cfRe.exec(block)) !== null) configFields.push({ key: cf[1], type: cf[2] });
  // Resolve constant references (CIM_CATEGORY_FIELD etc.) inside configFields.
  for (const ref of block.matchAll(/configFields:\s*\[([^\]]*)\]/g)) {
    for (const ident of ref[1].matchAll(/\b([A-Z][A-Z0-9_]+)\b/g)) {
      if (constFields[ident[1]] && !configFields.some((f) => f.key === constFields[ident[1]].key)) {
        configFields.push(constFields[ident[1]]);
      }
    }
  }
  // Top-level default keys (for pre-filling configs) — depth-aware so the
  // closing brace is found regardless of indentation style.
  const defaults = [];
  const dStart = block.indexOf('defaults: {');
  if (dStart !== -1) {
    let depth = 1;
    let k = block.indexOf('{', dStart);
    let end = k + 1;
    for (; end < block.length && depth > 0; end++) {
      const c = block[end];
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) break; }
    }
    const dBody = block.slice(k + 1, end);
    for (const d of dBody.matchAll(/^\s+(\w+):/gm)) {
      if (!defaults.includes(d[1])) defaults.push(d[1]);
    }
  }
  const description = q('description');
  if (!description) continue;
  widgets.push({
    id,
    name: q('name') || id,
    icon: q('icon') || '📦',
    description,
    dataSource: q('dataSource') || '',
    category: q('category') || '',
    type: TYPE_BY_RENDERER[renderer] || 'stat',
    intensity: q('intensity') || 'low',
    experimental: /experimental:\s*true/.test(block),
    configFields,
    defaults,
  });
}

if (widgets.length < 25) {
  console.error(`manifest generation failed: only ${widgets.length} widgets extracted (expected ≥ 25)`);
  process.exit(1);
}

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  widgetCount: widgets.length,
  widgets,
};

await writeFile(join(root, 'public/manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`manifest.json: ${widgets.length} widgets → public/manifest.json`);
