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

import { extractWidgetRefs } from './params';

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