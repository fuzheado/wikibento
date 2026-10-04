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

## Pull-from-GitHub alternatives: the Build Service and Components

The rsync flow above pushes files **to** the tool. Toolforge also has two mechanisms that build **from a Git
repository** — the same push-to-deploy shape most modern platforms use. Both are real alternatives; neither is
switched on for this tool today, and the reasons are stated so the decision can be revisited deliberately.

### The Build Service (`toolforge build start <repo-url>`)

Builds a container image from a public Git repo (GitHub verified) with Cloud Native Buildpacks — Node is
detected, `npm install` and build scripts run **inside the builder**, not on the tool's slow NFS:

```bash
ssh alih@dev.toolforge.org            # then, as the tool user:
sudo -niu tools.wikibento toolforge build start https://github.com/fuzheado/wikibento
sudo -niu tools.wikibento toolforge webservice buildservice start --mount=none -m 1Gi
sudo -niu tools.wikibento toolforge webservice buildservice logs -f
```

Needs at the repo root:

- **`Procfile`** — one line: `web: node deploy/server.js` (the server already binds `$PORT`, which the k8s
  proxy sets to 8000, so the server itself needs no change)
- **A lean build path.** This is the real obstacle: the buildpack runs the repo's `build` script, and ours runs
  the *entire test suite* (755 tests, browser smoke, the validator build) — some of it needs playwright, which is
  deliberately not a devDependency. An image build would run that too, and fail. Deploying this way needs a
  split — e.g. a `build` that is only `npm ci && npx vite build && npm run build:validator`, with the suite kept
  for CI — which is a small change but a real one, because the suite must still gate the *push*, not the build.
- Nothing else: `--mount=none` is right for us (the server reads only repo files — `dist/`, the CIM allow list,
  the bundles), and secrets already arrive as env vars (`toolforge envvars create …`).

Redeploy = another `build start` + `buildservice restart`. **No rollback exists** — keep the previous image ref
pinned if a revert might be needed.

### Toolforge Components (push-to-deploy, beta)

The direction the platform is standardising on: the build + run definition lives in the repo, and a `git push`
triggers build and deploy. Needs a `Procfile` (as above), a `toolforge.yaml` component config, and a deployment
token (`toolforge components deploy-token create`); GitHub has no shared CI pipeline, so the deploy trigger is a
manual/CI `curl -X POST` to `https://api.svc.toolforge.org/components/v1/tool/$TOOL/deployment?token=$TOKEN`.

**Status: beta** — upstream still says "we don't recommend using it for production services", there is **no
rollback**, and the alerting service it unlocks (5xx/timeout/restart emails) is opt-in from October 2026.
Attractive the day this tool wants `git push` deploys and email alerts; not before it leaves beta.

### Why the rsync flow is the default here

Three artefacts whose hashes `docs-facts --live` can verify against production, no image layer between "the tests
passed" and "what production serves", no beta dependency, and deploys take seconds. The Build Service becomes
worth its setup cost the day deploys hurt — several a day, or a second maintainer without SSH habits.

## Running it elsewhere (not on Toolforge)

Nothing in WikiBento needs Wikimedia premises, an account, or an API key — the data path is client-driven, and
the one server file is **zero-dependency Node** (`deploy/server.js`, builtins only). There are two tiers:

**Tier 1 — static hosting only** (GitHub Pages, Netlify, S3, any nginx): build `dist/` and serve it. Every widget
whose upstream sends CORS headers works from any origin — the Action API (`origin=*`), `api.wikimedia.org`
(**including the LiftWing ML services** — article quality and friends are called straight from the browser), WDQS
and QLever SPARQL, the Internet Archive. What degrades is exactly the six relay routes, per feature:

| without the server | what you lose |
|---|---|
| `/api/staticmap` | map widgets — the map service refuses browser-shaped requests; cards show their relay-failure state |
| `/api/proxy` | the hatnote Top-articles widget **falls back to the WMF Pageviews API automatically** ("via WMF Pageviews API"); gallery-usage falls back to a batched self-walk |
| `/api/resolve` | `#/z/` short links won't resolve (`#/d/` links carry the full board and still work) |
| `/api/petscan` | PetScan-backed widgets — the relay also enforces the size cap, so it is not merely CORS |
| `/api/wayback-gallery` | the Wayback gallery (the CDX side sends no CORS) |
| `/api/ask` | the Ask advisor (the relay owns the pacing, the caps and the server-side prompt — see below) |
| `/api/validate` · `/mcp` | the door — a board can't be checked or handed over by URL (the doctor still runs locally: `npm run check:board`) |

Each degradation is *announced in the card*, not a blank: the app was built to be borrowed like this.

**Tier 2 — static + the companion server.** `node deploy/server.js` runs on any Node host (a VPS, Render, Fly,
a container) and serves `dist/` plus all eight routes; point a reverse proxy at it, or let it serve directly.
No credentials are needed for anything: the Ask advisor relays to **LiftWing's free LLM** (no key — the relay
exists to hold the pacing, the caps and the server-side manifest prompt; LiftWing's own ~90 req/h per-IP limit
then follows *your* host's IP). The etiquette — descriptive User-Agent, per-client caps, byte ceilings — is
built in and env-tunable (`WIKIMEDIA_USER_AGENT`, `RELAY_*`, `VALIDATE_*`, `MCP_*`); set
`WIKIMEDIA_USER_AGENT` to *your* contact, since the requests now come from your address.

**One config whoever serves `dist/` must reproduce:** `index.html` with `Cache-Control: no-cache`, `/assets/*`
immutable. Serving both cacheable is the stale-bundle trap — deploys look missing until a hard refresh
(HANDOFF gotcha #11).

The rsync flow above is just Tier 2 where the "any Node host" happens to be Toolforge.

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
