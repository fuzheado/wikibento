import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

/**
 * Dev/preview parity with deploy/server.js: a missing data file must 404, not
 * fall back to index.html. Without this, a typo'd `?config=/nope.json` serves
 * the SPA shell and the loader reports "Not valid JSON: Unexpected token '<'"
 * instead of a clear 404 (production already 404s).
 */
const missingDataFile = (rootDir) => (req, res, next) => {
  const pathname = (req.url || '').split('?')[0];
  if (!/\.json$/i.test(pathname) || pathname.includes('..')) return next();
  const file = join(rootDir, 'public', pathname.replace(/^\/+/, ''));
  if (existsSync(file)) return next();
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end('Not found');
};

const dataFile404 = () => ({
  name: 'data-file-404',
  configureServer(server) { server.middlewares.use(missingDataFile(root)); },
  configurePreviewServer(server) { server.middlewares.use(missingDataFile(root)); },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dataFile404()],
})
