#!/usr/bin/env node
/**
 * Remote browser daemon — lets another machine run Playwright browser tests
 * (notably WebKit, which Playwright only publishes for macOS / Linux x64)
 * against browsers hosted here.
 *
 * WHY THIS EXISTS (2026-09-05): the WikiBento browser constitution wants
 * Chromium + Firefox + WebKit. The primary WikiButler host is a linux-arm64
 * container where Playwright publishes NO WebKit (and no patched-Firefox)
 * build. macOS DOES ship Playwright WebKit natively — so this daemon runs on
 * the Mac (or any Playwright-capable machine) and exposes `launchServer`
 * WebSocket endpoints over HTTP. The test runner connects with
 * `browserType.connect(wsEndpoint)` — full local API, remote engine.
 *
 * USAGE (on the host machine, e.g. the M1 Mac):
 *   npm i playwright-core            # or rely on the repo/homebrew install
 *   npx playwright-core install webkit   # once, if not already installed
 *   node scripts/remote-browser-daemon.mjs [--engine webkit] [--port 9322]
 *
 *   GET  /status        → JSON of configured engines + running wsEndpoints
 *   POST /launch        → body {"engine":"webkit"} → launches on demand,
 *                         replies {"engine","wsEndpoint","browserVersion"}
 *   GET  /health        → 200 "ok"
 *
 * SECURITY: this opens real browsers to the network. Bind to localhost or a
 * private interface (--host), or set DAEMON_TOKEN — when set, every request
 * must carry ?token= or an `x-daemon-token` header.
 *
 * Engines are kept alive once launched (one browser per engine) and closed on
 * SIGINT/SIGTERM. Multiple clients may connect() to the same wsEndpoint.
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import os from 'node:os';

const require = createRequire(import.meta.url);

// Resolve playwright-core the same way scripts/browser-matrix.mjs does:
// repo node_modules first, then the global playwright CLI bundle (homebrew/mac
// or npm -g). Add a local fallback with a clear install hint.
let pw;
const candidates = [
  () => require('playwright-core'),
  () => require('/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core'),
];
for (const tryLoad of candidates) {
  try { pw = tryLoad(); break; } catch { /* next */ }
}
if (!pw) {
  console.error('playwright-core not found. Install it:  npm i playwright-core');
  process.exit(1);
}

const args = process.argv.slice(2);
const arg = (name, fb) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fb;
};
const HOST = arg('host', process.env.DAEMON_HOST || '0.0.0.0');
const PORT = parseInt(arg('port', process.env.DAEMON_PORT || '9322'), 10);
const TOKEN = process.env.DAEMON_TOKEN || '';
const ENGINE_NAMES = arg('engines', 'webkit,chromium,firefox').split(',').map((s) => s.trim()).filter(Boolean);

const servers = new Map(); // engine -> BrowserServer
const launching = new Map(); // engine -> Promise

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return '127.0.0.1';
}

async function launch(engine) {
  const bt = pw[engine];
  if (!bt || typeof bt.launchServer !== 'function') {
    throw new Error(`engine '${engine}' unavailable in this playwright-core (have: ${Object.keys(pw).filter((k) => ['chromium', 'firefox', 'webkit'].includes(k)).join(', ')})`);
  }
  if (launching.has(engine)) return launching.get(engine);
  const p = (async () => {
    if (!servers.has(engine)) {
      console.log(`[daemon] launching ${engine}…`);
      const server = await bt.launchServer({ headless: true });
      servers.set(engine, server);
      console.log(`[daemon] ${engine} ready → ${server.wsEndpoint()}`);
    }
    return servers.get(engine);
  })();
  launching.set(engine, p);
  try { return await p; } finally { launching.delete(engine); }
}

const authorized = (req) => !TOKEN || req.url.includes(`token=${TOKEN}`) || req.headers['x-daemon-token'] === TOKEN;

const server = http.createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  if (!authorized(req)) return send(401, { error: 'unauthorized (DAEMON_TOKEN is set)' });
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/health') return send(200, { ok: true });
    if (url.pathname === '/status') {
      const status = {};
      for (const e of ENGINE_NAMES) {
        const s = servers.get(e);
        status[e] = s ? { running: true, wsEndpoint: s.wsEndpoint() } : { running: false };
      }
      return send(200, status);
    }
    if (url.pathname === '/launch' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const { engine } = JSON.parse(body || '{}');
      if (!ENGINE_NAMES.includes(engine)) {
        return send(400, { error: `engine must be one of: ${ENGINE_NAMES.join(', ')}` });
      }
      const s = await launch(engine);
      const version = s.browser?.version?.() ?? null;
      return send(200, { engine, wsEndpoint: s.wsEndpoint(), browserVersion: version });
    }
    return send(404, { error: 'not found' });
  } catch (e) {
    return send(500, { error: String(e.message || e) });
  }
});

async function shutdown() {
  console.log('\n[daemon] shutting down…');
  await Promise.all([...servers.values()].map((s) => s.close().catch(() => {})));
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, HOST, () => {
  console.log(`[daemon] remote browser daemon on http://${HOST}:${PORT}`);
  console.log(`[daemon] engines configured: ${ENGINE_NAMES.join(', ')}`);
  console.log(`[daemon] client flow: GET /status → POST /launch {"engine":"webkit"} → browserType.connect(wsEndpoint from the reply)`);
  console.log(`[daemon] this machine's LAN IP: ${lanIp()}`);
  if (!TOKEN) console.log('[daemon] ⚠ no DAEMON_TOKEN set — anyone who can reach this port can drive these browsers');
});
