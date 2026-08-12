# Widget Ideas — Idea Bank

The backlist of proposed widgets and dashboard ideas, with links and
feasibility notes. This is the **unprioritized idea bank** — the prioritized
plan lives in [ROADMAP.md](ROADMAP.md); when an idea gets scheduled, move it
there. Add new ideas freely; keep the entry format.

**Format:** `## Idea` → links, what it shows, data source + feasibility
(verified facts preferred — note the date you checked), effort, notes.

**Feasibility patterns seen so far:**
- ✅ **Public JSON + CORS `*`** — browser widget directly (best case)
- ⚠️ **Public JSON, no CORS** — needs a proxy (the ROADMAP "CORS proxy" item) or a server-side fetcher
- 🔒 **Auth required (401)** — not usable for public widgets without OAuth; note if it's an option later
- 🧩 **HTML-only** — iframe embed is the cheap fallback, not a real widget

---

## Wiki Edu Campaign Overview (dashboard.wikiedu.org)

- **Links:** [Campaign overview](https://dashboard.wikiedu.org/campaigns/250_by_2026/overview) · [Full site](https://dashboard.wikiedu.org/explore)
- **What it shows:** per-campaign stats — courses, student editors, words
  added, articles edited/created, references, article views. A StatCard/GLAMCard
  style widget per campaign slug (e.g. `250_by_2026`).
- **Feasibility (verified 2026-08-12):**
  - ✅ `https://dashboard.wikiedu.org/campaigns/{slug}.json` — public JSON, **CORS `*`** (200 for `250_by_2026`)
  - ✅ `https://dashboard.wikiedu.org/campaigns/{slug}/users.json` — public, CORS `*` (28 KB: users, roles, courses)
  - 🔒 `…/campaigns/{slug}/courses.json` → **401 "Please sign in"** — course-level data is auth-only
- **Effort:** S–M (campaign metadata widget is small; the full stats table needs the users/courses surface explored)
- **Notes:** campaign JSON includes title/description/start-end dates; check for
  an embedded stats object. Wiki Edu's dashboard is a Rails app — `{resource}.json`
  is the general pattern to probe.

## Wiki Edu Explore / Campaign Directory

- **Links:** [Explore](https://dashboard.wikiedu.org/explore)
- **What it shows:** browse/filter the campaign catalog (Wiki Education's
  programs, e.g. 250_by_2026) — a "campaigns near you" or directory widget.
- **Feasibility (verified 2026-08-12):** ✅ `https://dashboard.wikiedu.org/campaigns.json`
  exists and is CORS-enabled, but returned `{"campaigns":[]}` without query
  params — the filter surface (term/year/etc.) needs discovery from the Explore
  page's JS bundle.
- **Effort:** M
- **Notes:** lower priority than the campaign overview widget; the explore page
  itself is a discovery UI, not a stats page.

## Wiki Edu Impact — Topic Overview

- **Links:** [Impact home](https://impact.wikiedu.org/) · [Topic 9 — Women geologists](https://impact.wikiedu.org/topics/9)
- **What it shows:** headline numbers and charts for a *topic* (a Wikidata-query-
  backed set of articles): `articles_count` (436), `user_count` (116,712),
  `timepoints_count` (25), dates, slug. **The numbers are already computed** —
  the widget fetches and displays, no computation (the user's key insight:
  "without needing to do any computation").
- **Feasibility (verified 2026-08-12):**
  - ✅ `https://impact.wikiedu.org/api/topics/{id}` — public JSON (rich metadata)
  - ⚠️ **No CORS headers** — browser fetch blocked; needs the Toolforge CORS
    proxy (ROADMAP Phase 1) or a server-side fetcher
- **Effort:** S once a proxy exists; S–M if we add the CORS proxy first
- **Notes:** topic descriptions embed the source Wikidata query (e.g.
  `https://w.wiki/8viv`) — a natural link-out. Time-series charts likely via
  timepoint endpoints (`timepoints_count: 25` — endpoints to be discovered in
  the minified bundle).

## Wiki Edu Impact — Topic Sections (articles / revisions / quality)

- **Links:** [Articles](https://impact.wikiedu.org/topics/8#articles) ·
  [Revisions](https://impact.wikiedu.org/topics/8#revisions) ·
  [WP10 quality](https://impact.wikiedu.org/topics/8#wp10)
- **What it shows:** per-topic tabular/chart sections — the topic's article
  list, revision activity over time, and WP10 article-quality distribution
  (FA/A/B/C/Start/Stub — RankingCard material).
- **Feasibility (verified 2026-08-12):** section endpoints not yet identified —
  my probes (`/api/topics/9/articles|revisions|wp10|quality|timepoints`) all
  404'd; the app bundle is minified (2.3 MB) and hides the paths. Needs one
  session of network-tab archaeology, or a quick Ask for the API on
  dashboard.wikiedu.org's talk/support.
- **Effort:** M (includes endpoint discovery)
- **Notes:** same no-CORS caveat as the topic overview — proxy required.

---

## How to Add an Idea

Copy the format above: **title, links, what it shows, verified feasibility
(date-stamped), effort, notes**. If you checked APIs, record exact endpoints
and CORS status — that's what makes an idea actionable later. When an idea is
scheduled, move it into [ROADMAP.md](ROADMAP.md) with the same detail and leave
a pointer here.
