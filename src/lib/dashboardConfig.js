/**
 * Dashboard config: canonical format definition + validation + example.
 *
 * The dashboard format is: { version, widgets: [...], layout: [...] }
 * Full spec: docs/JSON-FORMAT.md (schema: docs/dashboard.schema.json)
 */

import { WIDGET_TYPES } from '../widgets';
import { widgetDef } from '../widgets';

export const CONFIG_VERSION = 1;

/** Minimum sensible refresh interval (seconds) — protects the APIs. */
// The floor lives in `configNormalize.js` since 2026-10-02 (it is enforced there, for every intake path) and is
// re-exported here because this is where callers have always imported it from.
export { MIN_REFRESH_SECONDS } from './configNormalize';
import { MIN_REFRESH_SECONDS } from './configNormalize';

// ── Example dashboard: one of every widget type, real working assets ──

export const EXAMPLE_DASHBOARD = {
  version: CONFIG_VERSION,
  widgets: [
    {
      id: 'example-markdown',
      widgetType: 'markdown',
      config: {
        text: '# Welcome to WikiBento\n\nA drag-and-drop dashboard for **Wikimedia** — add widgets, drag them around, and share your board with a link.\n\n- 📊 **Article Pageviews** — 30-day traffic\n- 🏆 **Top 10 Wikipedias** — biggest language editions\n- 🖼️ **File Usage by Wiki** — where a Commons file is used\n\n> Edit any widget with ⚙. Export/import your board as JSON, or share it via 🔗.',
        refreshSeconds: 86400,
      },
    },
    {
      id: 'example-toppages',
      widgetType: 'topPages',
      config: {
        lang: 'en',
        dateMode: 'latest',
        topN: 10,
        filterNoise: true,
        refreshSeconds: 3600,
      },
    },
    {
      id: 'example-pageviews',
      widgetType: 'pageviews',
      config: { article: 'Main_Page', project: 'en.wikipedia', displayMode: 'stat', refreshSeconds: 3600 },
    },
    {
      id: 'example-linkcount',
      widgetType: 'linkcount',
      config: { domain: 'Libretexts.org', wiki: 'en.wikipedia', refreshSeconds: 3600 },
    },
    {
      id: 'example-category',
      widgetType: 'categorySize',
      config: { category: 'Images from Wiki Loves Monuments 2024', wiki: 'commons.wikimedia', sampleCount: 6, refreshSeconds: 3600 },
    },
    {
      id: 'example-wikistats',
      widgetType: 'wikistats',
      config: { table: 'wikipedias', lang: 'en', refreshSeconds: 7200 },
    },
    {
      id: 'example-fileusage',
      widgetType: 'fileUsage',
      config: { filename: 'The Earth seen from Apollo 17.jpg', topN: 10, showImage: true, showCaption: true, refreshSeconds: 3600 },
    },
    {
      id: 'example-topwikis',
      widgetType: 'topWikipedias',
      config: { refreshSeconds: 7200 },
    },
    {
      id: 'example-glam',
      widgetType: 'glamorgan',
      config: {
        category: 'Featured pictures on Wikimedia Commons',
        depth: 0,
        year: new Date().getFullYear(),
        month: new Date().getMonth() === 0 ? 12 : new Date().getMonth(),
        negcats: '',
        negdepth: 0,
        fileBudget: 300,
        topN: 5,
        showDetail: true,
        refreshSeconds: 7200,
      },
    },
    {
      id: 'example-excerpt',
      widgetType: 'excerpt',
      config: { article: 'Albert Einstein', project: 'en.wikipedia', refreshSeconds: 3600 },
    },
    {
      id: 'example-quality',
      widgetType: 'quality',
      config: { article: 'Albert Einstein', project: 'en.wikipedia', refreshSeconds: 3600 },
    },
    {
      id: 'example-assessments',
      widgetType: 'assessments',
      config: { article: 'Albert Einstein', project: 'en.wikipedia', topN: 8, refreshSeconds: 3600 },
    },
    {
      id: 'example-edithistory',
      widgetType: 'edithistory',
      config: { article: 'Albert Einstein', project: 'en.wikipedia', limit: 10, refreshSeconds: 3600 },
    },
    {
      id: 'example-gallery',
      widgetType: 'gallery',
      config: { article: 'Albert Einstein', project: 'en.wikipedia', displayMode: 'grid', iconSize: 'medium', minSize: 200, maxItems: 0, refreshSeconds: 3600 },
    },
    {
      id: 'example-panorama',
      widgetType: 'panorama360',
      config: { filename: "File:'Imiloa grounds 360 Degree View (20220329 Hilo Planetarium HQ-CC2).jpg", project: 'commons.wikimedia', autoRotate: false, refreshSeconds: 3600 },
    },
    {
      id: 'example-filegallery',
      widgetType: 'gallery',
      config: { from: 'list', files: 'File:The Earth seen from Apollo 17.jpg\nFile:Airplane vortex edit.jpg\nFile:Albert Einstein Head.jpg', order: 'listed', displayMode: 'grid', iconSize: 'medium', imageFit: 'contain', maxItems: 0, refreshSeconds: 3600 },
    },
    {
      id: 'example-articlelist',
      widgetType: 'articleList',
      config: { articles: 'Ada Lovelace\nAlbert Einstein', project: 'en.wikipedia', enrich: true, maxItems: 0, refreshSeconds: 3600 },
    },
 {
  id: 'example-sparql',
  widgetType: 'sparql',
  config: { preset: 'multi-institution', query: '', endpoint: 'wdqs', renderer: 'auto', maxRows: 100, refreshSeconds: 1800 },
 },
 {
  id: 'example-wikipage',
  widgetType: 'wikiPage',
  config: { page: 'Help:Introduction', project: 'en.wikipedia', mobile: false, fragment: '', refreshSeconds: 3600 },
 },
 {
  id: 'example-cimsnapshot',
  widgetType: 'cimSnapshot',
  config: { category: 'Files from the Biodiversity Heritage Library', scope: 'deep', month: 0, refreshSeconds: 3600 },
 },
 {
  id: 'example-cimtrend',
  widgetType: 'cimTrend',
  config: { category: 'Files from the Biodiversity Heritage Library', scope: 'deep', wiki: 'all-wikis', months: 6, month: 0, refreshSeconds: 3600 },
 },
 {
  id: 'example-cimtopfiles',
  widgetType: 'cimTopFiles',
  config: { category: 'Files from the Biodiversity Heritage Library', scope: 'deep', wiki: 'all-wikis', month: 0, topN: 10, refreshSeconds: 3600 },
 }, {
  id: 'example-cimfiletraffic',
  widgetType: 'cimFileTraffic',
  config: { filename: 'Dogs, jackals, wolves, and foxes (Plate XI).jpg', wiki: 'all-wikis', months: 12, month: 0, refreshSeconds: 3600 },
 },
 {
  id: 'example-list',
  widgetType: 'listSource',
  config: { title: 'Curated articles', items: 'Ada Lovelace\nAlbert Einstein\nAlan Turing\nGrace Hopper', refreshSeconds: 86400 },
 },
 {
  id: 'example-filter',
  widgetType: 'filterLines',
  config: { source: 'example-list', pattern: 'einstein', match: 'contains', caseSensitive: false, refreshSeconds: 86400 },
 },
 {
  id: 'example-count',
  widgetType: 'lineCount',
  config: { source: 'example-filter', label: 'matched articles', refreshSeconds: 86400 },
 },
 {
  id: 'example-echo',
  widgetType: 'echo',
  config: { source: 'example-count', title: 'Final count', refreshSeconds: 86400 },
 },
 {
  id: 'example-list-articles',
  widgetType: 'articleList',
  config: { articles: '{{widget:example-list}}', project: 'en.wikipedia', enrich: true, refreshSeconds: 3600 },
 },

  ],
  layout: [
    { i: 'example-markdown', x: 0, y: 0, w: 12, h: 4, minW: 3, minH: 3 },
    { i: 'example-pageviews', x: 0, y: 4, w: 3, h: 4, minW: 2, minH: 3 },
    { i: 'example-linkcount', x: 3, y: 4, w: 3, h: 3, minW: 2, minH: 2 },
    { i: 'example-category', x: 6, y: 4, w: 3, h: 4, minW: 2, minH: 3 },
    { i: 'example-fileusage', x: 9, y: 4, w: 3, h: 5, minW: 2, minH: 4 },
    { i: 'example-toppages', x: 0, y: 8, w: 4, h: 5, minW: 3, minH: 4 },
    { i: 'example-wikistats', x: 4, y: 8, w: 3, h: 3, minW: 2, minH: 2 },
    { i: 'example-topwikis', x: 7, y: 8, w: 5, h: 4, minW: 3, minH: 3 },
    { i: 'example-glam', x: 0, y: 13, w: 12, h: 6, minW: 3, minH: 4 },
    { i: 'example-excerpt', x: 0, y: 19, w: 6, h: 5, minW: 3, minH: 3 },
    { i: 'example-quality', x: 6, y: 19, w: 3, h: 6, minW: 2, minH: 4 },
    { i: 'example-assessments', x: 9, y: 19, w: 3, h: 6, minW: 2, minH: 4 },
    { i: 'example-edithistory', x: 0, y: 24, w: 12, h: 5, minW: 3, minH: 3 },
    { i: 'example-gallery', x: 0, y: 29, w: 12, h: 7, minW: 3, minH: 4 },
    { i: 'example-panorama', x: 0, y: 36, w: 6, h: 4, minW: 3, minH: 2 },
    { i: 'example-filegallery', x: 6, y: 36, w: 6, h: 5, minW: 3, minH: 3 },
    { i: 'example-articlelist', x: 0, y: 40, w: 6, h: 4, minW: 3, minH: 3 },
  { i: 'example-sparql', x: 6, y: 40, w: 6, h: 5, minW: 3, minH: 3 },
 { i: 'example-wikipage', x: 0, y: 45, w: 12, h: 6, minW: 3, minH: 3 },
 { i: 'example-cimsnapshot', x: 0, y: 51, w: 4, h: 4, minW: 3, minH: 3 },
 { i: 'example-cimtrend', x: 4, y: 51, w: 4, h: 4, minW: 3, minH: 3 },
 { i: 'example-cimtopfiles', x: 8, y: 51, w: 4, h: 6, minW: 3, minH: 3 },
  { i: 'example-cimfiletraffic', x: 0, y: 57, w: 6, h: 5, minW: 3, minH: 3 },
 { i: 'example-list', x: 0, y: 62, w: 3, h: 5, minW: 2, minH: 3 },
 { i: 'example-filter', x: 3, y: 62, w: 3, h: 5, minW: 2, minH: 3 },
 { i: 'example-count', x: 6, y: 62, w: 3, h: 3, minW: 2, minH: 3 },
 { i: 'example-echo', x: 9, y: 62, w: 3, h: 3, minW: 2, minH: 3 },
 { i: 'example-list-articles', x: 0, y: 67, w: 12, h: 4, minW: 3, minH: 3 },
  ],
};

// ── Validation ──────────────────────────────────────────────
// Returns { valid, errors, warnings, widgets, layout }.
// Errors block the import; warnings are non-fatal (auto-fixed or ignored).

export function validateDashboard(input) {
  const errors = [];
  const warnings = [];
  // The severity model's middle row, as its own list (2026-10-02, ISSUE-134). `errors` refuse the board; `repairs` are
  // what the app normalises for the reader and reports; `warnings` are judgements about a board that will load. The two
  // were one list before, which is why "the app will read this as 200" and "this category has no CIM data" arrived in
  // the same shape — and why the board doctor could not tell a repair from a warning either.
  const repairs = [];

  let parsed = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch (e) {
      return { valid: false, errors: [`Not valid JSON: ${e.message}`], warnings: [], repairs: [], widgets: null, layout: null, params: null };
    }
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, errors: ['Dashboard must be a JSON object like { "widgets": [...], "layout": [...] }'], warnings: [], repairs: [], widgets: null, layout: null, params: null };
  }

  const { widgets, layout } = parsed;
  if (!Array.isArray(widgets)) errors.push('"widgets" must be an array');
  if (!Array.isArray(layout)) errors.push('"layout" must be an array');
  if (errors.length) return { valid: false, errors, warnings, repairs, widgets: null, layout: null, params: null };

  if (parsed.version !== undefined && parsed.version !== CONFIG_VERSION) {
    errors.push(`Unsupported "version": ${JSON.stringify(parsed.version)} (this app supports version ${CONFIG_VERSION})`);
  }

  // ── params ── (ISSUE-50: Board Controls declares them; widgets reference {{name}})
  // This block was validated and then *not returned* until 2026-10-01, so ⬆ Import silently dropped a parameterised
  // board's switcher and every {{param}} card read "Waiting for a reference". The Ask audit found it by pasting an
  // assembled params board (docs/ASK-ARCHITECTURE.md). Light on purpose: Board Controls is the editor, so the shape is
  // checked and the grammar is reported, but a working board is never refused here.
  let params = null;
  // `"params": null` is how this app's own Export writes a board that has none (public/*.json carry it), so null means
  // absent — treating it as a type error refused every parameterless exported board (caught by the demos constitution).
  if (parsed.params !== undefined && parsed.params !== null) {
    if (!parsed.params || typeof parsed.params !== 'object' || Array.isArray(parsed.params)) {
      errors.push('"params" must be an object of named specs');
    } else {
      params = parsed.params;
      const names = Object.keys(params);
      if (names.length > 8) warnings.push(`"params" declares ${names.length} parameters — the panel is built for a handful`);
      names.forEach((name) => {
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) warnings.push(`params."${name}": a name outside [A-Za-z0-9_-] cannot be referenced as {{${name}}}`);
      });
    }
  }

  // ── widgets ──
  const ids = new Set();
  widgets.forEach((w, idx) => {
    const where = `widgets[${idx}]`;
    if (!w || typeof w !== 'object' || Array.isArray(w)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    if (typeof w.id !== 'string' || !w.id.trim()) {
      errors.push(`${where}: "id" must be a non-empty string`);
    } else if (ids.has(w.id)) {
      errors.push(`${where}: duplicate id "${w.id}"`);
    } else {
      ids.add(w.id);
      // ISSUE-53: ids are the instance names widgets are referenced by
      // ({{widget:id}} interpolation + the source picker) — warn when an id
      // can't be referenced that way (never block the import).
      if (!/^[a-zA-Z0-9_-]+$/.test(w.id)) {
        warnings.push(`${where}: id "${w.id}" uses characters outside [A-Za-z0-9_-] — other widgets can't reference it via {{widget:id}} or the source picker (rename it in ⚙)`);
      }
    }
    if (typeof w.widgetType !== 'string') {
      errors.push(`${where}: "widgetType" must be a string`);
    } else if (!widgetDef(w.widgetType)) {
      errors.push(`${where}: unknown widgetType "${w.widgetType}" (known: ${Object.keys(WIDGET_TYPES).join(', ')})`);
    } else {
      validateWidgetConfig(w, widgetDef(w.widgetType), where, errors, warnings, repairs);
    }
  });

  // ── layout ──
  const layoutIds = new Set();
  layout.forEach((item, idx) => {
    const where = `layout[${idx}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    if (typeof item.i !== 'string') {
      errors.push(`${where}: "i" must be a string matching a widget id`);
    } else if (layoutIds.has(item.i)) {
      errors.push(`${where}: duplicate layout entry for "${item.i}"`);
    } else {
      layoutIds.add(item.i);
    }
    ['x', 'y', 'w', 'h'].forEach(k => {
      if (typeof item[k] !== 'number' || !Number.isFinite(item[k])) {
        errors.push(`${where}: "${k}" must be a number`);
      }
    });
    if (typeof item.w === 'number' && (item.w < 1 || item.w > 12)) {
      warnings.push(`${where}: "w" out of range 1-12 (${item.w}) — will be clamped by the grid`);
    }
    if (typeof item.h === 'number' && item.h < 1) {
      warnings.push(`${where}: "h" must be ≥ 1`);
    }
    if (item.minW !== undefined && (typeof item.minW !== 'number' || item.minW < 1)) {
      errors.push(`${where}: "minW" must be a number ≥ 1`);
    }
    if (item.minH !== undefined && (typeof item.minH !== 'number' || item.minH < 1)) {
      errors.push(`${where}: "minH" must be a number ≥ 1`);
    }
  });

  // ── cross-references ──
  widgets.forEach(w => {
    if (w.id && !layoutIds.has(w.id)) {
      warnings.push(`Widget "${w.id}" has no layout entry — it will be auto-placed`);
    }
  });
  // ISSUE-51: a widget's `source` should reference a widget actually on the
  // board. Non-fatal warning — a link to a missing id shows the empty state.
  widgets.forEach(w => {
    const def = widgetDef(w.widgetType);
    const field = (def?.configFields || []).find((f) => f.type === 'source');
    const src = field && w.config && typeof w.config[field.key] === 'string' ? w.config[field.key] : '';
    if (src && !ids.has(src)) {
      warnings.push(`Widget "${w.id}" feeds from "${src}" (${field.label}) — no widget with that id is on the board; it will show its empty state until connected`);
    }
  });
  [...layoutIds].forEach(id => {
    if (!ids.has(id)) {
      errors.push(`Layout entry "${id}" does not match any widget id`);
    }
  });

  return { valid: errors.length === 0, errors, warnings, repairs, widgets, layout, params };
}

/** Check one widget's config against its registry configFields. */
function validateWidgetConfig(w, def, where, errors, warnings, repairs = []) {
  const c = w.config;
  if (c === undefined) {
    repairs.push(`${where}: missing "config" — the registry's defaults are used`);
    return;
  }
  if (typeof c !== 'object' || c === null || Array.isArray(c)) {
    errors.push(`${where}: "config" must be an object`);
    return;
  }
  const fieldMap = {};
  (def.configFields || []).forEach(f => { fieldMap[f.key] = f; });

  // `wiki` is not a field of this widget — it is read as `project` (normalizeConfigForDef repairs it). Say so, because
  // it changes *which wiki* the card reads: the silent version showed a different project with no warning at all.
  if (c.wiki !== undefined && fieldMap.project && c.project === undefined && String(c.wiki).trim()) {
    warnings.push(`${where}: config "wiki" is not a field of this widget — read as "project" (${JSON.stringify(String(c.wiki).trim())})`);
  }
  for (const [key, field] of Object.entries(fieldMap)) {
    const v = c[key];
    if (v === undefined || v === null || v === '') continue; // missing → widget default
    switch (field.type) {
      case 'number':
        if (typeof v === 'string' && /^\{\{\s*[a-zA-Z0-9_-]+\s*\}\}$/.test(v)) {
          break; // board-param placeholder (ISSUE-50) — resolved at fetch time; skip numeric checks
        }
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          // A *repair*, not a refusal (2026-10-02, ISSUE-134, the owner's call). `coerceFieldValue` reads a numeric
          // string and leaves an unreadable one exactly as written — which is what docs/JSON-FORMAT.md has always
          // said the app does, and what AGENTS.md means by "coerce by the registry's declared field type". Refusing
          // the whole board over `"200"` contradicted both, and it is precisely the traffic a board from a chat
          // brings (the door: `npm run check:board`, and `/api/validate`).
          const readable = typeof v === 'string' && Number.isFinite(Number(String(v).trim()));
          repairs.push(readable
            ? `${where}: config "${key}" is the string ${JSON.stringify(v)} — read as the number ${Number(String(v).trim())}`
            : `${where}: config "${key}" is not a number (${JSON.stringify(v)}) — left as written; the card may ignore it or show nothing`);
        } else if (field.min !== undefined && (v < field.min || v > field.max)) {
          warnings.push(`${where}: config "${key}" is ${v} — out of range ${field.min}–${field.max} (clamped to ${Math.min(Math.max(v, field.min), field.max)})`);
        }
        break;
      case 'boolean': {
        if (typeof v !== 'boolean') {
          // `!!"False"` is `true`, which is why the coercer knows the words (and why this is worth saying out loud
          // rather than refusing: the board renders as the registry says, and the reader is told what was read).
          const t = String(v).trim().toLowerCase();
          const readable = ['true', 'yes', '1', 'on', 'false', 'no', '0', 'off', ''].includes(t);
          repairs.push(readable
            ? `${where}: config "${key}" is ${JSON.stringify(v)} — read as ${['true', 'yes', '1', 'on'].includes(t)}`
            : `${where}: config "${key}" is not true or false (${JSON.stringify(v)}) — left as written; a non-empty string counts as true`);
        }
        break;
      }
      case 'select':
        // An option is a string, because a <select> yields strings — but a hand-written board may write
        // `"rate": 1` for the option `"1"`, which is the same choice, not an error. Compare numerically when
        // both sides are numbers, so the rule stays "the value must be one of the options" without punishing
        // JSON that a human typed. (The panel always writes the string form, so a round-tripped board is exact.)
        if (!field.options.some(o => o.value === v
          || (o.value !== '' && v !== '' && Number.isFinite(Number(o.value)) && Number.isFinite(Number(v))
              && Number(o.value) === Number(v)))) {
          // An option list is a vocabulary, and a value outside it is unreadable *as that vocabulary* — but the card
          // still has a default (every renderer resolves an unknown mode to something), so this is a warning that
          // names the options rather than a refusal. A typo is still visible; a board is not thrown away over it.
          repairs.push(`${where}: config "${key}" is "${v}", which is not one of ${field.options.map(o => o.value).join(', ')} — the card will use its default`);
        }
        break;
      default: // text
        if (typeof v !== 'string') {
          // Numbers and booleans in a text field are usually intended (a year, a label) and render as their string
          // form; an object renders as "[object Object]", which the message names.
          const shape = Array.isArray(v) ? 'a list' : (v && typeof v === 'object' ? 'an object' : `a ${typeof v}`);
          repairs.push(`${where}: config "${key}" expects text but holds ${shape} (${JSON.stringify(v).slice(0, 40)}) — read as its string form`);
        }
    }
  }

  if (c.refreshSeconds !== undefined) {
    // A rate rule, not a value rule — and it is ENFORCED now (`normalizeConfigForDef` raises it to the floor for every
    // intake path, which is what makes accepting the board safe rather than merely polite). The message says what
    // happened; before 2026-10-02 the board was refused and the floor was never applied at all.
    const secs = Number(c.refreshSeconds);
    if (!Number.isFinite(secs) || secs <= 0) {
      repairs.push(`${where}: "refreshSeconds" is ${JSON.stringify(c.refreshSeconds)} — the card will use its default`);
    } else if (secs < MIN_REFRESH_SECONDS) {
      warnings.push(`${where}: "refreshSeconds" is ${secs}s — raised to the ${MIN_REFRESH_SECONDS}s floor (Wikimedia's APIs are not ours to poll harder)`);
    }
  }
  if (c._title !== undefined && typeof c._title !== 'string') {
    repairs.push(`${where}: "_title" is not text (${JSON.stringify(c._title)}) — the card will use its own title`);
  }

  // Unknown keys are tolerated (forward compatibility) but flagged.
  const known = new Set([...Object.keys(fieldMap), 'refreshSeconds', '_title']);
  // ISSUE-53: `source` is a first-class config key on consumer widgets — but
  // only for widget types that declare a source config field. Tolerate it
  // elsewhere (forward compatibility) without flagging.
  const hasSourceField = fieldMap.source;
  Object.keys(c).forEach(k => {
    // A key the registry does not declare is DROPPED, and the reader is told — the severity model's middle row. It sat
    // in `warnings` until 2026-10-02, which made "the app ignores this key" look like a judgement call.
    if (!known.has(k) && !(k === 'source' && hasSourceField)) repairs.push(`${where}: unknown config key "${k}" (ignored)`);
  });
}
