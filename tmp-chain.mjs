import { chromium, devices } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 14'] });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('  pageerror:', String(e).slice(0, 120)));
await p.goto('http://localhost:5199/?config=/click-through-demo.json', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('[data-widget-id="click-seas"]', { timeout: 30000 });
await p.waitForTimeout(10000);
const chain = await p.evaluate(() => {
  let el = document.querySelector('[data-widget-id="click-seas"]');
  const rows = [];
  const walk = (node, depth) => {
    if (!node || depth > 6) return;
    const cs = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    rows.push({
      tag: node.tagName.toLowerCase() + (node.className ? '.' + String(node.className).split(' ').slice(0, 2).join('.') : ''),
      h: Math.round(r.height),
      w: Math.round(r.width),
      flex: cs.flex,
      minH: cs.minHeight,
      height: cs.height,
      display: cs.display,
      overflow: cs.overflow,
      inline: node.getAttribute('style') || '',
      kids: node.children.length,
    });
    for (const c of node.children) walk(c, depth + 1);
  };
  walk(el, 0);
  return rows;
});
for (const r of chain) console.log('  ' + JSON.stringify(r));
await b.close();
