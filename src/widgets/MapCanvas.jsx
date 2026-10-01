import { useState, useEffect, useRef, useCallback } from 'react';
import { relayMapUrl, osmUrl, placeSubtitle, OSM_ATTRIBUTION, MAP_HI_DPI, legalMapSize } from '../lib/mapImage';
import { mapFit, overlayForPlaces, visibleCount, fitPlaces, preserveAspectRatioFor } from '../lib/mapOverlay';
import { allowHiDpi } from '../lib/imageSrcset';
import { fromPoints, collectionVertices, describeCollection } from '../lib/geojson';
import { projectGeometry } from '../lib/mapOverlay';

/**
 * The map canvas both map-drawing widgets share (ISSUE-131/132): a static map image, our markers on top, and
 * OpenStreetMap's credit line.
 *
 * Deliberately **not** Leaflet: one image needs no tiles, no library and no policy of its own — and, the reason the
 * static card came first, it survives 🖨️ Print and ⛶ Export → PNG, where a tiled map rasterises badly.
 *
 * Three things the map service does not do, all verified by looking at what it returned: it draws no marker, it prints
 * no attribution, and it cannot be asked for a map of *several* places. So the markers are ours, the credit line is
 * card content (edge-to-edge does not hide a licence), and a set of points is framed by computing the centre and zoom
 * ourselves (`fitPlaces`) — which needs the box the image will be drawn into, so the framing happens **here**, not in
 * a transform that cannot know the card's size.
 *
 * The overlay is drawn in the **image's own pixel space**, with `preserveAspectRatio` mirroring the `<img>`'s
 * `object-fit` (`src/lib/mapOverlay.js` explains why that is the same thing): the browser does the scaling and
 * cropping, so there is no per-frame arithmetic and nothing to keep in sync by hand. `npm run check:map-landmarks`
 * verifies that the browser and our maths agree, on cards whose aspect is not the image's.
 *
 * The image is requested at the size the card actually is, times 2 on a retina screen — quantised to a ladder so a
 * resize does not ask the service for a new image per frame. Until the box is measured the default size is used: a map
 * at the wrong size is still the right map.
 */

/** A marker's size on screen, in CSS px. The radius is divided by the fit's scale before it is drawn, because the SVG
 *  lives in image pixels — so a dot is a dot whatever the card's shape, and whatever the retina multiplier. */
const MARKER_RADIUS_PX = 5;
const MARKER_STROKE_PX = 1.5;

export default function MapCanvas({
  centerLat, centerLon, zoom, label = '', points = [], geojson = null, frame = false,
  lang = '', fit = 'cover', showPin = true, note = '',
}) {
  const wrapRef = useRef(null);
  const [box, setBox] = useState(null);
  // A failing relay answers JSON, which a browser shows as a broken image: a blank card with no reason in it. So the
  // image's own error event asks the relay *why* and the card says it (ISSUE-131's second rough edge).
  const [failed, setFailed] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    // Quantised on purpose: a new size means a new URL, so an unquantised measurement would ask the map service for
    // an image on every frame of a resize. Landing on the ladder makes most measurements a no-op (no state change, no
    // new request), and the browser then reuses the one image it already has.
    const measure = () => {
      const dpr = allowHiDpi() ? MAP_HI_DPI : 1;
      const imgW = legalMapSize(el.clientWidth * dpr, 240);
      const imgH = legalMapSize(el.clientHeight * dpr, 180);
      const cssW = el.clientWidth;
      const cssH = el.clientHeight;
      setBox((prev) => (prev && prev.imgW === imgW && prev.imgH === imgH && prev.cssW === cssW && prev.cssH === cssH
        ? prev
        : { imgW, imgH, cssW, cssH }));
    };
    // The FIRST measurement is immediate — nothing is drawn before it. After that, wait for the size to stop
    // moving: on a phone the grid stacks and every image that arrives shifts the cards, and since a distinct ladder
    // size is a distinct request, a settling layout can ask for several images per card. Measured on the demos sweep
    // (2026-10-01): one board's map cards asked for 84 images in a minute, which tripped the relay's own rate limit.
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    let settle = null;
    const onResize = () => {
      if (settle) clearTimeout(settle);
      settle = setTimeout(measure, 180);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    return () => { if (settle) clearTimeout(settle); ro.disconnect(); };
  }, []);

  // One source of truth: a GeoJSON collection of the places, paths and areas this card shows. A plain list of places is
  // converted here, so a caller may pass either (`points` is the map widget's own list, `geojson` is everything else:
  // a pasted shape, a Wikidata geoshape, or another widget's emitted geometry).
  const collection = Array.isArray(geojson?.features) && geojson.features.length
    ? geojson
    : fromPoints(points, { mode: 'markers' });
  const list = collectionVertices(collection);
  const imageWidth = box?.imgW || 800;
  const imageHeight = box?.imgH || 500;
  // Framing needs the box, so it is decided here. `fitPlaces` returns `zoom: null` for a single point (one point has no
  // extent), and `?? zoom` then means "centre on it, keep the zoom you asked for".
  const fitted = frame && list.length ? fitPlaces(list, { imageWidth, imageHeight }) : null;   // every vertex, so a shape is framed whole
  const view = {
    centerLat: fitted ? fitted.centerLat : (Number.isFinite(centerLat) ? centerLat : list[0]?.lat),
    centerLon: fitted ? fitted.centerLon : (Number.isFinite(centerLon) ? centerLon : list[0]?.lon),
    zoom: fitted?.zoom ?? zoom,
    imageWidth,
    imageHeight,
    boxWidth: box?.cssW || imageWidth,
    boxHeight: box?.cssH || imageHeight,
    fit,
  };
  const hasView = Number.isFinite(view.centerLat) && Number.isFinite(view.centerLon);

  // Through our own relay, not the map service directly: the service refuses browser-shaped requests (see
  // relayMapUrl). Same numbers, same ladder, one image per card.
  const url = relayMapUrl({
    lat: view.centerLat,
    lon: view.centerLon,
    zoom: view.zoom,
    lang,
    width: view.imageWidth,
    height: view.imageHeight,
  });
  // A different place or a different box is a different request, so an old failure is not this image's story.
  useEffect(() => { setFailed(null); }, [url]);

  const urlRef = useRef(url);
  urlRef.current = url;
  // Which attempt has already been explained: a single failed <img> can fire its error event more than once, and a
  // retry must be allowed to ask again even if the previous explanation is still in flight.
  const explainedAttempt = useRef(-1);
  const explain = useCallback(async () => {
    if (explainedAttempt.current === attempt) return;
    explainedAttempt.current = attempt;
    let reason = 'the map image could not be loaded';
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const type = res.headers.get('content-type') || '';
      if (type.includes('json')) {
        const body = await res.json().catch(() => null);
        reason = body?.error || `the map relay answered HTTP ${res.status}`;
      } else if (res.status === 404 || type.includes('html')) {
        // A plain static host answers 404, or hands back the app's own index.html: there is no relay here at all.
        reason = 'this host has no map relay — the map needs /api/staticmap from the Toolforge server';
      } else if (res.ok && type.startsWith('image/')) {
        // The relay is answering now, so the image itself did not arrive (a blip, or the browser refused it). Say
        // that, rather than reporting "the relay answered 200" at a reader who can see there is no map.
        reason = 'the map image did not load, but the relay is answering — try again';
      } else {
        reason = `the map relay answered HTTP ${res.status}${type ? ` (${type})` : ''}`;
      }
    } catch {
      reason = 'the map relay could not be reached';
    }
    // The place may have changed while the relay was being asked.
    if (urlRef.current === url) setFailed(reason);
  }, [url, attempt]);

  const retry = useCallback(() => {
    setFailed(null);
    setAttempt((n) => n + 1);
  }, []);

  // Markers (Point features) and shapes (lines and areas), both in the image's own pixel space.
  const markerPlaces = collection.features
    .filter((f) => f.geometry?.type === 'Point' || f.geometry?.type === 'MultiPoint')
    .flatMap((f) => {
      const props = f.properties || {};
      const at = f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates;
      return at.map((position, i) => ({
        lat: Number(position?.[1]), lon: Number(position?.[0]),
        label: String(props.label ?? '') || `Point ${i + 1}`,
        wikidata: props.wikidata,
      }));
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  const shapes = box ? projectGeometry(collection, view) : [];

  // Markers, and the two honest counts: how many points there are, and how many the card is actually showing (a crop
  // can take a point away, and silence there would read as a lost point).
  const placed = markerPlaces.length && box ? overlayForPlaces(markerPlaces, view) : [];
  const shown = visibleCount(placed);
  const markerFit = mapFit(view);
  const markerRadius = markerFit.scale > 0 ? MARKER_RADIUS_PX / markerFit.scale : 0;
  const markerStroke = markerFit.scale > 0 ? MARKER_STROKE_PX / markerFit.scale : 0;

  const where = label || (list.length ? `${list.length} place${list.length === 1 ? '' : 's'}` : placeSubtitle('', view.centerLat, view.centerLon));
  const chips = [];
  if (shapes.length) {
    // A shape note says what was drawn and how big it is (the collection's summary: shapes, vertices, any time range),
    // and counts the *shapes* the crop takes away — never the vertices, which are not things a reader counts.
    const summary = describeCollection(collection);
    if (summary) chips.push(summary);
    const offscreen = shapes.filter((s) => !s.visible).length;
    if (offscreen) chips.push(`${offscreen} shape${offscreen === 1 ? '' : 's'} outside this view`);
  } else if (markerPlaces.length) {
    chips.push(`${markerPlaces.length} point${markerPlaces.length === 1 ? '' : 's'}`);
    if (markerPlaces.length > shown) chips.push(`${markerPlaces.length - shown} outside this view`);
  }
  if (note) chips.push(note);

  if (!hasView) {
    return (
      <div className="map-card" ref={wrapRef}>
        <div className="map-error"><span className="map-error-text">⚠ Nothing to draw — give the card a place, a point, or a geometry</span></div>
        {/* The note still shows: it is where a refused paste or an unusable source says why. */}
        {chips.length ? <span className="map-points-note">{chips.join(' · ')}</span> : null}
      </div>
    );
  }

  return (
    <div className={`map-card${fit === 'contain' ? ' is-contain' : ''}`} ref={wrapRef}>
      {failed ? (
        <div className="map-error">
          <span className="map-error-text">⚠ {failed}</span>
          <button className="widget-btn" onClick={retry}>Try again</button>
          <a className="widget-btn" href={osmUrl(view.centerLat, view.centerLon, view.zoom)} target="_blank" rel="noopener noreferrer">
            Open this place on OpenStreetMap ↗
          </a>
        </div>
      ) : (
      <a
        className="map-link"
        href={osmUrl(view.centerLat, view.centerLon, view.zoom)}
        target="_blank"
        rel="noopener noreferrer"
        title={`${where} — open on OpenStreetMap`}
      >
        {/* Nothing is requested until the box has been measured. The gallery already does this for its tiles, and the
            reason is the same one that made the size ladder necessary: asking at a default size first and then again at
            the real size costs the map service a second image per card, which its terms ask us to avoid. */}
        {box ? (
        <img
          key={attempt}
          className="map-img"
          src={url}
          alt={`Map of ${where}`}
          onError={explain}
          /* The map service answers 403 to a request whose Referer is localhost (measured 2026-09-29), which
             the browser then refuses as a cross-origin image — so a map was blank on any local dev server while
             working in production. Sending no referrer at all is allowed by the service (also measured) and makes
             the card behave the same in both places. */
          referrerPolicy="no-referrer"
          decoding="async"
        />
        ) : (
          <div className="map-img map-skeleton" aria-hidden="true" />
        )}
        {/* The points, in the image's own pixel space — the SVG's preserveAspectRatio is the <img>'s object-fit, so the
            browser scales and crops both identically. The svg takes no pointer events: the map is a link to
            OpenStreetMap, and a dot must not swallow the click. */}
        {placed.length || shapes.length ? (
          <svg
            className="map-overlay"
            viewBox={`0 0 ${view.imageWidth} ${view.imageHeight}`}
            preserveAspectRatio={preserveAspectRatioFor(fit)}
            aria-hidden="true"
          >
            {shapes.map((shape, i) => (
              <path
                key={`shape-${i}`}
                className={`map-shape map-${shape.role}`}
                fillRule={shape.role === 'area' ? 'evenodd' : undefined}
                d={shape.groups.map((lines) => lines.map((line) => (
                  `M${line[0].x.toFixed(1)} ${line[0].y.toFixed(1)}`
                  + line.slice(1).map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('')
                  + (shape.role === 'area' ? 'Z' : '')
                )).join(' ')).join(' ')}
                strokeWidth={markerStroke}
              >
                {shape.label ? <title>{shape.label}</title> : null}
              </path>
            ))}
            {placed.filter((p) => p.card.visible).map((p, i) => (
              <circle
                key={`${p.label || ''}-${i}`}
                className="map-point"
                cx={p.image.x}
                cy={p.image.y}
                r={markerRadius}
                strokeWidth={markerStroke}
              >
                <title>{p.label || `${Number(p.lat).toFixed(4)}, ${Number(p.lon).toFixed(4)}`}</title>
              </circle>
            ))}
          </svg>
        ) : null}
        {/* The centre pin marks the *place* the card is about. Framing a set of points computes a centre nobody chose,
            so the pin is not shown for it — a pin there would be pointing at the middle of a bounding box. */}
        {showPin && !fitted ? <span className="map-pin" aria-hidden="true" /> : null}
      </a>
      )}
      {failed ? null : (
        <>
          {chips.length ? <span className="map-points-note">{chips.join(' · ')}</span> : null}
          <span className="map-credit">
            <a href={OSM_ATTRIBUTION.href} target="_blank" rel="noopener noreferrer">{OSM_ATTRIBUTION.text}</a>
          </span>
        </>
      )}
    </div>
  );
}
