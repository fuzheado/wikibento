# Deployment

WikiBento is a Vite-built SPA (`dist/`) served by a tiny zero-dependency Node
server (`deploy/server.js`). The server exists because some features cannot run
in a browser — three classes now, inventoried in [PROXIES.md](PROXIES.md):

- **Relays for CORS-less upstreams** — `/api/proxy` (top.hatnote.com), and the
  same-origin relays that hold limits down: `/api/staticmap`, `/api/petscan`,
  `/api/wayback-gallery`
- **The Ask relay** — `/api/ask` (+ `/api/ask/session`): the LLM key and the
  prompt live server-side, never in the bundle
- **The door, server-side** — `/api/validate` (the board checker) and `/mcp`
  (the Model Context Protocol endpoint, [MCP.md](MCP.md)): no upstream at all,
  they run the app's own bundled code

Two of those cannot ship as plain JS: `/api/validate` and `/mcp` execute
`deploy/validator-bundle.mjs`, built by `npm run build:validator` from the
app's own validator and share codecs. **That bundle is a deploy artefact, like
`dist/` and `server.js`** — a deploy that updates the app but not the bundle
leaves the door diagnosing boards against a catalog the UI no longer has.

So the deployment is **node20 webservice on Toolforge**; plain static hosting
works only for dashboards that use none of the server-side features above.

## Local

```bash
npm install
npm run dev          # dev server, HMR, http://localhost:5173
npm run build        # production build → dist/ (runs the full test suite first)
npm run build:validator  # deploy/validator-bundle.mjs ← the app's own validator + share codecs
npm run guide:board  # regenerate public/board-guide.md after touching a format doc
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
├── validator-bundle.mjs            ← deploy/validator-bundle.mjs (copy; NOT part of dist/)
├── package.json                    ← {"type":"module"} for the ESM import
└── dist/                           ← the Vite build (rsync target; includes manifest.json and board-guide.md)
```

The webservice serves `dist/` via `server.js` (root = `~/www/js/`, `ROOT`
defaults to `dist/` next to the server). Do NOT use `~/www/static/` or
`~/public_html/` — those are leftovers from the pre-node20 static era, and the
`static` webservice type no longer exists.

### Deploy (the whole procedure)

```bash
# 1. build — the app (suite + vite), then the validator bundle
npm run build
npm run build:validator

# 2. push the build (rsync --delete so stale asset bundles don't linger)
rsync -az --delete dist/ alih@dev.toolforge.org:/data/project/wikibento/www/js/dist/

# 3. restart the webservice
ssh alih@dev.toolforge.org "sudo -niu tools.wikibento webservice --backend=kubernetes node20 restart"
```

**`server.js` and the two bundles it loads are NOT part of `dist/`.** Whenever
the server side changed — a relay, `/api/ask`, `/api/validate`, `/mcp`, or
anything in `src/` the validator bundle absorbs — push them *in the same
deploy*, or production runs a new app against an old brain:

```bash
scp deploy/server.js deploy/validator-bundle.mjs alih@dev.toolforge.org:/data/project/wikibento/www/js/
```

`node scripts/build-validator.mjs --check` fails when the bundle is older than
`src/` — if it fails, the deploy is not shippable yet. (Only `package.json`
changes, which are rare, need the third `scp`.)

### Verify

```bash
# status
ssh alih@dev.toolforge.org "sudo -niu tools.wikibento webservice --backend=kubernetes node20 status"

# logs (startup line: "WikiBento serving dist/ on port 8765"; the k8s proxy sets PORT=8000)
ssh alih@dev.toolforge.org "sudo -niu tools.wikibento kubectl logs --tail=50 deployment/wikibento"

# live check — the new bundle hash appears in index.html, and docs-facts agrees
curl -s https://wikibento.toolforge.org/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'
node scripts/docs-facts.mjs --live    # the bundle HANDOFF claims is what production serves

# the door, as a client would speak to it (read-only half of both suites)
node scripts/relay-guard-e2e.mjs --base https://wikibento.toolforge.org
node scripts/mcp-e2e.mjs --base https://wikibento.toolforge.org
```

Browser check: open https://wikibento.toolforge.org/ → ✨ Example → confirm
widgets render and the console is clean apart from the known hatnote/WMF
fallback noise. If a deploy "looks missing" after refresh, hard-refresh
(⌘⇧R) — index.html is served `no-cache`, assets are immutable (HANDOFF
gotcha #11).

## Alternative hosts

`dist/` + a server providing the routes above will work anywhere: Netlify
functions, GitHub Pages with a serverless proxy, etc. Without them, the
degradation is per-feature and the app says so in each card: the relays'
widgets show their relay-failure state, `?config=` w.wiki links won't resolve,
and there is no Ask advisor and no door (`/api/validate`, `/mcp`). Everything
else — every widget whose upstream sends CORS headers — still works.

## Deployment Checklist

- [ ] `npm run build` — no errors (the suite and the vite build run inside it)
- [ ] `npm run build:validator` — and `node scripts/build-validator.mjs --check` passes
- [ ] Smoke-test `npx vite preview` locally before shipping
- [ ] `rsync` dist/ → the tool (with `--delete`)
- [ ] Server side changed? `scp deploy/server.js deploy/validator-bundle.mjs` **in the same deploy**
- [ ] Restart: `sudo -niu tools.wikibento webservice --backend=kubernetes node20 restart`
- [ ] If the change touches board state or the URL: `AUDIT_BASE=https://wikibento.toolforge.org npm run smoke:url`
      — driving the deployed app is the only way to catch a claim that silently stops being true
- [ ] Verify live: bundle hash in index.html changed **and** `docs-facts --live` passes;
      `relay-guard-e2e --base` and `mcp-e2e --base` green; ✨ Example renders;
      `/api/resolve` still answers (`?url=https://w.wiki/TR9R`)
- [ ] New endpoints that need CORS → confirm `origin=*` (Action API) or
      origin-reflection (api.wikimedia.org) before shipping
- [ ] Touched a format doc? The served guide was regenerated (`npm run guide:board`) —
      the gate that catches forgetting this is `docs-facts`, and it fires *after* merges
