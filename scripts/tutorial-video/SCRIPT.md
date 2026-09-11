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

Rules of thumb the pipeline enforces: a zoom never starts while something is moving; a drag is
never interrupted; every action must finish before the beat that describes it ends. If you add a
beat, the video gets longer by that line's spoken length and the rest re-times itself.

Status: **draft for your edits.** The current published take does not yet honour 🔍/⭕/🔊; the beats
marked ⚠ are the ones where the action now lands several seconds after the words (your point 2).

---

## 1. What WikiBento is

`scene 01-what` · starts from: the starter board (three cards) · target ~27s

1. 🗣 "WikiBento is a dashboard you build yourself, out of live Wikimedia data."
   🖱 board already loaded; no pointer movement — let the numbers be read
2. 🗣 "There is no login and no server to run: you drag cards onto a grid, point each one at a subject, and it fetches the data straight from the Wikimedia APIs."
   🖱 slow pointer drift across the board; nothing clicked
3. 🗣 "What you are looking at is the starter board — three cards: pageviews for the Main Page, a link count, and a ranking of the largest Wikipedias."
   🖱 point at each card in turn (a quick pulse, not a click), one per clause
   ⭕ ring each card's title as it is named — 0.6s each, thin ring, no zoom (three zooms in a row is seasick)
4. 🗣 "All of it is live."
   🖱 settle; pointer away from the cards
   📝 "Live data · no login · no server"

Note: this scene has no actions, so the current take fits its narration fine. It is the one place a
zoom could help — a 1.2× push onto the third card while it is being described.

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
   ⭕ ring each icon *as its name is spoken* (four rings, ~0.7s each) ⚠ currently all after the sentence
4. 🗣 "The name chip next to the title is the card's identity — other cards can refer to it by that name."
   🖱 hover the name chip; a tooltip appears
   🔍 hold the zoom; move the window slightly to include the chip ⚠ currently never zoomed
   ⭕ ring the chip

---

## 3. Clear it and start your own

`scene 03-reset` · starts from: the starter board · target ~16s

1. 🗣 "To start your own board, you can clear this one: click Reset, and the board goes back to the same three starter cards."
   🖱 click ↺ Reset — **on the word "Reset"**, not 3s later ⚠
   ⭕ ring the Reset button before the click (1.2s), so the viewer sees where you are going
2. 🗣 "Anything you had is gone, so export first if you want to keep it."
   🖱 pause, pointer away from the buttons (give the warning room)
   🔊 soft "warn" tone (optional) — decide: is a sound effect right for a wiki tool?
3. 🗣 "From here, everything you add is yours."
   🖱 small scroll of the refreshed board

Open question for you: the reset has **no confirmation dialog** in the product today (issue #75).
Until that changes, this scene is teaching a destructive click. Options: (a) show it as is and keep
beat 2's warning, (b) fix the product first so the video shows a "Clear all?" dialog — that is a
~10-line change and one re-record of this scene.

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
   🖱 click the search field, type "pageviews" ⚠ typing currently silent and un-zoomed
   🔍 1.8× onto the search field while typing
   🔊 a soft click per keystroke (throttled — one per ~90ms, not one per character of a fast typist)
   📝 the typed string shown large, e.g. `pageviews` in a corner chip
4. 🗣 "A new card appears with a placeholder subject."
   🖱 the card is added; the modal closes
   ⭕ ring the new card's title
5. 🗣 "Open its gear to configure it: here is the article field — type or paste the exact article title — and the project selector beside it."
   🖱 click ⚙, then click into the article field and type the subject ⚠ same fix as beat 3: zoom + keystroke sound + large typed-text chip
   🔍 1.6× onto the settings panel; hold while typing
   ⭕ ring the article field, then the project selector, as each is named
6. 🗣 "Watch the total and the daily bars fill in with real data for that article."
   🖱 typing stops; the panel stays open; the data lands
   🔍 hold the zoom on the card's numbers so the change is visible at phone size
7. 🗣 "Anything you change takes effect immediately."
   🖱 close the panel; a small settle

Subject choice: currently **Albert Einstein**. A different article would change every number on
screen — say the word if you want a WikiPortraits-adjacent subject instead.

---

## 5. Move and resize

`scene 05-move` · starts from: the starter board · target ~16s

1. 🗣 "Drag a card by its top bar to move it, and the rest of the board reflows around it."
   🖱 drag the first card one column right — **the drag starts on "Drag" and is still moving while the clause about reflowing is spoken** ⚠ today the whole drag is over before the sentence
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
   🖱 click ⬇ Export — **on the word "Export"** ⚠ today the click precedes the sentence by ~1s
   ⭕ ring the button before the click
2. 🗣 "WikiBento writes the whole thing — every card, its settings, and its position — as a small JSON file."
   🖱 the download happens; open the downloaded file (we show it from a local copy to avoid a frozen browser download shelf)
   🔍 1.35× onto the JSON's first lines
3. 🗣 "That file is the board: there is nothing else to save."
   🖱 scroll the JSON a little
   📝 "dashboard.json — the whole board in one small file"

Honesty note that should stay in the narration unless you overrule it: the exported file carries
cards, their settings and their positions — **but not the board's `params` block**, so a board that
uses parameters does not round-trip (issue #75). Saying "every card, its settings" is true; "the
whole board" is not, for parameterised boards.

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
