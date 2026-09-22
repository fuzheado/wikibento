# Verified working — a dated record

What has actually been smoke-tested in a browser, when, and against which live asset. This is a **record**,
kept because the failures it documents are the ones that recur (a silently-ignored prop, a widget that
renders an empty frame instead of an error). The README carries only the current headline; this carries the
evidence.

Re-run the checks with `npm test`, `npm run smoke`, `npm run smoke:panels` and `npm run test:browsers`
(see [BROWSER-TESTING.md](BROWSER-TESTING.md)), and the cross-doc consistency gates with
`node scripts/docs-facts.mjs`.

Back to the [README](../README.md).

## Document mode stopped re-inventing the board (ISSUE-77, 2026-09-18, seventh pass)

Andrew, with two screenshots from Document mode: a **trend chart stretched across the page**, and the **pendant-mask
image enormous**, overflowing its card into its neighbours.

- 🐛 **One cause, and it was my own earlier fix applied everywhere but here.** Document mode made every card **full
  width** — the obvious way to build a "document" — which reflows the insides of a card that was drawn for a narrow
  column: a chart with `width: 100%` became four times as wide, and a file-spotlight image sized for a 356px card
  became a monster. Cards now take the width their **grid span** gives them, so one card per row at its own size.
- 🐛 **And the first attempt at that made the same mistake one level down**: a flex item with no width takes its
  *content* width, which measured 19% of the page for one card and 100% for another. `calc((var(--print-span) / 12) *
  100%)` is the width that makes the inside of a card look like the card. Verified: welcome 25% · edithistory 33% ·
  gallery 100% · fileparse 25% — the board's own grid, to the point.
- ✅ **A new invariant in the sweep's print pass**: every card must keep **its share of the board's width** between
  screen and print. That is the mode-agnostic form of this bug (any reflow, in any mode, is caught), and it is the
  check that would have caught the stretched chart and the giant mask before anybody printed them.
- Met board, after: **Document 7 pages** (21 → 11 → 8 → 7), no stretched content.

## A print of a live board, done properly (ISSUE-77, 2026-09-18, sixth pass)

The follow-up from Andrew, with three of his own PDFs: images missing from the poster, overlaps in Board and
Document, and *"can we make the text run better and not overlap?"*

- 🐛 **My overlap check was measuring the wrong moment.** It ran 300ms after arming a print, when images had not
  arrived, every card was short, and nothing collided — so it reported "0 overlaps" for a board whose real PDF had
  four cards printed over each other. It now waits for the settled state a real print gets (images decoded, no card
  loading) and checks the subtler failure too: anything inside a card that **paints outside its own box**. A print
  check that does not wait is a check that lies.
- 🐛 **The overlap was horizontal, and a reflow was the wrong answer.** Board and Document let the paper's width
  decide the cards' width, so a gallery's fixed tile grid, a wide table or a chart's absolute labels spilled into the
  neighbouring column — visible in the reported PDFs as paintings printed over a CIM table. Both modes now **`zoom`**
  the board to A4's content width: the same drawing, smaller, with the layout size scaled too so pagination stays
  correct. Verified by generating the PDFs: the Met board's page two is clean, thumbnails inside their column.
- ✅ **The timing question, answered with a wait.** `preparePrint()` holds the sheet until every image has decoded and
  no card is loading (20s cap), showing *"Preparing the print — 42 of 139 images…"*. That is what stops the poster
  from capturing a grid of images that had not arrived.
- ✅ **Document mode flows** rather than jumping: `break-inside: avoid` left near-empty pages behind a tall card, so
  cards may split there now — the Met board went 21 → 11 → **8 pages**. The trade-off, stated rather than hidden: a
  tall chart can be cut by a page boundary.
- Measured after the fix, on the Met board: **Board 5 pages · Poster 1 page · Document 8 pages**, every image loaded,
  no overlap in either mode.

## A print you can choose the shape of (ISSUE-77, 2026-09-18, fifth pass)

Andrew, on the Met demo (`?config=https://w.wiki/TT2g`): *"the second page … all types of things overlap incorrectly"*
— and then the better question: *"is there a better way to export a PDF directly where you take more charge of the
appearance? I could imagine a one large PDF poster of what the board shows, or paginated but more smartly."*

- 🐛 **The overlap was mine, and the cause is worth naming.** Reproducing the board's grid, I grouped cards into
  *shelves* by overlapping vertical spans. That is right for a tidy board and wrong for a **staggered mosaic**: on
  the Met board a tall card's column is re-used by the card below it, so five cards landed in one shelf, two pairs
  shared a column, and four printed on top of each other. Placement now comes from the layout's own `x`/`w`/`y`/`h`
  — the grid the board is drawn on — which makes an overlap impossible rather than unlikely (13 cards, measured
  against production: **0 overlaps**).
- ✅ **Three shapes, in the 🖨 menu** — because a dashboard is not a document: **Board** (the grid you see),
  **Poster** (one page *sized to the board*, so the dialogue's scale-to-fit makes it any paper you like), and
  **Document** (one card per row in reading order, for reading rather than recognising). Measured on the Met board:
  11 / **1** / 21 pages; on the Anne Frank board: 6 / **1** / 4. A poster is one page on both.
- 🐛 **Two bugs only visible by looking at the output.** The poster was two pages until the fixed heights and the
  screen-derived page size were reconciled (script cannot measure the printed layout — `beforeprint` runs in screen
  media — so the page carries a deliberate allowance). And the Met gallery printed as **empty black tiles**: cards
  below the fold use `loading="lazy"`, so their images had never been fetched. Arming a print now flips them to eager
  (verified: 139/139 loaded).
- ✅ **And the check that keeps it honest**, in the sweep: a print pass arms the sheet, emulates print media, and
  fails any run where two cards touch. That is the class of bug this whole thread was about, now caught on every
  demo board in every engine rather than on the board someone happened to print.

## The printed board now looks like the board (ISSUE-77, 2026-09-18, fourth pass)

Andrew, printing `?config=/anne-frank-mlk-demo.json`: *"the layout of the PDF … doesn't seem close to what the
configuration looks like on screen, like the widgets don't seem to follow the same flow."*

- 🐛 **They didn't.** The board sheet made every card **full width and stacked it in DOM order**: the symmetric row
  (`excerpt w4 · views w2 · views w2 · excerpt w4`) became four stacked pages, the two side-by-side galleries were
  split across pages, and the note that *opens* the board printed **fifth** (its position in the widgets array).
  Measured rather than eyeballed, in print emulation: eight cards, all at `w1360`, in array order.
- ✅ **Fixed by deriving the sheet from the grid the board is actually using** (`boardPrintGeometry`): column and span
  from the layout, rows as *shelves* — items whose vertical spans overlap share a line — so DOM order stops
  mattering (which is also what makes it work for a board loaded from a URL). Verified against production after
  deploying: `comparison-note` first, then `excerpt │ views │ views │ excerpt`, then the full-width timeline, then
  `gallery │ gallery` — the same flow as the screen, and **2 pages / 274 KB instead of 7**.
- 🐛 **And the fix exposed two more.** The sheet was armed only by the 🖨 button, so ⌘P and the browser's own Print…
  menu got react-grid-layout's clipped transforms — there is a `beforeprint` listener now, so every print path gets
  the board. Worse, the **three-second disarm timer** (added in ISSUE-77 because `afterprint` is unreliable) fired
  *during* a slow print job, cleared every slot and produced a PDF with the disarmed layout — the exact bug the sheet
  exists to prevent, reproduced by generating the PDF in a test. The timer is gone: `beforeprint` re-arms, so a
  stale armed state cannot do any harm (the sheet only affects print media).
- The unit test covers the geometry contract — shelves, spans, reading order, and the *guarantee* that a card is
  always on the paper (`col + span - 1 <= 12`) however nonsense the authored values are.

## Commons galleries, as data (ISSUE-103, 2026-09-18, third pass)

Andrew asked what makes a Commons page a gallery, and whether it deserved a widget. It does — and the answer to the
first question is the reason why.

- ✅ **A gallery is a convention, not a type.** No namespace, no prefix, and `Gallery:The Venetian Macao` is simply a
  *missing page* (the API says `missing: true, ns: 0` — the prefix is not an alias). What marks one is content: a
  main-namespace page with a `<gallery>` tag, usually `{{Gallery page}}`, tracked in `Category:Gallery pages of …`.
  87,315 pages carry the template; 140,220 contain the tag. So a gallery is found by **search** and read from its
  **source** — never by title.
- ✅ **Read the wikitext, not the rendered HTML** — measured at **56 KB against 654 KB** for London's 542 images, for
  byte-identical item counts (London 542/542, New York City 246/246, The Venetian Macao 5/5, Berlin 0/0), with the
  section structure included.
- ✅ **Shipped and verified live** (desktop Chromium + iPhone WebKit, 0 errors): the widget renders the gallery's own
  captions in its own order; a click publishes the file and the reader beside it loads it; the Board Controls box is
  a validated picker over the galleries with the `Gallery:` typo guard; and London shows **"542 images · showing 24"**
  with the cap applied before thumbnails.
- ⚠️ **Two traps the parser had to handle, both real**: a caption part that is only an option (`|alt=Just an option`
  is not a caption) and options after a caption (`Caption|link=File:Y`) — which is why the line splits on the
  **first** pipe only, keeping a linked caption like `[[:Category:X|X]]` intact.
- ⚠️ **A third trap in the docs themselves**: adding a demo board to disk without a README row is invisible, and the
  page-picker demo had lost its row in a merge. There is a gate for it now (README + hub), and it caught the gap on
  its first run.

## A broken upstream, a widget that never rendered, and two checks that can see "nothing" (2026-09-18, second pass)

Andrew reported a Wiki Stats card in an error state: `Wikistats fetch failed: HTTP 500 (…table=wikipedias&format=csv)`.

- ✅ **The 500 was real and it was upstream's** — reproduced three times over several minutes, for every User-Agent,
  and only for the `wikipedias` table (wiktionaries, wikisources, wikidata and commons kept returning CSV). The API
  refuses every other format for that table, so it could not be asked differently. **And it came back**: the same URL
  answered 200 with 195 KB minutes later, so the service is *flaky*, not dead — which decided the fix.
- ✅ **The single-edition card now reads the wiki itself** (`siteinfo.statistics`): live rather than a periodic dump,
  one request instead of 195 KB, CORS ✓ — and it returns everything the card shows. Verified live: **7,241,853
  articles, 1,371,008,143 edits, 263,530 active editors**. `en`, `en.wikipedia` and `enwiki` all resolve to the same
  host, because the ⚙ Language field is the shared picker.
- 🐛 **The ranking genuinely needs the dump** (nothing else lists every edition with counts — the site matrix carries
  no `count`), so it keeps it — and I nearly broke it: routing both widgets through siteinfo left "Largest
  Wikipedias" rendering **zero rows, silently**. Verified after the fix: English 7,241,032 · Cebuano 6,115,710 ·
  German 3,152,097.
- 🐛 **A widget that had never rendered at all.** `PanoramaCard` was defined, named by the `panorama360` widget and
  **never given a `case` in the content dispatcher** — so every 360° card fell through to `default: StatCard` and
  showed an empty "—". It shipped that way. Found by the new "shows no value" check on the full-catalog board, and
  the gate that should have caught it only asserted that a renderer *exists*, not that it is *reachable*: it does now.
- ✅ **Two checks the sweep earned, and one crash it had**: a `.stat-value` of `—` and a `.ranking-rows` with no rows
  are both failures now, and each was verified by restoring the bug (the first reports exactly `shows no value:
  views`, the second `empty body: topwikis`). The harness itself had a bug — a launch failure left fields undefined
  and killed a 68-run sweep with no summary — fixed with initialised fields and a per-job guard.
- ✅ **Verified against production:** 67/68 clean, and the single failure (a SPARQL card on WebKit-phone) passed
  twice on re-run — WDQS throttling under the sweep's own concurrency, not the app. The full-catalog board's 43
  cards all pass, and on an iPhone profile too.

## A card that showed "—" instead of a number, and why only a new demo could find it (2026-09-18)

Andrew: *the "views" metrics box does not seem to be working* on `?config=/page-picker-demo.json`.

- 🐛 **The renderer and the transform disagreed about an absent config field.** `getRenderer` read *"anything that
  is not `trend` is a StatCard"*, while `transform` read *"anything that is not `stat` is the trend payload"* — so a
  board that omitted `displayMode` got a trend payload drawn by a StatCard: a title, a date range, and **—** where
  the count belongs. Both now resolve the mode through one function, and a test asserts they agree for absent,
  explicit and nonsense values (the ISSUE-94 lesson exactly: a registry default is only honoured if something reads
  it — here, two somethings that have to read it the same way).
- 🔎 **Why every shipped board looked fine:** they all set `displayMode` explicitly. Only the new `page-picker-demo`
  relied on the default — which is why the bug was invisible for as long as it was, and why it is worth keeping that
  board as it is: it is now the one demo that exercises the default.
- ✅ **Verified live:** the card reads **166,558** views, **~5,552/day**, with **30 spark bars**.
- ❌ **And the checks that could not see it:** nothing errored, nothing 404ed (the request was 200 with 30 items —
  the *transform* was at fault, not the fetch), no card was collapsed, and the console was clean. A card quietly
  rendering its empty state is invisible to every check the sweep had, so the sweep gained one: **a `.stat-value`
  of `—` is now a failure** ("shows no value: views"). Verified both ways — with the old condition restored it fails
  with exactly the reported symptom, and with the fix it passes.
- ✅ Checked rather than assumed: a non-OK response was *not* being swallowed — `fetchTextWithRetry` already throws on
  any `!resp.ok`, which is also why the 200-with-data measurement above was conclusive.

## Every demo, every engine, both widths — and the three bugs that were hiding there (ISSUE-100, 2026-09-16)

Andrew reported from an iPhone that `?config=/click-through-demo.json`'s 📰 box was empty, and asked whether the
three-browser tests covered the demos. They did not — one board, one width — so a phone-only failure had nowhere to
show up. The sweep that now runs found three bugs, and two of them were not phone-specific at all:

- 🐛 **Every card body collapsed to 0px in the phone stack.** `.widget-body` is `flex: 1; min-height: 0` for
  fixed-height grid cells; with `.grid-item { height: auto }` there is no line to grow into, so the card kept its
  58px header and nothing else. Measured identically on an iPhone profile in Chromium **and** WebKit, which is the
  proof it was never iOS-specific: the stack was just the only place it showed.
- 🐛 **Wikipedia strips navboxes for phones and only the User-Agent changes it.** Same request, same 200:
  **22,820 bytes / 161 links** for a desktop UA vs **5,780 bytes / 0 links** for an iPhone UA. `useskin`,
  `mobileformat` and `wrapoutputclass` change nothing, and `User-Agent` is a forbidden header for `fetch` — so the
  fix is the deployment's `/api/proxy` relay, which asks with the tool's own UA and returns the full box. Detected
  by exact signature (`navbox-styles` with no `navbox` element), retried through the relay, relay-first thereafter.
- 🐛 **A static widget sent a literal placeholder to Wikipedia.** The reference-consuming 📄 Wiki Page built
  `https://en.wikipedia.org/wiki/{{widget:click-seas#selection}}` and embedded it in an iframe on every load —
  ISSUE-58's "never send an unresolved `{{…}}`" guard existed only on the fetch path. Static widgets now wait too.
- ✅ **Verified against production:** with `--require-relay`, **64/64 runs clean** (15 boards × 2 engines ×
  desktop+phone), and on an iPhone profile the click-through box renders **161 links in a 1644px body, 0 errors**.
- ✅ Two filed-as-cosmetic bugs also went: ✨ Ask nested inside + Add Widget (invalid HTML, a warning on every load,
  and one console error on every sweep row) and React's `key` spread into `<audio>`/`<video>`.

## The page box learns its wiki — and the badge that lied for a day (ISSUE-99, 2026-09-16)

Andrew asked for a box where you type a page name, have it validated, and get the project/language back out — with an
`en:`-style shortcut. The box existed (ISSUE-68's `article` lookup param); it just could not say which wiki.

- ✅ **The wiki is now part of the box.** `source: 'article'` and the new `source: 'page'` are *project-aware*: a
  wiki picker sits above the input (the same 364-project control Settings uses), the verdict is asked of *that*
  wiki, and the committed value is a **reference** (`dewiki:Weddellmeer`).
- ✅ **The keyboard shortcut works as asked.** Typing `de:Weddellmeer` moved the picker to `de.wikipedia` — the guess
  is visible, not silent. `en:`, `dewiki:`, `commons:`, `wikidata:` all resolve; `File:` and `Category:` on their own
  are titles, because a category can live on any wiki and guessing Commons there would silently reinterpret it.
- ✅ **No consumer names a project.** Measured in the browser with one box and three cards (Excerpt, Pageviews,
  Quality): seeding `enwiki:Marie Curie` → ✓, typing `de:Weddellmeer` → picker moves, committing → all three
  re-fetched **German** content, a fictional title → ✗ *no such page on de.wikipedia*. Zero page errors.
- 🐛 **And the badge lied at first.** Validation was asking the API for a page named `dewiki:Weddellmeer` → *missing*
  → a red ✗ beside a German excerpt that was plainly rendering. A value's *name* is not its *content*, and every
  layer handling one has to say which it means (the same lesson as ISSUE-97, one day later). Fixed with a pure,
  tested `lookupValidationTarget()`.
- ⚠️ **My own probe debugged the wrong thing for ten minutes**, because a duplicate `import ProjectField` made the
  module fail to load: the dev server returned 500 for the whole file, the page rendered blank, and I went looking
  at the board JSON. The habit that would have caught it in one second — *transform the module after editing it* —
  is now part of how this repo is worked on.

## A chain that speaks in the right language, and the crash hiding in an empty text field (ISSUE-97, 2026-09-16)

Andrew asked four things about `?config=/translate-demo.json`: can the translator show only the translation; can the
language travel with the text; can the voice follow that language; can a speaker speak what it ingests, without
being a surprise.

- ✅ **Show only the translation** — the Translator gained *Show* → original and translation / translation only /
  original only, defaulting to both so no existing board changes. Verified in a browser: the translation-only
  card renders the French text with **no source block and no arrow**.
- ✅ **The language travels** — the Translator now publishes `{ type: 'speech', text, lang }` on a `#speech` channel
  *beside* its text, and `primary: 'translation'` keeps `{{widget:translate}}` meaning what it always meant.
- ✅ **The voice follows the language** — measured with a fake voice roster in the browser: a French translation
  speaks with `lang: fr-FR` and the French voice (`Amélie`), not the device's English default, and the card says
  which voice it will use before you press anything.
- ✅ **It can speak what it ingests, safely** — the speaker's auto-speak was already there; what was missing was the
  language and the discoverability. One click on ▶ arms it, after which changing the article on a Board Controls
  card runs the whole chain and speaks the new translation with **no second click** (two utterances measured, only
  the first click). Off by default, and silent until armed.
- 🐛 **Found on the way: a wired speaker crashed on first paint.** `{{param}}` written in JSX *children* compiles to
  an object literal containing an undefined identifier → `ReferenceError: param is not defined` → the error
  boundary's "widget crashed". It hid for months because the branch only renders when a speaker has **no** text, and
  no shipped board had a text-less speaker — until a wired one (source set, text field empty) became the normal
  shape. Fixed, and recorded as gotcha 27.
- ⚠️ **A gate caught a mis-generalisation of mine.** The project-picker constitution (ISSUE-93) fired on the
  speaker's new `lang` field, correctly by its own rule — which showed that a language field has **two** possible
  vocabularies: a wiki (`type: 'project'`, the 364-project picker) and a speech tag (`type: 'text'`,
  `vocab: 'bcp47'`, matched against the device's voices). The gate now demands a declared vocabulary instead of
  assuming the wiki one.

## A compatibility promise, broken and restored (ISSUE-95/96, 2026-09-16)

- 🐛 **Andrew found this in production:** on `?config=/translate-demo.json` the translator sat on *"Waiting for a
  reference — widget output 'excerpt-src' (not emitted yet — or the id is unknown)"*. The cause was mine: ISSUE-91
  promised that named channels keep the bare widget id working, and ISSUE-92 then turned the Article Excerpt into a
  channel-mapped widget that filled **only** `id#extract` and `id#reference` — so `{{widget:excerpt-src}}`, which
  every board written before channels means, received nothing.
- ✅ **Fixed by making the promise checkable:** a channel-mapped widget declares `primary`, and the frame publishes
  that channel on the bare id as well. `excerpt.primary = extract`, `wikiBox.primary = items`. A
  manifest-constitution test fails a channel-mapped widget that declares no `primary` (or names a channel it does
  not have), so the promise cannot be broken silently again.
- ✅ **Verified in the demo that broke:** the excerpt emits and the translator shows its French rendering
  (*"…particulier pour sa découverte de la loi de l'effet photoélectrique"*), with no "Waiting for a reference" on
  the page.
- ⚠ **And the audit's honest finding** (ISSUE-97): every value on the wire today is a primitive or an array of
  strings, consumers infer from the *shape* rather than the declared kind, and nothing reads `outputs.kind` —
  which is why a structured value currently arrives as one long line of JSON that no consumer can interpret.

## Settings, and a translator that finally talks (ISSUE-95, 2026-09-16)

- ✅ **The panel, driven in a browser:** four sections (My wiki · Recently used wikis · Present mode · About),
  searching "japanese" in its picker returned *Japanese Wikipedia* and *Japanese Wikibooks*, picking one stored
  `ja.wikipedia` as the default, the recent list showed it, and the fullscreen checkbox persisted `false`. No page
  errors.
- ✅ **`translate` emits its translation.** It computed the text and published nothing, so nothing could consume it.
  Now `outputs: { kind: 'value' }` — a Markdown card can show it, a Speaker can read it.
- 🐛 **The bug the panel surfaced in its first minute of use:** the picker wrote a recency entry as `jawiki` and
  the panel wrote `ja.wikipedia` — the same wiki twice, with the ranking (which matches on the dbname) ignoring one
  of them. Canonicalised on write *and* read, so a mixed list self-heals and a language code stays itself. Found by
  reading localStorage after using the panel, which is why "settings you can inspect" is a design rule, not a
  nicety.

## Every wiki, chosen quickly (ISSUE-93, 2026-09-16)

- ✅ **The full list, live:** the picker loaded **951 projects** from the site matrix into its localStorage mirror,
  and showed the curated shortlist first (English, German, French, Spanish Wikipedia) rather than the alphabet.
- ✅ **Ordered by usefulness:** recency → the user's default wiki → the curated shortlist → everything else. Search
  matched **"chinese"** and returned *Chinese Wikipedia*, *Chinese Wikibooks*, *Chinese Wikinews* — a label search
  that a `<datalist>` cannot do, because the browser matches on the value (`de.wikipedia`).
- ✅ **A pick stores what the app already uses** (`zh.wikipedia`), so no board changed meaning, and the widget
  re-fetched against the new project.
- ✅ **21 fields, one control:** five hardcoded lists (`topPages` 30, `wikistats` 13, `pageviews` 6, `linkcount` 3,
  `categorySize` 2), twelve free-text fields and two language fields — with the constants deleted and a gate that
  fails the build if a new widget hand-rolls a list.
- 🐛 **The native-name trap:** the matrix returns `中文`, not "Chinese", so the first search for "chinese" matched
  *nothing*. Options now carry both ("Chinese Wikipedia (中文)") and search reads both.
- ⚠ **Known:** the Ask path may still name a wiki that does not exist — it is passed through and reported by the
  widget's own error state, since 364 wikis cannot be enumerated in a validator; and the default-wiki preference
  is honoured but has no Settings UI yet.

## A page's wiki travels with it, everywhere (ISSUE-92, 2026-09-16)

- ✅ **The excerpt no longer publishes prose alone.** It emits `extract` *and* `reference`; verified by driving it:
  an Article Excerpt on Albert Einstein published **`enwiki:Albert Einstein`**, a Value Display consuming
  `ex#reference` showed exactly that string, and a page viewer reading `{{widget:ex#reference}}` loaded
  `https://en.wikipedia.org/wiki/Albert_Einstein` — **with no project configured on either consumer**.
- ✅ **Fifteen page-taking widgets accept a reference** through one helper, so "accepts a reference" is one
  implementation rather than fifteen.
- ✅ **The gate:** the manifest constitution refuses a prose emitter that declares no `reference` channel — the
  rule that stops this happening again.
- 🐛 **The boundary bug worth remembering:** the resolver returned the canonical dbname (`enwiki`) while the app's
  fetchers build `https://${project}.org` from the dotted form (`en.wikipedia`), so the first sweep produced
  `https://enwiki.org` for fifteen widgets at once — a DNS failure masquerading as nothing in particular, caught by
  driving the demo rather than by any unit test. The resolver now returns both names, and a test states the rule.
- ⚠ **Known limit:** a *mixed-project* Article List is fetched with its first line's project (the fetcher takes one
  project per call); per-item fetching is a separate feature.

## Text hangs from the top (ISSUE-94, 2026-09-16)

- ✅ **Measured before and after.** A short Article Excerpt in a 780px card was centred: **139px above, 139px
  below** — a paragraph floating in the middle of nothing. With the type's new default it is **12px above, 524px
  below**, and with `verticalAlign: center` it is 268/268. The card also claims the full width in top mode
  (677px), because a text block centred horizontally reads as a mistake even when it is at the top.
- ✅ **Generic, not special-cased:** any card may declare `verticalAlign` (`top` | `center`); a card that declares
  nothing is unchanged, so this is a per-type decision rather than a new house style. The shipped
  `translate-demo` board was checked too (12px above, nothing clipped).
- ⚠ **The trap:** the default lived in the registry while the frame read only the board's config, so a board that
  omitted the field — every existing board — stayed centred. A registry default must be honoured at render time,
  and the lookup must not reference `def` before it is declared (that was a TDZ crash).

## A page travels with its wiki (ISSUE-92, 2026-09-16)

- ✅ **The reference form, measured end to end:** clicking "Weddell Sea" in a live `List of seas` box publishes
  **`enwiki:Weddell Sea`** (not a bare title), and the page viewer beside it reads the project out of the value and
  loads `https://en.wikipedia.org/wiki/Weddell_Sea`. A `dewiki` box would load the German article with no
  configuration change on the consumer side — the value says where the page is.
- 🐛 **A bug the convention immediately exposed:** `wikiPage` built its host as `https://${project}.org`, so the
  moment a *reference* arrived it produced **`https://enwiki.org`** — a plausible-looking wrong answer, caught by
  driving the demo. It now uses the shared `projectSite` mapping, which accepts either `en.wikipedia` or `enwiki`.
  That is the argument for one mapping: the same hand-rolled line exists in other call sites (ISSUE-93).
- ✅ **Nothing old changed meaning:** a bare title parses as a title (and a `File:`/`Category:` namespace is not
  mistaken for a project), which is what lets every value and config written before this keep working. 10 tests in
  `tests/reference.test.mjs`, including the awkward dbnames (`zh_min_nanwiki`, `be_x_oldwiki`).
- ⚠ **Still missing, and filed:** `excerpt` publishes prose with no article at all, and only one consumer
  (`wikiPage`) accepts a reference today. Both are ISSUE-92.

## A click can send a page to the board (ISSUE-91, 2026-09-16)

- ✅ **The whole pattern, driven in a browser:** a live `{{List of seas}}` card (161 article links, Wikipedia's own
  markup and styles), *Links in the box* = **send to the board**; clicking **Weddell Sea** loaded that article in
  the page viewer beside it (`en.wikipedia.org/wiki/Weddell_Sea`) and put the string `Weddell Sea` in a Value
  Display card. The board kept every card. Screenshot:
  [docs/screenshots/wikibento-2026-09-16-click-through.png](screenshots/wikibento-2026-09-16-click-through.png).
- ✅ **Named channels, backwards compatible by construction:** the default output keeps the bare widget id
  (`{{widget:id}}`), so the 10 pre-existing emitters and every existing board mean exactly what they did. A second
  channel is `id#channel` — declared as `outputs: { items, selection }`, stored under that key, offered in the
  source picker, resolved by `{{widget:…}}`, and repointed by a rename. Three gates learned the shape; the demos
  constitution now fails a reference to an undeclared channel.
- ✅ **A click is a choice, and the choice is a title:** `boxLinkSelection` turns `/wiki/Weddell_Sea` into
  `Weddell Sea` (decoding underscores and percent-escapes, dropping fragments), reports namespaces rather than
  pretending a File:/Category: link is an article, and keeps a display text for off-wiki links. The link still
  opens a tab by default — the two behaviours are separate settings, not a replacement.
- 🐛 **Two of my own wiring bugs, both caught by driving it:** `onSelect` was threaded into `WidgetContent` but the
  dispatch inside it still named the frame's local (`handleSelect is not defined` — the card showed its own error
  boundary), and an earlier edit of App's output handler had been silently discarded by a later failed assertion in
  the same script, so the selection was landing on the widget's *default* channel and clobbering its items. The
  first is why the error boundary is worth having; the second is why the fix is now written in one edit and
  grep-verified.

## A click in a box no longer throws the board away (ISSUE-91, 2026-09-16)

- ✅ **The bug Andrew hit:** clicking "Weddell Sea" inside `{{List of seas}}` replaced the entire board with that
  page. Every anchor in a rendered box now carries `target="_blank" rel="noopener noreferrer"`, applied before the
  sanitiser so the attribute is allowlisted rather than stripped out — which is what the other **36** content-link
  sites in this app already did (audited: 36 with `_blank`, 3 iframes, and `wikiBox` was the exception because the
  markup is MediaWiki's own).
- ✅ **Verified in a browser, not by inspection:** clicking an In the news link opens a new tab
  (`en.wikipedia.org/wiki/File:KM_Virgo_Transport_8_at_sea.jpg`) and the board is still there with all five cards.
- ⚠ **What is still not possible**, and now written down: a click that *means something to the board* (load it into
  another widget, emit the title to a map or a gallery). Nothing in the app emits because a reader clicked
  something — all 10 emitters are pure functions of fetched data — and `wikiPage` cannot participate at all, since a
  cross-origin iframe never reports its clicks. The design (named output channels, a click hook, a `linkAction`
  field, consumers that accept a value) and the effort estimate are ISSUE-91.
- ✅ **An audit of where this pattern applies:** see the table in ISSUE-91. Short version: links are the easy half
  and are now consistent; the interaction channel is the missing half, and it needs the emitter contract to grow a
  second channel before a box can both list its items *and* report a selection.

## Wikipedia boxes, rendered faithfully (ISSUE-90, 2026-09-16)

- ✅ **The In the news box renders as the box**, not as a list of links: bullets with bolded article titles, the
  floated picture with its caption, the inline "Ongoing: … / Recent deaths: …" footers, and "More current events ·
  Nominate an article" — driven through the widget in a browser and *looked at* (the screenshot is
  [docs/screenshots/wikibento-2026-09-16-front-page-boxes.png](screenshots/wikibento-2026-09-16-front-page-boxes.png)).
- ✅ **Four more boxes, same mechanism:** Today's featured article (portrait + caption + "Recently featured"),
  Did you know (image + "… that …" items), the selected anniversaries page, and the real Picture of the day.
  Measured per card: 600–1,149 chars of text, 7–16 list items, one image each, 13–19 scoped CSS rules from the
  wiki, **0 relative URLs left**, no notices.
- ✅ **The two boxes that need a date do not break:** `POTD/{date}` and
  `Wikipedia:Selected anniversaries/{monthname} {day}` are self-updating (the widget expands the tokens), because the
  wrappers `{{Picture of the day}}` / `{{On this day}}` only render in the Main Page context and otherwise return a
  maintenance notice — which the card detects and explains rather than showing a bare yellow box.
- ✅ **Untrusted input, twice sanitised:** MediaWiki's own parser, then an allowlist here (tags, attributes,
  `href`/`src` schemes) plus a CSS rule filter that keeps only `.mw-parser-output`-scoped selectors. Measured on the
  real response: no scripts, no `on*` handlers, and the styles stay inside the card.
- ✅ **It is a source, not a dead end:** the box emits one line per item (`outputs: { kind: 'lines' }`), so Filter
  Lines / Line Count / Speaker can consume "In the news" like any other list.
- Evidence: `npm test` (516) incl. `tests/wiki-box.test.mjs` (25), which runs the whole path over the **real cached
  API response** when the measurement cache is present.

## A big board now fits in a QR code (ISSUE-89, 2026-09-16)

- ✅ **The reported failure is gone.** `glam-demo.json`'s self-contained link was 4,012 characters and the panel
  refused to draw a QR. Compressed it is **900 characters** and the QR renders — measured in the app by the
  audit (`Share a big board` → `#/z… 900 chars · QR rendered`), not on a bench.
- ✅ **The win is general, and bounded.** Across the 15 boards in `public/`: plain base64url fits a QR for
  **1 of 15**, compressed for **13 of 15**. The two that still do not fit (the 42-widget catalogue, and the
  39 KB widget manifest) are asserted in `tests/share-embed.test.mjs` as refusals, so the app keeps saying
  "too big for a QR" rather than rendering a dense code nobody can scan.
- ✅ **Backwards compatible by construction:** `#/d/…` links keep working (asserted), the compressed form is
  chosen only when it is actually shorter, and a browser without `DecompressionStream` gets a message naming
  the alternatives instead of a blank board.
- ✅ **The message offers real options**: copy the link and paste it on the phone, or Export → AirDrop →
  Import. The old text told the user to trim their board or go host a JSON file — work pushed onto the person
  who just wanted to show someone a chart.
- 🐛 **The trap it cost, kept as a gotcha:** a `CompressionStream` deadlocks if you close the writer before
  reading the readable; the promise never settles and the app silently fell back to the long link. Node does
  not reproduce it, so this was found by driving the app, and `tests/share-embed.test.mjs` now guards the
  ordering in the source.
- Evidence: `npm run smoke:url` (18 actions traced, 0 invariants broken, four of them ISSUE-89's) and
  `tests/share-embed.test.mjs`. Design and options: [ISSUES.md](ISSUES.md) (ISSUE-89).

## A shared link borrows a board (ISSUE-88, 2026-09-16)

- ✅ **The visitor's board survives opening a link.** Reproduced first: seed a board with the id `MY-BOARD`,
  click `?config=/glam-demo.json`, visit the plain URL — the demo followed them home and `MY-BOARD` was gone.
  Now the same sequence ends with `MY-BOARD` saved and on screen, and the notice reads *"👀 Viewing a shared
  board — GLAM. Your own board is saved and untouched."*
- ✅ **A first-time visitor sees no notice at all** — nothing saved is not a board to lose, and the same rule
  keeps it hidden when the visitor's board *is* the board the link points at.
- ✅ **[Back to my board]** restores the saved board and drops the URL claim (address bar back to `/`), so a
  reload cannot re-borrow the link.
- ✅ **The first edit adopts, and the displaced board is recoverable.** After removing one card from the
  borrowed board: the board is adopted, `MY-BOARD` lands in `wikibento-previous-board`, the notice switches to
  *"💾 Your previous board is saved — recoverable for today"*, and **[Restore my board]** brings `MY-BOARD`
  back.
- ✅ **A mount-time layout placement is not an edit** (the trap ISSUE-87 hit on the claim path, here on the
  write path): react-grid-layout fills gaps in an authored layout and reports `onLayoutChange` while merely
  placing a board, which would have made a borrowed board adopt itself before anyone touched it.
- ✅ **An acronym label**: the notice says "GLAM", not "Glam" — an assertion in `tests/borrowed-board.test.mjs`
  caught the helper title-casing it.
- Evidence: `npm run smoke:url` — 17 actions traced, 0 invariants broken (six of them ISSUE-88's), plus
  `tests/borrowed-board.test.mjs`. Design and reasoning: [ISSUES.md](ISSUES.md) (ISSUE-88).

## The URL as a claim about the board (ISSUE-87, 2026-09-15)

- ✅ **↺ Reset no longer leaves the old directive behind.** Andrew reported that Reset blanked the board but
  the address bar kept `?config=/demos.json`, so a reload (or a pasted link) brought the discarded board
  back. Reset now drops the claim — and so does **every** board edit, because the same lie can be told by
  any of them. Verified in Chromium against a local build: `?config=/document-reader-demo.json` → ↺ Blank →
  `/` with 0 cards, **and still 0 cards after a reload** (the reported symptom, end to end).
- ✅ **Share hands over the board on screen, not the URL in the bar.** The second instance of the same bug:
  SharePanel preferred the `?config=` URL whenever present, so *load a demo → change something → Share* gave
  the recipient the file's board. Measured: an untouched board shares its short 58-char `?config=` link; after
  removing one widget the link becomes a 1,462-char `#/d/…` embed of the current board.
- ✅ **A quiet load is not an edit.** The claim survives a load with no interaction — guarding the trap that
  react-grid-layout's mount-time layout normalization would otherwise drop the demo URL on arrival.
- ✅ **Present mode stays opt-in and reversible:** `?lean=1` lands in present mode, Exit strips the param,
  and entering present mode from a plain URL invents no param (the *shared* link carries the mode).
- ✅ **Three classes of edit traced, not one:** removing a widget, changing a board parameter, and dragging a
  card each drop the claim; a board whose authored layout has gaps (params-demo) *keeps* its claim on load,
  because mount-time auto-placement is the app's doing and not the user's.
- Evidence: `npm run smoke:url` — 11 actions traced, 0 invariants broken (and runnable against a deploy);
  plus
  `tests/url-state.test.mjs` (19 tests) including a source scan that fails if anything outside
  `src/lib/urlState.js` writes history or interprets `location.search`. Contract and inventory:
  [URL-STATE.md](URL-STATE.md).

## Trend chart Y-axis + scale toggle (ISSUE-64, 2026-09-10 — GitHub #42)

- ✅ **TrendCard Y-axis ticks + gridlines:** Article Pageviews (trend mode) and
  CIM Views Over Time previously rendered a min–max normalized sparkline with
  zero Y information — a 50→55 series looked identical to a 5M→5.5M series.
  Now: 3 gridlines + tick labels (top = max, mid = (min+max)/2, bottom = min),
  exact values on hover ("latest 10,089 · min 7,747 · max 12,310"), labels
  hidden on very narrow cards via container query. Scale is deliberately
  min–max (NOT zero-based — a zero baseline would flatten pageview series);
  shared helpers in `src/lib/format.js` (`compactNum` + `trendYScale`, also
  used by CIM File Traffic). Constitution: `tests/trend-axis.test.mjs`.
- ✅ **Y-scale toggle:** ⚙ **"Y axis starts at 0"** on both widgets — zero-based
  (honest magnitude: Einstein reads `12K / 6K / 0` instead of `12K / 10K / 8K`)
  vs the default min–max view. Persists, exports, and round-trips like any
  config field.
- ✅ **Ask board assembly (ISSUE-44 Phase 3a, 2026-09-09):** 🧩 Whole board mode
  — describe a multi-widget need, get a complete wired board (params block +
  widgets + `{{param}}`/`{{widget:id}}` wiring) added **below** the current
  board with one-click Undo. See `docs/ISSUES.md` → ISSUE-44 Phase 3a and
  PR #40.

## GLAM & CIM — impact metrics (2026-08-13 → 09-08)

- ✅ **GLAM view-budget + 429-resilience fix (2026-09-08, verified live):** the 📈 widget's
  monthly pageview budget rose 150 → **2,000 pages** — the old top-150-by-weight cut was
  arbitrary (nearly every page has weight 1) and silently dropped high-traffic single-file
  pages: `Media from MIT OpenCourseWare` 2026-05 showed 495,949 views while the true total
  was 1,375,031 (GLAMorgan: 1,386,218 — 64% silently missing, Economy of India's 101,789
  views among the skipped). Live-verified after deploy: **1,375,031 / 158 files viewed — exact**.
  The partial state is quantified (`views partial (N of M pages)`; Total views stat marked
  `partial`) and rate-limited (429) fetches are now retried, with `· N pages failed` on the
  card if any view fetch still fails — never silently zeroed. Self-walk fallback `gulimit`
  also raised 100 → 500 (the Action API max)

- ✅ **CIM month-lag fix (2026-09-01):** the calendar's previous month isn't
  published until CIM's monthly job runs, so at month start every default-month
  CIM widget 404'd — and the disambiguation probe (built from the same month)
  misread that as "unregistered" for long-registered categories. Fixed:
  `latestCimMonth()` resolves the latest PUBLISHED month (bounded backward walk
  probing the global leaderboard, 1 h TTL cache); all 9 CIM fetchers default to
  it and probe against it; cards display the resolved month. Constitution:
  tests/cim-latest-month.test.mjs (date-relative, runs in any month).
  Verified live: Images_from_Metropolitan_Museum_of_Art resolves to 2026-07 =
  **389,030 files · 20,700 used · 404 wikis · 31,351 pages**
- ✅ **CIM File Spotlight image preview (2026-09-01):** 🔦 "Show image preview"
  (default ON) renders a 480px Commons thumb of the file above the stats,
  linked to the file page; best-effort fetch — a bad filename degrades to
  stats-only, never an error. Verified live: Queen Mother Pendant Mask- Iyoba
  MET DP231460.jpg → mask image + 60 wikis · 123 pages · 347,631 views (2026-07)
- ✅ **Interactive params verified cross-browser (2026-09-03):** the params-demo
  board (buttons + number slider + month stepper driving a Category Size widget
  and a CIM snapshot) passes a 3-engine matrix — Chromium, Firefox, WebKit:
  widgets rendered, 0 error frames, 0 severe console errors per engine
  (`npm run test:browsers`, scripts/browser-matrix.mjs)
- ✅ **Firefox/Safari CORS fix verified (2026-09-03):** full 30-widget catalog
  (+ Board Controls = 31) loaded in all three engines — was 60 CORS console
  errors in Firefox before the User-Agent-header fix (see
  docs/BUG-REPORT-ios-safari-fetch.md for the full diagnosis)
- ✅ **GLAM PetScan relay + budget ceiling (2026-08-17):** the GLAM widget's
  tree+usage flows through the same-origin `/api/petscan` relay (PetScan `giu`
  exact-ns — structural parity with glamtools, verified 518/38/38/40/2/110,092
  on XBio depth-1 2026-07); `fileBudget` honored up to **30,000** files
  end-to-end (self-walk fallback stays capped at 1,000; the relay's 25 MB byte
  cap + 60 s timeout are the real valves); client relay timeout matched to the
  server (75 s single attempt — the 15 s `fetchJSON` default was aborting the
  60 s server work and silently falling back). Verified live: People at
  Wikimania 2024 depth 5 → **2,832 files, capped: false** (the old ceiling
  truncated at 1,000); Wikimania 2026 depth 7 → 12,007 files under the new cap
- ✅ **Clickable GLAM/CIM links + depth UX (2026-08-17):** GLAM + CIM card
  category titles, the top-file header, and every per-page usage row link out
  in a new tab; zero-file scans explain themselves ("No files directly in this
  category — increase Depth to include subcategories" at depth 0); ⚙ panel
  shows semantic hints for Depth ("0 = category only, 1 = + direct subcats")
  and Excl depth
- ✅ **CIM widgets (2026-08-13):** 🎯📈🖼️🌍📄✍️🏆🔦 all 8 verified live against `Files_from_the_Biodiversity_Heritage_Library` — snapshot **305,868 files · 14,434 used · 252 wikis · 41,819 pages** (exact, no budget); trend (Jan 83.1M views); top files with thumbs (Dogs Plate XI 811,993); top wikis/pages/editors (SchlurcherBot 4,491); leaderboard (100 rows, UNESCO 6.6B); file spotlight (49 wikis · 346 pages · 811,993 views). Unregistered category → friendly register state (the 404 is ambiguous: disambiguation probe separates "not in CIM" from "no data for this month" — verified: BHL 2015-01 404s too). Month resolution is now publish-aware: default months resolve to the latest PUBLISHED month via `latestCimMonth()`, so the month-start publish lag can no longer masquerade as "unregistered" (fixed 2026-09-01)
- ✅ **CIM File Traffic (2026-08-14):** 📉 interactive chart — labeled axes (compact Y ticks `254K`/`1.2M`, month X labels, "views"/"month" titles), −/+ zoom slices 3/6/12/24 months client-side, header shows the displayed range; self-heals the CIM 500-on-12-month-window bug (verified: exact window `20250801/20260801` 500s from browsers while curl 200s; 11/13/30-month windows fine) by retrying with the earliest month dropped
- ✅ GLAM Category Usage: 500 files, 21/33 viewed, 235 pages on 58 wikis, 314,375 views (Featured pictures, 2026-07); top-file detail (Lion 97,121 views)
- ✅ GLAM detail: wiki names show as shorthand (`en.wikipedia`), full hostname
  on hover; category title no longer squished by the stats area (flex-shrink)

## Galleries, media & lists (2026-08-13 → 09-01)

- ✅ **Article Gallery (2026-08-13):** REST `/page/media-list` + batched
  imageinfo — Albert Einstein → 32 captioned images; caption-presence filter
  drops infobox flags/maps (verified: France's `Flag_of_France.svg` and all
  map SVGs have no caption); grid mode (small/medium/large) + list mode
  (thumb left, caption right); min-size filter (200px) for tiny icons;
  utm-stripped thumb URLs; example dashboard includes the gallery
- ✅ **Commons File Gallery (2026-08-13):** 🗂️ pasted list of Commons files → batched `imageinfo` (400px thumbs + description captions); grid + list modes, order listed/random/alpha/largest (verified: 3 files, alphabetical subtitle, list mode, random order), missing-file counting ("3 files · 1 not found"), adaptive 4,500-char batching for long filenames
- ✅ **Article List (2026-08-13):** 📋 pasted article titles → clickable rows (en/de/fr); optional enrichment adds 120px thumb + 3-line intro via batched `pageimages|extracts` (50/call — verified: 2 thumbs + 2 extracts for Ada Lovelace / Albert Einstein)
- ✅ **Video / Media Player (2026-08-16):** 🎬 native HTML5 playback of
  Commons video/audio — no player library (unlike the vendored Pannellum).
  One file or a jukebox playlist: batched `videoinfo` derivatives (one call
  per ≤4,500-char batch), VP9 WebM transcode per height-based quality
  (auto = largest ≤1080p, original as fallback), per-track video/audio
  auto-detect (mixed playlists render `<video>`/`<audio>` per track),
  next/prev + position, loop-playlist wrap, Fisher-Yates shuffle,
  autoplay with a browser-policy-aware ▶ Start pill (one click unlocks
  subsequent autoplay), kiosk-compatible; missing files counted in the
  subtitle — verified live: FA-18 refueling clip (480p VP9), EN-Abbe
  spoken article (audio), Leica 1927 (1080p). **Extended 2026-09-01:**
  "Show Commons description" (default ON) — the now-playing track shows its
  `ImageDescription` + `Artist · License` credit (verified: Dance reedit 2 →
  "Dance couple performing the cha cha." · Wpzhiyilee · CC BY-SA 3.0); plus
  a freeform **Markdown annotation** field for board captions
- ✅ **360° Panorama Viewer (2026-08-13):** Pannellum 2.5.7 (vendored,
  lazy-loaded as a separate 56 KB asset) renders real Commons
  equirectangular files — Imiloa grounds 12740×6370 verified live in the
  widget: WebGL canvas, drag-to-look-around (pixel-diff verified),
  auto-rotate, 2:1 + GPano detection with a "not 2:1" warning, display via
  iiurlwidth=4096 thumb instead of the 10–20 MB original. New: per-widget
  layout constraints (registry `defaultLayout` → react-grid-layout
  minW/minH/maxW/maxH) — panorama defaults to w:4 h:3, can't shrink below
  3×2 (verified by drag-resize). Config change re-fetches and rebuilds the
  viewer
- ✅ **Article Gallery show-all / grouping (2026-09-05, GitHub issue #3):** three new ⚙ options — **All images** (`includeAll`, default off: legacy captioned-only behavior unchanged) also shows caption-less `<gallery>` blocks and table lists (e.g. List of presidents of Harvard University: 1 → 30 images); **Hide decorative** (`hideDecorative`, default on, only with All images) drops caption-less flags/coats of arms/escudos/seals/emblems/logos/icons/locator maps/placeholders via a conservative filename heuristic verified against 12 real pages (zero content false positives; captioned files never filtered; disable to show everything); **Group by** (`groupBy`: none | section | gallery) renders group headers — section mode labels groups with real article headings via one `prop=tocdata` call ("Section: Childhood, youth and education"), gallery mode sets each `<gallery>` block off as its own "Gallery N" group. Empty state no longer claims "No captioned images found" in all-images mode; caption-less tiles show their file name; autoHeight accounts for group headers. minSize floor + batched imageinfo unchanged. Verified live end-to-end (Harvard / National Gallery London / Einstein).

## Article intelligence & power widgets (2026-08-13)

- ✅ **Article Vitals (2026-08-13):** Article Excerpt (REST summary — Ada
  Lovelace: description, thumbnail, first paragraph), Edit History (byte
  deltas + user + timestamp + comment, newest-first), Article Quality (Lift
  Wing ORES class — Albert Einstein → FA at 53.9%, full class distribution),
  WikiProject Assessment (18 projects, class + importance badges); config
  change re-fetches live; schema + example dashboard updated
- ✅ Top Wikipedia Articles: hatnote via proxy (en latest: top-10 of 100, 4
  noise items filtered incl. rank-1 `.xxx`); WMF fallback (de, ja — "via WMF
  Pageviews API"); specific date (fr 2026-07-14); filterNoise toggle shows
  `.xxx`/`.xyz` when off; topN 100=all (96 rows after filter); 100-row card
  scrolls internally
- ✅ Expanded view (⚙ checkbox): 120px thumbnails + intro extracts via the
  MediaWiki API (prop=pageimages|extracts) — Spider-Man poster, Lucy Davis
  photo; non-article pages (Main_Page, Special:*) filtered from both sources
- ✅ **SPARQL label resolution (2026-09-05, issue #6):** 🧠 QLever can't run `SERVICE
  wikibase:label` (it federates to a dead host), so QLever queries returned bare QIDs —
  every SPARQL result cell whose binding was a Wikidata entity URI now renders
  **"Label (QID)"** (e.g. `road (Q34442)`), batch-resolved via `wbgetentities`
  (≤ 50 ids/call, 24 h TTL, user-language-first with `en` fallback, best-effort — a label
  failure never fails the query). Works for any endpoint and any user query; vars with a
  `?xLabel` sibling (WDQS SERVICE convention) are left as bare QIDs
- ✅ **SPARQL Query (2026-08-13):** 🧠 verified live — Met collection depth 72,433 (StatCard); multi-institution bars (Met > Rijksmuseum > British Museum > Smithsonian); Women-in-Red **20.13%** via Humaniki (its bias_labels are authoritative — hardcoded QIDs give a wrong 79.7%); Commons top-depicts via QLever (25 bars, prefix block required); multi-column → table; bad query → themed error + Retry; preset select fills query+endpoint atomically; renderer override forces stat/bar/line/table
- ✅ **Wiki Page (2026-08-13):** 📄 static iframe embed — Wikimedia sends no X-Frame-Options / frame-ancestors (verified), so pages embed directly; desktop + mobile toggle (`?useformat=mobile` — MobileFrontend's preview param; the m. subdomains are retired and 301 to desktop, verified), section anchors, links browse inside the widget; verified live in browser (Help:Introduction desktop + mobile render, Albert_Einstein#Biography URL)

## Ask advisor, presentation chrome & grid (2026-08-15 → 16)

- ✅ **✨ Ask advisor (2026-08-16):** intent-first widget discovery — type
  what you want, get widget recommendations with pre-filled configs,
  click to add. Manifest generated from the registry (~3.7K tokens),
  /api/ask relay to Wikimedia's free LiftWing LLM (llm-qwen36-27b, no key,
  prompts not stored), server-side config normalization (invalid select
  values dropped, `commons.org`→`commons.wikimedia` aliases, `Category:`
  prefixes stripped, `File:` prefixes ensured), offline keyword fallback.
  Constitutions: tests/ask-validation.test.mjs (11 tests).
- ✅ **Gallery content-fit + grid density (2026-08-16):** Article Gallery /
  Commons File Gallery add at full width and auto-fit height to the image
  count (registry `autoHeight` → WidgetFrame → App row fitting, clamp
  3–14, stops after manual resize). Root cause of the old small/narrow
  default: react-grid-layout 2.2.4 silently moved `rowHeight`/`margin`/
  `cols` into the `gridConfig` prop (same drift as `dragConfig`) — the
  board rendered at RGL's 150px-row defaults; fixed, and guarded by
  `npm run smoke` (scripts/smoke-grid.mjs, geometry assertions).
- ✅ **Kiosk + Lean presentation modes (2026-08-15/16):** ⛶ Present
  (fullscreen, `?kiosk=1`) and ▣ Lean (chrome-free without fullscreen,
  `?lean=1` — resizable browser, iPad-app feel) hide all editing chrome,
  lock the grid, and tighten margins; Esc or the floating ✕ Exit returns
  (and strips the URL param so a refresh after leaving lands in normal
  mode); fullscreen only on the Present click (user-gesture rule),
  never on boot — verified live on the full 30-widget catalog including
  the mobile stack

## Output & AI nodes + request supersede (2026-09-05 → 09-09)

- ✅ **Speaker widget (🔊, PR #17):** the first *output* widget — speaks its
  resolved text via the Web Speech API. Safety-first: nothing speaks until ▶ is
  clicked once on the widget; `speakOnChange` (default off) only auto-speaks
  after that; a controller-global 🔊 mute writes a shareable `audioMuted` board
  param; one voice at a time (cancel-before-speak), rate clamped [0.5, 2].
  Zero-voice engines render a "No voice on this device" state with the text
  still shown — never an error. Verified live: 181-voice picker (macOS
  Chromium), degraded state on headless probes
- ✅ **Translator (MinT) widget (🌐, PR #21):** machine-translates its text
  (typed or `{{param}}`-driven) via Wikimedia MinT — **key-free, no proxy**
  (CORS `*` verified). 200+ languages on open NMT models, source/target codes,
  8,000-char cap flagged in the card, 24 h TTL cache, serving model surfaced
  for transparency. Verified live: EN → *"El jazz es un género musical que se
  originó en Nueva Orleans."* (`ES · nllb200-600M`)
- ✅ **Request-serial guard (ISSUE-57, PR #24):** `WidgetFrame.load()` claims a
  sequence number per run; a superseded success or failure returns before
  touching state, and unmount invalidates in-flight loads — a slow fetch under
  an old config/param can no longer clobber a newer result. Verified with a
  controlled race probe (first response delayed 15 s): with the guard the fresh
  result survives; with the guard removed the stale response wins
- ✅ **Article Excerpt emitter + unresolved-reference guard (ISSUE-58, 2026-09-09):**
  the excerpt card emits its first paragraph, so `text: "{{widget:<excerpt-id>}}"`
  feeds a Translator (verified live: EN extract → *"Albert Einstein fue un físico
  teórico nacido en Alemania…"*), Speaker or Markdown; changing the excerpt's
  article (e.g. via a board param) re-emits and the consumer re-fetches
  automatically. A widget that **fetches** now refuses to send an unresolved
  `{{widget:id}}`/`{{param}}` placeholder upstream — it shows a **"Waiting for a
  reference"** card and loads once the producer emits (verified: zero MinT/REST
  requests while unresolved). ⚙ lists the emitters as clickable
  `{{widget:<id>}}` chips under text fields (language-code fields opt out)
- ✅ **Board Controls per-card param scoping (ISSUE-59, 2026-09-09):** ⚙ → *Params
  on this card* checkboxes scope a card to a subset of the board's params
  (none checked = all). Verified live on the 4-widget board: an article-only
  card and a language-only card, chain Einstein → excerpt → `EN → FR`, then
  clicking **de** on the language card re-translates to `EN → DE`

## Demo suite, guide & resilience (2026-09-09)

- ✅ **Demo suite + hub (ISSUE-63):** 8 boards + **`?config=/demos.json`** — a hub whose Markdown index links every board in place. Onboarding: **Article switcher** (one param, two cards), translate, params, flow. Flagships: **GLAM — one template, five CIM-registered institutions** (Met 389k · LoC 631k · BHL 306k · NGA 54k · Rijksmuseum 6.9k files, collection + month switching), **Article vitals** (summary · traffic · ORES quality · WikiProject assessments · edits · images), **Query power** (WDQS + Humaniki + QLever). Extras: embed, full catalog. Constitution: `tests/demos.test.mjs` — every board validates, ids unique, **every `{{widget:id}}`/`{{param}}` resolves inside its board**, hub links exist, markdown link safety. All 10 boards verified live with 0 widget errors
- ✅ **Custom-URL embed (ISSUE-62):** a Wiki Page card can frame any http(s) page — http(s) only, bare domains get `https://`, unsafe schemes rejected with a visible error, external frames **sandboxed** (Wikimedia pages unchanged). Objectium GLB demo verified live
- ✅ **Rate-limit guards (ISSUE-61):** a shared HTTP layer caps concurrency at 4, paces after any 429, honors `Retry-After` as a global cool-down, retries a 429 at most once, and fails with an actionable message — a throttled IP backs off instead of hammering
- ✅ **User guide (ISSUE-60):** `docs/GUIDE.md` — the three-layer model (board params / widget config / dataflow), worked examples, troubleshooting, cookbook; linked from the README and the in-app ⓘ panel. Config URLs that return HTML or 404 now say so instead of "Unexpected token '<'"
- ✅ **Ask advisor manifest v3:** generated catalog with dataflow metadata + a system manual; `npm test` regenerates it first so it can't drift from the registry

## Constitutions, config loading & plumbing

- ✅ **Freshness constitution (2026-08-14):** all 26 live-querying widgets stamp their last-run time — `⏱ updated 10:17:27 AM · auto-refresh 1h` footer on every fetch widget (updates on every load incl. auto-refresh); verified live on the sample dashboard (26 stamped, markdown + Wiki Page exempt, 0 errors)
- ✅ **Panel reachability (ISSUE-54, 2026-09-09):** ⚙ config and ⓘ info panels
  scroll inside their card and pin their action (`Apply & Reload` / `Copy debug
  info`) to the bottom — previously a panel taller than its card was clipped by
  `.grid-item { overflow: hidden }` with no scrollbar, hiding the button and
  every field below the fold (21/35 widget types at the fresh-add w3 h3 size,
  25/35 at 1024px, 27/35 at 820px). The long "Name (instance id)" hint (7 lines
  on a 3-column card, 67–93px per panel) is now one line with a tooltip.
  Constitution: `npm run smoke:panels` — 240 measurements (⚙+ⓘ × 1440/1024/600
  × 40 widgets at w3 h3, offline), exit 1 on any clipped action; negative-tested
  against the pre-fix CSS. Wired into `npm run smoke`
- ✅ **All 30 data-driven widget types render live data in the browser; the 9
  static ones (Text/Markdown, QR Code, Board Controls, Speaker, Wiki Page,
  Text List, Filter Lines, Line Count, Value Display) render from config — no fetch**
- ✅ On-wiki config loading: `?config=…Commons:WikiPortraits/Bento-demo.json` → the whole board loads from an on-wiki page (its size tracks that page, not this repo)
- ✅ URL loading: `?config=/dashboard.json` (hosted), `#/d/<base64>` hash links (Share roundtrip), error banner + fallback on bad URLs
- ✅ w.wiki short URLs: `?config=https://w.wiki/TR9R` and bare `w.wiki/TR9R`
  expand via the same-origin `/api/resolve` endpoint and load the dashboard
- ✅ Export → Import roundtrip, validation errors shown for bad JSON, Example, About, Reset, localStorage persistence
- ✅ Production build: ~0.6 MB raw / ~175 KB gzipped (Vite output — exact byte
  counts change with every source change, so `npm run build` prints them and the
  docs-facts constitution bound-checks the magnitude)

## The starter board, re-verified (2026-08-12)

- ✅ Main Page pageviews: 218.4M views / 30 days (~7.28M/day)
- ✅ External links: 1,499 → LibreTexts.org; 2,850 all-namespaces / **2,320 articles-only** → gettyimages.com; 5,000+ cap indicator on youtube.com
- ✅ Top 10 Wikipedias: English 1st at 7,223,053 articles
- ✅ Category Size (WLM 2024): 239,084 items + random photo sample (6 thumbs, fresh per refresh)
- ✅ File Usage Map: image + summary caption (Blue Marble, 500px thumb)
- ✅ Text/Markdown card: markdown rendering verified (headings/bold/links/lists/code);
  Wikimedia images render by default, external hosts blocked with an opt-in toggle,
  XSS payloads (`<script>`, `onerror`) inert

- ✅ **2026-09-15 — IA Book** (`node scripts/ia-book-e2e.mjs`, 19/19): the page image **loaded**
  (`naturalWidth > 0`), not merely referenced; "page 1 of 16" comes from the manifest although the item
  metadata says `imagecount: 20`; the src is a IIIF image-service URL, never a hand-built `$N`; page
  turning moves the counter; the 15-thumbnail strip renders and its images load; search-inside ("goody")
  returns **22 hits**, each naming its page, and clicking one jumps the counter *and* loads the word's
  region crop; the OCR panel returns **1,849 chars** for that page; PDF/EPUB/OCR/DjVu links point at
  `archive.org/download`. Negatives: a page-less text item explains itself instead of showing an empty
  viewer, a bad identifier gives a friendly message, and there are no uncaught JS errors (the only console
  errors are the two statuses those fixtures exist to produce — 400 for the missing item, 500 for the item
  whose manifest 500s).

- ✅ **2026-09-15 — Internet Archive playback in a card** (10/10 assertions, demo board): the 11-minute
  Prelinger film reached `readyState ≥ 1` with **duration 664 s** and advanced to **1.37 s** on `play()`
  (`paused: false`), and a three-chapter LibriVox playlist did the same at **507 s / 1.54 s**. Both stream
  from `archive.org/download/` with no API call — a direct URL is the row — and the archive's Range
  responses (`206`, `content-range`) are why seeking works. Also confirmed there: the codec trap, that
  Chromium says `"probably"` for H.264 mp4 and `""` for Theora ogv, so the mp4 derivative is the one to
  offer first (`docs/INTERNET-ARCHIVE.md`).

- ✅ **2026-09-15 — PNG export of a book page** (ISSUE-80, part of the `smoke:iabook` run):
  the ⤓ menu offers **PNG** for the IA Book card with the reason "this widget's image host sends CORS, so
  the canvas stays clean", and clicking it downloads a real raster — **4,384,386 bytes**, a 2× PNG of the
  page (the previous behaviour was a disabled item and the old "this widget is HTML/CSS" tooltip).

- ✅ **2026-09-15 — facing pages, and right-to-left** (`npm run smoke:iabook`, 31 assertions): a spread
  renders two loaded page images, the counter reads "**pages 2–3 of 16**" in reading order, the earlier page
  is on the **left** in a left-to-right book, the strip highlights both leaves, **▶ advances a spread at a
  time (2 → 4)**, the shift control re-pairs the first leaf ("page 1" → "pages 1–2"), and — the assertion
  worth the whole run — on the Arabic scan `DarsENizami_DarjaAula_1stYear` (389 canvases,
  `viewingDirection: right-to-left`) the **later page sits on the left** ("Page 2 | Page 1") while the
  counter still reads "pages 1–2 of 389". Leaf 0 stands alone on both books until you advance.

- ✅ **2026-09-15 — the deploy, verified against production** (10/10, at
  `https://wikibento.toolforge.org/`, serving `index-D9YNjKJA.js`): the showcase catalog renders **41 cards
  with zero crashes**; `/internet-archive-demo.json` opens **both books in facing-pages mode** (the board
  sets it) and shows a facing pair with both page images loaded, and its film player reports
  `duration 664s`; `/anne-frank-mlk-demo.json` draws **21 timeline dots**; the older
  `/parallel-lives-demo.json` still renders; the front door loads a board; **no uncaught JS errors** on any
  board. Endpoints: `/api/resolve` 200, `/api/proxy` relaying to top.hatnote.com 200.

- 📏 **Measured, not a fixture** (`EB1926 - Supplement Volume 3.pdf`, 1,208 pages, 285 MB, transcribed on
  en.wikisource): a page render costs ~5 s on first request, and **every** page of the volume sits at quality
  level 1, "Not proofread" — bulk-imported OCR, never human-checked. That measurement is why the panel prints
  the grade, and why the demo uses something a hundred times smaller.
- ✅ **2026-09-15 — the Document Reader** (`npm run smoke:document`, **24 assertions**, real Commons files):
  a 2-page PDF reports "page 1 of 2" from `imageinfo` and renders a page on the API's host; typing **2** jumps
  and loads page 2; typing **999** **clamps** to page 2 (the server does the same: page 189 of 188 returns
  188); a 329-page book reports its count and reaches page 329 by number; the zoom ladder **stops at 960 px**
  and `+` disables there; a **DjVu** behaves identically *given as a URL*, its last page (96) renders, and it
  reads as facing pages ("pages 2–3 of 96") with the strip highlighting both; the header reads "96 pages ·
  DjVu · 17.6 MB · 1024×730 page"; the links go to the file page and to the original; **PNG export is
  offered** (Wikimedia page renders send CORS); a JPEG is refused politely, with its way out. Demo board:
  4 cards (329 / 96 / 16 pages), two showing facing pairs — **9 assertions**.

- ✅ **2026-09-15 — the Document Reader deploy, verified against production** (14/14, serving
  `index-YJ87Jsl0.js`): `/document-reader-demo.json` renders 4 cards whose documents report **329 / 96 / 16
  pages**, and the DjVu reaches **page 96 of 96** in production; the showcase catalog renders **42 cards**
  (including the new Document Reader) with zero crashes; `/internet-archive-demo.json` still opens its books
  as facing pages; `/anne-frank-mlk-demo.json` still draws 21 timeline dots; `/api/resolve` and `/api/proxy`
  both 200; the front door loads a board; **no uncaught JS errors**.

- ✅ **2026-09-15 — the Wikisource text layer (v1.1), made sticky** (`npm run smoke:document`, **37**
  assertions): the transcription is **showing the moment the card loads**, with ¶ already pressed, and an
  untranscribed card has no panel at all; moving to page 19 **updates it without a click** (1,458 characters,
  "EN.WIKISOURCE · VALIDATED"); one more turn keeps it open with **different words** (1,598 characters); ¶
  closes it and pressing it again restores the current page. The fixture is deliberately small — a **38-page, 0.89 MB**
  DjVu, not the 285 MB reference set the traps were found on): a work with a transcription reports "page 1 of
  38" and grows a **¶ button**; a DjVu with **no** transcription has none; pressing it on page 19 shows
  **1,458 characters** of readable text under **"en.wikisource · Validated"**, linking to
  `…/wiki/Page:%22Homo_Sum%22_…_anthropologist.djvu/19`; **no raw markup** survives — an assertion that, run
  against a full 10 KB page, caught a wikitable that the trimmed unit fixtures had missed, and that
  templates were being expanded after tables.

- ✅ **2026-09-15 — the Wikisource text layer, verified against production** (17/17, serving
  `index-B8NGcYXL.js`): `/document-reader-demo.json` renders five cards whose documents report **329 / 96 / 38
  / 16 pages**; the transcribed card grows a **¶ button** and an untranscribed one does not; **page 19 shows
  1,458 characters** under **"EN.WIKISOURCE · VALIDATED"**, linked to Wikisource; the showcase catalog renders
  **42 cards** with zero crashes; the IA and 1929 boards are unchanged; `/api/resolve` and `/api/proxy` both
  200; **no uncaught JS errors**.

- ✅ **2026-09-15 — the sticky transcription panel, verified against production** (8/8, serving
  `index-BEaAHn9L.js`): the panel is **showing as soon as the card loads** with ¶ already pressed; the
  untranscribed cards have no panel; **page 19 updates it without a click** (1,458 characters,
  "EN.WIKISOURCE · VALIDATED"); **page 20 keeps it open with different words** (1,598 characters); ¶ closes it
  and restores the current page; no uncaught JS errors.
