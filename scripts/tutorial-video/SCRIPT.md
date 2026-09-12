# WikiBento tutorial — shooting script

**This file is the source of truth.** Edit the narration lines, split or merge beats, move a
highlight, change the wording — then the video is rebuilt from your text. Timings are computed
from the voiceover, so you never have to do arithmetic: put the action in the beat whose words
should be spoken while it happens.

How to read a beat:

| marker | meaning |
|---|---|
| 🗣 | the spoken line (voiceover + burnt-in caption). **Edit freely.** |
| 🖱 | what happens on screen during that line |
| 🔍 | zoom: target, magnification, how long to hold, ease in/out |
| ⭕ | highlight drawn over the target (red ring / arrow / dim-the-rest) |
| 🔊 | sound effect |
| 📝 | caption text, when it is *not* simply the spoken line |

**A marker becomes machine-readable when it names its target with `@ <css selector>`**, so the
pipeline can actually draw it instead of leaving it as a note for a human:

```
🔍 1.2× @ .grid-item:nth-child(3) — the one zoom in this scene
⭕ @ .grid-item:nth-child(1) .widget-title — as its name is spoken
```

Everything after the em dash is prose for you, and one beat may carry several markers (three ⭕ lines
ring three things in turn, staggered across the beat). A marker with **no** `@` is intent only: the
recorder skips it and `beats.mjs` counts it as unwired, so `npm run tutorial:beats` tells you how much
of the script is still waiting to be made mechanical.

Rules of thumb the pipeline enforces: a zoom never starts while something is moving; a drag is
never interrupted; every action must finish before the beat that describes it ends. If you add a
beat, the video gets longer by that line's spoken length and the rest re-times itself.

Status: **draft for your edits — and now the pipeline's real input.** `npm run tutorial:beats` parses
this file into beats, `tutorial:narrate` synthesizes one clip per beat, and the recorder times its
actions and fx from the measured offsets. Scene 1's 🔍/⭕ markers are wired (their `@` targets are real
selectors); `tutorial:beats` prints how many of the rest still are not. The 🔊 markers are not
implemented — no audio is recorded, so a sound effect has to be added in post. Actions are now timed to the
beats, so the old "lands several seconds after the words" notes are gone; what remains is the recorder's
own report — it prints ⚠ whenever an action finishes after its beat has ended, and those beats need more
words or a shorter action.

---

## 1. What WikiBento is

`scene 01-what` · starts from: the starter board (three cards) · target ~27s

1. 🗣 "WikiBento is a dashboard you build yourself, out of live Wikimedia data."
   🖱 board already loaded; no pointer movement — let the numbers be read
2. 🗣 "There is no login and no server to run: you drag cards onto a grid, point each one at a subject, and it fetches the data straight from the Wikimedia APIs."
   🖱 slow pointer drift across the board; nothing clicked
3. 🗣 "What you are looking at is the starter board — three cards: pageviews for the Main Page, a link count, and a ranking of the largest Wikipedias."
   🖱 point at each card in turn (a quick pulse, not a click), one per clause
   ⭕ @ .grid-item:nth-child(1) .widget-title — as the first card is named
   ⭕ @ .grid-item:nth-child(2) .widget-title — as the link count is named
   ⭕ @ .grid-item:nth-child(3) .widget-title — as the ranking is named
   🔍 1.2× @ .grid-item:nth-child(3) — push onto the third card for the last clause, held to the end of the sentence
4. 🗣 "All of it is live."
   🖱 settle; pointer away from the cards
   📝 "Live data · no login · no server"

Zoom: **accepted 2026-09-11**, and wired the same day — the fx layer is applied inside the page (a CSS
transform on `#root`, and a red ring drawn over the target), so it is part of the recording rather than
post-production, and magnified text stays crisp because the browser re-renders it. The beat offsets
that time it come from the voiceover, and the targets come from the `@` selectors above.

---

## 2. Read a board someone shared

`scene 02-read` · starts from: `?config=https://w.wiki/TR9R` (the WikiPortraits demo board) · target ~33s

1. 🗣 "Boards travel as URLs. This one is the WikiPortraits demo, and the entire configuration is in the link: config equals, followed by a wiki page address."
   🖱 pointer rests on the address bar area / the board's top bar
   ⭕ ring the `?config=` part of the URL — this is a small thing to see, exactly your "red circle" case
2. 🗣 "WikiBento fetches that page and builds the board from it."
   🖱 slight scroll, or nothing (the board is already built)
3. 🗣 "Every card has the same top bar: the i explains where its data comes from, the gear configures it, the arrow refreshes it, and the cross removes it."
   🖱 four separate hovers, in that order: ⓘ → ⚙ → ↻ → ✕
   🔍 zoom 1.6× onto the top bar of ONE card for the whole sentence — the four icons are ~20px each; at 1.6× they are legible on a phone
   ⭕ ring each icon *as its name is spoken* — the four are spread across this beat, so each lands on its own name
4. 🗣 "The name chip next to the title is the card's identity — other cards can refer to it by that name."
   🖱 hover the name chip; a tooltip appears
   🔍 1.6× @ .grid-item:nth-child(2) — hold the zoom and include the name chip (the zoom is wired; this
      marker needs its target to match the icon zoom above, which is still prose)
   ⭕ ring the chip

---

## 3. Clear it and start your own

`scene 03-reset` · starts from: the starter board · target ~16s

1. 🗣 "To start your own board, you can clear this one. Reset asks first — you can go back to the starter set, or begin with an empty board."
   🖱 click ↺ Reset — **on the word "Reset"** — and the dialog opens: Cancel · Blank board · Starter set
   ⭕ ring the Reset button before the click (1.2s), then ring the two options as each is named
2. 🗣 "Anything you had is gone, so export first if you want to keep it."
   🖱 hold on the dialog, pointer away from the buttons (give the warning room)
3. 🗣 "From here, everything you add is yours."
   🖱 click **Starter set**; the board refreshes

**Built 2026-09-11** (this replaced an open question). Reset now asks: it offers the starter set, a
blank board, or cancel, and it clears the board's `params` block along with the cards. The empty
state says "No widgets yet. Click + Add Widget to get started."

Take note: the recorder clicks **Starter set**, so this scene ends on the board the next scene expects.
The alternative take — choose **Blank board**, then let scene 4 add the first card to an empty grid — is
the better story arc (you watch a board being built from nothing), and it needs scene 4's start state
changed to a blank board along with it. Not done yet.

🔊 dropped for this scene (decided 2026-09-11): a warning tone was proposed, never implemented, and not
wanted. The dialog is the warning.

---

## 4. Add a card and point it at a subject

`scene 04-add` · starts from: the starter board · target ~33s · **the busiest scene; most of the drift is here**

1. 🗣 "Click Add Widget."
   🖱 click ＋ Add Widget
   ⭕ ring the button just before the click
2. 🗣 "The picker lists every card type, grouped by category, and you can search it."
   🖱 modal opens; a slow scroll through the categories
   🔍 1.25× onto the category column for the scroll, then release
3. 🗣 "I will search for pageviews and add Article Pageviews."
   🖱 click the search field, type "pageviews" — the typing is timed to this beat; the keystroke sound and
      typed-text chip are still to come (no audio is recorded, so that is post-production)
   🔍 1.8× onto the search field while typing
   🔊 a soft click per keystroke (throttled — one per ~90ms, not one per character of a fast typist)
   📝 the typed string shown large, e.g. `pageviews` in a corner chip
4. 🗣 "A new card appears with a placeholder subject."
   🖱 the card is added; the modal closes
   ⭕ ring the new card's title
5. 🗣 "Open its gear to configure it: here is the article field — type or paste the exact article title — and the project selector beside it."
   🖱 click ⚙, then click into the article field and type the subject — timed to this beat; same note as
      beat 3 about the zoom, keystroke sound and typed-text chip
   🔍 1.6× onto the settings panel; hold while typing
   ⭕ ring the article field, then the project selector, as each is named
6. 🗣 "Watch the total and the daily bars fill in with real data for that article."
   🖱 typing stops; the panel stays open; the data lands
   🔍 hold the zoom on the card's numbers so the change is visible at phone size
7. 🗣 "Anything you change takes effect immediately."
   🖱 close the panel; a small settle

Subject: **Marie Curie** (changed from Albert Einstein, 2026-09-11). A WikiPortraits subject rather
than a default-looking one, and the recording types this into the article field — so every number on
screen is hers.

---

## 5. Move and resize

`scene 05-move` · starts from: the starter board · target ~16s

1. 🗣 "Drag a card by its top bar to move it, and the rest of the board reflows around it."
   🖱 drag the first card one column right — **the drag starts on "Drag" and is still moving while the
      clause about reflowing is spoken**, which is what the recorder now does: the increments are spread
      across this beat
   🔍 1.15× only for the duration of the drag (a zoom on a moving target is where tutorial videos usually look bad — keep it gentle)
   ⭕ thin ring on the card being moved, following it — or nothing, if it reads as noise
   🔊 optional soft "pick up / put down" ticks
2. 🗣 "Drag the bottom corner to resize."
   🖱 resize from the corner handle
   ⭕ ring the corner handle before the drag starts, then hide the ring as it moves
3. 🗣 "The grid keeps everything aligned, and each card has a minimum size so it cannot be squashed into something unreadable."
   🖱 a small overshoot that snaps back (deliberate demonstration of the minimum), or nothing

Measured recipe, so nobody has to rediscover it: one column ≈ 262px of pointer travel at 1920px
wide; a card in the leftmost column cannot move left (it snaps back); the drag must be handed to
the card's top bar, not its body. This scene is why it stays on the plain three-card board — with
extra cards added, the wide bottom card refuses to shift.

---

## 6. Export the board

`scene 06-export` · starts from: the board with the added card · target ~15s

1. 🗣 "When the board looks right, click Export."
   🖱 click ⬇ Export — **on the word "Export"**, which is where the recorder now clicks
   ⭕ ring the button before the click
2. 🗣 "WikiBento writes the whole thing — every card, its settings, and its position — as a small JSON file."
   🖱 the download happens; open the downloaded file (we show it from a local copy to avoid a frozen browser download shelf)
   🔍 1.35× onto the JSON's first lines
3. 🗣 "That file is the board: there is nothing else to save."
   🖱 scroll the JSON a little
   📝 "dashboard.json — the whole board in one small file"

**Resolved 2026-09-11** — the export used to omit the board's `params` block, so a parameterised board
lost its parameters through Export → wiki page → `?config=`. That was a real bug: the documented format
(`docs/JSON-FORMAT.md`) has always included `params`, and the loader reads it. Fixed, so the line
"WikiBento writes the whole thing" is now true as written and the honesty caveat is gone.

Timing: the click is on the word "Export" (beat 1). The scene's remaining problem is different — the
download event never fires in headless Chromium, so the take shows the board's JSON rendered from the
app's own state instead of a file arriving (see TUTORIAL-VIDEO-STATUS.md).

Overrun check: the recorder warns when an action finishes after its beat has ended, and this scene's
are within their beats.

---

## 7. Put the JSON where it can be fetched

`scene 07-store` · starts from: the raw wiki page holding the demo JSON · target ~36s

1. 🗣 "That JSON needs a home your browser can read."
   🖱 the wiki page's raw JSON on screen; pointer at the top
2. 🗣 "The easy place is a wiki page: paste it onto a subpage of your user page, and it lives there with the wiki's own history and permissions."
   🖱 scroll the page slowly; the page title and the JSON are both visible
   ⭕ ring the page title (small text — this is another red-circle case)
   📝 "Your user subpage — history, permissions and watchlists come free"
3. 🗣 "WikiBento reads wiki pages through the CORS-enabled MediaWiki API, which is why this works without any extra hosting."
   🖱 cut to the "two kinds of host" card (rendered, not scraped)
   📝 "Wiki page ✓  read via the MediaWiki API — no hosting needed"
4. 🗣 "This is the page behind the demo board."
   🖱 back to the raw page, scrolled to a recognisable line
5. 🗣 "If you host the file somewhere else instead, it has to allow cross-origin requests — otherwise you will see 'could not load dashboard from URL' and the board falls back to the starter set."
   🖱 the same card, second line
   📝 "Any other host ✗  must allow cross-origin requests (CORS), or the load fails"

---

## 8. Load it anywhere

`scene 08-reload` · starts from: `?config=https://w.wiki/TR9R` · target ~20s

1. 🗣 "And that is the payoff. Your wiki page plus config equals is a complete, portable board."
   🖱 the board as it loads; the URL visible at the top
   ⭕ ring the `?config=` part again — the callback to scene 2 is the point of the whole video
2. 🗣 "Open that URL on any machine, or on a lobby kiosk, and the same dashboard appears."
   🖱 nothing, or a slow drift; let the board breathe
3. 🗣 "The link is the whole thing: share it, bookmark it, or turn it into a QR code."
   🖱 open the Share panel and the QR code
   🔍 1.5× onto the QR code so it is clean enough to understand, not necessarily to scan
   📝 "Share · bookmark · QR code"

---

## End card

`scene 99-end` · target 5.5s

🗣 silent (or one line, if you want one — this is where a call to action would go)
🖱 `wikibento.toolforge.org` · `?config=<your wiki page>` · `docs/TUTORIAL.md`
