# Deployment

WikiBento is a Vite-built SPA (`dist/`) served by a tiny zero-dependency Node
server (`deploy/server.js`) — the server exists because two features need a
same-origin endpoint that static hosting can't provide:

- `/api/proxy` — top.hatnote.com has **no CORS headers** (Top Wikipedia
  Articles widget)
- `/api/resolve` — w.wiki short-URL expansion for `?config=` links

So the deployment is **node20 webservice on Toolforge**; plain static hosting
works only for dashboards that don't use those two features.

## Local

```bash
npm install
npm run dev          # dev server, HMR, http://localhost:5173
npm run build        # production build → dist/
npm run lint         # oxlint
npx vite preview     # serve the built dist/ at http://localhost:4173
```

## Toolforge (the production deployment)

### SSH — read this first (the #1 gotcha for fresh sessions)

- **SSH with your personal account, NOT the tool account.** `ssh tools.wikibento@dev.toolforge.org`
  fails with `Permission denied (publickey)` — tool accounts are not SSH
  logins. On this machine the personal user is **`alih`**:
  `ssh alih@dev.toolforge.org`
- Tool-level commands (webservice, kubectl) run **inside** that SSH session
  with `sudo -niu tools.wikibento <command>`.
- ⚠️ `become` does **not** work in chained SSH commands (`become X; cmd`
  replaces the shell; the rest runs unbecome'd). Always `sudo -niu` directly.
- In this Pi setup the host is pre-registered in the hosts inventory as
  `tools` (alih@dev.toolforge.org) — `host_exec` on `tools` just works.

### Layout on the tool

```
/data/project/wikibento/www/js/     ← the deployed app
├── server.js                       ← deploy/server.js (copy)
├── package.json                    ← {"type":"module"} for the ESM import
└── dist/                           ← the Vite build (rsync target)
```

The webservice serves `dist/` via `server.js` (root = `~/www/js/`, `ROOT`
defaults to `dist/` next to the server). Do NOT use `~/www/static/` or
`~/public_html/` — those are leftovers from the pre-node20 static era, and the
`static` webservice type no longer exists.

### Deploy (the whole procedure)

```bash
# 1. build
npm run build

# 2. push the build (rsync --delete so stale asset bundles don't linger)
rsync -az --delete dist/ alih@dev.toolforge.org:/data/project/wikibento/www/js/dist/

# 3. restart the webservice
ssh alih@dev.toolforge.org "sudo -niu tools.wikibento webservice --backend=kubernetes node20 restart"
```

If `server.js` / `package.json` changed too (rare), push those as well:

```bash
scp deploy/server.js deploy/package.json alih@dev.toolforge.org:/data/project/wikibento/www/js/
```

### Verify

```bash
# status
ssh alih@dev.toolforge.org "sudo -niu tools.wikibento webservice --backend=kubernetes node20 status"

# logs (startup line: "WikiBento serving dist/ on port 8000")
ssh alih@dev.toolforge.org "sudo -niu tools.wikibento kubectl logs --tail=50 deployment/wikibento"

# live check — the new bundle hash appears in index.html
curl -s https://wikibento.toolforge.org/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'
```

Browser check: open https://wikibento.toolforge.org/ → ✨ Example → confirm
widgets render and the console is clean apart from the known hatnote/WMF
fallback noise. If a deploy "looks missing" after refresh, hard-refresh
(⌘⇧R) — index.html is served `no-cache`, assets are immutable (HANDOFF
gotcha #11).

## Alternative hosts

`dist/` + a server that provides `/api/proxy` + `/api/resolve` (or any CORS
proxy for hatnote) will work anywhere: Netlify functions, GitHub Pages with a
serverless proxy, etc. Without those endpoints, the Top Wikipedia Articles
widget falls back to the WMF Pageviews API (marked "via WMF Pageviews API")
and `?config=` w.wiki links won't resolve — everything else still works.

## Deployment Checklist

- [ ] `npm run build` — no errors
- [ ] Smoke-test `npx vite preview` locally before shipping
- [ ] `rsync` dist/ → the tool (with `--delete`)
- [ ] Restart: `sudo -niu tools.wikibento webservice --backend=kubernetes node20 restart`
- [ ] Verify live: bundle hash in index.html changed; ✨ Example renders;
      `/api/resolve` still answers (`?url=https://w.wiki/TR9R`)
- [ ] New endpoints that need CORS → confirm `origin=*` (Action API) or
      origin-reflection (api.wikimedia.org) before shipping
