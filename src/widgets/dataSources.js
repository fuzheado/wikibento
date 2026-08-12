/**
 * Data-fetching functions for Wikimedia widgets.
 * Each returns { data, error } — the caller handles rendering.
 */

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const PAGEVIEWS_API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews';
const WIKISTATS_API = 'https://wikistats.wmcloud.org/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

import { createTtlCache } from '../lib/fetchCache';

const WIKISTATS_UA = 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado)';

/** Wikistats CSV is 195 KB and fetched by two widgets — cache it. */
const wikistatsCache = createTtlCache(5 * 60 * 1000);

/**
 * fetch() with a timeout and retry-with-backoff for transient failures
 * (network errors, 5xx). 4xx errors fail fast (retrying won't help).
 * Returns the response text.
 */
async function fetchTextWithRetry(url, { timeoutMs = 15000, retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': WIKISTATS_UA }, signal: controller.signal });
      if (resp.status >= 500 && attempt < retries) {
        lastErr = new Error(`HTTP ${resp.status}`);
      } else if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      } else {
        return await resp.text();
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        lastErr = new Error(`timed out after ${timeoutMs / 1000}s`);
      } else if (!(e instanceof Error && e.message.startsWith('HTTP '))) {
        lastErr = e; // network-level failure (e.g. Safari's "Load failed")
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

/** Fetch a URL through the shared Wikistats cache (in-flight coalescing). */
function fetchWikistatsText(url) {
  return wikistatsCache.get(url, () => fetchTextWithRetry(url));
}

// ── GLAM Category Usage (GLAMorgan-style) ────────────────
// Bounded, browser-native replication of GLAMorgan: a client-side category
// walk (PetScan itself is unusable from browsers — it ignores `max` and
// returns multi-10MB responses for large trees), batched globalusage, and
// pageviews capped at a budget (GLAMorgan needs a server proxy for this).
// See docs/GLAMORGAN-WIDGET.md for the full review.

const GLAM_FILE_BUDGET = 500;   // max files walked from the tree
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
    if (chunk.length && chunkLen + len > MAX_ENCODED) await flush();
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
 */
export async function fetchGlamStats(cfg = {}) {
  const category = cleanCategoryNameForWalk(cfg.category || '');
  const depth = Math.min(Math.max(parseInt(cfg.depth) || 0, 0), MAX_DEPTH);
  const year = Math.min(Math.max(parseInt(cfg.year) || new Date().getFullYear(), 2015), new Date().getFullYear() + 1);
  const month = Math.min(Math.max(parseInt(cfg.month) || 1, 1), 12);
  const budget = Math.min(Math.max(parseInt(cfg.fileBudget) || GLAM_FILE_BUDGET, 50), 1000);
  const topN = Math.min(Math.max(parseInt(cfg.topN) || 5, 1), 10);

  if (!category) throw new Error('Glam stats need a category');

  const exclCats = await collectExcludedCategories(cfg.negcats, parseInt(cfg.negdepth) || 0);
  const files = await collectCategoryFiles(category, depth, budget, exclCats);
  const cappedFiles = files.length >= budget;
  if (!files.length) {
    return {
      category, files: 0, cappedFiles, usedFiles: 0, viewedFiles: 0, pages: 0, wikis: 0,
      totalViews: 0, partialViews: false, monthLabel: `${year}-${String(month).padStart(2, '0')}`,
      top: [], detail: null,
    };
  }

  const usage = await fetchBatchedUsage(files);

  // Distinct ns-0 pages, with a usage-weight for prioritization.
  const pages = {};
  files.forEach(f => {
    for (const u of usage[f] || []) {
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
    pages[k].views = await fetchMonthlyViews(pages[k].wiki, pages[k].page, year, month);
  });

  // Per-file aggregates.
  const fileStats = files.map(f => ({
    title: f,
    used: (usage[f] || []).length > 0,
    views: (usage[f] || []).reduce((s, u) => s + (pages[`${u.wiki}:${u.page}`]?.views || 0), 0),
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
  await attachThumbs(top);

  // Top-file detail: its ns-0 pages with monthly views, top 10.
  let detail = null;
  if (cfg.showDetail !== false && top.length) {
    const rows = usage[top[0].title] || [];
    await pool(rows, 6, async (u) => {
      const k = `${u.wiki}:${u.page}`;
      if (!(k in pages)) pages[k] = { wiki: u.wiki, page: u.page, weight: 0, views: 0 };
      if (!pages[k].viewsFetched) {
        pages[k].views = await fetchMonthlyViews(u.wiki, u.page, year, month);
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
    category,
    files: files.length,
    cappedFiles,
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


async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
