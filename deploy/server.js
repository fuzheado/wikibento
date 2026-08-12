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
      'Cache-Control': immutable
        ? 'public, max-age=604800, immutable'
        : 'public, max-age=3600',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Cache-Control': 'no-store' });
    res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`WikiBento serving dist/ on port ${PORT}`));
