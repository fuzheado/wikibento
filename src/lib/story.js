/**
 * The "continuous scroll" story — a presentation of an article's image list, in the manner of the Met /
 * Google-Arts-&-Culture prototype (`~/Documents/ai/met-gac-prototype`). This module is the pure half: which PANEL an
 * image gets, and the order the panels fall in. The renderer is `StoryCard` in `src/widgets/WidgetFrame.jsx`.
 *
 * The technique being ported, exactly as the prototype had it (`index.html` → `layoutFor`): the layout is chosen by
 * the image's OWN shape and resolution, never by its position in the list —
 *
 *   ratio ≥ 1.55   →  full    full-bleed, bottom gradient caption (panoramas)
 *   ratio ≤ 0.8    →  plate   centred "gallery plate" (portraits letterbox badly as full-bleed)
 *   width < 1100   →  plate   shown at native size, so a small file is never upscaled soft
 *   otherwise      →  split   image + text side by side, text side alternating for rhythm
 *
 * Two deliberate carry-overs: the prototype's fallback for a file whose dimensions are unknown (1600×1000 → full),
 * and the fact that the split's alternation advances ONLY on split panels — a full-bleed panel between two split
 * panels does not flip the side.
 */

export const STORY_THRESHOLDS = { WIDE: 1.55, TALL: 0.8, SMALL: 1100 };

/** What the prototype assumed when a file's dimensions were missing. Kept, so a dimension-less item behaves here as
 *  it did there. (The gallery's story mode joins real `imageinfo` dimensions, so this is the fallback, not the norm.) */
export const STORY_FALLBACK_SIZE = { width: 1600, height: 1000 };

/** One panel: `full` (full-bleed), `plate` (centred at native size) or `split` (image + text). */
export function storyPanelFor(item) {
  const w = item?.width || STORY_FALLBACK_SIZE.width;
  const h = item?.height || STORY_FALLBACK_SIZE.height;
  const ratio = w / h;
  if (ratio >= STORY_THRESHOLDS.WIDE) return 'full';
  if (ratio <= STORY_THRESHOLDS.TALL || w < STORY_THRESHOLDS.SMALL) return 'plate';
  return 'split';
}

/**
 * The whole sequence, in document order. The alternating side is state, so resolving it once here keeps the renderer
 * trivial and makes "which way does the third split lean?" a thing a test can answer.
 *
 * `reverse` is the prototype's `reversed` class: true puts the TEXT on the right (image left) — and, as there, the
 * first split leans that way.
 */
export function storySequence(items = []) {
  let splitSide = 'right';
  return (items || []).map((item, i) => {
    const layout = storyPanelFor(item);
    const reverse = layout === 'split' && splitSide === 'right';
    if (layout === 'split') splitSide = splitSide === 'left' ? 'right' : 'left';
    return { ...item, layout, reverse, index: String(i + 1).padStart(2, '0') };
  });
}

/** How many panels of each kind — the one-line summary a board's subtitle can carry. */
export function storyPanelCounts(panels = []) {
  return (panels || []).reduce((acc, p) => ({ ...acc, [p.layout]: (acc[p.layout] || 0) + 1 }), {});
}
