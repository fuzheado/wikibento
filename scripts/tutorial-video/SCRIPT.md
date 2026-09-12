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

## Title card

`scene 00-title` · target ~5s

1. 🗣 "WikiBento is a dashboard you build yourself, out of live Wikimedia data."
   🖱 the title card is on screen; nothing to do — this line plays over it

Narrating the title card (2026-09-12): five seconds of silence while a logo sits there wastes the moment
when attention is highest. The line that used to open scene 1 opens the video instead, so the story
starts the instant the picture does.

---

## 1. What WikiBento is

`scene 01-what` · starts from: the starter board (three widgets) · target ~24s

1. 🗣 "Every box here is a widget. A widget shows one thing — a pageview count, a table, a chart, a gallery — from a Wikimedia project, or from another service worth composing with."
   🖱 slow pointer drift across the board; nothing clicked
   🔍 1.2× @ .grid-item:nth-child(1) — a gentle push on the first widget while it is being described
2. 🗣 "This is the starter board: three widgets — pageviews for the Main Page, a link count, and a ranking of the largest Wikipedias."
   🖱 point at each widget in turn (a quick pulse, not a click), one per clause
   ⭕ @ .grid-item:nth-child(1) .widget-title — as the first widget is named
   ⭕ @ .grid-item:nth-child(2) .widget-title — as the link count is named
   ⭕ @ .grid-item:nth-child(3) .widget-title — as the ranking is named
3. 🗣 "No login, no server: you point each widget at a subject."
   🖱 settle; pointer stays with the board
4. 🗣 "And all of it is live."
   🖱 pointer away from the widgets
   📝 "Live data · no login · no server"

Words: the tutorial says **widget** everywhere, and only ever widget — it is what the product calls
them (the button says “+ Add Widget”), and calling the same box a “card” in one scene and a “widget” in
the next makes the viewer wonder whether they are different things. “Card” is reserved for the video's
own title and closing screens.

Zoom: **accepted 2026-09-11**, and wired the same day — the fx layer is applied inside the page (a CSS
transform on `#root`, and a red ring drawn over the target), so it is part of the recording rather than
post-production, and magnified text stays crisp because the browser re-renders it. The beat offsets
that time it come from the voiceover, and the targets come from the `@` selectors above.

---

## 2. Read a board someone shared

`scene 02-read` · starts from: `?config=https://w.wiki/TR9R` (the WikiPortraits demo board) · target ~33s

1. 🗣 "Boards travel as URLs. This one is the WikiPortraits demo, and the whole configuration is in the link: config equals, then the address of a JSON file on a Wikimedia server."
   🖱 pointer rests on the address bar area / the board's top bar
   ⭕ @ .fx-url-config — ring the `?config=` part of the URL, exactly your "red circle" case. The
      recorder draws this URL pill, because a browser's address bar is not part of the recording:
      the frame is the page viewport only. It shows the address **decoded** —
      `?config=https://w.wiki/TR9R`, not the `%3A%2F%2F` form — because the escaping is what makes
      the link work, not what makes it readable.
2. 🗣 "WikiBento fetches that file and builds the board from it."
   🖱 slight scroll, or nothing (the board is already built)
3. 🗣 "Every widget has the same top bar: the i explains where its data comes from, the gear configures it, the arrow refreshes it, and the cross removes it."
   🖱 four separate hovers, in that order: ⓘ → ⚙ → ↻ → ✕
   🔍 1.6× @ .grid-item:nth-child(1) .widget-header — the four icons are ~20px each; at 1.6× they are legible on a phone
   ⭕ @ .grid-item:nth-child(1) button[title="About this widget"] — as “the i” is named
   ⭕ @ .grid-item:nth-child(1) button[title="Configure"] — as “the gear” is named
   ⭕ @ .grid-item:nth-child(1) button[title="Refresh"] — as “the arrow” is named
   ⭕ @ .grid-item:nth-child(1) button[title="Remove"] — as “the cross” is named
   (four rings spread across this beat, so each lands on its own name)
Cut (2026-09-12): a beat about the name chip — "the widget's identity; other widgets can refer to it by
that name". True and useful, but it is a dataflow detail an ordinary user does not need, and the tutorial
is meant to run under three minutes.

---

## 3. Clear it and start your own

`scene 03-reset` · starts from: the starter board · target ~16s

1. 🗣 "To start your own board, you can clear this one. Reset asks first — you can go back to the starter set, or begin with an empty board."
   🖱 click ↺ Reset — **on the word "Reset"** — and the dialog opens: Cancel · Blank board · Starter set
   ⭕ @ button[title="Reset to defaults"] — so the viewer sees where you are going before the click
      (the dialog's own buttons are drawn by the app, so they need no ring from us)
2. 🗣 "Anything you had is gone, so export first if you want to keep it."
   🖱 hold on the dialog, pointer away from the buttons (give the warning room)
3. 🗣 "From here, everything you add is yours."
   🖱 click **Starter set**; the board refreshes

**Built 2026-09-11** (this replaced an open question). Reset now asks: it offers the starter set, a
blank board, or cancel, and it clears the board's `params` block along with the widgets. The empty
state says "No widgets yet. Click + Add Widget to get started."

Take note: the recorder clicks **Starter set**, so this scene ends on the board the next scene expects.
The alternative take — choose **Blank board**, then let scene 4 start from an empty grid — is
the better story arc (you watch a board being built from nothing), and it needs scene 4's start state
changed to a blank board along with it. Not done yet.

🔊 dropped for this scene (decided 2026-09-11): a warning tone was proposed, never implemented, and not
wanted. The dialog is the warning.

---

## 4. Clear the board, then add a widget and point it at a subject

`scene 04-add` · starts from: the starter board · target ~45s · **the busiest scene; still the most timing risk**

1. 🗣 "Let us start from nothing. Each widget has a cross on its top bar, and that removes it."
   🖱 click the ✕ on the first widget
   ⭕ @ .grid-item:nth-child(1) button[title="Remove"] — the cross, just before the click
2. 🗣 "Remove the other two the same way, and the board is empty."
   🖱 click the ✕ on the remaining two widgets, one after the other
   ⭕ @ .grid-item:last-child button[title="Remove"] — the last one, as it goes
3. 🗣 "Now add a widget: click Add Widget."
   🖱 click ＋ Add Widget
   ⭕ @ .btn.btn-primary — the Add Widget button, just before the click
4. 🗣 "The picker lists every widget type, grouped by category, and you can search it."
   🖱 modal opens; a slow scroll through the categories
   🔍 1.25× @ .add-widget-panel — onto the picker for the scroll, then release
5. 🗣 "Search for pageviews and add Article Pageviews."
   🖱 click the search field, type "pageviews"
   🔍 1.8× @ .add-widget-search — onto the search field while typing
   🔊 a soft click per keystroke (needs post-production — no audio is recorded)
   📝 the typed string shown large, e.g. `pageviews` in a corner chip
6. 🗣 "A new widget appears with a placeholder subject."
   🖱 the widget is added; the modal closes
   ⭕ @ .grid-item:last-child .widget-title — the widget that just appeared
7. 🗣 "Open its gear to set the subject: the article field is here, and the project selector beside it."
   🖱 click ⚙, click the article field, set it to Marie Curie, then click **Apply & Reload**
   🔍 1.6× @ .widget-config — hold on the settings panel while the subject is set
   ⭕ @ .widget-config input[placeholder="Main_Page"] — the article field, as it is named
   ⭕ @ .widget-config select — the project selector beside it
8. 🗣 "Watch it fetch real data for that article."
   🖱 **wait for the numbers to actually change** — the recorder polls until the widget's value stops
      being the Main Page figure, and says so if it never does
   🔍 1.6× @ .grid-item:last-child — hold on the widget while the data lands
9. 🗣 "Anything you change takes effect immediately."
   🖱 close the panel

Why the removals are here: the board is otherwise crowded, the widget being configured sits in the
bottom-left where it is hard to read, and starting from an empty grid is the moment to show the ✕. The
narration says the data arrives, so the recorder must **wait for the fetch** (beat 8) rather than move
on: the first take set the field to Marie Curie and never showed her numbers, which made the line false.

Subject: **Marie Curie** (changed from Albert Einstein, 2026-09-11). A WikiPortraits subject rather
than a default-looking one.

---

## 5. Move and resize

`scene 05-move` · starts from: the starter board · target ~16s

1. 🗣 "Drag a widget by its top bar to move it, and the rest of the board reflows around it."
   🖱 drag the first widget one column right — **the drag starts on "Drag" and is still moving while the
      clause about reflowing is spoken**, which is what the recorder now does: the increments are spread
      across this beat
   ⭕🔍 *no fx during the drag, deliberately.* The script's own rule is that a zoom never runs while
      something is moving, and here it is not just taste: the zoom is a CSS transform on the app root, so
      it moves the widget under the pointer mid-gesture. A take with a 1.15× push on this beat recorded a
      drag that silently did nothing — the widget never moved. The ring is drawn once at fixed
      coordinates, so on a moving widget it would sit still as the widget slid out from under it.
   🔊 optional soft "pick up / put down" ticks — needs post-production; no audio is recorded
2. 🗣 "Drag the bottom corner to resize."
   🖱 resize from the corner handle
   ⭕ @ .grid-item:nth-child(1) .react-resizable-handle — the corner handle, as the drag starts
3. 🗣 "The grid keeps everything aligned, and widgets have a minimum size."
   🖱 a small overshoot that snaps back (deliberate demonstration of the minimum), or nothing
   🔍 1.15× @ .grid-item:nth-child(1) — the gentle push belongs here, on a board that has stopped moving

Measured recipe, so nobody has to rediscover it: one column ≈ 262px of pointer travel at 1920px
wide; a widget in the leftmost column cannot move left (it snaps back); the drag must be handed to
the widget's top bar, not its body. This scene is why it stays on the plain three-widget board — the
wide bottom widget refuses to shift when anything else is added.

---

## 6. Export the board

`scene 06-export` · starts from: the board with the added widget · target ~15s

1. 🗣 "When the board looks right, click Export."
   🖱 click ⬇ Export — **on the word "Export"**, which is where the recorder now clicks
   ⭕ @ button[title="Export dashboard config as JSON"] — the Export button, before the click
2. 🗣 "WikiBento writes the whole thing — every widget, its settings, and its position — as a small JSON file."
   🖱 the download happens; open the downloaded file (we show it from a local copy to avoid a frozen browser download shelf)
   *no zoom here, deliberately.* A file is read from its top-left corner at 1×. Zooming it was the earlier
      mistake: the target is larger than the viewport, so scaling it pushed the left edge and the header
      off-screen and the viewer saw the middle of the file with every line clipped. (The fx layer now
      anchors an oversized target to its top-left rather than centring it, which fixes the general case —
      but a JSON file does not need magnifying, so this beat simply shows it.)
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

## 7. Put the JSON file where it can be fetched

`scene 07-store` · starts from: the raw wiki file holding the demo JSON · target ~12s

1. 🗣 "That JSON needs a home your browser can read. The easiest is a file on a wiki — paste it onto a subpage of your user page."
   🖱 the raw file on screen; pointer at the top
   📝 "A wiki file: the board's JSON, on a Wikimedia server"
2. 🗣 "It sits there with the wiki's own history and permissions."
   🖱 scroll the file slowly
   ⭕ *not wired*: on the raw file (`?action=raw`) Chromium renders plain text with no title element to target.

Words matter here: it is a **file holding JSON**, not a “wiki page”. Saying “wiki page” makes a viewer
picture a Wikipedia article, and this is neither an article nor prose — it is a small configuration file,
served from a Wikimedia server, that the app reads.

Deliberately cut (2026-09-12): the MediaWiki-API explanation and the cross-origin/hosting discussion. The
audience is an ordinary user; “CORS-enabled MediaWiki API” is not a sentence that helps them paste a file,
and the tutorial is stronger ending at the payoff.

---

## 8. The payoff: a link you can share

`scene 08-reload` · starts from: `?config=https://w.wiki/TR9R` · target ~13s

1. 🗣 "And that is the payoff. Your wiki file plus config equals is a complete, portable board."
   🖱 the board as it loads; the URL pill at the top
   ⭕ @ .fx-url-config — the callback to scene 2 is the point of the whole video (same recorder-drawn URL
      pill, shown decoded)
2. 🗣 "The link is the whole thing: share it, bookmark it, or turn it into a QR code."
   🖱 open the Share panel and its QR code
   🔍 1.5× @ .share-qr-card svg — onto the QR code so it is clear enough to understand, not necessarily to scan
   📝 "Share · bookmark · QR code"

Cut (2026-09-12): the “open it on any machine, or a lobby kiosk” beat. Ending on the payoff and the share
is a better close, and the tutorial is meant to be short.

---

## Closing screen

`scene 99-end` · target 5.5s

🗣 silent (or one line, if you want one — this is where a call to action would go)
🖱 `wikibento.toolforge.org` · `?config=<your wiki page>` · `docs/TUTORIAL.md`
