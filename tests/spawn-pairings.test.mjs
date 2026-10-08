/**
 * The spawn-from-a-card pairing gate (ISSUE-96) — a whole-registry proof that every offer the menu makes is one
 * the card can actually accept and read.
 *
 * Two bugs it was written for, both with the same shape (a value that is merely ABOUT a thing treated AS the thing):
 *   · a `gallery` with `from: 'article'` was offered a **Document Reader**. Choosing it wired the producer's `File:`
 *     page URL into the gallery's ARTICLE field — because `spawnOptions` ignored its `config` argument and matched
 *     producers against every kind field the type declares, including the three the source selector hides. The card
 *     showed `Article not found: <URL>`.
 *   · a `gallery` with `from: 'article'` was still offered the **Article Excerpt**, whose value is a PARAGRAPH *about*
 *     an article, not the article's name. The paragraph landed in the title slot and the card showed
 *     `Article not found: Albert Einstein was a German-born theoretical physicist…` (Andrew, 2026-10-07). `subject`
 *     answered "what is this about", never "what does this value denote" — so the emitter model gained a third axis,
 *     `outputs.denotes` (VALUE_KINDS), and the match now requires BOTH.
 *
 * For EVERY widget type × a set of representative configs (the registry defaults, one per value any `showIf`
 * selector can take, and — for the gallery — each of its four sources) this enumerates the offers and asserts,
 * for every offered pair:
 *   (a) the field the value would land in is one the config actually READS (`fieldVisible`), so a hidden field
 *       cannot attract a producer;
 *   (b) the producer's `outputs.subject` is a kind that field's `kind` accepts, via `kindsAccepting()` — what the
 *       value is ABOUT;
 *   (c) the producer's `outputs.denotes` is a form the field can RESOLVE, via `valueFormsForField()` — what the
 *       value IS (a name, not prose about it; a list only into a multi-line field) — and the axis is REQUIRED;
 *   (d) merging the wire `wireConfig` produces yields a board `validateDashboard` accepts.
 * It also asserts the offer set equals an independent oracle (no over- or under-offering), that every producer
 * naming a subject declares a documented `denotes`, and the REVERSES of the reported pairs: a gallery on
 * `from: 'article'` must offer no producer that is not a NAME for an article/page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnOptions, wireConfig } from '../src/lib/spawnOptions.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { fieldVisible } from '../src/lib/configFields.js';
import { kindsAccepting, valueFormsForField } from '../src/lib/pickMode.js';
import { declaredOutputKinds, VALUE_KINDS } from '../src/lib/dataflow.js';
import { validateDashboard } from '../src/lib/dashboardConfig.js';

const REG = WIDGET_TYPES;

/**
 * Representative configs for one widget: its registry defaults, its explicit four-source gallery configs, and one
 * config per value every `showIf` selector can take (which is how a multi-source widget's alternate sources get
 * exercised for anything the gallery-shaped list misses).
 */
function configsFor(def) {
  const base = { ...(def?.defaults || {}) };
  const out = [base];
  if (def?.id === 'gallery') {
    for (const from of ['article', 'page', 'category', 'list']) out.push({ ...base, from });
  }
  for (const f of def?.configFields || []) {
    for (const [key, want] of Object.entries(f.showIf || {})) {
      for (const v of (Array.isArray(want) ? want : [want])) out.push({ ...base, [key]: v });
    }
  }
  const seen = new Set();
  return out.filter((c) => { const s = JSON.stringify(c); if (seen.has(s)) return false; seen.add(s); return true; });
}

/** The type ids a card is offered on its "feed this card" side, deduped. */
const offeredProducers = (feeds) => [...new Set(feeds.flatMap((g) => g.types.map((t) => t.type)))];

/**
 * The fields of `def` that would accept a producer's value — a `kind` field whose kind accepts the producer's
 * SUBJECT (through `kindsAccepting`) AND whose resolvable forms include the producer's `denotes`, or a `source`
 * field whose `kinds` include a kind the producer publishes. This is an INDEPENDENT oracle: it reads the registry
 * directly rather than trusting `spawnOptions`' own answer.
 */
function acceptingFields(def, producerDef) {
  const outputs = producerDef?.outputs;
  const subj = outputs?.subject;
  const denotes = outputs?.denotes;
  const outKinds = declaredOutputKinds(outputs);
  return (def.configFields || []).filter((f) => (
    (f.kind && subj && denotes && kindsAccepting(subj).includes(f.kind)
      && valueFormsForField(f).includes(denotes))
    || (f.type === 'source' && Array.isArray(f.kinds) && outKinds.some((k) => f.kinds.includes(k)))
  ));
}

/** The producers an independent reading of the registry says CAN feed this config. */
function expectedProducers(def, config) {
  const live = (def.configFields || []).filter((f) => fieldVisible(f, config, def.defaults));
  const out = new Set();
  for (const [type, other] of Object.entries(REG)) {
    if (!other?.outputs) continue;
    const subj = other.outputs.subject;
    const denotes = other.outputs.denotes;
    const outKinds = declaredOutputKinds(other.outputs);
    for (const f of live) {
      if (f.kind && subj && denotes && kindsAccepting(subj).includes(f.kind)
        && valueFormsForField(f).includes(denotes)) out.add(type);
      if (f.type === 'source' && Array.isArray(f.kinds) && outKinds.some((k) => f.kinds.includes(k))) out.add(type);
    }
  }
  return out;
}

/** The patch a wire produces, tolerant of the structured return shape. */
const patchOf = (res) => (res && typeof res === 'object' && res.config && typeof res.config === 'object' ? res.config : (res || {}));

test('the whole registry offers only sound pairs: visible field, accepted subject, resolvable value form, valid wired board', () => {
  const violations = [];
  let pairs = 0;

  for (const [type, def] of Object.entries(REG)) {
    if (!def) continue;
    for (const config of configsFor(def)) {
      const { feeds } = spawnOptions(type, config, REG);
      const offered = offeredProducers(feeds) .sort();
      const expected = [...expectedProducers(def, config)].sort();

      // (0) no over-offering (the bug) and no under-offering, against the independent oracle.
      const extra = offered.filter((t) => !expected.includes(t));
      const missing = expected.filter((t) => !offered.includes(t));
      if (extra.length) violations.push(`${type} [${JSON.stringify(config)}] offers producers no visible field accepts: ${extra.join(', ')}`);
      if (missing.length) violations.push(`${type} [${JSON.stringify(config)}] FAILS to offer: ${missing.join(', ')}`);

      for (const g of feeds) {
        for (const t of g.types) {
          pairs += 1;
          const pdef = REG[t.type];
          const cands = acceptingFields(def, pdef);
          const visible = cands.filter((f) => fieldVisible(f, config, def.defaults));

          // (a) the value must land in a field the config actually reads.
          if (!cands.length) { violations.push(`${type} [${JSON.stringify(config)}] offers ${t.type}: no field accepts it at all`); continue; }
          if (!visible.length) {
            violations.push(`${type} [${JSON.stringify(config)}] offers ${t.type} (subject ${pdef?.outputs?.subject || 'channel ' + g.kind}) — accepting field(s) ${cands.map((f) => f.key).join(', ')} are hidden for this config`);
            continue;
          }

          // (b) the field the offer NAMES (`spawnOptions` reports it) must be one of the visible accepting fields,
          //     and the producer's value form must be one that field can RESOLVE.
          const named = def.configFields?.find((f) => f.key === g.field);
          if (named && !(visible.includes(named))) {
            violations.push(`${type} [${JSON.stringify(config)}] names field "${g.field}" for ${t.type} but it is not a visible accepting field`);
          }
          if (named && named.kind) {
            const forms = valueFormsForField(named);
            const denotes = pdef?.outputs?.denotes;
            if (!denotes || !forms.includes(denotes)) {
              violations.push(`${type} [${JSON.stringify(config)}] offers ${t.type} (denotes ${denotes}) into "${g.field}", whose forms are [${forms.join(', ')}]`);
            }
          }

          // (c) the wired board must validate. Wire the way the pair was OFFERED: a thing match passes the subject
          // (the field's kind) AND the producer's denotes, a channel match passes no subject so the source field
          // takes the id.
          const producerId = `${t.type}-1`;
          const wireArgs = g.subject
            ? { fromId: producerId, subject: g.subject, denotes: g.denotes, config }
            : { fromId: producerId, config };
          const wire = wireConfig(def, wireArgs);
          if (wire.refused) {
            violations.push(`${type} [${JSON.stringify(config)}] refuses the offered pair with ${t.type}: ${wire.reason}`);
            continue;
          }
          const wiredConsumer = { id: 'target-1', widgetType: type, config: { ...(def.defaults || {}), ...patchOf(wire) } };
          const producer = { id: producerId, widgetType: t.type, config: { ...(REG[t.type].defaults || {}) } };
          const board = {
            version: 1,
            widgets: [wiredConsumer, producer],
            layout: [
              { i: 'target-1', x: 0, y: 0, w: 3, h: 3 },
              { i: producerId, x: 3, y: 0, w: 3, h: 3 },
            ],
          };
          const verdict = validateDashboard(JSON.stringify(board));
          if (!verdict.valid) violations.push(`${type} [${JSON.stringify(config)}] + ${t.type}: wired board is INVALID — ${verdict.errors.join('; ')}`);
        }
      }
    }
  }

  assert.ok(pairs > 0, 'the registry produced no pairs to check — the enumeration is broken');
  assert.deepEqual(violations, [], `\n  ${violations.length} unsound pairing(s):\n    ${violations.join('\n    ')}\n`);
});

test('the reported pair cannot return: a gallery on `from: article` is offered nothing — no commons-file, no prose', () => {
  const cfg = { from: 'article', article: 'Albert Einstein' };
  const { feeds, notes } = spawnOptions('gallery', cfg, REG);
  const types = offeredProducers(feeds);
  // (i) the 2026-10-02 bug: a Commons-file producer must not be offered to an ARTICLE field.
  assert.ok(!types.includes('documentReader'), `documentReader must not be offered: ${JSON.stringify(feeds)}`);
  assert.ok(!types.includes('iaBook'), `iaBook (a commons-file producer) must not be offered: ${JSON.stringify(feeds)}`);
  // (ii) the 2026-10-07 bug: the Article Excerpt's value is PROSE about an article, not the article's name.
  assert.ok(!types.includes('excerpt'), `the prose producer must not be offered to a title field: ${JSON.stringify(feeds)}`);
  // Every offer would have to be a NAME about an article or a page — nothing else can fill the one field this card reads.
  for (const g of feeds) {
    assert.ok(g.subject && kindsAccepting(g.subject).includes('article'),
      `only article-about producers may feed it, saw subject ${g.subject}: ${JSON.stringify(feeds)}`);
    assert.equal(g.denotes, 'name', `and only a NAME for it, saw denotes ${g.denotes}: ${JSON.stringify(feeds)}`);
  }
  // With no NAME producer for an article in the registry, the honest answer is an empty side and a note that says
  // what it wanted — not a prose producer pressed into a title slot.
  assert.deepEqual(feeds, [], `the article field has no name producer yet: ${JSON.stringify(feeds)}`);
  assert.ok(notes.some((n) => /a name for article/.test(n)), `the note names what it wanted: ${notes.join(' | ')}`);
  // Wire the prose producer anyway: `wireConfig` refuses it — the menu and the wire agree.
  const wire = wireConfig(REG.gallery, { fromId: 'ex', subject: 'article', denotes: 'prose', config: cfg });
  assert.equal(wire.refused, true);
  assert.match(wire.reason, /prose/);
  assert.deepEqual(wire.config, {}, 'a refusal writes nothing');
  // …and a NAME would still land in the field the card reads.
  const named = wireConfig(REG.gallery, { fromId: 'x', subject: 'article', denotes: 'name', config: cfg });
  assert.equal(named.refused, false);
  assert.equal(named.field, 'article');
});

test('the third axis proves it EITHER WAY: prose refused, a name admitted (a synthetic pair)', () => {
  // Same subject, same field, three producers: only the value-form tells them apart. This is the axis in
  // isolation; the whole-registry check above proves it against the real widgets.
  const registry = {
    art: { id: 'art', name: 'Article', icon: '📄',
      configFields: [{ key: 'article', label: 'Article', type: 'text', kind: 'article' }], defaults: {} },
    prose: { id: 'prose', name: 'Prose', icon: 'P', outputs: { kind: 'extract', subject: 'article', denotes: 'prose' } },
    title: { id: 'title', name: 'Title', icon: 'T', outputs: { kind: 'value', subject: 'article', denotes: 'name' } },
    many: { id: 'many', name: 'Many', icon: 'M', outputs: { kind: 'lines', subject: 'article', denotes: 'list' } },
  };
  const offered = (reg) => { const { feeds: f } = spawnOptions('art', {}, reg); return offeredProducers(f).sort(); };
  // a single-line `kind` field takes a NAME…
  assert.deepEqual(offered(registry), ['title'], 'only the name producer feeds a single-line thing field');
  // …and a multi-line one takes a name OR a list — still never prose.
  const multi = { ...registry, art: { ...registry.art, configFields: [{ key: 'articles', type: 'textarea', kind: 'article' }] } };
  assert.deepEqual(offered(multi), ['many', 'title'], 'a textarea takes one name or many');
  // The wire agrees, and REFUSES a subject with no value-form (the axis is required, not optional).
  const w = (o) => wireConfig(registry.art, { fromId: 'x', subject: 'article', ...o });
  assert.equal(w({ denotes: 'prose' }).refused, true);
  assert.equal(w({ denotes: 'name' }).refused, false);
  assert.equal(w({}).refused, true, 'a subject with no denotes refuses — the axis cannot be dropped');
});

test('every producer that names a subject declares what its value IS (denotes) — whole registry', () => {
  const bad = [];
  let paired = 0;
  for (const [id, def] of Object.entries(REG)) {
    const out = def?.outputs;
    if (!out) continue;
    if ('subject' in out) {
      paired += 1;
      if (!VALUE_KINDS.includes(out.denotes)) bad.push(`${id}: subject "${out.subject}" with denotes "${out.denotes}"`);
    } else if ('denotes' in out) {
      bad.push(`${id}: denotes "${out.denotes}" with no subject`);
    }
  }
  assert.ok(paired >= 4, `expected several subject-paired producers, found ${paired}`);
  assert.deepEqual(bad, [], `producers whose value-form is missing or undocumented:\n  ${bad.join('\n  ')}`);
});
