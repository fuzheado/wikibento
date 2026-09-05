/**
 * Data-fetching functions for Wikimedia widgets.
 * Each returns { data, error } — the caller handles rendering.
 */

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const PAGEVIEWS_API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews';
const WIKISTATS_API = 'https://wikistats.wmcloud.org/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

import { createTtlCache } from '../lib/fetchCache';
import { SPARQL_ENDPOINTS } from '../lib/sparqlPresets';
import {
  wikidataEntityId,
  labelLanguage,
  buildLabelRequestUrl,
  parseLabelResponse,
  enrichEntityLabels,
} from '../lib/sparqlLabels';


/** Wikistats CSV is 195 KB and fetched by two widgets — cache it. */
const wikistatsCache = createTtlCache(5 * 60 * 1000);

/**
 * fetch() with a timeout and retry-with-backoff for transient failures
 * (network errors, 5xx). 4xx errors fail fast (retrying won't help).
 * Returns the response text.
 */
async function fetchTextWithRetry(url, { timeoutMs = 15000, retries = 2, method = 'GET', body = null, contentType = null, withBody = false } = {}) {
  const shortUrl = url.replace(/^https?:\/\//, '').slice(0, 80); // for error messages
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
        headers: body ? { 'Content-Type': contentType || 'application/json' } : undefined,
        body,
        signal: controller.signal,
      });
      if (resp.status >= 500 && attempt < retries) {
        lastErr = new Error(`HTTP ${resp.status} (${shortUrl})`);
      } else if (!resp.ok) {
   let errBody = null;
   if (withBody) { try { errBody = (await resp.text()).slice(0, 300); } catch { /* body optional */ } }
   const err = new Error(`HTTP ${resp.status} (${shortUrl})`);
   if (errBody) err.body = errBody;
   throw err;
  } else {
   return await resp.text();
  }
 } catch (e) {
      // 4xx are terminal (bad title, not-loaded, auth) — never retry them; only
      // 5xx / timeouts / network errors are transient. (Was: HTTP errors landed
      // here and got retried with backoff, adding 1.5 s to every 404 path.)
      if (e instanceof Error && /^HTTP 4\d\d /.test(e.message)) throw e;
      if (e.name === 'AbortError') {
        lastErr = new Error(`timed out after ${timeoutMs / 1000}s (${shortUrl})`);
      } else if (!(e instanceof Error && e.message.startsWith('HTTP '))) {
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

// ── GLAM Category Usage (GLAMorgan-style) ────────────────
// Bounded, browser-native replication of GLAMorgan: a client-side category
// walk (PetScan itself is unusable from browsers — it ignores `max` and
// returns multi-10MB responses for large trees), batched globalusage, and
// pageviews capped at a budget (GLAMorgan needs a server proxy for this).
// See docs/GLAMORGAN-WIDGET.md for the full review.

const GLAM_FILE_BUDGET = 500;       // default file budget
const GLAM_FILE_BUDGET_MAX = 30000; // ceiling (GLAMorgan's own 30K cap; the 25 MB relay byte-cap is the real valve)
const GLAM_FALLBACK_CAP = 1000;     // self-walk fallback never walks more than this
const GLAM_VIEW_BUDGET = 150;   // max pages with pageview fetches
const GIU_LIMIT = 100;          // usage entries per file (gulimit)
const MAX_DEPTH = 12;

function cleanCategoryNameForWalk(cat) {
  return cat.replace(/^Category:\s*/i, '').replace(/"/g, '');
}

/** Walk a Commons category tree (depth-aware) collecting File titles. */
async function collectCategoryFiles(category, depth, budget, exclCats) {
  const files = [];
  const seen = new Set();
  let queue = [category];
  for (let level = 0; level <= depth && queue.length && files.length < budget; level++) {
    const next = [];
    for (const cat of queue) {
      if (files.length >= budget) break;
      if (seen.has(cat) || (exclCats && exclCats.has(cat))) continue;
      seen.add(cat);
      let cmcontinue = null;
      do {
        const params = new URLSearchParams({
          action: 'query',
          list: 'categorymembers',
          cmtitle: `Category:${cat}`,
          cmtype: 'file|subcat',
          cmlimit: '500',
          format: 'json',
          origin: '*',
        });
        if (cmcontinue) params.set('cmcontinue', cmcontinue);
        const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
        for (const m of d?.query?.categorymembers || []) {
          if (m.ns === 6) {
            if (files.length < budget) files.push(m.title);
          } else if (m.ns === 14 && level < depth) {
            next.push(m.title.replace(/^Category:/, ''));
          }
        }
        cmcontinue = d?.continue?.cmcontinue;
      } while (cmcontinue && files.length < budget);
    }
    queue = next;
  }
  return files;
}

/** Resolve negcats + negdepth into a set of excluded category names. */
async function collectExcludedCategories(negcats, negdepth) {
  const excl = new Set();
  if (!negcats) return excl;
  let queue = negcats.split('|').map(cleanCategoryNameForWalk);
  for (let level = 0; level <= Math.min(negdepth || 0, MAX_DEPTH) && queue.length; level++) {
    const next = [];
    for (const cat of queue) {
      if (excl.has(cat)) continue;
      excl.add(cat);
      if (level >= Math.min(negdepth || 0, MAX_DEPTH)) continue;
      const params = new URLSearchParams({
        action: 'query',
        list: 'categorymembers',
        cmtitle: `Category:${cat}`,
        cmtype: 'subcat',
        cmlimit: '500',
        format: 'json',
        origin: '*',
      });
      const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
      for (const m of d?.query?.categorymembers || []) {
        next.push(m.title.replace(/^Category:/, ''));
      }
    }
    queue = next;
  }
  return excl;
}

/** Non-article namespace prefixes (URL path form, e.g. "Talk:Alysa Liu").
 *  The Commons API's globalusage entries carry NO ns field (verified 2026-08-12:
 *  keys are only title/url/wiki) — GLAMorgan gets ns from PetScan's giu instead.
 *  Localized namespace names (Diskussion:, ノート:, …) aren't in this list, so
 *  those pages are conservatively counted as article usage (documented caveat). */
const NON_ARTICLE_NS = /^(talk|user|user[_ ]?talk|wikipedia|wikipedia[_ ]?talk|file|file[_ ]?talk|mediawiki|mediawiki[_ ]?talk|template|template[_ ]?talk|help|help[_ ]?talk|category|category[_ ]?talk|portal|portal[_ ]?talk|draft|draft[_ ]?talk|module|timedtext|gadget|gadget[_ ]?talk|special|media):/i;

function isArticleUrl(url) {
  try {
    const m = new URL(url).pathname.match(/\/wiki\/([^/]+)$/);
    if (!m) return false;
    return !NON_ARTICLE_NS.test(decodeURIComponent(m[1]));
  } catch {
    return false;
  }
}

/** Batched multi-title globalusage: returns title -> article-usage list.
 *  Chunks adaptively: Wikimedia GET URLs cap out around ~8KB, and long
 *  filenames (e.g. WLM) fill a 50-title batch quickly (HTTP 414). */
async function fetchBatchedUsage(files) {
  const usage = {};
  const MAX_ENCODED = 4500;
  let chunk = [];
  let chunkLen = 0;
  const flush = async () => {
    if (!chunk.length) return;
    const params = new URLSearchParams({
      action: 'query',
      prop: 'globalusage',
      titles: chunk.join('|'),
      gulimit: String(GIU_LIMIT),
      format: 'json',
      origin: '*',
    });
    const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
    for (const p of Object.values(d?.query?.pages || {})) {
      usage[p.title] = (p.globalusage || [])
        .filter(u => isArticleUrl(u.url)) // article space only (ns-0 heuristic)
        .map(u => ({ wiki: u.wiki, page: u.title }));
    }
    chunk = [];
    chunkLen = 0;
  };
  for (const f of files) {
    const len = encodeURIComponent(f).length + 1;
    // Anonymous API clients cap `titles` at 50 per query (toomanyvalues;
    // logged-in bots get 500) — chunk by min(count 50, encoded length), or
    // short filenames pack 70+ titles into a 4,500-char chunk and every
    // query silently fails (no error surface — empty query.pages).
    if (chunk.length >= 50 || (chunk.length && chunkLen + len > MAX_ENCODED)) await flush();
    chunk.push(f);
    chunkLen += len;
  }
  await flush();
  return usage;
}

function wikiToProject(wiki) {
  if (wiki === 'commons.wikimedia.org') return 'commons.wikimedia';
  if (wiki === 'species.wikimedia.org') return 'species.wikimedia';
  const m = String(wiki).match(/^([a-z]{2,3})\.wikipedia\.org$/);
  return m ? `${m[1]}.wikipedia` : null; // e.g. metawiki — skip pageviews
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** Monthly view total for one page; 0 on 404 (no data in range). */
async function fetchMonthlyViews(wiki, page, year, month) {
  const project = wikiToProject(wiki);
  if (!project) return 0;
  const start = `${year}${String(month).padStart(2, '0')}01`;
  const end = `${year}${String(month).padStart(2, '0')}${daysInMonth(year, month)}`;
  const url = `${PAGEVIEWS_API}/per-article/${project}/all-access/user/${encodeURIComponent(page.replace(/ /g, '_'))}/monthly/${start}00/${end}00`;
  try {
    const d = await fetchJSON(url);
    return (d.items || []).reduce((s, i) => s + (i.views || 0), 0);
  } catch {
    return 0; // 404 = no views that month
  }
}

/** Run fn over items with bounded concurrency. */
async function pool(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}

/** Attach 120px thumbnail URLs to top files via one batched imageinfo call. */
async function attachThumbs(files) {
  if (!files.length) return;
  const params = new URLSearchParams({
    action: 'query',
    prop: 'imageinfo',
    titles: files.map(f => f.title).join('|'),
    iiprop: 'url',
    iiurlwidth: '120',
    format: 'json',
    origin: '*',
  });
  try {
    const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
    const byTitle = {};
    for (const p of Object.values(d?.query?.pages || {})) byTitle[p.title] = p.imageinfo?.[0]?.thumburl?.split('?')[0];
    files.forEach(f => { f.thumbUrl = byTitle[f.title]; });
  } catch {
    // thumbs are cosmetic — never fail the widget
  }
}

/**
 * 6. GLAM Category Usage — GLAMorgan-style impact stats for a Commons
 *  category tree and month: files, used/viewed files, pages, total views,
 *  top-N filmstrip, and per-page detail for the top file.
 *  ISSUE-46 (2026-08-17): tree+usage now come from PetScan via the
 *  same-origin /api/petscan relay (exact-ns giu); the bounded self-walk +
 *  batched globalusage remains the fallback when the relay is unavailable.
 */

const PETSCAN_RELAY = '/api/petscan';

/** ISSUE-46 primary source: PetScan via the same-origin capped relay.
 *  Returns null on any failure → caller falls back to the self-walk.
 *  The server relay itself runs up to 60 s on big trees (its own timeout),
 *  so the client must NOT use the 15 s fetchJSON default — we wait up to
 *  75 s in a single attempt and let the relay's 502 (fast-fail) or the
 *  bounded self-walk fallback decide the outcome. */
async function fetchPetscanRelay({ category, depth, negcats, negdepth, budget }) {
  try {
    const params = new URLSearchParams({
      cats: category, depth: String(depth),
      negcats: negcats || '', negdepth: String(negdepth),
      budget: String(budget),
    });
    const text = await fetchTextWithRetry(`${PETSCAN_RELAY}?${params}`, { timeoutMs: 75000, retries: 0 });
    const d = JSON.parse(text);
    if (!d || d.source !== 'petscan' || !Array.isArray(d.files)) return null;
    return d;
  } catch { return null; }
}

/** Fallback acquisition: bounded categorymembers walk + batched globalusage
 *  (50-title chunks — the ISSUE-45 fix). */
async function fetchSelfWalkUsage(category, depth, budget, negcats, negdepth) {
  const exclCats = await collectExcludedCategories(negcats, negdepth);
  const files = await collectCategoryFiles(category, depth, budget, exclCats);
  const usage = await fetchBatchedUsage(files);
  return { files, usage };
}

/** Shared aggregation (injectable views/thumbs for tests): ns-0 pages map →
 *  bounded monthly views (top GLAM_VIEW_BUDGET by usage weight) → per-file
 *  aggregates → top-N filmstrip → top-file detail. */
export async function aggregateGlamStats(files, usage, { year, month, topN, showDetail = true, views = fetchMonthlyViews, thumbs = attachThumbs } = {}) {
  // Distinct ns-0 pages, with a usage-weight for prioritization. Self-walk
  // usage entries carry no ns (already article-filtered); PetScan entries
  // carry exact ns — keep only 0.
  const pages = {};
  files.forEach(f => {
    for (const u of usage[f] || []) {
      if (u.ns !== undefined && u.ns !== 0) continue;
      const k = `${u.wiki}:${u.page}`;
      if (!pages[k]) pages[k] = { wiki: u.wiki, page: u.page, weight: 0, views: 0 };
      pages[k].weight++;
    }
  });
  const pageKeys = Object.keys(pages);
  const partialViews = pageKeys.length > GLAM_VIEW_BUDGET;
  const keysToFetch = partialViews
    ? [...pageKeys].sort((a, b) => pages[b].weight - pages[a].weight).slice(0, GLAM_VIEW_BUDGET)
    : pageKeys;
  await pool(keysToFetch, 6, async (k) => {
    pages[k].views = await views(pages[k].wiki, pages[k].page, year, month);
  });

  // Per-file aggregates.
  const fileStats = files.map(f => ({
    title: f,
    used: (usage[f] || []).some((u) => u.ns === undefined || u.ns === 0),
    views: (usage[f] || []).reduce((s, u) => (u.ns !== undefined && u.ns !== 0 ? s : s + (pages[`${u.wiki}:${u.page}`]?.views || 0)), 0),
  }));
  const usedFiles = fileStats.filter(f => f.used).length;
  const viewedFiles = fileStats.filter(f => f.views > 0).length;
  const totalViews = pageKeys.reduce((s, k) => s + pages[k].views, 0);
  const wikis = new Set(pageKeys.map(k => pages[k].wiki)).size;

  // Top-N filmstrip (ranked by views), with thumbnail URLs.
  const top = fileStats
    .filter(f => f.used)
    .sort((a, b) => b.views - a.views || Number(b.used) - Number(a.used))
    .slice(0, topN);
  await thumbs(top);

  // Top-file detail: its ns-0 pages with monthly views, top 10.
  let detail = null;
  if (showDetail && top.length) {
    const rows = (usage[top[0].title] || []).filter((u) => u.ns === undefined || u.ns === 0);
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
      title: `Top file: ${top[0].title.replace(/^File:/, '').replace(/_/g, ' ')}`,
      rows: rows.slice(0, 10).map(u => ({
        wiki: u.wiki,
        page: u.page.replace(/_/g, ' '),
        views: pages[`${u.wiki}:${u.page}`]?.views || 0,
      })),
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
    monthLabel: `${year}-${String(month).padStart(2, '0')}`,
    top: top.map(f => ({ title: f.title.replace(/^File:/, '').replace(/_/g, ' '), views: f.views, thumbUrl: f.thumbUrl })),
    detail,
  };
}

/** GLAM impact stats: PetScan via /api/petscan relay (primary, ISSUE-46),
 *  bounded self-walk fallback. The user's fileBudget may go up to
 *  GLAM_FILE_BUDGET_MAX (10,000 — the relay truncates server-side); the
 *  browser self-walk fallback is separately capped at GLAM_FALLBACK_CAP
 *  (1,000) so a relay outage can never trigger a multi-hundred-call walk
 *  from the browser. deps injectable for tests. */
export async function fetchGlamStats(cfg = {}, deps = {}) {
  const category = cleanCategoryNameForWalk(cfg.category || '');
  const depth = Math.min(Math.max(parseInt(cfg.depth) || 0, 0), MAX_DEPTH);
  const year = Math.min(Math.max(parseInt(cfg.year) || new Date().getFullYear(), 2015), new Date().getFullYear() + 1);
  const month = Math.min(Math.max(parseInt(cfg.month) || 1, 1), 12);
  const budget = Math.min(Math.max(parseInt(cfg.fileBudget) || GLAM_FILE_BUDGET, 50), GLAM_FILE_BUDGET_MAX);
  const topN = Math.min(Math.max(parseInt(cfg.topN) || 5, 1), 10);

  if (!category) throw new Error('Glam stats need a category');

  const { relay = fetchPetscanRelay, walk = fetchSelfWalkUsage } = deps;
  const acquired = await relay({ category, depth, negcats: cfg.negcats, negdepth: parseInt(cfg.negdepth) || 0, budget });
  let files, usage, cappedFiles, source;
  if (acquired && !acquired.truncated && acquired.files?.length) {
    ({ files, usage } = acquired);
    cappedFiles = !!acquired.capped;
    source = 'petscan';
  } else {
    const walkBudget = Math.min(budget, GLAM_FALLBACK_CAP);
    ({ files, usage } = await walk(category, depth, walkBudget, cfg.negcats, parseInt(cfg.negdepth) || 0));
    cappedFiles = files.length >= walkBudget;
    source = 'selfwalk';
  }
  if (!files.length) {
    return {
      category, source, files: 0, cappedFiles, usedFiles: 0, viewedFiles: 0, pages: 0, wikis: 0,
      totalViews: 0, partialViews: false, monthLabel: `${year}-${String(month).padStart(2, '0')}`,
      top: [], detail: null,
    };
  }

  return {
    category,
    source,
    cappedFiles,
    ...(await aggregateGlamStats(files, usage, { year, month, topN, showDetail: cfg.showDetail !== false, ...deps })),
  };
}


async function fetchJSON(url) {
 const text = await fetchTextWithRetry(url);
 return JSON.parse(text);
}

/** POST JSON (Lift Wing inference) with timeout+retry; returns parsed JSON. */
async function postJSON(url, payload, timeoutMs = 30000) {
 const text = await fetchTextWithRetry(url, { method: 'POST', body: JSON.stringify(payload), timeoutMs });
 return JSON.parse(text);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/** Strip HTML tags + decode basic entities (for extmetadata descriptions). */
function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Widget Data Sources ──────────────────────────────────

/** 1. Article Pageviews — single article, last 30 days */
export async function fetchPageviews(article, project = 'en.wikipedia') {
  const end = daysAgo(0);
  const start = daysAgo(30);
  const url = `${PAGEVIEWS_API}/per-article/${project}/all-access/user/${encodeURIComponent(article)}/daily/${start}00/${end}00`;
  try {
    const data = await fetchJSON(url);
    const items = data.items || [];
    const total = items.reduce((sum, i) => sum + (i.views || 0), 0);
    const avg = items.length ? Math.round(total / items.length) : 0;
    const trend = items.map(i => ({ date: i.timestamp.slice(0, 8), views: i.views }));
    return {
      total,
      avg,
      latest: items.length ? items[items.length - 1].views : 0,
      trend,
      article,
    };
  } catch (e) {
    throw new Error(`Pageviews fetch failed: ${e.message}`);
  }
}

/** 2. External Link Count — uses MediaWiki API exturlusage.
 *  The API clamps eulimit to 500 results per request for non-bot users
 *  (verified: eulimit=5000 returns 500 with a "must be between 1 and 500"
 *  warning), so we paginate via eucontinue up to 10 pages = 5,000 results —
 *  the same displayed cap as Special:LinkSearch (which paginates internally).
 *  Optional eunamespace restricts the search to given namespaces
 *  (e.g. "0" = article space only, "0|1" = articles + talk). */
async function countExtUrlUsage(domain, wiki, namespace) {
  let total = 0;
  let eucontinue = null;
  const maxPages = 10; // 10 × 500 = 5000 max results

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      action: 'query',
      list: 'exturlusage',
      euquery: domain,
      eulimit: '500',
      euprotocol: 'https',
      format: 'json',
      origin: '*',
    });
    if (namespace) params.set('eunamespace', namespace);
    if (eucontinue) params.set('eucontinue', eucontinue);

    const data = await fetchJSON(`https://${wiki}.org/w/api.php?${params}`);
    const items = data?.query?.exturlusage || [];
    total += items.length;

    if (data.continue?.eucontinue) {
      eucontinue = data.continue.eucontinue;
    } else {
      break; // no more results
    }
  }
  return total;
}

export async function fetchExternalLinks(domain, wiki = 'en.wikipedia', namespace = '') {
  try {
    const total = await countExtUrlUsage(domain, wiki, namespace);
    // Check if there might be even more (we stopped at maxPages)
    const capped = total >= 5000;
    return {
      total: total.toLocaleString(),
      totalExact: !capped,
      domain,
      wiki,
      namespace,
    };
  } catch (e) {
    throw new Error(`Link count fetch failed: ${e.message}`);
  }
}

/** 3. Category Size — uses MediaWiki API categoryinfo.
 *  Optional random image sample (Commons only): CirrusSearch with
 *  incategory: + srsort=random — the same mechanism as catprobe. */
function cleanCategoryName(category) {
  return category.replace(/^Category:\s*/i, '').replace(/"/g, '');
}

async function fetchRandomCategoryImages(category, limit) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `incategory:"${category}" filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: String(limit),
    gsrsort: 'random',
    prop: 'imageinfo',
    iiprop: 'url|size',
    iiurlwidth: '240',
    format: 'json',
    origin: '*',
  });
  const data = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
  return Object.values(data?.query?.pages || {})
    .filter(p => p.imageinfo?.[0]?.thumburl)
    .slice(0, limit)
    .map(p => ({
      title: p.title,
      url: p.imageinfo[0].thumburl.split('?')[0],
    }));
}

/** Media player (jukebox, ISSUE-39) — batched videoinfo for a playlist of
 *  Commons files. One call per ≤4,500-char batch; works for video AND audio
 *  (audio: derivatives may list an mp3 transcode, duration comes from the
 *  same viprop). Strips ?utm_source query junk from URLs. */
function truncate(s, n) {
  s = String(s || '').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}
export async function fetchMediaPlaylist(filesText) {
  const files = (filesText || '').split('\n')
    .map((s) => s.trim().replace(/^File:\s*/i, ''))
    .filter(Boolean)
    .map((s) => `File:${s.replace(/_/g, ' ')}`);
  if (!files.length) throw new Error('Enter at least one Commons file');
  const rows = [];
  const MAX_ENCODED = 4500;
  let chunk = [];
  let chunkLen = 0;
  const flush = async () => {
    if (!chunk.length) return;
    const params = new URLSearchParams({
      action: 'query',
      prop: 'videoinfo',
      titles: chunk.join('|'),
      viprop: 'derivatives|url|size|duration|extmetadata', // extmetadata → description/artist/license (⚠ iiextmetadatafilter is IGNORED by videoinfo — full set returns)
      format: 'json',
      origin: '*',
    });
    const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
    const byTitle = {};
    for (const p of Object.values(d?.query?.pages || {})) {
      const vi = p.videoinfo?.[0] || {};
      const em = vi.extmetadata || {};
      byTitle[p.title] = {
        derivatives: (vi.derivatives || []).map((dv) => ({
          type: dv.type || '',
          width: dv.width || 0,
          height: dv.height || 0,
          src: (dv.src || '').split('?')[0],
        })),
        originalUrl: (vi.url || '').split('?')[0],
        duration: vi.duration || 0,
        size: vi.size || 0,
        description: truncate(stripHtml(em.ImageDescription?.value || ''), 280),
        artist: truncate(stripHtml(em.Artist?.value || ''), 80),
        license: stripHtml(em.LicenseShortName?.value || ''),
        missing: !!p.missing,
      };
    }
    for (const t of chunk) {
      const info = byTitle[t];
      const isVideo = (info?.derivatives || []).some((dv) => dv.type.startsWith('video/'))
        || /\.(webm|ogv)$/i.test(t);
      rows.push({
        title: t.replace(/^File:\s*/i, '').replace(/_/g, ' '),
        fileUrl: `https://commons.wikimedia.org/wiki/${t.replace(/ /g, '_')}`,
        mediaType: isVideo ? 'video' : 'audio',
        ...(info || { missing: true, derivatives: [], originalUrl: '', duration: 0, size: 0 }),
      });
    }
    chunk = [];
    chunkLen = 0;
  };
  for (const f of files) {
    const len = encodeURIComponent(f).length + 1;
    // 50-title anonymous cap (toomanyvalues) — see fetchBatchedUsage.
    if (chunk.length >= 50 || (chunk.length && chunkLen + len > MAX_ENCODED)) await flush();
    chunk.push(f);
    chunkLen += len;
  }
  await flush();
  return { rows, missing: rows.filter((r) => r.missing).length };
}

export async function fetchCategorySize(category, wiki = 'commons.wikimedia', sampleCount = 0) {
  const clean = cleanCategoryName(category);
  const params = new URLSearchParams({
    action: 'query',
    prop: 'categoryinfo',
    titles: `Category:${clean}`,
    format: 'json',
    origin: '*',
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
      sample: [],
    };
    const n = Math.min(Math.max(parseInt(sampleCount) || 0, 0), 24);
    if (n > 0 && wiki === 'commons.wikimedia') {
      try {
        result.sample = await fetchRandomCategoryImages(clean, n);
      } catch {
        result.sample = []; // sample is optional — never fail the whole widget on it
      }
    }
    return result;
  } catch (e) {
    throw new Error(`Category fetch failed: ${e.message}`);
  }
}

/** 4. Wikistats — per-wiki aggregate stats. Uses CSV format (dump action doesn't support JSON). */
/** 4. Wikistats — per-wiki aggregate stats. Uses CSV format (dump action doesn't support JSON). */
export async function fetchWikistats(table = 'wikipedias', lang = null) {
 const params = new URLSearchParams({ action: 'dump', table, format: 'csv', });
 try {
  const csv = await fetchWikistatsText(`${WIKISTATS_API}?${params}`);
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');
  const rows = lines.slice(1).map(line => {
   const vals = line.split(',');
   const obj = {};
   headers.forEach((h, i2) => { obj[h.trim()] = vals[i2]?.trim(); });
   return obj;
  });
  if (lang) {
   return rows.find(r => r.lang === lang) || rows[0];
  }
  // Return top 10 by 'good' articles
  const sorted = [...rows].filter(r => r.good).sort((a, b) => (parseInt(b.good) || 0) - (parseInt(a.good) || 0));
  return { rows: sorted.slice(0, 10), table };
 } catch (e) {
  throw new Error(`Wikistats fetch failed: ${e.message}`);
 }
}
export async function fetchFileUsage(filename, topN = 10) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'globalusage|imageinfo',
    titles: `File:${filename.replace(/^File:\s*/i, '')}`,
    gulimit: '500',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '480',
    format: 'json',
    origin: '*',
  });
  try {
    const data = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
    const pages = Object.values(data?.query?.pages || {});
    const usage = pages[0]?.globalusage || [];
    const info = pages[0]?.imageinfo?.[0] || {};
    const ext = info.extmetadata || {};
    // Count per wiki
    const counts = {};
    usage.forEach(u => {
      counts[u.wiki] = (counts[u.wiki] || 0) + 1;
    });
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);
    return {
      totalWikis: Object.keys(counts).length,
      totalUsages: usage.length,
      top: sorted.map(([wiki, count]) => ({ wiki, count })),
      filename,
      image: {
        url: (info.thumburl || '').split('?')[0],
        description: stripHtml(ext.ImageDescription?.value || ''),
        license: stripHtml(ext.LicenseShortName?.value || ''),
      },
    };
  } catch (e) {
    throw new Error(`File usage fetch failed: ${e.message}`);
  }
}

// ── Top Wikipedia Articles (top.hatnote.com) ─────────────
// Per-day JSON at https://top.hatnote.com/{lang}/wikipedia/{y}/{m}/{d}.json
// (month/day NOT zero-padded; data updated ~02:00 UTC daily). The host sends
// no CORS headers, so the browser fetches via the same-origin /api/proxy
// (deploy/server.js) and falls back to the CORS-enabled WMF Pageviews `top`
// REST endpoint. Dates back off to the nearest available day.
const HATNOTE_API = 'https://top.hatnote.com';
const topPagesCache = createTtlCache(10 * 60 * 1000);

/** Compact number ("1.2M", "105K") — mirrors hatnote's views_short. */
function compactNumber(n) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
/** Thumbnail URL from hatnote: strip utm_* tracking params; null for the generic placeholder globe. */
function hatnoteThumb(url) {
 if (!url || url.includes('top.hatnote.com/img/w.png')) return null;
 try {
  const u = new URL(url);
  ['utm_source', 'utm_campaign', 'utm_content', 'utm_medium', 'utm_term'].forEach(k => u.searchParams.delete(k));
  return u.href;
 } catch {
  return url.split('?')[0];
 }
}

/** Non-article page prefixes — hatnote/WMF tops include Main_Page, Special:*,
 *  Wikipedia:* helper pages that aren't useful in a top-articles list
 *  (pattern from the Wiki-Top-100 project). */
const NON_ARTICLE_PREFIXES = ['Special', 'Wikipedia', 'Talk', 'User', 'Help', 'File', 'Template', 'Category', 'Portal', 'Draft', 'Module', 'MediaWiki', 'Main_Page'];

function isArticlePage(title) {
 if (!title || title === 'Main_Page') return false;
 const prefix = title.split(':')[0];
 return !NON_ARTICLE_PREFIXES.includes(prefix);
}

/** Enrich article rows with clean thumbnails + intros via the CORS-enabled
 *  MediaWiki Action API (prop=pageimages|extracts, origin=*). Batched
 *  50 titles/call. Best-effort: rows pass through unchanged on failure. */
async function enrichTopArticles(lang, rows) {
 if (!rows.length || lang === 'commons') return rows;
 const api = new URL(`https://${lang}.wikipedia.org/w/api.php`);
 const out = [];
 for (let i = 0; i < rows.length; i += 50) {
  const batch = rows.slice(i, i + 50);
  api.search = new URLSearchParams({
   action: 'query',
   prop: 'pageimages|extracts',
   titles: batch.map(r => r.title.replace(/_/g, ' ')).join('|'),
   piprop: 'thumbnail', pithumbsize: 120,
   exintro: 1, explaintext: 1, exchars: 300,
   format: 'json', origin: '*',
  });
  try {
   const d = await fetchJSON(api.href);
   const pages = d?.query?.pages || {};
   const byTitle = new Map();
   Object.values(pages).forEach(p => byTitle.set(p.title.replace(/ /g, '_'), p));
   batch.forEach(r => {
    const p = byTitle.get(r.title);
    if (p && p.thumbnail?.source) r.imageUrl = p.thumbnail.source;
    if (p && p.extract) r.summary = p.extract;
    out.push(r);
   });
  } catch {
   out.push(...batch); // enrichment is best-effort; keep hatnote fields
  }
 }
 return out;
}


async function fetchViaProxy(url) {
  // Same-origin /api/proxy (deploy/server.js) wraps { status, body } with ACAO:*.
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
  return topPagesCache.get(proxyUrl, () => fetchTextWithRetry(proxyUrl))
    .then((text) => {
      const wrapped = JSON.parse(text);
      if (wrapped.status !== 200) throw new Error(`HTTP ${wrapped.status}`);
      return JSON.parse(wrapped.body);
    });
}

/** Candidate dates: today stepping back for 'latest', exact date for 'date'. */
function topPageCandidates({ dateMode, year, month, day }) {
  const out = [];
  const d = dateMode === 'latest'
    ? new Date()
    : new Date(Date.UTC(year || 2026, (month || 1) - 1, day || 1));
  const maxBack = dateMode === 'latest' ? 14 : 7;
  for (let i = 0; i < maxBack; i++) {
    const c = new Date(d.getTime() - i * 86400000);
    out.push({ y: c.getUTCFullYear(), m: c.getUTCMonth() + 1, d: c.getUTCDate() });
  }
  return out;
}

/** Try hatnote (via proxy, then direct), then WMF REST for one day. */
async function fetchTopPageDay(lang, { y, m, d }) {
  // 1. hatnote via same-origin proxy (works on the Toolforge deployment)
  try {
    const data = await fetchViaProxy(`${HATNOTE_API}/${lang}/wikipedia/${y}/${m}/${d}.json`);
    if (!data?.articles?.length) return null;
    return {
      source: 'hatnote',
      dateLabel: data.formatted_date,
      fullLang: data.full_lang,
      totalTrafficShort: data.total_traffic_short,
      permalink: data.permalink,
      articles: data.articles.map((a) => ({
        title: a.title, rank: a.rank, views: a.pviews ?? a.views,
        views_short: a.views_short || compactNumber(a.pviews ?? a.views),
        imageUrl: hatnoteThumb(a.image_url),
        summary: a.summary || '',
        url: a.url || '',
      })),
    };
  } catch { /* fall through */ }
  // 2. WMF Pageviews top REST (CORS-enabled; zero-padded dates)
  // NOTE: there is no "direct hatnote" fallback — hatnote sends no CORS headers
  // (verified repeatedly), so a direct browser fetch can never succeed; and in
  // WebKit the blocked fetch raises an uncaught pageerror even when the promise
  // rejection is handled (noise the browser matrix suite flagged 2026-09-03).
  try {
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const data = await fetchJSON(`${PAGEVIEWS_API}/top/${lang}.wikipedia/all-access/${y}/${mm}/${dd}`);
    const items = data?.items?.[0]?.articles || [];
    if (!items.length) return null;
    return {
      source: 'wmf',
      dateLabel: `${y}/${mm}/${dd}`,
      fullLang: lang,
      totalTrafficShort: null,
      permalink: null,
      articles: items.map((a) => ({
        title: a.article, rank: a.rank, views: a.views,
        views_short: compactNumber(a.views),
        imageUrl: null, summary: '', url: '',
      })),
    };
  } catch { return null; }
}

/**
 * Top Wikipedia articles for a language edition.
 * cfg: { lang, dateMode ('latest'|'date'), year, month, day }
 */
export async function fetchTopPages(cfg = {}) {
  const lang = cfg.lang || 'en';
  const enrich = cfg.showExpanded && lang !== 'commons';
  const candidates = topPageCandidates(cfg);
  let lastErr = null;
  for (const c of candidates) {
    const day = await fetchTopPageDay(lang, c);
    if (day) {
      // Drop non-article helper pages (Main_Page, Special:*, Wikipedia:*…) —
      // pattern from the Wiki-Top-100 project (hatnote + WMF both include them).
      day.articles = day.articles.filter(a => isArticlePage(a.title));
      // Expanded view: fetch clean thumbnails + intros from the CORS-enabled
      // MediaWiki API (works for both hatnote and WMF fallback data).
      if (enrich) day.articles = await enrichTopArticles(lang, day.articles);
      return day;
    }
    lastErr = `no data for ${c.y}/${c.m}/${c.d}`;
  }
  throw new Error(`Top pages fetch failed: ${lastErr || 'no data available'}`);
}

// ── Article Vitals (single-article widgets) ────────────────

/** Resolve the latest revision id for a title (needed by Lift Wing models). */
export async function resolveLatestRev(article, project = 'en.wikipedia') {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'revisions',
    titles: article,
    rvlimit: '1',
    rvprop: 'ids',
    format: 'json',
    formatversion: '2',
    origin: '*',
  });
  const data = await fetchJSON(`https://${project}.org/w/api.php?${params}`);
  const page = data?.query?.pages?.[0];
  if (!page || page.missing || !page.revisions?.[0]) {
    throw new Error(`Article not found: ${article}`);
  }
  return { revid: page.revisions[0].revid, pageid: page.pageid };
}

/**
 * Article summary — first paragraph (REST /page/summary). CORS-enabled
 * (Access-Control-Allow-Origin: *), returns title + description + thumbnail
 * + extract in one call.
 */
export async function fetchArticleSummary(article, project = 'en.wikipedia') {
  const title = article.replace(/ /g, '_');
  let data;
  try {
    data = await fetchJSON(`https://${project}.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  } catch (e) {
    if (e.message?.startsWith('HTTP 404')) throw new Error(`Article not found: ${article}`);
    throw new Error(`Summary fetch failed: ${e.message}`);
  }
  if (data.type === 'disambiguation') {
    return {
      title: data.title,
      description: data.description || '',
      extract: `"${data.title}" is a disambiguation page — pick a specific article.`,
      thumbnailUrl: data.thumbnail?.source || null,
      pageUrl: data.content_urls?.desktop?.page || null,
    };
  }
  return {
    title: data.title || article,
    description: data.description || '',
    extract: data.extract || '',
    thumbnailUrl: data.thumbnail?.source || null,
    pageUrl: data.content_urls?.desktop?.page || null,
  };
}

/**
 * Article quality — ORES class via Lift Wing. First tries the frozen
 * revscoring `{wiki}-articlequality` model (the familiar FA/GA/B/C/Start/Stub
 * grades + per-class probabilities); falls back to the modern continuous
 * `articlequality` model (0–1 score) for wikis without a revscoring model.
 */
export async function fetchArticleQuality(article, project = 'en.wikipedia') {
  const lang = project.replace('.wikipedia', '');
  const wiki = `${lang}wiki`;
  const { revid } = await resolveLatestRev(article, project);
  // 1. Classic ORES grade (revscoring, frozen) — familiar classes.
  try {
    const data = await postJSON(`https://api.wikimedia.org/service/lw/inference/v1/models/${wiki}-articlequality:predict`, { rev_id: revid });
    const score = data?.[wiki]?.scores?.[String(revid)]?.articlequality?.score;
    if (score?.prediction) {
      return {
        article,
        revid,
        grade: score.prediction,
        probabilities: score.probability || {},
        model: `ORES class (${wiki}-articlequality)`,
      };
    }
  } catch { /* fall through to the modern model */ }
  // 2. Modern continuous articlequality (0–1).
  try {
    const data = await postJSON('https://api.wikimedia.org/service/lw/inference/v1/models/articlequality:predict', { rev_id: revid, lang });
    if (typeof data?.score === 'number') {
      return { article, revid, score: data.score, model: 'articlequality (continuous)' };
    }
  } catch (e) {
    throw new Error(`Quality fetch failed: ${e.message}`);
  }
  throw new Error(`No quality model available for ${project}`);
}

/**
 * WikiProject assessments — prop=pageassessments (enwiki has the best
 * coverage; extension absent on most other wikis → empty state). Returns
 * per-project { class, importance } sorted by importance then class rank.
 */
export async function fetchAssessments(article, project = 'en.wikipedia', topN = 12) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'pageassessments',
    titles: article,
    palimit: '500',
    format: 'json',
    formatversion: '2',
    origin: '*',
  });
  const data = await fetchJSON(`https://${project}.org/w/api.php?${params}`);
  const page = data?.query?.pages?.[0];
  if (!page || page.missing) throw new Error(`Article not found: ${article}`);
  const IMPORTANCE_RANK = { Top: 0, High: 1, Mid: 2, Low: 3, Unknown: 4, NA: 5 };
  const CLASS_RANK = { FA: 0, FL: 1, GA: 2, A: 3, B: 4, C: 5, Start: 6, Stub: 7, List: 8, Book: 9, Category: 10, Disambig: 11, File: 12, Portal: 13, Project: 14, Redirect: 15, Template: 16, NA: 17 };
  const rows = Object.entries(page.pageassessments || {})
    .map(([name, v]) => ({ project: name, class: v?.class || '', importance: v?.importance || '' }))
    .sort((a, b) =>
      (IMPORTANCE_RANK[a.importance] ?? 6) - (IMPORTANCE_RANK[b.importance] ?? 6)
      || (CLASS_RANK[a.class] ?? 99) - (CLASS_RANK[b.class] ?? 99)
      || a.project.localeCompare(b.project)
    );
  return { article, rows: rows.slice(0, topN), total: rows.length };
}

/**
 * Edit history — prop=revisions, newest first, with byte deltas
 * (size diff vs the previous revision) and diff links.
 */
export async function fetchEditHistory(article, project = 'en.wikipedia', limit = 10) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'revisions',
    titles: article,
    rvlimit: String(limit),
    rvprop: 'timestamp|user|comment|ids|size',
    rvdir: 'older',
    format: 'json',
    formatversion: '2',
    origin: '*',
  });
  const data = await fetchJSON(`https://${project}.org/w/api.php?${params}`);
  const page = data?.query?.pages?.[0];
  if (!page || page.missing) throw new Error(`Article not found: ${article}`);
  const revs = page.revisions || [];
  const rows = revs.map((r, i) => ({
    revid: r.revid,
    timestamp: r.timestamp,
    user: r.user || '(anon)',
    comment: r.comment || '(no edit summary)',
    size: r.size,
    delta: i < revs.length - 1 ? r.size - revs[i + 1].size : null,
  }));
  return { article, project, rows };
}

/** Normalize a media-list thumb URL: absolute https + no utm_* params. */
function cleanThumbUrl(url) {
  if (!url) return null;
  const clean = url.replace(/^\/\//, 'https://');
  try {
    const u = new URL(clean);
    ['utm_source', 'utm_campaign', 'utm_content', 'utm_medium', 'utm_term'].forEach((k) => u.searchParams.delete(k));
    return u.href;
  } catch {
    return clean.split('?')[0];
  }
}

/**
 * Conservative decorative-file heuristic for CAPTION-LESS images only
 * (gallery widget `hideDecorative`, GitHub issue fuzheado/wikibento#3):
 * flags, coats of arms / escudos / wappen, seals, emblems, crests, insignia,
 * badges, roundels, logos, small locator/blank maps (incl. "(orthographic
 * projection)" globes), generic icons/symbols, placeholder stubs. Matched
 * against the file name WITHOUT the "File:" prefix.
 *
 * Verified 2026-09-05 against live media-list payloads (France, Germany,
 * UK, US, Japan, India, European Union, National Gallery London, List of
 * presidents of Harvard University): the matched set is exactly the expected
 * decoration (Flag_of_France.svg, Coat_of_arms_of_Germany.svg,
 * Imperial_Seal_of_Japan.svg, National_Gallery_London_logo.svg,
 * Noimage.svg …) with zero content-image false positives (Albert Einstein:
 * 0 of 4 caption-less files matched; president portraits all kept).
 * Captioned images are NEVER subject to this filter.
 */
const DECORATIVE_FILE_RE = new RegExp([
  /(^|[\s_\-.)(])flag([\s_\-.]of|$)/.source,                               // Flag_of_France.svg, State flag of X.svg
  /(^|[\s_\-.)(])coat[\s_\-.]of[\s_\-.]arms/.source,                       // Coat of arms of X.svg, Greater_coat_of_arms…
  /(^|[\s_\-.)(])(escudo|armoiries|wappen|герб)([\s_\-.)(]|$)/.source,    // non-English CoA
  /(^|[\s_\-.)(])(great[\s_\-.]seal|state[\s_\-.]seal|official[\s_\-.]seal|seal[\s_\-.]of)([\s_\-.)(]|$)/.source, // Imperial_Seal_of_Japan.svg
  /(^|[\s_\-.)(])(emblem|insignia|crest|heraldry|heraldic|roundel)([\s_\-.)(]|$)/.source, // Emblem_of_India.svg
  /(^|[\s_\-.)(])(logo|logotype)([\s_\-.)(]|$)/.source,                   // National_Gallery_London_logo.svg
  /(^|[\s_\-.)(])(locator[\s_\-.]map|blank[\s_\-.]?map|orthographic[\s_\-.]projection)([\s_\-.)(]|$)/.source, // locator maps (BlankMap-World…)
  /(^|[\s_\-.)(])(symbol|icon|badge|noimage|placeholder)([\s_\-.)(]|$)/.source, // icons / stubs
].join('|'), 'i');

export function isDecorativeImageTitle(title) {
  if (!title) return false;
  return DECORATIVE_FILE_RE.test(String(title).replace(/^File\s*:/i, '').trim());
}

/**
 * Pick which media-list items survive the gallery's image selection.
 * Default (includeAll off) keeps ONLY captioned type=image items — the
 * historical "significant images" behavior. With includeAll on, every
 * type=image item with a title is a candidate; caption-less decorative
 * files (flags, coats of arms, logos, locator maps …) are additionally
 * dropped when hideDecorative is on (the default) — captioned items are
 * never decorative-filtered. Returns { kept, decorative } where decorative
 * counts the caption-less items dropped by the heuristic.
 */
export function selectGalleryCandidates(items, { includeAll = false, hideDecorative = true } = {}) {
  const out = { kept: [], decorative: 0 };
  for (const it of items || []) {
    if (!it || it.type !== 'image' || !it.title) continue; // non-images + title-less stubs
    const captioned = !!(it.caption && it.caption.html);
    if (!includeAll && !captioned) continue;
    if (includeAll && !captioned && hideDecorative && isDecorativeImageTitle(it.title)) {
      out.decorative++;
      continue;
    }
    out.kept.push(it);
  }
  return out;
}

/**
 * Annotate gallery rows with `group: { key, label }` for the renderer's
 * group headers. Rows must carry sectionId (number, 0 = lead) and galleryId
 * (string|null; set on items inside <gallery> blocks by media-list).
 * - groupBy 'section': one group per article section — label uses the
 *   tocdata heading when available ("Section: History"), else "Section N"
 *   (lead is 0 → "Section: Introduction"). Gallery images stay in their
 *   containing section.
 * - groupBy 'gallery': each <gallery> block becomes its own "Gallery N"
 *   group (N = order of first appearance among the surviving rows); every
 *   other image keeps its section group.
 * - groupBy 'none' (default): rows returned untouched.
 */
export function assignRowGroups(rows, groupBy = 'none', headings = new Map()) {
  if (groupBy !== 'section' && groupBy !== 'gallery') return rows;
  const galleryN = new Map();
  for (const row of rows) {
    const gid = row.galleryId ?? null;
    if (groupBy === 'gallery' && gid != null) {
      if (!galleryN.has(gid)) galleryN.set(gid, galleryN.size + 1);
      row.group = { key: `g:${gid}`, label: `Gallery ${galleryN.get(gid)}` };
    } else {
      const sid = Number(row.sectionId) || 0;
      const heading = headings.get(sid);
      row.group = {
        key: `s:${sid}`,
        label: heading ? `Section: ${heading}` : (sid === 0 ? 'Section: Introduction' : `Section ${sid}`),
      };
    }
  }
  return rows;
}

/** Fetch section index → heading (prop=tocdata) for section-group labels.
 *  Returns an empty Map on any failure — callers fall back to "Section N". */
async function fetchSectionHeadings(project, article) {
  try {
    const params = new URLSearchParams({
      action: 'parse',
      prop: 'tocdata',
      page: String(article || '').replace(/_/g, ' '),
      format: 'json',
      formatversion: '2',
      origin: '*',
    });
    const d = await fetchJSON(`https://${project}.org/w/api.php?${params}`);
    const map = new Map();
    for (const s of d?.parse?.tocdata?.sections || []) {
      if (s && /^\d+$/.test(String(s.index))) {
        const line = String(s.line || '').trim();
        if (line) map.set(parseInt(s.index, 10), line);
      }
    }
    return map;
  } catch { return new Map(); }
}

/**
 * Article gallery — significant images with captions (default), optionally
 * ALL images incl. caption-less <gallery> blocks and table lists, with a
 * decorative filter and section/gallery grouping (GitHub issue #3).
 * REST /page/media-list is Parsoid's server-side media extraction (images +
 * captions + srcset in one CORS-enabled call — no wikitext parsing needed).
 * Significance heuristic (verified 2026-08-13, extended 2026-09-05): the
 * default keeps only type=image items WITH captions — caption-less items are
 * exactly the noise (infobox flags like Flag_of_France.svg, maps, logos,
 * portraits); `includeAll` opts into caption-less gallery/table images with
 * the optional `hideDecorative` filename filter; then a batched imageinfo
 * call drops images smaller than minSize (tiny icons).
 *
 * Backward compatible: the original positional signature
 * (article, project, minSize, maxItems) still works — the new options object
 * is the optional 5th argument: { includeAll = false, hideDecorative = true,
 * groupBy = 'none' | 'section' | 'gallery' }.
 */
export async function fetchArticleGallery(article, project = 'en.wikipedia', minSize = 200, maxItems = 0, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const includeAll = !!opts.includeAll;
  const groupBy = opts.groupBy === 'section' || opts.groupBy === 'gallery' ? opts.groupBy : 'none';
  // hideDecorative only means anything once includeAll is on — the default
  // mode already drops every caption-less item. Default true.
  const hideDecorative = includeAll && opts.hideDecorative !== false;
  const title = article.replace(/ /g, '_');
  let list;
  try {
    list = await fetchJSON(`https://${project}.org/api/rest_v1/page/media-list/${encodeURIComponent(title)}`);
  } catch (e) {
    if (e.message?.startsWith('HTTP 404')) throw new Error(`Article not found: ${article}`);
    throw new Error(`Gallery fetch failed: ${e.message}`);
  }
  const { kept, decorative } = selectGalleryCandidates(list?.items, { includeAll, hideDecorative });
  if (!kept.length) return { article, rows: [], total: 0, dropped: 0, decorative, includeAll, groupBy };

  // Authoritative dimensions + mime via batched imageinfo (50 titles/call).
  const info = {};
  for (let i = 0; i < kept.length; i += 50) {
    const params = new URLSearchParams({
      action: 'query',
      prop: 'imageinfo',
      titles: kept.slice(i, i + 50).map((it) => it.title).join('|'),
      iiprop: 'size|mime',
      format: 'json',
      formatversion: '2',
      origin: '*',
    });
    try {
      const d = await fetchJSON(`https://${project}.org/w/api.php?${params}`);
      for (const p of d?.query?.pages || []) {
        const ii = p.imageinfo?.[0];
        if (ii) info[p.title] = { width: ii.width, height: ii.height, mime: ii.mime };
      }
    } catch { /* dimension filter is best-effort */ }
  }

  const min = Math.max(parseInt(minSize) || 200, 0);
  const rows = [];
  let dropped = 0;
  for (const it of kept) {
    const dim = info[it.title];
    if (dim && (dim.width < min || dim.height < min)) { dropped++; continue; }
    const src = it.srcset?.find((s) => s.scale === '1x') || it.srcset?.[0];
    const thumbUrl = cleanThumbUrl(src?.src);
    if (!thumbUrl) { dropped++; continue; }
    const caption = stripHtml(it.caption?.html || '');
    rows.push({
      title: it.title.replace(/^File:/, '').replace(/_/g, ' '),
      fileUrl: `https://${project}.org/wiki/${it.title.replace(/ /g, '_')}`,
      caption,
      showFileName: includeAll && !caption, // renderer shows the file name under caption-less tiles
      thumbUrl,
      width: dim?.width,
      height: dim?.height,
      sectionId: it.section_id ?? 0,
      galleryId: it.gallery_id ?? null,
    });
  }
  // Section/gallery grouping labels (one cheap tocdata call, grouped modes only).
  if (rows.length && groupBy !== 'none') {
    assignRowGroups(rows, groupBy, await fetchSectionHeadings(project, article));
  }
  const limit = Math.max(parseInt(maxItems) || 0, 0);
  return { article, rows: limit ? rows.slice(0, limit) : rows, total: rows.length, dropped, decorative, includeAll, groupBy };
}

/**
 * Panorama source — resolve a Commons file to a displayable equirectangular
 * URL for the 360° viewer. Uses the iiurlwidth=4096 thumb (aspect preserved)
 * instead of the 10–20 MB original. `equirectangular` = aspect ratio ≈ 2:1
 * (Pannellum also auto-reads Google Photo Sphere GPano XMP at render time).
 */
export async function fetchPanoramaFile(filename, project = 'commons.wikimedia') {
  const title = String(filename || '').replace(/^File:\s*/i, '').replace(/ /g, '_');
  if (!title) throw new Error('Enter a Commons file name');
  const params = new URLSearchParams({
    action: 'query',
    prop: 'imageinfo',
    titles: `File:${title}`,
    iiprop: 'url|size|mime',
    iiurlwidth: '4096',
    format: 'json',
    formatversion: '2',
    origin: '*',
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
    mime: ii.mime,
  };
}

/** Parse a textarea list into clean, deduped titles (one per line). */
function parseTitleList(text) {
  return [...new Set(String(text || '').split('\n').map((l) => l.trim()).filter(Boolean))];
}

/**
 * 15. Commons File Gallery — an arbitrary list of Commons files (one per
 *  line) → batched imageinfo (400px thumbs + dimensions + description
 *  caption). Ordering is applied client-side in the widget transform, so
 *  re-sorting never re-fetches. Missing files are counted, not fatal.
 */
export async function fetchCommonsGallery(filesText) {
  const titles = parseTitleList(filesText).map((t) => t.replace(/^File:\s*/i, '').replace(/ /g, '_'));
  if (!titles.length) throw new Error('Enter at least one Commons file (one per line)');
  const rows = [];
  // Adaptive batching: long filenames (WLM etc.) blow GET URLs (HTTP 414) —
  // chunk by encoded length, not by count (same rule as fetchBatchedUsage).
  const MAX_ENCODED = 4500;
  let chunk = [];
  let chunkLen = 0;
  const flush = async () => {
    if (!chunk.length) return;
    const params = new URLSearchParams({
      action: 'query',
      prop: 'imageinfo',
      titles: chunk.map((t) => `File:${t}`).join('|'),
      iiprop: 'url|size|extmetadata',
      iiurlwidth: '400',
      iiextmetadatafilter: 'ImageDescription',
      format: 'json',
      formatversion: '2',
      origin: '*',
    });
    const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
    for (const p of d?.query?.pages || []) {
      if (p.missing) continue;
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      rows.push({
        title: p.title.replace(/^File:/, '').replace(/_/g, ' '),
        fileUrl: `https://commons.wikimedia.org/wiki/${p.title.replace(/ /g, '_')}`,
        thumbUrl: ii.thumburl?.split('?')[0],
        caption: stripHtml(ii.extmetadata?.ImageDescription?.value || ''),
        width: ii.width,
        height: ii.height,
      });
    }
    chunk = [];
    chunkLen = 0;
  };
  for (const t of titles) {
    const len = encodeURIComponent(t).length + 1;
    // 50-title anonymous cap (toomanyvalues) — see fetchBatchedUsage.
    if (chunk.length >= 50 || (chunk.length && chunkLen + len > MAX_ENCODED)) await flush();
    chunk.push(t);
    chunkLen += len;
  }
  await flush();
  return { rows, total: titles.length, missing: titles.length - rows.length };
}

/**
 * 16. Article List — clickable list of pasted article titles (one per line).
 *  Plain links are pure config (no network); the optional enrichment adds
 *  thumbnails + intros via batched pageimages|extracts (50 titles/call —
 *  the Top Pages expanded-view pattern).
 */
export async function fetchArticleList(articlesText, project = 'en.wikipedia', opts = {}) {
  const titles = parseTitleList(articlesText);
  if (!titles.length) throw new Error('Enter at least one article title (one per line)');
  const maxItems = Math.max(parseInt(opts.maxItems) || 0, 0);
  const list = (maxItems ? titles.slice(0, maxItems) : titles).map((t) => ({
    title: t.replace(/_/g, ' '),
    pageUrl: `https://${project}.org/wiki/${t.replace(/ /g, '_')}`,
  }));
  if (!opts.enrich) return { rows: list };
  const info = {};
  for (let i = 0; i < list.length; i += 50) {
    const params = new URLSearchParams({
      action: 'query',
      prop: 'pageimages|extracts',
      titles: list.slice(i, i + 50).map((r) => r.title.replace(/ /g, '_')).join('|'),
      piprop: 'thumbnail',
      pithumbsize: '120',
      exintro: '1',
      explaintext: '1',
      exsentences: '3',
      format: 'json',
      formatversion: '2',
      origin: '*',
    });
    const d = await fetchJSON(`https://${project}.org/w/api.php?${params}`);
    for (const p of d?.query?.pages || []) {
      info[p.title] = { thumb: p.thumbnail?.source?.split('?')[0], extract: p.extract || '' };
    }
  }
  return {
    rows: list.map((r) => {
      const enriched = info[r.title] || {};
      return { ...r, thumbUrl: enriched.thumb, extract: enriched.extract };
    }),
  };
}

// ── SPARQL widget ───────────────────────────────────────────
// Runs arbitrary SPARQL against WDQS (Wikidata) or QLever (Commons SDC),
// plus the Humaniki precomputed gender-gap API (the Women-in-Red metric —
// the equivalent WDQS query times out: 504, verified 2026-08-13).
// All endpoints are CORS `*` from the browser; no proxy needed.
// WDQS is flaky (95% SLO, live 502/504 seen) — 60 s timeout, one retry,
// 10-min TTL cache, graceful errors.
const SPARQL_TIMEOUT_MS = 60000;
const SPARQL_GET_LIMIT = 1800; // WDQS GET URLs cap ~2,000 chars
const sparqlCache = createTtlCache(10 * 60 * 1000);

// Wikidata labels are stable — cache them 24 h. Keyed by language + the
// sorted id chunk, so each distinct result set costs ONE label request
// per language per day, and the lookup rides the sparql widget's own
// fetch lifecycle (no second refresh interval; the 10-min sparqlCache
// above means re-runs of the same query add no label traffic at all).
const sparqlLabelCache = createTtlCache(24 * 60 * 60 * 1000);

/**
 * Batch label lookup for one ≤50-id chunk (Issue #6). Throws on HTTP
 * failure so createTtlCache drops the entry and the next run retries
 * fresh — a transient failure must not pin bare QIDs for 24 h.
 */
async function fetchWikidataLabels(ids, lang) {
  const key = `${lang}::${[...ids].sort().join('|')}`;
  return sparqlLabelCache.get(key, async () =>
    parseLabelResponse(await fetchJSON(buildLabelRequestUrl(ids, lang)), lang));
}

/** Shorten entity URIs (Q160236, M37200540) — others kept as-is. */
function shortenSparqlUri(value) {
  const m = String(value).match(/\/(entity|File|Category)\/([^/]+)$/);
  return m ? m[2].replace(/_/g, ' ') : value;
}

/** SPARQL JSON literals are ALWAYS strings — coerce numerics via datatype. */
function coerceSparqlValue(binding) {
  if (binding.type === 'uri') return shortenSparqlUri(binding.value);
  if (binding.type === 'literal' && binding.datatype) {
    if (/#(?:integer|decimal|double|float|int|long|nonNegativeInteger|positiveInteger)$/.test(binding.datatype)) {
      const n = Number(binding.value);
      return Number.isFinite(n) ? n : binding.value;
    }
  }
  return binding.value;
}

/**
 * 17. SPARQL Query — arbitrary SPARQL (WDQS / QLever Commons) + Humaniki.
 * Returns { vars, rows } — plain objects, never the raw bindings envelope.
 * GET for short queries, POST form-urlencoded (no CORS preflight) beyond.
 *
 * `opts.resolveLabels` (default off — the sparql widget opts in): every
 * cell whose source binding was a Wikidata entity URI is batch-resolved
 * to "Label (Q123)" text via the Action API (see ../lib/sparqlLabels).
 * Works for ANY endpoint — QLever can't run SERVICE wikibase:label, so
 * this is the general post-processing fix (Issue #6). Best-effort: a
 * label-lookup failure never fails the query; raw QIDs stay in place.
 */
export async function fetchSparql(query, endpoint = 'wdqs', maxRows = 100, opts = {}) {
  const { resolveLabels = false } = opts || {};
  const ep = SPARQL_ENDPOINTS[endpoint] || SPARQL_ENDPOINTS.wdqs;
  const cap = Math.max(parseInt(maxRows) || 100, 1);

  // Humaniki branch — precomputed gender-gap counts (not SPARQL).
  if (endpoint === 'humaniki') {
    const cached = await sparqlCache.get('humaniki::gap', async () => {
      const d = await fetchJSON(`${ep.url}?project=enwiki&label_lang=en`);
      const metrics = d?.metrics || [];
      // ⚠️ Interpret value keys via the API's OWN bias_labels — Humaniki's
      // QID convention differs from Wikidata's (verified 2026-08-13: its map
      // says 6581097->male / 6581072->female, i.e. swapped vs Wikidata's
      // Q6581072=male / Q6581097=female). Hardcoding QIDs gives 79.7% women;
      // the label lookup gives the correct ~20.1% (matches Women in Red).
      const labels = d?.meta?.bias_labels || {};
      const femaleKey = Object.keys(labels).find((k) => /^female$/i.test(labels[k] || ''));
      let total = 0;
      let women = 0;
      for (const m of metrics) {
        for (const [gender, count] of Object.entries(m.values || {})) {
          total += count;
          if (gender === femaleKey) women += count;
        }
      }
      if (!total) throw new Error('Humaniki returned no counts');
      return {
        vars: ['total', 'women', 'pct'],
        rows: [{ total, women, pct: Math.round((women * 10000) / total) / 100 }],
      };
    });
    return cached;
  }

  const q = String(query || '').trim();
  if (!q) throw new Error('Enter a SPARQL query (or pick a preset)');

  const params = new URLSearchParams({ query: q, format: 'json' });
  const useGet = q.length <= SPARQL_GET_LIMIT;
  const url = useGet ? `${ep.url}?${params}` : ep.url;
  const body = useGet ? null : params.toString();

  const cacheKey = `${endpoint}::${q}`;
  return sparqlCache.get(cacheKey, async () => {
    const text = await fetchTextWithRetry(url, {
      timeoutMs: SPARQL_TIMEOUT_MS,
      retries: 1,
      method: useGet ? 'GET' : 'POST',
      body,
      contentType: 'application/x-www-form-urlencoded',
    });
    let d;
    try {
      d = JSON.parse(text);
    } catch {
      throw new Error('SPARQL endpoint returned non-JSON (is the query valid?)');
    }
    if (d?.error) {
      const msg = typeof d.error === 'string' ? d.error : d.error.message || JSON.stringify(d.error);
      throw new Error(`SPARQL error: ${msg}`);
    }
    const vars = d?.head?.vars || [];
    if (!vars.length) throw new Error('SPARQL returned no variables');
    const bindings = (d?.results?.bindings || []).slice(0, cap);
    // Entity-cell coordinates: collected on the RAW bindings (uri-typed,
    // full Wikidata entity URI) BEFORE shortening — only genuine entity
    // URIs are ever re-labelled, never literals that read "Q123".
    const entityCells = []; // { r, v, id }
    const rows = bindings.map((b, r) => {
      const row = {};
      for (const v of vars) {
        if (!b[v]) { row[v] = null; continue; }
        if (b[v].type === 'uri') {
          const id = wikidataEntityId(b[v].value);
          if (id) entityCells.push({ r, v, id });
        }
        row[v] = coerceSparqlValue(b[v]);
      }
      return row;
    });
    const result = { vars, rows };
    if (resolveLabels && entityCells.length) {
      try {
        await enrichEntityLabels(result.rows, entityCells, result.vars, {
          lang: labelLanguage(typeof navigator !== 'undefined' ? navigator.language : undefined),
          fetchBatch: fetchWikidataLabels,
        });
      } catch {
        // Enrichment is best-effort — never fail the query over labels.
      }
    }
    return result;
  });
}

// ── Commons Impact Metrics (CIM) — precomputed monthly data ─────────
// WMF's allow-list dataset: exact category-tree stats for ~1,755 primary
// categories + subcats (7 levels). Every endpoint: CORS `*`, {context,
// items} envelope. Only allow-listed categories have data — unregistered
// (or out-of-range) categories 404 with "not loaded yet" in the body
// (the 404 is AMBIGUOUS: registered categories with no data for the
// requested month return the same body — verified 2026-08-13; the
// disambiguation probe below separates the two cases).
// NOTE: CIM "views" = pageviews of pages USING the files, not media
// requests. Data is monthly, end-exclusive, lags ~1-2 days.
const CIM_BASE = 'https://wikimedia.org/api/rest_v1/metrics/commons-analytics/';
const CIM_TTL = 60 * 60 * 1000; // monthly data — 1 h cache is plenty
const cimCache = createTtlCache(CIM_TTL);

/** A category (or month range) with no CIM data — the friendly state. */
export class CimUnregisteredError extends Error {}

function cleanCategoryForCim(name) {
  return String(name || '').replace(/^Category:\s*/i, '').trim().replace(/ /g, '_');
}
function cleanMediaFileForCim(name) {
  return String(name || '').replace(/^File:\s*/i, '').trim().replace(/ /g, '_');
}
/** Previous calendar month (complete CIM data; current month is partial). */
function prevCimMonth(d = new Date()) {
  return { year: d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(), month: d.getMonth() === 0 ? 12 : d.getMonth() };
}
function shiftCimMonth(year, month, delta) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
function cimDate(year, month) { return `${year}${String(month).padStart(2, '0')}01`; }

/** GET one CIM path → items[] (never the raw envelope); 404-with-body →
 *  CimUnregisteredError; other errors pass through. TTL-cached. */
async function fetchCim(path, retries = 2) {
  const url = CIM_BASE + path;
  return cimCache.get(`cim::${path}`, async () => {
    let text;
    try {
      // 404s are terminal (not loaded / unregistered) — no retry. fetchTextWithRetry
      // does back off even on 404s, so callers that EXPECT 404s pass retries: 0.
      text = await fetchTextWithRetry(url, { timeoutMs: 30000, retries, withBody: true }); // CIM 500s intermittently (internal upstream 503s — verified 2026-08-13)
    } catch (e) {
      if (e.body && e.body.includes('not loaded yet')) {
        throw new CimUnregisteredError('No precomputed (CIM) data yet — categories register via {{Views from category}} on the category page (processed monthly)');
      }
      throw e;
    }
    let d;
    try { d = JSON.parse(text); } catch { throw new Error('CIM returned non-JSON'); }
    return d.items || [];
  });
}

/** The most recent month CIM has actually PUBLISHED. The calendar's previous
 *  month 404s ("not loaded yet") until the monthly job runs — typically days
 *  into a month (verified 2026-09-01: August unpublished while July had full
 *  data, so every default-month CIM widget falsely reported its registered
 *  category as unregistered). Probed via the GLOBAL leaderboard endpoint
 *  (category-independent — has data whenever the month does) with a bounded
 *  backward walk; TTL-cached 1 h (failures aren't cached, so a fresh publish
 *  is picked up on the next widget load/refresh). */
async function latestCimMonth() {
  return cimCache.get('cim::latest-month', async () => {
    let cur = prevCimMonth();
    for (let i = 0; i < 3; i++) {
      try {
        await fetchCim(`top-viewed-categories-monthly/deep/all-wikis/${cur.year}/${String(cur.month).padStart(2, '0')}`, 0); // 404 expected mid-walk — no retry
        return cur;
      } catch {
        cur = shiftCimMonth(cur.year, cur.month, -1);
      }
    }
    return cur; // nothing published in 3 months — normal per-widget errors take over
  });
}

/** Month-scoped fetch with 404 disambiguation: on "not loaded yet", probe
 *  the latest published month — probe OK = registered but no data for the
 *  requested month; probe 404 = not in CIM (or data doesn't reach that far
 *  back). The probe month comes from latestCimMonth(), NOT the calendar —
 *  probing the calendar's previous month is useless at month start (it 404s
 *  too, misreading a pure publish lag as "unregistered"). */
async function fetchCimMonth(path, probePath) {
  try {
    return await fetchCim(path);
  } catch (e) {
    if (!(e instanceof CimUnregisteredError) || !probePath) throw e;
    try {
      await fetchCim(probePath);
    } catch (p) {
      if (p instanceof CimUnregisteredError) throw e; // both 404 → unregistered
      throw p;
    }
    throw new Error('No CIM data for this month — it may not be published yet (the monthly job lags a few days into each month); clear the Month field for the latest available');
  }
}

/** 19a. CIM Category Snapshot — exact headline stats for a category. */
export async function fetchCimSnapshot(category, scope = 'deep', year, month) {
  const cat = cleanCategoryForCim(category);
  if (!cat) throw new Error('Enter a Commons category');
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const start = cimDate(y, m);
  const end = cimDate(...Object.values(shiftCimMonth(y, m, 1)));
  const probeStart = cimDate(py, pm);
  const probeEnd = cimDate(...Object.values(shiftCimMonth(py, pm, 1)));
  const items = await fetchCimMonth(
    `category-metrics-snapshot/${cat}/${start}/${end}`,
    `category-metrics-snapshot/${cat}/${probeStart}/${probeEnd}`,
  );
  const it = items[0] || {};
  return {
    category: cat,
    files: it['media-file-count'] ?? 0,
    filesDeep: it['media-file-count-deep'] ?? 0,
    used: it['used-media-file-count'] ?? 0,
    usedDeep: it['used-media-file-count-deep'] ?? 0,
    wikis: it['leveraging-wiki-count'] ?? 0,
    wikisDeep: it['leveraging-wiki-count-deep'] ?? 0,
    pages: it['leveraging-page-count'] ?? 0,
    pagesDeep: it['leveraging-page-count-deep'] ?? 0,
    resolvedMonth: { year: y, month: m },
  };
}

/** 19b. CIM Views Over Time — monthly pageview series (views of pages
 *  using the category's files). */
export async function fetchCimTrend(category, scope = 'deep', wiki = 'all-wikis', year, month, months = 6) {
  const cat = cleanCategoryForCim(category);
  if (!cat) throw new Error('Enter a Commons category');
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const n = Math.min(Math.max(parseInt(months) || 6, 2), 24);
  const end = shiftCimMonth(y, m, 1);
  const start = shiftCimMonth(y, m, -(n - 1));
  const items = await fetchCimMonth(
    `pageviews-per-category-monthly/${cat}/${scope}/${wiki}/${cimDate(start.year, start.month)}/${cimDate(end.year, end.month)}`,
    `pageviews-per-category-monthly/${cat}/${scope}/${wiki}/${cimDate(py, pm)}/${cimDate(...Object.values(shiftCimMonth(py, pm, 1)))}`,
  );
  const rows = items.map((it) => ({ date: (it.timestamp || '').slice(0, 7), views: it['pageview-count'] ?? 0 }));
  return { category: cat, rows, resolvedMonth: { year: y, month: m } };
}

/** 19c. CIM Top Files — most-viewed media files (with thumbnails). */
export async function fetchCimTopFiles(category, scope = 'deep', wiki = 'all-wikis', year, month, topN = 10) {
  const cat = cleanCategoryForCim(category);
  if (!cat) throw new Error('Enter a Commons category');
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const n = Math.min(Math.max(parseInt(topN) || 10, 1), 50);
  const items = await fetchCim(
    `top-viewed-media-files-monthly/${cat}/${scope}/${wiki}/${y}/${String(m).padStart(2, '0')}`,
  );
  const rows = items.slice(0, n).map((it) => ({ title: it['media-file'], views: it['pageview-count'] ?? 0 }));
  const withThumbs = rows.map((r) => ({ title: `File:${r.title.replace(/_/g, " ")}` })); // imageinfo returns spaces — match its normalization
  await attachThumbs(withThumbs); // best-effort 120px thumbs (imageinfo, 50/call)
  rows.forEach((r, i) => { r.thumbUrl = withThumbs[i].thumbUrl; });
  return { category: cat, rows, resolvedMonth: { year: y, month: m } };
}

/** 19d–19f. CIM rankings — wikis / pages / editors using the category. */
export async function fetchCimTopWikis(category, scope = 'deep', year, month, topN = 10) {
  const cat = cleanCategoryForCim(category);
  if (!cat) throw new Error('Enter a Commons category');
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const n = Math.min(Math.max(parseInt(topN) || 10, 1), 50);
  const items = await fetchCim(`top-wikis-per-category-monthly/${cat}/${scope}/${y}/${String(m).padStart(2, '0')}`);
  return { category: cat, rows: items.slice(0, n).map((it) => ({ wiki: it.wiki, views: it['pageview-count'] ?? 0 })), resolvedMonth: { year: y, month: m } };
}

export async function fetchCimTopPages(category, scope = 'deep', wiki = 'all-wikis', year, month, topN = 10) {
  const cat = cleanCategoryForCim(category);
  if (!cat) throw new Error('Enter a Commons category');
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const n = Math.min(Math.max(parseInt(topN) || 10, 1), 50);
  const items = await fetchCim(`top-pages-per-category-monthly/${cat}/${scope}/${wiki}/${y}/${String(m).padStart(2, '0')}`);
  return { category: cat, rows: items.slice(0, n).map((it) => ({ wiki: it['page-wiki'], page: it['page-title'], views: it['pageview-count'] ?? 0 })), resolvedMonth: { year: y, month: m } };
}

export async function fetchCimTopEditors(category, scope = 'deep', editType = 'all-edit-types', year, month, topN = 10) {
  const cat = cleanCategoryForCim(category);
  if (!cat) throw new Error('Enter a Commons category');
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const n = Math.min(Math.max(parseInt(topN) || 10, 1), 50);
  const items = await fetchCim(`top-editors-monthly/${cat}/${scope}/${editType}/${y}/${String(m).padStart(2, '0')}`);
  return { category: cat, rows: items.slice(0, n).map((it) => ({ user: it['user-name'], edits: it['edit-count'] ?? 0 })), resolvedMonth: { year: y, month: m } };
}

/** 19g. CIM Global Leaderboard — top 100 viewed categories (no rank-of-X). */
export async function fetchCimLeaderboard(scope = 'deep', wiki = 'all-wikis', year, month) {
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const items = await fetchCim(`top-viewed-categories-monthly/${scope}/${wiki}/${y}/${String(m).padStart(2, '0')}`);
  return { rows: items.map((it) => ({ category: it.category, views: it['pageview-count'] ?? 0, rank: it.rank ?? 0 })), resolvedMonth: { year: y, month: m } };
}

/** 480px preview thumb for one Commons file (best-effort — null on any
 *  failure, so a bad filename can never take down the CIM stats). */
async function fetchCommonsFileImage(file) {
  try {
    const params = new URLSearchParams({
      action: 'query', prop: 'imageinfo', titles: `File:${file}`, // File: prefix REQUIRED after normalization (gotcha #12)
      iiprop: 'url', iiurlwidth: '480', format: 'json', origin: '*',
    });
    const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
    const info = Object.values(d?.query?.pages || {})[0]?.imageinfo?.[0];
    return info?.thumburl ? { url: info.thumburl.split('?')[0] } : null;
  } catch { return null; }
}

/** 19h. CIM File Spotlight — per-file stats + monthly view trend. */
export async function fetchCimFileSpotlight(mediaFile, wiki = 'all-wikis', year, month, showImage = true) {
  const file = cleanMediaFileForCim(mediaFile);
  if (!file) throw new Error('Enter a Commons file name');
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const start = cimDate(y, m);
  const end = cimDate(...Object.values(shiftCimMonth(y, m, 1)));
  const probeStart = cimDate(py, pm);
  const probeEnd = cimDate(...Object.values(shiftCimMonth(py, pm, 1)));
  const trendStart = shiftCimMonth(y, m, -5); // 6-month sparkline window
  const [snapItems, trendItems, image] = await Promise.all([
    fetchCimMonth(`media-file-metrics-snapshot/${file}/${start}/${end}`, `media-file-metrics-snapshot/${file}/${probeStart}/${probeEnd}`),
    fetchCim(`pageviews-per-media-file-monthly/${file}/${wiki}/${cimDate(trendStart.year, trendStart.month)}/${end}`),
    showImage ? fetchCommonsFileImage(file) : Promise.resolve(null),
  ]);
  const snap = snapItems[0] || {};
  const trend = trendItems.map((it) => ({ date: (it.timestamp || '').slice(0, 7), views: it['pageview-count'] ?? 0 }));
  return {
    file,
    resolvedMonth: { year: y, month: m },
    image,
    wikis: snap['leveraging-wiki-count'] ?? 0,
    pages: snap['leveraging-page-count'] ?? 0,
    views: trend[trend.length - 1]?.views ?? 0, // selected month (snapshot window)
    trend,
  };
}

/** 19i. CIM File Traffic — monthly pageview series for one file over a
 *  generous window (up to 24 months); the renderer zooms client-side. */
export async function fetchCimFileTraffic(mediaFile, wiki = 'all-wikis', months = 12, year, month) {
  const file = cleanMediaFileForCim(mediaFile);
  if (!file) throw new Error('Enter a Commons file name');
  const { year: py, month: pm } = await latestCimMonth();
  const y = parseInt(year) || py;
  const m = parseInt(month) || pm;
  const n = Math.min(Math.max(parseInt(months) || 12, 3), 24);
  const end = shiftCimMonth(y, m, 1);
  const start = shiftCimMonth(y, m, -(n - 1));
  const items = await fetchCimTrafficWithHeal(file, wiki, start, end);
  const rows = items.map((it) => ({ date: (it.timestamp || '').slice(0, 7), views: it['pageview-count'] ?? 0 }));
  return { file, rows, resolvedMonth: { year: y, month: m } };
}

/** CIM 500s intermittently on SPECIFIC ranges (internal upstream 503 —
 *  verified 2026-08-13: the exact 12-month window 2025-08→2026-08 500s
 *  deterministically from browsers while curl gets 200; every other
 *  window works, incl. 30-month ones). fetchCimFileTraffic self-heals by
 *  dropping the earliest month and retrying once. */
async function fetchCimTrafficWithHeal(file, wiki, start, end) {
  try {
    return await fetchCim(`pageviews-per-media-file-monthly/${file}/${wiki}/${cimDate(start.year, start.month)}/${cimDate(end.year, end.month)}`);
  } catch (e) {
    if (!String(e.message).startsWith('HTTP 500')) throw e;
    const s2 = shiftCimMonth(start.year, start.month, 1);
    return fetchCim(`pageviews-per-media-file-monthly/${file}/${wiki}/${cimDate(s2.year, s2.month)}/${cimDate(end.year, end.month)}`);
  }
}

/** 20. Wayback Snapshot Gallery — closest capture per requested date.
 *  Fast path: the Wayback availability API (accepts a `timestamp` param,
 *  CORS-enabled ACAO:*). It is however FLAKY from browsers — some
 *  (url, date) lookups deterministically fail CORS or return empty
 *  `archived_snapshots: {}` while a capture exists (verified 2026-08-14:
 *  wikipedia.org@20150615 CORS-fails in-browser / returns {} with a
 *  `memento-location` header proving the capture; the same request later
 *  succeeds). So when availability throws or reports nothing, we fall
 *  back to the authoritative CDX index via the Toolforge same-origin
 *  /api/proxy (CDX itself sends no CORS). Replay pages frame cleanly:
 *  web.archive.org sends no X-Frame-Options / frame-ancestors (verified
 *  2026-08-14), so the card embeds `id_` (toolbar-less) captures in
 *  scaled iframes as screenshot tiles. */
const waybackCache = createTtlCache(10 * 60 * 1000);

/** Nearest capture within ±tol days of `date` via CDX (through the proxy).
 *  The proxy wraps upstream as {status, body} where body is a JSON STRING.
 *  Upstream 5xx (CDX is prone to 503s) or non-JSON → one retry with backoff. */
async function waybackCdxNearest(clean, date, tol) {
  const day = 86400000;
  const from = new Date(new Date(date).getTime() - tol * day).toISOString().slice(0, 10).replace(/-/g, '');
  const to = new Date(new Date(date).getTime() + tol * day).toISOString().slice(0, 10).replace(/-/g, '');
  const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(clean)}&from=${from}&to=${to}&output=json&fl=timestamp,original,statuscode&collapse=timestamp:6&filter=statuscode:200&limit=200`;
  const proxy = `/api/proxy?url=${encodeURIComponent(cdx)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await fetchTextWithRetry(proxy, { timeoutMs: 20000, retries: 1 });
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* not JSON */ }
      let rows = null;
      try { rows = typeof parsed?.body === 'string' ? JSON.parse(parsed.body) : parsed?.body; } catch { /* not a JSON body */ }
      if (rows && Array.isArray(rows) && rows.length >= 2) {
        const cols = rows[0];
        const iTs = cols.indexOf('timestamp');
        const iOrig = cols.indexOf('original');
        const iSt = cols.indexOf('statuscode');
        let best = null;
        for (let r = 1; r < rows.length; r++) {
          const capTs = String(rows[r][iTs] || '');
          if (!/^\d{14}$/.test(capTs)) continue;
          const d = Math.round(Math.abs((new Date(capTs.slice(0, 4), capTs.slice(4, 6) - 1, capTs.slice(6, 8)) - new Date(date)) / day));
          if (!best || d < best.diffDays) best = { capTs, original: rows[r][iOrig], status: rows[r][iSt], diffDays: d };
        }
        if (best) return best;
        return null; // window queried fine but no captures
      }
      // wrapped upstream failure (e.g. {"status":503}) or empty — retry once
    } catch { /* network/proxy error — retry once */ }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
  }
  return null;
}

export async function fetchWaybackGallery(url, dates, toleranceDays = 30, opts = {}) {
  const clean = String(url || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!clean) throw new Error('Enter a website URL');
  const list = String(dates || '')
    .split('\n').map((d) => d.trim())
    .filter((d) => /^\d{4}[-/]?\d{2}[-/]?\d{2}$/.test(d))
    .map((d) => d.replace(/[/]/g, '-'))
    .slice(0, 24); // cap the request fan-out
  if (!list.length) throw new Error('Enter dates (YYYY-MM-DD, one per line)');
  const tol = Math.max(parseInt(toleranceDays) || 30, 1);

  // Stale-while-revalidate: a prior successful load paints instantly from
  // localStorage; a fresh load replaces it. On total network failure, stale
  // rows are returned with `stale: true` so the gallery never shows an all-
  // failed board after one success.
  const lsKey = `wikibento-wayback:${clean}|${list.join(',')}|${tol}`;
  const cached = readWaybackCache(lsKey);
  const isFresh = !opts.force && cached && Date.now() - cached.ts < 60 * 60 * 1000;
  if (isFresh) return cached.payload;

  try {
    // Primary: ONE server-side batch lookup (authoritative CDX, no CORS,
    // nearest-per-date computed server-side). Same-origin, so it works on
    // the Toolforge deployment; 404s on plain static hosts → fallback.
    const batchUrl = `/api/wayback-gallery?url=${encodeURIComponent(clean)}&dates=${encodeURIComponent(list.join(','))}&tolerance=${tol}${opts.force ? '&force=1' : ''}`;
    const batchText = await fetchTextWithRetry(batchUrl, { timeoutMs: 25000, retries: 1 });
    const batch = JSON.parse(batchText);
    if (batch && Array.isArray(batch.rows)) {
      if (batch.rows.some((r) => r.available)) {
        const payload = { url: clean, rows: batch.rows };
        writeWaybackCache(lsKey, payload);
        return payload;
      }
      // upstream wholly unavailable right now — serve stale if we have it
      if (cached) return { ...cached.payload, stale: true };
      return { url: clean, rows: batch.rows };
    }
  } catch { /* endpoint absent (static host) or failed — fall through */ }

  // Fallback: per-date availability API (browser-native, CORS) with the
  // authoritative CDX-through-proxy rescue for the flaky lookups.
  const rows = await Promise.all(list.map(async (date) => {
    const ts = date.replace(/[-/]/g, '');
    const api = `https://archive.org/wayback/available?url=${encodeURIComponent(clean)}&timestamp=${ts}`;
    let closest = null;
    try {
      const text = opts.force
        ? await fetchTextWithRetry(api, { timeoutMs: 10000, retries: 1 })
        : await waybackCache.get(api, () => fetchTextWithRetry(api, { timeoutMs: 10000, retries: 1 }));
      let data = {};
      try { data = JSON.parse(text); } catch { /* not JSON — treat as no capture */ }
      closest = data?.archived_snapshots?.closest;
    } catch { /* CORS/network — fall through to CDX */ }
    if (!closest || !closest.available) {
      // availability said no (or threw): CDX is authoritative — try it.
      try {
        const viaCdx = await waybackCdxNearest(clean, date, tol);
        if (viaCdx) {
          const { capTs, original, status, diffDays } = viaCdx;
          const row = {
            date,
            available: true,
            withinTolerance: diffDays <= tol,
            diffDays,
            timestamp: capTs,
            captureDate: `${capTs.slice(0, 4)}-${capTs.slice(4, 6)}-${capTs.slice(6, 8)}`,
            status,
            snapshotUrl: `https://web.archive.org/web/${capTs}/${original || clean}`,
            replayUrl: `https://web.archive.org/web/${capTs}id_/${clean}`,
          };
          return row;
        }
      } catch { /* proxy unavailable (e.g. plain static host) — graceful tile */ }
      return { date, available: false, lookupFailed: true };
    }
    const capTs = String(closest.timestamp);
    const captureDate = `${capTs.slice(0, 4)}-${capTs.slice(4, 6)}-${capTs.slice(6, 8)}`;
    const diffDays = Math.round(Math.abs((new Date(captureDate) - new Date(date)) / 86400000));
    const snapshotUrl = String(closest.url).replace(/^http:\/\//i, 'https://');
    return {
      date,
      available: true,
      withinTolerance: diffDays <= tol,
      diffDays,
      timestamp: capTs,
      captureDate,
      status: closest.status,
      snapshotUrl,
      replayUrl: `https://web.archive.org/web/${capTs}id_/${clean}`,
    };
  }));

  const payload = { url: clean, rows };
  if (rows.some((r) => r.available)) writeWaybackCache(lsKey, payload); // only cache partial wins
  if (!rows.some((r) => r.available) && cached) return { ...cached.payload, stale: true }; // total failure → serve stale
  return payload;
}

const WAYBACK_LS = 'wikibento-wayback-cache';

function readWaybackCache(key) {
  try {
    const all = JSON.parse(localStorage.getItem(WAYBACK_LS) || '{}');
    const hit = all[key];
    return hit ? { ts: hit.ts, payload: hit.payload } : null;
  } catch { return null; }
}

function writeWaybackCache(key, payload) {
  try {
    const all = JSON.parse(localStorage.getItem(WAYBACK_LS) || '{}');
    all[key] = { ts: Date.now(), payload };
    // keep the cache small: drop entries older than 7 days
    for (const k of Object.keys(all)) {
      if (Date.now() - all[k].ts > 7 * 24 * 60 * 60 * 1000) delete all[k];
    }
    localStorage.setItem(WAYBACK_LS, JSON.stringify(all));
  } catch { /* storage full/unavailable — cache is best-effort */ }
}


// ── MinT machine translation (Wikimedia Language team) ─────────────
// POST https://translate.wmcloud.org/api/translate — CORS `*` verified
// 2026-09-05 (ACAO:* on POST + OPTIONS preflight). Body fields are
// content / source_language / target_language / format ('text') — NOT
// text/from/to (422 trap). MinT has NO `auto` source detection: the
// source language must be known. Test instance translate.wmcloud.org is
// fine at dashboard scale; keep bulk use ≥1s-paced.
const MINT_API = 'https://translate.wmcloud.org/api/translate';
export const MINT_MAX_CHARS = 8000; // soft cap; longer content is truncated + flagged
const minTCache = createTtlCache(24 * 60 * 60 * 1000); // same text+pair → same translation

export const normalizeLangCode = (s) => String(s || '').trim().toLowerCase().slice(0, 8);

/** Build the MinT POST request — exported for tests (no network). */
export function buildMinTRequest(text, from, to) {
  const content = String(text ?? '').trim();
  const source_language = normalizeLangCode(from) || 'en';
  const target_language = normalizeLangCode(to) || 'es';
  const truncated = content.length > MINT_MAX_CHARS;
  return {
    url: MINT_API,
    body: JSON.stringify({
      content: truncated ? content.slice(0, MINT_MAX_CHARS) : content,
      source_language,
      target_language,
      format: 'text',
    }),
    truncated,
  };
}

/** Parse a MinT success payload — exported for tests. */
export function parseMinTResponse(json) {
  return {
    translation: String(json?.translation ?? ''),
    model: json?.model ?? null,
    from: json?.sourcelanguage ?? null,
    to: json?.targetlanguage ?? null,
    seconds: typeof json?.translationtime === 'number' ? json.translationtime : null,
  };
}

/** Translate text via MinT (browser-direct; CORS verified 2026-09-05). */
export async function fetchMinTTranslation(text, from = 'en', to = 'es') {
  const { url, body, truncated } = buildMinTRequest(text, from, to);
  return minTCache.get(body, async () => {
    let raw;
    try {
      raw = await fetchTextWithRetry(url, { method: 'POST', body, timeoutMs: 60000, retries: 1, withBody: true });
    } catch (e) {
      if (e instanceof Error && /^HTTP 422/.test(e.message)) {
        throw new Error('MinT: this language pair is not supported — check translate.wmcloud.org/api/languages');
      }
      throw e;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('MinT: unexpected response');
    }
    const out = parseMinTResponse(parsed);
    out.truncated = truncated;
    if (!out.translation) throw new Error('MinT: empty translation returned');
    return out;
  });
}
