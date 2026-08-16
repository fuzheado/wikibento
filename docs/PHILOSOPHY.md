# WikiBento and the HyperCard Lineage

*Why this project exists — the philosophical case. Companion to
[ARCHITECTURE.md](ARCHITECTURE.md) (the *why* vs. the *how*).*

---

## The Claim

WikiBento carries on the tradition of Apple's HyperCard (1987) — putting the
power to compose interactive media experiences in the hands of individuals —
and its **malleable canvas** is the correct evolution of that paradigm. The
refinement that makes this true: **the card metaphor was never the problem;
the screen-locked card was.** HyperCard's card was fixed at 512×342 because
it *was* the Mac's screen. WikiBento keeps the card as the composable unit
(the widget) and fixes everything that killed HyperCard: the card becomes
fluid and responsive, the stack becomes a URL, and the links go through
cyberspace.

## 1. The Origin: A Presentation Layer for Wikimedia's Media

WikiBento began with a simple observation: **the Wikimedia movement's media
assets — images, galleries, video, audio — were only ever experienced in the
context of encyclopedia articles.** And in that context, they are
deliberately, even proudly, suppressed.

Wikipedia is a text-first medium by policy. The encyclopedia community
maintains an intentional pullback on visual innovation:

- **WP:NOTGALLERY** — an article should not consist of a gallery; Wikipedia
  "is not an image repository" and the collection of images is explicitly
  not the project's purpose.
- **MOS:IMAGES / image-use culture** — guidance on restraint: images must
  earn their place, illustrations are secondary to prose, and the
  encyclopedia's ideal page is a text document with a few carefully chosen
  supporting images.

This conservatism is not a failure — it is the correct discipline for an
encyclopedia. A reference work optimizes for verifiability, prose density,
and download weight; an article that became a gallery would stop being an
article. But the consequence is that the *experience* of Wikimedia's media —
a million photographs from Wiki Loves Monuments, the world's largest
collection of freely licensed video, panoramas, spoken articles — is
permanently under-realized. The assets exist; the *presentation* does not.

The same is true of the sister projects, each text-first by its own
reasoned discipline: Wikivoyage deliberately caps imagery (a traveler
loading a city page on a mobile connection shouldn't be inundated with
images — a good reason), yet travel is the most visual of subjects;
Wikisource is a library of scans + text, experienced page by proofread
page; Wiktionary is a dictionary of words whose pronunciations, audios,
and translation webs are richer than any printed dictionary. Every one of
them is the same story: a text-first project with an under-realized
experiential layer. The Bento pattern — a presentation layer that composes
the assets the text project can only footnote — applies to all of them
(the concrete widget ideas live in WIDGET-IDEAS.md).

WikiBento is the space where the media is the subject, not the decoration.
It was conceived as **a rich and exciting presentation layer for Wikimedia
assets**: a canvas you can fill with life and interaction — galleries that
cycle, slideshows that play, videos that roll as jukeboxes, panoramas you
can stand inside, statistics that tell stories. Not a document about the
content, but a *room* built from the content.

**Observability — the second pillar.** WikiBento is not only a showcase for
the thousands or millions of files institutions have uploaded (the
Smithsonian, the Metropolitan Museum of Art, DPLA); it is an instrument
for **understanding the shape of the data** — what exists, what is being
used, what is possible. The widgets are sensors as much as windows:
pageviews show what the world looks at, CIM shows how collections
propagate across wikis, usage maps show where files travel, quality and
assessment widgets show how content matures. The Wikimedia sphere's only
widely known public product was the individual article — a window, not an
observatory. There was no way to build products that let people grasp the
full breadth and depth of a museum's holdings, a sector of paintings or
statues, a century of photographs. WikiBento is the missing
observatory-and-stage: it surfaces interesting content *and* lets people
understand the collections.

This is the other half of the HyperCard thesis. The encyclopedia represents
the "holy scroller" tradition — the document model, text-first, media as
illustration. HyperCard's card-and-stack tradition — the experience model,
media as the fabric of the page — was never allowed to flourish inside
Wikipedia's walls. It needed a separate space. The Bento is that space: the
curator's gallery, the DJ's deck, the museum wall — built from the same
assets the encyclopedia can only footnote.

Every widget in the catalog is a *way of experiencing* an asset class:
pageviews turn numbers into a story, the gallery turns an article into a
wall, the 360° viewer turns a file into a place, the jukebox turns a
playlist into motion, CIM turns a category into an impact narrative — and
each is simultaneously an *instrument of observation*: a sensor on what
exists, what is used, what is possible. The
"active content" direction — slideshow, ticker, jukebox, kiosk — is the
original instinct surfacing by name: **fill it with life.**

## 2. What HyperCard Was

Apple shipped HyperCard free with every Mac in 1987. Its promise was captured
in the slogan of the time: **"programming for the rest of us."** Bill Atkinson
called it a "software erector set" — an attempt to bridge "the priesthood of
programmers and the Macintosh mouse clickers."

Five concepts (per Atkinson's own account):

| Concept | Meaning |
|---|---|
| **Cards** | Screens: text, graphics, buttons, fields. On the nine-inch Mac, 512×342 pixels |
| **Stacks** | Ordered collections of cards — essentially apps |
| **Objects** | The UI layer: buttons, fields, backgrounds |
| **HyperTalk** | Scripting that read like English: *"if field 'Password' is 'open sesame' then go to card 'Secret'"* |
| **Hyperlinks** | Navigation from any button to any other card or stack |

HyperCard's revolution was *authoring*: non-programmers could build a
database, an interactive story, a museum exhibit, a BBS front end — without
anything that looked like code. It was the last time a mass-market platform
gave end users that kind of compositional power for two decades.

## 3. The Four Failure Modes

The autopsy matters because each failure has a name and a fix:

1. **Box-centric, not network-centric.** Atkinson's own confession (WIRED,
   2002): *"I grew up in a box-centric culture at Apple. If I'd grown up in a
   network-centric culture, like Sun, HyperCard might have been the first Web
   browser."* Stacks were local files. They could never reach each other
   through the Net.
2. **The card = the screen.** Fixed 512×342. A card could not be composed,
   scaled, reflowed, or recontextualized. The unit of composition was the
   physical display, so the paradigm could not survive displays of different
   sizes and aspect ratios.
3. **No product identity.** Apple never decided what HyperCard was — tool,
   toy, database, language? (Tim Oren's 2004 eulogy; Daring Fireball's "stacks
   smell funny.") Jobs axed it in the 1997 streamlining.
4. **No successor.** The web took the *link* and the *network* but dropped the
   *authoring*. The "rest of us" became consumers of pages instead of
   composers of experiences — and have spent thirty years lamenting it.

## 4. Where the Paradigm Went

The thread did not die; it split, and each fragment went somewhere:

- **The wiki is HyperCard's direct descendant.** Ward Cunningham built
  HyperCard stacks at Tektronix in the late 1980s, then adapted the
  card-and-link model into WikiWikiWeb (1995) — including the detail that
  HyperCard's links to *not-yet-existing* cards carried straight into the
  wiki's red-link-to-new-page. **Wikipedia is the largest HyperCard stack
  ever built.** WikiBento is an interface *to* that stack — the lineage
  becomes recursive.
- **The card survived as the widget.** As a unit of content + behavior, the
  card became the dominant UI atom of the last decade: iOS widgets, feed
  cards, dashboard panels (Grafana, Kibana — react-grid-layout's own
  provenance), design-system components. The classic critiques (Nielsen's
  "card sharks vs. holy scrollers"; Dave Rupert's card-UI pitfalls) apply to
  cards as *page substitutes* — not cards as *composable atoms*.
- **The canvas is the current revival.** Obsidian Canvas (now **JSON Canvas**
  — an open, MIT-licensed spec), Miro, Apple Freeform: cards liberated onto a
  malleable plane. Bret Victor — the tradition's loudest mourner — named his
  Dynamicland spatial-computing project, explicitly, **"Hypercard in the
  World,"** and his 2013 talk *The Future of Programming* is the canonical
  grief document: *"that's the world that we lost."*
- **The AI era arrived.** Roger Wong (2025): *"Why We Still Need a HyperCard
  for the AI Era"* — vibecoding is HyperCard's promise returning, minus the
  control. TidBITS (2026-08-14): *"Decades After HyperCard, AI Is
  Democratizing Development Again."* Notion's Ivan Zhao: computing should be
  "LEGO-like," "like reading and writing." The successor conversation is
  live, right now.

## 5. The Mapping

| HyperCard | WikiBento |
|---|---|
| **Card** (512×342, screen-locked) | **Widget** — the same unit of content + behavior + config, but fluid: draggable, resizable, reflowing; collapses to a single-column stack on phones; kiosk mode is "run the stack" presentation |
| **Stack** (a local file) | **Bento** — a config: a JSON document with URL identity |
| **Hyperlinks** (card-to-card, same machine) | Bento-to-Bento navigation (ISSUE-35), every datum linking to its source (the actionability audit), `w.wiki` share links — **stacks linked through cyberspace: Atkinson's exact missed opportunity, done** |
| **HyperTalk** (English-like scripting) | **Config-as-data** — declarative registry entries, presets, SPARQL queries, config fields that *are* the program; and the modern form: conversation — "make me a jukebox widget" is HyperTalk by other means |
| **Objects** (buttons, fields, backgrounds) | The registry + WidgetFrame chrome + the grid — the shared object layer |
| **Network** (the missing sixth) | Configs live **on-wiki** (Commons pages), loadable by URL from anywhere — the stack that *is* a URL |

## 6. Why the Malleable Canvas Is the Right Evolution

Not *instead of* the card — *because of* it. The canvas answers the question
"was the card metaphor the right one?" cleanly:

> **The card was the right unit; the screen was the wrong container.**

A card that must equal the screen cannot survive a world of phones, tablets,
ultrawides, and projectors. A card that is a *composable atom on an
addressable plane* can: it scales, reflows, stacks, hides its chrome in
presentation mode, and — because the whole board is a URL — it can be shared,
embedded, versioned, and navigated. HyperCard's canvas was a local file;
WikiBento's canvas is an address on the network. That is the difference
between a tool and a medium.

WikiBento's specific synthesis — the part we believe is genuinely new — is
the combination of:

1. **The widget as card** (content + behavior + configuration),
2. **the grid as malleable canvas** (responsive, drag-and-drop, kiosk),
3. **the Bento as networked stack** (URL identity, on-wiki hosting),
4. **Bento-to-Bento links as hyperlinks** (ISSUE-35/36 — the stack that
   should have been networked), and
5. **config-as-data as HyperTalk** (declarative, shareable, AI-directable
   authoring).

And the origin story from §1 completes the picture: this synthesis exists
*to give Wikimedia's media a home* — the encyclopedia disciplines the
document; the Bento liberates the experience.

## 7. The Honest Gaps

If WikiBento is "producing it now," three additions would make the claim
airtight:

1. **Parameterized links** — the HyperTalk `go to card X with context`
   equivalent: `?config=A&bento=overview&article=Albert_Einstein` — a widget
   that opens *another Bento pre-configured with this card's subject*.
   Navigation becomes message-passing between cards — the actual scripting
   revival. (Filed as ISSUE-40.)
2. **A widget-action layer** — "on click → go to X" as per-widget config, the
   way a HyperCard button had a script. The SPARQL widget is proto-HyperTalk;
   a first-class *action* field would be the real thing.
3. **End-user extensibility** — composition is for everyone, but new widget
   types are developer territory. The bridge is AI-directed registry editing:
   natural language → working widget, over a declarative substrate.

And one scoping note: HyperCard was a *creation* tool — you drew content in
place. WikiBento is a *curation* tool — it composes existing content from the
knowledge base. For "a display port into a knowledge base," that is not a
deficit; it is the correct specialization. The empowered user is the curator,
not the programmer — the museum director, not the artist.

## 8. Resources — People Thinking About the Successor

- **Bill Atkinson** — WIRED 2002, [*HyperCard: What Could Have Been*](https://www.wired.com/2002/08/hypercard-what-could-have-been/) — the box-centric confession
- **Bret Victor** — [*The Future of Programming*](https://worrydream.com/dbx/) (2013); [*Hypercard in the World*](https://dynamicland.org/2016/Hypercard_in_the_World/) (Dynamicland)
- **Roger Wong** (2025) — [*Why We Still Need a HyperCard for the AI Era*](https://rogerwong.me/2025/09/why-we-still-need-a-hypercard-for-the-ai-era)
- **TidBITS** (2026-08-14) — [*Decades After HyperCard, AI Is Democratizing Development Again*](https://tidbits.com/2026/08/14/decades-after-hypercard-ai-is-democratizing-development-again/)
- **Ars Technica** (2019) — [*30-plus years of HyperCard, the missing link to the Web*](https://arstechnica.com/gadgets/2019/05/25-years-of-hypercard-the-missing-link-to-the-web/)
- **BBC Future** (2019) — [*The forgotten software that inspired our modern world*](https://www.bbc.com/future/article/20190722-the-apple-software-that-inspired-the-internet)
- **The skeptics** — Daring Fireball, [*Why HyperCard Failed*](https://daringfireball.net/2002/08/why_hypercard_failed) (2002); Nielsen Norman Group, [*Two Basic Hypertext Presentation Models*](https://www.nngroup.com/articles/two-basic-hypertext-presentation-models/); Dave Rupert, [*Pitfalls of Card UIs*](https://daverupert.com/2018/04/pitfalls-of-card-uis/) (2018)
- **The living descendants** — [hypercard.org](https://hypercard.org/) (community; interviews with people still building successors: xCards, jsCard); Obsidian's [JSON Canvas](https://jsoncanvas.org/) open format; the [History of wikis](https://en.wikipedia.org/wiki/History_of_wikis) lineage (HyperCard → WikiWikiWeb → Wikipedia)

## 9. The Verdict

The successor to HyperCard is not the canvas *replacing* the card — it is the
**card liberated from the screen, given a network identity, and made
addressable.** That is precisely what WikiBento does: the widget (card) on a
malleable grid (canvas), URL-identified Bentos (networked stacks),
Bento-to-Bento links (hyperlinks), and config-as-data authoring (HyperTalk by
other means). And it does it for a reason: **to give the Wikimedia movement's
under-shown media a rich, living presentation layer** — the gallery the
encyclopedia can never be, built from the same assets the encyclopedia can
only footnote.

The strongest evidence that "we are producing it now" is sitting in this
project's own history: on 2026-08-16, a user described a video jukebox widget
in prose; an agent built it, tested it, and deployed it to production the same
day. That loop — *natural language → working, networked, shareable
composition* — is the HyperCard promise, delivered by the one technology
Atkinson never had.

---

## 10. The Wayfinding Question: Why Structure Wins for Visitors

The strongest objection to the canvas thesis deserves a direct answer:
**the infinite canvas puzzles its visitors** — where to start, where to go
next, how to navigate, even with arrows on screen. The bounded grid
assumes a known reading order: upper-left, then down. This is not a
taste; it is the finding of the spatial-hypertext literature (VIKI,
Marshall & Shipman, 1993–99): spatial layout is *emergent structure* —
meaning **for its maker**. The author who placed things knows why they
are there; the visitor must infer it. The zoomable-interface tradition
(Pad/Pad++, SIGGRAPH '93) adds the tax: navigation itself consumes
attention, and spatial memory only helps *after* the first visit.

Bob Stein's counter-thesis (Tapestries) is real and right — for the
maker: tabs and scrolling obscure "a sense of the whole"; a canvas
restores it. The resolution: **canvas for the author, structure for the
visitor.** WikiBento is the *bounded canvas* — free arrangement within
a finite, ordered, readable board; and where a canvas answers "where do
I go next?" with "keep looking," the Bento answers with **a stack**:
Bento-to-Bento navigation makes "next" a known unit, and lists are how
people navigate. (The full research — the paradigms catalog, the
CD-ROM-era postmortems, mTropolis and Voyager — is in
[PARADIGMS.md](PARADIGMS.md).)

*Author: Andrew Lih (User:Fuzheado) · 2026-08-16. Written by conversation
with a coding agent — which is itself the point of this document.*
