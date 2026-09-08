# Agent Memo — WikiBento: high-impact widget gaps + issue-tracker conventions

*Prepared 2026-08-15 for the coding agent working on
[github.com/fuzheado/wikibento](https://github.com/fuzheado/wikibento).*
*Repo working copy: `/opt/data/wikibento` (branch `main`).*

---

## 0. Orientation — read these first

| File | Purpose |
|---|---|
| `HANDOFF.md` | Project index, current status, and hard-won gotchas |
| `docs/WIDGET-DEVELOPMENT.md` | **The recipe** for adding a widget (plus the two "constitutions" that gate every build) |
| `src/widgets/index.js` | `WIDGET_TYPES` registry — **the single extension point** |
| `src/widgets/dataSources.js` | All API fetchers |
| `docs/ROADMAP.md` | Prioritized, scheduled plan |
| `docs/WIDGET-IDEAS.md` | Unprioritized idea bank |
| `docs/ISSUES.md` | Issue tracker (see §3 below) |

**Golden rule:** a new widget is **one entry in `WIDGET_TYPES` + (usually) one
fetcher in `dataSources.js`**. No changes to the grid, frame, or panels. Static
widgets omit `fetch` and render `transform(null, config)` directly.

---

## 1. The three planning docs — what goes where

These are **not interchangeable**. Put the right thing in the right file:

| Doc | Holds | Has status? |
|---|---|---|
| `docs/WIDGET-IDEAS.md` | **New widget *proposals*** — unverified/speculative ideas, date-stamped feasibility notes | No |
| `docs/ISSUES.md` | **Bugs, fixes, needed tasks** — concrete defects or scoped work items | Yes (`open`/`in progress`/`done`) |
| `docs/ROADMAP.md` | **Scheduled work** — when an idea graduates to "we're building this" | Implicit |

> ⚠️ Do **not** log new widget *ideas* in `ISSUES.md`. Ideas go in
> `WIDGET-IDEAS.md`; bugs and scoped fixes go in `ISSUES.md`; scheduled builds
> go in `ROADMAP.md` (leaving a pointer in `WIDGET-IDEAS.md`).

---

## 2. High-impact widget candidates (research 2026-08-15 — APIs verified live)

The through-line: **"framing" = a maintained tool already computes the answer
and exposes JSON; WikiBento only supplies the frame** (thin fetcher + transform
+ renderer → grid/persistence/share-URL for free).

### 2a. Bucket A — "framing" widgets (thin fetcher, high value)

| Widget | Data source | Verified | CORS | Effort |
|---|---|---|---|---|
| 📊 **Article Statistics** (one article's watchers/edits/editors/assessment) | `xtools.wmcloud.org/api/page/articleinfo/{proj}/{page}` | ✅ 200, rich JSON | origin-reflecting (no proxy) | S |
| 👤 **Editor Stats** (user edit count, groups, creations) | `xtools.wmcloud.org/api/user/simple_editcount/{proj}/{user}` | ✅ 200 | origin-reflecting | S |
| 📉 **Movement health** family — total traffic / active editors / new registrations over time | Wikimedia REST Metrics `editors/aggregate`, `pageviews/aggregate`, `registered-users/new` | ✅ 200 | `*` | S |
| 🛡️ **Edit-quality / vandalism feed** (goodfaith / damaging / revert-risk) | Lift Wing `enwiki-goodfaith` / `enwiki-damaging` / `enwiki-revertrisk` (POST) | proven via existing quality widget | origin-reflecting | M |
| 📋 **Copyvio check** (does an article contain copied text) | `copyvios.toolforge.org/api.json` | ✅ 200 | `*` | M |
| 🗄️ **Quarry SQL** (saved-query JSON output — the SQL sister to the SPARQL widget) | `quarry.wmcloud.org` run output | ⚠️ needs run-ID + proxy | none | M |

Verified endpoint details (do not re-derive):

- **XTools** (no proxy needed — reflects `Origin`, verified from `wikibento.toolforge.org`):
  - `https://xtools.wmcloud.org/api/page/articleinfo/en.wikipedia.org/Albert%20Einstein` → `{watchers, pageviews, revisions, editors, anon_edits, minor_edits, creator, created_at, modified_at, assessment, …}`
  - `https://xtools.wmcloud.org/api/user/simple_editcount/en.wikipedia.org/Jimbo%20Wales` → `{user_id, live_edit_count, deleted_edit_count, user_groups, global_user_groups, creation_count}`
- **REST Metrics** (all `Access-Control-Allow-Origin: *`):
  - `https://wikimedia.org/api/rest_v1/metrics/editors/aggregate/{proj}/all-editor-types/content/all-activity-levels/monthly/{start}/{end}`
  - `https://wikimedia.org/api/rest_v1/metrics/pageviews/aggregate/{proj}/all-access/all-agents/monthly/{start}/{end}`
  - `https://wikimedia.org/api/rest_v1/metrics/registered-users/new/{proj}/monthly/{start}/{end}`
  - Also available: `edits/aggregate`, `bytes-difference`, `edited-pages`.
  - Note: these are the **movement-level** numbers (total traffic + participation
    decline) — *no existing widget covers them*. One generic time-series fetcher
    (reuse `src/lib/scope.js`) drives the whole family.

### 2b. Bucket B — aspirational (new computation, not a wrapper)

| Widget | Why it matters | Shape |
|---|---|---|
| **Dead-link / reference-rot detector** | maintenance gold — flag 404 citations | extract links → probe Wayback CDX → % dead |
| **Cross-wiki coverage gap** | "what does en have that fr lacks" | langlinks + prose size + section diff |
| **Edit-spike / "happening now"** | real-time edit velocity | EventStreams rate vs. baseline |
| **Citation verifiability score** | Researcher's View pack | ref count, oldest ref, % archived |

### 2c. Build ranking

1. **XTools pair** (Article Statistics + Editor Stats) — ~half a day, verified CORS, instant value
2. **Movement-health family** — one generic fetcher + 3 widgets; makes the traffic/participation decline visible
3. **Lift Wing edit-quality / vandalism feed** — reuses proven plumbing

---

## 3. How to add an issue to `docs/ISSUES.md`

### Format

```markdown
## ISSUE-NN · Short title — **status**

**What:** one line — what's wrong / what's needed (include repro steps or exact
URLs/file:line where useful).

**Why:** root cause or motivation. Reference exact code where known.

**Proposed fix:** concrete approach, or "TBD" if it still needs investigation.
```

### Status lifecycle

| Status | Meaning |
|---|---|
| `**open**` | logged, not started |
| `**in progress**` | actively being worked |
| `**done (commithash)**` | fixed and merged |

### Rules

- **Header is exact:** `ISSUE-NN · Title — **status**` — single spaces around
  the `·` and `—`, and the status is **bolded**.
- **Append at the bottom**, bump `NN` (next free number is **ISSUE-04**).
- **One issue = one defect/task.** Split unrelated things into separate entries.
- On fix, **do not delete the body** — flip the status to `done (hash)` and add a
  `**Fixed YYYY-MM-DD (commithash):** …` line below the `Proposed fix:` (see
  ISSUE-01 / ISSUE-02 as the reference examples).
- Title is a short noun phrase, not a full sentence.

### Copy-paste template

```markdown
## ISSUE-04 · Short title — **open**

**What:**

**Why:**

**Proposed fix:**
```

### Filled example

```markdown
## ISSUE-04 · Wiki Page widget: mobile toggle has no effect on Commons — **open**

**What:** toggling "Mobile view" on a Commons page renders the desktop view.

**Why:** the `?useformat=mobile` parameter is honored by MobileFrontend, which is
not enabled on Wikimedia Commons. See `wikiPage.transform` in
`src/widgets/index.js`.

**Proposed fix:** disable the mobile toggle when `project === 'commons.wikimedia'`
(or fall back to `?useskin=minerva`) and note the limitation in the field label.
```

---

*End of memo.*
