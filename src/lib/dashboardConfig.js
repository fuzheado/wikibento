/**
 * Dashboard config: canonical format definition + validation + example.
 *
 * The dashboard format is: { version, widgets: [...], layout: [...] }
 * Full spec: docs/JSON-FORMAT.md (schema: docs/dashboard.schema.json)
 */

import { WIDGET_TYPES } from '../widgets';

export const CONFIG_VERSION = 1;

/** Minimum sensible refresh interval (seconds) — protects the APIs. */
export const MIN_REFRESH_SECONDS = 30;

// ── Example dashboard: one of every widget type, real working assets ──

export const EXAMPLE_DASHBOARD = {
  version: CONFIG_VERSION,
  widgets: [
    {
      id: 'example-markdown',
      widgetType: 'markdown',
      config: {
        text: '# Welcome to WikiBento\n\nA drag-and-drop dashboard for **Wikimedia** — add widgets, drag them around, and share your board with a link.\n\n- 📊 **Article Pageviews** — 30-day traffic\n- 🏆 **Top 10 Wikipedias** — biggest language editions\n- 🖼️ **File Usage Map** — where a Commons file is used\n\n> Edit any widget with ⚙. Export/import your board as JSON, or share it via 🔗.',
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
  ],
};

// ── Validation ──────────────────────────────────────────────
// Returns { valid, errors, warnings, widgets, layout }.
// Errors block the import; warnings are non-fatal (auto-fixed or ignored).

export function validateDashboard(input) {
  const errors = [];
  const warnings = [];

  let parsed = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch (e) {
      return { valid: false, errors: [`Not valid JSON: ${e.message}`], warnings: [], widgets: null, layout: null };
    }
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, errors: ['Dashboard must be a JSON object like { "widgets": [...], "layout": [...] }'], warnings: [], widgets: null, layout: null };
  }

  const { widgets, layout } = parsed;
  if (!Array.isArray(widgets)) errors.push('"widgets" must be an array');
  if (!Array.isArray(layout)) errors.push('"layout" must be an array');
  if (errors.length) return { valid: false, errors, warnings, widgets: null, layout: null };

  if (parsed.version !== undefined && parsed.version !== CONFIG_VERSION) {
    errors.push(`Unsupported "version": ${JSON.stringify(parsed.version)} (this app supports version ${CONFIG_VERSION})`);
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
    }
    if (typeof w.widgetType !== 'string') {
      errors.push(`${where}: "widgetType" must be a string`);
    } else if (!WIDGET_TYPES[w.widgetType]) {
      errors.push(`${where}: unknown widgetType "${w.widgetType}" (known: ${Object.keys(WIDGET_TYPES).join(', ')})`);
    } else {
      validateWidgetConfig(w, WIDGET_TYPES[w.widgetType], where, errors, warnings);
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
  [...layoutIds].forEach(id => {
    if (!ids.has(id)) {
      errors.push(`Layout entry "${id}" does not match any widget id`);
    }
  });

  return { valid: errors.length === 0, errors, warnings, widgets, layout };
}

/** Check one widget's config against its registry configFields. */
function validateWidgetConfig(w, def, where, errors, warnings) {
  const c = w.config;
  if (c === undefined) {
    warnings.push(`${where}: missing "config" — defaults will be used`);
    return;
  }
  if (typeof c !== 'object' || c === null || Array.isArray(c)) {
    errors.push(`${where}: "config" must be an object`);
    return;
  }
  const fieldMap = {};
  (def.configFields || []).forEach(f => { fieldMap[f.key] = f; });

  for (const [key, field] of Object.entries(fieldMap)) {
    const v = c[key];
    if (v === undefined || v === null || v === '') continue; // missing → widget default
    switch (field.type) {
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          errors.push(`${where}: config "${key}" must be a number (got ${JSON.stringify(v)})`);
        }
        break;
      case 'boolean':
        if (typeof v !== 'boolean') {
          errors.push(`${where}: config "${key}" must be true or false (got ${JSON.stringify(v)})`);
        }
        break;
      case 'select':
        if (!field.options.some(o => o.value === v)) {
          errors.push(`${where}: config "${key}" must be one of ${field.options.map(o => o.value).join(', ')} (got "${v}")`);
        }
        break;
      default: // text
        if (typeof v !== 'string') {
          errors.push(`${where}: config "${key}" must be a string (got ${JSON.stringify(v)})`);
        }
    }
  }

  if (c.refreshSeconds !== undefined && (typeof c.refreshSeconds !== 'number' || c.refreshSeconds < MIN_REFRESH_SECONDS)) {
    errors.push(`${where}: "refreshSeconds" must be a number ≥ ${MIN_REFRESH_SECONDS} (got ${JSON.stringify(c.refreshSeconds)})`);
  }
  if (c._title !== undefined && typeof c._title !== 'string') {
    errors.push(`${where}: "_title" must be a string`);
  }

  // Unknown keys are tolerated (forward compatibility) but flagged.
  const known = new Set([...Object.keys(fieldMap), 'refreshSeconds', '_title']);
  Object.keys(c).forEach(k => {
    if (!known.has(k)) warnings.push(`${where}: unknown config key "${k}" (ignored)`);
  });
}
