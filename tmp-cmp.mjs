import { chromium, devices } from 'playwright';

async function run(device, label) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...device });
  const p = await ctx.newPage();
  const responses = [];
  p.on('response', async (r) => {
    if (r.url().includes('action=parse')) {
      try { const t = await r.text(); responses.push({ url: r.url().slice(0, 150), status: r.status(), len: t.length, head: t.slice(0, 120) }); }
      catch { responses.push({ url: r.url().slice(0, 150), status: r.status(), len: -1 }); }
    }
  });
  await p.goto('http://localhost:5199/?config=/click-through-demo.json', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-widget-id="click-seas"]', { timeout: 30000 });
  await p.waitForTimeout(11000);
  const out = await p.evaluate(() => {
    const body = document.querySelector('[data-widget-id="click-seas"] .wikibox-body');
    return {
      html: body ? body.innerHTML.slice(0, 300) : null,
      len: body ? body.innerHTML.length : -1,
      classes: body ? Array.from(body.querySelectorAll('*')).slice(0, 8).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).slice(0, 40)) : [],
    };
  });
  console.log(`\n══ ${label} ══  innerHTML len: ${out.len}`);
  console.log('  responses:', JSON.stringify(responses, null, 1).slice(0, 700));
  console.log('  first elements:', JSON.stringify(out.classes));
  console.log('  html head:', JSON.stringify(out.html));
  await b.close();
}

await run({ viewport: { width: 1300, height: 900 } }, 'DESKTOP');
await run(devices['iPhone 14'], 'IPHONE 14');
