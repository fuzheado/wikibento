/**
 * Board params (ISSUE-50 — Path A interactivity prototype).
 *
 * A dashboard may declare a top-level `params` block:
 *   { "params": { "category": { "label": "Museum", "type": "buttons"|"select"|"text",
 *                               "options": ["A","B"], "value": "A" } } }
 * Widget config string fields may reference `{{name}}`; App resolves configs
 * against the live values and bumps reloadKey so referencing widgets re-fetch.
 *
 * Design contracts (docs/ISSUES.md ISSUE-50, MODULARITY-AND-DATAFLOW §Part 3):
 *  - Resolution happens ONCE per render, before validate/fetch — the validator
 *    and select enums see resolved values.
 *  - Unknown param names are left LITERAL (with a console.warn once per name)
 *    so a typo degrades visibly but never breaks a board.
 *  - Numbers/booleans/nested structures pass through untouched.
 */

/** Normalize a dashboard `params` block → { specs, values }.
 *  specs: { name: { label, type, options, } } · values: { name: string }.
 *  Types: buttons | select | text | number (options = [min, max, step]) |
 *  month (options ignored; value = month 1–12, or 0/empty = latest available
 *  — matching the widgets' own resolveMonth/latestCimMonth semantics). */
export function parseParams(block) {
  const specs = {};
  const values = {};
  if (!block || typeof block !== 'object') return { specs, values };
  for (const [name, raw] of Object.entries(block)) {
    if (!raw || typeof raw !== 'object') continue; // string shorthand ignored in v1
    const type = ['buttons', 'select', 'text', 'number', 'month'].includes(raw.type) ? raw.type
      : (Array.isArray(raw.options) ? 'select' : 'text');
    const options = Array.isArray(raw.options) ? raw.options.map(String) : undefined;
    let value = raw.value !== undefined ? String(raw.value)
      : (type === 'month' ? '0'
        : (options?.length ? options[0] : ''));
    if (type === 'text' && !value && typeof raw.value === 'string') value = raw.value;
    specs[name] = { label: raw.label || name, type, options };
    values[name] = value;
  }
  return { specs, values };
}

const warned = new Set();

/** Human-editable one-line-per-param spec format for the Board Controls ⚙
 *  panel: `name | type | Label | option1, option2, …` (options only for
 *  buttons/select; `#` lines are comments; type defaults to select when
 *  options are present, else text). Returns a params BLOCK (same shape as
 *  the dashboard JSON `params`), minus values — the App merges live values
 *  in, preserving the current choice when it is still among the options. */
export function parseParamSpecText(text) {
  const block = {};
  const TYPES = ['buttons', 'select', 'text', 'number', 'month'];
  // number: options = "min, max, step" (e.g. `count | number | Photos | 3, 12, 1`)
  // month: no options (a Latest chip + ‹ › month stepper; value 0 = latest available)
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const parts = t.split('|').map((s) => s.trim());
    const name = parts[0];
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) continue;
    let type, label, options;
    if (parts.length >= 4) {
      [type, label, options] = [parts[1], parts[2], parts[3]]; // name | type | Label | options
    } else if (parts.length === 3) {
      if (TYPES.includes(parts[1])) { [type, label] = [parts[1], parts[2]]; } // name | type | Label
      else { [options, label] = [parts[1], parts[2]]; } // name | options | Label
    } else if (parts.length === 2) {
      if (TYPES.includes(parts[1])) type = parts[1]; // name | type
      else options = parts[1]; // name | options
    }
    const entry = { label: label || name };
    if (TYPES.includes(type)) entry.type = type;
    if (options !== undefined && options !== '') {
      entry.options = options.split(',').map((s) => s.trim()).filter(Boolean);
      if (!entry.type) entry.type = 'select';
    }
    block[name] = entry;
  }
  return block;
}

/** Inverse of parseParamSpecText — render a params block as editable spec
 *  text (for pre-filling the Board Controls ⚙ textarea). */
export function paramSpecToText(block) {
  return Object.entries(block || {}).map(([name, p]) => {
    const type = p.type || (p.options ? 'select' : 'text');
    const opts = (p.options || []).join(', ');
    return [name, type, p.label || name, opts].filter((v, i) => i < 3 || v).join(' | ');
  }).join('\n');
}

/** Deep-resolve `{{name}}` board-param placeholders — and, with the
 *  widget-output registry present (ISSUE-51, widget-to-widget dataflow),
 *  `{{widget:id}}` placeholders that interpolate another widget's emitted
 *  output. Returns a NEW object when anything changed, else the original
 *  reference (so React memo works — identity preserved for untouched configs). */
export function resolveParams(config, values, widgetOutputs) {
  if (!config || typeof config !== 'object') return config;
  const hasParams = values && typeof values === 'object' && Object.keys(values).length > 0;
  const hasOutputs = widgetOutputs && typeof widgetOutputs === 'object' && Object.keys(widgetOutputs).length > 0;
  if (!hasParams && !hasOutputs) return config;
  let changed = false;
  // {{name}} → board param · {{widget:id}} → another widget's emitted output.
  const walk = (v) => {
    if (typeof v === 'string') {
      const out = v.replace(/\{\{\s*([a-zA-Z0-9_-]+)(?::([a-zA-Z0-9_-]+))?\s*\}\}/g, (m, name, sub) => {
        if (name === 'widget') {
          if (hasOutputs && sub != null && sub in widgetOutputs) {
            changed = true;
            return stringifyOutput(widgetOutputs[sub]);
          }
          if (!warned.has(`widget:${sub}`)) {
            console.warn(`[params] no widget output named "${sub}" — leaving literal (${m})`);
            warned.add(`widget:${sub}`);
          }
          return m; // unknown widget → left literal (visible, never breaking)
        }
        if (!hasParams || !(name in values)) {
          if (!warned.has(name)) {
            console.warn(`[params] no board param named "${name}" — leaving literal (${m})`);
            warned.add(name);
          }
          return m; // unknown → left literal (visible, never breaking)
        }
        changed = true;
        return values[name];
      });
      return out;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  const resolved = walk(config);
  return changed ? resolved : config;
}

/** Interpolation string form of an emitted widget output: primitives as-is,
 *  arrays of lines joined with \n (so a list output can feed a widget's
 *  multi-line textarea, e.g. articleList.articles), objects JSON-stringified. */
export function stringifyOutput(v) {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) {
    const prim = v.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x));
    return prim ? v.map((x) => (x === null ? '' : String(x))).join('\n') : JSON.stringify(v);
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Collect the distinct `{{widget:id}}` references in a config (deep) — used
 *  by WidgetFrame to re-run a consumer when a producer's output changes. */
export function extractWidgetRefs(config) {
  const refs = new Set();
  const walk = (v) => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(/\{\{\s*widget\s*:\s*([a-zA-Z0-9_-]+)\s*\}\}/g)) refs.add(m[1]);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(config);
  return [...refs];
}

/** Placeholder grammar — the SAME pattern resolveParams substitutes. */
const REF_RE = /\{\{\s*([a-zA-Z0-9_-]+)(?::([a-zA-Z0-9_-]+))?\s*\}\}/g;

/** Find unresolved `{{...}}` placeholders in a RESOLVED config (deep).
 *
 *  resolveParams leaves unknown names literal on purpose (visible, never
 *  breaking) — but a widget that FETCHES must never send such a placeholder to
 *  an API as if it were content: MinT literally translated
 *  `{{widget:excerpt-…}}` to "¿Qué es esto?" before this guard existed.
 *  WidgetFrame refuses to fetch while any remain and shows a waiting state; the
 *  load re-runs automatically when the producer emits (content-based signature).
 *
 *  Returns [{ raw, kind: 'widget' | 'param', name }], deduped by raw token. */
export function findUnresolvedRefs(config) {
  const out = [];
  const seen = new Set();
  const walk = (v) => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(REF_RE)) {
        const raw = m[0];
        if (seen.has(raw)) continue;
        seen.add(raw);
        out.push(m[1] === 'widget' && m[2] != null
          ? { raw, kind: 'widget', name: m[2] }
          : { raw, kind: 'param', name: m[1] });
      }
      return;
    }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(config);
  return out;
}

/** Which board-param names a Board Controls card renders (ISSUE-59).
 *  `show` is a comma-separated allow-list stored in the widget config; empty or
 *  missing = every declared param (backward compatible). Unknown names are
 *  ignored and the result keeps the spec declaration order, so a card can be
 *  scoped to a subset (e.g. one card for the article, one for the language). */
export function selectParamNames(specs, show) {
  const all = Object.keys(specs || {});
  const want = String(show || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (want.length === 0) return all;
  return all.filter((n) => want.includes(n));
}

/** Human one-liner for the waiting card — e.g.
 *  `widget output "excerpt-1" (not emitted yet — or the id is unknown)`. */
export function describeUnresolvedRefs(refs) {
  if (!Array.isArray(refs) || refs.length === 0) return '';
  return refs
    .map((r) => (r.kind === 'widget'
      ? `widget output “${r.name}” (not emitted yet — or the id is unknown)`
      : `board param “${r.name}” (not defined)`))
    .join(' · ');
}
