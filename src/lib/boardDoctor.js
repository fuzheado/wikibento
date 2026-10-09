/**
 * The board doctor — ONE verdict for a board that came from outside.
 *
 * Why this exists. The Ask audit (docs/ASK-ARCHITECTURE.md) measured what an outside producer gets wrong: given only the
 * catalog it picked the right widget **93%** of the time and produced a usable envelope **0%** of the time (48/48
 * misses). The repair is a served contract — `public/board-guide.md`, built by `npm run guide:board` — plus a way to
 * CHECK the result. This module is the check.
 *
 * It is deliberately the app's own machinery rather than a second opinion about it:
 *
 *   - shape, widget types and configs → `validateDashboard`, the same function the ⬆ Import panel, the `?config=`
 *     loader and localStorage restore call;
 *   - placeholders → `findUnresolvedRefs`, the same grammar `resolveParams` substitutes;
 *   - channels and what a bare id means → the registry's own `outputs`/`primary`, which is what the ⚙ source picker
 *     offers;
 *   - gates (relay-needed, experimental, precomputed-only data) → the same registry facts the manifest carries.
 *
 * Callers: `npm run check:board` (a person pasting a chat's JSON) and — Slice 2 of the door — an `/api/validate` route,
 * which ships this file **bundled** beside `server.js` (the tool has no `src/`; see docs/ASK-ARCHITECTURE.md).
 *
 * The four severities are the ones docs/JSON-FORMAT.md documents, and nothing here invents a fifth:
 *
 *   errors    the board cannot be loaded (an unregistered type, no `layout`, a reference to nothing)
 *   repairs   it loads, and the app will silently fix this (a coerced type, a dropped unknown key)
 *   warnings  it loads and will probably not do what the author meant (an ignored field, an undeclared param)
 *   notes     it loads and is fine — but the author should know (this type needs the relay, this one is experimental)
 *
 * The classification of a mistyped config value is the APP's, not this module's: docs/JSON-FORMAT.md calls `"200"` for a
 * number *Repairable*, while `validateDashboard` puts it in errors and so ⬆ Import refuses the board. The doctor reports
 * what the app will do (filed as ISSUE-134), because a checker that disagrees with the thing it checks is worse than no
 * checker at all.
 */
import { validateDashboard } from './dashboardConfig';
import { outputChannels } from './dataflow';
import { widgetDef } from '../widgets';
import { findUnresolvedRefs } from './params';

const ART = 'public/board-guide.md';   // where a reader looks it up (served at /board-guide.md)

/** A reference may name a channel: `id#selection` (ISSUE-91). */
const splitRef = (ref) => {
  const [id, channel] = String(ref).split('#');
  return { id, channel: channel || null };
};

/**
 * What a widget publishes, as data — `{ name, kind, primary }[]`, or null when it publishes nothing. The first version
 * returned prose, and the message built from it read "the bare id means the bare id → `#lines`" (2026-10-02, visible
 * the first time it ran against a real board).
 */
const channelsOf = (def) => {
  const out = def?.outputs;
  if (!out) return null;
  // ISSUE-96: `kind`/`subject` are metadata; the named channels are every other key. A publisher may have BOTH
  // (a kind plus channels), so this no longer branches on the mere presence of `kind`.
  const channels = Object.entries(outputChannels(out));
  if (channels.length) return channels.map(([name, kind]) => ({ name, kind, primary: name === def.primary }));
  return out.kind ? [{ name: null, kind: out.kind, primary: true }] : null;
};

/** …and the same facts as a phrase for a message. */
const describeChannels = (chans) => chans
  .map((c) => (c.name === null ? `the bare id (\`${c.kind}\`)` : `\`#${c.name}\` (\`${c.kind}\`${c.primary ? ', the bare id' : ''})`))
  .join(' · ');

/** Categories are compared the way the CIM gate compares them: underscores and case are noise. */
const normCategory = (s) => String(s || '').replace(/_/g, ' ').trim().toLowerCase();

/**
 * @param {string|object} input  board JSON (text is fine — `validateDashboard` parses it, with a friendly error)
 * @param {{allowList?: Set<string>|null, source?: string}} [opts]  `allowList` = the CIM snapshot's category names
 * @returns {{verdict: string, errors: object[], repairs: object[], warnings: object[], notes: object[],
 *            widgets: object[]|null, layout: object[]|null, params: object|null, summary: string}}
 */
export function diagnoseBoard(input, { allowList = null, source = 'board' } = {}) {
  const errors = [];
  const repairs = [];
  const warnings = [];
  const notes = [];
  const add = (list, code, message) => list.push({ code, message });

  // Parsed here too, not only inside `validateDashboard`: the fragment diagnosis below has to look at the OBJECT, and
  // the commonest way a board arrives (from a chat, a file, a pipe) is as text. `validateDashboard` still gets the raw
  // string when it does not parse, so its friendly "Not valid JSON: …" is what a caller sees for malformed input.
  let board = input;
  if (typeof input === 'string') {
    try { board = JSON.parse(input); } catch { board = input; }
  }
  const v = validateDashboard(input);
  // `validateDashboard` already reports unreadable JSON, a missing `widgets`/`layout`, an unknown type, and every
  // repair it performs (a coerced number, a dropped unknown key) — so its verdicts are taken as given.
  for (const m of v.errors) add(errors, 'shape', m);
  // `validateDashboard` reports the severity model's three rows in three lists (2026-10-02): errors refuse the board,
  // repairs are what the app normalises and reports, warnings are judgements about a board that will load. The doctor
  // used to funnel its warnings into `repairs`, which made every judgement look like a silent fix.
  for (const m of v.repairs || []) add(repairs, 'repair', m);
  for (const m of v.warnings) add(warnings, 'not-as-meant', m);

  if (!v.valid || !v.widgets) {
    // The one shape error worth naming precisely, because it is the commonest: the Ask advisor's *fragment* (widgets
    // carrying their own `w`/`h`) is not what ⬆ Import accepts — that wants a separate `layout` array.
    if (typeof board === 'object' && board && Array.isArray(board.widgets)
      && !Array.isArray(board.layout) && board.widgets.some((w) => w && (w.w != null || w.h != null))) {
      add(errors, 'fragment-not-board',
        'this is the ADVISOR FRAGMENT shape (widgets carrying `w`/`h`), not a board: ⬆ Import needs a top-level '
        + '`layout` array whose `i` values match the widget ids (board guide §1, rule 1)');
    }
    return finish('unusable', errors, repairs, warnings, notes, null, null, null, source);
  }

  const { widgets, layout, params } = v;
  const ids = new Set(widgets.map((w) => w.id));
  const declaredParams = new Set(Object.keys(params || {}));
  const idList = [...ids];

  for (const w of widgets) {
    // `widgetDef` already resolves every retired id and returns the registry entry for a current one, so the
    // `|| WIDGET_TYPES[…]` fallback this used to carry was dead code — and reading the raw table is the habit
    // that broke retired ids in the renderer (ISSUE-142).
    const def = widgetDef(w.widgetType);
    const config = w.config || {};
    const where = `"${w.id}" (${w.widgetType})`;

    // ── references: `{{widget:id}}`, `{{param}}`, and the bare `source` fields (which take `id` or `id#channel`) ──
    const refs = findUnresolvedRefs(config);
    for (const r of refs) {
      if (r.kind === 'param') {
        if (!declaredParams.has(r.name)) {
          add(warnings, 'undeclared-param',
            `${where}: \`${r.raw}\` names a board parameter that is not declared in \`params\` — it will render as the `
            + 'literal text, which then goes to the API as if it were content (board guide §5)');
        }
        continue;
      }
      checkRef(r.name, r.channel, where, def);
    }
    for (const f of def?.configFields || []) {
      if (f.type !== 'source') continue;
      const value = config[f.key];
      if (typeof value !== 'string' || !value.trim() || value.includes('{{')) continue;
      const { id, channel } = splitRef(value.trim());
      checkRef(id, channel, `${where} field \`${f.key}\``, def);
    }

    /** Every reference answers the same two questions: is the id on this board, and does it publish that channel? */
    function checkRef(refId, channel, at, consumerDef) {
      if (!ids.has(refId)) {
        add(errors, 'dangling-widget-ref',
          `${at}: references \`${refId}${channel ? `#${channel}` : ''}\`, which is not a card on this board — the card `
          + `that consumes it is dropped (board guide §5). The ids here are: ${idList.join(', ') || '(none)'}`);
        return;
      }
      const producerWidget = widgets.find((x) => x.id === refId);
      const producer = widgetDef(producerWidget.widgetType);
      const chans = channelsOf(producer);
      if (channel) {
        const known = chans && chans.some((c) => c.name === channel);
        if (!known) {
          add(errors, 'unknown-channel',
            `${at}: \`${refId}#${channel}\` asks for a channel that \`${refId}\` (${producer?.name || 'that type'}) does not `
            + `publish — it publishes ${chans ? describeChannels(chans) : 'nothing'} (board guide §5)`);
        }
      } else if (!chans) {
        add(warnings, 'consumer-not-publisher',
          `${at}: \`${refId}\` publishes nothing, so this wiring will stay empty (board guide §5)`);
      } else if (chans.length > 1) {
        const prim = chans.find((c) => c.primary) || chans[0];
        add(notes, 'bare-id-means-primary',
          `${at}: \`${refId}\` publishes several channels, so the bare id means \`#${prim.name}\` (\`${prim.kind}\`) — `
          + `write \`${refId}#${chans.find((c) => !c.primary)?.name}\` to choose another`);
      }
    }

    // ── a field the card will IGNORE while another field is set to something else (`showIf`) ──
    for (const f of def?.configFields || []) {
      const cond = f.showIf;
      if (!cond || config[f.key] === undefined) continue;
      for (const [selector, allowed] of Object.entries(cond)) {
        const current = config[selector] ?? def.defaults?.[selector] ?? def.configFields.find((x) => x.key === selector)?.options?.[0]?.value;
        const ok = Array.isArray(allowed) ? allowed.includes(current) : current === allowed;
        if (!ok) {
          const wants = Array.isArray(allowed) ? allowed.join(' | ') : allowed;
          add(warnings, 'ignored-field',
            `${where}: \`${f.key}\` is ignored while \`${selector}\` is \`${current}\` — it applies when it is \`${wants}\` `
            + '(board guide §2 marks these with "only when")');
        }
      }
    }

    // ── gates: facts about this TYPE that decide whether the card can load at all ──
    const ds = String(def?.dataSource || '');
    if (ds.startsWith('CIM ')) {
      const cat = config.category ?? config.file;
      if (typeof cat === 'string' && cat && !cat.includes('{{')) {
        if (!allowList) {
          add(notes, 'cim-unknown', `${where}: reads precomputed Commons Impact Metrics — those exist only for a curated allow list of categories (board guide §3)`);
        } else if (!allowList.has(normCategory(cat))) {
          add(warnings, 'cim-not-listed',
            `${where}: "${cat}" is not on the Commons Impact Metrics allow list, so this card will report no data — for `
            + 'any other category use `glamorgan` or `categorySize`, which are live (board guide §3)');
        }
      }
    }
    if (def?.needsRelay) {
      add(notes, 'needs-relay', `${where}: asks this deployment's relay, so it renders in WikiBento rather than on a third-party host (board guide §3)`);
    }
    if (def?.experimental) {
      add(notes, 'experimental', `${where}: marked experimental — shipped, but not yet proven in the field`);
    }
  }

  // ── board-level observations ──
  const hasControls = widgets.some((w) => w.widgetType === 'boardControls');
  if (declaredParams.size && !hasControls) {
    add(notes, 'params-without-controls',
      `\`params\` declares ${declaredParams.size} parameter(s) but there is no \`boardControls\` card, so nothing on the board can change them `
      + '(the board guide\'s §1 example uses one)');
  }
  if (hasControls && !declaredParams.size) {
    add(notes, 'controls-without-params', 'a `boardControls` card is present but `params` declares nothing, so it has nothing to drive');
  }

  // `clean` means nothing to say at all (notes are informational). A board with only warnings is importable — and the
  // summary must not greet it with a ✅, which the first version did ("✅ importable — 0 errors, 1 warning").
  const verdict = errors.length ? 'unusable' : (repairs.length || warnings.length) ? 'importable' : 'clean';
  return finish(verdict, errors, repairs, warnings, notes, widgets, layout, params, source);
}

function finish(verdict, errors, repairs, warnings, notes, widgets, layout, params, source) {
  const n = (list) => (list.length === 1 ? '1' : String(list.length));
  const summary = verdict === 'unusable'
    ? `✘ not importable — ${n(errors)} error(s)`
    : `${verdict === 'clean' ? '✅' : '⚠'} importable — ${n(repairs)} repair(s), ${n(warnings)} warning(s), `
      + `${n(notes)} note(s)${notes.length ? ' (notes are not problems)' : ''}`;
  return {
    verdict, errors, repairs, warnings, notes, widgets, layout, params,
    counts: { widgets: widgets?.length || 0, errors: errors.length, repairs: repairs.length, warnings: warnings.length, notes: notes.length },
    summary,
    source,
    // Where a reader finds the rule each class of finding comes from.
    guide: ART,
  };
}
