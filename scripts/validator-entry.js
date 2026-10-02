/**
 * What the validator service ships — the bundle entry for `npm run build:validator`.
 *
 * `deploy/server.js` cannot import from `src/` directly: the tool has no `src/` beside it (the deploy copies
 * `server.js` and `dist/`), and the registry uses directory imports that node's ESM loader refuses anyway. So this is
 * bundled to `deploy/validator-bundle.mjs` and imported lazily by the `/api/validate` route — one artefact, built from
 * the same code the app runs, so the endpoint's verdict cannot drift from the app's own.
 *
 * Three exports, and the third and fourth are the reason the bundle exists rather than a hand-written copy:
 *
 *   - `diagnoseBoard`  — the board doctor (`src/lib/boardDoctor.js`), which delegates to `validateDashboard`;
 *   - the hash codecs — the app's own `#/d/` and `#/z/` forms, so a board shared from the app validates here
 *     byte-for-byte as it would on load, and (the encoders) so a later `make_board_url` tool hands back the very link
 *     the Share panel would. Reusing them is the point: a second codec would be a second truth.
 */
export { diagnoseBoard } from '../src/lib/boardDoctor.js';
export {
  decodeDashboardHash,
  decodeCompressedDashboardHash,
  encodeDashboardHash,
  encodeCompressedDashboardHash,
} from '../src/lib/share.js';
// `make_board_url` reports whether a link still fits a QR code, so the ceiling travels with the encoder that decides it
// (one constant, `src/lib/qr.js`, used by the Share panel too).
export { QR_MAX_CHARS } from '../src/lib/qr.js';
