# Documents on Commons — a full-featured viewer for PDFs (and DjVu)

*Researched 2026-09-15 by probing live APIs, from the question: WikiBento can now read an Internet Archive
book page by page; how should it read a **Commons PDF**? Every number below was measured on that date.*

Short answer: the page images come from a Wikimedia scheme that is **simpler than IIIF**, the reader UI can
be **the same component** as the IA book viewer, and the tempting "just embed the browser's PDF viewer"
route is **both unverified here and fragile by design** — so the recommendation is a real page reader plus
a link, not a framed document.

## What Commons gives us — measured 2026-09-15

| what | endpoint / detail | measured |
|---|---|---|
| **page count** | `imageinfo` `pagecount` — a first-class field, not just a metadata blob | `File:The excavations at Dura-Europos … .pdf` → **188** |
| page-1 size | `imageinfo` `width` × `height` (a document reports its **page** size) | 1175 × 1612 |
| type | `mime: application/pdf`, `mediatype: **OFFICE**` | — |
| **one thumbnail per page** | `iiurlparam=page{N}` (1-indexed) → `thumburl`, `thumbmime: image/jpeg` | works for pages 1, 94, 188 |
| the URL scheme | `…/thumb/{h0}/{h01}/{name}/page{N}-{width}px-{name}.jpg` | documented in our `wikimedia-commons-pdf` skill |
| the original file | `application/pdf`, `accept-ranges: bytes`, **`access-control-allow-origin: *`** | `206` on a range request |
| framing policy | `content-security-policy-report-only: … frame-ancestors 'none'` | **report-only** — a stated intent, not yet enforced |
| **a text layer** | only where Wikisource has proofread it: `Page:{file}/{N}` | `Page:EB1926 - Supplement Volume 3.pdf/434` → **10,737 chars** |

DjVu is the same model (`pagecount`, the same `pageN-` scheme) and is the Wikisource norm, so one reader
covers both formats.

## Three ways to be "full-featured", and what each really costs

**Tier A — page images in our own reader.** Fetch `pagecount`, then show
`page{N}` thumbnails at whatever width the card can take, with page turn, jump, zoom, a thumbnail strip, and
facing pages.
*Get:* complete control; works on every browser and on mobile; prints and exports like any other card; no
dependency; no framing question; the same code path as `iaBook`.
*Cost:* no text layer — you cannot select or search the document's text.

**Tier B — the browser's own PDF viewer in an iframe.** Chrome, Safari and Firefox each ship a full PDF
viewer: zoom, page jump, **search inside**, print, download, text selection, all for free.
*Get:* the most capable experience per line of code — zero.
*Cost — four of them, and they are why this must not be the primary route:*
1. **I could not verify it here.** In headless Chromium **both a sandboxed and an unsandboxed frame render
   blank** for a real Commons PDF (the file *is* fetched — two requests seen — but nothing paints), because
   headless Chromium ships no PDF viewer. So this route is **unverified in this environment**: check it in a
   real Chrome and Safari before designing on it.
2. **Our own sandbox policy.** `wikiPage` sandboxes custom URLs deliberately (ISSUE-62: an untrusted
   third-party page must not run scripts in our origin). An in-card PDF now means either relaxing that for
   an allow-list of Wikimedia hosts, or an exception; that is a security decision, not a feature flag.
3. **Wikimedia may forbid framing at any time.** The CSP is `report-only` today, and it already says
   `frame-ancestors 'none'`. When it is enforced, every framed document breaks at once. (Contrast the
   Internet Archive, whose images are CORS-enabled *and* unframed — nothing there depends on goodwill.)
4. **iOS Safari shows only the first page** of a PDF in a frame, which is worse than Tier A.

**Recommendation:** Tier A as the card, plus a **"open the original" link** — a real new tab gets the
browser's full viewer with none of the four costs. Framing is a bonus mode we can add later, behind a real
browser check and an allow-list.

**Tier C — PDF.js in the card.** The only way to get a **text layer and search-inside for a PDF that
Wikisource has not proofread** (i.e. nearly all of them). The bytes are CORS-enabled, so it can fetch them.
*Cost:* a real dependency (~1 MB plus a worker), our own rendering and text-layer code, and a much heavier
widget. Worth it only if text search inside arbitrary Commons PDFs turns out to be a requirement — Tier D
covers the proofread minority for free, and Tier A's page images cover reading.

**Tier D — the Wikisource text, where it exists.** For a proofread document the per-page text is an API call
away, with the proofreading status attached (`<pagequality level="1" …>` — 0 no text, 1 problematic,
2 not proofread, 3 proofread, 4 validated), wrapped in templates a parser must strip (`<noinclude>`,
`{{rh||…}}`).
*Get:* real text, per page, plus a quality signal nothing else offers.
*Cost:* **coverage is thin** — the 188-page report above is used on Wikidata and nowhere else, with no
`Page:` transcription. So this is a panel that appears when the document has one, never the plan.

## The architecture: one paged viewer, two sources

This is the part that makes the whole thing cheap. `iaBook` already has: a page count, a per-page image URL
builder, a counter, a zoom ladder, a thumbnail strip, page turn, a search-inside hook and a word crop. A
Commons document has the same shape with different plumbing.

Extract the viewer (`PagedViewer`) and give it a **page source**:

```js
// A page source is what the viewer needs and nothing more.
{
  title, subtitle, links,        // header + "open the original" row
  pageCount,                     // iaBook: manifest canvases; Commons: imageinfo.pagecount
  pageUrl(i, width),             // iaBook: canvas service id; Commons: the pageN- thumb URL
  direction,                     // 'left-to-right' | 'right-to-left'  (ISSUE-81)
  search: null | { run(q), pageOf(hit), regionOf(hit) },   // IIIF Content Search; Wikisource text for PDFs
  pageText: null | (i) => Promise<string>,                 // IIIF canvas annotations; Wikisource Page:
}
```

Two sources ship: **IIIF** (archive.org) and **Wikimedia document** (Commons PDF/DjVu). Consequences:

- **ISSUE-81 (facing pages) is implemented once** and lands in both readers — including the
  right-to-left case, which matters for Arabic/Hebrew/Yiddish scans on *both* sources.
- The strip, counter, zoom, empty and error states have one implementation, one set of tests.
- A third source (say an IIIF manuscript from another institution, or a multi-page TIFF) is an adapter, not
  a new card.

## Traps, all measured

1. **An out-of-range page is clamped, not refused.** `iiurlparam=page189` on a 188-page document returned
   page 188 — the same 136,458-byte file, byte for byte. (The Internet Archive's IIIF route does the same
   thing with a blank filler image.) **Never probe for a 404 on either source** — clamp to `pagecount`.
2. **The delivered image is not the size you asked for.** `iiurlwidth=1024` produced a `thumburl` the API
   described as 1024 × 1405, and served **960** × 1317 pixels. Wikimedia buckets widths. Lay out from the
   image's own dimensions, and do not trust `thumbwidth`.
3. **Constructed thumb URLs are not equivalent to the API's.** Hand-built `upload.wikimedia.org/…/page1-…jpg`
   URLs 400'd for the 188-page report where the API's own `thumburl` (on `thumb.wikimedia.org`) served it.
   **Take the URL from the API** — this is also what our own skill warns, and the reason is now concrete.
4. **`thumburl` carries query junk** (`?utm_source=…`) that must be stripped before caching or comparing.
5. **`page{N}` is 1-indexed**, while the underlying `pagecount` counts pages — so page 1 is a valid page and
   index 0 is not.
6. **A page count is not a leaf count.** For scans these usually agree, but the IA manifest proved they can
   disagree (20 vs 16), so the count must come from the source that renders the pages.
7. **Framing a document is not like framing a wiki page.** The CSP above is report-only *today*; iOS shows
   only page 1; and headless Chromium cannot render it at all, which is why Tier B is a link first.

## The recommended path

Ordered so that each step is cheap because of the one before it. Effort is roughly a half-day for the
refactor and a day each for the features, assuming the IA work stays the template.

| # | step | why here | done when |
|---|---|---|---|
| 0 ✅ **done 2026-09-15** | **ISSUE-80** — the CORS-image PNG path | small, already filed, and it makes `iaBook`'s PNG claim true; **the same path serves this reader** (Commons page thumbs are `access-control-allow-origin: *` too), so it is shared infrastructure rather than a detour | the export menu offers PNG for `iaBook`, verified by a real download in `smoke:iabook` |
| 1 ✅ **done 2026-09-15** | **Extract `PagedViewer`** from `iaBook`, behind a page-source interface (`src/lib/pagedViewer.js` + `src/widgets/PagedViewer.jsx`) | do it *now*, while the card is days old: once facing pages, a text panel and a second source are layered in, the same refactor costs several times as much — and it is the step that makes 2 and 3 small | no visual change; 18 unit tests and **19/19** `smoke:iabook` assertions still pass; the IIIF source module holds the code that used to be in `iaBook.js` |
| 2 ✅ **done 2026-09-15** | **ISSUE-81 facing pages** on the shared viewer, right-to-left included | the user-visible ask, written once for both readers instead of twice | spread mode shows two images, the counter reads "pages N–N+1", the pair order **flips for a `right-to-left` book**, and a printed spread is one page |
| 3 | **`documentReader`** (📄) — the Commons card — **next** | mostly free after 1 and 2 | `smoke:document-reader`: `pagecount` from `imageinfo`, last page renders, **one past the end clamps**, thumbnails load, "open the original" points at the file, a DjVu works, and a page that will not render **degrades to a link**; plus `?config=/document-reader-demo.json` (a Commons PDF beside an IA book, same viewer) |
| 4 | **PDF.js** — text layer and search for any PDF | only on evidence, not by default | triggered by a real requirement to search an unproofread PDF's text; until then the Wikisource panel covers the proofread minority |

**Deliberately not on this path:** an in-card framed PDF. The "open the original" link gives the same thing
— the browser's full viewer, in a real tab, with its own zoom, search and print — with none of the four
costs listed above, and it cannot be broken by a Wikimedia CSP change. If it is ever revisited: an
allow-list first, a real-browser check of the sandbox question second, and never as the only way to read a
document.

**Relative to the IA media family** (`iaPlaylist` → `iaVideo` → `iaAudio`): the two workstreams are
independent — paged reading versus media playback — and playback risk is already retired, so nothing breaks
if the media work waits. This path is worth taking first because step 1 halves the cost of everything after
it, and because facing pages is a gap in a card that has already shipped.

## What I would build

1. **Extract `PagedViewer` from `iaBook`** and re-point `iaBook` at it — no user-visible change, and it is
   what makes the next item small.
2. **`documentReader` (📄)** — a Commons PDF/DjVu card: page images, turn/zoom/strip, "open the original",
   `pagecount`-driven, `imageinfo` for the header (file size, dimensions, page count). Tracker: ISSUE-82.
3. **Facing pages (ISSUE-81)** on the shared viewer, right-to-left included — then it is done for both.
4. **Wikisource text panel** when the document has a `Page:` transcription, with the quality level shown.
5. **PDF.js** only on evidence — if searching arbitrary PDFs becomes an actual requirement.

**Not doing:** an in-card framed PDF as the primary reading experience. If we add it, it is behind an
allow-list, after a real-browser check of the sandbox question, and documented as fragile — a bonus for
Chrome users, never the way a document is read.
