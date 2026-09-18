import { webkit, chromium, devices } from 'playwright';
const URL = process.env.PROBE_URL || 'http://localhost:5199/?config=/click-through-demo.json';

async function run(engine, name, device) {
  const b = await engine.launch();
  const ctx = await b.newContext({ ...device });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-widget-id]', { timeout: 30000 });
  await p.waitForTimeout(14000);
  const out = await p.evaluate(() => {
    const stack = document.querySelector('.mobile-stack');
    const card = document.querySelector('[data-widget-id="click-seas"]');
    const wrap = card && card.closest('.widget-item, .mobile-widget, [class*="widget"]');
    const body = card && card.querySelector('.wikibox-body');
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
    return {
      mobileStack: !!stack,
      innerWidth: window.innerWidth,
      cards: Array.from(document.querySelectorAll('[data-widget-id]')).map((e) => e.getAttribute('data-widget-id')),
      seasCard: r(card), seasBody: r(body),
      bodyChildren: body ? body.children.length : -1,
      bodyTextLen: body ? (body.innerText || '').length : -1,
      bodyOverflow: body ? getComputedStyle(body).overflow : null,
      cardOverflow: card ? getComputedStyle(card).overflow : null,
      // is the content there but clipped?
      bodyScrollH: body ? body.scrollHeight : -1,
      bodyClientH: body ? body.clientHeight : -1,
      firstLinkText: body ? (body.querySelector('a') || {}).innerText : null,
      links: body ? body.querySelectorAll('a').length : -1,
    };
  });
  console.log(`\n══ ${name} ══`);
  console.log(JSON.stringify(out, null, 1));
  console.log('  errors:', JSON.stringify(errs.slice(0, 3)));
  await p.screenshot({ path: `/tmp/ios-${name.replace(/[^a-z]/gi, '')}.png`, fullPage: false });
  await b.close();
}

const iphone = devices['iPhone 14'];
await run(webkit, 'webkit-iphone14', iphone);
await run(chromium, 'chromium-iphone14', iphone);
