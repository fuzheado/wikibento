/**
 * Saving a widget as an image — SVG and PNG (ISSUE-77).
 *
 * The trick that makes this dependency-free: a widget is already a browser-rendered DOM tree, so we
 * clone it, **inline every computed style**, and hand it to an SVG `<foreignObject>`. Chromium and
 * WebKit render that with the real CSS engine, which is why `color-mix()`, custom properties and
 * `position: sticky` survive — the things a DOM-to-canvas library re-implements and gets subtly wrong.
 * The same document is then either saved as an .svg (vector, editable) or drawn into a canvas for a
 * .png (2× for retina).
 *
 * What it CANNOT do, stated plainly rather than papered over:
 *
 *   - **iframes** — an embedded page is another document; nothing serializes it. Widgets that embed one
 *     (Wiki Page, 360° panorama, video) offer PDF instead, which prints the frame's box at least.
 *   - **cross-origin images that refuse CORS** — the canvas becomes tainted and `toBlob` throws. We
 *     fetch and inline images as data URIs first, which works for Wikimedia hosts (they send
 *     `access-control-allow-origin: *`) and fails loudly otherwise (see `blocked`).
 *
 * The honest alternative for a pixel-perfect capture of any widget is a server-side render (the
 * Playwright that records the tutorial videos) — a service to run, not a button to add. See
 * docs/EXPORT.md.
 */

/** Never serialized: editing chrome, transient panels, and anything a caller marks. */
const SKIP_SELECTOR = [
  '.widget-actions',
  '.widget-menu',
  '.widget-config',
  '.widget-info',
  '.react-resizable-handle',
  '[data-export-skip]',
].join(',');

/**
 * The computed properties worth copying. Copying all ~340 per element produces multi-megabyte files
 * for no visible gain; this list is layout, type, colour and paint — what actually shows on screen.
 */
const STYLE_PROPS = [
  'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float', 'clear',
  'display', 'visibility', 'opacity', 'overflow', 'overflow-x', 'overflow-y',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'box-sizing', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-radius', 'border-collapse', 'box-shadow',
  'background', 'background-color', 'background-image', 'background-size', 'background-position',
  'background-repeat', 'background-clip',
  'color', 'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant-numeric',
  'line-height', 'letter-spacing', 'text-align', 'text-decoration', 'text-transform', 'text-overflow',
  'text-shadow', 'white-space', 'overflow-wrap', 'word-break', 'word-spacing', 'text-indent',
  'vertical-align', 'direction', 'unicode-bidi',
  'list-style', 'list-style-type', 'list-style-position',
  'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'align-items', 'align-self', 'align-content', 'justify-content', 'justify-items', 'justify-self',
  'order', 'gap', 'row-gap', 'column-gap',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'grid-auto-flow',
  'transform', 'transform-origin',
  '-webkit-line-clamp', '-webkit-box-orient', 'object-fit', 'object-position', 'aspect-ratio',
];

/** Assemble the SVG document. Pure, so it can be tested without a browser. */
export function buildSvgDocument({ inner, width, height, background }) {
  const bg = background && background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent'
    ? `<rect width="${width}" height="${height}" fill="${background}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + bg
    + `<foreignObject x="0" y="0" width="${width}" height="${height}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml">${inner}</div>`
    + '</foreignObject></svg>';
}

/** Copy computed styles down a cloned tree, in lockstep with the live one. */
function inlineStyles(live, clone) {
  if (live.nodeType === 1 && clone.nodeType === 1) {
    const computed = getComputedStyle(live);
    let css = '';
    for (const prop of STYLE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value && value !== 'normal' && value !== 'none' && value !== 'auto' && value !== '0px') {
        css += `${prop}:${value};`;
      }
    }
    clone.setAttribute('style', css);
    // a cloned <canvas> is blank without this
    if (live.tagName === 'CANVAS' && typeof live.toDataURL === 'function') {
      const img = clone.ownerDocument.createElement('img');
      try { img.setAttribute('src', live.toDataURL('image/png')); } catch { /* tainted canvas */ }
      clone.replaceWith(img);
    }
  }
  const liveKids = [...live.childNodes];
  const cloneKids = [...clone.childNodes];
  for (let i = 0; i < liveKids.length && i < cloneKids.length; i += 1) {
    inlineStyles(liveKids[i], cloneKids[i]);
  }
}

const toDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

/**
 * What can this widget honestly offer? Called when the menu opens, on the live node.
 *
 * The PNG answer is narrower than it looks, and the reason is measured rather than assumed. Chromium
 * **taints a canvas for ANY SVG containing a `<foreignObject>`** — verified 2026-09-14 with a matrix of
 * five documents, including one holding nothing but `<p>hello</p>`: `toBlob` throws
 * `SecurityError: Tainted canvas`. Plain SVG rasterises fine. So:
 *
 *   - a widget that draws itself in SVG (charts, QR) can be rasterised exactly, by rendering *its* SVG;
 *   - a widget built from HTML/CSS (timeline, tables, galleries) can be exported as an .svg — the file is
 *     valid and opens in a browser — but NOT as a .png, because the only client-side way there is a
 *     foreignObject wrapper, which the browser refuses to hand back.
 *
 * Pixel-perfect PNG of an HTML widget therefore needs either a DOM-to-canvas library (a new dependency
 * for a 6-package project) or a server-side render (the Playwright that records the tutorial videos).
 * That is a decision to make deliberately, not to smuggle in — see docs/EXPORT.md.
 */
export function imageCapabilities(node) {
  const no = (reason) => ({ png: { ok: false, reason }, svg: { ok: false, reason } });
  if (!node) return no('Nothing to capture');
  if (node.querySelector('iframe')) {
    return no('This widget embeds another page (an iframe) — nothing can serialise it. Use PDF, which prints the frame’s box.');
  }
  const svg = node.querySelector('svg');
  return {
    svg: { ok: true, reason: 'Vector file (opens in a browser; images inlined)' },
    png: svg
      ? { ok: true, reason: 'Image at 2× — this widget draws itself as SVG' }
      : { ok: false, reason: 'This widget is HTML/CSS: a PNG needs a browser screenshot (see docs/EXPORT.md). SVG and PDF work.' },
  };
}

/**
 * Rasterise the widget's own SVG (not a foreignObject wrapper — see imageCapabilities).
 * Styles are inlined the same way, so CSS classes applied to SVG children survive the trip.
 */
export async function svgElementToPngBlob(svgEl, scale = 2) {
  const rect = svgEl.getBoundingClientRect();
  const width = Math.max(Math.ceil(rect.width) || 0, 1);
  const height = Math.max(Math.ceil(rect.height) || 0, 1);
  const clone = svgEl.cloneNode(true);
  inlineStyles(svgEl, clone);
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const markup = new XMLSerializer().serializeToString(clone);
  return svgToPngBlob(markup, width, height, scale);
}

/**
 * The widget as an SVG string. Images are fetched and inlined; an image that refuses CORS is left as a
 * URL (the SVG still works, the PNG will refuse — see below).
 */
export async function nodeToSvg(node) {
  const rect = node.getBoundingClientRect();
  const width = Math.max(Math.ceil(rect.width), 1);
  const height = Math.max(Math.ceil(rect.height), 1);
  const clone = node.cloneNode(true);
  for (const el of clone.querySelectorAll(SKIP_SELECTOR)) el.remove();
  inlineStyles(node, clone);

  const liveImages = [...node.querySelectorAll('img')];
  const cloneImages = [...clone.querySelectorAll('img')];
  let externalImages = 0;
  await Promise.all(cloneImages.map(async (img, i) => {
    const src = liveImages[i]?.currentSrc || liveImages[i]?.src || img.getAttribute('src') || '';
    if (!src || src.startsWith('data:')) return;
    try {
      const res = await fetch(src, { mode: 'cors' });
      if (!res.ok) throw new Error(String(res.status));
      img.setAttribute('src', await toDataUrl(await res.blob()));
    } catch {
      externalImages += 1;   // left pointing at the network: fine for .svg, fatal for .png
    }
  }));

  const background = getComputedStyle(node).backgroundColor;
  const inner = new XMLSerializer().serializeToString(clone);
  return { svg: buildSvgDocument({ inner, width, height, background }), width, height, externalImages };
}

/** Rasterise an SVG document at `scale`× (2 for a retina-ish PNG). */
export async function svgToPngBlob(svg, width, height, scale = 2) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    // A tainted canvas throws HERE (or at toBlob) rather than silently exporting blank.
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas produced no image'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Save a blob to disk — the same three lines the QR widget has used since ISSUE-65. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
