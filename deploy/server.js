/**
 * WikiBento — zero-dependency static server for Toolforge (node20).
 * Serves dist/ with proper MIME types and cache headers.
 * Also resolves short URLs (w.wiki) for the ?config= loader via /api/resolve.
 * Also: /api/ask + /api/ask/session — the "Ask" natural-language widget
 * advisor relay (ISSUE-44). Relays a user's intent to Wikimedia's free
 * LiftWing LLM (llm-qwen36-27b) with a server-owned widget manifest as the
 * system prompt, enforces a narrow contract (no arbitrary system prompts /
 * models), validates widget ids against the manifest, and returns options
 * JSON. See docs/DATA-SOURCES.md §23 and docs/ISSUES.md ISSUE-44.
 * See docs/DEPLOYMENT.md; pattern per the toolforge-nodejs skill.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT || 8765; // Toolforge proxy sets PORT (8000 on k8s)
// On Toolforge: dist/ sits next to server.js in ~/www/js/. Locally, point
// WIKIBENTO_ROOT at the repo's dist/ (e.g. when running from deploy/).
const ROOT = resolve(process.env.WIKIBENTO_ROOT || join(__dirname, 'dist'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

// Tiny in-memory TTL cache for the /api/wayback-gallery endpoint.
const waybackCache = new Map();
const waybackCacheSet = (key, value, ttlMs) => waybackCache.set(key, { value, expires: Date.now() + ttlMs });
const waybackCacheGet = (key) => {
  const hit = waybackCache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) { waybackCache.delete(key); return null; }
  return hit.value;
};

// ── Ask advisor (ISSUE-44): zero-dep relay to the free LiftWing LLM ────────
// Narrow function, not a proxy: the server owns the system prompt (widget
// manifest embedded server-side), fixes model + params, validates output ids.
// Abuse defense (proportionate — upstream is free): Origin allowlist (soft
// gate), per-IP sliding windows + global tripwire, short-lived HMAC session
// token (control token, not secrecy), prompt caps, hash-keyed TTL cache.
const ASK_DISABLED = process.env.WIKIBENTO_ASK_DISABLED === '1';
const ASK_SECRET = process.env.WIKIBENTO_ASK_SECRET || randomBytes(24).toString('hex'); // rotates per restart unless set
const ASK_MODEL = process.env.WIKIBENTO_ASK_MODEL || 'llm-qwen36-27b';
const ASK_FALLBACK_MODEL = 'llm-qwen3-14b';
const ASK_UPSTREAM = (model) => `https://api.wikimedia.org/service/lw/inference/v1/models/${model}/openai/v1/chat/completions`;
const ASK_ALLOWED_ORIGINS = new Set([
  'https://wikibento.toolforge.org',
  'http://localhost:5173', 'http://localhost:4173', 'http://localhost:8765',
]);
const ASK_MAX_PROMPT = 1000; // chars
const ASK_MAX_TOKENS = 700; // output tokens
const ASK_TIMEOUT_MS = 45000;
const ASK_TTL_MS = 10 * 60 * 1000;
const ASK_UA = 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado) ask-relay';

const rlHits = new Map(); // ip -> { min: number[], hour: number[] }
const globalHits = [];    // one-hour window across everyone
const rlLimit = (ip, perMin, perHour, globalHour) => {
  const now = Date.now();
  const trim = (arr, ms) => { while (arr.length && arr[0] < now - ms) arr.shift(); };
  let hit = rlHits.get(ip);
  if (!hit) { hit = { min: [], hour: [] }; rlHits.set(ip, hit); }
  trim(hit.min, 60000); trim(hit.hour, 3600000); trim(globalHits, 3600000);
  if (hit.min.length >= perMin || hit.hour.length >= perHour || globalHits.length >= globalHour) {
    return Math.max(1, Math.ceil((60000 - (now - (hit.min[0] || now))) / 1000));
  }
  hit.min.push(now); hit.hour.push(now); globalHits.push(now);
  return 0;
};
const ipOf = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
const sha = (s) => createHmac('sha256', ASK_SECRET).update(String(s)).digest('hex');

const readBody = async (req) => {
  const chunks = [];
  for await (const c of req) {
    chunks.push(c);
    if (chunks.reduce((n, x) => n + x.length, 0) > 8192) throw new Error('body too large');
  }
  return Buffer.concat(chunks).toString('utf8');
};

// Session token: base64url({ip, exp}) + '.' + base64url(HMAC). IP-bound,
// 30-min expiry; rotating ASK_SECRET invalidates every outstanding token.
const issueToken = (ip) => {
  const payload = Buffer.from(JSON.stringify({ ip, exp: Date.now() + 30 * 60 * 1000 })).toString('base64url');
  const sig = Buffer.from(createHmac('sha256', ASK_SECRET).update(payload).digest()).toString('base64url');
  return `${payload}.${sig}`;
};
const verifyToken = (token, ip) => {
  try {
    const [payload, sig] = String(token).split('.');
    if (!payload || !sig) return false;
    const expect = Buffer.from(createHmac('sha256', ASK_SECRET).update(payload).digest());
    const got = Buffer.from(sig, 'base64url');
    if (expect.length !== got.length || !timingSafeEqual(expect, got)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() && data.ip === ip;
  } catch { return false; }
};

// Widget manifest (build-generated, shipped in dist/). Loaded once at first ask.
let askManifest = null;
let askManifestLoaded = false;
const getManifest = async () => {
  if (!askManifestLoaded) {
    try { askManifest = JSON.parse(await readFile(join(ROOT, 'manifest.json'), 'utf8')); } catch { askManifest = null; }
    askManifestLoaded = true;
  }
  return askManifest;
};
const manifestIds = (m) => new Set((m?.widgets || []).map((w) => w.id));

const askCache = new Map();
const askCacheSet = (k, v) => askCache.set(k, { v, exp: Date.now() + ASK_TTL_MS });
const askCacheGet = (k) => {
  const hit = askCache.get(k);
  if (!hit) return null;
  if (hit.exp < Date.now()) { askCache.delete(k); return null; }
  return hit.v;
};

const ASK_SYSTEM = (m) => `You are the WikiBento widget advisor. WikiBento is a browser dashboard for Wikimedia data (Wikipedia, Commons, Wikidata). A user describes something they want to see or do; you recommend the best widget(s) from the catalog below and return JSON only.

CATALOG (JSON array — ids are exact; use them verbatim, never invent ids):\n${JSON.stringify(m.widgets.map((w) => ({ id: w.id, name: w.name, description: w.description, dataSource: w.dataSource, category: w.category, type: w.type, configFields: w.configFields, defaults: w.defaults })))}`;

const ASK_RULES = `\n\nRULES:\n- Use EXACT widget ids from the catalog. Never invent ids.\n- Recommend 1-3 widgets. Prefer the most specific fit; add a second or third alternative only when genuinely useful (e.g. a precomputed vs live source for the same need).\n- For each option: widgetType = exact id; config = pre-filled with the user's subject using REAL names from the request (article/category/file/page titles — never invent subjects the user did not name; when none is given use a placeholder like "Category:Example" or "Main_Page"); mode = a display mode only if one exists for that widget; reason = one plain-language sentence.\n- If nothing fits, return {"options": []}.\n- Reply with JSON only — no prose, no markdown fences, no commentary.\n\nOUTPUT SCHEMA: ${JSON.stringify({ options: [{ widgetType: 'id', config: { key: 'value' }, mode: 'display mode', reason: 'one sentence' }] })}\n\nEXAMPLES:\nUser: show a random sampling of images from a category\nAssistant: ${JSON.stringify({ options: [{ widgetType: 'categorySize', config: { category: 'Category:Example' }, reason: 'Category Size shows the category breakdown and samples random photos from it.' }] })}\nUser: how often is an image used in a certain category\nAssistant: ${JSON.stringify({ options: [{ widgetType: 'fileUsage', config: { file: 'File:Example.jpg' }, reason: 'File Usage Map lists every wiki page that uses the file.' }, { widgetType: 'cimFileSpotlight', config: { file: 'File:Example.jpg' }, reason: 'CIM File Spotlight shows the file\'s usage wikis and view trend (precomputed).' }] })}`;

const stripThink = (s) => String(s).replace(/<think>[\s\S]*?<\/think>/g, '').trim();

async function callLlm(model, system, user) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ASK_TIMEOUT_MS);
  try {
    const r = await fetch(ASK_UPSTREAM(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': ASK_UA },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
        max_tokens: ASK_MAX_TOKENS,
        temperature: 0.3,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`upstream HTTP ${r.status}`);
    const data = await r.json();
    return stripThink(data?.choices?.[0]?.message?.content || '');
  } finally { clearTimeout(timer); }
}

// Validate + sanitize the model's options: drop hallucinated ids, cap count,
// keep only simple config values (strings/numbers/booleans, bounded length).
function validateOptions(parsed, ids) {
  const out = [];
  for (const o of (Array.isArray(parsed?.options) ? parsed.options : [])) {
    if (out.length >= 5) break;
    const id = String(o?.widgetType || '');
    if (!ids.has(id)) continue;
    const config = {};
    if (o?.config && typeof o.config === 'object' && !Array.isArray(o.config)) {
      for (const [k, v] of Object.entries(o.config)) {
        if (['string', 'number', 'boolean'].includes(typeof v) && String(v).length <= 200) config[k] = v;
      }
    }
    out.push({
      widgetType: id,
      config,
      ...(typeof o?.mode === 'string' && o.mode ? { mode: o.mode.slice(0, 40) } : {}),
      ...(typeof o?.reason === 'string' && o.reason ? { reason: o.reason.slice(0, 240) } : {}),
    });
  }
  return out;
}

const json = (res, status, obj, extra = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(obj));
};
const logAsk = (ip, prompt, n, ms, cached, err) => console.log(JSON.stringify({
  ev: 'ask', ts: new Date().toISOString(), ip: sha(ip).slice(0, 12), plen: String(prompt).length, n, ms, cached: !!cached, err: err || null,
}));

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // ── /api/resolve: expand short URLs (w.wiki) to their final target ──
    // The browser can't follow w.wiki redirects (the target page sends no CORS
    // headers), so this endpoint follows the redirect server-side and returns
    // the final URL. The client then fetches via the Action API / direct fetch.
    if (url.pathname === '/api/resolve') {
      const target = url.searchParams.get('url') || '';
      if (!/^https:\/\//i.test(target)) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'url must be an absolute https:// URL' }));
        return;
      }
      try {
        const r = await fetch(target, { redirect: 'follow' });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ url: r.url || target, status: r.status }));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: `resolve failed: ${e.message}` }));
      }
      return;
    }

    // ── /api/proxy: CORS-enabled fetch proxy (https GET only) ──
    // Some data sources send no CORS headers (e.g. top.hatnote.com), so the
    // browser can't fetch them directly. This endpoint fetches server-side and
    // returns { status, body } wrapped in JSON with ACAO: * so the app (or any
    // origin) can read it. Read-only, https-only.
    if (url.pathname === '/api/proxy') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'GET only' }));
        return;
      }
      const target = url.searchParams.get('url') || '';
      if (!/^https:\/\//i.test(target)) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'url must be an absolute https:// URL' }));
        return;
      }
      try {
        const r = await fetch(target, {
          redirect: 'follow',
          headers: { 'User-Agent': 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado) proxy' },
        });
        const body = await r.text();
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ status: r.status, url: r.url || target, body }));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: `proxy fetch failed: ${e.message}` }));
      }
      return;
    }

    // ── /api/wayback-gallery: batch Wayback snapshot lookup ──
    // Server-side aggregation: the availability API's flakiness from
    // browsers is CORS-specific (intermittent missing ACAO) — server-side
    // it is reliable; the empty-`{}` bug case leaks the capture in the
    // `memento-location` response header, which we recover. CDX (the
    // authoritative index) is a second pass and can be 503-flaky, so it
    // degrades gracefully. In-memory TTL cache (10 min) by url|dates|tol.
    if (url.pathname === '/api/wayback-gallery') {
      const target = url.searchParams.get('url') || '';
      const datesRaw = (url.searchParams.get('dates') || '').split(',').map((d) => d.trim()).filter(Boolean);
      const tolerance = Math.max(parseInt(url.searchParams.get('tolerance')) || 30, 1);
      const clean = target.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      if (!clean || !datesRaw.length || datesRaw.length > 24) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'url and 1-24 dates (YYYY-MM-DD) required' }));
        return;
      }
      const dates = datesRaw.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
      if (!dates.length) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'dates must be YYYY-MM-DD' }));
        return;
      }
      const force = url.searchParams.get('force') === '1';
      const cacheKey = `${clean}|${dates.join(',')}|${tolerance}`;
      const hit = force ? null : waybackCacheGet(cacheKey);
      if (hit) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(hit));
        return;
      }
      const day = 86400000;
      const rowFor = (date, capTs, status, via, original) => {
        const captureDate = `${capTs.slice(0, 4)}-${capTs.slice(4, 6)}-${capTs.slice(6, 8)}`;
        const diffDays = Math.round(Math.abs((new Date(captureDate) - new Date(date)) / day));
        return {
          date,
          available: true,
          withinTolerance: diffDays <= tolerance,
          diffDays,
          timestamp: capTs,
          captureDate,
          status,
          via,
          snapshotUrl: `https://web.archive.org/web/${capTs}/${original || clean}`,
          replayUrl: `https://web.archive.org/web/${capTs}id_/${clean}`,
        };
      };
      try {
        // Pass 1: availability API per date (CORS is irrelevant server-side;
        // timeouts 10 s). Recover the memento-location header when the body
        // omits the capture (the known bug case).
        const rows = await Promise.all(dates.map(async (date) => {
          const ts = date.replace(/-/g, '');
          const api = `https://archive.org/wayback/available?url=${encodeURIComponent(clean)}&timestamp=${ts}`;
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 10000);
            const r = await fetch(api, { signal: ctrl.signal, headers: { 'User-Agent': 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado) wayback-gallery' } });
            clearTimeout(timer);
            const body = await r.json();
            const closest = body?.archived_snapshots?.closest;
            if (closest && closest.available && /^\d{14}$/.test(String(closest.timestamp))) {
              return rowFor(date, String(closest.timestamp), closest.status, 'availability');
            }
            const memento = r.headers.get('memento-location') || '';
            const mTs = (memento.match(/\/web\/(\d{14})/) || [])[1];
            if (mTs) return rowFor(date, mTs, '200', 'memento');
            return { date, available: false };
          } catch {
            return { date, available: false };
          }
        }));
        // Pass 2: CDX span query for the misses (authoritative; 503-flaky →
        // two attempts with backoff; on failure keep the misses as-is).
        const misses = rows.filter((r) => !r.available);
        let cdxRan = false;
        if (misses.length) {
          try {
            const ms = dates.map((d) => new Date(d).getTime());
            const from = new Date(Math.min(...ms) - tolerance * day).toISOString().slice(0, 10).replace(/-/g, '');
            const to = new Date(Math.max(...ms) + tolerance * day).toISOString().slice(0, 10).replace(/-/g, '');
            const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(clean)}&from=${from}&to=${to}&output=json&fl=timestamp,original,statuscode&collapse=timestamp:6&filter=statuscode:200&limit=10000`;
            let cdxRows = null;
            for (let attempt = 0; attempt < 2 && !cdxRows; attempt++) {
              try {
                const r = await fetch(cdx, { headers: { 'User-Agent': 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado) wayback-gallery' } });
                const text = await r.text();
                if (r.ok) {
                  const parsed = JSON.parse(text);
                  if (Array.isArray(parsed) && parsed.length >= 2) cdxRows = parsed;
                }
              } catch { /* retry below */ }
              if (!cdxRows && attempt === 0) await new Promise((r2) => setTimeout(r2, 1200));
            }
            if (cdxRows) {
              cdxRan = true;
              const cols = cdxRows[0];
              const iTs = cols.indexOf('timestamp');
              const iOrig = cols.indexOf('original');
              const iSt = cols.indexOf('statuscode');
              for (const miss of misses) {
                const targetMs = new Date(miss.date).getTime();
                let best = null;
                for (let r = 1; r < cdxRows.length; r++) {
                  const capTs = String(cdxRows[r][iTs] || '');
                  if (!/^\d{14}$/.test(capTs)) continue;
                  const d = Math.round(Math.abs((new Date(capTs.slice(0, 4), capTs.slice(4, 6) - 1, capTs.slice(6, 8)) - targetMs) / day));
                  if (!best || d < best.diffDays) best = { capTs, original: cdxRows[r][iOrig], status: cdxRows[r][iSt], diffDays: d };
                }
                if (best) {
                  const replaced = rowFor(miss.date, best.capTs, best.status, 'cdx', best.original);
                  Object.assign(miss, replaced);
                }
              }
            }
          } catch { /* CDX entirely down — misses stay unavailable */ }
        }
        // Misses that pass 2 couldn't resolve are lookups that FAILED (CDX
        // down) rather than proven absences — mark them so the card can say so.
        for (const miss of misses) {
          if (!miss.available && !cdxRan) miss.lookupFailed = true;
        }
        // Pass 3: per-miss timemap JSON queries (replay-cluster backend —
        // healthy even when the CDX index 503s; same columnar shape:
        // [urlkey, timestamp, original, mimetype, statuscode, digest, length]).
        for (const miss of misses) {
          if (miss.available) continue;
          const from = new Date(new Date(miss.date).getTime() - tolerance * day).toISOString().slice(0, 10).replace(/-/g, '');
          const to = new Date(new Date(miss.date).getTime() + tolerance * day).toISOString().slice(0, 10).replace(/-/g, '');
          try {
            const tm = `https://web.archive.org/web/timemap/json?url=${encodeURIComponent(clean)}&from=${from}&to=${to}`;
            const r = await fetch(tm, { headers: { 'User-Agent': 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado) wayback-gallery' } });
            const text = await r.text();
            if (r.ok) {
              const parsed = JSON.parse(text);
              if (Array.isArray(parsed) && parsed.length >= 2) {
                const targetMs = new Date(miss.date).getTime();
                let best = null;
                for (let row = 1; row < parsed.length; row++) {
                  const capTs = String(parsed[row][1] || '');
                  const st = String(parsed[row][4] || '');
                  if (!/^\d{14}$/.test(capTs) || st !== '200') continue;
                  const d = Math.round(Math.abs((new Date(capTs.slice(0, 4), capTs.slice(4, 6) - 1, capTs.slice(6, 8)) - targetMs) / day));
                  if (!best || d < best.diffDays) best = { capTs, original: parsed[row][2], status: st, diffDays: d };
                }
                if (best) Object.assign(miss, rowFor(miss.date, best.capTs, best.status, 'timemap', best.original));
              }
            }
          } catch { /* timemap down too — miss stays unavailable */ }
        }
        const payload = { url: clean, rows, batch: true };
        if (rows.some((r) => r.available)) waybackCacheSet(cacheKey, payload, 10 * 60 * 1000);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(payload));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: `wayback lookup failed: ${e.message}` }));
      }
      return;
    }

    // ── /api/ask/session: short-lived HMAC control token ──
    if (url.pathname === '/api/ask/session') {
      const origin = req.headers.origin;
      if (origin && !ASK_ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: 'origin not allowed' });
      if (ASK_DISABLED) return json(res, 503, { error: 'Ask is disabled' });
      const ip = ipOf(req);
      const wait = rlLimit(ip, 30, 600, 10000);
      if (wait) return json(res, 429, { error: 'too many session requests', retryAfterSeconds: wait }, { 'Retry-After': String(wait) });
      return json(res, 200, { token: issueToken(ip), expiresIn: 1800 });
    }

    // ── /api/ask: intent → widget recommendations (narrow-function relay) ──
    if (url.pathname === '/api/ask') {
      const origin = req.headers.origin;
      if (origin && !ASK_ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: 'origin not allowed' });
      if (ASK_DISABLED) return json(res, 503, { error: 'Ask is disabled' });
      const ip = ipOf(req);
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'invalid JSON body' }); }
      const prompt = String(body?.prompt || '').trim();
      if (!prompt) return json(res, 400, { error: 'prompt is required' });
      if (prompt.length > ASK_MAX_PROMPT) return json(res, 400, { error: `prompt too long (max ${ASK_MAX_PROMPT} chars)` });
      if (!verifyToken(body?.token, ip)) return json(res, 401, { error: 'invalid or expired session token' });
      const wait = rlLimit(ip, 10, 60, 500);
      if (wait) return json(res, 429, { error: 'Ask rate limit reached — try again in a moment', retryAfterSeconds: wait }, { 'Retry-After': String(wait) });
      const manifest = await getManifest();
      if (!manifest) return json(res, 503, { error: 'Ask is not configured (widget manifest missing)' });
      const ids = manifestIds(manifest);
      const cacheKey = sha(prompt + manifest.version);
      const hit = askCacheGet(cacheKey);
      if (hit) {
        logAsk(ip, prompt, hit.options.length, 0, true);
        return json(res, 200, { ...hit, cached: true });
      }
      const t0 = Date.now();
      const system = ASK_SYSTEM(manifest) + ASK_RULES;
      let content = null;
      try {
        content = await callLlm(ASK_MODEL, system, prompt);
      } catch {
        try { content = await callLlm(ASK_FALLBACK_MODEL, system, prompt); }
        catch (e2) { logAsk(ip, prompt, 0, Date.now() - t0, false, e2.message); return json(res, 502, { error: 'Ask service unavailable — try again in a moment' }); }
      }
      let parsed = null;
      try { parsed = JSON.parse(content); } catch { /* non-JSON reply → no valid options */ }
      const options = validateOptions(parsed, ids);
      const payload = { options, model: ASK_MODEL, manifestVersion: manifest.version };
      askCacheSet(cacheKey, payload);
      logAsk(ip, prompt, options.length, Date.now() - t0, false);
      return json(res, 200, { ...payload, cached: false });
    }

    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = resolve(join(ROOT, pathname));
    // Prevent directory traversal
    if (!filePath.startsWith(ROOT + '/')) {
      res.writeHead(403, { 'Cache-Control': 'no-store' });
      res.end('Forbidden');
      return;
    }
    const data = await readFile(filePath);
    const immutable = pathname.startsWith('/assets/');
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      'Content-Length': data.length,
      // Assets are content-hashed → cache hard. index.html must always
      // revalidate so new builds propagate (old hashed bundles get deleted
      // on rsync --delete; a stale index.html would 404 on them).
      'Cache-Control': immutable
        ? 'public, max-age=604800, immutable'
        : pathname === '/index.html'
          ? 'no-cache'
          : 'public, max-age=3600',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Cache-Control': 'no-store' });
    res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`WikiBento serving dist/ on port ${PORT}`));
