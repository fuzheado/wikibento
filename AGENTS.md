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

- `npm test` — the suite, the docs/manifest gates, **and the app build** (`vite build`, which takes well under a second here). It was
  added after a duplicate import I had pushed: the tests were green (esbuild tolerates it) while `vite` failed the
  build, and I had run the tests rather than the build. Now the suite cannot be green with a broken build, so the
  "confirm a new asset filename" rule has a mechanism behind it instead of a habit.
- `node scripts/docs-facts.mjs --live` — counts, links, issue numbers, and the bundle production is actually serving.
  It names the file that disagrees. Count claims are duplicated across ~22 sources and must move together.
- A new `public/*-demo.json` must be linked from **both** the README demo table and the hub text in
  `public/demos.json`.
- **Load the BUILT page after a UI change**, not just the dev server. A module-initialisation cycle is a bundle-time
  property: the suite passes, `vite build` succeeds, and the dev server renders — while the built bundle throws
  `Cannot access … before initialization` on the first render (2026-09-24, ISSUE-114: a feature was written, tested
  and then reverted because of it). **`npm run smoke:built`** starts a preview server, loads a board in a real browser
  and requires cards with no page errors — and it runs at the end of `npm test`, right after the build it depends on.
  `node scripts/browser-matrix.mjs --demos --base http://localhost:4173` goes further (every board, every engine).
- **After `npx vite build`, confirm the asset filename CHANGED.** A failing app build leaves the previous `dist/` in
  place, so a deploy ships old code and a browser sweep will cheerfully verify it — the tests were passing while the
  app build was broken, and a whole round of measurements described a bundle that was never served. Read the real
  filename from `dist/assets/` before writing it into HANDOFF's "production bundle" row; a stale name fails the live
  check, and that check is the only cheap proof a build happened. **A browser check against a stale `dist/` is a false
  negative that looks exactly like a broken feature** — an e2e run reported "the click does nothing" for code that had
  been edited but not rebuilt (2026-09-24).
- **A leaf component that receives its data as a prop cannot close an import cycle.** `PickMenu.jsx` imports only
  React and `lib/pickMode.js` and takes the registry as a prop; the earlier version imported the registry itself and
  formed a cycle with `App`, which threw in the built bundle and cost a revert (ISSUE-114). Prefer that shape to
  debugging the cycle afterwards.
- **An exception inside a React event handler reaches the console, not `pageerror`.** A browser check that listens
  only for page errors passes while every click is broken. Listen to both; treat upstream `Failed to load resource`
  as a note, and everything else as fatal.

## Editing files here: assert the anchor, and let the suite check the wiring

- **Use `node scripts/assert-edit.mjs FILE --find '…' --replace '…' [--count N]`** instead of a bare find-and-replace.
  It reports the actual count and the nearby lines on a mismatch, refuses to write when the count is wrong, and
  re-reads the file to verify what it wrote. `--show` prints the matching lines when you are unsure of an anchor;
  `--regex` treats `--find` as a pattern.
- **Never guard on a bare identifier.** `if 'configNormalize' not in s` was satisfied by a *comment* mentioning
  `src/lib/configNormalize.js`, so an import was never added and the app threw in `?lean=1` only. Guard on the
  statement (`^import .* from './configNormalize'`) or assert a count.
- **`tests/undefined-refs.test.mjs` is the safety net for that class**: a name exported somewhere in `src/` and
  *called* in a file that neither imports nor defines it fails the suite. It exists because esbuild/vite do not check
  undefined identifiers — a missing import is a runtime error, so a green suite can hide a card that throws. It was
  verified by removing today's import and watching it fail with the exact name.
- Adding a test file means **three** `package.json` references (the esbuild step, the `node --test` list, the `rm -f`
  list) — and `assert-edit.mjs` is the tool that keeps those edits honest too.## Where things are

## A board is data from outside

Boards come from files, links, other people and other tools, and their *types* are as untrustworthy as
their values (`!!"False"` is `true`). Coerce by the registry's declared field type, fill the registry
defaults, and trim default-equal fields only when *writing* — never in a borrowed board's hands. The
severity model (unusable / repairable / inefficient) and the reporting rules are in
`docs/JSON-FORMAT.md`; `src/lib/configNormalize.js` is the implementation.

## Driving the UI when a test cannot see it

- **The ⚙ on a card is `button[title="Configure"]`** (`class="widget-btn"`). `.react-grid-item` filtered by a widget's
  text, then that button, is a reliable pair — two rounds were lost to a selector that "failed to open the panel"
  that had opened all along.
- A panel is open when `.config-field` elements exist; field labels are their `<label>` text.
- Scope a card by `[data-widget-id="…"]`, never by its text: `filter({ hasText })` matches whichever card happens to
  contain the words (a note card saying "alphabetical" is not the gallery).

| you want | read |
|---|---|
| how to test in a browser, incl. the print pass | `docs/BROWSER-TESTING.md` |
| what is filed, open, done | `docs/ISSUES.md` |
| what was verified, and the traps each round found | `docs/VERIFIED-WORKING.md` |
| which API a widget reads, and its measured gotchas | `docs/DATA-SOURCES.md` |
| export, print and PDF behaviour | `docs/EXPORT.md` |
| current state, deployment, queue | `HANDOFF.md` |
| thumbnail widths, buckets, lazy loading | `docs/THUMBNAILS.md` |
| what a board file may contain, and what to do when it is errant | `docs/JSON-FORMAT.md` |

## A sibling project worth consulting

`~/Documents/ai/commons-vibe` is a clone of `github.com/fuzheado/commons-vibe` (MIT, same author) — a visual Commons
category explorer. It solved problems this project has too, and wrote down the measurements: its
`benchmark/thumb-metrics.md` is the reference for thumbnail sizing and bucket quantization, and its `HANDOFF.md`
records the traps it hit in production. **Read it before re-deriving image behaviour by trial and error** — that is
how the off-ladder page-thumbnail ladder was found here (ISSUE-108). It is a *reference*, not a dependency: nothing
in this repo imports from it.
