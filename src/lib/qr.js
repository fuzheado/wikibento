/**
 * QR code helpers — LOCAL encoding only: ISO/IEC 18004 via `qrcode-generator`
 * (MIT, zero-dependency, runs entirely in the browser). Nothing here is ever
 * sent anywhere — no shortener, no redirect hop, no scan analytics.
 *
 * Two callers:
 *  - SharePanel — encodes the board's own share link (EC `M`, no quiet zone:
 *    it sits inside a white padded container).
 *  - the `qrCode` widget (`QrCard`, ISSUE-65) — encodes any text/URL, with a
 *    real quiet zone so a saved or printed SVG scans standalone.
 */
import qrcode from 'qrcode-generator';

const DEFAULT_EC = 'M';

/** Byte-mode capacity per EC level, in bytes (version-40 maximum).
 *  MEASURED 2026-09-10 against the installed qrcode-generator@2.0.4 by
 *  binary-searching the largest fitting payload per level — this is what THIS
 *  encoder does, so don't "correct" it from a spec table. */
export const QR_BYTE_CAPACITY = { L: 2953, M: 2331, Q: 1663, H: 1273 };

/** Strongest → weakest. The `auto` ladder takes the first level the payload
 *  still fits in, so small payloads get the best error recovery. */
export const EC_LADDER = ['H', 'Q', 'M', 'L'];

/** Density guidance (shared by SharePanel and the widget): past DENSE a code is
 *  hard to scan from a small card, past MAX we refuse to render one at all —
 *  an unscannable QR is worse than no QR, it just looks broken. */
export const QR_DENSE_CHARS = 1000;
export const QR_MAX_CHARS = 1500;

function build(text, ecLevel) {
  const qr = qrcode(0, ecLevel); // type 0 = auto-size to content
  qr.addData(text, 'Byte');
  qr.make();
  return qr;
}

/** Module count per side for this text at this EC level — or null when the
 *  payload does not fit (the library throws; we treat that as "no QR"). */
export function qrModuleCount(text, ecLevel = DEFAULT_EC) {
  try { return build(text, ecLevel).getModuleCount(); } catch { return null; }
}

/** Does the payload fit at this EC level? */
export function qrFits(text, ecLevel = DEFAULT_EC) {
  return qrModuleCount(text, ecLevel) !== null;
}

/** Strongest EC level the payload still fits (EC_LADDER order), or null when it
 *  exceeds even `L` (2,953 bytes). `preferred` is tried first, so an explicit
 *  level degrades predictably instead of jumping to the strongest. */
export function fitEcLevel(text, preferred) {
  const order = preferred && EC_LADDER.includes(preferred)
    ? [preferred, ...EC_LADDER.filter((l) => l !== preferred)]
    : EC_LADDER;
  for (const ec of order) if (qrFits(text, ec)) return ec;
  return null;
}

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Render a string as an inline SVG QR code (single <path>, crisp edges).
 *
 * `margin` is the quiet zone in modules. The default (0) reproduces the
 * SharePanel-era output byte for byte — edge-to-edge, only safe inside a white
 * padded container. With margin > 0 the SVG carries its own white border
 * (viewBox shifted negative), so a downloaded/printed file scans standalone.
 */
export function qrSvg(text, { ecLevel = DEFAULT_EC, margin = 0, label = 'QR code' } = {}) {
  const qr = build(text, ecLevel);
  const n = qr.getModuleCount();
  const cells = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) cells.push(`M${c} ${r}h1v1h-1z`);
    }
  }
  const m = Math.max(0, Math.round(Number(margin) || 0));
  const quiet = m > 0 ? `<rect x="${-m}" y="${-m}" width="${n + 2 * m}" height="${n + 2 * m}" fill="#ffffff"/>` : '';
  const viewBox = m > 0 ? `${-m} ${-m} ${n + 2 * m} ${n + 2 * m}` : `0 0 ${n} ${n}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ` +
    'shape-rendering="crispEdges" role="img" ' +
    `aria-label="${escapeAttr(label)}">` +
    quiet +
    `<path d="${cells.join('')}"/>` +
    '</svg>'
  );
}
