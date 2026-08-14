/**
 * WikiBento — zero-dependency static server for Toolforge (node20).
 * Serves dist/ with proper MIME types and cache headers.
 * Also resolves short URLs (w.wiki) for the ?config= loader via /api/resolve.
 * See docs/DEPLOYMENT.md; pattern per the toolforge-nodejs skill.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
      const cacheKey = `${clean}|${dates.join(',')}|${tolerance}`;
      const hit = waybackCacheGet(cacheKey);
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
