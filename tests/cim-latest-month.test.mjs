/**
 * CIM month-lag resilience — the constitution for CIM month resolution.
 *
 * BUG THIS LOCKS IN (verified live 2026-09-01): the calendar's previous
 * month is UNPUBLISHED at the start of every month (CIM's monthly job lags
 * days), so every default-month CIM widget 404'd — and the broken probe
 * (probe window ≡ main window when month=0) misread that as "unregistered",
 * telling users of registered categories like Images_from_Metropolitan_
 * Museum_of_Art to add {{Views from category}} when the category was fine.
 *
 * RULES:
 *  1. Default month (month=0) must resolve to the latest PUBLISHED month
 *     (probed via the category-independent global leaderboard), not the
 *     calendar's previous month.
 *  2. Fetchers must report the RESOLVED month (resolvedMonth) so subtitles
 *     show what is actually displayed.
 *  3. A publish-lag 404 on an explicitly requested month must surface as
 *     "No CIM data for this month…", NEVER as the unregistered verdict.
 *  4. A truly unregistered category (404 on the latest published month too)
 *     must still surface CimUnregisteredError.
 *
 * All offline: global fetch is stubbed with a date-relative fake CIM —
 * months ≤ LATEST have data; months > LATEST 404 "not loaded yet"; one
 * category is genuinely unregistered.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchCimSnapshot, fetchCimTopFiles, fetchCimFileSpotlight, CimUnregisteredError } from '../src/widgets/dataSources.js';

// ── date-relative stub setup ─────────────────────────────────────────────
// LATEST = the calendar's previous month MINUS one — i.e. the lag scenario
// always active, whatever day this test runs on.
const now = new Date();
const pm = now.getMonth() === 0 ? 12 : now.getMonth();
const py = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
const LATEST = pm === 1 ? { year: py - 1, month: 12 } : { year: py, month: pm - 1 };
const NEXT = LATEST.month === 12 ? { year: LATEST.year + 1, month: 1 } : { year: LATEST.year, month: LATEST.month + 1 };
const key = (y, m) => y * 12 + m;
const LAT = key(LATEST.year, LATEST.month);

const SNAP_ITEMS = JSON.stringify({ items: [{
  'media-file-count': 389030, 'media-file-count-deep': 389148,
  'used-media-file-count': 20700, 'used-media-file-count-deep': 20773,
  'leveraging-wiki-count': 404, 'leveraging-wiki-count-deep': 407,
  'leveraging-page-count': 31351, 'leveraging-page-count-deep': 31995,
}] });
const TOP_ITEMS = JSON.stringify({ items: [{ 'media-file': 'A.jpg', 'pageview-count': 9 }] });
const GLOBAL_ITEMS = JSON.stringify({ items: [{ category: 'X', rank: 1, 'pageview-count': 1 }] });
const NOT_LOADED = 'The date(s) you used are valid, but we either do not have data for those date(s), or the category you asked for is not loaded yet. Please check documentation for more information';

const resp = (status, body) => ({ ok: status < 400, status, text: async () => body });

globalThis.fetch = async (url) => {
  const p = new URL(url).pathname;
  let m2, cat, y, m;
  if ((m2 = p.match(/(?:category|media-file)-metrics-snapshot\/([^/]+)\/(\d{4})(\d{2})\d{2}/))) {
    [, cat, y, m] = m2;
  } else if ((m2 = p.match(/top-viewed-media-files-monthly\/([^/]+)\/[^/]+\/[^/]+\/(\d{4})\/(\d{2})/))) {
    [, cat, y, m] = m2;
  } else if ((m2 = p.match(/top-viewed-categories-monthly\/[^/]+\/[^/]+\/(\d{4})\/(\d{2})/))) {
    [, y, m] = m2; cat = '__global__';
  } else {
    return resp(200, '{"query":{"pages":{}}}'); // benign answer for non-CIM calls (imageinfo etc.)
  }
  if (cat === 'Unregistered_Category' || key(+y, +m) > LAT) return resp(404, NOT_LOADED);
  return resp(200, cat === '__global__' ? GLOBAL_ITEMS : (p.includes('snapshot') ? SNAP_ITEMS : TOP_ITEMS));
};

// ── File Spotlight: month resolution + optional image preview ───────────

test('fetchCimFileSpotlight month=0 resolves to the latest published month; stats survive a missing image', async () => {
  const d = await fetchCimFileSpotlight('A.jpg', 'all-wikis', undefined, 0);
  assert.deepEqual(d.resolvedMonth, LATEST);
  assert.equal(d.wikis, 404); // SNAP_ITEMS leverages 404 wikis (the real Met number)
  assert.equal(d.image, null); // stub's imageinfo returns no pages → best-effort null, no throw
});

test('fetchCimFileSpotlight serves a 480px thumb when imageinfo has one; showImage=false skips the lookup', async () => {
  const realFetch = globalThis.fetch;
  let imageinfoCalls = 0;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('prop=imageinfo') && u.includes('File%3AA.jpg')) {
      return resp(200, JSON.stringify({ query: { pages: { '1': { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/A.jpg/480px-A.jpg?c=1' }] } } } }));
    }
    if (u.includes('prop=imageinfo')) imageinfoCalls += 1;
    return realFetch(url);
  };
  try {
    const withImg = await fetchCimFileSpotlight('A.jpg', 'all-wikis', undefined, 0, true);
    assert.equal(withImg.image.url, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/A.jpg/480px-A.jpg');
    const noImg = await fetchCimFileSpotlight('A.jpg', 'all-wikis', undefined, 0, false);
    assert.equal(noImg.image, null);
    assert.equal(imageinfoCalls, 0); // showImage=false → no imageinfo lookup at all
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── rule 1 + 2: default month resolves to the latest PUBLISHED month ─────

test('fetchCimSnapshot month=0 resolves to the latest published month during a publish lag', async () => {
  const d = await fetchCimSnapshot('Images_from_Metropolitan_Museum_of_Art', 'deep', undefined, 0);
  assert.deepEqual(d.resolvedMonth, LATEST);
  assert.equal(d.files, 389030); // real data returned, no throw
});

test('fetchCimTopFiles month=0 resolves to the latest published month (direct fetchCim fetchers too)', async () => {
  const d = await fetchCimTopFiles('Images_from_Metropolitan_Museum_of_Art', 'deep', 'all-wikis', undefined, 0);
  assert.deepEqual(d.resolvedMonth, LATEST);
  assert.equal(d.rows.length, 1);
});

// ── rule 3: publish-lag 404 on an explicit month ≠ unregistered ──────────

test('explicit month newer than the latest published → "No CIM data" error, NOT the unregistered verdict', async () => {
  await assert.rejects(
    fetchCimSnapshot('Images_from_Metropolitan_Museum_of_Art', 'deep', NEXT.year, NEXT.month),
    (e) => e instanceof Error && !(e instanceof CimUnregisteredError) && /No CIM data for this month/.test(e.message),
  );
});

// ── rule 4: truly unregistered categories still get the friendly verdict ─

test('unregistered category (404 even on the latest published month) → CimUnregisteredError', async () => {
  await assert.rejects(
    fetchCimSnapshot('Unregistered_Category', 'deep', undefined, 0),
    (e) => e instanceof CimUnregisteredError && /Views from category/.test(e.message),
  );
});
