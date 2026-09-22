# Working in this repo — notes for an agent

Pi loads this file automatically in this directory, so it is the place for rules that must hold *while working here*,
as opposed to what the project is (`README.md`) or where it stands (`HANDOFF.md`). It is deliberately short: the
explanations live in `docs/`, and this is the list of things that have already cost somebody a day.

Conventions that apply to every project (macOS shell quirks, the three `package.json` references a new test file
needs, commit messages in a file, the append-only docs) are in the global `~/.pi/agent/AGENTS.md` — not repeated here.

## Which build are you testing?

- **Always pass `--base` to the browser sweep.** The default is **production**
  (`https://wikibento.toolforge.org`), which is right for checking a deploy and wrong for everything else. A run
  without it reported a change as 22/24 clean while production was still serving the previous bundle — so it was
  measuring the last release. The first honest run found a bug that threw on every render.
  - Local build: `npm run build && npx vite preview --port 4173`, then `--base http://localhost:4173`.
  - The script prints the base it is using, and warns when that is the implicit production default. Read that line.

## The widget registry (`src/widgets/index.js`)

- **It is an object keyed by id, not an array.** Never delete from `id: 'x',` to the next `id: 'y',`: the key
  survives and the following entry loses its own. One such deletion silently made `commonsGallery` into `fileUsage`,
  with 588 of 609 tests still passing. `tests/renderer-registry.test.mjs` asserts every key is its own `id`.
- **A retired widget type id must keep resolving** (`widgetDef`), and its config must keep meaning what it meant.
  Prefer inferring from the fields a board already carries over rewriting boards on load: a link in the wild is not
  yours to migrate.
- **…and de-duplicate wherever ids become definitions** (`recentWidgetDefs`). A browser that used the old ids holds
  all of them in its recents list, and each resolves to the same definition: the Add-widget panel showed the Gallery
  three times, with three identical `+` buttons. Resolving aliases and collapsing duplicates are the same job, and
  the place to do it is the point where ids stop being ids.
- **A config field that only applies to one source declares `showIf`.** Otherwise the ⚙ panel shows every source's
  fields at once, which is what made three near-identical gallery widgets look reasonable for a week.

## Gates to run before saying "done"

- `npm test` — the suite plus the docs/manifest gates.
- `node scripts/docs-facts.mjs --live` — counts, links, issue numbers, and the bundle production is actually serving.
  It names the file that disagrees. Count claims are duplicated across ~22 sources and must move together.
- A new `public/*-demo.json` must be linked from **both** the README demo table and the hub text in
  `public/demos.json`.
- Read the real asset filename from `dist/assets/` before writing it into HANDOFF's "production bundle" row — a stale
  name fails the live check.

## Where things are

| you want | read |
|---|---|
| how to test in a browser, incl. the print pass | `docs/BROWSER-TESTING.md` |
| what is filed, open, done | `docs/ISSUES.md` |
| what was verified, and the traps each round found | `docs/VERIFIED-WORKING.md` |
| which API a widget reads, and its measured gotchas | `docs/DATA-SOURCES.md` |
| export, print and PDF behaviour | `docs/EXPORT.md` |
| current state, deployment, queue | `HANDOFF.md` |
