/**
 * The board-assembly contract — what must be true of ANY reply the advisor returns (the Ask audit's fix #7, 2026-10-02).
 *
 * The audit's own probes were throwaway, and `tests/board-fixtures.mjs` scores *options* (suggest mode). Nothing
 * asserted the BOARD contract offline — which is how the 2026-10-01 defect got through: `validateAssembly` pruned the
 * app's own `id#channel` references, so the canonical `excerpt → translate → speaker` chain silently lost its third
 * card in 3/3 runs, and only a live run against the model could reveal it.
 *
 * This test is the offline half. It does not call the model — the replies are frozen (`tests/assembly-fixtures.mjs`,
 * 18 replies from three runs of the assembly suite on 2026-10-01) — and it asserts the two things that must hold
 * whatever the model writes:
 *
 *   1. **The validator survives it.** No reply may throw, a non-JSON reply degrades to no board rather than an error,
 *      and every board it produces holds together: unique ids, registered types, and every reference (§5 of the board
 *      guide) resolvable *inside the board that survives*.
 *   2. **The app can load it.** The same fragment, applied the way `App.handleAddAssembly` applies it (widgets plus a
 *      layout built from their `w`/`h`, params merged), passes `validateDashboard` with no errors — which is the
 *      strongest available statement that the advisor's output is not merely well-shaped JSON.
 *
 * A test that asserts this must also be able to FAIL: the named case below is the exact defect that motivated it, and
 * deleting the channel-awareness in `validateAssembly` makes it fail with "the canonical chain lost its speaker".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ASSEMBLY_REPLIES } from './assembly-fixtures.mjs';
import { validateAssembly, manifestIds } from '../deploy/server.js';
import { validateDashboard } from '../src/lib/dashboardConfig.js';
import { findUnresolvedRefs } from '../src/lib/params.js';

const manifest = JSON.parse(await readFile(join(process.cwd(), 'public', 'manifest.json'), 'utf8'));
const defs = manifestIds(manifest);

const parsedOf = (reply) => {
  try {
    const p = JSON.parse(reply.raw);
    return p && typeof p === 'object' ? p : null;
  } catch { return null; }
};

/** The reply as the server sees it: JSON, or nothing at all (it parses in a try and passes `null` on failure). */
const boardOf = (reply) => validateAssembly(parsedOf(reply), defs);

/** Every reference a widget makes: `{{widget:id#channel}}` placeholders, and `source` fields (bare id, maybe #channel). */
function referencesOf(widget, def) {
  const out = findUnresolvedRefs(widget.config || {}).filter((r) => r.kind === 'widget')
    .map((r) => ({ id: r.name, channel: r.channel, where: `${widget.id}: ${r.raw}` }));
  for (const f of def?.configFields || []) {
    if (f.type !== 'source') continue;
    const v = widget.config?.[f.key];
    if (typeof v !== 'string' || !v.trim() || v.includes('{{')) continue;
    const [id, channel] = v.trim().split('#');
    out.push({ id, channel: channel || null, where: `${widget.id}: ${f.key}` });
  }
  return out;
}

test('no frozen reply makes the validator throw — including the three that are not JSON at all', () => {
  for (const reply of ASSEMBLY_REPLIES) {
    assert.doesNotThrow(() => boardOf(reply), `${reply.id} (${reply.run}) threw`);
    if (!reply.parses) {
      // The graceful path: the server passes `null` down, and no board comes back. It must not be a crash, and it
      // must not be a half-built board either.
      const b = boardOf(reply);
      assert.ok(b === null || b === undefined || Array.isArray(b?.widgets) === false || b.widgets.length === 0,
        `${reply.id} (${reply.run}): a non-JSON reply produced a board`);
    }
  }
});

test('every board the validator accepts holds together (ids, types, references)', () => {
  let checked = 0;
  for (const reply of ASSEMBLY_REPLIES) {
    if (!reply.parses) continue;
    const board = boardOf(reply);
    if (!board?.widgets?.length) continue;   // a reply the validator refused entirely is reported by the case below
    checked++;
    const where = `${reply.id} (${reply.run})`;
    const widgets = board.widgets;
    assert.ok(widgets.length >= 2, `${where}: a board of fewer than 2 cards is not a board`);

    const ids = widgets.map((w) => w.id);
    assert.equal(new Set(ids).size, ids.length, `${where}: duplicate widget ids`);
    for (const w of widgets) {
      const def = defs.get(w.widgetType);
      assert.ok(def, `${where}: unknown widgetType "${w.widgetType}"`);
      assert.ok(w.id && typeof w.id === 'string', `${where}: a widget without an id`);
    }
    // The invariant the 2026-10-01 defect violated: after pruning, nothing left may point at something gone.
    for (const w of widgets) {
      for (const ref of referencesOf(w, defs.get(w.widgetType))) {
        assert.ok(ids.includes(ref.id), `${where}: ${ref.where} → "${ref.id}" is not on the surviving board`);
        if (ref.channel) {
          const out = defs.get(widgets.find((x) => x.id === ref.id).widgetType)?.outputs || {};
          assert.ok(ref.channel in out && ref.channel !== 'kind' && ref.channel !== 'subject' && ref.channel !== 'denotes',
            `${where}: ${ref.where} → channel "${ref.channel}" is not published by "${ref.id}"`);
        }
      }
    }
  }
  assert.ok(checked >= 12, `expected most of the 15 JSON replies to yield a board, only ${checked} did`);
});

test('the app can load every board the validator accepts (the handleAddAssembly path)', () => {
  let loaded = 0;
  for (const reply of ASSEMBLY_REPLIES) {
    if (!reply.parses) continue;
    const board = boardOf(reply);
    if (!board?.widgets?.length) continue;
    const dashboard = {
      version: 1,
      params: board.params || {},
      widgets: board.widgets,
      // What `handleAddAssembly` does with a fragment: a layout built from the widget's own `w`/`h`.
      layout: board.widgets.map((w, i) => ({ i: w.id, x: 0, y: i * 4, w: w.w ?? 6, h: w.h ?? 4 })),
    };
    const r = validateDashboard(dashboard);
    assert.deepEqual(r.errors, [], `${reply.id} (${reply.run}): the app refuses it — ${r.errors.join('; ')}`);
    assert.ok(r.valid, `${reply.id} (${reply.run}): validateDashboard says invalid`);
    loaded++;
  }
  assert.ok(loaded >= 12, `expected the app to load most of the replies, only ${loaded} were loadable`);
});

test('the canonical chain keeps its speaker — the exact defect this file was written for', () => {
  // On 2026-10-01 this failed 3/3: the model wired the speaker as `source: "…-translation#speech"` (the app's own
  // channel form, ISSUE-91), `validateAssembly` looked the whole string up in the id set, called it dangling and
  // deleted the card. Re-break that and this test says so, by name.
  const cases = ASSEMBLY_REPLIES.filter((r) => r.id === 'chain-summary-translate-speak');
  assert.equal(cases.length, 3, 'expected three runs of the canonical chain in the frozen replies');
  for (const reply of cases) {
    const board = boardOf(reply);
    assert.ok(board?.widgets?.length === 3,
      `the canonical chain lost a card (${reply.run}): got ${board?.widgets?.length ?? 0} — ${(board?.warnings || []).join('; ')}`);
    const types = board.widgets.map((w) => w.widgetType);
    assert.deepEqual(types, ['excerpt', 'translate', 'speaker'], `${reply.run}: ${types.join(' → ')}`);
  }
});
