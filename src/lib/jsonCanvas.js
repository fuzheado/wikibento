/**
 * A board as a **JSON Canvas** document — the open format (jsoncanvas.org, MIT, spec 1.0 of 2024-03-11) that
 * Obsidian and a growing set of canvas tools read and write.
 *
 * Why export at all: a WikiBento board is already a JSON document, and JSON Canvas is the closest thing to a
 * standard shape for "a page of things placed in space". Writing it means a board is readable in tools we do not
 * control — which is the same argument the format makes for itself (longevity, readability, interoperability).
 *
 * What this is NOT: a renderer. JSON Canvas describes *placement and links*; our cards still fetch and render in
 * WikiBento. So this is a projection, and the projection rule is the interesting part:
 *
 *   - **A card goes in as a `link` node when it is *about* something with a URL on the web** (a wiki page, a
 *     Commons file, a Commons category, a SPARQL query), because a reader of the canvas can then follow it.
 *   - **Everything else goes in as a `text` node** describing the card. Deliberately: a wrong URL is worse than
 *     no URL, so the link cases are only those whose config key has one unambiguous meaning (see `subjectUrl`).
 *   - **Edges are the wiring.** JSON Canvas's own edges are presentation only (sides, arrowheads, labels) — and
 *     that is exactly the right use for ours, because a board *has* a real dependency graph: `{{widget:id}}`
 *     references and `source` config fields. Drawing them makes the dataflow visible in any canvas tool.
 *   - **Our own payload rides along as a foreign field.** `extras.wikibento = { widgetType, config, title }` on each
 *     node, which the format explicitly allows (unknown fields are preserved, not pruned) and which is what a future
 *     import would read. A canvas exported from here is therefore not a dead end.
 *
 * Coordinates: the board's layout is in *grid units* (12 columns, `rowHeight` 80, margin 12 — App.jsx's GridLayout),
 * JSON Canvas is in *pixels*. The conversion below is the one used by the app's own grid, so the canvas comes out at
 * the same shape the reader sees, and `toCanvas`/`fromCanvas` round-trips a layout exactly (tested).
 *
 * Pure: no React, no fetch. Unit-tested in tests/json-canvas.test.mjs.
 */

import { extractWidgetRefs } from './params.js';
import { parseRef, projectSite } from './reference.js';
import { widgetTitle } from './widgetTitle.js';
import { configFieldValue } from './configFields.js';

/** The grid the app lays boards out on (App.jsx: `cols: 12, rowHeight: 80, margin: [12, 12]`). */
export const CANVAS_GRID = { cols: 12, cellWidth: 110, rowHeight: 80, gap: 12 };

const COMMONS = 'https://commons.wikimedia.org/wiki/';
const WDQS = 'https://query.wikidata.org/';

/** Config keys whose meaning is a thing with a URL, and the URL each one makes. Order matters: first match wins. */
const LINK_KEYS = [
  { key: 'query', url: (v) => `${WDQS}#${encodeURIComponent(String(v)).slice(0, 1200)}` },
  { key: 'category', url: (v) => `${COMMONS}Category:${encodeURIComponent(String(v).replace(/^Category:/i, '').replace(/_/g, ' '))}` },
  { key: 'file', url: (v) => `${COMMONS}File:${encodeURIComponent(String(v).replace(/^File:/i, '').replace(/_/g, ' '))}` },
  { key: 'filename', url: (v) => `${COMMONS}File:${encodeURIComponent(String(v).replace(/^File:/i, '').replace(/_/g, ' '))}` },
  { key: 'page', url: pageUrl },
  { key: 'title', url: pageUrl },
  { key: 'article', url: pageUrl },
];

/** A wiki page URL from a title (or a `enwiki:Foo` reference) plus the config's project field. */
function pageUrl(value, config, projectField) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = parseRef(raw);                    // a reference carries its own project
  const project = parsed.project || config[projectField || 'project'] || config.project || config.wiki || 'en.wikipedia';
  const site = projectSite(project);
  const title = parsed.title || raw;
  if (!site || !title) return null;
  return `https://${site.host}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

/**
 * The URL a card is about, or `null`. Only *declared* fields count (`def.configFields`), and only when the field
 * applies to this config (`showIf`) — a gallery whose source is an article keeps no stale `category` that would
 * otherwise link to the wrong place.
 */
export function subjectUrl(def, config = {}) {
  const fields = def?.configFields || [];
  const applies = (field) => {
    if (!field) return false;
    if (!field.showIf) return true;
    return Object.entries(field.showIf).every(([k, want]) => {
      const allowed = Array.isArray(want) ? want : [want];
      return allowed.includes(config[k]);
    });
  };
  for (const { key, url } of LINK_KEYS) {
    const field = fields.find((f) => f.key === key);
    if (!field || !applies(field)) continue;
    const value = config[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const href = url(value, config, field.projectField);
    if (href) return { href, key };
  }
  return null;
}

/** One line for a text node: what the card is, and what it is pointed at. */
function describe(def, config, title) {
  const name = def?.name || 'Widget';
  const parts = [`**${title && title !== name ? `${name}: ${title}` : name}**`];
  const shown = (def?.configFields || [])
    .filter((f) => f.key !== '_title' && (!f.showIf || Object.entries(f.showIf).every(([k, want]) => {
      const allowed = Array.isArray(want) ? want : [want];
      return allowed.includes(config[k]);
    })))
    .map((f) => {
      const v = configFieldValue(f, config, def?.defaults || {});
      return v === undefined || v === null || v === '' ? null : `${f.label || f.key}: ${String(v).slice(0, 80)}`;
    })
    .filter(Boolean);
  if (shown.length) parts.push(shown.join(' · '));
  return parts.join('\n\n');
}

/** Grid units → pixels, using the app's own grid metrics. */
export function toCanvasBox(item) {
  const { cellWidth, rowHeight, gap } = CANVAS_GRID;
  const x = Math.max(0, Number(item?.x) || 0);
  const y = Math.max(0, Number(item?.y) || 0);
  const w = Math.max(1, Number(item?.w) || 1);
  const h = Math.max(1, Number(item?.h) || 1);
  return {
    x: x * (cellWidth + gap),
    y: y * (rowHeight + gap),
    width: w * cellWidth + (w - 1) * gap,
    height: h * rowHeight + (h - 1) * gap,
  };
}

/**
 * The board as `{ nodes, edges }`.
 *
 * @param {{widgets: object[], layout: object[], defs: object, extras?: object}} board
 *   `defs` is the registry (`WIDGET_TYPES`) — passed in rather than imported so this module stays testable
 *   without the whole registry graph, the same shape PickMenu uses for the same reason.
 * @returns {{nodes: object[], edges: object[]}} valid JSON Canvas 1.0 (asserted by the test)
 */
export function boardToCanvas({ widgets = [], layout = [], defs = {}, extras = null } = {}) {
  const byId = new Map((layout || []).map((item) => [item.i, item]));
  const placed = new Set();
  const nodes = [];

  // Cards without a layout entry are placed in a simple flow after the placed ones, rather than dropped: a card
  // missing from the export would be a silent omission, and the reader cannot tell it from a card that was never
  // there. (Auto-placed boards are a real state — see savedBoard.js on an empty layout.)
  let flowX = 0;
  let flowY = 0;
  const flowNext = () => {
    const box = toCanvasBox({ x: flowX, y: flowY, w: 3, h: 3 });
    flowX += 3;
    if (flowX >= CANVAS_GRID.cols) { flowX = 0; flowY += 3; }
    return box;
  };

  for (const w of widgets || []) {
    const def = defs[w?.widgetType];
    const config = w?.config && typeof w.config === 'object' ? w.config : {};
    const item = byId.get(w.id);
    const box = item ? toCanvasBox(item) : flowNext();
    if (item) placed.add(w.id);
    const title = widgetTitle({ def, config, fallback: w.widgetType });
    const subject = subjectUrl(def, config);
    const payload = { widgetType: w.widgetType, config, title };
    if (subject) {
      nodes.push({
        id: w.id, type: 'link', url: subject.href, ...box,
        // `label` is not part of spec 1.0's link node; it is the extension the format invites (unknown fields are
        // preserved by every conforming reader) and the only way a canvas shows *what* the link is.
        label: title, wikibento: payload,
      });
    } else {
      nodes.push({ id: w.id, type: 'text', text: describe(def, config, title), ...box, wikibento: payload });
    }
  }

  // The wiring, made visible: an edge per reference, labelled with the channel when the reference names one
  // (`{{widget:q3#speech}}` → label `speech`). Sorted so two runs of the same board produce the same file.
  const ids = new Set((widgets || []).map((w) => w.id));
  const edges = [];
  const seen = new Set();
  for (const w of widgets || []) {
    const config = w?.config && typeof w.config === 'object' ? w.config : {};
    const refs = new Set();
    for (const ref of extractWidgetRefs(config)) {
      const [target, channel] = String(ref).split('#');
      if (target && target !== w.id && ids.has(target)) refs.add(`${target}\u0000${channel || ''}`);
    }
    // A `source` field is the other way a card names a producer, and it carries no `{{ }}` at all.
    if (typeof config.source === 'string' && config.source && ids.has(config.source) && config.source !== w.id) {
      refs.add(`${config.source}\u0000`);
    }
    for (const ref of refs) {
      const [target, channel] = ref.split('\u0000');
      const id = `e-${target}-${w.id}${channel ? `-${channel}` : ''}`;
      if (seen.has(id)) continue;
      seen.add(id);
      edges.push({ id, fromNode: target, toNode: w.id, fromSide: 'right', toSide: 'left', toEnd: 'arrow', ...(channel ? { label: channel } : {}) });
    }
  }
  edges.sort((a, b) => (a.fromNode < b.fromNode ? -1 : a.fromNode > b.fromNode ? 1 : a.id < b.id ? -1 : 1));

  // The board's own surviving foreign keys travel too, so a canvas round-trips whatever a tool put beside them.
  const out = { nodes, edges };
  if (extras && typeof extras === 'object' && Object.keys(extras).length) {
    for (const [k, v] of Object.entries(extras)) if (!(k in out)) out[k] = v;
  }
  return out;
}

/** `Images_from_the_Met` → `images-from-the-met`. Used for the download name only. */
export function canvasFilename({ label = '', now = new Date() } = {}) {
  const slug = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  const stamp = now.toISOString().slice(0, 10);
  return `${slug ? `${slug}-` : ''}wikibento-${stamp}.canvas`;
}
