/**
 * spawnOptions — the two directions of widget composition, answered for ONE card (ISSUE-96, the spawn-from-a-card
 * menu). The menu's entire content lives here so it can be unit-tested with no UI: given a card, what can FEED it
 * (its inputs) and what can it FEED (its outputs).
 *
 * This is the read side of the completed emitter data model in src/widgets/index.js:
 *   · a producer declares `outputs.kind` (the shape of the value the bare id publishes) and, when it names a thing,
 *     `outputs.subject` (the THING that value is about, from pickMode.js's KIND_IDS) AND `outputs.denotes` (what
 *     the value IS — a `name` for that thing, or merely `prose` about it — VALUE_KINDS in dataflow.js);
 *   · a consumer declares what it takes either as a singular `kind` (a thing) or as a plural `kinds` on a `source`
 *     field (a channel).
 * `feeds` matches a consumer's demand against producers' `outputs`; `feedsTo` matches this card's `outputs.kind`
 * against consumers' `kinds`. Nothing here knows a widget INSTANCE — the App adds the id and the layout.
 *
 * THE RULES THAT MATCH A PRODUCER TO A FIELD (ISSUE-96, and the bug this module was fixed for twice):
 *   1. a producer's `outputs.subject` must be a thing the CONSUMER FIELD'S `kind` accepts, asked through the kind
 *      hierarchy with `kindsAccepting()` — an article is a page, so a page field may be fed by an article producer,
 *      but a `commons-file` producer may NOT fill an `article` field. Subject is the axis; `kindsAccepting` is the
 *      test. It is deliberately NOT the producer's `outputs.kind` (the shape of the value).
 *   2. the same producer's `outputs.denotes` must be a form the field can RESOLVE (`valueFormsForField`): a thing
 *      field takes a `name` (one for a single-line field, a `list` too for a textarea), never `prose` or a
 *      `count`. This is the third axis and it is REQUIRED — a subject with no `denotes` is offered to nothing.
 *      Without it, the Article Excerpt (an `extract` value ABOUT an article) was offered to a gallery's `article`
 *      field, and the paragraph landed in the title slot: `Article not found: Albert Einstein was a German-born…`
 *      (Andrew, 2026-10-07). Subject answers "what is this about", not "what does this value denote" — two values
 *      can be about the same article and only one of them is the article's name.
 *
 * …and a field the config does not activate is not a demand at all. The gallery declares four thing-fields — one
 * per source — and each carries a `showIf` naming the source (`from`) that reveals it. A card whose `from` is
 * `article` reads only the `article` field; the `files` field is dead weight and must not attract producers. Before
 * this, `spawnOptions` ignored its `config` argument and offered a Document Reader (a `commons-file` producer) to
 * a gallery reading an ARTICLE, whose value then landed in the `article` slot — "Article not found: <File: url>".
 *
 * Pure, and takes `registry` as a PARAMETER — it must never import src/widgets/index.js, which imports App and would
 * form the module-initialisation cycle that already cost a revert (AGENTS.md, ISSUE-114; the same rule that shapes
 * lib/pickMode.js).
 *
 * Deliberate divergences from pickMode.js, noted where they sit: pickMode's `typesForKind` answers "which widgets
 * can consume a THING the reader clicked" (by a field's `kind`); `feeds` here answers "which widgets can PRODUCE a
 * thing this card is about" (by a producer's `outputs.subject`). The two axes are different, so its inference table
 * is reused (`kindsAccepting`, `kindFields`, `fieldVisible`) but its type list is not.
 */
import { declaredOutputKinds } from './dataflow.js';
import { KIND_LABELS, kindsAccepting, kindFields, valueFormsForField } from './pickMode.js';
import { fieldVisible } from './configFields.js';

/** A producer/consumer entry as the menu shows it. */
const brief = (type, def) => ({ type, name: def.name, icon: def.icon });

const asList = (x) => (Array.isArray(x) ? x : [x]);

/** A readable label for a kind id, keeping the id itself so a note cannot be ambiguous. */
const label = (kind) => (kind ? `${KIND_LABELS[kind] || kind} (${kind})` : String(kind));

/** How a `denotes` form reads in a sentence: "publishes a name for …" / "publishes prose about …". */
const DENOTES_PHRASE = { name: 'a name for', prose: 'prose about', list: 'a list of names for', count: 'a count of' };

/**
 * The two directions of composition for one card.
 *
 * @param {string} widgetType  a registry id
 * @param {object} [config]    the card's OWN config — the fields it actually reads are the ones a producer may fill
 * @param {object} [registry]  the registry, keyed by id (WIDGET_TYPES). A PARAMETER, never imported.
 * @returns {{\n
 *   feeds: Array<{kind: string, subject?: string, field: string, types: Array<{type: string, name: string, icon: string}>, reason: string}>,\n
 *   feedsTo: Array<{channel: string, types: Array<{type: string, name: string, icon: string, field: string}>, reason: string}>,\n
 *   notes: string[],\n
 * }}
 */
export function spawnOptions(widgetType, config = {}, registry = {}) {
  const def = registry[widgetType];
  const notes = [];
  if (!def) return { feeds: [], feedsTo: [], notes: [`Unknown widget type "${widgetType}".`] };

  const entries = Object.entries(registry).filter(([, other]) => Boolean(other));
  const feeds = [];
  const feedsTo = [];

  // The demands this card ACTUALLY has: a field its own `showIf` hides for this config is not read by the card, so
  // it is not a place a producer's value could land. `fieldVisible` is the shared rule (configFields.js), the same
  // one the ⚙ panel and `brushConfig` use — read the stored config first, then the registry default.
  const liveFields = (def.configFields || []).filter((f) => fieldVisible(f, config, def.defaults));

  // ── feeds: what can feed THIS card ────────────────────────────────────────────────────────────────────────────
  // Grouped by (kind, subject, field): `kind` is the shape of the value that would arrive (an OUTPUT_KIND);
  // `subject` is the thing it is about, present when the match came from one of the card's thing (`kind`) fields;
  // `field` is the card field the value would be written into (so the menu can say where it lands, and a test can
  // prove the field is one the card reads). The same key collapses several producers into one menu row.
  const groups = new Map();
  const addFeed = (kind, subject, field, type, denotes) => {
    // `denotes` is part of the key: two producers can share a subject and a field yet differ in what their value
    // IS, and only the accepted one got this far — so a group's `denotes` is unambiguous, which is what lets the
    // UI carry it through to `wireConfig` unchanged.
    const key = `${kind}\u0000${subject || ''}\u0000${field}\u0000${denotes || ''}`;
    if (!groups.has(key)) groups.set(key, { kind, subject, denotes, field, types: new Set() });
    groups.get(key).types.add(type);
  };
  const wanted = [];   // what this card demands, phrased for the empty-side note

  for (const field of liveFields) {
    // (a) a THING the card wants: a singular `kind` field. A producer may fill it only when TWO axes line up —
    //     its SUBJECT satisfies the field's kind (through the hierarchy, so an article can fill a `page` field,
    //     ISSUE-118) AND its `denotes` is a form the field can RESOLVE (a name; never prose). See the header.
    if (field.kind) {
      const forms = valueFormsForField(field);   // ['name'] or ['name', 'list'] — never prose/count
      wanted.push(`a name for ${label(field.kind)}`);
      for (const [type, other] of entries) {
        const outputs = other?.outputs;
        const subject = outputs?.subject;
        if (!subject) continue;
        // The SUBJECT must be a kind this field's kind accepts — never the producer's output shape.
        // `kindsAccepting('article')` is `['article','page']`, so a `page` field takes an article; a
        // `commons-file` producer does not take an `article` field.
        if (!kindsAccepting(subject).includes(field.kind)) continue;
        // THE THIRD AXIS, and it is REQUIRED: the producer must say what its value IS, and that form must be one
        // the field resolves. `kindsAccepting` admitted the Article Excerpt here; `denotes: 'prose'` is not a name,
        // so it does not (Andrew, 2026-10-07). A subject with no `denotes` fails closed.
        const denotes = outputs.denotes;
        if (!denotes || !forms.includes(denotes)) continue;
        addFeed(outputs.kind, field.kind, field.key, type, denotes);
      }
    }
    // (b) a CHANNEL the card accepts: a plural `kinds` source field. Producers that publish that kind at all —
    //     on the bare id or on any named channel. A `source` field delivers the value intact, so the value-form
    //     axis does not narrow it (the consumer chose a channel, not a thing to resolve).
    if (field.type === 'source' && Array.isArray(field.kinds)) {
      for (const want of field.kinds) {
        wanted.push(`\`${want}\``);
        for (const [type, other] of entries) {
          if (!other?.outputs) continue;
          if (!declaredOutputKinds(other.outputs).includes(want)) continue;
          addFeed(want, undefined, field.key, type, undefined);
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
      ...(g.denotes ? { denotes: g.denotes } : {}),
      field: g.field,
      types,
      reason: g.subject
        ? `${n} widget type${n === 1 ? '' : 's'} publish${n === 1 ? 'es' : ''} ${DENOTES_PHRASE[g.denotes] || 'a value for'} ${label(g.subject)} — the value itself is a \`${g.kind}\`.`
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
  const hasInput = liveFields.some((f) => f.kind || f.type === 'source');
  if (!feeds.length) {
    const unique = [...new Set(wanted)];
    if (!unique.length) {
      notes.push(hasInput
        ? 'This card accepts any source, so nothing is listed until one is chosen on the board.'
        : 'This card has no inputs — it can only start a chain.');
    } else {
      notes.push(`Nothing can feed this card yet: no widget publishes ${unique.join(' or ')}.`);
    }
  }
  if (!feedsTo.length) {
    notes.push(outKind
      ? `This card publishes ${outKind}, but no widget accepts it as a source — nothing can read from it yet.`
      : 'This card publishes nothing, so nothing can be wired to read from it.');
  }

  return { feeds, feedsTo, notes };
}

/** The refusal shape `wireConfig` returns when it will not write a value the card would not read. */
const refuse = (reason) => ({ config: {}, refused: true, reason });

/**
 * The config patch that makes a card (def) read from `fromId` — and the refusal, with a reason, when it cannot.
 *
 * `channel` is a named channel to address (`id#channel`); `subject` is the THING the producer's value is about (its
 * `outputs.subject`) and `denotes` is what that value IS (its `outputs.denotes`) — the two axes the menu offered
 * the pair by, applied here again so a programmatic caller cannot write what a card cannot read. The field is
 * chosen by its own declaration, reusing pickMode's `kindFields` for the thing-field fallback:
 *   1. a `kind` field whose kind accepts `subject` via `kindsAccepting` AND whose resolvable forms include
 *      `denotes` (a `name`, or a `list` for a textarea) — the menu's own answer (ISSUE-96);
 *   2. a `source` field whose `kinds` accepts `channel` — a named-channel reference;
 *   3. an open `source` field (no `kinds`), or the first one, for a bare id;
 *   4. otherwise a thing (`kind`) field, or any ref-resolving text field.
 *
 * `denotes` is REQUIRED with `subject`: without it there is no answer to "is this a name or prose about it?", and
 * the earlier code wrote the Article Excerpt's paragraph into a gallery's `article` slot (2026-10-07). A `subject`
 * with no `denotes` refuses rather than guesses.
 *
 * `showIf`: writing a value the card reads means the field has to BE read — so the field's own `showIf` is applied
 * (each selector key is set to a value that reveals it), exactly as `brushConfig` does for a pick. Without this, a
 * value was written into a field the card's source selector hid, and the card rendered the failure this fix is
 * about ("Article not found: <File: url>"). The patch then RE-READS the field with `fieldVisible` against the
 * resulting config; if the card still would not read it, that is a refusal — never a value the card ignores.
 *
 * @returns {{\n
 *   config: object,        the patch to merge onto the card (EMPTY on a refusal)\n
 *   refused: boolean,\n
 *   reason: string,        why it refused, or (when `changedSource`) which source it moved to\n
 *   field?: string,\n
 *   changedSource?: boolean  true when applying `showIf` moved the card's source selector\n
 * }}
 *
 * DELIBERATE DIVERGENCE from the brief's `{{widget:id}}` shorthand: a `source` field holds a PLAIN `id` / `id#channel`
 * (no braces), because `resolveSourceValue` reads it as an id and `boardDoctor` treats a value containing `{{` as an
 * unresolved token and skips it. Text fields DO take the braced form, which `resolveParams` substitutes.
 */
export function wireConfig(def, { fromId, channel, subject, denotes, config = {} } = {}) {
  if (!def || typeof fromId !== 'string' || !fromId) return refuse('no producer id to reference');
  const fields = def.configFields || [];
  const suffix = channel ? `#${channel}` : '';

  // ── choose the field that will hold the reference ──────────────────────────────────────────────────────────
  let field = null;
  if (subject) {
    // THE RULES (see the header), BOTH axes: the producer's SUBJECT must be a thing this field's kind accepts
    // (through the kind hierarchy) AND the producer's value must be a form the field can resolve (`denotes`). The
    // subject axis alone admitted a PARAGRAPH into a name slot; requiring the value-form closes it here too, so a
    // programmatic caller cannot write what the menu cannot offer. A subject with no `denotes` refuses.
    const accepting = kindsAccepting(subject);
    field = fields.find((f) => f.kind && accepting.includes(f.kind)
      && Boolean(denotes) && valueFormsForField(f).includes(denotes)) || null;
    if (!field) return refuse(denotes
      ? `no field on this card takes a ${denotes} value about ${label(subject)}`
      : `a value about ${label(subject)} must also say what it IS (denotes) — the axis is required, so nothing is written`);
  }
  if (!field && channel) {
    // A named-channel reference: prefer the source field that declares it. If no source field accepts it, this
    // falls through to the ordinary field choice (a text/kind field still takes the `{{widget:id#channel}}` form).
    field = fields.find((f) => f.type === 'source' && Array.isArray(f.kinds) && f.kinds.includes(channel)) || null;
  }
  if (!field) {
    const sourceFields = fields.filter((f) => f.type === 'source');
    field = sourceFields.find((f) => !Array.isArray(f.kinds));
    if (!field && sourceFields.length) field = sourceFields[0];
    if (!field) {
      field = kindFields(def)[0]?.field
        || fields.find((f) => (f.type === 'textarea' || f.type === 'text') && !f.noRefs)
        || null;
    }
  }
  if (!field) return refuse('this card has no field that can take a reference');

  // ── apply `showIf`, so the card actually reads the field the value lands in ───────────────────────────────
  const patch = {};
  for (const [key, want] of Object.entries(field.showIf || {})) {
    patch[key] = Array.isArray(want) ? want[0] : want;
  }
  patch[field.key] = field.type === 'source' ? `${fromId}${suffix}` : `{{widget:${fromId}${suffix}}}`;

  const next = { ...config, ...patch };
  if (!fieldVisible(field, next, def.defaults)) {
    return refuse(`writing “${field.key}” would leave it hidden — the card would not read the value`);
  }

  const changedSource = Object.entries(field.showIf || {})
    .some(([k, want]) => String(config?.[k] ?? def.defaults?.[k] ?? '') !== String(Array.isArray(want) ? want[0] : want));
  return {
    config: patch,
    refused: false,
    field: field.key,
    changedSource,
    reason: changedSource ? `this moves the card to read “${field.label || field.key}”` : '',
  };
}
