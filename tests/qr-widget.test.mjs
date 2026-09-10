/**
 * QR Code widget (GitHub issue fuzheado/wikibento#45, ISSUE-65) — constitution.
 *
 * Covers: the registry contract (static widget, display node, emits its text),
 * the transform's EC ladder / density / overflow rules, the pure encoding
 * helpers in src/lib/qr.js (incl. a byte-for-byte regression guard on the
 * SharePanel path), the dashboard validator, and tier-1 of the Ask path
 * (askLocal must surface the new widget from the manifest alone).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  qrSvg, qrModuleCount, qrFits, fitEcLevel, QR_BYTE_CAPACITY, EC_LADDER,
  QR_DENSE_CHARS, QR_MAX_CHARS,
} from '../src/lib/qr.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { validateDashboard } from '../src/lib/dashboardConfig.js';
import { askLocal } from '../src/lib/askLocal.js';

const def = WIDGET_TYPES.qrCode;

// ── registry contract ──────────────────────────────────────────

test('qrCode: registry entry exists, static, display node, point-in-time', () => {
  assert.ok(def, 'qrCode widget type exists');
  assert.equal(def.id, 'qrCode');
  assert.equal(def.renderer, 'QrCard');
  assert.equal(def.timeScope, 'point');
  assert.equal(def.nodeKind, 'display');
  assert.equal(def.category, 'Content & Embeds');
  assert.equal(typeof def.fetch, 'undefined', 'static widget — no fetch, so it works offline/kiosk');
  assert.equal(typeof def.transform, 'function');
  assert.ok(def.dataSource.includes('no fetch'));
  assert.ok(def.defaultLayout, 'declares a default layout (square-ish card)');
});

test('qrCode: emits the encoded text (echo-shaped, kind value)', () => {
  assert.equal(typeof def.emit, 'function');
  assert.deepEqual(def.outputs, { kind: 'value' });
  assert.equal(def.emit({ text: 'https://example.org/' }), 'https://example.org/');
  assert.equal(def.emit({ text: '' }), undefined, 'empty encode is not a value');
  assert.equal(def.emit(null), undefined);
});

test('qrCode: defaults are scannable-by-default (auto EC + 4-module quiet zone)', () => {
  assert.equal(def.defaults.ecLevel, 'auto', 'auto ladder by default');
  assert.equal(def.defaults.margin, 4, 'spec quiet zone by default');
  assert.equal(def.defaults.refreshSeconds, 86400, 'static widget convention');
  assert.ok(String(def.defaults.text).startsWith('https://'), 'encodes a real URL out of the box');
});

test('qrCode: config fields cover payload + encoding controls, with hints for Ask', () => {
  const fields = Object.fromEntries(def.configFields.map((f) => [f.key, f]));
  assert.deepEqual(Object.keys(fields).sort(), ['caption', 'ecLevel', 'margin', 'text']);
  assert.equal(fields.text.type, 'textarea');
  assert.ok(fields.text.hint.includes('{{widget:id}}'), 'text field documents interpolation');
  assert.equal(fields.ecLevel.type, 'select');
  assert.deepEqual(fields.ecLevel.options.map((o) => o.value), ['auto', 'L', 'M', 'Q', 'H']);
  assert.equal(fields.margin.type, 'number');
  for (const f of def.configFields) assert.ok(f.hint || f.key === 'caption', `${f.key} has a hint`);
});

// ── transform: EC ladder, density, overflow ────────────────────

test('qrCode: auto EC takes the strongest level that fits', () => {
  const short = def.transform(null, { text: 'https://w.wiki/ABC123' });
  assert.equal(short.ecLevel, 'H', 'small payload gets H');
  assert.equal(short.note, '', 'no note when the strongest level fits');
  assert.equal(short.dense, false);
  const medium = def.transform(null, { text: 'a'.repeat(1400) });
  assert.equal(medium.ecLevel, 'Q', 'above H capacity (1273) the ladder steps to Q');
  assert.ok(medium.note.includes('stepped down to Q'), medium.note);
  const atCap = def.transform(null, { text: 'a'.repeat(QR_MAX_CHARS) });
  assert.equal(atCap.ecLevel, 'Q', 'the widget hard cap (1500) still encodes comfortably');
  assert.equal(atCap.tooLong, false);
});

test('qrCode: explicit EC degrades predictably and says so', () => {
  const ok = def.transform(null, { text: 'https://example.org/', ecLevel: 'M' });
  assert.equal(ok.ecLevel, 'M');
  assert.equal(ok.note, '', 'explicit level that fits is not modified');
  const degraded = def.transform(null, { text: 'a'.repeat(1400), ecLevel: 'H' });
  assert.equal(degraded.ecLevel, 'Q', 'H cannot hold 1400 bytes → degrades to Q');
  assert.ok(degraded.note.includes('reduced from H to Q'), degraded.note);
  const weakLevel = def.transform(null, { text: 'a'.repeat(1400), ecLevel: 'L' });
  assert.equal(weakLevel.ecLevel, 'L', 'an explicit weak level is honoured, never silently upgraded');
});

test('qrCode: refuses to render an unscannable or impossible code', () => {
  const dense = def.transform(null, { text: 'a'.repeat(QR_DENSE_CHARS + 1) });
  assert.equal(dense.dense, true, 'warns above the density threshold');
  assert.equal(dense.tooLong, false);
  const tooLong = def.transform(null, { text: 'a'.repeat(QR_MAX_CHARS + 1) });
  assert.equal(tooLong.tooLong, true, 'hard cap — no QR is rendered');
  assert.equal(tooLong.ecLevel, null);
  const unfittable = def.transform(null, { text: 'a'.repeat(QR_MAX_CHARS) });
  assert.equal(unfittable.tooLong, false, 'cap boundary is inclusive-safe');
  assert.ok(unfittable.ecLevel, 'a payload at the cap still encodes');
});

test('qrCode: margin is clamped and caption/empty text handled', () => {
  assert.equal(def.transform(null, { text: 'hi', margin: -5 }).margin, 0);
  assert.equal(def.transform(null, { text: 'hi', margin: 99 }).margin, 16);
  assert.equal(def.transform(null, { text: 'hi', margin: 'nonsense' }).margin, 4, 'bad number falls back');
  assert.equal(def.transform(null, { text: 'hi', margin: '6' }).margin, 6);
  assert.equal(def.transform(null, { caption: 7 }).caption, '7');
  const empty = def.transform(null, {});
  assert.equal(empty.text, '');
  assert.equal(empty.ecLevel, null, 'nothing to encode');
});

test('qrCode: a dashboard containing the widget passes the constitution validator', () => {
  const res = validateDashboard({
    version: 1,
    widgets: [{ id: 'q1', widgetType: 'qrCode', config: { text: 'https://wikibento.toolforge.org/' } }],
    layout: [{ i: 'q1', x: 0, y: 0, w: 4, h: 6 }],
  });
  assert.ok(res.valid ?? res.ok ?? res === true, `expected valid, got ${JSON.stringify(res)}`);
});

// ── pure encoding helpers (src/lib/qr.js) ──────────────────────

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

test('qr: default output is byte-identical to the pre-widget SharePanel output', () => {
  // Hashes captured BEFORE the qrCode widget existed (2026-09-10) — the Share
  // panel must never change appearance because a widget was added.
  assert.equal(sha(qrSvg('https://example.org/')), '30c02afa8484a14b');
  assert.equal(sha(qrSvg('https://commons.wikimedia.org/wiki/Category:Featured_pictures_on_Wikimedia_Commons')), 'b68a16bf630c1486');
  assert.equal(sha(qrSvg('x')), 'a1894ab2ee93ea38');
  assert.equal(qrSvg('x', { ecLevel: 'M', margin: 0 }), qrSvg('x'), 'explicit defaults === defaults');
});

test('qr: quiet zone shifts the viewBox and paints a white border', () => {
  const plain = qrSvg('https://example.org/', { ecLevel: 'M' });
  assert.ok(plain.includes('viewBox="0 0 25 25"'), 'no quiet zone → edge-to-edge');
  assert.ok(!plain.includes('<rect'), 'no white rect when margin=0');
  const quiet = qrSvg('https://example.org/', { ecLevel: 'M', margin: 4 });
  assert.ok(quiet.includes('viewBox="-4 -4 33 33"'), 'viewBox expanded by the quiet zone');
  assert.ok(quiet.includes('<rect x="-4" y="-4" width="33" height="33" fill="#ffffff"/>'), 'white border painted');
  assert.ok(quiet.indexOf('<rect') < quiet.indexOf('<path'), 'border is painted under the modules');
  assert.ok(quiet.includes('aria-label="QR code"'), 'default label preserved');
});

test('qr: labels are attribute-escaped (no markup injection into the SVG)', () => {
  const svg = qrSvg('https://example.org/', { label: 'a"b<c>&d' });
  assert.ok(svg.includes('aria-label="a&quot;b&lt;c&gt;&amp;d"'), svg.slice(0, 200));
  assert.ok(!svg.includes('<c>'));
});

test('qr: module count grows with the payload; capacity is real', () => {
  assert.equal(qrModuleCount('https://w.wiki/ABC123'), 25, '21 chars → 25×25');
  assert.equal(qrModuleCount('x'.repeat(82)), 37, '82 chars → 37×37');
  assert.equal(qrModuleCount('x'.repeat(138)), 49, '138 chars → 49×49');
  assert.equal(qrModuleCount('a'.repeat(QR_BYTE_CAPACITY.M)), 177, 'EC M tops out at version 40');
  assert.equal(qrModuleCount('a'.repeat(QR_BYTE_CAPACITY.M + 1)), null, 'one byte over → does not fit');
  assert.equal(qrFits('a'.repeat(QR_BYTE_CAPACITY.H), 'H'), true);
  assert.equal(qrFits('a'.repeat(QR_BYTE_CAPACITY.H), 'L'), true, 'a small payload always fits L');
});

test('qr: the measured capacity table is what this encoder does', () => {
  assert.deepEqual(QR_BYTE_CAPACITY, { L: 2953, M: 2331, Q: 1663, H: 1273 });
  for (const [ec, cap] of Object.entries(QR_BYTE_CAPACITY)) {
    assert.equal(qrFits('a'.repeat(cap), ec), true, `${ec} fits its measured maximum`);
    assert.equal(qrFits('a'.repeat(cap + 1), ec), false, `${ec} rejects one byte more`);
  }
  assert.deepEqual(EC_LADDER, ['H', 'Q', 'M', 'L'], 'ladder is strongest-first');
});

test('qr: fitEcLevel walks strongest→weakest and gives up cleanly', () => {
  assert.equal(fitEcLevel('x'.repeat(300)), 'H');
  assert.equal(fitEcLevel('x'.repeat(1400)), 'Q');
  assert.equal(fitEcLevel('x'.repeat(2000)), 'M');
  assert.equal(fitEcLevel('x'.repeat(2500)), 'L');
  assert.equal(fitEcLevel('x'.repeat(3000)), null, 'beyond EC L capacity → null, never a broken code');
  assert.equal(fitEcLevel('x'.repeat(2500), 'M'), 'L', 'preferred level is tried first, then degrades');
  assert.equal(fitEcLevel('x'.repeat(300), 'L'), 'L', 'an explicit weaker level is honoured, not upgraded');
});

// ── Ask path, tier 1 (offline matcher) ────────────────────────

test('ask: the offline matcher finds the QR widget from the manifest alone', async () => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/manifest.json'), 'utf8'));
  assert.ok(manifest.widgets.some((w) => w.id === 'qrCode'), 'manifest carries the new widget (npm test regenerates it first)');
  const res = await askLocal('put a qr code linking the featured pictures category on my board', manifest);
  assert.equal(res.options[0]?.widgetType, 'qrCode', `expected qrCode first, got ${JSON.stringify(res.options.map((o) => o.widgetType))}`);
  const plain = await askLocal('show me the most visited articles', manifest);
  assert.ok(!plain.options.some((o) => o.widgetType === 'qrCode'), 'no QR false-positive on unrelated intents');
});
