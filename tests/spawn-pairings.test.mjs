/**
 * The spawn-from-a-card pairing gate (ISSUE-96) — a whole-registry proof that every offer the menu makes is one
 * the card can actually accept and read.
 *
 * The bug it was written for: a `gallery` with `from: 'article'` was offered a **Document Reader** on its "feed
 * this card" side. Choosing it wired the producer's emitted value (a `File:` page URL) into the gallery's ARTICLE
 * field — because `spawnOptions` ignored its `config` argument and matched producers against every kind field the
 * type declares, including the three the source selector hides. The card then showed `Article not found: <URL>`.
 *
 * For EVERY widget type × a set of representative configs (the registry defaults, one per value any `showIf`
 * selector can take, and — for the gallery — each of its four sources) this enumerates the offers and asserts,
 * for every offered pair:
 *   (a) the field the value would land in is one the config actually READS (`fieldVisible`), so a hidden field
 *       cannot attract a producer;
 *   (b) the producer's `outputs.subject` is a kind that field's `kind` accepts, via `kindsAccepting()` — the match
 *       is on the SUBJECT, never the producer's `outputs.kind` shape (an excerpt is an `extract`, about an article);
 *   (c) merging the wire `wireConfig` produces yields a board `validateDashboard` accepts.
 * It also asserts the offer set equals an independent oracle (no over- or under-offering), and the REVERSE of the
 * reported pair: a gallery on `from: 'article'` must offer no producer whose subject is not article/page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnOptions, wireConfig } from '../src/lib/spawnOptions.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { fieldVisible } from '../src/lib/configFields.js';
import { kindsAccepting } from '../src/lib/pickMode.js';
import { declaredOutputKinds } from '../src/lib/dataflow.js';
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
 * SUBJECT (through `kindsAccepting`), or a `source` field whose `kinds` include a kind the producer publishes.
 * This is an INDEPENDENT oracle: it reads the registry directly rather than trusting `spawnOptions`' own answer.
 */
function acceptingFields(def, producerDef) {
  const subj = producerDef?.outputs?.subject;
  const outKinds = declaredOutputKinds(producerDef?.outputs);
  return (def.configFields || []).filter((f) => (
    (f.kind && subj && kindsAccepting(subj).includes(f.kind))
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
    const outKinds = declaredOutputKinds(other.outputs);
    for (const f of live) {
      if (f.kind && subj && kindsAccepting(subj).includes(f.kind)) out.add(type);
      if (f.type === 'source' && Array.isArray(f.kinds) && outKinds.some((k) => f.kinds.includes(k))) out.add(type);
    }
  }
  return out;
}

/** The patch a wire produces, tolerant of the structured return shape. */
const patchOf = (res) => (res && typeof res === 'object' && res.config && typeof res.config === 'object' ? res.config : (res || {}));

test('the whole registry offers only sound pairs: visible field, accepted subject, valid wired board', () => {
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

          // (b) the field the offer NAMES (`spawnOptions` reports it) must be one of the visible accepting fields.
          const named = def.configFields?.find((f) => f.key === g.field);
          if (named && !(visible.includes(named))) {
            violations.push(`${type} [${JSON.stringify(config)}] names field "${g.field}" for ${t.type} but it is not a visible accepting field`);
          }

          // (c) the wired board must validate. Wire the way the pair was OFFERED: a thing match passes the
          // subject (the field's kind), a channel match passes no subject so the source field takes the id.
          const producerId = `${t.type}-1`;
          const wireArgs = g.subject
            ? { fromId: producerId, subject: g.subject, config }
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

test('the reported pair cannot return: a gallery on `from: article` offers no commons-file producer', () => {
  const { feeds } = spawnOptions('gallery', { from: 'article', article: 'Albert Einstein' }, REG);
  const types = offeredProducers(feeds);
  assert.ok(!types.includes('documentReader'), `documentReader must not be offered: ${JSON.stringify(feeds)}`);
  assert.ok(!types.includes('iaBook'), `iaBook (a commons-file producer) must not be offered: ${JSON.stringify(feeds)}`);
  // Every offer is about an article or a page — nothing else can feed the one field this card reads.
  for (const g of feeds) {
    assert.ok(g.subject && kindsAccepting(g.subject).includes('article'),
      `only article-about producers may feed it, saw subject ${g.subject}: ${JSON.stringify(feeds)}`);
  }
  // And the sound pair still exists: the Article Excerpt, landing in the `article` field.
  const about = feeds.find((f) => f.types.some((t) => t.type === 'excerpt'));
  assert.ok(about, JSON.stringify(feeds));
  assert.equal(about.field, 'article');
  // Wire it: it must NOT refuse, and the field it chose is the one the card reads.
  const wire = wireConfig(REG.gallery, { fromId: 'ex', subject: 'article', config: { from: 'article', article: 'Albert Einstein' } });
  assert.equal(wire.refused, false);
  assert.equal(wire.field, 'article');
});
