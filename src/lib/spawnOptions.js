/**
 * spawnOptions — the two directions of widget composition, answered for ONE card (ISSUE-96, the spawn-from-a-card
 * menu). The menu's entire content lives here so it can be unit-tested with no UI: given a card, what can FEED it
 * (its inputs) and what can it FEED (its outputs).
 *
 * This is the read side of the completed emitter data model in src/widgets/index.js:
 *   · a producer declares `outputs.kind` (the shape of the value the bare id publishes) and, when it is
 *     unambiguous, `outputs.subject` (the THING that value is about, from pickMode.js's KIND_IDS);
 *   · a consumer declares what it takes either as a singular `kind` (a thing) or as a plural `kinds` on a `source`
 *     field (a channel).
 * `feeds` matches a consumer's demand against producers' `outputs`; `feedsTo` matches this card's `outputs.kind`
 * against consumers' `kinds`. Nothing here knows a widget INSTANCE — the App adds the id and the layout.
 *
 * Pure, and takes `registry` as a PARAMETER — it must never import src/widgets/index.js, which imports App and would
 * form the module-initialisation cycle that already cost a revert (AGENTS.md, ISSUE-114; the same rule that shapes
 * lib/pickMode.js).
 *
 * Deliberate divergences from pickMode.js, noted where they sit: pickMode's `typesForKind` answers "which widgets
 * can consume a THING the reader clicked" (by a field's `kind`); `feeds` here answers "which widgets can PRODUCE a
 * thing this card is about" (by a producer's `outputs.subject`). The two axes are different, so its inference table
 * is reused (`kindsAccepting`, `kindFields`) but its type list is not.
 */
import { declaredOutputKinds } from './dataflow.js';
import { KIND_LABELS, kindsAccepting, kindFields } from './pickMode.js';

/** A producer/consumer entry as the menu shows it. */
const brief = (type, def) => ({ type, name: def.name, icon: def.icon });

const asList = (x) => (Array.isArray(x) ? x : [x]);

/** A readable label for a kind id, keeping the id itself so a note cannot be ambiguous. */
const label = (kind) => (kind ? `${KIND_LABELS[kind] || kind} (${kind})` : String(kind));

/**
 * The two directions of composition for one card.
 *
 * @param {string} widgetType  a registry id
 * @param {object} [config]    the card's config (reserved for the menu's next step — field visibility; unused today)
 * @param {object} [registry]  the registry, keyed by id (WIDGET_TYPES). A PARAMETER, never imported.
 * @returns {{
 *   feeds: Array<{kind: string, subject?: string, types: Array<{type: string, name: string, icon: string}>, reason: string}>,
 *   feedsTo: Array<{channel: string, types: Array<{type: string, name: string, icon: string, field: string}>, reason: string}>,
 *   notes: string[],
 * }}
 */
export function spawnOptions(widgetType, config = {}, registry = {}) {
  const def = registry[widgetType];
  const notes = [];
  if (!def) return { feeds: [], feedsTo: [], notes: [`Unknown widget type "${widgetType}".`] };

  const entries = Object.entries(registry).filter(([, other]) => Boolean(other));
  const feeds = [];
  const feedsTo = [];

  // ── feeds: what can feed THIS card ────────────────────────────────────────────────────────────────────────────
  // Grouped by (kind, subject): `kind` is the shape of the value that would arrive (an OUTPUT_KIND); `subject` is
  // the thing it is about, present when the match came from one of the card's thing (`kind`) fields. The same
  // (kind, subject) key collapses several producers into one menu row.
  const groups = new Map();
  const addFeed = (kind, subject, type) => {
    const key = `${kind}\u0000${subject || ''}`;
    if (!groups.has(key)) groups.set(key, { kind, subject, types: new Set() });
    groups.get(key).types.add(type);
  };
  const wanted = [];   // the things/channels this card demands, for the empty-side note

  for (const field of def.configFields || []) {
    // (a) a THING the card wants: a singular `kind` field. Producers whose `outputs.subject` satisfies it —
    //     through the kind hierarchy, so an article can fill a field that wants a page (ISSUE-118).
    if (field.kind) {
      wanted.push(field.kind);
      for (const [type, other] of entries) {
        const subject = other?.outputs?.subject;
        if (!subject) continue;
        if (!kindsAccepting(subject).includes(field.kind)) continue;
        addFeed(other.outputs.kind, field.kind, type);
      }
    }
    // (b) a CHANNEL the card accepts: a plural `kinds` source field. Producers that publish that kind at all —
    //     on the bare id or on any named channel.
    if (field.type === 'source' && Array.isArray(field.kinds)) {
      for (const want of field.kinds) {
        wanted.push(want);
        for (const [type, other] of entries) {
          if (!other?.outputs) continue;
          if (!declaredOutputKinds(other.outputs).includes(want)) continue;
          addFeed(want, undefined, type);
        }
      }
    }
  }

  for (const g of groups.values()) {
    const types = [...g.types].sort().map((t) => brief(t, registry[t]));
    const n = types.length;
    feeds.push({
      kind: g.kind,
      ...(g.subject ? { subject: g.subject } : {}),
      types,
      reason: g.subject
        ? `${n} widget type${n === 1 ? '' : 's'} publish${n === 1 ? 'es' : ''} a value about ${label(g.subject)} — the value itself is a \`${g.kind}\`.`
        : `${n} widget type${n === 1 ? '' : 's'} publish${n === 1 ? 'es' : ''} \`${g.kind}\`.`,
    });
  }
  feeds.sort((a, b) => String(a.subject || a.kind).localeCompare(String(b.subject || b.kind)));

  // ── feedsTo: what THIS card can feed ──────────────────────────────────────────────────────────────────────────
  // Built from what the card PUBLISHES (`outputs.kind`) against consumer `source` fields whose `kinds` accept it.
  const outKind = def.outputs?.kind;
  if (outKind) {
    const consumers = [];
    for (const [type, other] of entries) {
      for (const field of other?.configFields || []) {
        if (field.type === 'source' && Array.isArray(field.kinds) && field.kinds.includes(outKind)) {
          consumers.push({ ...brief(type, other), field: field.key });
          break; // one source field per type is enough for the menu
        }
      }
    }
    if (consumers.length) {
      consumers.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      feedsTo.push({
        channel: outKind,
        types: consumers,
        reason: `${consumers.length} widget type${consumers.length === 1 ? '' : 's'} can read a \`${outKind}\` as a source.`,
      });
    }
  }

  // ── notes: the empty sides, in words a user can read ──────────────────────────────────────────────────────────
  const hasInput = (def.configFields || []).some((f) => f.kind || f.type === 'source');
  if (!feeds.length) {
    const unique = [...new Set(wanted)];
    if (!unique.length) {
      notes.push(hasInput
        ? 'This card accepts any source, so nothing is listed until one is chosen on the board.'
        : 'This card has no inputs — it can only start a chain.');
    } else {
      notes.push(`Nothing can feed this card yet: no widget publishes a value about ${unique.join(' or ')}.`);
    }
  }
  if (!feedsTo.length) {
    notes.push(outKind
      ? `This card publishes ${outKind}, but no widget accepts it as a source — nothing can read from it yet.`
      : 'This card publishes nothing, so nothing can be wired to read from it.');
  }

  return { feeds, feedsTo, notes };
}

/**
 * The config patch that makes a NEWLY created card (def) read from `fromId`.
 *
 * `channel` is the reference's channel NAME — omit it to reference the producer's BARE id. The field is chosen by
 * the field's own declaration, reusing pickMode's `kindFields` for the thing-field fallback:
 *   1. a `source` field whose `kinds` accepts the channel — the menu's own answer;
 *   2. an open `source` field (no `kinds`), or the first one, for a bare id;
 *   3. otherwise a thing (`kind`) field, or any ref-resolving text field.
 *
 * DELIBERATE DIVERGENCE from the brief's `{{widget:id}}` shorthand: a `source` field holds a PLAIN `id` / `id#channel`
 * (no braces), because `resolveSourceValue` reads it as an id and `boardDoctor` treats a value containing `{{` as an
 * unresolved token and skips it. Text fields DO take the braced form, which `resolveParams` substitutes.
 */
export function wireConfig(def, { fromId, channel } = {}) {
  if (!def || typeof fromId !== 'string' || !fromId) return {};
  const fields = def.configFields || [];
  const suffix = channel ? `#${channel}` : '';

  const sourceFields = fields.filter((f) => f.type === 'source');
  let field = channel
    ? sourceFields.find((f) => Array.isArray(f.kinds) && f.kinds.includes(channel))
    : null;
  if (!field) field = sourceFields.find((f) => !Array.isArray(f.kinds));
  if (!field && sourceFields.length) field = sourceFields[0];
  if (field) return { [field.key]: `${fromId}${suffix}` };

  // No source field: a thing (`kind`) field first — `kindFields` is pickMode's own accessor — then a text field.
  const thing = kindFields(def)[0]?.field
    || fields.find((f) => (f.type === 'textarea' || f.type === 'text') && !f.noRefs);
  if (thing) return { [thing.key]: `{{widget:${fromId}${suffix}}}` };
  return {};
}
