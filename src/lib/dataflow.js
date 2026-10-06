/**
 * Widget-to-widget dataflow (ISSUE-51) — consumer-side helpers.
 *
 * Widgets may *emit* an output (registry `emit: (data, config) => value`)
 * and other widgets may *consume* it two ways:
 *   1. a `source` config field (a select of emitting widgets on the board) —
 *      the producer's output is passed to the consumer's transform/fetch as
 *      opts.sourceOutput (structured access);
 *   2. `{{widget:id}}` interpolation in any string field (shallow scalar /
 *      newline-joined list access — see stringifyOutput in params.js).
 *
 * Pure helpers, no React — unit-tested in tests/dataflow.test.mjs.
 */

import { extractWidgetRefs } from './params.js';   // the extension matters: scripts/docs-facts.mjs loads this module under plain node

/**
 * The output kinds a widget may publish (ISSUE-96 · ISSUE-97 — "make kinds load-bearing").
 *
 * One list with three readers, because it used to be a literal copied into two tests: the registry's `outputs`
 * declarations, a consumer source field's `kinds` (which narrows the ⚙ picker — see WidgetFrame), and the gates in
 * `tests/manifest-compliance.test.mjs`. `scripts/docs-facts.mjs` checks that `docs/WIDGET-DEVELOPMENT.md` still
 * names every one of them, so the doc cannot drift from the code.
 *
 * Adding a kind is a design act, not a label: it needs a real consumer, a doc entry, an `askManual()` phrase and a
 * size policy (WIDGET-DEVELOPMENT.md → "The Emitter Contract"). The gate in manifest-compliance makes that loud.
 */
export const OUTPUT_KINDS = ['extract', 'lines', 'count', 'value', 'speech', 'geojson'];

/**
 * The keys an `outputs` declaration reserves for METADATA (ISSUE-96): `kind` (the shape of the value the bare id
 * publishes) and `subject` (the thing that value is about, from pickMode.js's KIND_IDS). Every OTHER key is a named
 * channel — a second thing the widget publishes, addressed as `{{widget:id#channel}}` (ISSUE-91).
 *
 * One declaration, three shapes:
 *   { kind: 'lines' }                                          a single output
 *   { kind: 'lines', subject: 'cim-category' }                 …and what it is about
 *   { kind: 'extract', subject: 'article', reference: 'value' } …plus named channels
 *
 * Readers that enumerate channels must skip these keys — see outputChannels.
 */
export const OUTPUT_RESERVED_KEYS = ['kind', 'subject'];

/** The named channels of an `outputs` declaration: `{ name: kind }` — everything that is not reserved metadata. */
export function outputChannels(outputs) {
  const out = {};
  if (!outputs || typeof outputs !== 'object') return out;
  for (const [name, kind] of Object.entries(outputs)) {
    if (!OUTPUT_RESERVED_KEYS.includes(name)) out[name] = kind;
  }
  return out;
}

/** Every output kind an `outputs` declaration carries — the bare `kind` plus each named channel's kind. */
export function declaredOutputKinds(outputs) {
  if (!outputs || typeof outputs !== 'object') return [];
  const kinds = [];
  if (typeof outputs.kind === 'string') kinds.push(outputs.kind);
  for (const kind of Object.values(outputChannels(outputs))) kinds.push(kind);
  return [...new Set(kinds)];
}

/** Normalize an emitted output to an array of strings (lines):
 *  arrays → String(each); strings → trimmed non-empty lines; objects →
 *  JSON; null/undefined → []. */
export function toLines(output) {
  if (output === undefined || output === null) return [];
  if (Array.isArray(output)) return output.map((x) => String(x));
  if (typeof output === 'object') return [JSON.stringify(output)];
  return String(output).split('\n').map((s) => s.trim()).filter(Boolean);
}

/** Number of elements/lines in an emitted output: arrays → length, strings →
 *  non-empty lines, scalars/objects → 1, nothing → 0. */
export function countOf(output) {
  if (output === undefined || output === null) return 0;
  if (Array.isArray(output)) return output.length;
  if (typeof output === 'string') {
    return output.split('\n').map((s) => s.trim()).filter(Boolean).length;
  }
  return 1;
}

/** The structured value behind a widget's `source` config field, or
 *  undefined when the source is unset / not (yet) emitting. */
export function resolveSourceValue(config, widgetOutputs) {
  const id = config && typeof config.source === 'string' ? config.source.trim() : '';
  return id && widgetOutputs && id in widgetOutputs ? widgetOutputs[id] : undefined;
}

/** Change-detection signature for a consumer: the JSON of every output it
 *  references (via a `source` field or any `{{widget:id}}` in its config).
 *  WidgetFrame re-runs a consumer only when this signature changes — a
 *  producer emitting an identical value is a no-op (no refresh storms, no
 *  infinite emit→reload loops). Returns null when nothing is referenced. */
export function widgetOutputSignature(config, widgetOutputs) {
  if (!widgetOutputs || typeof widgetOutputs !== 'object') return null;
  const ids = new Set(extractWidgetRefs(config));
  if (config && typeof config.source === 'string' && config.source.trim()) {
    ids.add(config.source.trim());
  }
  const parts = [];
  for (const id of ids) {
    if (id in widgetOutputs) parts.push(`${id}:${JSON.stringify(widgetOutputs[id])}`);
  }
  return parts.length ? parts.sort().join('|') : null;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The {{widget:oldId}} token with whitespace tolerance. */
const tokenRe = (oldId) => new RegExp(`\\{\\{\\s*widget\\s*:\\s*${escapeRegExp(oldId)}(#[a-zA-Z0-9_-]+)?\\s*\\}\\}`, 'g');

/** Deep rewrite: every reference to `oldId` becomes `newId` — the `source`
 *  config field AND every {{widget:oldId}} token in any string (whitespace-
 *  tolerant). The rename-resolution engine: after a user renames a widget,
 *  every consumer on the board is repointed atomically (App applies this to
 *  all widget configs). Other keys/values are untouched. */
export function renameWidgetRefs(value, oldId, newId) {
  const re = tokenRe(oldId);
  const walk = (v) => {
    if (typeof v === 'string') return v.replace(re, `{{widget:${newId}}}`);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        out[k] = k === 'source' && val === oldId ? newId : walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(value);
}

/** How many {{widget:id}} tokens reference `id` inside a value (deep). */
export function countWidgetTokens(value, id) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'string') return (value.match(tokenRe(id)) || []).length;
  if (Array.isArray(value)) return value.reduce((a, v) => a + countWidgetTokens(v, id), 0);
  if (typeof value === 'object') return Object.values(value).reduce((a, v) => a + countWidgetTokens(v, id), 0);
  return 0;
}

/** The widgets (other than `id` itself) that reference `id` — via a `source`
 *  field or any {{widget:id}} token in their config. Used by the rename
 *  resolution dialog to say how many references will be repointed. */
export function findWidgetRefs(widgets, id) {
  const hits = [];
  for (const w of widgets || []) {
    if (!w || w.id === id) continue;
    let refs = 0;
    const cfg = w.config;
    if (cfg && typeof cfg === 'object' && cfg.source === id) refs++;
    refs += countWidgetTokens(cfg, id);
    if (refs > 0) hits.push({ id: w.id, refs });
  }
  return hits;
}