# Presentation Paradigms: The Landscape We're In

*A research companion to [PHILOSOPHY.md](PHILOSOPHY.md) — the paradigms for
organizing and presenting information, the CD-ROM multimedia era and its
end, and the wayfinding question (canvas vs. structure).*

---

## 1. The Wayfinding Question: Canvas vs. Structure

The observation that motivates this document (2026-08-16): **the infinite
canvas puzzles the viewer — where to start, where to go next, how to
navigate, even with arrows on screen. The bounded grid assumes a known
reading order: upper-left, then down.** The research supports both halves
of this, and the resolution is genuinely interesting.

### The spatial-hypertext literature: structure is *emergent*, not given

The academic tradition most relevant to Tapestries-style canvases is
**spatial hypertext**, developed at Xerox PARC and Texas A&M by Catherine
Marshall and Frank Shipman (VIKI, 1993–1999):

- **VIKI: Spatial Hypertext Supporting Emergent Structure** (ECHT '94) —
  spatial layout lets authors express *ambiguous, partial, gradually
  emerging* organization; VIKI's spatial parser *recognizes* structures
  the author never explicitly declared.
- **Searching for the Missing Link: Discovering Implicit Structure in
  Spatial Hypertext** (Hypertext '93) — proximity, alignment, visual
  style, grouping, and recurrence encode structure *without explicit
  links*.
- **Formality Considered Harmful** (CSCW '99) — the deepest finding: force
  users to make tacit structure explicit *too early* and you break the
  workflow; structure should *emerge* during work.

The crucial distinction the field draws: **emergent structure is an
authoring virtue, not a reading guarantee.** The author who placed things
knows why they're there — the reader must *infer* it. That is precisely
the wayfinding cost you identified: spatial layout is meaning **for its
maker**, recognition is work **for its visitor**. The system can help
(the "spatial parser"), but a canvas is always asking its reader to do
archaeology.

### The zoomable-interface tradition: navigation is a tax

**Pad** (Ken Perlin & David Fox, SIGGRAPH 1993) and **Pad++** (Bederson,
Hollan, Perlin et al.) invented the zoomable user interface (ZUI) — one
vast shared plane, pan-and-zoom as primary navigation, *semantic zooming*
(objects change representation with scale: a title at a distance, full
text up close). Three decades later, every canvas tool (Miro, Freeform,
Tapestries, Obsidian Canvas) is a Pad++ descendant. The ZUI literature
also documented the tax: **navigation itself consumes attention** — the
"lost in hyperspace" phenomenon known since the earliest hypertext
research (Elm & Woods, 1985) — and ZUIs trade that for spatial memory
("I know it's up and to the left"). Spatial memory is powerful **after
you've visited**; it doesn't help the first-time visitor at all.

### The counter-thesis: Bob Stein on why the canvas is the point

Stein's own framing (Stanford talks, 2024–25) is the strongest case for
the other side: *"Seventy-five years into the digital era, much of our
online communication is still rooted in the linear strictures of print.
Browsers make us jump from tab to tab, thus obscuring a sense of the
whole — including how the different bits are connected. With Tapestries
people can create non-linear presentations that are more in synch with
the way our brains are wired."* He is right that **tabs and scrolling
obscure the whole** — and this is exactly what WikiBento's grid preserves
at the board level: all widgets visible at once, connections spatial.

### The resolution: canvas for the maker, structure for the visitor

Both positions are correct — for different roles:

- **Authoring** favors the infinite canvas: emergent structure, no
  premature formality, a "sense of the whole" while composing (Stein's
  insight, VIKI's finding).
- **Consumption** favors bounded, conventional structure: known reading
  order, finite extent, recognizable navigation (the wayfinding argument).

**The Bento is the "bounded canvas":** a grid is a canvas *within*
structure — widgets can be arranged freely (malleability, the HyperCard
inheritance) but the board itself is finite, ordered, and scrolls
predictably. And where the canvas answers "where do I go next?" with
"keep looking," the Bento answers with **a stack**: Bento-to-Bento
navigation (ISSUE-35) and manifests (ISSUE-36) make "next" a *known
unit* — the stack was HyperCard's navigation promise, and it survives
because a stack is a list, and lists are how people navigate.

---

## 2. The Paradigms Catalog

Every presentation paradigm is a *navigation promise* — a claim about how
a visitor should move through information. A short catalog, with the
paradigm's promise and its fate:

| Paradigm | Exemplars | Navigation promise | Fate |
|---|---|---|---|
| **Card / stack** | HyperCard (1987), SuperCard, Stacksmith | "Flip to the next card; the stack is the unit" | Killed by Apple 2004; the card survived as the *widget* |
| **Book** | ToolBook (1990), Voyager Expanded Books (1991) | "Turn pages; you always know where you are" | Died with CD-ROM; the page survived everywhere |
| **Timeline** | MacroMind Director (1985), Flash (1996), Authorware | "The playhead moves; time is the axis" | Director EOL 2017, Flash EOL 2020 |
| **Object / message-passing** | mTropolis (1995), QuarkImmedia (1995), Oracle Media Objects (1994) | "Objects trigger each other; behavior is composition" | mTropolis killed by Quark 1998; QuarkImmedia failed 1997 |
| **Stream** | Lifestreams (MIT, 1996), activity feeds | "Time flows past; the newest is at the top" | Became the feed — every social platform |
| **Spatial canvas** | VIKI (1994), Pad/Pad++ (1993–98), Miro, Freeform, Obsidian Canvas, **Tapestries** | "Place things where they belong; navigate by memory" | Thriving as an *authoring* layer; wayfinding cost for visitors |
| **Tile / widget grid** | iGoogle (2005–13), Netvibes (2005), Opera Speed Dial (2007), Symbaloo | "Everything visible at once; grid = reading order" | iGoogle killed by Google 2013 (not by failure); survived in enterprise (Grafana, Kibana) and **WikiBento** |
| **Outliner** | Engelbart's NLS (1968), Roam, Workflowy | "Hierarchy is the map; indent = depth" | Niche but persistent |
| **Wiki** | WikiWikiWeb (1995), Wikipedia | "Pages link to pages; red links invite creation" | The most successful paradigm ever — HyperCard's descendant |
| **Graph** | Obsidian, Foam | "Nodes and edges; follow connections" | Authoring-first; readers need a starting node |
| **Block** | Notion (2016), Coda | "Everything is a composable block" | Thriving; blocks are widgets by another name |
| **Channel / collection** | Are.na | "Curated paths through things" | The curator paradigm — closest to WikiBento's ethos |

Two observations:

1. **The survivors couple a familiar reading model with live data.** The
   tile grid survived iGoogle's death because it's the *dashboard* — the
   one paradigm where "everything at once" is the job (Stephen Few's
   information-dashboard design: scannable, bounded, at-a-glance).
   WikiBento is that paradigm pointed at a knowledge base.
2. **Each death was a corporate/platform event, not a paradigm verdict.**
   iGoogle was shut down by Google; HyperCard by Apple; mTropolis by
   Quark; Director and Flash by Adobe; the CD-ROM era by the web's
   distribution economics. The *ideas* kept resurfacing — which is the
   argument for building the presentation layer on an open, networked,
   data-driven substrate (the wiki's platform) rather than a proprietary
   runtime (Director, Flash, HyperCard).

---

## 3. The CD-ROM Renaissance and Its End

### The era

The 1989–1997 window was a genuine renaissance of authored multimedia:

- **Voyager Company** (Bob Stein, founded 1984) — Criterion Collection
  laser discs; ~75 cultural CD-ROMs; *Expanded Books* (1991, the first
  three: *The Complete Hitchhiker's Guide to the Galaxy* among them);
  *Beethoven's Ninth* (1989), the first cultural CD-ROM. Slogan: "Bring
  your brain." Stein's position: new media don't kill books, they
  transform them.
- **mTropolis** (mFactory, 1995) — the object-oriented authoring tool:
  reusable objects, *modifiers and behaviors* (objects triggering each
  other — the message-passing memory). Considered by many the superior
  alternative to Director. Quark bought it in 1997 and killed it in
  1998; users raised **millions of dollars** to buy it back (Salon,
  "The software that refused to die") — and a survivors list ran for
  years.
- **QuarkImmedia** (Quark, 1995) — the object-oriented extension of
  QuarkXPress; failed within two years.
- **Director / Shockwave / Flash** — the timeline-based empire (1985 →
  Adobe ends Director in 2017; Flash EOL 2020).
- Also: Apple Media Tool (1992), Authorware (1987), HyperStudio (1989),
  ToolBook (1990), Oracle Media Objects (1994), Kalieda (unshipped).

### Why it died

The contemporary postmortems are clear (Salon's *No Room at the Bin*,
1995; *So What's Next for Clio?*, Roy Rosenzweig, 1994; *Multimedia
Gulch in 1994*):

1. **The web won distribution.** Discs were static once pressed, expensive
   to manufacture and retail, hard to update — "frozen in time" and
   disconnected from a global knowledge system. By the end of 1996 the
   web had ~36 million users and the comparison was over.
2. **Runtime fragility.** Authoring ran on proprietary runtimes (Director
   players, Shockwave, Flash plugins, HyperCard itself) — every one a
   single company's decision away from death. All of them died exactly
   that way.
3. **The platform kills.** Apple killed HyperCard and Media Tool; Quark
   killed mTropolis; Adobe ended Director and Flash. The ideas outlived
   every one of the tools.
4. **The consumer web arrived with its own texture.** HTML's scroll, not
   the card; the link, not the object message.

### The preservation counter-movement

The era is not only mourned but preserved: the Internet Archive's
CD-ROM collections and software library, Flashpoint (game/animation
preservation), the emulation-based Voyager collections research
(IJDC, 2019) — Bob Stein's own archive now at Stanford. Media
archaeology (Sterling's Dead Media Project; the new-media-history
scholarship of Wardrip-Fruin & Montfort's *The New Media Reader*)
treats these tools as a canon.

### The lesson for WikiBento

The CD-ROM authoring tools died; the *paradigm* — compositional
presentation of media by non-programmers — did not. It was waiting for a
platform with the web's distribution and the wiki's openness. WikiBento
is that paradigm re-expressed: **config-as-data instead of a proprietary
authoring file; the browser instead of a runtime; Wikimedia's APIs
instead of a pressed disc; a URL instead of a box.** It is, in effect,
Atkinson's regret (network-centric stacks) merged with the web's answer
to CD-ROM (networked distribution) — the two failed halves, joined.

---

## 4. Key Sources

- Marshall, Shipman & Coombs — *VIKI: Spatial Hypertext Supporting Emergent Structure* (ECHT '94); *Searching for the Missing Link* (Hypertext '93); Shipman, Marshall & Moran — *Finding and Using Implicit Structure* (CHI '95); Shipman & Marshall — *Formality Considered Harmful* (CSCW '99) — [Shipman's VIKI archive](https://people.engr.tamu.edu/shipman/viki/)
- Perlin & Fox — *Pad: An Alternative Approach to the Computer Interface* (SIGGRAPH '93); Bederson, Hollan, Perlin et al. — *Pad++* — [Pad++ project](https://www.cs.umd.edu/projects/hcil/pad%2B%2B/)
- Elm & Woods (1985) — *Getting Lost: A Case Study in Interface Design* — the "lost in hyperspace" phenomenon
- Bob Stein — [Welcome to Tapestries (Stanford)](https://events.stanford.edu/event/bob-stein-welcome-to-tapestries); [The Tapestry Project @ Internet Archive](https://github.com/internetarchive/tapestry-project)
- mTropolis — [Wikipedia](https://en.wikipedia.org/wiki/MTropolis); Salon (1998) — *[The software that refused to die](https://www.salon.com/1998/06/10/feature_309/)*
- Voyager Company — [Wikipedia](https://en.wikipedia.org/wiki/Voyager_Company); *Expanded Books* [history of information](https://www.historyofinformation.com/detail.php?id=4785); the Voyager virtual-collection emulation research (IJDC)
- The CD-ROM era — Salon (1995) *[No Room at the Bin](https://www.salon.com/1995/12/16/media_236/)*; Rosenzweig (1994) *[So, What's Next for Clio?](https://rrchnm.org/essays/so-whats-next-for-clio-cd-rom-and-historians/)*; Cybercultural — *[Multimedia Gulch in 1994](https://tagteam.harvard.edu/hub_feeds/4673/feed_items/16254679)*
- The widget-grid lineage — [iGoogle retirement](https://igoogledeveloper.blogspot.com/2013/11/saying-goodbye-to-igoogle.html); [Netvibes launch](https://techcrunch.com/2005/09/16/netvibes-personal-homepage/); [Opera Speed Dial](https://press.opera.com/2007/03/28/whats-on-your-speed-dial/)
- *The New Media Reader* (Wardrip-Fruin & Montfort, MIT Press) — Bush, Nelson, Engelbart, Kay et al.

---

## 5. The Contemporaries (2015–2026): Are We Alone?

Research question (2026-08-16): is anyone else pursuing a composable
presentation layer for multimedia assets in the HyperCard / Apple Media
Tool / QuarkImmedia tradition? **Answer: not alone in category — but the
category splits into two worlds, and the specific configuration appears
unoccupied.**

### World A — proprietary vertical storytelling suites (alive, commercial)

| Project | What it is | The wedge |
|---|---|---|
| **ArcGIS StoryMaps** | Narrative + images/video + interactive maps into scrollable stories; used by museums, heritage sites, journalism | The GIS industry — a focused buyer with budgets |
| **Shorthand** | Magazine-style scrollytelling for cultural organizations (English Heritage, Sydney Opera House, Cambridge Museums) | Editorial/marketing teams |
| **Flourish** | Data-viz-led stories (charts, maps, animated slides) | Journalism/data desks |
| **Microsoft Sway** | Lightweight media narratives with auto-layout | Office users |
| **Adobe Express / Spark** | Compose graphics/pages/videos | Marketing, education |

These are the *commercial* continuation of the presentation-layer idea —
but they are template-driven, closed, platform-locked, and none of them
compose **live, networked, data-driven content** (theirs is upload-then-
arrange). None exposes a config-as-data artifact.

### World B — open/community projects (alive, mostly small)

| Project | What it is | Relation to us |
|---|---|---|
| **Cardstack** | Open-source "cards for the web" — a Card is a reusable mini-app (schema+data+UI+behavior), serialized as JSON, assembled by end users. Explicitly billed as the networked HyperCard idea | The closest philosophical sibling; app-builder oriented, not media-presentation oriented |
| **Tapestries** (Bob Stein @ Internet Archive) | Infinite-canvas multimedia authoring, open format (v7, Zod-validated) | The canvas complement (see PHILOSOPHY §10) |
| **H5P** | "Create rich interactive content" — drag-and-drop interactive media for education, runs in any LMS | Alive, education wedge; template-library model |
| **Explorable Explanations** (Nicky Case et al.) | A movement of hand-crafted interactive essays (play-and-learn media composition) | The authoring spirit; each piece is bespoke code, no composition layer for non-programmers |
| **Popcorn Maker** (Mozilla, 2012–15; adopted by the Internet Archive) | Drag-and-drop remix of web video with photos/maps/links — *the* web-native HyperCard moment | Dead as a product, preserved by the Archive — our closest dead ancestor |
| **Obsidian Canvas / JSON Canvas** | Open-format cards on an infinite canvas | The canvas lineage, notes-focused |
| **Lively4 / Webstrates** (Hasso-Plattner; Aarhus) | Research environments: live-programmable, persistent web documents — HyperCard's research lineage | Academic, not products |

### The Wikimedia-adjacent world (where we actually live)

The GLAM tool ecosystem (WikiShootMe map-of-photos, GLAM Visual Tool,
BaGLAMa metrics, Map the GLAM) is **single-purpose analysis**, not
composition: none of them lets a curator *assemble* galleries, metrics,
maps, video, and narrative into a board. The WMF's own GLAM Dashboard
tool was discontinued. **No one occupies the niche WikiBento holds: an
open, browser-native, config-as-data composition layer over the
Wikimedia APIs — cards + stacks + links, with observability — that any
institution or individual can instantiate from a URL.** The category is
crowded; the specific configuration (networked, open, data-driven,
no-runtime-dependency, anchored in an existing content ecosystem) is not.

### Who to correspond with

- **The Tapestries team @ Internet Archive** (Bob Stein — already known)
- **Cardstack** (docs.cardstack.com — open-source cards community)
- **H5P / Joubel** (education authoring)
- **Nicky Case + explorabl.es** (the interactive-composition movement)
- **The Internet Archive** re: Popcorn Maker adoption (they preserved it)
- **Dynamicland** (Bret Victor — "Hypercard in the World")
- **hypercard.org** (xCards and other living successors)
- **GLAM-Wiki community** (WikiShootMe, GLAM Visual Tool maintainers —
  natural collaborators and users)

## 6. The Mortality Question: Why Do These Die?

Storify's arc is the canonical case: launched 2010, an award-winning
compose-and-weave tool for social media, acquired by Livefyre (2013)
then Adobe (2016), **shut down May 2018** — its users directed to
"Storify 2," absorbed into Adobe's Experience Manager. The demand was
real (it was *the* journalism tool for embedding social narratives);
the product was killed by acquisition, not by its users.

The pattern, across every death in this document:

1. **The acquisition kill** — Storify→Adobe, mTropolis→Quark, iGoogle→
   Google, HyperCard/Media Tool→Apple, Director/Flash→Adobe. The tool
   becomes a feature of a suite, then a footnote.
2. **The priority pivot** — Popcorn Maker and the whole Mozilla Webmaker
   suite died of a foundation re-prioritization (mobile pivot), not
   disuse; the Internet Archive had to adopt it to preserve it.
3. **The "everyone" market** — tools aimed at "everyone" (iGoogle,
   Popcorn Maker, Storify in its later life) lack a paying wedge;
   tools aimed at a profession survive (StoryMaps=GIS, Grafana=devops,
   H5P=LMS, Canva=marketing, Retool=internal tools).
4. **The economics of creative tools** (Gartner/Forrester/CB Insights/
   RevenueCat, 2025–26): demand is not the problem — churn is. Nearly
   30% of annual subscriptions cancel in month one; graphics/design
   apps show the weakest retention. No-code commoditizes creation, so
   advantage shifts to distribution and workflow ownership. Survivors
   own a *recurring, high-stakes workflow* with a focused buyer.
5. **Platform dependency** — Flash, Director, HyperCard, Shockwave:
   proprietary runtimes are single-company points of failure. Every one
   of them died exactly that way.

**The verdict on the direction itself:** the composition instinct is not
a failed experiment — it is a constant. It was reborn in every decade:
Popcorn Maker → Google Web Stories → TikTok/Instagram template
composers → ArcGIS StoryMaps → Tapestries. What fails is not the
paradigm but its *housing*: proprietary runtimes, acquisition math,
and markets without a wedge. The web won over CD-ROM not because
multimedia was wrong but because distribution won; the survivors all
found the same answer — **anchor in an ecosystem that already has the
content and the users.**

Which is the strategic lesson for WikiBento, and it is reassuring:
the architecture already answers the mortality question.

- **No proprietary runtime** — the browser, plain HTML/CSS/JS; no
  plugin, no player company.
- **Config-as-data** — the artifact is JSON: portable, hostable on any
  wiki or host, importable/exportable; it cannot be locked in.
- **Anchored in an existing ecosystem** — Wikimedia already holds the
  content (no chicken-and-egg content problem that killed would-be
  Storifys) and the community; Toolforge hosts at zero cost; there is
  no company to acquire and kill it.
- **A focused wedge** — GLAM institutions, educators, presenters,
  event walls, and the Wikimedia community's own observability needs.

The tools of yesterday died of their housing, not their idea. The idea
is what we are building — in a form that cannot be unshipped by a
corporate decision.
