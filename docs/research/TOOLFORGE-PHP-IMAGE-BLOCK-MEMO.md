<!-- Archived verbatim from commons-vibe on 2026-10-22, with permission of its author (the same maintainer).
     It is ANOTHER PROJECT'S memo about the 2026-10-21/22 Toolforge PHP incident, kept here because it is the best written
     record of that incident's failure modes. It is a HISTORICAL RECORD: do not edit it to match this project. What this
     project actually hit — the OTHER failure mode of the same incident, a pod created with HOME=/ and crashlooping on
     `cd //www/js` — is written up with its measurements in docs/research/TOOLFORGE-INCIDENT-2026-10-22.md, and the
     operational recipe is in docs/DEPLOYMENT.md ("When the site answers 503"). -->

# MEMO — Toolforge's PHP images are blocked; static tools should move to `node20`

**To:** agents and maintainers of Toolforge tools that serve static files through the
`php8.4` (lighttpd) webservice image
**From:** CommonsVibe (tool `commons-vibe`), after surviving this the hard way
**Date:** 2026-10-22 · **Status:** actionable now · **Effort:** ~30 min per tool (estimate, not measured)
**Auditability:** every mechanism claim is backed by a source in **§8**, and
`deploy/verify-memo-claims.sh` re-derives them (fails loudly when one drifts).

---

## TL;DR

On 2026-10-22 Wikimedia Cloud Services **blocked `toolforge-php84-sssd-web:latest`** at
the registry-admission layer as part of the 2026-10-21/22 PHP security update. A tool
running that image cannot be started at all:

- running pods go `0/1 CrashLoopBackOff` and never become Ready (`503 no healthy upstream`),
- after a `stop`, `start` fails with an unhelpful **`400 Bad Request`**,
- `toolforge webservice status` is useless here — it keeps saying *"running"*.

If your tool has **no `.php` file**, it never needed PHP: the image was only serving
bytes. The fix is to declare what actually runs — `node20` + a ~120-line dependency-free
static server. **No application changes.**

---

## 1. Am I affected? (2 minutes)

```bash
# 1. Do you actually have any PHP? (0 = you don't need the PHP image)
find /data/project/<tool>/public_html -name '*.php' | wc -l

# 2. What type is the service, and is the pod actually Ready?
sudo -niu tools.<tool> toolforge webservice <type> status      # may lie: says "running"
sudo -niu tools.<tool> kubectl get pods                        # this tells the truth

# 3. Is the container even launching?
sudo -niu tools.<tool> kubectl logs <pod> --previous --tail=20
```

The smoking gun — ask the API why a deployment is refused (creates nothing):

```bash
sudo -niu tools.<tool> kubectl create deployment probe \
  --image=docker-registry.svc.toolforge.org/toolforge-php84-sssd-web:latest \
  --dry-run=server -o name
```

If you get **`admission webhook "registry-admission.tools.wmcloud.org" denied the
request: The following container images are explicitly disallowed`**, this memo applies.

**Symptom decoding**

| What you see | What it means |
|---|---|
| `503 no healthy upstream`, all paths | ingress has no Ready endpoint — the pod, not your code |
| `toolforge webservice status` → *running* | the Deployment object exists; the pod is not Ready |
| `start` / `restart` → `400 Bad Request` | admission webhook refused the image; the CLI hides the reason |
| `whoami: cannot find name for user ID …` then exit | container could not resolve the tool account (infra/NSS) — not your app |
| pod gone entirely after `stop` | `stop` **deletes** the deployment, pods and service; `start` recreates them (and must pass admission again) |

---

## 2. Decide

| Your situation | Do this |
|---|---|
| Static files only, want to keep `*.toolforge.org` | **`node20` + tiny static server** ← what we did, fastest |
| Want a self-contained image, or have real build steps | **Build Service** (buildpacks — **not** Dockerfiles) — detail, costs and recipe in **§4** |
| Don't need the `toolforge.org` hostname | `~/www/static` → `tools-static.wm*` — no container at all (per docs; we could not test it during the outage, and it changes your URL) |
| Need it up today, can't migrate | wait for WMCS to re-allow the image |

**Do not** reflexively switch to `php8.2` to dodge the block: it currently passes
admission, but it is still a PHP image, still a language you don't use, and the block
may well widen. If you are considering it, ask in `#wikimedia-cloud` first.

**Why `node20` is the honest answer:** the container then describes what executes. Node
runs your server; your server serves files. Nothing is pretending.

---

## 3. Option A — `node20`: migrate (~30 min)

### 3.1 Files that must exist on the tool account

Toolforge conventions (not optional): `npm start` is run from **`$HOME/www/js`**, and the
server must bind to **`process.env.PORT`** (`8000` on Kubernetes; any other port is
unreachable — the ingress ignores it).

```
$HOME/www/js/package.json     {"type":"module","start":"node server.js"}
$HOME/www/js/server.js        the static server (appendix A)
$HOME/public_html/            your existing static files, unchanged
```

### 3.2 Create them

```bash
ssh you@dev.toolforge.org 'sudo -niu tools.<tool> sh -c "mkdir -p /data/project/<tool>/www/js"'
cat package.json | ssh you@dev.toolforge.org 'sudo -niu tools.<tool> sh -c "cat > /data/project/<tool>/www/js/package.json"'
cat server.js    | ssh you@dev.toolforge.org 'sudo -niu tools.<tool> sh -c "cat > /data/project/<tool>/www/js/server.js"'
```

Piping through `sudo -niu tools.<tool>` is what keeps the files owned by the tool account
(verified: `ls -l` after a pipe shows `tools.<tool> tools.<tool>`).

### 3.3 Test the server locally *before* switching

```bash
PORT=8199 PUBLIC_DIR="$PWD" node server.js        # then, in another shell:
curl -sI http://127.0.0.1:8199/            # 200 text/html
curl -sI http://127.0.0.1:8199/app.js      # 200 text/javascript   ← must not be octet-stream
curl -s --path-as-is 'http://127.0.0.1:8199/%2e%2e%2f%2e%2e%2fetc%2fpasswd'   # 403
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8199/nope            # 404
```

Then load the app in a browser against `:8199` and confirm **0 console errors** — a wrong
MIME type breaks `<script type="module">` even though every response is "200".

### 3.4 Switch the webservice type

```bash
sudo -niu tools.<tool> toolforge webservice node20 start
sudo -niu tools.<tool> kubectl get pods          # expect 1/1 Running
cat /data/project/<tool>/service.manifest        # should now say: web: node20
```

`service.manifest` is rewritten by the CLI; never edit it by hand. Once it says
`node20`, future `start`/`restart` calls keep using it.

### 3.5 Verify the live site

```bash
for p in "" app.js style.css; do
  printf '%-12s ' "/$p"
  curl -s -o /dev/null -m 25 -A "$WIKIMEDIA_USER_AGENT" \
    -w '%{http_code} %{content_type}\n' "https://<tool>.toolforge.org/$p"
done
```

Expect `200 text/html`, `200 text/javascript`, `200 text/css`. Then a browser smoke test
(tiles/content render, version badge, console clean, no failed requests).

---

## 4. Option B — Build Service (buildpacks): self-contained, non-Node, slower deploys

A correction first, because it changes the plan if you were budgeting for it:
**Toolforge's Build Service does not accept Dockerfiles.** It is
[Cloud Native Buildpacks](https://buildpacks.io/) — you hand it a **git URL**, it detects
the language and builds the image into the Toolforge registry. `toolforge build start
[SOURCE_GIT_URL]` is the signature: a URL, not a local directory, and there is no
`--dockerfile` flag (verified with `toolforge build start --help`). So the shape is
"buildpacks build per deploy", not "docker build per deploy".

### What it buys you

- **Self-contained:** your files are baked into the image, not read from NFS per request.
  No `--mount=all`, no shared-storage dependency, no long-lived process to keep healthy,
  and no drift between "what is in git" and "what is in public_html".
- **Reproducible and pinnable:** buildpack versions (`-L` / `--use-deprecated-versions`),
  apt packages via a buildpack, a fixed runtime.
- The route the docs recommend for anything non-trivial, and there is an **official static
  recipe**: `Help:Toolforge/My first static tool` uses a **uwsgi stub** — `uwsgi.ini` with
  `check-static html/`, `static-index index.html`, and a one-line `Procfile`
  (`web: uwsgi uwsgi.ini`). uwsgi serves the files and runs no application code.

### What it costs

Every row carries where it comes from. Wall-clock latency is deliberately **not** claimed in
these cells — it is unmeasured (§4 closing note).

| | Build Service | `node20` + file server (Option A) | Basis |
|---|---|---|---|
| Deploying a change | commit → `toolforge build start <url>` → wait for the build → `toolforge webservice restart` — **a build per deploy** | pipe one file over SSH — **no build step**, no restart | Build Service: docs ("to update the code later, trigger a new build"); node: verified here |
| Where files live | a **git repo** the builder clones (`https://gitlab.wikimedia.org/toolforge-repos/<repo>`) | tool account `public_html/`, piped over SSH | Build Service: docs; node: verified here |
| Extra files | `Procfile` (+ `uwsgi.ini` or equivalent) | `server.js` + `package.json` | docs / this repo |
| Runtime involved | the web server the buildpack installs (uwsgi in the official static recipe) | Node, ~120 lines you own | docs / this repo |
| Rebuild on every content change | **yes** | no | docs ("trigger a new build") / verified here |
| Local preview | `docker run -e PORT=8000 -p 8000:8000 …`, or `toolforge webservice buildservice shell` | `node server.js` | docs / verified here |
| Coupled to | build pipeline, registry, build **quota** | pod health, and the image staying allowed | docs (`toolforge build quota`) + judgement |

Commands: `toolforge build start <git-url>` (streams logs; `-D` to detach),
`toolforge build logs <id>`, `toolforge build list`, `toolforge build quota`,
`toolforge build cancel|delete|clean`. Start the service once with
`toolforge webservice buildservice start --mount=none`; or put `type: buildservice` and
`mount: none` in `service.template` so a plain `toolforge webservice start` picks it up.
Subsequent deploys are `build start` → `webservice restart`.

### When to choose it

Choose B when the site must be immutable/reproducible, when there are **real build steps**
(a bundler, an asset pipeline, generated files), when you want **no NFS mount**, or when
"the image is exactly what we ship, byte for byte" is worth more than a fast deploy.

For a handful of static files with no build step — this tool — the rebuild tax dominates,
which is why A won. But the choice is close, and B is the better long-term answer if the
site ever grows a build.

**Two honest caveats.** (1) I did not run a build for this tool, so I have **no measured
build duration**, and the docs do not quote one — measure it with
`toolforge build start <url>` before committing to this route. (2) During the
2026-10-21/22 incident the build side was itself degraded (*"image builds for the
production registry remain offline"*, per the incident page), so B is not automatically
immune to the class of outage that started this memo.

## 5. Traps that cost the most time (in order of pain)

1. **The CLI hides the reason for a 400.** `toolforge webservice start` prints only
   `requests.exceptions.HTTPError: 400 Client Error`. Always reproduce with
   `kubectl create … --dry-run=server` to read the webhook message.
2. **`status` ≠ health.** `"Your webservice … is running"` describes the Deployment
   object, not the pod. `kubectl get pods` is the source of truth.
3. **`stop` is destructive.** It removes pods, deployment and service; `start` rebuilds
   them and must pass admission. Don't stop a working service to "reset" it.
4. **`whoami: cannot find name for user ID …` is infra, not you.** That's the container
   failing to resolve the tool account. Nothing in your docroot fixes it.
5. **Never run `webservice`/`kubectl` as yourself.** The kubeconfig lives under the tool
   account; as yourself you get `unable to read client-cert …/tf-<some-other-tool>`.
   `become <tool>; cmd2` also silently runs `cmd2` as the *original* user over SSH —
   use `sudo -niu tools.<tool>`.
6. **`PORT` is not optional.** Bind to `process.env.PORT`; hardcoding `8080` gives you a
   healthy pod nobody can reach.
7. **`.js` must be served as a JavaScript type** (`text/javascript`), or ES modules fail.
8. **Don't set a long `Cache-Control` on unhashed assets.** `app.js` with
   `max-age=31536000` means your next deploy looks broken for a day. Use short TTLs for
   app files, `no-cache` for HTML, and reserve `immutable` for genuinely versioned vendor
   files.
9. **Only expose your docroot.** Serve the static directory, never the tool home — a
   naive `express.static($HOME)` publishes `.bash_history`, `replica.my.cnf`, logs.
10. **`*.md` must never land in the served directory.** With a PHP/lighttpd image
    `.htaccess` was merely ignored; a Node server hands out every file it finds.
11. **Type names differ from the docs and skills.** This cluster offers `node18` and
    `node20` only — the `node22` examples in some skill files do not exist here.
12. **Static app files need no restart; `server.js` does.** A file server that reads from
    disk per request picks up new `app.js` immediately.
13. **Build Service and `tools-static` are not drop-in swaps** — they change the build
    pipeline or the hostname. Confirm the URL contract survives before choosing them.

---

## 6. Per-project checklist

```text
[ ] find public_html -name '*.php' | wc -l        → 0 (else: stop, you need PHP for real)
[ ] confirm the 400 is the admission webhook     → --dry-run=server
[ ] add www/js/package.json + www/js/server.js    → appendix A, adapt PUBLIC_DIR
[ ] local matrix passes (200s, MIME, 403, 404, browser console clean)
[ ] toolforge webservice node20 start             → pod 1/1 Running
[ ] service.manifest says web: node20
[ ] live 3-way SHA256 + browser smoke
[ ] update DEPLOY/HANDOFF docs: type, layout, restart semantics, *.md rule
[ ] note the date + reason in the project's history, so the next agent knows why
```

---

## 7. Upstream documentation gaps worth filing

These are real, and they are how tools end up in PHP's blast radius while never running
PHP:

1. Toolforge has **no `static` pre-built image**, and the *default* image is lighttpd+PHP.
   `Help:Toolforge/Web` recommends the Build Service broadly and lists pre-built images by
   language, but nothing tells a static-site author "don't use the PHP image for this".
2. `Help:Toolforge/Web#Serving static files` still cites the legacy
   `tools-static.wmflabs.org` domain and says nothing about the Cloud VPS dependency.
3. `toolforge webservice` could pass the API's error body through — today every admission
   rejection is an opaque `400`.

---

## 8. Provenance — audit this memo instead of trusting it

This section exists because an earlier draft of this material claimed the Build
Service takes a **Dockerfile**. It does not, and that claim was written from a
generic mental model rather than from the source. Every mechanism claim below now
has a line you can check; `deploy/verify-memo-claims.sh` re-derives them and fails
loudly when one drifts.

| Claim | Backed by | Checked |
|---|---|---|
| Build Service is Cloud Native Buildpacks; builds from a git URL; `Procfile` required | `Help:Toolforge/Building container images` (wikitech raw) **+** `toolforge build start --help` | 2026-10-22 |
| There is **no** `--dockerfile`; Docker is only a local runner for the built image and for `pack` | same two sources | 2026-10-22 |
| The official static recipe is a **uwsgi stub** (`check-static`, `static-index`, `Procfile`) | `Help:Toolforge/My first static tool` | 2026-10-22 |
| No `static` pre-built type; `node18`/`node20` exist | `toolforge webservice --help` | 2026-10-22 |
| `$HOME/www/static` → `tools-static.wmflabs.org/<tool>` | `Help:Toolforge/Web#Serving static files` | 2026-10-22 |
| `PORT` from env; `npm start` from `$HOME/www/js` | `Help:Toolforge/Node.js` | 2026-10-22 |
| lighttpd docroot `$HOME/public_html`; `$HOME/error.log` | `Help:Toolforge/Web/Lighttpd` | 2026-10-22 |
| `php8.4` image blocked by the registry admission webhook; exact refusal text | `kubectl create … --dry-run=server` output | 2026-10-22 |
| `whoami: cannot find name for user ID …`; 53 restarts | `kubectl get pods`, `kubectl logs --previous` | 2026-10-22 |
| `stop` deletes the deployment entirely | `kubectl get deploy,pods,svc` → "No resources found" | 2026-10-22 |
| Our tool runs `node20`, live 200s | `service.manifest` + `curl` | 2026-10-22 |
| Incident status: Toolforge "partially restored"; PHP-image pods failing | `Incidents/2026-10-21 PHP security update` (wikitech, fetched in full) | 2026-10-22 |
| The 2026-10-20 offline date; "image builds … remain offline" | WMF *Diff* post + `cloud-announce` thread — **search-result summaries only, not fetched** | 2026-10-22 |
| Appendix A server behaves as described | extracted from this memo and executed locally: `/` → 200 `text/html`, `/app.js` → 200 `text/javascript`, `/nope` → 404, `%2e%2e%2f…` → 403, `POST` → 405 | 2026-10-22 |

**What is *not* evidence here, and is labelled as such:** the effort estimate
("~30 min per tool", an estimate), the "Coupled to" cell's judgement half, and the
"when to choose" guidance. **No wall-clock number is claimed anywhere for either
route** — deploy latency and Option B's build duration are unmeasured, and §4 says so
where it matters.

**How to distrust this memo correctly.** Ask "which line of which page?" for any
mechanism claim. If the answer is not in the table above, treat it as unverified —
including anything I say in chat, which is not auditable at all. The durable
artefacts (this file, `DEPLOY.md`, `deploy/README.md`) are where the provenance
lives; that is deliberate.

Re-run the audit:

```bash
./deploy/verify-memo-claims.sh            # offline, cites cache/ + asserts each claim
./deploy/verify-memo-claims.sh --refresh  # re-fetch the wiki sources first
./deploy/verify-memo-claims.sh --remote   # also re-check the live tool, CLI flags, HTTP
./deploy/verify-memo-claims.sh --selftest # prove the checker can report absence
```

## Appendix A — reference static server (zero dependencies)

Adapted from this tool (`deploy/www/js/server.js`). Change `PUBLIC_DIR`/default root if
your files are not in `$HOME/public_html`. Keep: `PORT`, the MIME map (especially `.js`),
the containment check, and short cache TTLs.

```js
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve as pathResolve, sep } from "node:path";
import { homedir } from "node:os";

const PORT = Number.parseInt(process.env.PORT || "8765", 10);
const ROOT = pathResolve(process.env.PUBLIC_DIR || join(homedir(), "public_html"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",   // required for <script type="module">
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".ico": "image/x-icon", ".woff2": "font/woff2",
};

function cacheControl(p) {
  if (p === "/" || p.endsWith(".html")) return "no-cache";
  if (p.startsWith("/vendor/")) return "public, max-age=604800";
  return "public, max-age=300";
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, {
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(body);
};

createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method Not Allowed", { Allow: "GET, HEAD", "Cache-Control": "no-store" });
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return send(res, 400, "Bad Request", { "Cache-Control": "no-store" });
  }
  if (pathname.includes("\0")) return send(res, 400, "Bad Request", { "Cache-Control": "no-store" });

  const filePath = pathResolve(ROOT, "." + pathname);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    return send(res, 403, "Forbidden", { "Cache-Control": "no-store" });
  }

  let target = filePath;
  try {
    if ((await stat(target)).isDirectory()) target = join(target, "index.html");
  } catch {
    return send(res, 404, "Not found", { "Cache-Control": "no-store" });
  }

  try {
    const body = await readFile(target);
    const headers = {
      "Content-Type": MIME[extname(target).toLowerCase()] || "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": cacheControl(pathname),
    };
    res.writeHead(200, headers);
    return req.method === "HEAD" ? res.end() : res.end(body);
  } catch {
    return send(res, 404, "Not found", { "Cache-Control": "no-store" });
  }
}).listen(PORT, () => console.log(`static server on :${PORT}, serving ${ROOT}`));
```

---

## Appendix B — the incident, briefly

- **2026-10-20/21:** Wikimedia Cloud Services took Cloud VPS (all `*.wmcloud.org`,
  `*.wmflabs.org`) and parts of Toolforge offline for an emergency PHP security update.
  The 20th is from the WMF *Diff* post and the `cloud-announce` thread **as quoted in
  search results — those two pages were not fetched in full**, so verify the date there
  before relying on it. The "partially restored" status below *was* read directly on the
  Wikitech incident page.
- **2026-10-21/22:** `*.toolforge.org` partially restored; PHP-image-backed tools kept
  failing — pods exit at `whoami`, and creating/updating a Deployment that references the
  PHP image is refused by the registry admission webhook.
- **Status page:** <https://wikitech.wikimedia.org/wiki/Incidents> (the 2026-10-21 PHP
  security update incident), `#wikimedia-cloud`, `cloud-announce` mailing list.
- **Observation while writing this:** `php8.4` blocked; `php8.2`, `node20` and `trixie`
  images still passed a server-side dry run on 2026-10-22. Treat that as a snapshot, not
  a promise.
