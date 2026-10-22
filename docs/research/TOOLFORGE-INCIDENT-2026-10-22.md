# Toolforge, 2026-10-21/22: two ways a webservice goes down, and how to tell them apart

**Audience:** anyone who runs a Toolforge webservice — and the next agent asked to fix one at 2 a.m.
**Written by:** WikiBento (`tools.wikibento`), after its own outage on 2026-10-22.
**Sibling document:** [TOOLFORGE-PHP-IMAGE-BLOCK-MEMO.md](TOOLFORGE-PHP-IMAGE-BLOCK-MEMO.md) — the PHP half of the same
incident, archived verbatim from the `commons-vibe` project. That memo is the authority on **failure A**; this one adds
**failure B**, which it does not cover.

**Provenance:** every mechanism claim below is either a command whose output is quoted, or marked **INFERRED**. §7 is the
audit table, and it lists three claims that were wrong in earlier drafts of this material — because they were.

---

## TL;DR — from outside, the two failures are identical

Both present as **`503 no healthy upstream`** on every path, and in both cases `toolforge webservice <type> status` says
*running* (it describes the Deployment object, which is happy while every pod is dead).

| | **A — the PHP image is blocked at admission** | **B — the container's home is not written** |
|---|---|---|
| what you see | 503, every path | 503, every path |
| `webservice status` | "running" | "running" |
| `kubectl get pods` | **no pod**, or pod never created; `start`/`restart` fails with a bare **`400`** | pod exists: **`0/1 CrashLoopBackOff`**, restart count climbing |
| `kubectl logs --previous` | *nothing* — it never started | `webservice-runner: line 8: cd: //www/js: No such file or directory` |
| what it is | the registry admission webhook refuses the image | the pod started with `HOME=/`, so the runner cannot find its app |
| fix | change the type (`node20` + a static server) or use the Build Service | recreate the pod (`webservice <type> restart`) |
| see | the sibling memo | §2 below |

**The one-second discriminator: A never gets a pod; B gets a pod that dies instantly.**

---

## 1. Failure A — the PHP image is blocked (not what happened to us)

Summarised only; **read the [sibling memo](TOOLFORGE-PHP-IMAGE-BLOCK-MEMO.md)** for the full treatment, including the
`node20` static-server appendix and the Build Service comparison.

On 2026-10-21/22 the `toolforge-php84-sssd-web:latest` image was blocked at the registry-admission layer during an
emergency PHP security update. Tools running it cannot start at all, and the failure is nearly unreadable:

```bash
sudo -niu tools.<tool> kubectl create deployment probe \
  --image=docker-registry.svc.toolforge.org/toolforge-php84-sssd-web:latest --dry-run=server -o name
# admission webhook "registry-admission.tools.wmcloud.org" denied the request:
#   The following container images are explicitly disallowed:
```

Three traps, all of which cost that project hours:

1. **The CLI hides the reason for a 400.** `webservice start` prints only `requests.exceptions.HTTPError: 400 Client
   Error`. Reproduce with `--dry-run=server` to read the webhook's message.
2. **`status` is not health.** See TL;DR.
3. **`stop` is destructive**: it deletes the Deployment, its pods and its Service; `start` must pass admission again.
   Never stop a working service to "reset" it.

If you have **no `.php` file** you never needed PHP: the image was only serving bytes. `node20` + a ~120-line static
server is the migration (sibling memo, Appendix A), and it is what we run.

---

## 2. Failure B — the container's home is not written (`cd //www/js`)

### 2.1 Read the message like arithmetic, because it is

The Toolforge Node runner is a five-line script, and line 8 is where it dies:

```bash
#!/bin/bash
set -euo pipefail
export PORT="${PORT:-${TOOL_WEB_PORT:-8000}}"
export TOOL_WEB_PORT="$PORT"
cd $HOME/www/js          # ← line 8
exec /usr/bin/npm start
```

The error text is the *argument* to `cd`, which makes it a precise measurement of `HOME`:

| `HOME` | what `cd $HOME/www/js` tries | what bash prints |
|---|---|---|
| unset | — (`set -u` aborts first) | `HOME: unbound variable` |
| `""` | `/www/js` | `cd: /www/js: …` |
| **`/`** | **`//www/js`** | **`cd: //www/js: …`** ← we saw this |
| `/data/project/tool` | `/data/project/tool/www/js` | (works) |

So the doubled slash is not a typo: **`HOME` was `/`, i.e. set to a default**. That distinction matters — an empty home
means "no injection", a `/` means "the image's or the platform's fallback survived", and they point at different fixes.

### 2.2 What the evidence showed (tool `wikibento`, 2026-10-22)

Measured, in the order that ruled things out:

- **The service was healthy for weeks and its config had not changed**: `service.manifest` said `web: node20`, stamped
  `2026-10-16`, image `toolforge-node20-sssd-web:latest` (so §1 does not apply — and a `--dry-run=server` with that image
  is admitted).
- **The failing pod**: `0/1 CrashLoopBackOff`, **77 restarts in 8 h**, and `--previous` showed the same one-line error
  every time. A pod that keeps restarting *in place* is a pod whose environment is frozen at creation.
- **The tool account was blameless**: `www/js/{package.json,server.js,dist,validator-bundle.mjs}` all present on NFS.
- **A probe pod from the same image, in the same namespace, needed no help**: with no env of its own it reported
  `HOME=/data/project/wikibento`, `TOOL_DATA_DIR=/data/project/wikibento`, `uid=57971(tools.wikibento)`,
  `whoami` → `tools.wikibento`, and `/data/project/wikibento` visible. (It also showed Kubernetes service variables like
  `WIKIBENTO_PORT=tcp://10.107.208.5:8000`, which only exist inside a pod — proof the output came from the container and
  not from an over-eager shell.) So image, NSS and storage were all fine.
- **The pod templates are byte-identical**, which is the decisive one:

  | | rev 187 (the failing pod's) | rev 188 (the working one) |
  |---|---|---|
  | created | `2026-10-16T15:42:30Z` | `2026-10-22T21:17:11Z` |
  | image | `…/toolforge-node20-sssd-web:latest` | same |
  | command | `/usr/bin/webservice-runner --type nodejs --port 8000` | same |
  | `workingDir` | `/data/project/wikibento/` | same |
  | `securityContext` | `runAsUser/Group 57971`, `runAsNonRoot` | same |
  | **`env`** | **none** | **none** |

  ⇒ **The CLI does not write `HOME`**, and neither template contains it. **The pod does.** Measured on the running pod:

  ```
  kubectl get pods -o jsonpath='{.items[0].spec.containers[0].env}'
  → TOOL_REPLICA_PASSWORD (secretKeyRef) … TOOL_OPENSEARCH_URL (value)
    HOME = /data/project/wikibento,  TOOL_DATA_DIR = /data/project/wikibento
  ```

  and the same pod carries Toolforge's own annotations `toolforge.org/started-at` and `toolforge.org/mount-storage: all`,
  which neither template has. **So a Toolforge-side step mutates pods as they are created** — admission-time, adding the
  tool's environment, the storage marker and the start stamp. That step is the layer that did not take effect for the pod
  born around 13:15.

  **Why the value was `/`:** a tool-specific value cannot live in a shared image, so with the mutation absent the process
  saw whatever the image itself defaults to — `/`. (Inferred from the only readable half: the absent variable's fallback.)

**INFERRED:** the injection did not happen for the pod created earlier that day. That pod was recreated around 13:15 on
2026-10-22 — most plausibly when the incident evicted it from a node — and every container restart afterwards re-ran the
runner with `HOME=/`. The pod created at 21:17 received the injection and ran normally on its first try.

### 2.3 Why this lasts for hours instead of self-healing

Environment is fixed when a **pod** is created; a `CrashLoopBackOff` container restarts *inside the same pod*, so
admission (where the injection happens) never runs again. The pod will retry the same broken environment forever. Nothing
short of deleting the pod helps — which is why 77 restarts changed nothing and one `restart` fixed it.

### 2.4 The fix, and what to capture first

```bash
# 0. BEFORE fixing, capture the failing state — it is the only copy you get:
sudo -niu tools.<tool> kubectl get deploy <tool> -o yaml       > /tmp/deploy-before.yaml
sudo -niu tools.<tool> kubectl get rs -o wide                  > /tmp/rs-before.txt
sudo -niu tools.<tool> kubectl logs <pod> --previous --tail=40 > /tmp/crash-before.txt

# 1. Recreate the pod (and, if the CLI template has moved on, the template):
sudo -niu tools.<tool> toolforge webservice <type> restart

# 2. Expect 1/1 Ready within seconds:
sudo -niu tools.<tool> kubectl get pods
```

This is non-destructive when your files live on NFS (`public_html/`, `www/`) rather than inside the pod. Here: **1/1
Ready, 0 restarts, in 6 seconds**, and `service.manifest` was re-stamped `2026-10-22 21:17`.

> **Do not `stop` to "reset" it.** `stop` deletes the Deployment and its ReplicaSets — and the ReplicaSet is the artefact
> that makes a proper post-mortem possible (§2.2). We nearly lost ours: we believed the old ReplicaSet was gone, then
> found it surviving as rev 187 and re-measured everything from it. Deleting is easy; explaining is not.

---

## 3. The ladder (use it for either failure)

```bash
# 1. What does the world see?
curl -s -o /dev/null -w '%{http_code}\n' -A "$WIKIMEDIA_USER_AGENT" https://<tool>.toolforge.org/

# 2. Truth about pods (NOT `webservice status`)
sudo -niu tools.<tool> kubectl get pods -o wide

# 3. Why did it die? Both readings matter: the last crash is the one with the message.
sudo -niu tools.<tool> kubectl logs <pod> --tail=40
sudo -niu tools.<tool> kubectl logs <pod> --previous --tail=40

# 4. Classify the signature
#    "cd: //www/js"                        → HOME=/ (§2): recreate the pod
#    "whoami: cannot find name for user ID" → identity/env not resolving (§2 family)
#    nothing at all, and start/restart 400  → admission (§1): test with --dry-run=server
#    a real application stack trace         → your code: the platform got it started

# 5. Rule out the image, NSS and storage with one throwaway pod (same image, no env):
sudo -niu tools.<tool> kubectl run probe --image=<the same image> --restart=Never --command -- \
  /bin/sh -c 'echo HOME=$HOME; id; whoami; ls -ld /data/project/<tool>'
sudo -niu tools.<tool> kubectl logs probe; sudo -niu tools.<tool> kubectl delete pod probe

# 6. Fix, then verify with behaviour — not with a status code:
sudo -niu tools.<tool> toolforge webservice <type> restart
```

---

## 4. Prevention, and what we changed

- **Do not depend on implicit `HOME` in your start path.** The stock runner uses `cd $HOME/www/js`, so if you write your
  own command, use an absolute path (`cd /data/project/<tool>/www/js`) — `workingDir` is already the tool home, so
  `$PWD` is a safer variable than `$HOME`.
- **If your app reads `$HOME`, set it explicitly** in your own start script rather than inheriting it.
- **A `:latest` image can move under a pod template that never changed** (`imagePullPolicy: Always` here). Most of this
  incident's surprises came from things that look constant and are not.
- **After any cluster-wide event, assume one bad pod.** A `restart` is cheap and safe; the expensive part is the hour
  spent trusting `status`.
- The static-server hygiene from the sibling memo still applies if you run Node for a static site: serve `.js` as
  `text/javascript`, never expose the tool home, no `*.md` in the served directory, bind `process.env.PORT`, short cache
  TTLs for un-hashed files.

---

## 5. Verification that actually proves it (we used all four)

```bash
curl -sI https://<tool>.toolforge.org/                  # 200 text/html
curl -sI https://<tool>.toolforge.org/<known asset>     # 200, the Content-Type you expect
# then the app's own end-to-end check against the DEPLOYED build (not the local one), e.g.:
node scripts/board-render-e2e.mjs --base https://<tool>.toolforge.org      # 24/24 here
```

`200` on `/` proves an index was served; it does not prove modules loaded, styles applied or data fetched. A browser
sweep does. Ours: 24 checks, including "no page errors", against production, immediately after the restart.

---

## 6. Open question for WMCS (please answer if you know)

**Was the pod mutator — the admission-time step that stamps `toolforge.org/started-at`, `toolforge.org/mount-storage`
and the `HOME` / `TOOL_DATA_DIR` / `TOOL_*` environment onto each pod — failing for pods created during the 2026-10-21/22
window, and is it configured fail-open (`failurePolicy: Ignore`)?**

A fail-open mutator is the only way a pod can be created with a *required* variable missing and **no error anywhere** — no
event (the namespace's events had expired by the time we looked), no complaint from `webservice status`, nothing in the
logs but the symptom. If it is fail-open, the two cheapest permanent fixes are (i) stop depending on `$HOME` in the runner,
and (ii) have the runner assert its own contract and die saying *why*.

For (i), **`$PWD`, not `${TOOL_DATA_DIR:-$HOME}`**: `TOOL_DATA_DIR` is supplied by the same mutation that supplies `HOME`,
so a fallback to it would fail in exactly the scenario this memo is about. `$PWD` comes from the pod template's
`workingDir: /data/project/<tool>/`, which is in **both** revisions and therefore survives the mutator being absent —
`cd "${PWD}/www/js"` (or the absolute path) cannot fail this way.

Evidence: two pods from **identical** ReplicaSet templates; the one created mid-incident ran with `HOME=/`, the one created
that evening got the full environment. A tool account cannot read the webhook configuration
(`Forbidden: … cannot list resource "mutatingwebhookconfigurations"`), so we cannot see the mechanism, only its effects.

**Prediction, if the theory is right:** any other tool whose pod was **recreated** during that window should show the same
`cd: //www/js` in `kubectl logs --previous`, while tools whose pod predated the incident kept working. That is a cheap,
decisive check for whoever can see more than one namespace — and a bug report worth filing if it holds.

---

## 7. Provenance — what is measured, what is inferred

| claim | basis | status |
|---|---|---|
| 503 on every path; `status` says running | `curl`, `toolforge webservice node20 status` | measured |
| pod `0/1 CrashLoopBackOff`, 77 restarts / 8 h | `kubectl get pods` | measured |
| `cd: //www/js`, identical on every restart | `kubectl logs`, `--previous` | measured |
| `//www/js` ⇒ `HOME=/` (not empty, not unset) | the runner's line 8 + the table in §2.1 | measured |
| tool files and NFS intact | `ls -la` on the tool account, over NFS | measured |
| image, NSS and storage healthy | probe pod: `HOME`, `uid`, `whoami`, `ls -ld`, k8s service vars | measured |
| rev 187 and rev 188 templates identical, both with **no** `env` | `kubectl get rs … -o jsonpath='{.spec.template.spec}'` | measured |
| the tool env appears in runtime pods with **no** `env` in either template, alongside `toolforge.org/started-at` / `toolforge.org/mount-storage` annotations the templates also lack | `kubectl get pods -o jsonpath=…` vs `kubectl get rs -o jsonpath=…` | measured |
| the mutator is admission-time and per-pod (not the CLI, not the template) | the two measurements above | measured |
| the fallback when the mutation is absent is `HOME=/` | the `//www/js` arithmetic; a shared image cannot carry a tool-specific value | **INFERRED** |
| `restart` → 1/1 Ready in ~6 s | `kubectl get pods` after the restart | measured |
| deployed site healthy afterwards | `/`, an asset, the app's own sweep, `docs-facts --live` | measured |
| **the injection failed for pods created in the incident window** | the two pods above; nothing else differed | **INFERRED** |
| **the failing pod was recreated ~13:15 because the incident evicted it** | its 8 h age at ~21:15 | **INFERRED** |
| what the injection mechanism *is* (webhook? controller?) | cannot read it as a tool account | **UNKNOWN** |

**Three claims that appeared in our earlier notes and were wrong — corrected here, kept for the reader's benefit:**

1. "`HOME` was set and **empty**" — no: empty would print `/www/js`; `//www/js` means `/`.
2. "**Today's CLI** writes `HOME` explicitly" — no: rev 187 and rev 188 are identical and neither has `env`. The env is
   injected at pod creation, and a restart helps because it creates a *new pod*, not because the template changed.
3. "The old ReplicaSet is **gone**" — no: it survives as rev 187. That is what let us finish this memo; it is also why §2.4
   says capture first.

---

## 8. Cross-references

- [TOOLFORGE-PHP-IMAGE-BLOCK-MEMO.md](TOOLFORGE-PHP-IMAGE-BLOCK-MEMO.md) — failure A in full (PHP image blocked,
  `node20` static server, Build Service comparison, `.md`/MIME/PORT traps).
- `docs/DEPLOYMENT.md`, section *"When the site answers 503"* — this project's operational recipe.
- `docs/DEPLOYMENTS.md` — the dated record of the outage and the restore.
- `docs/ISSUES.md` — ISSUE-154, with the evidence as it was collected.
- Incidents: <https://wikitech.wikimedia.org/wiki/Incidents>; ask in `#wikimedia-cloud`; `cloud-announce`.
