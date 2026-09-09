# Demo Concepts — showing off WikiBento ("Voyager, revisited")

*Prepared 2026-09-08. A bank of demo/showcase concepts to show WikiBento's
potential to funders, GLAM partners, the working group, and the public.
Inspiration: Bob Stein's Voyager Company CD-ROMs (1980s–90s) — the first
medium to treat "content + interaction + design" as one artifact. The idea:
**revamp / revisit** those landmark experiences as *live, collaborative,
data-linked* boards.*

*Companion to `WIDGET-IDEAS.md` (widget proposals), `ROADMAP.md`
(prioritized plan), `MODULARITY-AND-DATAFLOW.md` (params + dataflow),
`docs/BOARD-COMPOSITION.md` (complete wiring reference for all 37 widgets),
and `docs/AGENT-MEMO.md` (conventions). Each entry lists what's on the board,
which widgets are shipped vs. needed, and the venue it fits.*

---

## §0 Provenance — the actual Voyager record (corrected)

Bob Stein co-founded **The Voyager Company** in 1984 (with Aleen Stein);
Voyager pioneered the CD-ROM as a serious medium for interactive literature,
multimedia scholarship, and film study, and its laser-disc arm became the
**Criterion Collection**. Stein later founded the **Institute for the Future
of the Book** (CommentPress, Sophie, social reading) — the same "the book is
a platform, not an object" through-line that WikiBento's config-as-data
boards continue.

**⚠️ Correction to the earlier brainstorm list:** three of the titles given
do not match the historical record, so this document anchors on verified
Voyager titles instead:

- ❌ *"The Electronic Shakespeare" (1987)* — no such Voyager title. Voyager's
  Shakespeare project was **"Voyager Shakespeare: Macbeth" (1994)** (ed.
  A.R. Braunmuller, produced by Michael E. Cohen). "Electronic Shakespeare"
  was an **Oxford University Press** text product (1989). Voyager was
  founded 1984 and its first CD-ROM landmark came in 1989 — a 1987 Voyager
  CD-ROM is implausible.
- ❌ *"The Secret of the Andes" (1989) interactive novel* — no such Voyager
  title. *Secret of the Andes* is **Ann Nolan Clark's 1952 Newbery
  Medal-winning children's novel** (Viking Press). Voyager's 1989 landmark
  was Beethoven's Ninth (below).
- ❌/⚠️ *NYRB CD-ROM* — unverified; omit.

**Verified anchors** (with sources in §Sources):

| Voyager work | What it did (features that map) |
|---|---|
| **Beethoven's Symphony No. 9** (1989; "companion" by Robert Winter) — widely cited as the **first interactive multimedia CD-ROM** (audio CD + program on one disc) | Synchronized score + audio; structural analysis; commentary; scholarly essays — listening made into reading |
| **Voyager Shakespeare: Macbeth** (1994) | Full play text **synchronized to an RSC audio reading**; 8 film extracts with screenplay text; essays incl. Holinshed; **maps as portals** (Scotland, Shakespeare's London); "**Shakespeare Karaoke**" (act along); note-taking with export |
| **A Hard Day's Night** (~1994) | Beatles film analyzed frame-by-frame with commentary — Voyager's most successful single product after the CD series |
| **First Person** (1994) | Multimedia essays by thinkers (Minsky et al.) — the interview as interactive object |
| **The Complete Maus, Who Built America?, expanded books line, Criterion** | Serious scholarship and history as rich media; "expanded books" = the book with layers |

## §1 The Voyager recipe → WikiBento mechanism

What made those discs transformative, and the WikiBento mechanism that
revives it:

| Voyager pattern | WikiBento mechanism (shipped or planned) |
|---|---|
| Annotated primary text w/ synchronized media (audio/video linked line-by-line) | `mediaPlayer` widget + excerpt/article cards on one board; playbackRange; params pick the section |
| Layers of commentary around one artifact (essays, glossary, notes) | Per-widget ⓘ provenance + markdown/notes cards + `{{param}}`-driven reframing |
| "Karaoke" participation (perform along with the text) | Media player + synchronized excerpt; Speaker (TTS) widget for narration |
| Maps as portals into content | Map family (WIDGET-IDEAS) + photo map + panorama360 |
| Deep artifact treatment (zoom into the object) | Gallery/spotlight + **IIIF deep-zoom viewer** (idea-banked) |
| Curated sequence (presentation/tour) | **Presentation-as-data** steps (borrowed from Tapestry eval); kiosk/lean mode |
| The reader's path is stored (notes/annotations) | Board params + config-as-data = the "reader's path" IS the URL |
| Static, finished artifact | **Live**: the board re-queries Wikimedia every refresh — the ⏱ footer is the proof it isn't a screenshot |

## §2 Demo concepts

Legend: ⭐ wow factor · effort S/M/L · "(needs: X)" = idea-bank dependency.

### A. "Beethoven's Ninth, Revisited" — annotated listening ⭐⭐⭐⭐⭐ · M
The 1989 landmark, live. A board about one symphony where the Board Controls
select the **movement** (`{{movement}}`) and everything ripples: `mediaPlayer`
(Commons recording, playback range per movement), article excerpt + quality
card, gallery of score pages/era artifacts, SPARQL card (composer/work
graph), pageviews trend.
*(needs: nothing for v1 — all shipped; IIIF deep-zoom of a public-domain
score for the full effect)*
**Venue:** funder meetings; musicology/edu; "listening is reading" pitch.

### B. "Macbeth, the Living Variorum" — the Voyager Shakespeare, revisited ⭐⭐⭐⭐⭐ · S–M
Pick a play/character via params → article vitals (excerpt/quality/
assessments/edithistory), gallery of performance imagery, `mediaPlayer` +
synchronized text (the "karaoke" moment), SPARQL character/actor graph.
The point: an academic edition whose apparatus is **alive** — it shows who
edited it, what's trending, what citations are rotting.
**Venue:** humanities departments; Shakespeare 400-style events.

### C. "A Hard Day's Night, Revisited" — the deep-dive album ⭐⭐⭐⭐ · M
Pop-culture as scholarship: article + `mediaPlayer` (Commons recordings) +
gallery + pageviews trend + top editors + (future) SPARQL **force-graph**
renderer of the band/film's Wikidata neighborhood.
*(needs: force-graph renderer)*
**Venue:** "the web is the new record album" — general/edu audiences.

### D. "The Expanded Book" — Wikisource as the Voyager book ⭐⭐⭐⭐ · M–L
A public-domain work as a layered object: proofread progress + author shelf +
scan/text viewer + article excerpt + citation/ref-rot health + audio reading.
*(needs: Wikisource widget family — proofread progress, author shelf, page
scan+text viewer; LibriVox source)*
**Venue:** libraries, GLAM digitization partners, Wikisource communities.

### E. "The Museum in a Bento" — one template, N institutions ⭐⭐⭐⭐⭐ · S
The ISSUE-50 templating hero: a Board Controls select switches institution
(Met → Smithsonian → Cleveland) and the ripple is total — CIM snapshot/
trend/top files/top pages, GLAM usage, gallery slideshow, file spotlight.
*(needs: nothing core — CIM family shipped; add photo map + IIIF + spike
alert for the "wow" wall)*
**Venue:** GLAM boardrooms; the demo that sells WikiBento to institutions.

### F. "The Story of an Article" — biography of knowledge ⭐⭐⭐⭐ · M
One article as a living biography: edit history, pageviews with spike
detection ("the day it went viral"), quality/assessments, talk-page pulse,
who-the-editors-are. A dataflow chain (ISSUE-52) can feed a summary card
from the raw lists.
*(needs: spike alert; talk-page monitor)*
**Venue:** working-group storytelling; "who built this, and who reads it?"

### G. "The Living Encyclopedia Wall" — happening now ⭐⭐⭐⭐ · M
Kiosk/lean board: top-read-today + live edit stream + movement health
(traffic/editors/registrations) + random article spotlight. The encyclopedia
as a heartbeat.
*(needs: EventStreams live feed; movement-health family ISSUE-28)*
**Venue:** Wikimania, conferences, office lobbies.

### H. "Ask → Instant Research Board" ⭐⭐⭐⭐⭐ · L
Type a sentence ("show me a GLAM overview of the Met, with its trending
files") → Ask assembles the board (ISSUE-44 multi-widget phase). The demo
that ends scripting.
*(needs: Ask phases 2–3 — multi-widget board assembly)*
**Venue:** every future demo, once it exists.

### I. "Public Domain Day" — the January ritual ⭐⭐⭐ · S
Seasonal board: what entered the public domain this year + newly-PD tracker +
spotlight works (Wikisource/Commons) + the annual essay/article.
*(needs: Public-Domain Day tracker)*
**Venue:** press cycle each Jan 1; libraries; PD advocacy.

### J. "The 360° Collection" — stand inside the archive ⭐⭐⭐⭐ · S–M
`panorama360` viewer + a category of 360° images + (future) photo map with
panorama pins: click a pin → stand in that place.
*(needs: photo map; most else shipped)*
**Venue:** museum lobby kiosks; WLM aftermath; tourism/heritage.

### K. "Coverage of the World" — the movement, spatialized ⭐⭐⭐⭐ · L
World choropleth of per-country article presence/quality + translation-gap
monitor: "what does the world's encyclopedia cover?" — the decline/
participation story made geographic.
*(needs: choropleth + translation-gap widgets)*
**Venue:** research/gov audiences; the prime-directive conversation.

## §3 The demo playbook (mechanics every demo shares)

1. **A demo is a `dashboard.json`**, hosted (public/ or an on-wiki page) and
   reachable via a short `?config=` link (w.wiki) or a self-contained
   `#/d/<hash>` for email/offline.
2. **Params are the interactivity.** Put a Board Controls card on the board
   (`{{param}}`) instead of hiding controls; in kiosk/lean mode params are
   the touch surface. Deep-link any state via URL params (ISSUE-40).
3. **Present:** `?lean=1` (no fullscreen) or `?kiosk=1` (fullscreen), Esc or
   ✕ Exit returns. Embed boards in partner sites via iframe for GLAM walls.
4. **Narrate:** Speaker (TTS) widget can voice a guided tour in kiosk mode.
5. **Live is the feature:** the ⏱ freshness footer and resolved temporal
   subtitles prove the board is querying Wikimedia right now — never disable
   them in a demo (they're the anti-screenshot proof).
6. **Two-screen mode:** presenter board + audience board on the same config
   for talks.
7. **Cold-start safe:** every demo must load from a fresh browser, no
   OAuth, no persisted state — TTL caches make repeat visits cheap.

## §4 Where demos map to the backlog

| Demo | New widgets/features needed (banked in WIDGET-IDEAS / ISSUES) | Effort |
|---|---|---|
| A Beethoven | IIIF deep-zoom (nice-to-have) | M (core shipped) |
| B Macbeth | — | S–M |
| C Hard Day's Night | SPARQL force-graph renderer | M |
| D Expanded Book | Wikisource family (proofread/author/scan-text); LibriVox | M–L |
| E Museum in a Bento | photo map, IIIF, spike alert (add-ons) | S core |
| F Story of an Article | spike alert; talk-page monitor | M |
| G Living Wall | EventStreams feed; movement health | M |
| H Ask Board | Ask multi-widget assembly | L |
| I Public Domain Day | PD tracker | S |
| J 360 Collection | photo map + panorama pins | S–M |
| K Coverage of the World | choropleth; translation-gap | L |

**Suggested first three to actually build:** **A** (all shipped, best
Voyager story), **E** (the institutional sale), **B** (cheapest full
"revisited" demo).

## §5 Voyager CD-ROM Catalog — Full Board Wiring

Every verified Voyager CD-ROM title from the [Wikipedia list](https://en.wikipedia.org/wiki/Voyager_Company#CD-ROMs), organized by theme, with the WikiBento widgets that would recreate each experience. Each entry includes a **board wiring diagram** (which widgets to chain together) and a **difficulty rating** (S = shipped, M = needs minor work, L = needs new widgets).

### Theme 1: Film & Cinema

| Voyager title | What it did | WikiBento board wiring | Difficulty |
|---|---|---|---|
| **Beethoven's Symphony No. 9** (1989) | First interactive multimedia CD-ROM; synchronized score + audio; structural analysis | `excerpt` → `translate` + `speaker` + `mediaPlayer` (Commons recordings) + `gallery` (score pages) + `cimTrend` (view trend) + `sparql` (composer/work graph) | S (all shipped) |
| **Voyager Shakespeare: Macbeth** (1994) | Full play text synced to RSC audio; 8 film extracts; essays; maps; "Shakespeare Karaoke" | `boardControls` (act selector) → `excerpt` → `translate` + `speaker` + `gallery` (performance imagery) + `mediaPlayer` (RSC clips) + `edithistory` + `quality` + `assessments` + `sparql` (character/actor graph) | S (all shipped) |
| **A Hard Day's Night** (~1994) | Beatles film analyzed frame-by-frame with commentary | `excerpt` → `translate` + `speaker` + `gallery` + `mediaPlayer` (Commons recordings) + `pageviews` + `edithistory` + `sparql` (band/film graph) | S (all shipped) |
| **Boyz n the Hood** | Film analysis | Same pattern as A Hard Day's Night | S |
| **Bram Stoker's Dracula** | Film analysis | Same pattern | S |
| **The Killer** | Film analysis | Same pattern | S |
| **The Man Who Fell to Earth** | Film analysis | Same pattern | S |
| **The Player** | Film analysis | Same pattern | S |
| **Cries and Whispers** | Film analysis | Same pattern | S |
| **Damage** | Film analysis | Same pattern | S |
| **Polyester** | Film analysis | Same pattern | S |
| **Ugetsu** | Film analysis | Same pattern | S |
| **Painters Painting** | Art film | `excerpt` + `gallery` + `mediaPlayer` + `cimSnapshot` (art images) | S |
| **Comic Book Confidential** | Comics documentary | `excerpt` + `gallery` + `articleList` (comics titles) | S |
| **Mystery Science Theater 3000: The CD-ROM** | Riffing on B-movies | `listSource` (films to riff) → `filterLines` → `articleList` → `excerpt` → `translate` + `speaker` + `gallery` | S |
| **Poetry in Motion** / **Poetry in Motion II** | Poetry on film | `listSource` (poems) → `articleList` → `excerpt` → `speaker` (TTS narration of poems) | S |
| **This Is Spinal Tap** | Mockumentary | `excerpt` + `gallery` + `mediaPlayer` + `pageviews` | S |
| **For All Mankind** | Space documentary | `excerpt` + `gallery` + `mediaPlayer` + `cimSnapshot` (space images) | S |
| **The Day After Trinity** | Nuclear documentary | `excerpt` + `gallery` + `cimSnapshot` + `sparql` (nuclear weapons graph) | S |
| **The Inland Sea** | Travel documentary | `excerpt` + `gallery` + `panorama360` (if available) | S |

### Theme 2: Music & Performance

| Voyager title | What it did | WikiBento board wiring | Difficulty |
|---|---|---|---|
| **The CD Companion to Beethoven's Ninth Symphony** | Synchronized score + audio; structural analysis | `excerpt` → `translate` + `speaker` + `mediaPlayer` (audio) + `gallery` (score) + `sparql` (composer graph) | S |
| **The CD Companion to Mozart's Dissonant Quartet** | Classical music companion | Same pattern as Beethoven | S |
| **The CD Companion to Dvorak's New World Symphony** | Classical music companion | Same pattern | S |
| **The CD Companion to Stravinsky's The Rite of Spring** | Classical music companion | Same pattern | S |
| **The Trout Quintet** | Chamber music | `mediaPlayer` (audio) + `excerpt` + `gallery` | S |
| **All My Hummingbirds Have Alibis** (Morton Subotnick) | Electronic music | `mediaPlayer` + `excerpt` + `gallery` | S |
| **Devo: The Complete Truth About De-Evolution** | Music documentary | `excerpt` + `gallery` + `mediaPlayer` + `pageviews` | S |
| **The Residents: Twenty Twisted Questions** | Music documentary | Same pattern | S |
| **The Residents: Freak Show** | Music/performance | Same pattern | S |
| **Baseball's Greatest Hits** | Sports compilation | `listSource` (games) → `articleList` → `excerpt` + `mediaPlayer` (audio clips) | S |
| **The Beat Experience** | Music/culture | `excerpt` + `gallery` + `mediaPlayer` + `pageviews` | S |
| **A Hard Day's Night** | Beatles film + music | See Film & Cinema above | S |

### Theme 3: Museums & Art

| Voyager title | What it did | WikiBento board wiring | Difficulty |
|---|---|---|---|
| **The National Gallery of Art** | Museum collection on disc | `cimSnapshot` (NGA images) + `cimTrend` + `cimTopFiles` + `cimTopPages` + `cimTopEditors` + `cimLeaderboard` + `gallery` + `fileUsage` + `markdown` (curator's notes) | S (all shipped) |
| **The Louvre** | Museum collection on disc | Same pattern as NGA, using `Images from the Louvre` category | S |
| **With Open Eyes: Images from the Art Institute of Chicago** | Art collection | `cimSnapshot` (AIC images) + `cimTrend` + `cimTopFiles` + `gallery` + `articleList` (key artworks) + `sparql` (artist graph) | S |
| **First Emperor of China** | Historical artifacts | `excerpt` + `gallery` + `cimSnapshot` + `cimTrend` | S |
| **Sacred and Secular: The Aerial Photography of Marilyn Bridges** | Photography | `excerpt` + `gallery` + `cimSnapshot` + `panorama360` | S |
| **Truths & Fictions – A Journey from Documentary to Digital Photography** | Photography history | `excerpt` + `gallery` + `cimTrend` + `markdown` | S |

### Theme 4: Cities & Cultures

| Voyager title | What it did | WikiBento board wiring | Difficulty |
|---|---|---|---|
| **De Italia** | Italy exploration | `excerpt` (Italy) + `gallery` + `cimSnapshot` + `cimTrend` + `markdown` | S |
| **Vienna** | City exploration | `excerpt` + `gallery` + `cimSnapshot` + `cimTrend` + `panorama360` + `markdown` | S |
| **Vancouver** | City exploration | `excerpt` + `gallery` + `cimSnapshot` + `cimTrend` + `markdown` | S |
| **Exotic Japan** | Japanese culture | `excerpt` + `gallery` + `cimSnapshot` + `cimTrend` + `markdown` | S |
| **The Vancouver Disc** | City exploration | Same pattern as Vancouver | S |

### Theme 5: Literature & Ideas

| Voyager title | What it did | WikiBento board wiring | Difficulty |
|---|---|---|---|
| **The Complete Hitchhiker's Guide to the Galaxy** | Interactive novel | `listSource` (sci-fi works) → `filterLines` → `articleList` → `excerpt` → `translate` + `speaker` + `quality` | S |
| **The Complete Annotated Alice in Wonderland** | Annotated novel | `excerpt` + `gallery` + `translate` + `speaker` + `edithistory` + `markdown` (annotations) | S |
| **The Complete Maus** | Graphic novel | `excerpt` + `gallery` + `edithistory` + `quality` + `assessments` + `markdown` | S |
| **The Complete Stories, Volume 1** (Asimov) | Short stories | `listSource` → `articleList` → `excerpt` → `translate` + `speaker` | S |
| **Invisible Man** (Ellison) | Novel | `excerpt` + `gallery` + `edithistory` + `quality` | S |
| **Amusing Ourselves to Death** / **Brave New World** | Media criticism | `excerpt` + `translate` + `speaker` + `edithistory` + `quality` + `markdown` | S |
| **Who Built America?** | History | `excerpt` + `gallery` + `edithistory` + `cimSnapshot` + `markdown` | S |
| **The Society of Mind** (Minsky) | AI/philosophy | `excerpt` + `translate` + `speaker` + `edithistory` + `quality` | S |
| **Genius: The Life and Science of Richard Feynman** | Biography | `excerpt` + `gallery` + `edithistory` + `quality` + `sparql` (scientist graph) | S |
| **Stephen Jay Gould On Evolution** | Science | `excerpt` + `gallery` + `edithistory` + `quality` + `sparql` (evolution graph) | S |
| **Understanding McLuhan** | Media theory | `excerpt` + `translate` + `speaker` + `edithistory` + `markdown` | S |
| **First Person: The Society of Mind** | Interview | `excerpt` + `speaker` + `translate` + `markdown` | S |
| **First Person: Mumia Abu-Jamal** | Interview | Same pattern | S |
| **First Person: Donald Norman** | Interview | Same pattern | S |
| **American Poetry: The Nineteenth Century** | Poetry | `listSource` → `articleList` → `excerpt` → `speaker` | S |
| **I Photograph To Remember / Fotografio Para Recordar** | Photography | `excerpt` + `gallery` + `cimSnapshot` | S |

### Theme 6: Science & Exploration

| Voyager title | What it did | WikiBento board wiring | Difficulty |
|---|---|---|---|
| **The Invisible Universe** | Astronomy | `excerpt` + `gallery` + `cimSnapshot` + `sparql` (astronomy graph) | S |
| **Planetary Taxi** | Interactive solar system | `excerpt` + `gallery` + `cimSnapshot` + `wikiPage` (NASA pages) | S |
| **Dazzleoids** | Interactive children's | `excerpt` + `gallery` + `mediaPlayer` | S |
| **Circus!: An Interactive Cartoon** | Interactive children's | `excerpt` + `gallery` + `mediaPlayer` | S |
| **Silly Noisy House** | Interactive children's | `excerpt` + `gallery` + `mediaPlayer` | S |
| **Rodney's Wonder Window** | Interactive children's | Same pattern | S |
| **So I've Heard: A Collector's Guide to Compact Discs** | Media history | `excerpt` + `gallery` + `markdown` + `pageviews` | S |

### Theme 7: History & Politics

| Voyager title | What it did | WikiBento board wiring | Difficulty |
|---|---|---|---|
| **The Great Quake of '89** | Earthquake documentary | `excerpt` + `gallery` + `cimSnapshot` + `markdown` | S |
| **Amnesty Interactive** | Human rights | `excerpt` + `gallery` + `cimSnapshot` + `markdown` | S |
| **Our Secret Century: The Darker Side of the American Dream** | Archival film | `listSource` → `articleList` → `excerpt` + `gallery` + `cimTrend` | S |
| **Ephemeral Films 1931–1960** | Sponsored film archive | `listSource` → `articleList` → `excerpt` + `gallery` + `cimTrend` + `markdown` | S |
| **Salt of the Earth** | Labor history | `excerpt` + `gallery` + `edithistory` + `markdown` | S |
| **Call It Home: The House That Private Enterprise Built** | Architecture | `excerpt` + `gallery` + `cimSnapshot` + `markdown` | S |
| **François Truffaut: 25 Years, 25 Films** | Filmography | `listSource` → `articleList` → `excerpt` + `gallery` + `pageviews` | S |
| **The Voyager Videostack** | Video compilation | `mediaPlayer` (video playlist) + `gallery` + `markdown` | S |
| **The Voyager Audiostack** | Audio compilation | `mediaPlayer` (audio playlist) + `excerpt` + `markdown` | S |

### Theme 8: Interactive & Games

| Voyager title | What it did | WikiBento board wiring | Difficulty |
|---|---|---|---|
| **Dazzleoids** | Interactive children's game | `excerpt` + `gallery` + `mediaPlayer` | S |
| **Circus!: An Interactive Cartoon** | Interactive children's | Same pattern | S |
| **Silly Noisy House** | Interactive children's | Same pattern | S |
| **Rodney's Wonder Window** | Interactive children's | Same pattern | S |
| **Planetary Taxi** | Interactive solar system | `excerpt` + `gallery` + `cimSnapshot` + `wikiPage` | S |

### Theme 9: Criterion Collection (LaserDisc / Film)

| Voyager title | What it did | WikiBento board wiring | Difficulty |
|---|---|---|---|
| **Criterion Goes to the Movies** | Film criticism | `excerpt` + `gallery` + `mediaPlayer` + `edithistory` + `quality` + `markdown` | S |
| **Blam! 1 CD-ROM** | Interactive fiction | `excerpt` + `gallery` + `mediaPlayer` + `markdown` | S |

### Theme 10: The Expanded Books Line

| Voyager title | What it did | WikiBento board wiring | Difficulty |
|---|---|---|---|
| **The Complete Maus** | Graphic novel with layers | `excerpt` + `gallery` + `edithistory` + `quality` + `assessments` + `markdown` | S |
| **The Complete Hitchhiker's Guide** | Interactive novel with layers | See Literature & Ideas above | S |
| **The Complete Annotated Alice in Wonderland** | Annotated novel with layers | See Literature & Ideas above | S |
| **Virtual Light** (Gibson) | Novel with layers | `excerpt` + `gallery` + `edithistory` + `quality` + `markdown` | S |
| **Neuromancer / Count Zero / Mona Lisa Overdrive** (Gibson) | Sprawl trilogy | `listSource` → `articleList` → `excerpt` → `translate` + `speaker` | S |
| **Zen and the Art of Motorcycle Maintenance / Lila** (Pirsig) | Philosophy with layers | `excerpt` + `translate` + `speaker` + `edithistory` + `quality` + `markdown` | S |

### Wiring Legend

| Symbol | Meaning |
|---|---|
| `excerpt` | Article Excerpt widget — emits first paragraph |
| `translate` | Translator widget — consumes excerpt via `{{widget:<id>}}` |
| `speaker` | Speaker widget — consumes excerpt via `{{widget:<id>}}` |
| `gallery` | Article Gallery — images from the article |
| `mediaPlayer` | Video/Media Player — audio/video playback |
| `cimSnapshot` | CIM Category Snapshot — exact precomputed stats |
| `cimTrend` | CIM Views Over Time — monthly trend |
| `cimTopFiles` | CIM Top Files — most-viewed files |
| `cimTopPages` | CIM Top Pages — pages using the files |
| `cimTopEditors` | CIM Top Editors — top contributors |
| `cimLeaderboard` | CIM Global Leaderboard — top 100 categories |
| `fileUsage` | File Usage Map — cross-wiki usage |
| `listSource` | Text List — entry point for curated lists |
| `filterLines` | Filter Lines — refine a list |
| `articleList` | Article List — clickable rows with thumbnails |
| `pageviews` | Article Pageviews — traffic stats |
| `edithistory` | Edit History — editorial activity |
| `quality` | Article Quality (ORES) — predicted class |
| `assessments` | WikiProject Assessment — project banners |
| `sparql` | SPARQL Query — graph/table queries |
| `boardControls` | Board Controls — param UI (buttons, select, month stepper) |
| `markdown` | Text/Markdown — curatorial notes |
| `wikiPage` | Wiki Page — embed external pages |
| `panorama360` | 360° Panorama Viewer — immersive images |

---

## §Sources

- Voyager Company (Wikipedia): https://en.wikipedia.org/wiki/Voyager_Company#CD-ROMs
- WikiBento manifest: `public/manifest.json` (37 widget types)
- WikiBento board composition guide: `docs/BOARD-COMPOSITION.md`
- WikiBento demo ideas: `docs/DEMO-IDEAS.md`
- WikiBento data sources: `docs/DATA-SOURCES.md`
- WikiBento JSON format: `docs/JSON-FORMAT.md`
- WikiBento widget development: `docs/WIDGET-DEVELOPMENT.md`
- WikiBento guide: `docs/GUIDE.md`
- WikiBento modularity & dataflow: `docs/MODULARITY-AND-DATAFLOW.md`
- EESE review of *Voyager Shakespeare: Macbeth* (Braunmuller/Rodes/Cohen):
  webdoc.sub.gwdg.de/edoc/ia/eese/reviews/bein/mac88.html — RSC audio, film
  extracts, karaoke, maps, note export.
- "From Book to Screen: A Window on Renaissance Electronic Texts" (Wikibooks)
  — Macbeth (Voyager, 1994) edition citation.
- History of Information: "The Voyager Company Issues Beethoven's Ninth"
  (historyofinformation.com/detail.php?id=4784); archival video "The first
  interactive multimedia CD-ROM (1989) — Beethoven's Ninth Symphony by
  Voyager".
- The Digital Antiquarian (filfre.net, tag: voyager) — A Hard Day's Night as
  Voyager's most successful single product; Who Built America?.
- readonlymemory.net — Voyager discography (First Person, Kerouac ROM-nibus,
  A Hard Day's Night…).}
- EESE review of *Voyager Shakespeare: Macbeth* (Braunmuller/Rodes/Cohen):
  webdoc.sub.gwdg.de/edoc/ia/eese/reviews/bein/mac88.html — RSC audio, film
  extracts, karaoke, maps, note export.
- "From Book to Screen: A Window on Renaissance Electronic Texts" (Wikibooks)
  — Macbeth (Voyager, 1994) edition citation.
- History of Information: "The Voyager Company Issues Beethoven's Ninth"
  (historyofinformation.com/detail.php?id=4784); archival video "The first
  interactive multimedia CD-ROM (1989) — Beethoven's Ninth Symphony by
  Voyager".
- The Digital Antiquarian (filfre.net, tag: voyager) — A Hard Day's Night as
  Voyager's most successful single product; Who Built America?.
- readonlymemory.net — Voyager discography (First Person, Kerouac ROM-nibus,
  A Hard Day's Night…).
