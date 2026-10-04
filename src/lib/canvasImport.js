/**
 * Importing a JSON Canvas document as a board — the other half of `jsonCanvas.js`, and the answer to ISSUE-135
 * ("a `.canvas` is a document other people write").
 *
 * The export taught this repo the format's rule — *retain what you do not model* — and the export is what makes a
 * round trip cheap, because of one decision made there: **a node's id IS the widget's id**. So the wiring does not
 * have to be recovered from the edges at all: a card whose config says `{{widget:top-files}}` came back with its id,
 * its neighbour's id came back too, and the reference still resolves. Edges are therefore read and ignored, on
 * purpose: in JSON Canvas an edge is presentation (sides, arrowheads, a label), and after one of our own round trips
 * the real dataflow is already inside the configs. Wiring from an edge would be guessing.
 *
 * Three things are deliberately NOT invented here, because the app already has them:
 *
 * - **what a link IS** — `pickFromUrl` (`lib/pickMode.js`), the same reader the ⚙ brush click uses;
 * - **which card to spawn for it** — `typesForKind`, i.e. the widget types that declare they consume that kind;
 * - **the config that card needs** — `brushConfig`, which fills the registry defaults, points a multi-source
 *   widget's own selector at the right source, and carries the project when the thing came from a wiki.
 *
 * So a canvas link becomes exactly the card a brush click on the same link would place. That is the point: one
 * reader for "what is this URL", not a second table that would drift from the first.
 *
 * The losses, stated plainly:
 *
 * - **Layout is approximate.** Pixels to grid units is exact (the inverse of `toCanvasBox`), but a grid board cannot
 *   reproduce free 2-D placement: positions are kept where they round to a legal box, and the arrangement a reader
 *   sees survives as *order*, not as pixels.
 * - **A `file` node is usually not a file we can fetch.** In Obsidian a `file` node names a path inside a vault —
 *   meaningless here — so it becomes a Text card quoting the path unless it resolves to Commons. Inventing a URL
 *   from a vault path would produce a card that 404s and looks like our bug.
 * - **A `group` node has nowhere to go.** The board has no sections; groups are skipped and reported.
 *
 * Nothing is dropped silently: whatever was not turned into a card is named in `report`, which the ⬆ Import panel
 * shows beside the board validator's own warnings.
 */
import { widgetDef } from '../widgets/index';
import { pickFromUrl, brushConfig, typesForKind } from './pickMode';
import { CANVAS_GRID } from './jsonCanvas';

/** The four node types the spec defines. Anything else is quoted, not interpreted. */
export const CANVAS_NODE_TYPES = new Set(['text', 'file', 'link', 'group']);

/**
 * The node fields this import *reads* from each type. Everything else is carried on the card under `widget.canvas` —
 * including fields the spec defines and this board has no equivalent for, such as a node's `color`. The distinction
 * is the point: the export's rule ("retain what you do not model", which is why a canvas tool can hold a board's
 * `wikibento` payload) cuts both ways, and a first draft that listed `color` as *known* silently dropped it. The
 * test that expects a node's `color` and an invented `shape` to both survive is what forced the line.
 */
const CONSUMED_BY_TYPE = {
  text: ['text'],
  link: ['url'],
  file: ['file'],
  group: ['label'],
};
const CONSUMED_ALWAYS = ['id', 'type', 'x', 'y', 'width', 'height', 'wikibento'];

/** The node fields this import actually used for this node — everything else rides along. */
function consumedKeys(node) {
  return new Set([...CONSUMED_ALWAYS, ...(CONSUMED_BY_TYPE[String(node?.type || '')] || [])]);
}

/**
 * Which card a link becomes, per kind. A preference list, not a rule: the first type that exists in the registry
 * wins, so a registry that renames a widget degrades to the next-best card instead of producing nothing. The kind
 * vocabulary itself is `lib/pickMode.js`'s (`KIND_IDS`), because the brush already had to answer this question.
 */
const PREFERRED = {
  article: ['excerpt', 'pageviews', 'linkcount', 'edithistory', 'quality'],
  page: ['wikiPage', 'linkcount', 'pageviews'],
  'commons-file': ['fileUsage', 'mediaPlayer', 'gallery'],
  'commons-category': ['gallery', 'cimStats', 'cimRanking'],
  'commons-gallery': ['gallery'],
  'wikidata-item': ['sparql', 'map'],
  'cim-category': ['cimStats', 'cimRanking'],
};

/** Is this text (or object) a JSON Canvas document rather than a board? `nodes` say canvas, `widgets` say board. */
export function isJsonCanvas(value) {
  let doc = value;
  if (typeof value === 'string') {
    try { doc = JSON.parse(value); } catch { return false; }
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  if (Array.isArray(doc.widgets)) return false;
  return Array.isArray(doc.nodes);
}

/** A Text / Markdown card, the fallback that never loses anything. */
function markdownCard(text, widgetType = 'markdown') {
  const def = widgetDef(widgetType);
  return { widgetType: def ? def.id : 'markdown', config: { text: String(text ?? '') } };
}

/** The card for a thing a URL names, or null when the vocabulary can place nothing. */
function cardForLink(url, kinds, registry) {
  const raw = String(url || '').trim();
  if (!raw) return null;

  // A SPARQL endpoint link is a query, not a thing: the query in the fragment or `?query=` is the card's content.
  // (The spec's `link` node is a URL, and a WDQS URL is how a query travels between people.)
  if (/^https?:\/\/query\.wikidata\.org(\/|$)/i.test(raw)) {
    let query = '';
    try {
      const parsed = new URL(raw);
      query = parsed.searchParams.get('query') || '';
      if (!query && parsed.hash) query = decodeURIComponent(parsed.hash.replace(/^#/, ''));
    } catch { /* not a URL we can read — fall through to the generic reader */ }
    if (query.trim()) {
      const def = widgetDef('sparql');
      const field = (def?.configFields || []).find((f) => f.type === 'textarea');
      if (def && field) {
        return { widgetType: def.id, config: { ...(def.defaults || {}), [field.key]: query.trim() } };
      }
    }
  }

  const pick = pickFromUrl(raw);
  if (pick) {
    const card = cardForPick(pick, registry);
    if (card) return card;
  }

  // One shape `pickFromUrl` deliberately does not read: a namespace page. It returns null there because the brush's
  // vocabulary had no use for one, but a canvas link to a Commons category names something a card can show — and a
  // category is the most common thing a person links to on Commons. Commons only: `Category:` on a Wikipedia is a
  // different, larger question (which card, and what it means) and this module does not answer it.
  const cat = /^https?:\/\/commons\.wikimedia\.org\/wiki\/Category:(.+)$/i.exec(raw);
  if (cat) {
    let title = cat[1].split('#')[0];
    try { title = decodeURIComponent(title); } catch { /* keep the raw title */ }
    const card = cardForPick({ kind: 'commons-category', value: `Category:${title.replace(/_/g, ' ')}`, label: title.replace(/_/g, ' '), project: 'commons.wikimedia' }, registry);
    if (card) return card;
  }

  if (kinds) kinds.unreadable.add(raw);
  return null;
}

/** The card for a resolved thing, using the brush's own spawn path so a link and a click agree. */
function cardForPick(pick, registry) {
  const accepting = registry ? typesForKind(pick.kind, registry).map((t) => t.type) : [];
  const candidates = (PREFERRED[pick.kind] || []).filter((t) => widgetDef(t));
  const order = [...accepting.filter((t) => candidates.includes(t)), ...candidates];
  for (const type of order) {
    const def = widgetDef(type);
    const config = def ? brushConfig(def, pick.kind, pick.value, { project: pick.project }) : null;
    if (config) return { widgetType: def.id, config };
  }
  return null;
}

/**
 * Grid units back from pixels: the inverse of `toCanvasBox`, which is exact for anything we exported. A box that
 * rounds outside the 12 columns is pulled back inside rather than dropped — a card in the wrong column is a
 * misplaced card, a card that vanished is a lost one.
 */
export function fromCanvasBox(node) {
  const { cols, cellWidth, rowHeight, gap } = CANVAS_GRID;
  const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const w = Math.min(cols, Math.max(1, Math.round((num(node?.width, cellWidth) + gap) / (cellWidth + gap))));
  const h = Math.max(1, Math.round((num(node?.height, rowHeight) + gap) / (rowHeight + gap)));
  const x = Math.min(cols - w, Math.max(0, Math.round(num(node?.x, 0) / (cellWidth + gap))));
  const y = Math.max(0, Math.round(num(node?.y, 0) / (rowHeight + gap)));
  return { x, y, w, h };
}

/** The card a node becomes, or null when it is one of the shapes that has nowhere to go. */
function cardForNode(node, kinds) {
  // The payload wins: it is what we wrote, it names the exact card and config, and letting a URL override it would
  // make a round trip lossy by design (ISSUE-135, acceptance criterion 3).
  const payload = node?.wikibento;
  if (payload && typeof payload === 'object' && payload.widgetType) {
    const def = widgetDef(payload.widgetType);
    if (def) {
      kinds.restored += 1;
      return { widgetType: def.id, config: { ...(payload.config || {}) } };
    }
    kinds.notes.push(`a node's wikibento payload names "${payload.widgetType}", which this build does not have — read the link instead`);
  }

  const type = String(node?.type || '');
  if (type === 'text') return markdownCard(node.text ?? '');
  if (type === 'link') {
    const card = cardForLink(node.url, kinds, kinds.registry);
    if (card) return card;
    return markdownCard(String(node.url ?? ''));
  }
  if (type === 'file') {
    const ref = String(node.file ?? '');
    // A Commons file may arrive as a URL or as a bare `File:` title; a vault path arrives as neither, and is quoted.
    const card = cardForLink(ref, null, kinds.registry)
      || (/^file:/i.test(ref.trim()) ? cardForPick({ kind: 'commons-file', value: `File:${ref.trim().slice(5)}`, label: ref.trim().slice(5) }, kinds.registry) : null);
    if (card) return card;
    kinds.notes.push(`"${ref}" is a path inside someone else's vault, not a URL — kept as text`);
    return markdownCard(ref);
  }
  if (type === 'group') {
    kinds.groups += 1;
    return null;
  }
  kinds.unknownNodes += 1;
  const quoted = JSON.stringify(node ?? null) || 'null';
  return markdownCard(`\`\`\`json\n${quoted.length > 300 ? `${quoted.slice(0, 300)}…` : quoted}\n\`\`\``);
}

/**
 * A canvas document as a board: `{ widgets, layout, extras, report }`, ready to hand to `validateDashboard` so the
 * document goes through the same intake (coercion, defaults, the severity model) as any other borrowed board.
 *
 * `registry` is optional and only sharpens which card a link becomes; without it the preference list decides.
 */
export function canvasToBoard(value, { registry } = {}) {
  let doc = value;
  if (typeof value === 'string') {
    try { doc = JSON.parse(value); } catch { return { widgets: [], layout: [], extras: null, report: ['not JSON'] }; }
  }
  const nodes = Array.isArray(doc?.nodes) ? doc.nodes : [];
  const kinds = { restored: 0, groups: 0, unknownNodes: 0, unreadable: new Set(), notes: [], registry, extraKeys: 0 };

  const widgets = [];
  const layout = [];
  const used = new Set();
  let unnamed = 0;

  for (const node of nodes) {
    const card = cardForNode(node, kinds);
    if (!card) continue;
    let id = String(node?.id ?? '').trim();
    if (!id || used.has(id)) {
      unnamed += 1;
      id = `canvas-${unnamed}`;
      kinds.notes.push(`a node with ${node?.id ? `the id "${node.id}"` : 'no id'}, already used — placed as "${id}"`);
    }
    used.add(id);
    const widget = { id, widgetType: card.widgetType, config: card.config };

    // What we did not model rides along on the card, which the board's own round trip already preserves (the write
    // path spreads the widget object). Colours and shapes from a foreign canvas are the reader's, not ours to drop.
    const read = consumedKeys(node);
    const extra = Object.fromEntries(Object.entries(node || {}).filter(([k]) => !read.has(k)));
    if (Object.keys(extra).length) {
      widget.canvas = extra;
      kinds.extraKeys += 1;
    }
    widgets.push(widget);
    layout.push({ i: id, ...fromCanvasBox(node) });
  }

  // Top-level keys the board format does not define become the board's extras, so importing and re-exporting a
  // canvas does not shed a field a future version (or another tool) reads.
  const extras = Object.fromEntries(Object.entries(doc || {}).filter(([k]) => k !== 'nodes' && k !== 'edges'));

  const edges = Array.isArray(doc?.edges) ? doc.edges.length : 0;
  const report = [
    `${widgets.length} node${widgets.length === 1 ? '' : 's'} became ${widgets.length} card${widgets.length === 1 ? '' : 's'}`,
    kinds.restored ? `${kinds.restored} card${kinds.restored === 1 ? '' : 's'} restored from the wikibento payload a WikiBento export writes on each node` : null,
    edges ? `${edges} edge${edges === 1 ? '' : 's'} ignored — a canvas edge is presentation, and after a round trip the wiring is already inside the configs` : null,
    kinds.groups ? `${kinds.groups} group${kinds.groups === 1 ? '' : 's'} ignored — a board has no sections` : null,
    kinds.unreadable.size ? `${kinds.unreadable.size} link${kinds.unreadable.size === 1 ? '' : 's'} named nothing the app can place and ${kinds.unreadable.size === 1 ? 'is' : 'are'} kept as text: ${[...kinds.unreadable].slice(0, 3).join(', ')}` : null,
    kinds.extraKeys ? `${kinds.extraKeys} node${kinds.extraKeys === 1 ? '' : 's'} carried fields this format does not define — kept on the card` : null,
    Object.keys(extras).length ? `kept the document's own fields: ${Object.keys(extras).join(', ')}` : null,
    ...kinds.notes,
  ].filter(Boolean);

  return { widgets, layout, extras: Object.keys(extras).length ? extras : null, report };
}
