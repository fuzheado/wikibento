/**
 * The overlay's geometry: where a place lands on a map card (ISSUE-132, first slice).
 *
 * The card is **one static image**, and the image is asked for at a *laddered* size (`MAP_SIZE_LADDER`), which quantises
 * its two dimensions independently — so a 486×296 box asks for 640×320 and the image's aspect ratio is usually **not**
 * the card's. CSS then decides how the image meets the box: `object-fit: cover` (fill and crop, the default) or
 * `contain` (the whole image, letterboxed).
 *
 * The trick that makes an overlay cheap is that an `<svg>` says the same thing: `preserveAspectRatio="xMidYMid slice"`
 * *is* `object-fit: cover`, and `"xMidYMid meet"` *is* `contain`. So markers can be drawn in the image's own pixel
 * space, and the browser does the scaling and cropping — no per-frame maths, and nothing to keep in sync by hand.
 *
 * What is left is everything the browser does *not* do for us: hit-testing a click, placing a label in the card's own
 * coordinates, and telling a reader that some of their points are cropped away. That is what this module computes — the
 * same transform the browser applies, which `npm run check:map-landmarks` verifies against real rendered cards rather
 * than against itself (its card phase renders each landmark on cards of a deliberately different aspect and checks both
 * where the ink lands and what the map shows underneath it).
 */

import { mercatorPixel } from './mapImage.js';

/** `object-fit` and `preserveAspectRatio` are the same two behaviours under different names. */
export const OVERLAY_PRESERVE_ASPECT_RATIO = {
  cover: 'xMidYMid slice',    // fills the box; the overflow is cropped away (the default)
  contain: 'xMidYMid meet',   // the whole image fits; the box keeps the margins
};

export function preserveAspectRatioFor(fit) {
  return OVERLAY_PRESERVE_ASPECT_RATIO[fit === 'contain' ? 'contain' : 'cover'];
}

/**
 * How an image of `imageWidth`×`imageHeight` meets a `boxWidth`×`boxHeight` card.
 *
 * `offsetX`/`offsetY` are where the image's top-left corner lands: **negative when the image is cropped** (cover) and
 * **positive when it is letterboxed** (contain). A card that has not been measured yet — the frame's first render,
 * before `ResizeObserver` has reported anything — has no scale and shows nothing, and every point is invisible.
 */
export function mapFit({ imageWidth, imageHeight, boxWidth, boxHeight, fit = 'cover' } = {}) {
  const mode = fit === 'contain' ? 'contain' : 'cover';
  const iw = Number(imageWidth);
  const ih = Number(imageHeight);
  const bw = Number(boxWidth);
  const bh = Number(boxHeight);
  const base = { mode, boxWidth: bw, boxHeight: bh, preserveAspectRatio: OVERLAY_PRESERVE_ASPECT_RATIO[mode] };
  if (![iw, ih, bw, bh].every((n) => Number.isFinite(n) && n > 0)) {
    return { ...base, scale: 0, drawWidth: 0, drawHeight: 0, offsetX: 0, offsetY: 0 };
  }
  const scale = mode === 'contain' ? Math.min(bw / iw, bh / ih) : Math.max(bw / iw, bh / ih);
  const drawWidth = iw * scale;
  const drawHeight = ih * scale;
  return { ...base, scale, drawWidth, drawHeight, offsetX: (bw - drawWidth) / 2, offsetY: (bh - drawHeight) / 2 };
}

/**
 * Where one point of the *image* lands in the card, and whether the card actually shows it — the crop can take a point
 * away entirely, which is a fact the card may want to tell the reader ("3 of 12 points are outside this view").
 */
export function imagePixelInCard({ x, y } = {}, fit = {}) {
  const cx = (Number(fit.offsetX) || 0) + Number(x) * (Number(fit.scale) || 0);
  const cy = (Number(fit.offsetY) || 0) + Number(y) * (Number(fit.scale) || 0);
  const visible = fit.scale > 0
    && Number.isFinite(cx) && Number.isFinite(cy)
    && cx >= 0 && cy >= 0 && cx <= fit.boxWidth && cy <= fit.boxHeight;
  return { x: cx, y: cy, visible };
}

/**
 * A list of places → the image pixel each occupies and the card coordinates that becomes.
 *
 * `view` is the card's own description of the map: the centre it was drawn at (`centerLat`/`centerLon`), its `zoom`, the
 * *requested* image size (the laddered `w`×`h`, not the card's), the card's measured `boxWidth`/`boxHeight`, and its
 * `fit`. A place may carry any other fields — they are passed through untouched, so a caller can keep its own id, label
 * or row with the geometry.
 */
export function overlayForPlaces(places, view = {}) {
  const fit = mapFit(view);
  return (Array.isArray(places) ? places : []).map((place) => {
    const at = mercatorPixel({
      lat: place?.lat,
      lon: place?.lon,
      centerLat: view.centerLat,
      centerLon: view.centerLon,
      zoom: view.zoom,
      width: view.imageWidth,
      height: view.imageHeight,
    });
    const card = imagePixelInCard(at, fit);
    return {
      ...place,
      image: { x: at.x, y: at.y, inside: at.inside },
      card: { x: card.x, y: card.y, visible: card.visible && at.inside },
    };
  });
}

/** How many of `overlayForPlaces`' points the card actually shows — for an honest "N are outside this view". */
export function visibleCount(points) {
  return (Array.isArray(points) ? points : []).filter((p) => p?.card?.visible).length;
}

/**
 * Frame a set of places in a window: the centre and the zoom that fit them all, with a margin. Returns `null` when
 * there is nothing to frame, and `zoom: null` for a single point — one point has no extent, so the caller's own zoom
 * is the honest answer rather than a made-up one.
 *
 * This is the same maths as the projection, in the other direction: work in normalised Web Mercator (x = longitude
 * across the world, y = the Mercator ordinate), ask how many world pixels the set spans at zoom `z`, and take the
 * largest `z` that still fits. The zoom is deliberately the *floor* — `zoom + 1` would push at least one point outside
 * the window, which is what "fits" has to mean.
 *
 * Longitude takes the **smallest arc** containing every point (the largest gap between consecutive longitudes is the
 * one to leave out), so a set spread across the date line is centred on the date line rather than halfway around the
 * world from itself — the difference between a Fiji/Samoa map and an empty one.
 */
export function fitPlaces(places, { imageWidth, imageHeight, padding = 0.12, minZoom = 1, maxZoom = 17 } = {}) {
  const pts = (Array.isArray(places) ? places : [])
    .filter((p) => Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lon)))
    .map((p) => ({ lat: Number(p.lat), lon: Number(p.lon) }));
  if (!pts.length) return null;

  const xOf = (lon) => (lon + 180) / 360;                                        // → [0, 1)
  const yOf = (lat) => (1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2;
  const lonOf = (x) => (((x * 360 - 180) + 540) % 360) - 180;
  const latOf = (y) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

  if (pts.length === 1) {
    return { centerLat: pts[0].lat, centerLon: pts[0].lon, zoom: null, single: true, spanLon: 0, spanLat: 0 };
  }

  const xs = pts.map((p) => xOf(p.lon)).sort((a, b) => a - b);
  let gap = -1;
  let gapAt = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const next = i + 1 < xs.length ? xs[i + 1] : xs[0] + 1;
    const d = next - xs[i];
    if (d > gap) { gap = d; gapAt = i; }
  }
  const spanX = 1 - gap;
  const centerX = xs[(gapAt + 1) % xs.length] + spanX / 2;

  const ys = pts.map((p) => yOf(p.lat));
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanY = maxY - minY;

  const availW = (Number(imageWidth) || 0) * (1 - padding);
  const availH = (Number(imageHeight) || 0) * (1 - padding);
  const zoomFor = (available, span) => (span > 0 && available > 0 ? Math.log2(available / (256 * span)) : Infinity);
  const zoom = Math.max(minZoom, Math.min(maxZoom, Math.floor(Math.min(zoomFor(availW, spanX), zoomFor(availH, spanY)))));

  return {
    centerLat: latOf((minY + maxY) / 2),
    centerLon: lonOf(centerX),
    zoom,
    single: false,
    spanLon: spanX * 360,
    spanLat: spanY,
  };
}
