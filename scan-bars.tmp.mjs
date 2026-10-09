import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const b64 = readFileSync('cache/aircraft/view.jpg').toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
const out = await page.evaluate(async (dataUrl) => {
  const img = new Image(); img.src = dataUrl; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  const isBlue = (i) => { const r = data[i], g = data[i + 1], b = data[i + 2]; return b - r > 18 && b > 185 && r < 238 && g < 248; };
  // per row: the blue extent (holes from labels and silhouettes do not matter) and how blue the row is
  const rows = [];
  for (let y = 0; y < height; y++) {
    let minX = width, maxX = -1, n = 0;
    for (let x = 0; x < width; x++) if (isBlue((y * width + x) * 4)) { if (x < minX) minX = x; if (x > maxX) maxX = x; n++; }
    rows.push({ y, minX, maxX, n });
  }
  // group rows into bars: contiguous blue rows whose extent barely changes
  const bars = []; let cur = null;
  for (const r of rows) {
    const blue = r.n > 40;
    if (!blue) { if (cur && cur.y1 - cur.y0 >= 8) bars.push(cur); cur = null; continue; }
    if (cur && Math.abs(r.minX - cur.x0) < 14 && Math.abs(r.maxX - cur.x1) < 14) { cur.y1 = r.y; cur.n = Math.max(cur.n, r.n); }
    else { if (cur && cur.y1 - cur.y0 >= 8) bars.push(cur); cur = { y0: r.y, y1: r.y, x0: r.minX, x1: r.maxX, n: r.n }; }
  }
  if (cur && cur.y1 - cur.y0 >= 8) bars.push(cur);
  return { bars: bars.filter((b) => b.x1 - b.x0 > 100), w: width, h: height };
}, `data:image/jpeg;base64,${b64}`);
console.log(`  ${out.bars.length} bars (image ${out.w}×${out.h}), top to bottom:`);
for (const b of out.bars) {
  const pct = (v, t) => (v / t * 100).toFixed(2);
  console.log(`    y ${String(b.y0).padStart(3)}–${String(b.y1).padEnd(3)} x ${String(b.x0).padStart(3)}–${String(b.x1).padEnd(3)} → ${pct(b.x0, out.w)},${pct(b.y0, out.h)},${pct(b.x1 - b.x0, out.w)},${pct(b.y1 - b.y0, out.h)}`);
}
await browser.close();
