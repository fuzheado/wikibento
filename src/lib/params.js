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
 *  specs: { name: { label, type, options, } } · values: { name: string } */
export function parseParams(block) {
  const specs = {};
  const values = {};
  if (!block || typeof block !== 'object') return { specs, values };
  for (const [name, raw] of Object.entries(block)) {
    if (!raw || typeof raw !== 'object') continue; // string shorthand ignored in v1
    const type = ['buttons', 'select', 'text'].includes(raw.type) ? raw.type
      : (Array.isArray(raw.options) ? 'select' : 'text');
    const options = Array.isArray(raw.options) ? raw.options.map(String) : undefined;
    let value = raw.value !== undefined ? String(raw.value)
      : (options?.length ? options[0] : '');
    if (type === 'text' && !value && typeof raw.value === 'string') value = raw.value;
    specs[name] = { label: raw.label || name, type, options };
    values[name] = value;
  }
  return { specs, values };
}

const warned = new Set();

/** Deep-resolve `{{name}}` placeholders in a widget config against `values`.
 *  Returns a NEW object when anything changed, else the original reference. */
export function resolveParams(config, values) {
  if (!config || typeof config !== 'object' || !values || typeof values !== 'object') return config;
  let changed = false;
  const walk = (v) => {
    if (typeof v === 'string') {
      const out = v.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (m, name) => {
        if (!(name in values)) {
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
