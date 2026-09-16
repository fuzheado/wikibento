# URL state — what the address bar is allowed to say

**Status:** contract decided and enforced. The reported bug (↺ Reset leaving `?config=` behind) and its
twin (Share handing over a URL that no longer matched the board) are fixed and covered by
`npm run smoke:url`. Two questions at the bottom are genuinely open.

The rule, in one line: **the URL is a claim about what is on screen, and every action must either keep the
claim true or drop it.** A URL is the only artifact of a board that survives a copy, a bookmark, an e-mail,
a slide and a QR code — so a wrong URL is not cosmetic, it is the app telling someone else's browser to
show a board that no longer exists.

## The bug that prompted this

A user hits ↺ Reset on `/?config=/demos.json`, gets a blank board — and the URL still says
`?config=/demos.json`. Reload, or paste that link to a colleague, and the board they just discarded comes
back. The Reset *did* work: it cleared the widgets and localStorage. What it did not do was stop the URL
from claiming otherwise.

Auditing for that same shape found a second instance, pointing the other way: **Share** preferred the
`?config=` URL whenever one was present ("dramatically shorter than the hash form"), so loading a demo,
changing a parameter and hitting Share handed over the *file's* board rather than the one on screen. Same
lie, the other direction, and this one reached a second person.

Both were silent. Neither was a crash or a visible glitch — which is why the audit below is a script, not a
paragraph.

## The contract

| | rule | why |
|---|---|---|
| **C1** | **Claim integrity.** A board claim (`?config=…`, `#/d/<payload>` plain, `#/z/<payload>` gzip+base64url) is valid only while the board equals what it names. Any action that replaces or modifies the board drops the claim. | The URL is what a reload restores and what a recipient gets. It must not outlive the board it describes. |
| **C2** | **Present mode is opt-in and reversible.** `?kiosk=1` / `?lean=1` are set by the deliberate enter path and stripped by Exit. Escape *keeps* them — a present link stays a present link. | Presentation is a property of the link you hand out, not something a refresh should silently cancel. |
| **C3** | **View state never enters the URL.** Zoom, page number, open panels, sort order, search boxes, selection. | Not the artifact; and a 40-widget board's every mouse move would explode the URL. |
| **C4** | **Transient UI never touches the URL.** Dialogs, toasts, boot errors, hover, drag-in-progress. | Same reason, plus these have no meaning to a recipient. |
| **C5** | **One reader, one writer.** All URL access in `src/` goes through `src/lib/urlState.js`; a source-level test fails if a second place starts writing history or interpreting the query string. | Both bugs came from a second place having an opinion about the URL. |
| **C6** | **Replace, never push.** The app reads the URL once at boot and does not implement `popstate` re-boot, so `pushState` would change the URL without changing the board and break Back. Undo is the existing toast. | Honesty about what the app is: a URL-*reader*, not a URL-*driven* app. Adopting push means adopting URL-driven rendering first. |

Precedence at boot, unchanged: `?config=` → `#/d/<payload>` → localStorage → starter board.

## The inventory

Every place in the app where a click, drag or keystroke might reasonably be expected to affect the URL, with
the decision written down — including the "no" decisions, which is the point of writing them down.

### A. Board identity — carried by the URL, claim dropped when it goes stale

| action | where | changes | in the URL? | decision |
|---|---|---|---|---|
| load `?config=<file>` | boot | whole board | **yes**, `config` | the claim itself — kept while the board matches, dropped the moment it doesn't |
| open `#/d/<payload>` | boot | whole board | **yes**, hash | same, as `embed` |
| open `#/z/<payload>` | boot | whole board | **yes**, hash | the same claim, gzipped first (ISSUE-89) — measured to take the demo boards from 1-of-15 fitting a QR code to 13-of-15. A pre-2023 browser (no `DecompressionStream`) gets a readable error naming the alternatives, never a broken board |
| ↺ Reset → blank / starter | `handleReset` | whole board | **claim dropped** | was the bug; a blank board must not be re-openable from the address bar |
| ✨ Example | `handleLoadExample` | whole board | **claim dropped** | wholesale replacement |
| ⬆ Import | `handleImport` | whole board | **claim dropped** | wholesale replacement |
| ＋ Add Widget | `handleAddWidget` | +widget | **claim dropped** | an edit makes `?config=` false (C1) |
| ✨ Ask | `handleAddAssembly` | +widget(s) | **claim dropped** | same, with an undo toast |
| ✕ Remove | `handleRemoveWidget` | −widget | **claim dropped** | same |
| ⚙ Configure | `handleUpdateConfig` | widget config | **claim dropped** | same |
| ✎ Rename id | `handleRenameWidget` | ids + refs | **claim dropped** | same |
| drag / resize | `onDragStart` / `onResizeStart` | layout | **claim dropped, by the gesture** | a reload restores the dragged arrangement, so the file's URL is no longer true. Bound to the gesture *start* — see the trap below |
| board parameter | `handleSetParam` | params block | **claim dropped** | same, and the params block is part of the board |
| ⧉ Duplicate / ⌘C⌘V | *not built* | +widget | **claim dropped** | ISSUE-86 — goes through the same path by construction |
| ⤓ Export / 🖨 Print | `handleExport`, `printTarget` | nothing | **no** | reads the board; changes nothing |
| follow a demo link ([hub](?config=/demos.json), About panel) | a plain `<a href="?config=…">` (markdown) | whole board | **push — by the browser** | the one place a push is correct: a link to another document is a real navigation, so Back genuinely returns to the hub. C6 forbids *the app* inventing history around a state change — not a link being a link |
| 🧩 Undo (the assembly toast) | `handleAddAssembly` | −widget(s) | **the claim is not restored** | undo puts the board back, but the URL stays claimless. That is still honest — the URL is allowed to claim nothing; re-claiming would write a URL the user never actually visited |
| ⬆ Share | `openShare` | nothing | **yes, by embedding** | the one action that deliberately *writes* the board into a URL — as `#/d/<payload>`, and only from the board on screen (C1) |

### B. Presentation — carried, opt-in, reversible (C2)

| action | where | in the URL? | decision |
|---|---|---|---|
| Enter Present (kiosk) | `enterKiosk` | **no** on the address bar; **yes** in a shared link | entering present mode does not invent a param — the *link* you hand out carries it (`presentModeUrl`) |
| Enter Lean | `enterLean` | same | |
| Exit (button) | `exitPresent` | **strips** `kiosk`/`lean` | a refresh after Exit lands in normal mode |
| Exit (Escape) | key handler → `exitPresent` | **keeps** the param | ISSUE-18: a present link stays a present link |
| `?lean=1` on load | boot | honoured | the param a scanned link carries |

### C. View state — deliberately never in the URL (C3)

| action | today | decision |
|---|---|---|
| Timeline zoom (1–8×), alignment, overlap, light theme | component state | not in the URL. *Maybe later:* `?tlZoom=` if "look at this window" becomes a request |
| Reader page turn, spread on/off, shift, text panel open | component state | **not** — with one open question below about deep-linking a page |
| `iaBook` search inside | component state | not in the URL |
| ⚙/ⓘ/¶ panel open per card | component state | not in the URL |
| Sort column, filter text, gallery index, selection | component state | not in the URL |
| Scroll position, focused card | component state | not in the URL |
| Copy feedback ("Copied!") | transient | never |
| 🔊 Speaker play/stop (text-to-speech) | component state | not in the URL — playback, not the board |
| 🔌 Diagnostics network self-test | component state | never — a dialog, and the results are momentary |

### D. Transient UI — never (C4)

Toasts (including the assembly undo toast), the Add/Ask/Import/Share/About/Diagnostics/Reset dialogs, the
boot-error banner, loading spinners, hover and drag-in-progress state. None of these are things a recipient
should be able to receive or a reload should restore.

## How it is measured

Three layers, because prose cannot fail:

1. **The contract as data** — `URL_STATE_CONTRACT` and `NEVER_IN_URL` in `src/lib/urlState.js`. A reviewer
   adding a URL param has to edit a table that says what each one means, and the read list is *derived* from
   it, so an orphan read is impossible by construction.
2. **Pure tests + a source scan** — `tests/url-state.test.mjs`: the contract is internally
   consistent, `pushState` is never called, view/transient keys carry no param, the fingerprint is built on
   the same serialisation localStorage holds — and a walk of `src/` that fails if anything outside
   `urlState.js` writes history or interprets `location.search`/`.hash`.
3. **A live audit** — `npm run smoke:url` (`scripts/url-state-audit.mjs`) drives the real app in Chromium and
   prints the table below, failing on any invariant break. It traces one edit per **class** (a widget removed,
   a board parameter changed, a card dragged) rather than all fourteen board actions, because the claim-drop
   is one mechanism and one fingerprint.

   It also guards two traps that only appear when you drive the app:

   - **A quiet load must not count as an edit.** react-grid-layout fills in a config whose layout has gaps, so
     "the layout changed" is true on arrival for such boards. Arrangement is therefore *not* part of the claim
     fingerprint at all, and a real drag drops the claim from the gesture handler instead.
   - **A gesture "stop" is not the signal; a "start" is.** The first version bound the drop to
     `onDragStop`/`onResizeStop`, and react-grid-layout **2.2 fires a stop handler once while placing the board
     on mount** — so every demo's claim died the moment it loaded, including boards with a complete authored
     layout. `onDragStart`/`onResizeStart` cannot fire without a pointer, and the audit's "a board whose layout
     had gaps keeps its claim on load" check is what caught it.

```
  action                            address bar                                note
  load ?config=<demo>               /?config=/document-reader-demo.json        5 cards
  ↺ Reset → Blank board             /                                          0 cards
  reload after Reset                /                                          0 cards
  remove a widget                   /                                          5 → 4 cards
  Share after editing               /#/d/eyJ2ZXJzaW9uIjoxLCJ3aWRnZXRz…         1462 chars
  Share an untouched board          /?config=%2Fdocument-reader-demo.json      58 chars
  change a board parameter          /                                          claim dropped
  drag a card                       /                                          claim dropped by the gesture
  load ?lean=1                      /?lean=1                                   present mode
  Exit present mode                 /                                          param stripped
  enter Present from a plain URL    /                                          no param invented
```

A self-review of this work (prompted by "are you confident this is satisfied?") closed four gaps. Three were
documentation and test hygiene: the inventory had missed **link
navigation** (the demos hub is markdown with plain `<a href>` links, so clicking a demo is a genuine browser
navigation — the one place a push is right), the 🔊 speaker and 🔌 diagnostics rows, and the fact that **undo
does not re-claim**. The corrected claim is about the tests: the first "no orphan reads" check compared
`READ_PARAMS` with the contract it is *derived* from and therefore could never fail. The load-bearing guard
against a second param reader is the C5 source scan; what the replaced test covers is reader/contract
agreement and page-URL param reads (whose rule has to ignore `share.js` reading `?title=` from a *remote* wiki
URL it is converting).

The audit earned its keep immediately: it caught a real crash in the Share panel (`claimIsFresh is not
defined` — an import that silently did not land), which no unit test would have seen because the module
imported fine and only the click path failed.

## Open questions (decided in the affirmative later, or not)

1. **Deep-linking a document page.** `?page=19` on the 📄 Document Reader / 📖 IA Book would be genuinely
   useful — "here is the page I mean" belongs in a citation, and it is a view state we currently refuse (C3).
   The distinction that makes it defensible: it is a *reference to a thing in the source*, not a view
   preference. Recommendation: yes, but only in the **share/embed** path first (as `?page=` alongside
   `#/d/…`), and only for one page number, not the whole reader state. Do it when someone asks to cite.
2. ~~**A shared link must not overwrite the visitor's board.**~~ **Done 2026-09-16 (ISSUE-88).** A URL board is
   now *borrowed*: shown, never written, until the visitor edits — and the displaced board is recoverable for a
   day. One signal does both jobs: the same content-fingerprint divergence that drops the URL's claim is the
   moment the board is adopted, so there are never two notions of "the board changed". The notice that offers
   [Save this as mine] / [Back to my board] appears only when something is actually at stake.
3. **Back-button undo.** Today Back does not undo board edits (C6 keeps it that way on purpose). Worth
   revisiting only if we adopt URL-driven rendering; the toast is the current undo affordance.

## Where the code lives

- `src/lib/urlState.js` — the contract, `parseUrlState`, `boardClaim`, `boardFingerprint`, `claimIsFresh`,
  `stripBoardClaim`, `setParams`, and `applyUrl` (the single writer).
- `src/App.jsx` — boot read, the claim-drop effect, Reset and `applyDashboard` dropping the claim,
  Exit stripping present params.
- `src/components/SharePanel.jsx` — builds the link from the board (`claimIsFresh` before reusing a
  `?config=` URL) instead of from the address bar.
- `src/lib/share.js` — `readConfigParam` / `readHashConfig` are thin aliases over `parseUrlState`.
- `scripts/url-state-audit.mjs` — `npm run smoke:url`.
- `tests/url-state.test.mjs` — including the one-writer source scan.
