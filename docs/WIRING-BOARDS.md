# Wiring boards together — what travels between cards

**Read the [GUIDE](GUIDE.md) first if you have never built a board.** This is the next step: making cards affect
each other, which is the one thing about WikiBento that is not obvious from looking at it.

## The one rule

> **A card shows what it fetched. Wiring is what makes one card affect another — and nothing is wired by
> default.**

That is the whole model. A pageviews card shows pageviews; a gallery shows pictures; clicking a sea name in a
rendered Wikipedia box does nothing to anything else *unless you wire it*. Every wire is something you asked for,
visible in the card's ⚙ panel, and reversible by clearing one field.

## The words (one set, used everywhere)

| word | what it means | where you meet it |
|---|---|---|
| **source** | a card that *publishes* a value | the **Source widget** field in a consumer's ⚙, and the source picker |
| **consumer** | a card that *reads* another card's value | its own config: `source`, or a `{{widget:…}}` reference |
| **emit** | the act of publishing (a source *emits*) | card descriptions, this guide; the code and the registry say the same thing |
| **output** | the value itself | "no value yet" in a consumer that is waiting |
| **channel** | *which* of a card's values (a card may publish more than one) | `id#selection` in the source picker |
| **reference** | a page **plus the wiki it is on**: `enwiki:Weddell Sea` | what a card publishes when it is about a page |
| **wire** | the connection itself ("wire A to B") | hints and this guide |

Semantics are on purpose, not decoration: a card that publishes and a card that reads are two roles, and a card
can be both — that is how chains work.

## What travels: text, and only text

The wire is text, because a board has to survive being saved to `localStorage`, embedded in a `?config=` URL, and
hashed for change detection. Four shapes travel:

| shape | example | who publishes it |
|---|---|---|
| a number | `42` | Line Count, Category Size |
| lines | `Weddell Sea\nBaltic Sea\n…` | Text List, Filter Lines, a Wikipedia box's **items** |
| prose | `Grace Coolidge (1879–1957) was…` | Article Excerpt |
| a **reference** | `enwiki:Weddell Sea` | a Wikipedia box's **selection**, a document reader's page |
| a URL | `https://archive.org/details/…` | IA Item, IA Book |

**References are the newest and the most useful** (ISSUE-92). A title alone does not say *which wiki* it is on, and
"Weddell Sea" exists on many — so a card that publishes a page publishes `enwiki:Weddell Sea`, and a consumer that
is about pages reads the project from the reference rather than guessing from its own configuration. The bare form
is still valid: a value with no project prefix is a title, which is why nothing built before this existed changed
meaning.

## What a value *is* — and what it is not (measured 2026-09-16)

Every value that travels today is a **primitive or an array of strings**: a number, a paragraph, a URL, or lines.
Nothing on the wire is an object. That is not a design principle so much as the current truth, and it has two
consequences worth knowing before you build a chain:

**1. Structure survives one path and not the other.**

| how a value travels | what the consumer receives |
|---|---|
| a `source` field (the dataflow picker) | the value **as it is** — an array stays an array, a number stays a number |
| `{{widget:id}}` inside a text field | **text** — an array is joined with newlines, an object becomes JSON |

That difference is deliberate (a text field can only hold text), but it means "the same value" can arrive with
different fidelity depending on how you wired it.

**2. Consumers infer from the *shape*, not from a type.** `toLines()` turns an array into lines and splits a
string; `countOf()` counts an array or the lines of a string. A widget's declared output kind
(`extract` / `lines` / `count` / `value`) is **documentation**: measured, nothing in the data path reads it. So a
consumer knows "this is a list", and cannot know **what the list is about** — categories, files and ranked rows all
arrive as the same shape of lines.

**What that means for a structured value:** if a widget publishes objects, they arrive at a `{{widget:…}}`
reference as a **single line of JSON**, which a Filter Line or a Text List will happily treat as one very long line.
Nothing is broken by it — and nothing can *consume* it either, because an anonymous object says nothing about what
it holds. The fix is a `type` inside the payload (ISSUE-97), which is the difference between a blob and a value.

**The rule to hold on to today:** keep what you publish either text, or lines — and if it has to be structured, say
what it is.

## Three ways to wire, easiest first

1. **Pick a source (no typing).** Open the consumer's ⚙, choose **Source widget**, and pick from the cards on the
   board that publish something. The picker labels each one with its id and a live description, and lists any
   extra channels separately — `click-seas#selection` is "what the reader clicked", as distinct from
   `click-seas` ("the box's items").
2. **Type a reference.** Any text field in any card may contain `{{widget:<id>}}` — it is replaced with that
   card's value wherever it appears. `{{widget:click-seas#selection}}` reads a *channel*. This is how you put a
   published value somewhere the picker does not reach (a page title, a category name).
3. **Let a click choose.** A rendered Wikipedia box can publish **what the reader clicked** (⚙ *Links in the box*).
   That is the only value in the app that comes from a gesture rather than from fetching, and it is what makes a
   board that responds to being used.

## Three boards that already work this way

- **A pipeline** — `?config=/flow-demo.json`: a Text List (lines) → Filter Lines (lines) → Line Count (a number) →
  Value Display. Each card is doing one thing, and the output of one is the input of the next.
- **A cross-language chain** — `?config=/translate-demo.json`: an Article Excerpt publishes its first paragraph,
  and a Translator consumes it. Two cards, one wire, no copying and pasting.
- **A reader's choice** — `?config=/click-through-demo.json`: a live `List of seas` box publishes the page the
  reader clicked as `enwiki:Weddell Sea`; the page viewer beside it loads that article, and a Value Display card
  shows the reference that travelled. Change *Links in the box* back to **new tab** and the board is inert again.

## What cannot be wired (yet), and why

- **A framed page is invisible.** The page viewer, the 360° viewer and the media player embed a page the browser
  does not let us read, so nothing inside them can be published. A card that embeds is a dead end for wiring —
  it is still a fine consumer (it can be *told* what to show).
- **Prose travels without its article — unless you ask for the second channel.** An Article Excerpt publishes its
  paragraph on `extract` and the page it came from on `reference` (`enwiki:Albert Einstein`), so "translate this
  paragraph *and tell me the article*" is two wires rather than one. A card that publishes prose is expected to do
  this: it is enforced, because prose is the one shape that cannot describe itself.
- **Nothing is pushed.** A consumer re-reads its source when the value *changes*; a source that emits an identical
  value twice is a deliberate no-op, so boards do not refresh in a loop. A wire that "does not fire" is usually a
  value that did not actually change.
- **No pictures on the wire.** Values are text: not images, not files, not DOM. `docs/MEDIA-DATAFLOW.md` is the
  design note for what it would take.

## The shape of a wired board

It is a graph, not a tree — usually a small one:

```
   Text List ──► Filter Lines ──► Line Count ──► Value Display
                                    │
                                    └──► Speaker          (a source can feed several consumers)

   Article Excerpt ─────────────────────► Translator      (a chain can be two cards long)
```

Rules of thumb that keep it legible: give every card a name you would say out loud (`click-seas`, not
`wikibox-3`); prefer one wire over three; and remember that a consumer can be a source, so a board can be read
left to right.

## Where to go next

- **Every widget, wired** — [BOARD-COMPOSITION.md](BOARD-COMPOSITION.md) is the complete reference of what each
  card publishes and what it accepts.
- **If you are writing a widget** — [WIDGET-DEVELOPMENT.md](WIDGET-DEVELOPMENT.md) has *The Emitter Contract*: the
  rules a new emitter must follow, including channels and references.
- **If you want the design reasoning** — [MODULARITY-AND-DATAFLOW.md](MODULARITY-AND-DATAFLOW.md) (why the wire is
  text-shaped) and [WIDGET-MESSAGING.md](WIDGET-MESSAGING.md) (how other tools solved the same problem).
