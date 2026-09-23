# Thumbnails: sizes, buckets, and lazy loading

Most of this page is borrowed evidence. `commons-vibe` — a sister project by the same author — spent real effort on
thumbnail sizing, and measured it: **`benchmark/thumb-metrics.md`** in that repo is the authority on how Wikimedia
serves image thumbnails. It is worth reading before touching any image code here.

**Local checkout:** `~/Documents/ai/commons-vibe` (clone of `github.com/fuzheado/commons-vibe`, MIT). Consult it
rather than re-deriving by trial and error; its benchmark has the byte-level tables and the Phabricator trail.

## What it established (measured on Commons, 2026-09)

**1. Thumbs moved to `thumb.wikimedia.org`** and are quantized **upward** to a pre-rendered ladder:

```
$wgThumbnailSteps = 20 40 60 120 250 330 500 960 1280 1920 3840      (T360589)
```

The old `upload.wikimedia.org` URLs still resolve, but the new host is what the API advertises, and non-standard
widths are the enforcement target (T402792). Assume the endpoints keep moving (T427465).

**2. The two ways to ask for a thumbnail are NOT equally safe.** This is the part that matters:

| how | result |
|---|---|
| `iiurlwidth=<anything>` | **Safe.** The API quantizes up to the next bucket and returns a legal `thumburl`. Asking 480 gets you the 500px file — about 4% of nothing. `thumbwidth` still reports the *requested* width, so never trust it as the served size. |
| hand-built `…/700px-<file>` | **HTTP 400.** A page thumbnail has no API endpoint — `documentSource.derivePageTemplate()` substitutes into a `{w}px-` template — so `{w}` **must be a width that exists**. |

Re-verified here on 2026-09-18 against `File:Mujeres en wikipedia.pdf`, page 1:

```
 330px 200    500px 200    960px 200   1280px 200        ← exist
 400px 400    700px 400   1000px 400   1400px 400        ← do not
```

**3. There is no WebP or AVIF** on this path (`Accept: image/webp` and `lossy-webp` variants still return JPEG), so
image-format negotiation is not a lever here.

**4. `srsort=random` is genuinely random per request** — unlike `cmsort=random`, which does not exist. For "show me a
random sample of a category", CirrusSearch (`incategory:` + `srsort=random`) is the sanctioned way, and it is cheaper
and less biased than fetching a pool and shuffling it client-side.

## What this project had wrong

The paged viewer's zoom ladder was `[400, 700, 1000, 1400]` — **off-ladder at every step** — so zooming a document
page thumbnail answered HTTP 400. The code even carried a note that `330/500/960` are served and `400/700/1000` are
not; the *default* ladder had never been reconciled with it, and two tests had pinned the broken steps as expected
values. `src/lib/thumbWidths.js` now owns the ladder (`THUMB_LADDER`, `legalThumbWidth`, `floorThumbWidth`) and every
step the viewer can offer is asserted to exist.

That is the whole reason to consult a sibling project: it had already paid for this knowledge in production, and the
same class of bug was sitting here unverified.

## What to adopt next (not yet done)

- **`srcset` with width descriptors + `sizes`**, built from the width **served** in the URL (parse `/500px-`, do not
  assume the requested one) and the API's `responsiveUrls` for the 2× candidate — never string surgery. `sizes` comes
  from the card's own column math. This is what took commons-vibe's first three tiles from 607 KB to 197 KB on a
  1× screen, by never fetching the 960px bucket for a 284px slot.
- **`decoding="async"`** alongside the `loading="lazy"` this project already uses, plus an `onerror` fallback so one
  missing thumbnail does not leave a hole.
- **`<link rel="preconnect">`** to the thumbnail host and `dns-prefetch` to `commons.wikimedia.org` in `index.html`.
- **Not** an `IntersectionObserver`: native `loading="lazy"` is what the sibling project uses for tiles too. Images
  outside a card's scroll area are the browser's job; the work above is about *which bytes* it fetches when they come
  into view, which is the part that actually cost users bandwidth.

## Re-running the measurement

```bash
# the bucket ladder and bytes actually served for any requested width
curl -s -A "$WIKIMEDIA_USER_AGENT" --get 'https://commons.wikimedia.org/w/api.php' \
  --data-urlencode 'action=query' --data-urlencode 'titles=File:<name>' \
  --data-urlencode 'prop=imageinfo' --data-urlencode 'iiprop=url|size' \
  --data-urlencode 'iiurlwidth=<W>' --data-urlencode 'format=json' --data-urlencode 'formatversion=2' \
  | jq -r '.query.pages[0].imageinfo[0].thumburl'
```

Pace requests at one per second or more, and use a descriptive User-Agent (see `AGENTS.md`).
