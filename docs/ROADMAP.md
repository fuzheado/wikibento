# Roadmap — Next Steps

Status as of the 2026-08-12 audit: **all 7 widgets verified live**, build clean,
app fully functional as a v1. This document orders what comes next.

## Phase 0 — Quick Wins (½ day, no new features)

Housekeeping found during the code audit. Safe for a first PR.

- [ ] **Remove unused `recharts` dependency** (package.json) — never imported, kept
      out of the bundle only by tree-shaking
- [ ] **Delete dead assets** `public/favicon.svg` + `public/icons.svg` (favicon is
      an inline data URI in index.html)
- [ ] **Fix grid resize reflow** — `window.innerWidth - 40` is computed once per
      render; add a `resize` listener (ARCHITECTURE #1)
- [x] **Fix Category Size subtitle heuristic** — done 2026-08-12: subtitle now
      derived from `config.wiki` (ARCHITECTURE #2)
- [x] **Sanitize user input** — done 2026-08-12: `Category:` / `File:` prefixes
      stripped in fetchers (DATA-SOURCES §3, §5)
- [x] **Asset-aware widget titles** — done 2026-08-12: renderers display transform
      `title`/`subtitle`; headers show `labelFromConfig(config)` live; pageviews
      trend mode fixed via `getRenderer` dispatch
- [ ] **Add an Error Boundary** around each grid item so one crashing widget
      can't kill the dashboard (ARCHITECTURE #9)

## Phase 1 — v2 Features (the "What's Not Here" list, evaluated)

| Idea | Effort | Impact | Notes |
|---|---|---|---|
| ~~**Import dashboard.json**~~ | S | High | **Done 2026-08-12** — ⬆ Import panel (file + paste) with `validateDashboard()`: precise per-field errors, non-fatal warnings, atomic apply. Also added ✨ Example dashboard (all 7 widget types) and the **JSON format spec** (docs/JSON-FORMAT.md + dashboard.schema.json + `version: 1` on exports) |
| **Shared fetch cache** | S | Medium | Wiki Stats + Top 10 fetch the same 333-row CSV independently. A 5-minute in-memory TTL cache keyed by URL halves API load and speeds refresh |
| **Time-range selectors** | M | High | Pageviews widget is hardcoded to 30 days. Add `days` config (7/30/90/365) — RESTBase supports arbitrary ranges. Natural fit for the config panel |
| **Editable widget titles** | S | Low | `_title` exists but no configField renders it (ARCHITECTURE #7) |
| **CORS proxy** | M | Low (today) | Not needed while all sources are CORS-enabled. Only required if a non-Wikimedia source (e.g. a scraped site) becomes a widget. Toolforge can host a tiny `fetch`-proxy webservice if it ever matters |
| **Multi-device sync via on-wiki JSON** | M–L | High | Store the dashboard at `User:Fuzheado/dashboard.json` on-wiki; fetch on load, push on change. Requires OAuth for writes — see below |
| **User authentication / OAuth** | L | High | OAuth 2.0 (MediaWiki) enables on-wiki sync, personal dashboards, and eventually save-to-page. See the `wikimedia-auth-oauth` skill |
| **Widget marketplace** | L | Medium | Community-contributed widgets need a schema-versioned registry (current configs have no version field) and a hosting story. Premature until the registry API stabilizes — but adding `schemaVersion` to exports now costs nothing |

## Phase 1.5 — Efficiency at Scale

- [ ] **Batch query planning + shared fetch layer** — multi-title Action API queries
      (50 titles/request) so hundreds of categories/files cost ~1 call per 50; TTL
      fetch cache with in-flight coalescing; concurrency cap + refresh jitter;
      visibility-based fetching. Full analysis in
      [SCALABILITY.md](SCALABILITY.md) (batching verified live 2026-08-12).

- [ ] **CIM-first mode for GLAM widget** — try the precomputed Commons Impact
      Metrics snapshot (`category-metrics-snapshot`) first; on 404 (category not
      on the allow-list) fall back to the live walk. Registered categories get
      instant exact numbers at any scale; the widget subtitle marks
      "precomputed" vs "live". Registration process documented in the
      `wikimedia-commons` skill and docs/GLAMORGAN-WIDGET.md.

## Phase 2 — Polish & Platform

- [x] **URL-shareable dashboards** — done 2026-08-12: 🔗 Share button copies a
      self-contained `#/d/<base64url>` link; `?config=<url>` loads a hosted
      dashboard.json (wiki pages fetched via the Action API, CORS-enabled hosts
      direct). URL > localStorage > defaults priority; error banner + fallback
- **Widget duplication** ("duplicate this widget") and **copy/paste configs**
- **Edit `refreshSeconds` from the config panel** — it's in `defaults` but has no
  configField today
- **Escape-to-close + focus trap** on AddWidgetPanel (ARCHITECTURE #13)
- **Config validation** — clamp `topN` to 1–50, reject empty domains/categories
  (ARCHITECTURE #14)
- **Layout import via drag-drop of dashboard.json** onto the page
- **Light theme toggle** — CSS custom properties are already fully tokenized (`:root`)
- **i18n** — widget names/labels are hardcoded English; the registry makes this a
  message-table swap when wanted

## Phase 3 — Stretch

> Widget proposals and links live in **[WIDGET-IDEAS.md](WIDGET-IDEAS.md)** —
> including Wiki Edu dashboard/impact widgets (campaign overview, topic stats,
> quality distributions). Several are blocked on the CORS proxy (Phase 1):
> dashboard.wikiedu.org is CORS-enabled, impact.wikiedu.org is not.


- More widgets: article quality (Lift Wing/ORES), recent changes stream
  (EventStreams), category intersection (PetScan), page assessment
  (PageAssessments), watchlist-style "your dashboard" with OAuth
- PWA: manifest + service worker for offline dashboards (pageview data caches well)
- Automated smoke tests (Playwright) against the live API endpoints to catch upstream
  format changes — especially the naive Wikistats CSV parser (ARCHITECTURE #5)

## Sequencing Suggestion

Phase 0 first (zero-risk cleanup, teaches the codebase). Then, in order:
**Import** → **time-range selectors** → **shared cache** → **URL-shareable dashboards**
→ decide on OAuth/on-wiki sync (biggest design commitment; revisit after the others
are in, since the export format will have stabilized).
