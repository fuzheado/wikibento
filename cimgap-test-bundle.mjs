// tests/cim-gap.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

// src/lib/fetchCache.js
function createTtlCache(ttlMs) {
  const map = /* @__PURE__ */ new Map();
  return {
    /** Resolve `producer()` for `key`, reusing a fresh cached promise. */
    get(key, producer) {
      const hit = map.get(key);
      if (hit && hit.expiresAt > Date.now()) return hit.promise;
      const entry = { promise: null, expiresAt: Date.now() + ttlMs };
      map.set(key, entry);
      entry.promise = Promise.resolve().then(producer).catch((err) => {
        map.delete(key);
        throw err;
      });
      return entry.promise;
    },
    /** Drop one entry (or all, when key is omitted) — e.g. after a manual refresh. */
    clear(key) {
      if (key === void 0) map.clear();
      else map.delete(key);
    }
  };
}

// src/lib/sparqlPresets.js
var SPARQL_ENDPOINTS = {
  wdqs: {
    id: "wdqs",
    label: "Wikidata (WDQS)",
    url: "https://query.wikidata.org/sparql"
  },
  "qlever-commons": {
    id: "qlever-commons",
    label: "Commons SDC (QLever)",
    url: "https://qlever.dev/api/wikimedia-commons"
  },
  humaniki: {
    id: "humaniki",
    label: "Humaniki (gender gap, precomputed)",
    url: "https://humaniki.wmcloud.org/api/v1/gender/gap/latest/gte_one_sitelink/properties"
  }
};
var SPARQL_PRESETS = [
  {
    id: "met-collection",
    label: "Collection depth (Met)",
    endpoint: "wdqs",
    query: `SELECT (COUNT(DISTINCT ?item) AS ?count) WHERE {
  ?item wdt:P195 wd:Q160236 .
}`
  },
  {
    id: "multi-institution",
    label: "Collection depth \u2014 multiple institutions",
    endpoint: "wdqs",
    query: `SELECT ?institution ?institutionLabel (COUNT(DISTINCT ?item) AS ?count) WHERE {
  VALUES ?institution { wd:Q160236 wd:Q190804 wd:Q6373 wd:Q131626 }
  ?item wdt:P195 ?institution .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?institution ?institutionLabel
ORDER BY DESC(?count)`
  },
  {
    id: "women-in-red",
    label: "Women in Red \u2014 % of enwiki biographies that are women",
    endpoint: "humaniki",
    query: ""
    // served by the Humaniki API, not SPARQL
  },
  {
    id: "commons-top-depicts",
    label: "Commons \u2014 most-depicted subjects (JPEGs, QLever)",
    endpoint: "qlever-commons",
    query: `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX schema: <http://schema.org/>
SELECT ?depicts (COUNT(?file) AS ?count) WHERE {
  ?file wdt:P180 ?depicts ;
         schema:encodingFormat "image/jpeg" .
}
GROUP BY ?depicts ORDER BY DESC(?count) LIMIT 25`
  }
];
function getPreset(id) {
  return SPARQL_PRESETS.find((p) => p.id === id);
}

// src/widgets/dataSources.js
var PAGEVIEWS_API = "https://wikimedia.org/api/rest_v1/metrics/pageviews";
var WIKISTATS_API = "https://wikistats.wmcloud.org/api.php";
var wikistatsCache = createTtlCache(5 * 60 * 1e3);
async function fetchTextWithRetry(url, { timeoutMs = 15e3, retries = 2, method = "GET", body = null, contentType = null, withBody = false } = {}) {
  const shortUrl = url.replace(/^https?:\/\//, "").slice(0, 80);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method,
        // NOTE: no custom User-Agent here. In browsers, User-Agent is a FORBIDDEN
        // header — Chromium strips it before the CORS preflight check, but Firefox
        // and WebKit include it in the preflight, and Wikimedia's REST endpoints
        // reject `user-agent` in Access-Control-Allow-Headers (RESTBase allows only
        // `api-user-agent`; the CIM service 405s OPTIONS outright). Net effect with
        // the header set: every RESTBase/CIM fetch dies with NetworkError in
        // Firefox/Safari while Chrome works (verified 2026-09-03, fixed by removing
        // it). The header was also a no-op — browsers always send their own UA.
        // Server-side code (deploy/server.js relays) sends the descriptive UA;
        // browser requests are identified by the browser's own UA + Origin.
        headers: body ? { "Content-Type": contentType || "application/json" } : void 0,
        body,
        signal: controller.signal
      });
      if (resp.status >= 500 && attempt < retries) {
        lastErr = new Error(`HTTP ${resp.status} (${shortUrl})`);
      } else if (!resp.ok) {
        let errBody = null;
        if (withBody) {
          try {
            errBody = (await resp.text()).slice(0, 300);
          } catch {
          }
        }
        const err = new Error(`HTTP ${resp.status} (${shortUrl})`);
        if (errBody) err.body = errBody;
        throw err;
      } else {
        return await resp.text();
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
function fetchWikistatsText(url) {
  return wikistatsCache.get(url, () => fetchTextWithRetry(url));
}
var GLAM_FILE_BUDGET = 500;
var GLAM_FILE_BUDGET_MAX = 3e4;
var GLAM_FALLBACK_CAP = 1e3;
var GLAM_VIEW_BUDGET = 150;
var GIU_LIMIT = 100;
var MAX_DEPTH = 12;
function cleanCategoryNameForWalk(cat) {
  return cat.replace(/^Category:\s*/i, "").replace(/"/g, "");
}
async function collectCategoryFiles(category, depth, budget, exclCats) {
  const files = [];
  const seen = /* @__PURE__ */ new Set();
  let queue = [category];
  for (let level = 0; level <= depth && queue.length && files.length < budget; level++) {
    const next = [];
    for (const cat of queue) {
      if (files.length >= budget) break;
      if (seen.has(cat) || exclCats && exclCats.has(cat)) continue;
      seen.add(cat);
      let cmcontinue = null;
      do {
        const params = new URLSearchParams({
          action: "query",
          list: "categorymembers",
          cmtitle: `Category:${cat}`,
          cmtype: "file|subcat",
          cmlimit: "500",
          format: "json",
          origin: "*"
        });
        if (cmcontinue) params.set("cmcontinue", cmcontinue);
        const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
        for (const m of d?.query?.categorymembers || []) {
          if (m.ns === 6) {
            if (files.length < budget) files.push(m.title);
          } else if (m.ns === 14 && level < depth) {
            next.push(m.title.replace(/^Category:/, ""));
          }
        }
        cmcontinue = d?.continue?.cmcontinue;
      } while (cmcontinue && files.length < budget);
    }
    queue = next;
  }
  return files;
}
async function collectExcludedCategories(negcats, negdepth) {
  const excl = /* @__PURE__ */ new Set();
  if (!negcats) return excl;
  let queue = negcats.split("|").map(cleanCategoryNameForWalk);
  for (let level = 0; level <= Math.min(negdepth || 0, MAX_DEPTH) && queue.length; level++) {
    const next = [];
    for (const cat of queue) {
      if (excl.has(cat)) continue;
      excl.add(cat);
      if (level >= Math.min(negdepth || 0, MAX_DEPTH)) continue;
      const params = new URLSearchParams({
        action: "query",
        list: "categorymembers",
        cmtitle: `Category:${cat}`,
        cmtype: "subcat",
        cmlimit: "500",
        format: "json",
        origin: "*"
      });
      const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
      for (const m of d?.query?.categorymembers || []) {
        next.push(m.title.replace(/^Category:/, ""));
      }
    }
    queue = next;
  }
  return excl;
}
var NON_ARTICLE_NS = /^(talk|user|user[_ ]?talk|wikipedia|wikipedia[_ ]?talk|file|file[_ ]?talk|mediawiki|mediawiki[_ ]?talk|template|template[_ ]?talk|help|help[_ ]?talk|category|category[_ ]?talk|portal|portal[_ ]?talk|draft|draft[_ ]?talk|module|timedtext|gadget|gadget[_ ]?talk|special|media):/i;
function isArticleUrl(url) {
  try {
    const m = new URL(url).pathname.match(/\/wiki\/([^/]+)$/);
    if (!m) return false;
    return !NON_ARTICLE_NS.test(decodeURIComponent(m[1]));
  } catch {
    return false;
  }
}
async function fetchBatchedUsage(files) {
  const usage = {};
  const MAX_ENCODED = 4500;
  let chunk = [];
  let chunkLen = 0;
  const flush = async () => {
    if (!chunk.length) return;
    const params = new URLSearchParams({
      action: "query",
      prop: "globalusage",
      titles: chunk.join("|"),
      gulimit: String(GIU_LIMIT),
      format: "json",
      origin: "*"
    });
    const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
    for (const p of Object.values(d?.query?.pages || {})) {
      usage[p.title] = (p.globalusage || []).filter((u) => isArticleUrl(u.url)).map((u) => ({ wiki: u.wiki, page: u.title }));
    }
    chunk = [];
    chunkLen = 0;
  };
  for (const f of files) {
    const len = encodeURIComponent(f).length + 1;
    if (chunk.length >= 50 || chunk.length && chunkLen + len > MAX_ENCODED) await flush();
    chunk.push(f);
    chunkLen += len;
  }
  await flush();
  return usage;
}
function wikiToProject(wiki) {
  if (wiki === "commons.wikimedia.org") return "commons.wikimedia";
  if (wiki === "species.wikimedia.org") return "species.wikimedia";
  const m = String(wiki).match(/^([a-z]{2,3})\.wikipedia\.org$/);
  return m ? `${m[1]}.wikipedia` : null;
}
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
async function fetchMonthlyViews(wiki, page, year, month) {
  const project = wikiToProject(wiki);
  if (!project) return 0;
  const start = `${year}${String(month).padStart(2, "0")}01`;
  const end = `${year}${String(month).padStart(2, "0")}${daysInMonth(year, month)}`;
  const url = `${PAGEVIEWS_API}/per-article/${project}/all-access/user/${encodeURIComponent(page.replace(/ /g, "_"))}/monthly/${start}00/${end}00`;
  try {
    const d = await fetchJSON(url);
    return (d.items || []).reduce((s, i) => s + (i.views || 0), 0);
  } catch {
    return 0;
  }
}
async function pool(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
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
var PETSCAN_RELAY = "/api/petscan";
async function fetchPetscanRelay({ category, depth, negcats, negdepth, budget }) {
  try {
    const params = new URLSearchParams({
      cats: category,
      depth: String(depth),
      negcats: negcats || "",
      negdepth: String(negdepth),
      budget: String(budget)
    });
    const text = await fetchTextWithRetry(`${PETSCAN_RELAY}?${params}`, { timeoutMs: 75e3, retries: 0 });
    const d = JSON.parse(text);
    if (!d || d.source !== "petscan" || !Array.isArray(d.files)) return null;
    return d;
  } catch {
    return null;
  }
}
async function fetchSelfWalkUsage(category, depth, budget, negcats, negdepth) {
  const exclCats = await collectExcludedCategories(negcats, negdepth);
  const files = await collectCategoryFiles(category, depth, budget, exclCats);
  const usage = await fetchBatchedUsage(files);
  return { files, usage };
}
async function aggregateGlamStats(files, usage, { year, month, topN, showDetail = true, views = fetchMonthlyViews, thumbs = attachThumbs } = {}) {
  const pages = {};
  files.forEach((f) => {
    for (const u of usage[f] || []) {
      if (u.ns !== void 0 && u.ns !== 0) continue;
      const k = `${u.wiki}:${u.page}`;
      if (!pages[k]) pages[k] = { wiki: u.wiki, page: u.page, weight: 0, views: 0 };
      pages[k].weight++;
    }
  });
  const pageKeys = Object.keys(pages);
  const partialViews = pageKeys.length > GLAM_VIEW_BUDGET;
  const keysToFetch = partialViews ? [...pageKeys].sort((a, b) => pages[b].weight - pages[a].weight).slice(0, GLAM_VIEW_BUDGET) : pageKeys;
  await pool(keysToFetch, 6, async (k) => {
    pages[k].views = await views(pages[k].wiki, pages[k].page, year, month);
  });
  const fileStats = files.map((f) => ({
    title: f,
    used: (usage[f] || []).some((u) => u.ns === void 0 || u.ns === 0),
    views: (usage[f] || []).reduce((s, u) => u.ns !== void 0 && u.ns !== 0 ? s : s + (pages[`${u.wiki}:${u.page}`]?.views || 0), 0)
  }));
  const usedFiles = fileStats.filter((f) => f.used).length;
  const viewedFiles = fileStats.filter((f) => f.views > 0).length;
  const totalViews = pageKeys.reduce((s, k) => s + pages[k].views, 0);
  const wikis = new Set(pageKeys.map((k) => pages[k].wiki)).size;
  const top = fileStats.filter((f) => f.used).sort((a, b) => b.views - a.views || Number(b.used) - Number(a.used)).slice(0, topN);
  await thumbs(top);
  let detail = null;
  if (showDetail && top.length) {
    const rows = (usage[top[0].title] || []).filter((u) => u.ns === void 0 || u.ns === 0);
    await pool(rows, 6, async (u) => {
      const k = `${u.wiki}:${u.page}`;
      if (!(k in pages)) pages[k] = { wiki: u.wiki, page: u.page, weight: 0, views: 0 };
      if (!pages[k].viewsFetched) {
        pages[k].views = await views(u.wiki, u.page, year, month);
        pages[k].viewsFetched = true;
      }
    });
    rows.sort((a, b) => (pages[`${b.wiki}:${b.page}`]?.views || 0) - (pages[`${a.wiki}:${a.page}`]?.views || 0));
    detail = {
      title: `Top file: ${top[0].title.replace(/^File:/, "").replace(/_/g, " ")}`,
      rows: rows.slice(0, 10).map((u) => ({
        wiki: u.wiki,
        page: u.page.replace(/_/g, " "),
        views: pages[`${u.wiki}:${u.page}`]?.views || 0
      }))
    };
  }
  return {
    files: files.length,
    usedFiles,
    viewedFiles,
    pages: pageKeys.length,
    wikis,
    totalViews,
    partialViews,
    monthLabel: `${year}-${String(month).padStart(2, "0")}`,
    top: top.map((f) => ({ title: f.title.replace(/^File:/, "").replace(/_/g, " "), views: f.views, thumbUrl: f.thumbUrl })),
    detail
  };
}
async function fetchGlamStats(cfg = {}, deps = {}) {
  const category = cleanCategoryNameForWalk(cfg.category || "");
  const depth = Math.min(Math.max(parseInt(cfg.depth) || 0, 0), MAX_DEPTH);
  const year = Math.min(Math.max(parseInt(cfg.year) || (/* @__PURE__ */ new Date()).getFullYear(), 2015), (/* @__PURE__ */ new Date()).getFullYear() + 1);
  const month = Math.min(Math.max(parseInt(cfg.month) || 1, 1), 12);
  const budget = Math.min(Math.max(parseInt(cfg.fileBudget) || GLAM_FILE_BUDGET, 50), GLAM_FILE_BUDGET_MAX);
  const topN = Math.min(Math.max(parseInt(cfg.topN) || 5, 1), 10);
  if (!category) throw new Error("Glam stats need a category");
  const { relay = fetchPetscanRelay, walk = fetchSelfWalkUsage } = deps;
  const acquired = await relay({ category, depth, negcats: cfg.negcats, negdepth: parseInt(cfg.negdepth) || 0, budget });
  let files, usage, cappedFiles, source;
  if (acquired && !acquired.truncated && acquired.files?.length) {
    ({ files, usage } = acquired);
    cappedFiles = !!acquired.capped;
    source = "petscan";
  } else {
    const walkBudget = Math.min(budget, GLAM_FALLBACK_CAP);
    ({ files, usage } = await walk(category, depth, walkBudget, cfg.negcats, parseInt(cfg.negdepth) || 0));
    cappedFiles = files.length >= walkBudget;
    source = "selfwalk";
  }
  if (!files.length) {
    return {
      category,
      source,
      files: 0,
      cappedFiles,
      usedFiles: 0,
      viewedFiles: 0,
      pages: 0,
      wikis: 0,
      totalViews: 0,
      partialViews: false,
      monthLabel: `${year}-${String(month).padStart(2, "0")}`,
      top: [],
      detail: null
    };
  }
  return {
    category,
    source,
    cappedFiles,
    ...await aggregateGlamStats(files, usage, { year, month, topN, showDetail: cfg.showDetail !== false, ...deps })
  };
}
async function fetchJSON(url) {
  const text = await fetchTextWithRetry(url);
  return JSON.parse(text);
}
async function postJSON(url, payload, timeoutMs = 3e4) {
  const text = await fetchTextWithRetry(url, { method: "POST", body: JSON.stringify(payload), timeoutMs });
  return JSON.parse(text);
}
function daysAgo(n) {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
function stripHtml(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
async function fetchPageviews(article, project = "en.wikipedia") {
  const end = daysAgo(0);
  const start = daysAgo(30);
  const url = `${PAGEVIEWS_API}/per-article/${project}/all-access/user/${encodeURIComponent(article)}/daily/${start}00/${end}00`;
  try {
    const data = await fetchJSON(url);
    const items = data.items || [];
    const total = items.reduce((sum, i) => sum + (i.views || 0), 0);
    const avg = items.length ? Math.round(total / items.length) : 0;
    const trend = items.map((i) => ({ date: i.timestamp.slice(0, 8), views: i.views }));
    return {
      total,
      avg,
      latest: items.length ? items[items.length - 1].views : 0,
      trend,
      article
    };
  } catch (e) {
    throw new Error(`Pageviews fetch failed: ${e.message}`);
  }
}
async function countExtUrlUsage(domain, wiki, namespace) {
  let total = 0;
  let eucontinue = null;
  const maxPages = 10;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      action: "query",
      list: "exturlusage",
      euquery: domain,
      eulimit: "500",
      euprotocol: "https",
      format: "json",
      origin: "*"
    });
    if (namespace) params.set("eunamespace", namespace);
    if (eucontinue) params.set("eucontinue", eucontinue);
    const data = await fetchJSON(`https://${wiki}.org/w/api.php?${params}`);
    const items = data?.query?.exturlusage || [];
    total += items.length;
    if (data.continue?.eucontinue) {
      eucontinue = data.continue.eucontinue;
    } else {
      break;
    }
  }
  return total;
}
async function fetchExternalLinks(domain, wiki = "en.wikipedia", namespace = "") {
  try {
    const total = await countExtUrlUsage(domain, wiki, namespace);
    const capped = total >= 5e3;
    return {
      total: total.toLocaleString(),
      totalExact: !capped,
      domain,
      wiki,
      namespace
    };
  } catch (e) {
    throw new Error(`Link count fetch failed: ${e.message}`);
  }
}
function cleanCategoryName(category) {
  return category.replace(/^Category:\s*/i, "").replace(/"/g, "");
}
async function fetchRandomCategoryImages(category, limit) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `incategory:"${category}" filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(limit),
    gsrsort: "random",
    prop: "imageinfo",
    iiprop: "url|size",
    iiurlwidth: "240",
    format: "json",
    origin: "*"
  });
  const data = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
  return Object.values(data?.query?.pages || {}).filter((p) => p.imageinfo?.[0]?.thumburl).slice(0, limit).map((p) => ({
    title: p.title,
    url: p.imageinfo[0].thumburl.split("?")[0]
  }));
}
function truncate(s, n) {
  s = String(s || "").trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}\u2026` : s;
}
async function fetchMediaPlaylist(filesText) {
  const files = (filesText || "").split("\n").map((s) => s.trim().replace(/^File:\s*/i, "")).filter(Boolean).map((s) => `File:${s.replace(/_/g, " ")}`);
  if (!files.length) throw new Error("Enter at least one Commons file");
  const rows = [];
  const MAX_ENCODED = 4500;
  let chunk = [];
  let chunkLen = 0;
  const flush = async () => {
    if (!chunk.length) return;
    const params = new URLSearchParams({
      action: "query",
      prop: "videoinfo",
      titles: chunk.join("|"),
      viprop: "derivatives|url|size|duration|extmetadata",
      // extmetadata → description/artist/license (⚠ iiextmetadatafilter is IGNORED by videoinfo — full set returns)
      format: "json",
      origin: "*"
    });
    const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
    const byTitle = {};
    for (const p of Object.values(d?.query?.pages || {})) {
      const vi = p.videoinfo?.[0] || {};
      const em = vi.extmetadata || {};
      byTitle[p.title] = {
        derivatives: (vi.derivatives || []).map((dv) => ({
          type: dv.type || "",
          width: dv.width || 0,
          height: dv.height || 0,
          src: (dv.src || "").split("?")[0]
        })),
        originalUrl: (vi.url || "").split("?")[0],
        duration: vi.duration || 0,
        size: vi.size || 0,
        description: truncate(stripHtml(em.ImageDescription?.value || ""), 280),
        artist: truncate(stripHtml(em.Artist?.value || ""), 80),
        license: stripHtml(em.LicenseShortName?.value || ""),
        missing: !!p.missing
      };
    }
    for (const t of chunk) {
      const info = byTitle[t];
      const isVideo = (info?.derivatives || []).some((dv) => dv.type.startsWith("video/")) || /\.(webm|ogv)$/i.test(t);
      rows.push({
        title: t.replace(/^File:\s*/i, "").replace(/_/g, " "),
        fileUrl: `https://commons.wikimedia.org/wiki/${t.replace(/ /g, "_")}`,
        mediaType: isVideo ? "video" : "audio",
        ...info || { missing: true, derivatives: [], originalUrl: "", duration: 0, size: 0 }
      });
    }
    chunk = [];
    chunkLen = 0;
  };
  for (const f of files) {
    const len = encodeURIComponent(f).length + 1;
    if (chunk.length >= 50 || chunk.length && chunkLen + len > MAX_ENCODED) await flush();
    chunk.push(f);
    chunkLen += len;
  }
  await flush();
  return { rows, missing: rows.filter((r) => r.missing).length };
}
async function fetchCategorySize(category, wiki = "commons.wikimedia", sampleCount = 0) {
  const clean = cleanCategoryName(category);
  const params = new URLSearchParams({
    action: "query",
    prop: "categoryinfo",
    titles: `Category:${clean}`,
    format: "json",
    origin: "*"
  });
  try {
    const data = await fetchJSON(`https://${wiki}.org/w/api.php?${params}`);
    const pages = Object.values(data?.query?.pages || {});
    const info = pages[0]?.categoryinfo || {};
    const result = {
      pages: info.pages || 0,
      files: info.files || 0,
      subcats: info.subcats || 0,
      total: (info.pages || 0) + (info.files || 0) + (info.subcats || 0),
      category,
      sample: []
    };
    const n = Math.min(Math.max(parseInt(sampleCount) || 0, 0), 24);
    if (n > 0 && wiki === "commons.wikimedia") {
      try {
        result.sample = await fetchRandomCategoryImages(clean, n);
      } catch {
        result.sample = [];
      }
    }
    return result;
  } catch (e) {
    throw new Error(`Category fetch failed: ${e.message}`);
  }
}
async function fetchWikistats(table = "wikipedias", lang = null) {
  const params = new URLSearchParams({ action: "dump", table, format: "csv" });
  try {
    const csv = await fetchWikistatsText(`${WIKISTATS_API}?${params}`);
    const lines = csv.trim().split("\n");
    const headers = lines[0].split(",");
    const rows = lines.slice(1).map((line) => {
      const vals = line.split(",");
      const obj = {};
      headers.forEach((h, i2) => {
        obj[h.trim()] = vals[i2]?.trim();
      });
      return obj;
    });
    if (lang) {
      return rows.find((r) => r.lang === lang) || rows[0];
    }
    const sorted = [...rows].filter((r) => r.good).sort((a, b) => (parseInt(b.good) || 0) - (parseInt(a.good) || 0));
    return { rows: sorted.slice(0, 10), table };
  } catch (e) {
    throw new Error(`Wikistats fetch failed: ${e.message}`);
  }
}
async function fetchFileUsage(filename, topN = 10) {
  const params = new URLSearchParams({
    action: "query",
    prop: "globalusage|imageinfo",
    titles: `File:${filename.replace(/^File:\s*/i, "")}`,
    gulimit: "500",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "480",
    format: "json",
    origin: "*"
  });
  try {
    const data = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
    const pages = Object.values(data?.query?.pages || {});
    const usage = pages[0]?.globalusage || [];
    const info = pages[0]?.imageinfo?.[0] || {};
    const ext = info.extmetadata || {};
    const counts = {};
    usage.forEach((u) => {
      counts[u.wiki] = (counts[u.wiki] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, topN);
    return {
      totalWikis: Object.keys(counts).length,
      totalUsages: usage.length,
      top: sorted.map(([wiki, count]) => ({ wiki, count })),
      filename,
      image: {
        url: (info.thumburl || "").split("?")[0],
        description: stripHtml(ext.ImageDescription?.value || ""),
        license: stripHtml(ext.LicenseShortName?.value || "")
      }
    };
  } catch (e) {
    throw new Error(`File usage fetch failed: ${e.message}`);
  }
}
var HATNOTE_API = "https://top.hatnote.com";
var topPagesCache = createTtlCache(10 * 60 * 1e3);
function compactNumber(n) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
function hatnoteThumb(url) {
  if (!url || url.includes("top.hatnote.com/img/w.png")) return null;
  try {
    const u = new URL(url);
    ["utm_source", "utm_campaign", "utm_content", "utm_medium", "utm_term"].forEach((k) => u.searchParams.delete(k));
    return u.href;
  } catch {
    return url.split("?")[0];
  }
}
var NON_ARTICLE_PREFIXES = ["Special", "Wikipedia", "Talk", "User", "Help", "File", "Template", "Category", "Portal", "Draft", "Module", "MediaWiki", "Main_Page"];
function isArticlePage(title) {
  if (!title || title === "Main_Page") return false;
  const prefix = title.split(":")[0];
  return !NON_ARTICLE_PREFIXES.includes(prefix);
}
async function enrichTopArticles(lang, rows) {
  if (!rows.length || lang === "commons") return rows;
  const api = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  const out = [];
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    api.search = new URLSearchParams({
      action: "query",
      prop: "pageimages|extracts",
      titles: batch.map((r) => r.title.replace(/_/g, " ")).join("|"),
      piprop: "thumbnail",
      pithumbsize: 120,
      exintro: 1,
      explaintext: 1,
      exchars: 300,
      format: "json",
      origin: "*"
    });
    try {
      const d = await fetchJSON(api.href);
      const pages = d?.query?.pages || {};
      const byTitle = /* @__PURE__ */ new Map();
      Object.values(pages).forEach((p) => byTitle.set(p.title.replace(/ /g, "_"), p));
      batch.forEach((r) => {
        const p = byTitle.get(r.title);
        if (p && p.thumbnail?.source) r.imageUrl = p.thumbnail.source;
        if (p && p.extract) r.summary = p.extract;
        out.push(r);
      });
    } catch {
      out.push(...batch);
    }
  }
  return out;
}
async function fetchViaProxy(url) {
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
  return topPagesCache.get(proxyUrl, () => fetchTextWithRetry(proxyUrl)).then((text) => {
    const wrapped = JSON.parse(text);
    if (wrapped.status !== 200) throw new Error(`HTTP ${wrapped.status}`);
    return JSON.parse(wrapped.body);
  });
}
function topPageCandidates({ dateMode, year, month, day }) {
  const out = [];
  const d = dateMode === "latest" ? /* @__PURE__ */ new Date() : new Date(Date.UTC(year || 2026, (month || 1) - 1, day || 1));
  const maxBack = dateMode === "latest" ? 14 : 7;
  for (let i = 0; i < maxBack; i++) {
    const c = new Date(d.getTime() - i * 864e5);
    out.push({ y: c.getUTCFullYear(), m: c.getUTCMonth() + 1, d: c.getUTCDate() });
  }
  return out;
}
async function fetchTopPageDay(lang, { y, m, d }) {
  try {
    const data = await fetchViaProxy(`${HATNOTE_API}/${lang}/wikipedia/${y}/${m}/${d}.json`);
    if (!data?.articles?.length) return null;
    return {
      source: "hatnote",
      dateLabel: data.formatted_date,
      fullLang: data.full_lang,
      totalTrafficShort: data.total_traffic_short,
      permalink: data.permalink,
      articles: data.articles.map((a) => ({
        title: a.title,
        rank: a.rank,
        views: a.pviews ?? a.views,
        views_short: a.views_short || compactNumber(a.pviews ?? a.views),
        imageUrl: hatnoteThumb(a.image_url),
        summary: a.summary || "",
        url: a.url || ""
      }))
    };
  } catch {
  }
  try {
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    const data = await fetchJSON(`${PAGEVIEWS_API}/top/${lang}.wikipedia/all-access/${y}/${mm}/${dd}`);
    const items = data?.items?.[0]?.articles || [];
    if (!items.length) return null;
    return {
      source: "wmf",
      dateLabel: `${y}/${mm}/${dd}`,
      fullLang: lang,
      totalTrafficShort: null,
      permalink: null,
      articles: items.map((a) => ({
        title: a.article,
        rank: a.rank,
        views: a.views,
        views_short: compactNumber(a.views),
        imageUrl: null,
        summary: "",
        url: ""
      }))
    };
  } catch {
    return null;
  }
}
async function fetchTopPages(cfg = {}) {
  const lang = cfg.lang || "en";
  const enrich = cfg.showExpanded && lang !== "commons";
  const candidates = topPageCandidates(cfg);
  let lastErr = null;
  for (const c of candidates) {
    const day = await fetchTopPageDay(lang, c);
    if (day) {
      day.articles = day.articles.filter((a) => isArticlePage(a.title));
      if (enrich) day.articles = await enrichTopArticles(lang, day.articles);
      return day;
    }
    lastErr = `no data for ${c.y}/${c.m}/${c.d}`;
  }
  throw new Error(`Top pages fetch failed: ${lastErr || "no data available"}`);
}
async function resolveLatestRev(article, project = "en.wikipedia") {
  const params = new URLSearchParams({
    action: "query",
    prop: "revisions",
    titles: article,
    rvlimit: "1",
    rvprop: "ids",
    format: "json",
    formatversion: "2",
    origin: "*"
  });
  const data = await fetchJSON(`https://${project}.org/w/api.php?${params}`);
  const page = data?.query?.pages?.[0];
  if (!page || page.missing || !page.revisions?.[0]) {
    throw new Error(`Article not found: ${article}`);
  }
  return { revid: page.revisions[0].revid, pageid: page.pageid };
}
async function fetchArticleSummary(article, project = "en.wikipedia") {
  const title = article.replace(/ /g, "_");
  let data;
  try {
    data = await fetchJSON(`https://${project}.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  } catch (e) {
    if (e.message?.startsWith("HTTP 404")) throw new Error(`Article not found: ${article}`);
    throw new Error(`Summary fetch failed: ${e.message}`);
  }
  if (data.type === "disambiguation") {
    return {
      title: data.title,
      description: data.description || "",
      extract: `"${data.title}" is a disambiguation page \u2014 pick a specific article.`,
      thumbnailUrl: data.thumbnail?.source || null,
      pageUrl: data.content_urls?.desktop?.page || null
    };
  }
  return {
    title: data.title || article,
    description: data.description || "",
    extract: data.extract || "",
    thumbnailUrl: data.thumbnail?.source || null,
    pageUrl: data.content_urls?.desktop?.page || null
  };
}
async function fetchArticleQuality(article, project = "en.wikipedia") {
  const lang = project.replace(".wikipedia", "");
  const wiki = `${lang}wiki`;
  const { revid } = await resolveLatestRev(article, project);
  try {
    const data = await postJSON(`https://api.wikimedia.org/service/lw/inference/v1/models/${wiki}-articlequality:predict`, { rev_id: revid });
    const score = data?.[wiki]?.scores?.[String(revid)]?.articlequality?.score;
    if (score?.prediction) {
      return {
        article,
        revid,
        grade: score.prediction,
        probabilities: score.probability || {},
        model: `ORES class (${wiki}-articlequality)`
      };
    }
  } catch {
  }
  try {
    const data = await postJSON("https://api.wikimedia.org/service/lw/inference/v1/models/articlequality:predict", { rev_id: revid, lang });
    if (typeof data?.score === "number") {
      return { article, revid, score: data.score, model: "articlequality (continuous)" };
    }
  } catch (e) {
    throw new Error(`Quality fetch failed: ${e.message}`);
  }
  throw new Error(`No quality model available for ${project}`);
}
async function fetchAssessments(article, project = "en.wikipedia", topN = 12) {
  const params = new URLSearchParams({
    action: "query",
    prop: "pageassessments",
    titles: article,
    palimit: "500",
    format: "json",
    formatversion: "2",
    origin: "*"
  });
  const data = await fetchJSON(`https://${project}.org/w/api.php?${params}`);
  const page = data?.query?.pages?.[0];
  if (!page || page.missing) throw new Error(`Article not found: ${article}`);
  const IMPORTANCE_RANK = { Top: 0, High: 1, Mid: 2, Low: 3, Unknown: 4, NA: 5 };
  const CLASS_RANK = { FA: 0, FL: 1, GA: 2, A: 3, B: 4, C: 5, Start: 6, Stub: 7, List: 8, Book: 9, Category: 10, Disambig: 11, File: 12, Portal: 13, Project: 14, Redirect: 15, Template: 16, NA: 17 };
  const rows = Object.entries(page.pageassessments || {}).map(([name, v]) => ({ project: name, class: v?.class || "", importance: v?.importance || "" })).sort(
    (a, b) => (IMPORTANCE_RANK[a.importance] ?? 6) - (IMPORTANCE_RANK[b.importance] ?? 6) || (CLASS_RANK[a.class] ?? 99) - (CLASS_RANK[b.class] ?? 99) || a.project.localeCompare(b.project)
  );
  return { article, rows: rows.slice(0, topN), total: rows.length };
}
async function fetchEditHistory(article, project = "en.wikipedia", limit = 10) {
  const params = new URLSearchParams({
    action: "query",
    prop: "revisions",
    titles: article,
    rvlimit: String(limit),
    rvprop: "timestamp|user|comment|ids|size",
    rvdir: "older",
    format: "json",
    formatversion: "2",
    origin: "*"
  });
  const data = await fetchJSON(`https://${project}.org/w/api.php?${params}`);
  const page = data?.query?.pages?.[0];
  if (!page || page.missing) throw new Error(`Article not found: ${article}`);
  const revs = page.revisions || [];
  const rows = revs.map((r, i) => ({
    revid: r.revid,
    timestamp: r.timestamp,
    user: r.user || "(anon)",
    comment: r.comment || "(no edit summary)",
    size: r.size,
    delta: i < revs.length - 1 ? r.size - revs[i + 1].size : null
  }));
  return { article, project, rows };
}
function cleanThumbUrl(url) {
  if (!url) return null;
  const clean = url.replace(/^\/\//, "https://");
  try {
    const u = new URL(clean);
    ["utm_source", "utm_campaign", "utm_content", "utm_medium", "utm_term"].forEach((k) => u.searchParams.delete(k));
    return u.href;
  } catch {
    return clean.split("?")[0];
  }
}
async function fetchArticleGallery(article, project = "en.wikipedia", minSize = 200, maxItems = 0) {
  const title = article.replace(/ /g, "_");
  let list;
  try {
    list = await fetchJSON(`https://${project}.org/api/rest_v1/page/media-list/${encodeURIComponent(title)}`);
  } catch (e) {
    if (e.message?.startsWith("HTTP 404")) throw new Error(`Article not found: ${article}`);
    throw new Error(`Gallery fetch failed: ${e.message}`);
  }
  const images = (list?.items || []).filter((it) => it.type === "image" && it.caption?.html);
  if (!images.length) return { article, rows: [], total: 0, dropped: 0 };
  const info = {};
  for (let i = 0; i < images.length; i += 50) {
    const params = new URLSearchParams({
      action: "query",
      prop: "imageinfo",
      titles: images.slice(i, i + 50).map((it) => it.title).join("|"),
      iiprop: "size|mime",
      format: "json",
      formatversion: "2",
      origin: "*"
    });
    try {
      const d = await fetchJSON(`https://${project}.org/w/api.php?${params}`);
      for (const p of d?.query?.pages || []) {
        const ii = p.imageinfo?.[0];
        if (ii) info[p.title] = { width: ii.width, height: ii.height, mime: ii.mime };
      }
    } catch {
    }
  }
  const min = Math.max(parseInt(minSize) || 200, 0);
  const rows = [];
  let dropped = 0;
  for (const it of images) {
    const dim = info[it.title];
    if (dim && (dim.width < min || dim.height < min)) {
      dropped++;
      continue;
    }
    const src = it.srcset?.find((s) => s.scale === "1x") || it.srcset?.[0];
    const thumbUrl = cleanThumbUrl(src?.src);
    if (!thumbUrl) {
      dropped++;
      continue;
    }
    rows.push({
      title: it.title.replace(/^File:/, "").replace(/_/g, " "),
      fileUrl: `https://${project}.org/wiki/${it.title.replace(/ /g, "_")}`,
      caption: stripHtml(it.caption?.html || ""),
      thumbUrl,
      width: dim?.width,
      height: dim?.height
    });
  }
  const limit = Math.max(parseInt(maxItems) || 0, 0);
  return { article, rows: limit ? rows.slice(0, limit) : rows, total: rows.length, dropped };
}
async function fetchPanoramaFile(filename, project = "commons.wikimedia") {
  const title = String(filename || "").replace(/^File:\s*/i, "").replace(/ /g, "_");
  if (!title) throw new Error("Enter a Commons file name");
  const params = new URLSearchParams({
    action: "query",
    prop: "imageinfo",
    titles: `File:${title}`,
    iiprop: "url|size|mime",
    iiurlwidth: "4096",
    format: "json",
    formatversion: "2",
    origin: "*"
  });
  const data = await fetchJSON(`https://${project}.org/w/api.php?${params}`);
  const page = data?.query?.pages?.[0];
  const ii = page?.imageinfo?.[0];
  if (!page || page.missing || !ii) throw new Error(`File not found: ${filename}`);
  const width = ii.width || 0;
  const height = ii.height || 0;
  return {
    fileTitle: page.title,
    url: ii.thumburl || ii.url,
    originalUrl: ii.url,
    width,
    height,
    equirectangular: width > 0 && height > 0 && Math.abs(width / height - 2) < 0.03,
    mime: ii.mime
  };
}
function parseTitleList(text) {
  return [...new Set(String(text || "").split("\n").map((l) => l.trim()).filter(Boolean))];
}
async function fetchCommonsGallery(filesText) {
  const titles = parseTitleList(filesText).map((t) => t.replace(/^File:\s*/i, "").replace(/ /g, "_"));
  if (!titles.length) throw new Error("Enter at least one Commons file (one per line)");
  const rows = [];
  const MAX_ENCODED = 4500;
  let chunk = [];
  let chunkLen = 0;
  const flush = async () => {
    if (!chunk.length) return;
    const params = new URLSearchParams({
      action: "query",
      prop: "imageinfo",
      titles: chunk.map((t) => `File:${t}`).join("|"),
      iiprop: "url|size|extmetadata",
      iiurlwidth: "400",
      iiextmetadatafilter: "ImageDescription",
      format: "json",
      formatversion: "2",
      origin: "*"
    });
    const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
    for (const p of d?.query?.pages || []) {
      if (p.missing) continue;
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      rows.push({
        title: p.title.replace(/^File:/, "").replace(/_/g, " "),
        fileUrl: `https://commons.wikimedia.org/wiki/${p.title.replace(/ /g, "_")}`,
        thumbUrl: ii.thumburl?.split("?")[0],
        caption: stripHtml(ii.extmetadata?.ImageDescription?.value || ""),
        width: ii.width,
        height: ii.height
      });
    }
    chunk = [];
    chunkLen = 0;
  };
  for (const t of titles) {
    const len = encodeURIComponent(t).length + 1;
    if (chunk.length >= 50 || chunk.length && chunkLen + len > MAX_ENCODED) await flush();
    chunk.push(t);
    chunkLen += len;
  }
  await flush();
  return { rows, total: titles.length, missing: titles.length - rows.length };
}
async function fetchArticleList(articlesText, project = "en.wikipedia", opts = {}) {
  const titles = parseTitleList(articlesText);
  if (!titles.length) throw new Error("Enter at least one article title (one per line)");
  const maxItems = Math.max(parseInt(opts.maxItems) || 0, 0);
  const list = (maxItems ? titles.slice(0, maxItems) : titles).map((t) => ({
    title: t.replace(/_/g, " "),
    pageUrl: `https://${project}.org/wiki/${t.replace(/ /g, "_")}`
  }));
  if (!opts.enrich) return { rows: list };
  const info = {};
  for (let i = 0; i < list.length; i += 50) {
    const params = new URLSearchParams({
      action: "query",
      prop: "pageimages|extracts",
      titles: list.slice(i, i + 50).map((r) => r.title.replace(/ /g, "_")).join("|"),
      piprop: "thumbnail",
      pithumbsize: "120",
      exintro: "1",
      explaintext: "1",
      exsentences: "3",
      format: "json",
      formatversion: "2",
      origin: "*"
    });
    const d = await fetchJSON(`https://${project}.org/w/api.php?${params}`);
    for (const p of d?.query?.pages || []) {
      info[p.title] = { thumb: p.thumbnail?.source?.split("?")[0], extract: p.extract || "" };
    }
  }
  return {
    rows: list.map((r) => {
      const enriched = info[r.title] || {};
      return { ...r, thumbUrl: enriched.thumb, extract: enriched.extract };
    })
  };
}
var SPARQL_TIMEOUT_MS = 6e4;
var SPARQL_GET_LIMIT = 1800;
var sparqlCache = createTtlCache(10 * 60 * 1e3);
function shortenSparqlUri(value) {
  const m = String(value).match(/\/(entity|File|Category)\/([^/]+)$/);
  return m ? m[2].replace(/_/g, " ") : value;
}
function coerceSparqlValue(binding) {
  if (binding.type === "uri") return shortenSparqlUri(binding.value);
  if (binding.type === "literal" && binding.datatype) {
    if (/#(?:integer|decimal|double|float|int|long|nonNegativeInteger|positiveInteger)$/.test(binding.datatype)) {
      const n = Number(binding.value);
      return Number.isFinite(n) ? n : binding.value;
    }
  }
  return binding.value;
}
async function fetchSparql(query, endpoint = "wdqs", maxRows = 100) {
  const ep = SPARQL_ENDPOINTS[endpoint] || SPARQL_ENDPOINTS.wdqs;
  const cap = Math.max(parseInt(maxRows) || 100, 1);
  if (endpoint === "humaniki") {
    const cached = await sparqlCache.get("humaniki::gap", async () => {
      const d = await fetchJSON(`${ep.url}?project=enwiki&label_lang=en`);
      const metrics = d?.metrics || [];
      const labels = d?.meta?.bias_labels || {};
      const femaleKey = Object.keys(labels).find((k) => /^female$/i.test(labels[k] || ""));
      let total = 0;
      let women = 0;
      for (const m of metrics) {
        for (const [gender, count] of Object.entries(m.values || {})) {
          total += count;
          if (gender === femaleKey) women += count;
        }
      }
      if (!total) throw new Error("Humaniki returned no counts");
      return {
        vars: ["total", "women", "pct"],
        rows: [{ total, women, pct: Math.round(women * 1e4 / total) / 100 }]
      };
    });
    return cached;
  }
  const q = String(query || "").trim();
  if (!q) throw new Error("Enter a SPARQL query (or pick a preset)");
  const params = new URLSearchParams({ query: q, format: "json" });
  const useGet = q.length <= SPARQL_GET_LIMIT;
  const url = useGet ? `${ep.url}?${params}` : ep.url;
  const body = useGet ? null : params.toString();
  const cacheKey = `${endpoint}::${q}`;
  return sparqlCache.get(cacheKey, async () => {
    const text = await fetchTextWithRetry(url, {
      timeoutMs: SPARQL_TIMEOUT_MS,
      retries: 1,
      method: useGet ? "GET" : "POST",
      body,
      contentType: "application/x-www-form-urlencoded"
    });
    let d;
    try {
      d = JSON.parse(text);
    } catch {
      throw new Error("SPARQL endpoint returned non-JSON (is the query valid?)");
    }
    if (d?.error) {
      const msg = typeof d.error === "string" ? d.error : d.error.message || JSON.stringify(d.error);
      throw new Error(`SPARQL error: ${msg}`);
    }
    const vars = d?.head?.vars || [];
    if (!vars.length) throw new Error("SPARQL returned no variables");
    const rows = (d?.results?.bindings || []).slice(0, cap).map((b) => {
      const row = {};
      for (const v of vars) row[v] = b[v] ? coerceSparqlValue(b[v]) : null;
      return row;
    });
    return { vars, rows };
  });
}
var CIM_BASE = "https://wikimedia.org/api/rest_v1/metrics/commons-analytics/";
var CIM_TTL = 60 * 60 * 1e3;
var cimCache = createTtlCache(CIM_TTL);
var CimUnregisteredError = class extends Error {
};
function cleanCategoryForCim(name) {
  return String(name || "").replace(/^Category:\s*/i, "").trim().replace(/ /g, "_");
}
function cleanMediaFileForCim(name) {
  return String(name || "").replace(/^File:\s*/i, "").trim().replace(/ /g, "_");
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
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const start = cimDate(y, m);
  const end = cimDate(...Object.values(shiftCimMonth(y, m, 1)));
  const probeStart = cimDate(py, pm);
  const probeEnd = cimDate(...Object.values(shiftCimMonth(py, pm, 1)));
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
async function fetchCimTrend(category, scope = "deep", wiki = "all-wikis", year, month, months = 6) {
  const cat = cleanCategoryForCim(category);
  if (!cat) throw new Error("Enter a Commons category");
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const n = Math.min(Math.max(parseInt(months) || 6, 2), 24);
  const end = shiftCimMonth(y, m, 1);
  const start = shiftCimMonth(y, m, -(n - 1));
  const items = await fetchCimMonth(
    `pageviews-per-category-monthly/${cat}/${scope}/${wiki}/${cimDate(start.year, start.month)}/${cimDate(end.year, end.month)}`,
    `pageviews-per-category-monthly/${cat}/${scope}/${wiki}/${cimDate(py, pm)}/${cimDate(...Object.values(shiftCimMonth(py, pm, 1)))}`
  );
  const rows = items.map((it) => ({ date: (it.timestamp || "").slice(0, 7), views: it["pageview-count"] ?? 0 }));
  return { category: cat, rows, resolvedMonth: { year: y, month: m } };
}
async function fetchCimTopFiles(category, scope = "deep", wiki = "all-wikis", year, month, topN = 10) {
  const cat = cleanCategoryForCim(category);
  if (!cat) throw new Error("Enter a Commons category");
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
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
async function fetchCimTopWikis(category, scope = "deep", year, month, topN = 10) {
  const cat = cleanCategoryForCim(category);
  if (!cat) throw new Error("Enter a Commons category");
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const n = Math.min(Math.max(parseInt(topN) || 10, 1), 50);
  const items = await fetchCim(`top-wikis-per-category-monthly/${cat}/${scope}/${y}/${String(m).padStart(2, "0")}`);
  return { category: cat, rows: items.slice(0, n).map((it) => ({ wiki: it.wiki, views: it["pageview-count"] ?? 0 })), resolvedMonth: { year: y, month: m } };
}
async function fetchCimTopPages(category, scope = "deep", wiki = "all-wikis", year, month, topN = 10) {
  const cat = cleanCategoryForCim(category);
  if (!cat) throw new Error("Enter a Commons category");
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const n = Math.min(Math.max(parseInt(topN) || 10, 1), 50);
  const items = await fetchCim(`top-pages-per-category-monthly/${cat}/${scope}/${wiki}/${y}/${String(m).padStart(2, "0")}`);
  return { category: cat, rows: items.slice(0, n).map((it) => ({ wiki: it["page-wiki"], page: it["page-title"], views: it["pageview-count"] ?? 0 })), resolvedMonth: { year: y, month: m } };
}
async function fetchCimTopEditors(category, scope = "deep", editType = "all-edit-types", year, month, topN = 10) {
  const cat = cleanCategoryForCim(category);
  if (!cat) throw new Error("Enter a Commons category");
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const n = Math.min(Math.max(parseInt(topN) || 10, 1), 50);
  const items = await fetchCim(`top-editors-monthly/${cat}/${scope}/${editType}/${y}/${String(m).padStart(2, "0")}`);
  return { category: cat, rows: items.slice(0, n).map((it) => ({ user: it["user-name"], edits: it["edit-count"] ?? 0 })), resolvedMonth: { year: y, month: m } };
}
async function fetchCimLeaderboard(scope = "deep", wiki = "all-wikis", year, month) {
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const items = await fetchCim(`top-viewed-categories-monthly/${scope}/${wiki}/${y}/${String(m).padStart(2, "0")}`);
  return { rows: items.map((it) => ({ category: it.category, views: it["pageview-count"] ?? 0, rank: it.rank ?? 0 })), resolvedMonth: { year: y, month: m } };
}
async function fetchCommonsFileImage(file) {
  try {
    const params = new URLSearchParams({
      action: "query",
      prop: "imageinfo",
      titles: `File:${file}`,
      // File: prefix REQUIRED after normalization (gotcha #12)
      iiprop: "url",
      iiurlwidth: "480",
      format: "json",
      origin: "*"
    });
    const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
    const info = Object.values(d?.query?.pages || {})[0]?.imageinfo?.[0];
    return info?.thumburl ? { url: info.thumburl.split("?")[0] } : null;
  } catch {
    return null;
  }
}
async function fetchCimFileSpotlight(mediaFile, wiki = "all-wikis", year, month, showImage = true) {
  const file = cleanMediaFileForCim(mediaFile);
  if (!file) throw new Error("Enter a Commons file name");
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const start = cimDate(y, m);
  const end = cimDate(...Object.values(shiftCimMonth(y, m, 1)));
  const probeStart = cimDate(py, pm);
  const probeEnd = cimDate(...Object.values(shiftCimMonth(py, pm, 1)));
  const trendStart = shiftCimMonth(y, m, -5);
  const [snapItems, trendItems, image] = await Promise.all([
    fetchCimMonth(`media-file-metrics-snapshot/${file}/${start}/${end}`, `media-file-metrics-snapshot/${file}/${probeStart}/${probeEnd}`),
    fetchCim(`pageviews-per-media-file-monthly/${file}/${wiki}/${cimDate(trendStart.year, trendStart.month)}/${end}`),
    showImage ? fetchCommonsFileImage(file) : Promise.resolve(null)
  ]);
  const snap = snapItems[0] || {};
  const trend = trendItems.map((it) => ({ date: (it.timestamp || "").slice(0, 7), views: it["pageview-count"] ?? 0 }));
  return {
    file,
    resolvedMonth: { year: y, month: m },
    image,
    wikis: snap["leveraging-wiki-count"] ?? 0,
    pages: snap["leveraging-page-count"] ?? 0,
    views: trend[trend.length - 1]?.views ?? 0,
    // selected month (snapshot window)
    trend
  };
}
async function fetchCimFileTraffic(mediaFile, wiki = "all-wikis", months = 12, year, month) {
  const file = cleanMediaFileForCim(mediaFile);
  if (!file) throw new Error("Enter a Commons file name");
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const n = Math.min(Math.max(parseInt(months) || 12, 3), 24);
  const end = shiftCimMonth(y, m, 1);
  const start = shiftCimMonth(y, m, -(n - 1));
  const items = await fetchCimTrafficWithHeal(file, wiki, start, end);
  const rows = items.map((it) => ({ date: (it.timestamp || "").slice(0, 7), views: it["pageview-count"] ?? 0 }));
  return { file, rows, resolvedMonth: { year: y, month: m } };
}
async function fetchCimTrafficWithHeal(file, wiki, start, end) {
  try {
    return await fetchCim(`pageviews-per-media-file-monthly/${file}/${wiki}/${cimDate(start.year, start.month)}/${cimDate(end.year, end.month)}`);
  } catch (e) {
    if (!String(e.message).startsWith("HTTP 500")) throw e;
    const s2 = shiftCimMonth(start.year, start.month, 1);
    return fetchCim(`pageviews-per-media-file-monthly/${file}/${wiki}/${cimDate(s2.year, s2.month)}/${cimDate(end.year, end.month)}`);
  }
}
var waybackCache = createTtlCache(10 * 60 * 1e3);
async function waybackCdxNearest(clean, date, tol) {
  const day = 864e5;
  const from = new Date(new Date(date).getTime() - tol * day).toISOString().slice(0, 10).replace(/-/g, "");
  const to = new Date(new Date(date).getTime() + tol * day).toISOString().slice(0, 10).replace(/-/g, "");
  const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(clean)}&from=${from}&to=${to}&output=json&fl=timestamp,original,statuscode&collapse=timestamp:6&filter=statuscode:200&limit=200`;
  const proxy = `/api/proxy?url=${encodeURIComponent(cdx)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await fetchTextWithRetry(proxy, { timeoutMs: 2e4, retries: 1 });
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
      }
      let rows = null;
      try {
        rows = typeof parsed?.body === "string" ? JSON.parse(parsed.body) : parsed?.body;
      } catch {
      }
      if (rows && Array.isArray(rows) && rows.length >= 2) {
        const cols = rows[0];
        const iTs = cols.indexOf("timestamp");
        const iOrig = cols.indexOf("original");
        const iSt = cols.indexOf("statuscode");
        let best = null;
        for (let r = 1; r < rows.length; r++) {
          const capTs = String(rows[r][iTs] || "");
          if (!/^\d{14}$/.test(capTs)) continue;
          const d = Math.round(Math.abs((new Date(capTs.slice(0, 4), capTs.slice(4, 6) - 1, capTs.slice(6, 8)) - new Date(date)) / day));
          if (!best || d < best.diffDays) best = { capTs, original: rows[r][iOrig], status: rows[r][iSt], diffDays: d };
        }
        if (best) return best;
        return null;
      }
    } catch {
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
  }
  return null;
}
async function fetchWaybackGallery(url, dates, toleranceDays = 30, opts = {}) {
  const clean = String(url || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!clean) throw new Error("Enter a website URL");
  const list = String(dates || "").split("\n").map((d) => d.trim()).filter((d) => /^\d{4}[-/]?\d{2}[-/]?\d{2}$/.test(d)).map((d) => d.replace(/[/]/g, "-")).slice(0, 24);
  if (!list.length) throw new Error("Enter dates (YYYY-MM-DD, one per line)");
  const tol = Math.max(parseInt(toleranceDays) || 30, 1);
  const lsKey = `wikibento-wayback:${clean}|${list.join(",")}|${tol}`;
  const cached = readWaybackCache(lsKey);
  const isFresh = !opts.force && cached && Date.now() - cached.ts < 60 * 60 * 1e3;
  if (isFresh) return cached.payload;
  try {
    const batchUrl = `/api/wayback-gallery?url=${encodeURIComponent(clean)}&dates=${encodeURIComponent(list.join(","))}&tolerance=${tol}${opts.force ? "&force=1" : ""}`;
    const batchText = await fetchTextWithRetry(batchUrl, { timeoutMs: 25e3, retries: 1 });
    const batch = JSON.parse(batchText);
    if (batch && Array.isArray(batch.rows)) {
      if (batch.rows.some((r) => r.available)) {
        const payload2 = { url: clean, rows: batch.rows };
        writeWaybackCache(lsKey, payload2);
        return payload2;
      }
      if (cached) return { ...cached.payload, stale: true };
      return { url: clean, rows: batch.rows };
    }
  } catch {
  }
  const rows = await Promise.all(list.map(async (date) => {
    const ts = date.replace(/[-/]/g, "");
    const api = `https://archive.org/wayback/available?url=${encodeURIComponent(clean)}&timestamp=${ts}`;
    let closest = null;
    try {
      const text = opts.force ? await fetchTextWithRetry(api, { timeoutMs: 1e4, retries: 1 }) : await waybackCache.get(api, () => fetchTextWithRetry(api, { timeoutMs: 1e4, retries: 1 }));
      let data = {};
      try {
        data = JSON.parse(text);
      } catch {
      }
      closest = data?.archived_snapshots?.closest;
    } catch {
    }
    if (!closest || !closest.available) {
      try {
        const viaCdx = await waybackCdxNearest(clean, date, tol);
        if (viaCdx) {
          const { capTs: capTs2, original, status, diffDays: diffDays2 } = viaCdx;
          const row = {
            date,
            available: true,
            withinTolerance: diffDays2 <= tol,
            diffDays: diffDays2,
            timestamp: capTs2,
            captureDate: `${capTs2.slice(0, 4)}-${capTs2.slice(4, 6)}-${capTs2.slice(6, 8)}`,
            status,
            snapshotUrl: `https://web.archive.org/web/${capTs2}/${original || clean}`,
            replayUrl: `https://web.archive.org/web/${capTs2}id_/${clean}`
          };
          return row;
        }
      } catch {
      }
      return { date, available: false, lookupFailed: true };
    }
    const capTs = String(closest.timestamp);
    const captureDate = `${capTs.slice(0, 4)}-${capTs.slice(4, 6)}-${capTs.slice(6, 8)}`;
    const diffDays = Math.round(Math.abs((new Date(captureDate) - new Date(date)) / 864e5));
    const snapshotUrl = String(closest.url).replace(/^http:\/\//i, "https://");
    return {
      date,
      available: true,
      withinTolerance: diffDays <= tol,
      diffDays,
      timestamp: capTs,
      captureDate,
      status: closest.status,
      snapshotUrl,
      replayUrl: `https://web.archive.org/web/${capTs}id_/${clean}`
    };
  }));
  const payload = { url: clean, rows };
  if (rows.some((r) => r.available)) writeWaybackCache(lsKey, payload);
  if (!rows.some((r) => r.available) && cached) return { ...cached.payload, stale: true };
  return payload;
}
var WAYBACK_LS = "wikibento-wayback-cache";
function readWaybackCache(key) {
  try {
    const all = JSON.parse(localStorage.getItem(WAYBACK_LS) || "{}");
    const hit = all[key];
    return hit ? { ts: hit.ts, payload: hit.payload } : null;
  } catch {
    return null;
  }
}
function writeWaybackCache(key, payload) {
  try {
    const all = JSON.parse(localStorage.getItem(WAYBACK_LS) || "{}");
    all[key] = { ts: Date.now(), payload };
    for (const k of Object.keys(all)) {
      if (Date.now() - all[k].ts > 7 * 24 * 60 * 60 * 1e3) delete all[k];
    }
    localStorage.setItem(WAYBACK_LS, JSON.stringify(all));
  } catch {
  }
}

// src/lib/scope.js
function prevMonth(d = /* @__PURE__ */ new Date()) {
  return {
    year: d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(),
    month: d.getMonth() === 0 ? 12 : d.getMonth()
  };
}
function resolveMonth(configMonth, d = /* @__PURE__ */ new Date()) {
  const p = prevMonth(d);
  const m = parseInt(configMonth);
  if (!m) return p;
  if (m < 1 || m > 12) return p;
  const year = m > d.getMonth() + 1 ? p.year : d.getFullYear();
  return { year, month: m };
}
function shiftMonth(year, month, delta) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
function fmtMonth(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}
function fmtMonthRange(y1, m1, y2, m2) {
  return `${fmtMonth(y1, m1)} \u2192 ${fmtMonth(y2, m2)}`;
}
function fmtDay(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function fmtDayRange(y1, m1, d1, y2, m2, d2) {
  return `${fmtDay(y1, m1, d1)} \u2192 ${fmtDay(y2, m2, d2)}`;
}
function yesterday(d = /* @__PURE__ */ new Date()) {
  const y = new Date(d);
  y.setDate(y.getDate() - 1);
  return { year: y.getFullYear(), month: y.getMonth() + 1, day: y.getDate() };
}
function dayWindow(n, d = /* @__PURE__ */ new Date()) {
  const end = yesterday(d);
  const start = new Date(Date.UTC(end.year, end.month - 1, end.day - (n - 1)));
  return {
    start: { year: start.getUTCFullYear(), month: start.getUTCMonth() + 1, day: start.getUTCDate() },
    end
  };
}

// src/widgets/index.js
var NAMESPACE_LABELS = {
  "0": "articles only",
  "0|1": "articles + talk",
  "6": "files",
  "10": "templates",
  "14": "categories"
};
var PROJECT_OPTIONS = [
  { value: "en.wikipedia", label: "English Wikipedia" },
  { value: "de.wikipedia", label: "German Wikipedia" },
  { value: "fr.wikipedia", label: "French Wikipedia" }
];
var CIM_SCOPES = [
  { value: "deep", label: "Deep (whole tree)" },
  { value: "shallow", label: "Shallow (category only)" }
];
var CIM_WIKIS = [
  { value: "all-wikis", label: "All wikis" },
  ...PROJECT_OPTIONS
];
var CIM_EDIT_TYPES = [
  { value: "all-edit-types", label: "All edit types" },
  { value: "create", label: "Creates" },
  { value: "update", label: "Updates" }
];
var CIM_CATEGORY_FIELD = { key: "category", label: "Commons category", type: "text", placeholder: "Files from the Biodiversity Heritage Library" };
var CIM_MONTH_FIELD = { key: "month", label: "Month (default: last complete month)", type: "number", placeholder: "7" };
var cimRanking = (title, subtitle, columns, rows, colClasses) => ({ title, subtitle, columns, rows, colClasses });
var editorLinks = (user) => {
  const enc = encodeURIComponent(user.replace(/ /g, "_"));
  return {
    text: user,
    links: [
      { label: "User", href: `https://commons.wikimedia.org/wiki/User:${enc}` },
      { label: "Talk", href: `https://commons.wikimedia.org/wiki/User_talk:${enc}` },
      { label: "Contrib", href: `https://commons.wikimedia.org/wiki/Special:Contributions/${enc}` }
    ]
  };
};
var pageHref = (wiki, page) => {
  const host = /^[a-z0-9-]+\./.test(wiki) ? `${wiki}.org` : { wikidata: "wikidata.org", species: "species.wikimedia.org", meta: "meta.wikimedia.org", commons: "commons.wikimedia.org", incubator: "incubator.wikimedia.org", mediawiki: "www.mediawiki.org" }[wiki];
  return host ? `https://${host}/wiki/${encodeURIComponent(page.replace(/ /g, "_"))}` : null;
};
var WIKI_PAGE_PROJECTS = [
  ...PROJECT_OPTIONS,
  { value: "commons.wikimedia", label: "Wikimedia Commons" }
];
var PREV_MONTH = (() => {
  const d = /* @__PURE__ */ new Date();
  return { year: d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(), month: d.getMonth() === 0 ? 12 : d.getMonth() };
})();
var NOISE_RE = [
  /^\.[a-z0-9-]{1,63}$/i,
  // dot-TLD pages: .xxx, .xyz, .top
  /^x{3,4}(\s*\([^)]*\))?$/i
  // bare/sponsored XXX variants: xxx, XXXX (beer)
];
var WIDGET_TYPES = {
  pageviews: {
    id: "pageviews",
    category: "Articles",
    intensity: "low",
    timeScope: "range",
    name: "Article Pageviews",
    icon: "\u{1F4CA}",
    description: "30-day pageview count for a Wikipedia article",
    labelFromConfig: (c) => c.article?.replace(/_/g, " "),
    defaults: {
      article: "Main_Page",
      project: "en.wikipedia",
      displayMode: "stat",
      // 'stat' | 'trend'
      refreshSeconds: 3600
    },
    renderer: "StatCard",
    getRenderer: (config) => config.displayMode === "trend" ? "TrendCard" : "StatCard",
    dataSource: "pageviews",
    configFields: [
      { key: "article", label: "Article", type: "text", placeholder: "Main_Page" },
      { key: "project", label: "Project", type: "select", options: [
        { value: "en.wikipedia", label: "English Wikipedia" },
        { value: "de.wikipedia", label: "German Wikipedia" },
        { value: "fr.wikipedia", label: "French Wikipedia" },
        { value: "commons.wikimedia", label: "Wikimedia Commons" }
      ] },
      { key: "displayMode", label: "Display", type: "select", options: [
        { value: "stat", label: "Stat Card" },
        { value: "trend", label: "Trend Chart" }
      ] }
    ],
    fetch: (config) => fetchPageviews(config.article, config.project),
    transform: (data, config) => {
      if (config.displayMode === "stat") {
        return {
          title: `${data.article.replace(/_/g, " ")}`,
          subtitle: `${(() => {
            const w = dayWindow(30);
            return fmtDayRange(w.start.year, w.start.month, w.start.day, w.end.year, w.end.month, w.end.day);
          })()} \xB7 30-day pageviews`,
          value: data.total?.toLocaleString(),
          detail: `~${data.avg?.toLocaleString()}/day`,
          trend: data.trend,
          trendLabel: "Daily views"
        };
      }
      return {
        chartData: data.trend,
        chartKey: "views",
        chartLabel: "Daily Pageviews",
        title: `${data.article.replace(/_/g, " ")}`,
        subtitle: `${(() => {
          const w = dayWindow(30);
          return fmtDayRange(w.start.year, w.start.month, w.start.day, w.end.year, w.end.month, w.end.day);
        })()} \xB7 30-day pageviews`
      };
    }
  },
  linkcount: {
    id: "linkcount",
    category: "Rankings & Platforms",
    intensity: "low",
    timeScope: "point",
    name: "External Link Count",
    icon: "\u{1F517}",
    description: "Count pages linking to a domain on Wikipedia",
    labelFromConfig: (c) => c.domain,
    defaults: {
      domain: "Libretexts.org",
      wiki: "en.wikipedia",
      namespace: "",
      // '' = all namespaces; '0' = article space only
      refreshSeconds: 3600
    },
    renderer: "StatCard",
    dataSource: "exturlusage",
    configFields: [
      { key: "domain", label: "Domain", type: "text", placeholder: "example.org" },
      { key: "wiki", label: "Wiki", type: "select", options: [
        { value: "en.wikipedia", label: "English Wikipedia" },
        { value: "de.wikipedia", label: "German Wikipedia" },
        { value: "fr.wikipedia", label: "French Wikipedia" }
      ] },
      { key: "namespace", label: "Namespace", type: "select", options: [
        { value: "", label: "All namespaces" },
        { value: "0", label: "Articles only" },
        { value: "0|1", label: "Articles + Talk" },
        { value: "6", label: "Files" },
        { value: "10", label: "Templates" },
        { value: "14", label: "Categories" }
      ] }
    ],
    fetch: (config) => fetchExternalLinks(config.domain, config.wiki, config.namespace),
    transform: (data) => ({
      title: `Links to ${data.domain}`,
      subtitle: `on ${data.wiki}.org${data.namespace ? ` \xB7 ${NAMESPACE_LABELS[data.namespace] || `ns ${data.namespace}`}` : ""}${data.totalExact ? "" : " (5,000+ total)"}`,
      value: typeof data.total === "string" ? data.total : data.total?.toLocaleString(),
      detail: data.totalExact ? "total pages linking" : "pages linking (capped)"
    })
  },
  categorySize: {
    id: "categorySize",
    category: "Categories & GLAM",
    intensity: "medium",
    timeScope: "point",
    name: "Category Size",
    icon: "\u{1F4C1}",
    description: "File/page count for a Commons or Wikipedia category",
    labelFromConfig: (c) => c.category?.replace(/^Category:\s*/i, ""),
    defaults: {
      category: "Images from Wiki Loves Monuments 2024",
      wiki: "commons.wikimedia",
      sampleCount: 6,
      refreshSeconds: 3600
    },
    renderer: "StatCard",
    dataSource: "categoryinfo",
    configFields: [
      { key: "category", label: "Category", type: "text", placeholder: "Images from X" },
      { key: "wiki", label: "Wiki", type: "select", options: [
        { value: "commons.wikimedia", label: "Wikimedia Commons" },
        { value: "en.wikipedia", label: "English Wikipedia" }
      ] },
      { key: "sampleCount", label: "Sample imgs", type: "number", placeholder: "0 = off, max 24" }
    ],
    fetch: (config) => fetchCategorySize(config.category, config.wiki, config.sampleCount),
    transform: (data, config) => ({
      title: data.category,
      subtitle: config.wiki === "commons.wikimedia" ? "on Wikimedia Commons" : `on ${config.wiki}`,
      value: data.total?.toLocaleString(),
      detail: `${data.files?.toLocaleString() || 0} files, ${data.pages?.toLocaleString() || 0} pages, ${data.subcats?.toLocaleString() || 0} subcats`,
      sample: data.sample || []
    })
  },
  wikistats: {
    id: "wikistats",
    category: "Rankings & Platforms",
    intensity: "low",
    timeScope: "point",
    name: "Wiki Stats",
    icon: "\u{1F310}",
    description: "Aggregate stats for a Wikipedia language edition",
    labelFromConfig: (c) => c.lang ? `${c.lang}.wikipedia.org` : null,
    defaults: {
      table: "wikipedias",
      lang: "en",
      refreshSeconds: 7200
    },
    renderer: "StatCard",
    dataSource: "wikistats",
    configFields: [
      { key: "lang", label: "Language", type: "select", options: [
        { value: "en", label: "English" },
        { value: "de", label: "German" },
        { value: "fr", label: "French" },
        { value: "ja", label: "Japanese" },
        { value: "zh", label: "Chinese" },
        { value: "es", label: "Spanish" },
        { value: "ar", label: "Arabic" },
        { value: "pt", label: "Portuguese" },
        { value: "ru", label: "Russian" },
        { value: "it", label: "Italian" }
      ] },
      { key: "table", label: "Project Type", type: "select", options: [
        { value: "wikipedias", label: "Wikipedias" },
        { value: "wiktionaries", label: "Wiktionaries" },
        { value: "wikisources", label: "Wikisources" }
      ] }
    ],
    fetch: (config) => fetchWikistats(config.table, config.lang),
    transform: (data) => ({
      title: `${data.lang || data.rows?.[0]?.lang}.wikipedia.org`,
      subtitle: "Aggregate statistics",
      value: (parseInt(data.good) || parseInt(data.total) || 0).toLocaleString(),
      detail: data.good ? `Articles: ${parseInt(data.good).toLocaleString()} \xB7 Edits: ${parseInt(data.edits).toLocaleString()} \xB7 Users: ${parseInt(data.users).toLocaleString()}` : ""
    })
  },
  fileUsage: {
    id: "fileUsage",
    category: "Files & Media",
    intensity: "low",
    timeScope: "point",
    name: "File Usage Map",
    icon: "\u{1F5BC}\uFE0F",
    description: "How many wikis use a Commons file, with top breakdown",
    labelFromConfig: (c) => c.filename?.replace(/^File:\s*/i, ""),
    defaults: {
      filename: "Example.jpg",
      topN: 10,
      showImage: true,
      showCaption: false,
      refreshSeconds: 3600
    },
    renderer: "RankingCard",
    dataSource: "globalusage",
    configFields: [
      { key: "filename", label: "Commons Filename", type: "text", placeholder: "Example.jpg" },
      { key: "topN", label: "Top N wikis", type: "number", placeholder: "10" },
      { key: "showImage", label: "Show image", type: "boolean" },
      { key: "showCaption", label: "Show caption", type: "boolean" }
    ],
    fetch: (config) => fetchFileUsage(config.filename, config.topN),
    transform: (data, config) => ({
      title: `Usage of ${data.filename}`,
      subtitle: `${data.totalUsages} uses across ${data.totalWikis} wikis`,
      fileTitle: `File:${data.filename.replace(/^File:\s*/i, "")}`,
      columns: ["Wiki", "Uses"],
      rows: data.top.map(({ wiki, count }) => [wiki, count.toLocaleString()]),
      image: config.showImage !== false ? data.image : null,
      caption: config.showCaption ? data.image?.description : null
    })
  },
  glamorgan: {
    id: "glamorgan",
    category: "Categories & GLAM",
    intensity: "high",
    loadingHint: "Walking the category tree via PetScan \u2014 large budgets can take 30\u201390 s",
    timeScope: "month",
    name: "GLAM Category Usage",
    icon: "\u{1F4C8}",
    description: "Impact stats for a Commons category: files, used files, pages, total views (GLAMorgan-style)",
    labelFromConfig: (c) => c.category?.replace(/^Category:\s*/i, ""),
    defaults: {
      category: "Featured pictures on Wikimedia Commons",
      depth: 0,
      year: PREV_MONTH.year,
      month: PREV_MONTH.month,
      negcats: "",
      negdepth: 0,
      fileBudget: 500,
      topN: 5,
      showDetail: true,
      refreshSeconds: 7200
    },
    renderer: "GlamCard",
    dataSource: "petscan-style walk + pageviews",
    configFields: [
      { key: "category", label: "Category", type: "text", placeholder: "Images from X" },
      { key: "depth", label: "Depth", type: "number", min: 0, max: 12, hint: "0 = category only, 1 = + direct subcats", placeholder: "0-12" },
      { key: "year", label: "Year", type: "number", placeholder: "2026" },
      { key: "month", label: "Month", type: "number", placeholder: "1-12" },
      { key: "negcats", label: "Exclude cats", type: "text", placeholder: "Cat A|Cat B" },
      { key: "negdepth", label: "Excl depth", type: "number", min: 0, max: 12, hint: "0 = excluded cats only, 1 = + their subcats", placeholder: "0" },
      { key: "fileBudget", label: "File budget", type: "number", min: 50, max: 3e4, placeholder: "500" },
      { key: "topN", label: "Top images", type: "number", min: 1, max: 10, placeholder: "5" },
      { key: "showDetail", label: "Top file detail", type: "boolean" }
    ],
    fetch: (config) => fetchGlamStats(config),
    transform: (data, config) => {
      const depth = parseInt(config?.depth) || 0;
      const emptyHint = data.files === 0 ? depth === 0 ? "No files directly in this category \u2014 increase Depth to include subcategories" : "No files found in this category tree" : void 0;
      return {
        title: data.category,
        emptyHint,
        href: `https://commons.wikimedia.org/wiki/Category:${encodeURIComponent(data.category)}`,
        subtitle: `${data.monthLabel} \xB7 ${data.files.toLocaleString()} files${data.cappedFiles ? " (capped)" : ""}${data.partialViews ? " \xB7 views partial" : ""}${data.source === "selfwalk" ? " \xB7 self-walk fallback" : ""}`,
        stats: [
          { label: "Files in category", value: data.files.toLocaleString(), sub: data.cappedFiles ? "budget-capped" : void 0 },
          { label: "Files viewed", value: data.viewedFiles.toLocaleString(), sub: `of ${data.usedFiles.toLocaleString()} used` },
          { label: "Pages using files", value: data.pages.toLocaleString(), sub: `on ${data.wikis.toLocaleString()} wikis` },
          { label: "Total views", value: data.totalViews.toLocaleString(), sub: data.monthLabel }
        ],
        filmstrip: data.top,
        detail: data.detail && {
          ...data.detail,
          // Top-file name → its Commons File: page; usage rows → their pages
          // (pageHref takes CIM-style prefixes, so drop the .org on domains).
          titleHref: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent((data.detail.title || "").replace(/^Top file: /, "").replace(/ /g, "_"))}`,
          rows: (data.detail.rows || []).map((u) => ({
            wiki: u.wiki,
            page: u.page,
            views: u.views,
            href: pageHref(u.wiki.replace(/\.org$/, ""), u.page)
          }))
        }
      };
    }
  },
  topWikipedias: {
    id: "topWikipedias",
    category: "Rankings & Platforms",
    intensity: "low",
    timeScope: "point",
    name: "Top 10 Wikipedias",
    icon: "\u{1F3C6}",
    description: "Largest Wikipedias by article count",
    defaults: {
      refreshSeconds: 7200
    },
    renderer: "RankingCard",
    dataSource: "wikistats",
    configFields: [],
    fetch: () => fetchWikistats("wikipedias", null),
    transform: (data) => ({
      title: "Largest Wikipedias",
      subtitle: "By article count",
      columns: ["Language", "Articles"],
      rows: (data.rows || []).map((r) => [r.lang, (parseInt(r.good) || 0).toLocaleString()])
    })
  },
  topPages: {
    id: "topPages",
    category: "Rankings & Platforms",
    intensity: "medium",
    timeScope: "day",
    name: "Top Wikipedia Articles",
    icon: "\u{1F525}",
    description: "Most-visited articles on a Wikipedia language edition (top.hatnote.com)",
    labelFromConfig: (c) => c.lang ? `${c.lang}.wikipedia` : null,
    defaults: {
      lang: "en",
      dateMode: "latest",
      // 'latest' | 'date'
      year: (/* @__PURE__ */ new Date()).getUTCFullYear(),
      month: (/* @__PURE__ */ new Date()).getUTCMonth() + 1,
      day: (/* @__PURE__ */ new Date()).getUTCDate(),
      topN: 10,
      // 0 = default (10), 100 = all
      filterNoise: true,
      showExpanded: false,
      // thumbnail + summary per row (hatnote data)
      refreshSeconds: 3600
    },
    renderer: "RankingCard",
    getRenderer: (config) => config.showExpanded ? "TopPagesExpandedCard" : "RankingCard",
    dataSource: "top.hatnote.com (via /api/proxy) + WMF pageviews top fallback",
    configFields: [
      { key: "lang", label: "Language", type: "select", options: [
        { value: "en", label: "English" },
        { value: "de", label: "Deutsch" },
        { value: "fr", label: "Fran\xE7ais" },
        { value: "ko", label: "\uD55C\uAD6D\uC5B4" },
        { value: "et", label: "Eesti" },
        { value: "sv", label: "Svenska" },
        { value: "hu", label: "Magyar" },
        { value: "da", label: "Dansk" },
        { value: "it", label: "Italiano" },
        { value: "pa", label: "\u0A2A\u0A70\u0A1C\u0A3E\u0A2C\u0A40" },
        { value: "ca", label: "Catal\xE0" },
        { value: "es", label: "Espa\xF1ol" },
        { value: "fa", label: "\u0641\u0627\u0631\u0633\u06CC" },
        { value: "ur", label: "\u0627\u0631\u062F\u0648" },
        { value: "zh", label: "\u4E2D\u6587" },
        { value: "kn", label: "\u0C95\u0CA8\u0CCD\u0CA8\u0CA1" },
        { value: "no", label: "Norsk bokm\xE5l" },
        { value: "bn", label: "\u09AC\u09BE\u0982\u09B2\u09BE" },
        { value: "id", label: "Bahasa Indonesia" },
        { value: "ta", label: "\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD" },
        { value: "lv", label: "Latvie\u0161u" },
        { value: "el", label: "\u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC" },
        { value: "fi", label: "Suomi" },
        { value: "ar", label: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629" },
        { value: "cs", label: "\u010Ce\u0161tina" },
        { value: "or", label: "\u0B13\u0B21\u0B3C\u0B3F\u0B06" },
        { value: "te", label: "\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41" },
        { value: "gl", label: "Galego" }
      ] },
      { key: "dateMode", label: "Date", type: "select", options: [
        { value: "latest", label: "Latest available" },
        { value: "date", label: "Specific date\u2026" }
      ] },
      { key: "year", label: "Year", type: "number", placeholder: "2026" },
      { key: "month", label: "Month", type: "number", placeholder: "1-12" },
      { key: "day", label: "Day", type: "number", placeholder: "1-31" },
      { key: "topN", label: "Top N (0 = default 10, 100 = all)", type: "number", placeholder: "10" },
      { key: "filterNoise", label: "Filter TLD/spam noise (.xxx, XXX\u2026)", type: "boolean" },
      { key: "showExpanded", label: "Expanded view (thumbnail + summary)", type: "boolean" }
    ],
    fetch: (config) => fetchTopPages(config),
    transform: (data, config) => {
      let articles = data.articles;
      let filtered = 0;
      if (config.filterNoise !== false) {
        articles = articles.filter((a) => {
          const bad = NOISE_RE.some((re) => re.test(a.title));
          if (bad) filtered++;
          return !bad;
        });
      }
      const raw = config.topN == null || config.topN <= 0 ? 10 : config.topN;
      const topN = Math.min(raw, 100);
      const rows = articles.slice(0, topN);
      const subtitle = `${data.dateLabel} \xB7 ${topN >= 100 ? `all ${rows.length}` : `top ${rows.length}`}${filtered ? ` (${filtered} filtered)` : ""}${data.source === "wmf" ? " \xB7 via WMF Pageviews API" : ""}${data.totalTrafficShort ? ` \xB7 ${data.totalTrafficShort} views total` : ""}`;
      if (config.showExpanded) {
        return {
          title: `${data.fullLang || "en"} Wikipedia`,
          subtitle,
          expanded: true,
          columns: ["Article", "Views"],
          rows: rows.map((a) => ({
            title: a.title,
            views: a.views_short,
            imageUrl: a.imageUrl,
            summary: a.summary,
            url: a.url
          }))
        };
      }
      return {
        title: `${data.fullLang || "en"} Wikipedia`,
        subtitle,
        columns: ["Article", "Views"],
        // No rank column: the RankingCard numbers rows sequentially 1..N,
        // so after noise filtering the list is renumbered (no gaps).
        rows: rows.map((a) => [a.title, a.views_short])
      };
    }
  },
  markdown: {
    id: "markdown",
    category: "Content & Embeds",
    intensity: "low",
    timeScope: "point",
    name: "Text / Markdown",
    icon: "\u{1F4DD}",
    description: "Free-form Markdown card \u2014 notes, headings, links, explanations",
    defaults: {
      text: "## Welcome\n\nThis is a **Markdown** card. Click \u2699 to edit the text.",
      allowExternalImages: false,
      refreshSeconds: 86400
    },
    renderer: "MarkdownCard",
    dataSource: "static (no fetch)",
    configFields: [
      { key: "text", label: "Markdown content", type: "textarea", rows: 8, placeholder: "# Heading\n\nSome **bold** text\u2026" },
      { key: "allowExternalImages", label: "Allow external images (any https host)", type: "boolean" }
    ],
    // No fetch — a static widget: WidgetFrame renders transform(null, config)
    transform: (data, config) => ({ markdown: config.text, allowExternalImages: config.allowExternalImages })
  },
  excerpt: {
    id: "excerpt",
    category: "Articles",
    intensity: "low",
    timeScope: "point",
    name: "Article Excerpt",
    icon: "\u{1F4C4}",
    description: "First paragraph, description, and thumbnail for an article",
    labelFromConfig: (c) => c.article?.replace(/_/g, " "),
    defaults: {
      article: "Albert Einstein",
      project: "en.wikipedia",
      refreshSeconds: 3600
    },
    renderer: "ExcerptCard",
    dataSource: "REST /page/summary",
    configFields: [
      { key: "article", label: "Article", type: "text", placeholder: "Albert Einstein" },
      { key: "project", label: "Project", type: "select", options: PROJECT_OPTIONS }
    ],
    fetch: (config) => fetchArticleSummary(config.article, config.project),
    transform: (data) => ({
      title: data.title,
      description: data.description,
      extract: data.extract,
      thumbnailUrl: data.thumbnailUrl,
      pageUrl: data.pageUrl
    })
  },
  edithistory: {
    id: "edithistory",
    category: "Articles",
    intensity: "low",
    timeScope: "point",
    name: "Edit History",
    icon: "\u{1F553}",
    description: "Recent edits to an article, newest first, with byte deltas",
    labelFromConfig: (c) => c.article?.replace(/_/g, " "),
    defaults: {
      article: "Albert Einstein",
      project: "en.wikipedia",
      limit: 10,
      refreshSeconds: 3600
    },
    renderer: "EditHistoryCard",
    dataSource: "Action API prop=revisions",
    configFields: [
      { key: "article", label: "Article", type: "text", placeholder: "Albert Einstein" },
      { key: "project", label: "Project", type: "select", options: PROJECT_OPTIONS },
      { key: "limit", label: "Edits to show", type: "number", placeholder: "10 (max 50)" }
    ],
    fetch: (config) => fetchEditHistory(config.article, config.project, Math.min(parseInt(config.limit) || 10, 50)),
    transform: (data) => ({
      title: data.article.replace(/_/g, " "),
      project: data.project,
      rows: data.rows
    })
  },
  quality: {
    id: "quality",
    category: "Articles",
    intensity: "low",
    timeScope: "point",
    name: "Article Quality (ORES)",
    icon: "\u{1F3C5}",
    description: "Predicted quality class for an article (Lift Wing / ORES)",
    labelFromConfig: (c) => c.article?.replace(/_/g, " "),
    defaults: {
      article: "Albert Einstein",
      project: "en.wikipedia",
      refreshSeconds: 3600
    },
    renderer: "QualityCard",
    dataSource: "Lift Wing (api.wikimedia.org)",
    configFields: [
      { key: "article", label: "Article", type: "text", placeholder: "Albert Einstein" },
      { key: "project", label: "Project", type: "select", options: PROJECT_OPTIONS }
    ],
    fetch: (config) => fetchArticleQuality(config.article, config.project),
    transform: (data) => ({
      title: data.article.replace(/_/g, " "),
      grade: data.grade,
      probabilities: data.probabilities,
      score: data.score,
      revid: data.revid,
      model: data.model
    })
  },
  assessments: {
    id: "assessments",
    category: "Articles",
    intensity: "low",
    timeScope: "point",
    name: "WikiProject Assessment",
    icon: "\u{1F9ED}",
    description: "Quality + importance ratings from WikiProject banners",
    labelFromConfig: (c) => c.article?.replace(/_/g, " "),
    defaults: {
      article: "Albert Einstein",
      project: "en.wikipedia",
      topN: 12,
      refreshSeconds: 3600
    },
    renderer: "AssessmentsCard",
    dataSource: "Action API prop=pageassessments",
    configFields: [
      { key: "article", label: "Article", type: "text", placeholder: "Albert Einstein" },
      { key: "project", label: "Project", type: "select", options: PROJECT_OPTIONS },
      { key: "topN", label: "Projects to show", type: "number", placeholder: "12 (max 50)" }
    ],
    fetch: (config) => fetchAssessments(config.article, config.project, Math.min(parseInt(config.topN) || 12, 50)),
    transform: (data) => ({
      title: data.article.replace(/_/g, " "),
      rows: data.rows,
      total: data.total
    })
  },
  gallery: {
    id: "gallery",
    category: "Articles",
    intensity: "medium",
    timeScope: "point",
    name: "Article Gallery",
    icon: "\u{1F5BC}\uFE0F",
    description: "Significant images in an article with captions (grid or list)",
    // Content-based auto-fit: tall enough to show the fetched images.
    // Grid: cols by iconSize, tile ≈ tilePx + caption; List: ~66px/row.
    autoHeight: (view, config) => {
      const n = view?.rows?.length;
      if (!n) return null;
      const mode = config?.displayMode || "grid";
      if (mode === "list") return Math.min(64 + n * 66, 64 + 14 * 66);
      const size = config?.iconSize || "medium";
      const tilePx = { small: 110, medium: 170, large: 250 }[size] || 170;
      const cols = { small: 6, medium: 4, large: 3 }[size] || 4;
      const rows = Math.min(Math.max(1, Math.ceil(n / cols)), 14);
      return 64 + rows * (tilePx + 46);
    },
    defaultLayout: { w: 12, h: 9, minW: 4, minH: 3 },
    labelFromConfig: (c) => c.article?.replace(/_/g, " "),
    defaults: {
      article: "Albert Einstein",
      project: "en.wikipedia",
      displayMode: "grid",
      // 'grid' | 'list'
      iconSize: "medium",
      // grid: 'small' | 'medium' | 'large'
      imageFit: "contain",
      // grid: 'contain' (letterbox) | 'cover' (fill-crop)
      minSize: 200,
      // drop images smaller than this (px)
      maxItems: 0,
      // 0 = all
      refreshSeconds: 3600
    },
    renderer: "GalleryGridCard",
    getRenderer: (config) => config.displayMode === "list" ? "GalleryListCard" : "GalleryGridCard",
    dataSource: "REST /page/media-list + imageinfo",
    configFields: [
      { key: "article", label: "Article", type: "text", placeholder: "Albert Einstein" },
      { key: "project", label: "Project", type: "select", options: PROJECT_OPTIONS },
      { key: "displayMode", label: "Display", type: "select", options: [
        { value: "grid", label: "Grid (captions below)" },
        { value: "list", label: "List (thumb left, caption right)" }
      ] },
      { key: "iconSize", label: "Grid size", type: "select", options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large" }
      ] },
      { key: "imageFit", label: "Grid image fit", type: "select", options: [
        { value: "contain", label: "Letterbox (always show whole image)" },
        { value: "cover", label: "Fill crop (square crop)" }
      ] },
      { key: "minSize", label: "Min image size (px)", type: "number", placeholder: "200" },
      { key: "maxItems", label: "Max images (0 = all)", type: "number", placeholder: "0" }
    ],
    fetch: (config) => fetchArticleGallery(config.article, config.project, config.minSize, config.maxItems),
    transform: (data, config) => ({
      title: data.article.replace(/_/g, " "),
      subtitle: `${data.rows.length} images${data.dropped ? ` \xB7 ${data.dropped} filtered (tiny/uncaptioned)` : ""}`,
      rows: data.rows,
      size: config.iconSize || "medium",
      fit: config.imageFit || "contain"
    })
  },
  fileGallery: {
    id: "fileGallery",
    category: "Files & Media",
    intensity: "medium",
    timeScope: "point",
    name: "Commons File Gallery",
    icon: "\u{1F5C2}\uFE0F",
    description: "Gallery of any Commons files you list \u2014 grid or list, ordered or random",
    // Content-based auto-fit: tall enough to show the fetched images.
    // Grid: cols by iconSize, tile ≈ tilePx + caption; List: ~66px/row.
    autoHeight: (view, config) => {
      const n = view?.rows?.length;
      if (!n) return null;
      const mode = config?.displayMode || "grid";
      if (mode === "list") return Math.min(64 + n * 66, 64 + 14 * 66);
      const size = config?.iconSize || "medium";
      const tilePx = { small: 110, medium: 170, large: 250 }[size] || 170;
      const cols = { small: 6, medium: 4, large: 3 }[size] || 4;
      const rows = Math.min(Math.max(1, Math.ceil(n / cols)), 14);
      return 64 + rows * (tilePx + 46);
    },
    defaultLayout: { w: 12, h: 9, minW: 4, minH: 3 },
    labelFromConfig: (c) => `${(c.files || "").split("\n").filter(Boolean).length} files`,
    defaults: {
      files: "File:The Earth seen from Apollo 17.jpg\nFile:Airplane vortex edit.jpg\nFile:Albert Einstein Head.jpg",
      order: "listed",
      // 'listed' | 'random' | 'alpha' | 'largest'
      displayMode: "grid",
      // 'grid' | 'list'
      iconSize: "medium",
      imageFit: "contain",
      maxItems: 0,
      // 0 = all
      refreshSeconds: 3600
    },
    renderer: "GalleryGridCard",
    getRenderer: (config) => config.displayMode === "list" ? "GalleryListCard" : "GalleryGridCard",
    dataSource: "Commons API imageinfo (batched)",
    configFields: [
      { key: "files", label: "Commons files (one per line)", type: "textarea", rows: 8, placeholder: "File:Example.jpg\nFile:Another photo.png" },
      { key: "order", label: "Order", type: "select", options: [
        { value: "listed", label: "As listed" },
        { value: "random", label: "Random (reshuffles each refresh)" },
        { value: "alpha", label: "Alphabetical" },
        { value: "largest", label: "Largest first (by dimensions)" }
      ] },
      { key: "displayMode", label: "Display", type: "select", options: [
        { value: "grid", label: "Grid (captions below)" },
        { value: "list", label: "List (thumb left, caption right)" }
      ] },
      { key: "iconSize", label: "Grid size", type: "select", options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large" }
      ] },
      { key: "imageFit", label: "Grid image fit", type: "select", options: [
        { value: "contain", label: "Letterbox (always show whole image)" },
        { value: "cover", label: "Fill crop (square crop)" }
      ] },
      { key: "maxItems", label: "Max files (0 = all)", type: "number", placeholder: "0" }
    ],
    fetch: (config) => fetchCommonsGallery(config.files),
    transform: (data, config) => {
      const ORDER_LABELS = { listed: "as listed", random: "random order", alpha: "alphabetical", largest: "largest first" };
      const order = config.order || "listed";
      const rows = [...data.rows];
      if (order === "random") {
        for (let i = rows.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rows[i], rows[j]] = [rows[j], rows[i]];
        }
      } else if (order === "alpha") {
        rows.sort((a, b) => a.title.localeCompare(b.title));
      } else if (order === "largest") {
        rows.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
      }
      const maxItems = Math.max(parseInt(config.maxItems) || 0, 0);
      const subtitleBits = [
        `${rows.length} file${rows.length === 1 ? "" : "s"}`,
        order !== "listed" ? ORDER_LABELS[order] : null,
        data.missing ? `${data.missing} not found` : null
      ].filter(Boolean);
      return {
        title: "Commons files",
        subtitle: subtitleBits.join(" \xB7 "),
        rows: maxItems ? rows.slice(0, maxItems) : rows,
        size: config.iconSize || "medium",
        fit: config.imageFit || "contain"
      };
    }
  },
  articleList: {
    id: "articleList",
    category: "Content & Embeds",
    intensity: "medium",
    timeScope: "point",
    name: "Article List",
    icon: "\u{1F4CB}",
    description: "Clickable list of articles \u2014 pasted titles, optional thumbnails + intros",
    labelFromConfig: (c) => `${(c.articles || "").split("\n").filter(Boolean).length} articles`,
    defaults: {
      articles: "Ada Lovelace\nAlbert Einstein",
      project: "en.wikipedia",
      enrich: true,
      // thumbnails + intros via pageimages|extracts
      maxItems: 0,
      // 0 = all
      refreshSeconds: 3600
    },
    renderer: "ArticleListCard",
    dataSource: "MediaWiki API pageimages|extracts (batched, optional)",
    configFields: [
      { key: "articles", label: "Article titles (one per line)", type: "textarea", rows: 8, placeholder: "Ada Lovelace\nAlbert Einstein" },
      { key: "project", label: "Project", type: "select", options: PROJECT_OPTIONS },
      { key: "enrich", label: "Thumbnails + intros", type: "boolean" },
      { key: "maxItems", label: "Max articles (0 = all)", type: "number", placeholder: "0" }
    ],
    fetch: (config) => fetchArticleList(config.articles, config.project, { enrich: config.enrich, maxItems: config.maxItems }),
    transform: (data, config) => ({
      title: "Articles",
      subtitle: `${data.rows.length} article${data.rows.length === 1 ? "" : "s"}${config.enrich ? " \xB7 with thumbnails + intros" : ""}`,
      rows: data.rows
    })
  },
  cimSnapshot: {
    id: "cimSnapshot",
    category: "Categories & GLAM",
    intensity: "low",
    timeScope: "month",
    name: "CIM Category Snapshot",
    icon: "\u{1F3AF}",
    description: "Exact precomputed stats for a CIM-registered Commons category \u2014 files, used, wikis, pages",
    labelFromConfig: (c) => (c.category || "").replace(/_/g, " "),
    defaults: { category: "Files from the Biodiversity Heritage Library", scope: "deep", month: 0, refreshSeconds: 3600 },
    renderer: "CimSnapshotCard",
    dataSource: "CIM category-metrics-snapshot (precomputed, allow-list)",
    configFields: [
      CIM_CATEGORY_FIELD,
      { key: "scope", label: "Scope", type: "select", options: CIM_SCOPES },
      CIM_MONTH_FIELD
    ],
    fetch: (config) => fetchCimSnapshot(config.category, config.scope, void 0, config.month),
    transform: (data, config) => {
      const scope = data.resolvedMonth || resolveMonth(config.month);
      const deep = config.scope !== "shallow";
      const files = deep ? data.filesDeep ?? data.files ?? 0 : data.files ?? 0;
      const used = deep ? data.usedDeep ?? data.used ?? 0 : data.used ?? 0;
      const wikis = deep ? data.wikisDeep ?? data.wikis ?? 0 : data.wikis ?? 0;
      const pages = deep ? data.pagesDeep ?? data.pages ?? 0 : data.pages ?? 0;
      let gap = null;
      if (deep && data.files > 0 && data.filesDeep >= 1e4 && data.filesDeep / data.files >= 10) {
        gap = { direct: data.files, tree: data.filesDeep, ratio: Math.round(data.filesDeep / data.files) };
      }
      return {
        title: data.category.replace(/_/g, " "),
        href: `https://commons.wikimedia.org/wiki/Category:${data.category}`,
        subtitle: `${fmtMonth(scope.year, scope.month)} \xB7 precomputed (CIM) \xB7 ${config.scope === "shallow" ? "shallow" : "deep"}${data.filesDeep !== data.files ? ` \xB7 direct: ${data.files.toLocaleString()} files` : ""}`,
        stats: [
          { label: "Files", value: files.toLocaleString(), sub: deep ? "deep" : "shallow" },
          { label: "Files used", value: used.toLocaleString(), sub: deep ? "deep" : "shallow" },
          { label: "Wikis", value: wikis.toLocaleString(), sub: deep ? "deep" : "shallow" },
          { label: "Pages", value: pages.toLocaleString(), sub: deep ? "deep" : "shallow" }
        ],
        gap
      };
    }
  },
  cimTrend: {
    id: "cimTrend",
    category: "Categories & GLAM",
    intensity: "low",
    timeScope: "range",
    name: "CIM Views Over Time",
    icon: "\u{1F4C8}",
    description: "Monthly pageview trend of pages using a CIM category's files",
    labelFromConfig: (c) => (c.category || "").replace(/_/g, " "),
    defaults: { category: "Files from the Biodiversity Heritage Library", scope: "deep", wiki: "all-wikis", months: 6, month: 0, refreshSeconds: 3600 },
    renderer: "TrendCard",
    dataSource: "CIM pageviews-per-category-monthly",
    configFields: [
      CIM_CATEGORY_FIELD,
      { key: "scope", label: "Scope", type: "select", options: CIM_SCOPES },
      { key: "wiki", label: "Wiki", type: "select", options: CIM_WIKIS },
      { key: "months", label: "Months (2\u201324)", type: "number", placeholder: "6" },
      CIM_MONTH_FIELD
    ],
    fetch: (config) => fetchCimTrend(config.category, config.scope, config.wiki, void 0, config.month, config.months),
    transform: (data, config) => {
      const end = data.resolvedMonth || resolveMonth(config.month);
      const n = Math.min(Math.max(parseInt(config.months) || 6, 2), 24);
      const start = shiftMonth(end.year, end.month, -(n - 1));
      return {
        title: data.category.replace(/_/g, " "),
        subtitle: `${fmtMonthRange(start.year, start.month, end.year, end.month)} \xB7 pageviews of using pages \xB7 ${config.scope} \xB7 precomputed (CIM)`,
        chartData: data.rows,
        chartKey: "views",
        chartLabel: "views"
      };
    }
  },
  cimTopFiles: {
    id: "cimTopFiles",
    category: "Categories & GLAM",
    intensity: "low",
    timeScope: "month",
    name: "CIM Top Files",
    icon: "\u{1F5BC}\uFE0F",
    description: "Most-viewed files in a CIM category \u2014 thumbnails + views",
    defaultLayout: { w: 12, h: 8, minW: 4, minH: 3 },
    labelFromConfig: (c) => (c.category || "").replace(/_/g, " "),
    defaults: { category: "Files from the Biodiversity Heritage Library", scope: "deep", wiki: "all-wikis", month: 0, topN: 10, refreshSeconds: 3600 },
    renderer: "CimTopFilesCard",
    dataSource: "CIM top-viewed-media-files-monthly + imageinfo",
    configFields: [
      CIM_CATEGORY_FIELD,
      { key: "scope", label: "Scope", type: "select", options: CIM_SCOPES },
      { key: "wiki", label: "Wiki", type: "select", options: CIM_WIKIS },
      CIM_MONTH_FIELD,
      { key: "topN", label: "Top N", type: "number", placeholder: "10" }
    ],
    fetch: (config) => fetchCimTopFiles(config.category, config.scope, config.wiki, void 0, config.month, config.topN),
    transform: (data, config) => {
      const scope = data.resolvedMonth || resolveMonth(config.month);
      return {
        title: data.category.replace(/_/g, " "),
        subtitle: `${fmtMonth(scope.year, scope.month)} \xB7 top files by pageviews \xB7 ${config.scope} \xB7 precomputed (CIM)`,
        rows: data.rows.map((r) => ({ title: r.title.replace(/_/g, " "), views: r.views, thumbUrl: r.thumbUrl }))
      };
    }
  },
  cimTopWikis: {
    id: "cimTopWikis",
    category: "Categories & GLAM",
    intensity: "low",
    timeScope: "month",
    name: "CIM Top Wikis",
    icon: "\u{1F30D}",
    description: "Which wikis use a CIM category's files most",
    labelFromConfig: (c) => (c.category || "").replace(/_/g, " "),
    defaults: { category: "Files from the Biodiversity Heritage Library", scope: "deep", month: 0, topN: 10, refreshSeconds: 3600 },
    renderer: "RankingCard",
    dataSource: "CIM top-wikis-per-category-monthly",
    configFields: [CIM_CATEGORY_FIELD, { key: "scope", label: "Scope", type: "select", options: CIM_SCOPES }, CIM_MONTH_FIELD, { key: "topN", label: "Top N", type: "number", placeholder: "10" }],
    fetch: (config) => fetchCimTopWikis(config.category, config.scope, void 0, config.month, config.topN),
    transform: (data, config) => {
      const sc = data.resolvedMonth || resolveMonth(config.month);
      return cimRanking(
        data.category.replace(/_/g, " "),
        `${fmtMonth(sc.year, sc.month)} \xB7 wikis using the files \xB7 ${config.scope} \xB7 precomputed (CIM)`,
        ["Wiki", "Views"],
        data.rows.map((r) => [r.wiki, r.views.toLocaleString()]),
        ["cim-name", "cim-num"]
      );
    }
  },
  cimTopPages: {
    id: "cimTopPages",
    category: "Categories & GLAM",
    intensity: "low",
    timeScope: "month",
    name: "CIM Top Pages",
    icon: "\u{1F4C4}",
    description: "Pages that use a CIM category's files, by views",
    labelFromConfig: (c) => (c.category || "").replace(/_/g, " "),
    defaults: { category: "Files from the Biodiversity Heritage Library", scope: "deep", wiki: "all-wikis", month: 0, topN: 10, refreshSeconds: 3600 },
    renderer: "RankingCard",
    dataSource: "CIM top-pages-per-category-monthly",
    configFields: [CIM_CATEGORY_FIELD, { key: "scope", label: "Scope", type: "select", options: CIM_SCOPES }, { key: "wiki", label: "Wiki", type: "select", options: CIM_WIKIS }, CIM_MONTH_FIELD, { key: "topN", label: "Top N", type: "number", placeholder: "10" }],
    fetch: (config) => fetchCimTopPages(config.category, config.scope, config.wiki, void 0, config.month, config.topN),
    transform: (data, config) => {
      const sc = data.resolvedMonth || resolveMonth(config.month);
      return cimRanking(
        data.category.replace(/_/g, " "),
        `${fmtMonth(sc.year, sc.month)} \xB7 pages using the files \xB7 ${config.scope} \xB7 precomputed (CIM)`,
        ["Wiki", "Page", "Views"],
        data.rows.map((r) => {
          const href = pageHref(r.wiki, r.page);
          const p = r.page.replace(/_/g, " ");
          return [r.wiki, href ? { text: p, href } : p, r.views.toLocaleString()];
        }),
        ["cim-name", "cim-name", "cim-num"]
      );
    }
  },
  cimTopEditors: {
    id: "cimTopEditors",
    category: "Categories & GLAM",
    intensity: "low",
    timeScope: "month",
    name: "CIM Top Editors",
    icon: "\u270D\uFE0F",
    description: "Top contributors to a CIM category, by edit count",
    labelFromConfig: (c) => (c.category || "").replace(/_/g, " "),
    defaults: { category: "Files from the Biodiversity Heritage Library", scope: "deep", editType: "all-edit-types", month: 0, topN: 10, refreshSeconds: 3600 },
    renderer: "RankingCard",
    dataSource: "CIM top-editors-monthly",
    configFields: [CIM_CATEGORY_FIELD, { key: "scope", label: "Scope", type: "select", options: CIM_SCOPES }, { key: "editType", label: "Edit type", type: "select", options: CIM_EDIT_TYPES }, CIM_MONTH_FIELD, { key: "topN", label: "Top N", type: "number", placeholder: "10" }],
    fetch: (config) => fetchCimTopEditors(config.category, config.scope, config.editType, void 0, config.month, config.topN),
    transform: (data, config) => {
      const sc = data.resolvedMonth || resolveMonth(config.month);
      return cimRanking(
        data.category.replace(/_/g, " "),
        `${fmtMonth(sc.year, sc.month)} \xB7 top editors \xB7 ${config.editType === "all-edit-types" ? "all edits" : config.editType + "s"} \xB7 precomputed (CIM)`,
        ["Editor", "Edits"],
        data.rows.map((r) => [editorLinks(r.user), r.edits.toLocaleString()]),
        ["cim-name", "cim-num"]
      );
    }
  },
  cimLeaderboard: {
    id: "cimLeaderboard",
    category: "Categories & GLAM",
    intensity: "low",
    // moved from Rankings & Platforms (2026-09-01) — keeps the CIM family together in the Add Widget panel
    timeScope: "month",
    name: "CIM Global Leaderboard",
    icon: "\u{1F3C6}",
    description: "Top 100 most-viewed categories on Commons (precomputed)",
    labelFromConfig: () => "Top 100",
    defaults: { scope: "deep", wiki: "all-wikis", month: 0, highlight: "", refreshSeconds: 3600 },
    renderer: "RankingCard",
    dataSource: "CIM top-viewed-categories-monthly",
    configFields: [
      { key: "scope", label: "Scope", type: "select", options: CIM_SCOPES },
      { key: "wiki", label: "Wiki", type: "select", options: CIM_WIKIS },
      CIM_MONTH_FIELD,
      { key: "highlight", label: "Highlight category (optional)", type: "text", placeholder: "Wiki Loves Monuments 2024" }
    ],
    fetch: (config) => fetchCimLeaderboard(config.scope, config.wiki, void 0, config.month),
    transform: (data, config) => {
      const highlight = (config.highlight || "").trim();
      const hl = highlight ? data.rows.find((r) => r.category.replace(/_/g, " ").toLowerCase() === highlight.toLowerCase()) : null;
      const scope = data.resolvedMonth || resolveMonth(config.month);
      const mo = fmtMonth(scope.year, scope.month);
      return cimRanking(
        "Most-viewed categories",
        hl ? `${mo} \xB7 #${hl.rank} of top 100 \xB7 ${hl.category.replace(/_/g, " ")} (${hl.views.toLocaleString()} views)` : highlight ? `${mo} \xB7 ${highlight} not in the top 100 \xB7 precomputed (CIM)` : `${mo} \xB7 top 100 \xB7 precomputed (CIM)`,
        ["Category", "Views"],
        data.rows.map((r) => [
          { text: r.category.replace(/_/g, " "), href: `https://commons.wikimedia.org/wiki/Category:${r.category}` },
          r.views.toLocaleString()
        ]),
        ["cim-name", "cim-num"]
      );
    }
  },
  cimFileSpotlight: {
    id: "cimFileSpotlight",
    category: "Categories & GLAM",
    intensity: "low",
    timeScope: "month",
    name: "CIM File Spotlight",
    icon: "\u{1F526}",
    description: "One Commons file: wikis/pages using it + monthly view trend",
    labelFromConfig: (c) => (c.filename || "").replace(/_/g, " "),
    defaults: { filename: "Dogs, jackals, wolves, and foxes (Plate XI).jpg", wiki: "all-wikis", month: 0, showImage: true, refreshSeconds: 3600 },
    renderer: "CimSnapshotCard",
    dataSource: "CIM media-file-metrics-snapshot + pageviews-per-media-file-monthly",
    configFields: [
      { key: "filename", label: "Commons file", type: "text", placeholder: "Dogs, jackals, wolves, and foxes (Plate XI).jpg" },
      { key: "wiki", label: "Wiki", type: "select", options: CIM_WIKIS },
      { key: "showImage", label: "Show image preview", type: "boolean" },
      CIM_MONTH_FIELD
    ],
    fetch: (config) => fetchCimFileSpotlight(config.filename, config.wiki, void 0, config.month, config.showImage),
    transform: (data, config) => {
      const scope = data.resolvedMonth || resolveMonth(config.month);
      return {
        title: data.file.replace(/_/g, " "),
        href: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(data.file)}`,
        fileHref: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(data.file)}`,
        subtitle: `${fmtMonth(scope.year, scope.month)} \xB7 precomputed (CIM) \xB7 pageviews of pages using this file`,
        image: config.showImage !== false ? data.image : null,
        stats: [
          { label: "Wikis using it", value: data.wikis.toLocaleString(), sub: "leveraging-wiki-count" },
          { label: "Pages using it", value: data.pages.toLocaleString(), sub: "leveraging-page-count" },
          { label: "Views (month)", value: data.views.toLocaleString(), sub: "pageviews of using pages" }
        ],
        trend: data.trend
      };
    }
  },
  cimFileTraffic: {
    id: "cimFileTraffic",
    category: "Categories & GLAM",
    intensity: "low",
    timeScope: "range",
    name: "CIM File Traffic",
    icon: "\u{1F4C9}",
    description: "Monthly pageview traffic for one Commons file \u2014 labeled axes, zoom in/out",
    labelFromConfig: (c) => (c.filename || "").replace(/_/g, " "),
    defaults: { filename: "Dogs, jackals, wolves, and foxes (Plate XI).jpg", wiki: "all-wikis", months: 12, month: 0, refreshSeconds: 3600 },
    renderer: "FileTrafficCard",
    dataSource: "CIM pageviews-per-media-file-monthly",
    configFields: [
      { key: "filename", label: "Commons file", type: "text", placeholder: "Dogs, jackals, wolves, and foxes (Plate XI).jpg" },
      { key: "wiki", label: "Wiki", type: "select", options: CIM_WIKIS },
      { key: "months", label: "Fetch window (3\u201324 months)", type: "number", placeholder: "12" },
      CIM_MONTH_FIELD
    ],
    fetch: (config) => fetchCimFileTraffic(config.filename, config.wiki, config.months, void 0, config.month),
    transform: (data, config) => {
      const end = data.resolvedMonth || resolveMonth(config.month);
      const n = Math.min(Math.max(parseInt(config.months) || 12, 3), 24);
      const start = shiftMonth(end.year, end.month, -(n - 1));
      return {
        title: data.file.replace(/_/g, " "),
        subtitle: `${fmtMonthRange(start.year, start.month, end.year, end.month)} \xB7 pageviews of pages using this file \xB7 precomputed (CIM)`,
        rows: data.rows
      };
    }
  },
  boardControls: {
    id: "boardControls",
    category: "Content & Embeds",
    intensity: "low",
    timeScope: "point",
    name: "Board Controls",
    icon: "\u{1F39B}\uFE0F",
    description: "Buttons / menus that drive board params ({{param}}) \u2014 one click re-aims every widget that references the param (ISSUE-50)",
    defaults: { title: "Board Controls", refreshSeconds: 86400 },
    renderer: "BoardControlsCard",
    dataSource: "static (writes board params \u2014 edited here or in the dashboard JSON params block)",
    configFields: [
      { key: "title", label: "Title", type: "text", placeholder: "Board Controls" },
      { key: "spec", label: "Params (one per line: name | type | Label | options)", type: "textarea", rows: 6, placeholder: "category | buttons | Collection | Images from the Smithsonian Institution, Images from the Rijksmuseum\ncount | number | Photos | 3, 12, 1\nmonth | month | Data month\nyear | select | Year | 2023, 2024\nquery | text | Search", hint: "One param per line \u2014 name | buttons/select/text/number/month | Label | options. number: min, max, step. month: a Latest + \u2039 \u203A stepper (value 0 = latest available). Saving updates the board params; widgets referencing {{name}} re-fetch." }
    ],
    // Static — the spec (params block) + values + setter arrive as WidgetFrame props;
    // transform just carries the title. Renderer switch passes paramSpecs/paramValues/onSetParam.
    transform: (data, config) => ({ title: config.title || "Board Controls" })
  },
  wikiPage: {
    id: "wikiPage",
    category: "Content & Embeds",
    intensity: "low",
    timeScope: "point",
    name: "Wiki Page",
    icon: "\u{1F4C4}",
    description: "Embed any MediaWiki page \u2014 desktop or mobile view, links browse inside",
    labelFromConfig: (c) => (c.page || "").trim().replace(/_/g, " "),
    defaults: {
      page: "Help:Introduction",
      project: "en.wikipedia",
      mobile: false,
      // true = the m. site (mobile skin)
      fragment: "",
      // optional #anchor
      refreshSeconds: 3600
    },
    renderer: "WikiPageCard",
    dataSource: "static (iframe to the wiki)",
    configFields: [
      { key: "page", label: "Page", type: "text", placeholder: "Help:Introduction" },
      { key: "project", label: "Project", type: "select", options: WIKI_PAGE_PROJECTS },
      { key: "mobile", label: "Mobile view (?useformat=mobile)", type: "boolean" },
      { key: "fragment", label: "Section anchor (optional)", type: "text", placeholder: "History" }
    ],
    // Static widget — no fetch: the iframe IS the widget (Wikimedia pages
    // send no X-Frame-Options / frame-ancestors, verified 2026-08-13).
    transform: (data, config) => {
      const project = config.project || "en.wikipedia";
      const mobile = !!config.mobile;
      const page = String(config.page || "").trim();
      if (!page) return { url: null, page: "", project };
      const title = page.replace(/ /g, "_");
      const frag = String(config.fragment || "").replace(/^#/, "").trim();
      const host = project === "commons.wikimedia" ? "https://commons.wikimedia.org" : `https://${project}.org`;
      return {
        url: `${host}/wiki/${title}${mobile ? "?useformat=mobile" : ""}${frag ? `#${frag.replace(/ /g, "_")}` : ""}`,
        page: title.replace(/_/g, " "),
        project
      };
    }
  },
  sparql: {
    id: "sparql",
    category: "Queries & Power",
    intensity: "high",
    loadingHint: "Querying SPARQL \u2014 may take up to 60 s",
    timeScope: "point",
    name: "SPARQL Query",
    icon: "\u{1F9E0}",
    description: "Run any SPARQL query \u2014 Wikidata (WDQS) or Commons (QLever); big number, bars, table, or trend",
    labelFromConfig: (c) => getPreset(c.preset)?.label || (c.query || "").split("\n")[0]?.slice(0, 40) || "SPARQL",
    defaults: {
      preset: "met-collection",
      query: "",
      endpoint: "wdqs",
      // 'wdqs' | 'qlever-commons' | 'humaniki'
      renderer: "auto",
      // 'auto' | 'stat' | 'bar' | 'line' | 'table'
      maxRows: 100,
      refreshSeconds: 1800
    },
    renderer: "SparqlCard",
    dataSource: "WDQS / QLever SPARQL + Humaniki API",
    configFields: [
      {
        key: "preset",
        label: "Preset (fills the query)",
        type: "preset",
        options: SPARQL_PRESETS.map((p) => ({ value: p.id, label: p.label })),
        presets: SPARQL_PRESETS
      },
      { key: "query", label: "SPARQL query", type: "textarea", rows: 10, placeholder: "SELECT ..." },
      { key: "endpoint", label: "Endpoint", type: "select", options: [
        { value: "wdqs", label: "Wikidata (WDQS)" },
        { value: "qlever-commons", label: "Commons SDC (QLever)" },
        { value: "humaniki", label: "Humaniki (gender gap, precomputed)" }
      ] },
      { key: "renderer", label: "Renderer (auto-detects)", type: "select", options: [
        { value: "auto", label: "Auto (from result shape)" },
        { value: "stat", label: "Big number" },
        { value: "bar", label: "Bar chart" },
        { value: "line", label: "Line chart" },
        { value: "table", label: "Table" }
      ] },
      { key: "maxRows", label: "Max rows", type: "number", placeholder: "100" }
    ],
    fetch: (config) => {
      const preset = getPreset(config.preset);
      const query = config.query || preset?.query || "";
      const endpoint = config.endpoint || preset?.endpoint || "wdqs";
      return fetchSparql(query, endpoint, config.maxRows);
    },
    transform: (data, config) => {
      const preset = getPreset(config.preset);
      const title = preset?.label || "SPARQL result";
      const vars = data.vars || [];
      const rows = data.rows || [];
      const fmt = (v) => typeof v === "number" ? v.toLocaleString() : String(v ?? "\u2014");
      const numeric = (v) => rows.length > 0 && typeof rows[0][v] === "number";
      const numericVars = vars.filter(numeric);
      const dateish = (v) => /year|date|time|month|decade|century/i.test(v) && !numeric(v);
      const labelVar = vars.find((v) => /label$/i.test(v) && !numeric(v)) || vars.find((v) => !numeric(v) && !dateish(v));
      let mode = config.renderer || "auto";
      if (mode === "auto") {
        if (!rows.length || !numericVars.length) mode = "table";
        else if (rows.length === 1) mode = "stat";
        else if (vars.some(dateish)) mode = "line";
        else if (numericVars.length === 1) mode = "bar";
        else mode = "table";
      }
      if (mode === "bar" && !labelVar) mode = "table";
      if (mode === "stat") {
        const valueVar = numericVars[numericVars.length - 1] || vars[vars.length - 1];
        const value = rows[0][valueVar];
        const detail = vars.filter((v) => v !== valueVar).map((v) => `${v}: ${fmt(rows[0][v])}`).join(" \xB7 ");
        return {
          mode,
          title,
          subtitle: `${rows.length} row \xB7 ${valueVar}`,
          value: valueVar === "pct" ? `${value}%` : fmt(value),
          detail
        };
      }
      if (mode === "line") {
        const xVar = vars.find(dateish) || vars.find((v) => !numeric(v));
        const yVar = numericVars[0];
        return {
          mode,
          title,
          subtitle: `${rows.length} points \xB7 ${yVar} by ${xVar}`,
          chartData: rows.map((r) => ({ date: String(r[xVar]), value: r[yVar] })),
          chartKey: "value",
          chartLabel: yVar
        };
      }
      if (mode === "bar") {
        const rows2 = rows.map((r) => ({ label: fmt(r[labelVar]), value: r[numericVars[0]] })).slice(0, 25);
        return { mode, title, subtitle: `${rows2.length} rows \xB7 ${numericVars[0]}`, rows: rows2 };
      }
      return {
        mode: "table",
        title,
        subtitle: `${rows.length} rows \xB7 ${vars.join(", ")}`,
        columns: vars,
        rows: rows.map((r) => vars.map((v) => fmt(r[v])))
      };
    }
  },
  panorama360: {
    id: "panorama360",
    category: "Files & Media",
    intensity: "low",
    timeScope: "point",
    name: "360\xB0 Panorama Viewer",
    icon: "\u{1F310}",
    description: "Interactive 360\xB0 panorama from a Commons equirectangular file",
    labelFromConfig: (c) => c.filename?.replace(/^File:\s*/i, "").replace(/_/g, " "),
    defaults: {
      filename: "File:'Imiloa grounds 360 Degree View (20220329 Hilo Planetarium HQ-CC2).jpg",
      project: "commons.wikimedia",
      autoRotate: false,
      refreshSeconds: 3600
    },
    renderer: "PanoramaCard",
    dataSource: "Commons imageinfo + Pannellum",
    // Per-widget layout constraints (react-grid-layout minW/minH/maxW/maxH).
    defaultLayout: { w: 4, h: 3, minW: 3, minH: 2 },
    configFields: [
      { key: "filename", label: "Commons file (360\xB0 / equirectangular)", type: "text", placeholder: "File:Example 360.jpg" },
      { key: "project", label: "Project", type: "select", options: [
        { value: "commons.wikimedia", label: "Wikimedia Commons" }
      ] },
      { key: "autoRotate", label: "Auto-rotate", type: "boolean" }
    ],
    fetch: (config) => fetchPanoramaFile(config.filename, config.project),
    transform: (data, config) => ({
      fileTitle: data.fileTitle,
      url: data.url,
      originalUrl: data.originalUrl,
      width: data.width,
      height: data.height,
      equirectangular: data.equirectangular,
      mime: data.mime,
      autoRotate: config.autoRotate
    })
  },
  mediaPlayer: {
    id: "mediaPlayer",
    category: "Files & Media",
    intensity: "low",
    timeScope: "point",
    name: "Video / Media Player",
    icon: "\u{1F3AC}",
    description: "Play Commons video or audio \u2014 one file or a whole playlist (jukebox: next/prev, loop, shuffle)",
    labelFromConfig: (c) => {
      const list = (c.files || "").split("\n").map((s) => s.trim()).filter(Boolean);
      return list.length > 1 ? `${list.length} files` : (list[0] || "").replace(/^File:\s*/i, "");
    },
    defaults: {
      files: "File:FA-18 Automated Aerial Refueling.ogv\nFile:EN-Abbe.ogg",
      mediaType: "auto",
      // 'auto' | 'video' | 'audio'
      quality: "auto",
      // 'auto' | '240' | '480' | '720' | '1080'
      loopPlaylist: false,
      shuffle: false,
      autoplay: false,
      showDescription: true,
      annotation: "",
      refreshSeconds: 3600
    },
    renderer: "MediaPlayerCard",
    dataSource: "Commons API videoinfo (batched)",
    defaultLayout: { w: 4, h: 4, minW: 3, minH: 3 },
    configFields: [
      { key: "files", label: "Commons files (one per line)", type: "textarea", rows: 6, placeholder: "File:Example.webm\nFile:Spoken article.ogg" },
      { key: "mediaType", label: "Media type", type: "select", options: [
        { value: "auto", label: "Auto-detect (per file)" },
        { value: "video", label: "Video only" },
        { value: "audio", label: "Audio only" }
      ] },
      { key: "quality", label: "Video quality", type: "select", options: [
        { value: "auto", label: "Auto (best \u22641080p)" },
        { value: "240", label: "240p" },
        { value: "480", label: "480p" },
        { value: "720", label: "720p" },
        { value: "1080", label: "1080p" }
      ] },
      { key: "loopPlaylist", label: "Loop playlist", type: "boolean" },
      { key: "shuffle", label: "Shuffle order", type: "boolean" },
      { key: "autoplay", label: "Autoplay (browsers need one click first)", type: "boolean" },
      { key: "showDescription", label: "Show Commons description (now playing)", type: "boolean" },
      { key: "annotation", label: "Your annotation (Markdown)", type: "textarea", rows: 3, placeholder: "Free-form caption for this board \u2014 **bold**, [links](https://\u2026), credit lines\u2026" }
    ],
    fetch: (config) => fetchMediaPlaylist(config.files),
    transform: (data, config) => ({
      title: "Media player",
      subtitle: `${data.rows.length} file${data.rows.length === 1 ? "" : "s"} \xB7 ${data.missing ? `${data.missing} not found \xB7 ` : ""}${data.rows.filter((r) => r.mediaType === "video").length} video, ${data.rows.filter((r) => r.mediaType === "audio").length} audio`,
      showDescription: config.showDescription !== false,
      annotation: (config.annotation || "").trim(),
      rows: data.rows,
      mediaType: config.mediaType || "auto",
      quality: config.quality || "auto",
      loopPlaylist: !!config.loopPlaylist,
      shuffle: !!config.shuffle,
      autoplay: !!config.autoplay
    })
  },
  waybackGallery: {
    id: "waybackGallery",
    category: "Web & History",
    intensity: "high",
    loadingHint: "Looking up Wayback captures \u2014 may take a few seconds",
    timeScope: "range",
    name: "Wayback Snapshot Gallery",
    icon: "\u{1F570}\uFE0F",
    experimental: true,
    description: "Screenshot tiles of a website across history \u2014 one Wayback capture per requested date. Experimental: depends on the Wayback Machine backend health; failed lookups retry on refresh",
    defaultLayout: { w: 12, h: 8, minW: 4, minH: 3 },
    labelFromConfig: (c) => (c.url || "").replace(/^https?:\/\//i, "").replace(/\/+$/, ""),
    defaults: {
      url: "wikipedia.org",
      dates: "2005-01-01\n2010-01-01\n2015-01-01\n2020-01-01\n2025-01-01",
      toleranceDays: 30,
      refreshSeconds: 3600
    },
    renderer: "WaybackGalleryCard",
    dataSource: "Wayback Machine availability API + replay iframes",
    configFields: [
      { key: "url", label: "Website", type: "text", placeholder: "example.org" },
      { key: "dates", label: "Dates (one per line)", type: "textarea", rows: 6, placeholder: "2010-06-15" },
      { key: "toleranceDays", label: "Tolerance (days)", type: "number", placeholder: "30" }
    ],
    fetch: (config, opts) => fetchWaybackGallery(config.url, config.dates, config.toleranceDays, opts),
    transform: (data, config) => {
      const dates = String(config.dates || "").split("\n").map((s) => s.trim()).filter(Boolean);
      return {
        title: "Wayback Machine history",
        subtitle: `${data.url} \xB7 ${dates[0] || "\u2014"} \u2192 ${dates[dates.length - 1] || "\u2014"} \xB7 ${data.rows.length} captures`,
        rows: data.rows,
        toleranceDays: parseInt(config.toleranceDays) || 30
      };
    }
  }
};

// tests/cim-gap.test.mjs
var transform = WIDGET_TYPES.cimSnapshot.transform;
test("extreme diffusion (UNESCO-like) \u2192 gap chip with direct/tree/ratio", () => {
  const out = transform(
    { category: "UNESCO", resolvedMonth: { year: 2026, month: 3 }, files: 575, filesDeep: 16414373, used: 125, usedDeep: 1215949, wikis: 84, wikisDeep: 814, pages: 361, pagesDeep: 4603614 },
    { scope: "deep", month: 3 }
  );
  assert.equal(out.gap.direct, 575);
  assert.equal(out.gap.tree, 16414373);
  assert.equal(out.gap.ratio, 28547);
});
test("deep scope shows DEEP numbers in stats (latent mislabel fixed)", () => {
  const out = transform(
    { category: "UNESCO", files: 575, filesDeep: 16414373, used: 125, usedDeep: 1215949, wikis: 84, wikisDeep: 814, pages: 361, pagesDeep: 4603614 },
    { scope: "deep" }
  );
  assert.equal(out.stats[0].value, "16,414,373");
  assert.equal(out.stats[0].sub, "deep");
  assert.equal(out.subtitle.includes("direct: 575 files"), true);
});
test("shallow scope shows shallow numbers, no gap chip", () => {
  const out = transform(
    { category: "UNESCO", files: 575, filesDeep: 16414373, used: 125, usedDeep: 1215949, wikis: 84, wikisDeep: 814, pages: 361, pagesDeep: 4603614 },
    { scope: "shallow" }
  );
  assert.equal(out.stats[0].value, "575");
  assert.equal(out.stats[0].sub, "shallow");
  assert.equal(out.gap, null);
});
test("flat tree (BHL-style, shallow == deep) \u2192 no gap chip, stats unchanged", () => {
  const out = transform(
    { category: "BHL", files: 305868, filesDeep: 305868, used: 14434, usedDeep: 14434, wikis: 252, wikisDeep: 252, pages: 41819, pagesDeep: 41819 },
    { scope: "deep" }
  );
  assert.equal(out.gap, null);
  assert.equal(out.stats[0].value, "305,868");
});
test("below threshold (ratio < 10\xD7 or < 10k deep files) \u2192 no gap chip", () => {
  const tight = transform({ category: "X", files: 5e5, filesDeep: 516e3 }, { scope: "deep" });
  assert.equal(tight.gap, null);
  const small = transform({ category: "Y", files: 5, filesDeep: 5e3 }, { scope: "deep" });
  assert.equal(small.gap, null);
});
