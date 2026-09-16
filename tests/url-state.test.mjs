/**
 * URL state — the contract, the helpers, and the one-writer rule (ISSUE-87).
 *
 * The last suite in this file is the interesting one: it reads `src/` and fails if a second place starts
 * writing history or reading `location.search`. The two bugs this issue came from were both silent —
 * a stale `?config=` in the address bar, and a QR code built from that stale claim — and both would have
 * been caught by these tests, because both were "the URL says one thing, the board says another".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  TIERS, URL_STATE_CONTRACT, NEVER_IN_URL, READ_PARAMS, BOARD_CLAIM_PARAMS, EMBED_HASH_RE,
  parseUrlState, boardClaim, boardFingerprint, claimIsFresh, stripBoardClaim, setParams, applyUrl,
  sameUrl,
} from '../src/lib/urlState.js';

const file = (p) => readFileSync(join(process.cwd(), p), 'utf8');

// ── the contract as data ──────────────────────────────────────────────────────────────────────────

test('every param the app reads is in the contract — no orphan reads', () => {
  const contractParams = new Set(URL_STATE_CONTRACT.map((c) => c.param).filter(Boolean));
  for (const p of READ_PARAMS) assert.ok(contractParams.has(p), `${p} is read but not in the contract`);
  // and the reader is built from the contract, not from a second list
  const src = file('src/lib/urlState.js');
  assert.match(src, /export const READ_PARAMS = URL_STATE_CONTRACT/);
});

test('C6: nothing in the contract pushes history', () => {
  for (const c of URL_STATE_CONTRACT) {
    assert.notEqual(c.write, 'push', `${c.key} must not push: the app has no popstate re-boot`);
    assert.ok(['drop', 'keep'].includes(c.onBoardChange), `${c.key} needs a decided onBoardChange`);
  }
  // Look for a CALL, not the word: the module's own docstring explains why push is banned (C6).
  const src = file('src/lib/urlState.js');
  assert.ok(!/history\s*\.\s*pushState\s*\(/.test(src), 'urlState.js must not call history.pushState');
});

test('C3/C4: view and transient state carry no params, and are named', () => {
  for (const c of URL_STATE_CONTRACT) {
    if (c.tier === TIERS.BOARD || c.tier === TIERS.PRESENT) continue;
    assert.equal(c.param, null, `${c.key} is ${c.tier} and must not carry a param`);
  }
  for (const key of ['zoom', 'readerPage', 'textPanelOpen', 'openDialog', 'toast']) {
    assert.ok(NEVER_IN_URL.includes(key), `${key} should be recorded as never-in-URL`);
  }
  // the never-in-URL names must not collide with a param we actually read
  for (const key of NEVER_IN_URL) {
    assert.ok(!READ_PARAMS.includes(key), `${key} is both never-in-URL and a read param`);
  }
});

// ── reading ───────────────────────────────────────────────────────────────────────────────────────

test('parseUrlState reads the four carried keys and ignores junk', () => {
  const s = parseUrlState('?config=/demos.json&kiosk=1&utm_source=newsletter&page=7', '');
  assert.equal(s.config, '/demos.json');
  assert.equal(s.kiosk, true);
  assert.equal(s.lean, false);
  assert.equal(s.embed, null);
  assert.ok(!('utm_source' in s) && !('page' in s), 'a param we do not read must not be mirrored');
});

test('parseUrlState only treats the #/d/ shape as an embedded board', () => {
  assert.equal(parseUrlState('', '#/d/abc-123_XYZ').embed, 'abc-123_XYZ');
  assert.equal(parseUrlState('', '#section-2').embed, null);
  assert.equal(parseUrlState('', '#/d/').embed, null, 'an empty payload is not a board');
  assert.ok(EMBED_HASH_RE.test('#/d/abc'));
});

test('boardClaim: config wins over embed, both win over local', () => {
  assert.deepEqual(boardClaim('https://x.org/?config=%2Fdemo.json').kind, 'config');
  assert.deepEqual(boardClaim('https://x.org/#/d/abc').kind, 'embed');
  assert.deepEqual(boardClaim('https://x.org/?utm_source=a').kind, 'local');
  assert.deepEqual(boardClaim('https://x.org/').value, null);
  assert.equal(boardClaim('https://x.org/?config=%2Fdemo.json#/d/abc').value, '/demo.json');
});

test('boardClaim trims a config value and ignores a blank one', () => {
  assert.equal(boardClaim('https://x.org/?config=%20%2Fd.json%20').value, '/d.json');
  assert.equal(boardClaim('https://x.org/?config=%20').kind, 'local', 'blank is not a claim');
});

// ── the repair: dropping a claim ──────────────────────────────────────────────────────────────────

test('stripBoardClaim removes the claim and keeps the presentation params', () => {
  const out = stripBoardClaim('https://x.org/?config=/demos.json&kiosk=1#/d/abc');
  assert.ok(!out.includes('config='), 'the claim is gone');
  assert.ok(out.includes('kiosk=1'), 'present mode is not the board — it stays');
  assert.ok(!out.includes('#/d/'), 'a stale embed is also a stale claim');
});

test('stripBoardClaim leaves a URL with no claim alone, and keeps unrelated params', () => {
  const plain = 'https://x.org/?kiosk=1&utm_source=a';
  assert.equal(stripBoardClaim(plain), plain);
  assert.ok(stripBoardClaim('https://x.org/?config=/a.json&utm_source=a').includes('utm_source=a'));
});

test('setParams writes 1 for true, deletes for null/false, and keeps other params', () => {
  const out = setParams('https://x.org/?config=/a.json&kiosk=1', { kiosk: null, lean: true, config: null });
  assert.equal(out, 'https://x.org/?lean=1');
  assert.equal(setParams('https://x.org/', { lean: false }), 'https://x.org/');
  assert.ok(sameUrl('https://x.org/?a=1', 'https://x.org/?a=1'));
  assert.ok(!sameUrl('https://x.org/?a=1', 'https://x.org/?a=2'));
});

// ── the fingerprint: "is the URL still telling the truth?" ────────────────────────────────────────

const board = (ids = ['a'], params = null, layout = []) => ({
  widgets: ids.map((id) => ({ id, type: 'note' })), layout, params,
});

test('boardFingerprint is equal for equal boards and differs for any board change', () => {
  const one = boardFingerprint(...Object.values(board(['a', 'b'])));
  const two = boardFingerprint(...Object.values(board(['a', 'b'])));
  assert.equal(one, two);
  assert.notEqual(one, boardFingerprint(...Object.values(board(['a', 'b', 'c']))), 'an added widget');
  assert.notEqual(one, boardFingerprint(...Object.values(board(['a'], { q: 'x' }))), 'a changed param');
  assert.notEqual(one, boardFingerprint(...Object.values(board(['a', 'b'], null, [{ i: 'a' }]))), 'a moved card');
});

test('boardFingerprint can ignore the layout, for callers that only care about content', () => {
  const opts = { includeLayout: false };
  const a = boardFingerprint(...Object.values(board(['a', 'b'])), opts);
  const b = boardFingerprint(...Object.values(board(['a', 'b'], null, [{ i: 'a' }])), opts);
  assert.equal(a, b, 'a rearranged card is still the same board content');
  const c = boardFingerprint(...Object.values(board(['a', 'b', 'z'])), opts);
  assert.notEqual(a, c);
});

test('the fingerprint uses the same serialisation localStorage holds', () => {
  // Not a style preference: if these drift, "does the URL match the board?" and "what would a reload
  // restore?" get different answers, which is the whole bug class.
  const src = file('src/lib/urlState.js');
  assert.match(src, /import \{ savedBoardPayload \} from '\.\/savedBoard\.js'/);
  assert.match(src, /savedBoardPayload\(widgets, layout, params\)/);
});

test('claimIsFresh: a missing or unmatched claim is never fresh', () => {
  const fp = boardFingerprint(...Object.values(board(['a'])));
  assert.equal(claimIsFresh({ fingerprint: fp }, fp), true);
  assert.equal(claimIsFresh({ fingerprint: fp }, fp + 'x'), false);
  assert.equal(claimIsFresh(null, fp), false);
  assert.equal(claimIsFresh({ kind: 'config' }, fp), false, 'a claim with no fingerprint cannot be checked');
});

test('applyUrl is a no-op outside a browser', () => {
  assert.equal(applyUrl('https://x.org/?config=/a.json'), false);
});

// ── C5: one reader, one writer ────────────────────────────────────────────────────────────────────

test('C5: urlState.js is the only place that interprets the URL, and the only writer', () => {
  // Two rules, and the distinction matters:
  //   · WRITING history — urlState.js only. A second writer is how the address bar learned to lie.
  //   · READING the query string — urlState.js is the only place that *interprets* it, but the values
  //     must be handed in from somewhere, so a call that literally passes them to parseUrlState() is
  //     the sanctioned form (App.jsx's boot, share.js's two aliases).
  const theWriter = join(process.cwd(), 'src', 'lib', 'urlState.js');
  const offenders = [];

  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(js|jsx)$/.test(name) || p === theWriter) continue;
      const code = readFileSync(p, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')   // a comment may quote the rule without breaking it
        .replace(/^\s*\/\/.*$/gm, '');
      if (/history\.(push|replace)State/.test(code)) offenders.push(`${p}: writes history directly`);
      for (const line of code.split('\n')) {
        if (!/window\.location\.(search|hash)/.test(line)) continue;
        if (/parseUrlState\(/.test(line)) continue;   // the sanctioned hand-off
        offenders.push(`${p}: interprets the URL directly — ${line.trim().slice(0, 60)}`);
      }
    }
  };
  walk(join(process.cwd(), 'src'));

  assert.deepEqual(offenders, [], `URL access outside urlState.js:\n  ${offenders.join('\n  ')}`);
});

test('C5: the app reads the URL through the helpers, at boot and in present mode', () => {
  const app = file('src/App.jsx');
  assert.match(app, /parseUrlState\(window\.location\.search, window\.location\.hash\)/);
  assert.match(app, /applyUrl\(setParams\(window\.location\.href, \{ kiosk: null, lean: null \}\)\)/);
  // and the two claim-dropping call sites (Reset, wholesale replacement) are wired
  assert.match(app, /dropBoardClaimOnScreen\(\)/);
});

test('C1: Reset drops the claim — the reported bug', () => {
  const app = file('src/App.jsx');
  const reset = app.slice(app.indexOf('const handleReset'), app.indexOf('const applyDashboard'));
  assert.ok(/dropBoardClaimOnScreen\(\)/.test(reset),
    'Reset must drop ?config= / #/d/ or the address bar lies and a reload resurrects the board');
  assert.ok(/setUrlClaim\(null\)/.test(reset), 'and forget the claim it was holding');
});

test('C1: SharePanel builds its link from the board, not from the address bar', () => {
  const sp = file('src/components/SharePanel.jsx');
  assert.ok(/claimIsFresh\(claim, boardFingerprint\(widgets, layout, params\)\)/.test(sp),
    'the QR must check the claim before reusing the ?config= URL');
  assert.match(sp, /presentModeUrl\(claimFresh \? currentUrl : hashShareUrl, mode\)/);
  assert.ok(!/URLSearchParams\(window\.location\.search\)/.test(sp),
    'reading the query string in SharePanel was the bug');
});
