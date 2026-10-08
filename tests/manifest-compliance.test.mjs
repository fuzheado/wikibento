/**
 * Manifest compliance (ASK-ARCHITECTURE plan items 1–2, 2026-09-09).
 *
 * Runs against public/manifest.json, which `npm test` regenerates first
 * (`node scripts/generate-manifest.mjs` is prepended to the test script), so
 * this suite guards the generator + registry-declared dataflow metadata:
 *
 * 1. Description integrity — no apostrophe-truncation artifacts (the v2
 *    regex bug that cut filterLines/lineCount descriptions to "Consume
 *    another widget").
 * 2. Emitter declarations — the emitting widgets whose kind is pinned must declare the
 *    output kind that their `emit` produces, every declared kind must be in
 *    `OUTPUT_KINDS` (src/lib/dataflow.js), and no documented kind may be dead.
 * 3. Consumer declarations — source-field widgets must be flagged
 *    consumesSource and document their source field.
 * 4. Node roles + scope — every widget carries a valid nodeKind and
 *    timeScope; the non-source roles are correct where declared.
 * 5. Config-field shape — every config field has key + type; dataflow
 *    fields carry their hint.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { OUTPUT_KINDS, VALUE_KINDS, declaredOutputKinds } from '../src/lib/dataflow';
import { KIND_IDS, kindsAccepting } from '../src/lib/pickMode.js';

const manifest = JSON.parse(
  await readFile(join(process.cwd(), 'public/manifest.json'), 'utf8'),
);
const byId = new Map(manifest.widgets.map((w) => [w.id, w]));
// ISSUE-96: `kind`/`subject`/`denotes` are the reserved metadata keys; every other key of `outputs` is a named channel.
const NAMED = (outputs) => Object.entries(outputs || {}).filter(([k]) => k !== 'kind' && k !== 'subject' && k !== 'denotes');

const KNOWN_EMITTERS = {
  // ISSUE-96: each entry pins the metadata the emitter must carry — `kind` (the bare id's shape), `subject`
  // (the thing it is about), `denotes` (what the value IS — the third axis) and any named channels. A bare string
  // means "the kind, exactly".
  excerpt: { kind: 'extract', subject: 'article', denotes: 'prose', channels: { extract: 'extract', reference: 'value' } },
  gallery: { kind: 'lines', channels: { lines: 'lines', selection: 'value' } },
  wikiBox: { kind: 'lines', channels: { items: 'lines', selection: 'value' } },
  translate: { kind: 'value', channels: { translation: 'value', speech: 'speech' } },
  listSource: 'lines',
  filterLines: 'lines',
  lineCount: 'count',
  echo: 'value',
  // The CIM family's emitters (2026-10-03, ISSUE-96's checklist): a stats/trend card publishes the subject it
  // resolved, and a ranking publishes the ranked names.
  cimStats: { kind: 'value', subject: 'cim-category', denotes: 'name' },
  cimTrend: { kind: 'value', subject: 'cim-category', denotes: 'name' },
  cimRanking: { kind: 'lines', subject: 'cim-category', denotes: 'list' },
};
const KNOWN_NODE_KINDS = {
  filterLines: 'transformer',
  lineCount: 'reducer',
  echo: 'display',
  boardControls: 'controller',
  speaker: 'effector',
  translate: 'ai',
  markdown: 'display',
  wikiPage: 'display',
};
const ALLOWED_NODE_KINDS = ['source', 'controller', 'transformer', 'reducer', 'display', 'effector', 'ai'];
const ALLOWED_TIME_SCOPES = ['month', 'range', 'day', 'point'];

test('manifest is v4 with a full catalog', () => {
  // The version moves when the catalog's *content* changes, not when the generator runs: the Ask cache keys on it,
  // so a reader that cached a plan built from v3 is not answered from v4. v3 → v4 is ISSUE-140 — the catalog gained
  // the value lists it had been silently dropping (the SPARQL presets), plus three hints and placeholders the text
  // parser had mangled.
  assert.equal(manifest.version, 4);
  assert.ok(manifest.widgetCount >= 35, `widgetCount ${manifest.widgetCount} >= 35`);
  assert.equal(manifest.widgets.length, manifest.widgetCount);
  const ids = manifest.widgets.map((w) => w.id);
  assert.equal(new Set(ids).size, ids.length, 'widget ids are unique');
});

test('no field text is truncated at an apostrophe, escaped, or lost (the v2 bug, widened)', () => {
  // The v2 bug was truncation at an apostrophe; it was fixed for `description` and then survived for years in the two
  // properties nobody checked. ISSUE-140 found the survivors: wikiBox.page's hint ended as the literal text `\u2019`,
  // wikiBox.linkAction's hint was cut mid-token at 132 characters, and map.points' hint was missing entirely — all
  // three the text parser's doing, all three repaired by reading the registry instead. So the guard now covers every
  // property a reader can see, and it looks for the escapes the parser published as text rather than for a trailing
  // backslash alone.
  const TEXTY = ['description', 'hint', 'placeholder', 'label'];
  const damaged = /\\[a-z0-9]/i;   // a leaked escape sequence: \u2019, \n, \'
  for (const w of manifest.widgets) {
    const pairs = [[w.id, w, TEXTY], ...(w.configFields || []).map((f) => [`${w.id}.${f.key}`, f, TEXTY])];
    for (const [label, obj, keys] of pairs) {
      for (const k of keys) {
        const v = obj[k];
        if (typeof v !== 'string') continue;
        assert.ok(!v.endsWith('\\'), `${label}.${k}: ends with a stray backslash: ${v}`);
        assert.ok(!v.includes("\\'"), `${label}.${k}: unescaped apostrophe artifact: ${v}`);
        assert.ok(!damaged.test(v), `${label}.${k}: a leaked escape is published as text: ${v}`);
      }
    }
  }
  const fl = byId.get('filterLines').description;
  assert.ok(fl.length > 50 && fl.includes('output'), `filterLines description restored: ${fl}`);
  // The three ISSUE-140 recoveries, named so they cannot silently regress to empty or truncated again.
  const field = (id, key) => (manifest.widgets.find((w) => w.id === id).configFields || []).find((f) => f.key === key);
  assert.ok(field('map', 'points').hint.length > 60, 'map.points keeps its hint (it had none at all)');
  assert.ok(field('wikiBox', 'linkAction').hint.includes('#selection}'),
    'wikiBox.linkAction keeps its whole hint (it was cut mid-token)');
  assert.ok(field('wikiBox', 'page').hint.includes('\u2019'),
    'wikiBox.page keeps a real apostrophe (U+2019), not the literal \\u2019 the text parser published');
});

test('a multi-channel widget says what its bare id means (the compatibility rule)', () => {
  // Channels were added as a *compatible* change: `{{widget:id}}` must keep meaning what it always meant. A widget
  // that publishes several things therefore declares which one the bare id is — the Article Excerpt taught this the
  // hard way by emptying the bare id, which left `translate` in the demo waiting for a value forever.
  for (const w of manifest.widgets) {
    const channels = NAMED(w.outputs).map(([name]) => name);
    if (!channels.length) continue;
    assert.ok(w.primary, `${w.id} names several channels without saying which one the bare id means`);
    assert.ok(channels.includes(w.primary), `${w.id}: primary "${w.primary}" is not one of its channels`);
  }
});

test('a widget that emits prose declares where the prose came from (ISSUE-92)', () => {
  // The one shape that cannot self-describe: an `extract` is text, so nothing inside it says which page or which
  // wiki it came from. A widget that publishes one therefore has to publish a `reference` beside it — this is the
  // gate that stops a new emitter quietly dropping the context again, the way `excerpt` did for months.
  const prose = manifest.widgets.filter((w) => w.outputs && Object.values(w.outputs).includes('extract'));
  assert.ok(prose.length > 0, 'the registry should still have a prose emitter to check');
  for (const w of prose) {
    assert.ok(w.outputs.reference, `${w.id} emits prose without a reference channel`);
    assert.equal(w.outputs.reference, 'value', `${w.id}: the reference channel is a value`);
  }
});

test('a project or language field uses the picker, not a hardcoded list (ISSUE-93)', () => {
  // The sweep this protects: five widgets once offered 6, 3, 2, 13 and 30 options while the site matrix holds 364
  // wikis and 374 languages. A new widget that types out its own list is how that happened, so the registry is
  // checked rather than trusted — a hand-rolled `select` for `project`, `wiki` or `lang` fails the build.
  // A field named project/wiki/lang holds one of two DIFFERENT vocabularies, and it must say which:
  //   · a wiki          → `type: 'project'`, the shared picker (364 wikis, ordered, searchable)
  //   · a speech tag    → `type: 'text', vocab: 'bcp47'`, matched against the device's voices (the 🔊 Speaker)
  // The second is only for a value that is *not* a wiki. Note it must be `text`: a `select` of language tags
  // would be the same hardcoded list this test exists to prevent, kept in code instead of in the registry.
  const offenders = [];
  for (const w of manifest.widgets) {
    for (const f of w.configFields || []) {
      if (!['project', 'wiki', 'lang'].includes(f.key)) continue;
      if (f.type === 'project') continue;
      if (f.vocab === 'bcp47' && f.type === 'text') continue;
      offenders.push(`${w.id}.${f.key}: type "${f.type}"${f.vocab ? `, vocab "${f.vocab}"` : ''}`);
    }
  }
  assert.deepEqual(offenders, [], `a project/language field must use the shared picker (type: 'project'), or declare a non-wiki vocabulary (type: 'text', vocab: 'bcp47'):\n  ${offenders.join('\n  ')}`);
});

test('the emitters declare their output kinds', () => {
  for (const [id, spec] of Object.entries(KNOWN_EMITTERS)) {
    const w = byId.get(id);
    assert.ok(w, `emitter ${id} exists`);
    assert.ok(w.outputs, `${id} declares outputs`);
    // ISSUE-96: `kind` is the bare id's shape and `subject` its thing; the named channels (ISSUE-92) sit beside
    // them. A widget may carry any combination — this pins every part each known emitter is expected to have.
    assert.ok(typeof w.outputs.kind === 'string' && w.outputs.kind, `${id} declares outputs.kind`);
    assert.ok(OUTPUT_KINDS.includes(w.outputs.kind), `${id}: kind "${w.outputs.kind}" is documented`);
    if (typeof spec === 'string') {
      assert.equal(w.outputs.kind, spec, `${id} outputs.kind === '${spec}'`);
    } else {
      if (spec.kind) assert.equal(w.outputs.kind, spec.kind, `${id} outputs.kind === '${spec.kind}'`);
      if (spec.subject) assert.equal(w.outputs.subject, spec.subject, `${id} outputs.subject === '${spec.subject}'`);
      if (spec.denotes) assert.equal(w.outputs.denotes, spec.denotes, `${id} outputs.denotes === '${spec.denotes}'`);
      for (const [channel, ck] of Object.entries(spec.channels || {})) {
        assert.equal(w.outputs[channel], ck, `${id}: channel "${channel}" === '${ck}'`);
      }
    }
  }
});

test('source-consuming widgets are flagged and documented', () => {
  for (const id of ['filterLines', 'lineCount', 'echo']) {
    const w = byId.get(id);
    assert.equal(w.consumesSource, true, `${id} consumesSource`);
    const sourceField = w.configFields.find((f) => f.key === 'source');
    assert.ok(sourceField, `${id} has a source config field`);
    assert.equal(sourceField.type, 'source');
    assert.ok(sourceField.label, `${id} source field has a label`);
    assert.ok(sourceField.hint, `${id} source field has a hint`);
  }
  // non-consumers must not be flagged
  for (const id of ['excerpt', 'listSource', 'translate', 'categorySize']) {
    assert.equal(byId.get(id).consumesSource, false, `${id} not consumesSource`);
  }
});

test('every widget carries a valid nodeKind and timeScope', () => {
  for (const w of manifest.widgets) {
    assert.ok(ALLOWED_NODE_KINDS.includes(w.nodeKind), `${w.id} nodeKind ${w.nodeKind} valid`);
    assert.ok(ALLOWED_TIME_SCOPES.includes(w.timeScope), `${w.id} timeScope ${w.timeScope} valid`);
  }
  for (const [id, kind] of Object.entries(KNOWN_NODE_KINDS)) {
    assert.equal(byId.get(id).nodeKind, kind, `${id} nodeKind === ${kind}`);
  }
});

test('config fields are well-formed and documented', () => {
  for (const w of manifest.widgets) {
    for (const f of w.configFields) {
      assert.equal(typeof f.key, 'string', `${w.id} field key`);
      assert.ok(f.key.length > 0);
      assert.equal(typeof f.type, 'string', `${w.id} field ${f.key} type`);
      if (f.type === 'source') assert.ok(f.hint, `${w.id} ${f.key} source field documented`);
    }
  }
});


test('a consumer’s declared kinds are documented, and something publishes them (ISSUE-132)', () => {
  // The consumer side of the emitter contract: a field that says `kinds: ['geojson']` narrows the source picker, so the
  // kinds have to be real and *producible* — a field wired only to nothing would look like an empty dropdown.
  const DOCUMENTED = OUTPUT_KINDS;
  const published = new Set();
  for (const w of manifest.widgets) {
    for (const kind of declaredOutputKinds(w.outputs)) published.add(kind);
  }
  let declared = 0;
  for (const w of manifest.widgets) {
    for (const f of w.configFields || []) {
      if (!f.kinds) continue;
      declared += 1;
      for (const kind of f.kinds) {
        assert.ok(DOCUMENTED.includes(kind), `${w.id}.${f.key}: kind “${kind}” is not documented`);
        assert.ok(published.has(kind), `${w.id}.${f.key}: accepts “${kind}” but no widget in the catalog publishes it`);
      }
    }
  }
  assert.ok(declared >= 4, `expected several kind-aware source fields (map's geometry input, the filter, the counter, the speaker), found ${declared}`);
  // …and no documented kind may be *dead*: a kind in the list that nothing publishes is a label the doc and the
  // pickers offer for nothing (ISSUE-97 — this is what makes the list load-bearing rather than a description).
  const dead = OUTPUT_KINDS.filter((k) => !published.has(k));
  assert.deepEqual(dead, [], `documented output kinds nothing publishes: ${dead.join(', ')}`);
  // ISSUE-96 extends "no dead kind" to CONSUMPTION: a documented kind no `source` field ever accepts is legal
  // only when it is deliberately named here — a picker of one widget would be worse than no picker.
  const INTENTIONALLY_UNCONSUMED_KINDS = {
    extract: 'consumed through {{widget:id}} interpolation and text fields (the prose rule, ISSUE-92) rather than a source field',
  };
  const accepted = new Set();
  for (const w of manifest.widgets) {
    for (const f of w.configFields || []) if (f.kinds) for (const k of f.kinds) accepted.add(k);
  }
  const unconsumed = OUTPUT_KINDS.filter((k) => !accepted.has(k) && !(k in INTENTIONALLY_UNCONSUMED_KINDS));
  assert.deepEqual(unconsumed, [], `documented output kinds nothing consumes (and nothing lists as intentionally unconsumed): ${unconsumed.join(', ')}`);
});

test('emitter output kinds stay within the documented set (emitter contract)', () => {
  // docs/WIDGET-DEVELOPMENT.md -> "The Emitter Contract": a new output kind is a
  // design act (a real consumer, doc entries, an askManual() phrase, a size
  // policy) — this allowlist makes that decision loud instead of accidental.
  const DOCUMENTED = OUTPUT_KINDS;
  for (const w of manifest.widgets) {
    if (!w.outputs) continue;
    const kinds = declaredOutputKinds(w.outputs);
    for (const one of kinds) assert.ok(
      DOCUMENTED.includes(one),
      `${w.id}: output kind "${one}" is not in the documented set [${DOCUMENTED.join(', ')}] — `
      + 'see docs/WIDGET-DEVELOPMENT.md "The Emitter Contract" (and docs/MEDIA-DATAFLOW.md for non-text outputs)',
    );
  }
});

test('every declared output subject is a thing kind, and something consumes it (ISSUE-96)', () => {
  // The second dimension: what a producer's value is ABOUT. Drawn from the same vocabulary the ⚙ brush validates
  // (KIND_IDS), and consumed — through the kind hierarchy — by at least one consumer's thing field, or listed as
  // intentionally unconsumed. A subject nothing consumes is a label the menu would offer for nothing.
  // The manifest does not carry a field's `kind` (it is the ⚙ brush's vocabulary, not the catalog's), so the
  // consumer side is read from the registry itself.
  const consumers = new Set();
  for (const def of Object.values(WIDGET_TYPES)) for (const f of def.configFields || []) if (f.kind) consumers.add(f.kind);
  const INTENTIONALLY_UNCONSUMED_SUBJECTS = {};
  let declared = 0;
  for (const w of manifest.widgets) {
    if (!w.outputs || !('subject' in w.outputs)) continue;
    declared += 1;
    const s = w.outputs.subject;
    assert.ok(KIND_IDS.includes(s), `${w.id}: subject "${s}" is not in [${KIND_IDS.join(', ')}]`);
    const consumed = [...consumers].some((k) => kindsAccepting(s).includes(k));
    assert.ok(consumed || s in INTENTIONALLY_UNCONSUMED_SUBJECTS,
      `${w.id}: subject "${s}" is consumed by no consumer kind field and is not listed as intentionally unconsumed`);
  }
  assert.ok(declared >= 4, `expected several producers to declare a subject, found ${declared}`);
});

test('a declared output subject also declares what the value IS (denotes) — the third axis (ISSUE-96)', () => {
  // A subject answers "what is this value ABOUT"; it does not answer "what IS it". Two producers can name the same
  // article and publish different things — its name, or a paragraph about it — and only the value-form tells them
  // apart. The empirical case (2026-10-07): the Article Excerpt (subject article, value PROSE) was offered to a
  // gallery's `article` field, and the paragraph landed in the title slot. So a subject and a `denotes` TRAVEL
  // TOGETHER: a producer that names a thing must say what its value is, or the spawn menu cannot match it (it
  // fails closed). This gate is what makes `denotes` a required axis rather than an optional label.
  let paired = 0;
  for (const w of manifest.widgets) {
    const out = w.outputs;
    if (!out) continue;
    const hasSubject = 'subject' in out;
    const hasDenotes = 'denotes' in out;
    if (hasSubject) {
      paired += 1;
      assert.ok(VALUE_KINDS.includes(out.denotes),
        `${w.id}: declares a subject but its denotes "${out.denotes}" is not in [${VALUE_KINDS.join(', ')}]`);
    } else {
      assert.ok(!hasDenotes, `${w.id}: declares a denotes with no subject — there is no thing for it to be about`);
    }
  }
  assert.ok(paired >= 4, `expected several producers to pair a subject with a denotes, found ${paired}`);
  // The two axes are independent: same subject, different value-form.
  assert.equal(byId.get('excerpt').outputs.subject, 'article');
  assert.equal(byId.get('excerpt').outputs.denotes, 'prose');
  assert.equal(byId.get('cimStats').outputs.denotes, 'name');
  assert.equal(byId.get('cimRanking').outputs.denotes, 'list');
});

test('the four publishers that declare a kind only now (ISSUE-96)', () => {
  // excerpt, gallery, wikiBox and translate published NAMED channels but no `kind`, so a matcher reading
  // `outputs.kind` could not see them. Each now names the bare id's kind, keeping its channels and its primary.
  const expected = { excerpt: 'extract', gallery: 'lines', wikiBox: 'lines', translate: 'value' };
  for (const [id, kind] of Object.entries(expected)) {
    const w = byId.get(id);
    assert.equal(w.outputs.kind, kind, `${id}.outputs.kind`);
    assert.ok(NAMED(w.outputs).length >= 2, `${id} keeps its named channels`);
    assert.ok(w.primary && w.outputs[w.primary] === kind, `${id}: the bare id's kind matches its primary channel`);
  }
});

test('the manifest projects the registry’s configFields exactly (generator completeness)', () => {
  // The manifest is generated by TEXT-PARSING src/widgets/index.js (scripts/generate-manifest.mjs), because a JSON
  // pipeline cannot import the registry. Text parsing can silently MISS a field — 2026-10-03: CIM_MONTH_FIELD sat
  // last in the CIM arrays, after inline fields carrying nested brackets, and a first-']' capture truncated the
  // scan there, so `month` vanished from all three CIM entries — and the Ask advisor reads the manifest, so a
  // missed field is a question the advisor can no longer ask. This compares against the registry's OWN field
  // objects (imported, not re-parsed), so any future generator gap fails here by name. Compared as a set: the
  // generator appends resolved shared constants after the inline fields, so order is not preserved (cosmetic —
  // the ⚙ panel reads the registry, not the manifest).
  for (const w of manifest.widgets) {
    const def = WIDGET_TYPES[w.id];
    assert.ok(def, `${w.id}: in the manifest but not the registry`);
    const want = [...new Set((def.configFields || []).map((f) => f.key))].sort();
    const got = [...new Set((w.configFields || []).map((f) => f.key))].sort();
    assert.deepEqual(got, want, `${w.id}: manifest configFields must be every field the registry declares`);
    // ISSUE-140: the keys were compared and the VALUES were not — so a field whose list the generator could not read
    // (a computed `options: SOMETHING.map(…)`, the SPARQL presets) shipped with no values at all, and nothing failed.
    // The values are contract: an author chooses from them, the served guide prints them, the MCP catalog serves them.
    for (const f of def.configFields || []) {
      // `''` is a legitimate value here (linkcount.namespace's "All namespaces"), so this filters only the values that
      // cannot be offered at all — `.filter(Boolean)` would quietly drop it and then fail against a correct manifest.
      const wantVals = (f.options || []).map((o) => (typeof o === 'string' ? o : o.value))
        .filter((v) => v !== undefined && v !== null);
      const mf = (w.configFields || []).find((x) => x.key === f.key);
      assert.ok(mf, `${w.id}.${f.key}: missing from the manifest`);
      assert.deepEqual(mf.options || [], wantVals,
        `${w.id}.${f.key}: the manifest must carry every value the registry declares`);
    }
  }
});
