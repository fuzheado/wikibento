# Demo Concepts — showing off WikiBento ("Voyager, revisited")

*Prepared 2026-09-08. A bank of demo/showcase concepts to show WikiBento's
potential to funders, GLAM partners, the working group, and the public.
Inspiration: Bob Stein's Voyager Company CD-ROMs (1980s–90s) — the first
medium to treat "content + interaction + design" as one artifact. The idea:
**revamp / revisit** those landmark experiences as *live, collaborative,
data-linked* boards.*

*Companion to `WIDGET-IDEAS.md` (widget proposals), `ROADMAP.md`
(prioritized plan), `MODULARITY-AND-DATAFLOW.md` (params + dataflow), and
`docs/AGENT-MEMO.md` (conventions). Each entry lists what's on the board,
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

## §Sources

- Voyager Company (Wikipedia): A Hard Day's Night · The Complete Maus · Who
  Built America? · Criterion Goes to the Movies, etc.
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
