// tests/cim-latest-month.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

// src/lib/fetchCache.js
function createTtlCache(ttlMs) {
  const map = /* @__PURE__ */ new Map();
  return {
    /** Resolve `producer()` for `key`, reusing a fresh cached promise. */
    get(key2, producer) {
      const hit = map.get(key2);
      if (hit && hit.expiresAt > Date.now()) return hit.promise;
      const entry = { promise: null, expiresAt: Date.now() + ttlMs };
      map.set(key2, entry);
      entry.promise = Promise.resolve().then(producer).catch((err) => {
        map.delete(key2);
        throw err;
      });
      return entry.promise;
    },
    /** Drop one entry (or all, when key is omitted) — e.g. after a manual refresh. */
    clear(key2) {
      if (key2 === void 0) map.clear();
      else map.delete(key2);
    }
  };
}

// src/widgets/dataSources.js
var WIKIBENTO_UA = "WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado)";
var wikistatsCache = createTtlCache(5 * 60 * 1e3);
async function fetchTextWithRetry(url, { timeoutMs = 15e3, retries = 2, method = "GET", body = null, contentType = null, withBody = false } = {}) {
  const shortUrl = url.replace(/^https?:\/\//, "").slice(0, 80);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp2 = await fetch(url, {
        method,
        headers: { "User-Agent": WIKIBENTO_UA, ...body ? { "Content-Type": contentType || "application/json" } : {} },
        body,
        signal: controller.signal
      });
      if (resp2.status >= 500 && attempt < retries) {
        lastErr = new Error(`HTTP ${resp2.status} (${shortUrl})`);
      } else if (!resp2.ok) {
        let errBody = null;
        if (withBody) {
          try {
            errBody = (await resp2.text()).slice(0, 300);
          } catch {
          }
        }
        const err = new Error(`HTTP ${resp2.status} (${shortUrl})`);
        if (errBody) err.body = errBody;
        throw err;
      } else {
        return await resp2.text();
      }
    } catch (e) {
      if (e instanceof Error && /^HTTP 4\d\d /.test(e.message)) throw e;
      if (e.name === "AbortError") {
        lastErr = new Error(`timed out after ${timeoutMs / 1e3}s (${shortUrl})`);
      } else if (!(e instanceof Error && e.message.startsWith("HTTP "))) {
        lastErr = e.message.includes(shortUrl) ? e : new Error(`${e.message} (${shortUrl})`);
      } else {
        lastErr = e;
      }
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw lastErr;
}
async function attachThumbs(files) {
  if (!files.length) return;
  const params = new URLSearchParams({
    action: "query",
    prop: "imageinfo",
    titles: files.map((f) => f.title).join("|"),
    iiprop: "url",
    iiurlwidth: "120",
    format: "json",
    origin: "*"
  });
  try {
    const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
    const byTitle = {};
    for (const p of Object.values(d?.query?.pages || {})) byTitle[p.title] = p.imageinfo?.[0]?.thumburl?.split("?")[0];
    files.forEach((f) => {
      f.thumbUrl = byTitle[f.title];
    });
  } catch {
  }
}
async function fetchJSON(url) {
  const text = await fetchTextWithRetry(url);
  return JSON.parse(text);
}
var topPagesCache = createTtlCache(10 * 60 * 1e3);
var sparqlCache = createTtlCache(10 * 60 * 1e3);
var CIM_BASE = "https://wikimedia.org/api/rest_v1/metrics/commons-analytics/";
var CIM_TTL = 60 * 60 * 1e3;
var cimCache = createTtlCache(CIM_TTL);
var CimUnregisteredError = class extends Error {
};
function cleanCategoryForCim(name) {
  return String(name || "").replace(/^Category:\s*/i, "").trim().replace(/ /g, "_");
}
function prevCimMonth(d = /* @__PURE__ */ new Date()) {
  return { year: d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(), month: d.getMonth() === 0 ? 12 : d.getMonth() };
}
function shiftCimMonth(year, month, delta) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
function cimDate(year, month) {
  return `${year}${String(month).padStart(2, "0")}01`;
}
async function fetchCim(path, retries = 2) {
  const url = CIM_BASE + path;
  return cimCache.get(`cim::${path}`, async () => {
    let text;
    try {
      text = await fetchTextWithRetry(url, { timeoutMs: 3e4, retries, withBody: true });
    } catch (e) {
      if (e.body && e.body.includes("not loaded yet")) {
        throw new CimUnregisteredError("No precomputed (CIM) data yet \u2014 categories register via {{Views from category}} on the category page (processed monthly)");
      }
      throw e;
    }
    let d;
    try {
      d = JSON.parse(text);
    } catch {
      throw new Error("CIM returned non-JSON");
    }
    return d.items || [];
  });
}
async function latestCimMonth() {
  return cimCache.get("cim::latest-month", async () => {
    let cur = prevCimMonth();
    for (let i = 0; i < 3; i++) {
      try {
        await fetchCim(`top-viewed-categories-monthly/deep/all-wikis/${cur.year}/${String(cur.month).padStart(2, "0")}`, 0);
        return cur;
      } catch {
        cur = shiftCimMonth(cur.year, cur.month, -1);
      }
    }
    return cur;
  });
}
async function fetchCimMonth(path, probePath) {
  try {
    return await fetchCim(path);
  } catch (e) {
    if (!(e instanceof CimUnregisteredError) || !probePath) throw e;
    try {
      await fetchCim(probePath);
    } catch (p) {
      if (p instanceof CimUnregisteredError) throw e;
      throw p;
    }
    throw new Error("No CIM data for this month \u2014 it may not be published yet (the monthly job lags a few days into each month); clear the Month field for the latest available");
  }
}
async function fetchCimSnapshot(category, scope = "deep", year, month) {
  const cat = cleanCategoryForCim(category);
  if (!cat) throw new Error("Enter a Commons category");
  const { year: py2, month: pm2 } = await latestCimMonth();
  const y = parseInt(year) || py2;
  const m = parseInt(month) || pm2;
  const start = cimDate(y, m);
  const end = cimDate(...Object.values(shiftCimMonth(y, m, 1)));
  const probeStart = cimDate(py2, pm2);
  const probeEnd = cimDate(...Object.values(shiftCimMonth(py2, pm2, 1)));
  const items = await fetchCimMonth(
    `category-metrics-snapshot/${cat}/${start}/${end}`,
    `category-metrics-snapshot/${cat}/${probeStart}/${probeEnd}`
  );
  const it = items[0] || {};
  return {
    category: cat,
    files: it["media-file-count"] ?? 0,
    filesDeep: it["media-file-count-deep"] ?? 0,
    used: it["used-media-file-count"] ?? 0,
    usedDeep: it["used-media-file-count-deep"] ?? 0,
    wikis: it["leveraging-wiki-count"] ?? 0,
    wikisDeep: it["leveraging-wiki-count-deep"] ?? 0,
    pages: it["leveraging-page-count"] ?? 0,
    pagesDeep: it["leveraging-page-count-deep"] ?? 0,
    resolvedMonth: { year: y, month: m }
  };
}
async function fetchCimTopFiles(category, scope = "deep", wiki = "all-wikis", year, month, topN = 10) {
  const cat = cleanCategoryForCim(category);
  if (!cat) throw new Error("Enter a Commons category");
  const { year: py2, month: pm2 } = await latestCimMonth();
  const y = parseInt(year) || py2;
  const m = parseInt(month) || pm2;
  const n = Math.min(Math.max(parseInt(topN) || 10, 1), 50);
  const items = await fetchCim(
    `top-viewed-media-files-monthly/${cat}/${scope}/${wiki}/${y}/${String(m).padStart(2, "0")}`
  );
  const rows = items.slice(0, n).map((it) => ({ title: it["media-file"], views: it["pageview-count"] ?? 0 }));
  const withThumbs = rows.map((r) => ({ title: `File:${r.title.replace(/_/g, " ")}` }));
  await attachThumbs(withThumbs);
  rows.forEach((r, i) => {
    r.thumbUrl = withThumbs[i].thumbUrl;
  });
  return { category: cat, rows, resolvedMonth: { year: y, month: m } };
}
var waybackCache = createTtlCache(10 * 60 * 1e3);

// tests/cim-latest-month.test.mjs
var now = /* @__PURE__ */ new Date();
var pm = now.getMonth() === 0 ? 12 : now.getMonth();
var py = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
var LATEST = pm === 1 ? { year: py - 1, month: 12 } : { year: py, month: pm - 1 };
var NEXT = LATEST.month === 12 ? { year: LATEST.year + 1, month: 1 } : { year: LATEST.year, month: LATEST.month + 1 };
var key = (y, m) => y * 12 + m;
var LAT = key(LATEST.year, LATEST.month);
var SNAP_ITEMS = JSON.stringify({ items: [{
  "media-file-count": 389030,
  "media-file-count-deep": 389148,
  "used-media-file-count": 20700,
  "used-media-file-count-deep": 20773,
  "leveraging-wiki-count": 404,
  "leveraging-wiki-count-deep": 407,
  "leveraging-page-count": 31351,
  "leveraging-page-count-deep": 31995
}] });
var TOP_ITEMS = JSON.stringify({ items: [{ "media-file": "A.jpg", "pageview-count": 9 }] });
var GLOBAL_ITEMS = JSON.stringify({ items: [{ category: "X", rank: 1, "pageview-count": 1 }] });
var NOT_LOADED = "The date(s) you used are valid, but we either do not have data for those date(s), or the category you asked for is not loaded yet. Please check documentation for more information";
var resp = (status, body) => ({ ok: status < 400, status, text: async () => body });
globalThis.fetch = async (url) => {
  const p = new URL(url).pathname;
  let m2, cat, y, m;
  if (m2 = p.match(/category-metrics-snapshot\/([^/]+)\/(\d{4})(\d{2})\d{2}/)) {
    [, cat, y, m] = m2;
  } else if (m2 = p.match(/top-viewed-media-files-monthly\/([^/]+)\/[^/]+\/[^/]+\/(\d{4})\/(\d{2})/)) {
    [, cat, y, m] = m2;
  } else if (m2 = p.match(/top-viewed-categories-monthly\/[^/]+\/[^/]+\/(\d{4})\/(\d{2})/)) {
    [, y, m] = m2;
    cat = "__global__";
  } else {
    return resp(200, '{"query":{"pages":{}}}');
  }
  if (cat === "Unregistered_Category" || key(+y, +m) > LAT) return resp(404, NOT_LOADED);
  return resp(200, cat === "__global__" ? GLOBAL_ITEMS : p.includes("snapshot") ? SNAP_ITEMS : TOP_ITEMS);
};
test("fetchCimSnapshot month=0 resolves to the latest published month during a publish lag", async () => {
  const d = await fetchCimSnapshot("Images_from_Metropolitan_Museum_of_Art", "deep", void 0, 0);
  assert.deepEqual(d.resolvedMonth, LATEST);
  assert.equal(d.files, 389030);
});
test("fetchCimTopFiles month=0 resolves to the latest published month (direct fetchCim fetchers too)", async () => {
  const d = await fetchCimTopFiles("Images_from_Metropolitan_Museum_of_Art", "deep", "all-wikis", void 0, 0);
  assert.deepEqual(d.resolvedMonth, LATEST);
  assert.equal(d.rows.length, 1);
});
test('explicit month newer than the latest published \u2192 "No CIM data" error, NOT the unregistered verdict', async () => {
  await assert.rejects(
    fetchCimSnapshot("Images_from_Metropolitan_Museum_of_Art", "deep", NEXT.year, NEXT.month),
    (e) => e instanceof Error && !(e instanceof CimUnregisteredError) && /No CIM data for this month/.test(e.message)
  );
});
test("unregistered category (404 even on the latest published month) \u2192 CimUnregisteredError", async () => {
  await assert.rejects(
    fetchCimSnapshot("Unregistered_Category", "deep", void 0, 0),
    (e) => e instanceof CimUnregisteredError && /Views from category/.test(e.message)
  );
});
