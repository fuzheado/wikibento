import { webkit, chromium } from 'playwright';

const URL = 'https://wikibento.toolforge.org/?config=/click-through-demo.json';

async function dump(engine, name) {
  const b = await engine.launch();
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = []; const logs = []; const failed = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 150)); });
  p.on('requestfailed', (r) => failed.push(r.url().slice(0, 120) + ' :: ' + (r.failure()?.errorText || '')));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-widget-id]', { timeout: 30000 });
  await p.waitForTimeout(14000);
  const out = await p.evaluate(() => {
    const card = document.querySelector('[data-widget-id="click-seas"]');
    const out = { cards: [] };
    for (const el of document.querySelectorAll('[data-widget-id]')) {
      out.cards.push({
        id: el.getAttribute('data-widget-id'),
        text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 90),
        links: el.querySelectorAll('a').length,
      });
    }
    if (card) {
      const body = card.querySelector('.wikibox-body');
      out.seas = {
        bodyExists: !!body,
        bodyChildren: body ? body.children.length : -1,
        bodyHtmlLen: body ? body.innerHTML.length : -1,
        bodyTextLen: body ? (body.innerText || '').length : -1,
        styleTags: card.querySelectorAll('style').length,
        cls: card.className,
        bodyCls: body ? body.className : null,
        computedDisplay: body ? getComputedStyle(body).display : null,
        computedHeight: body ? getComputedStyle(body).height : null,
      };
    }
    return out;
  });
  console.log(`\n══ ${name} ══`);
  console.log(JSON.stringify(out, null, 1));
  console.log('  errors:', JSON.stringify(errs.slice(0, 4)));
  console.log('  failed requests:', JSON.stringify(failed.slice(0, 4)));
  console.log('  console:', JSON.stringify(logs.slice(0, 4)));
  await b.close();
}

await dump(chromium, 'CHROMIUM');
await dump(webkit, 'WEBKIT (Safari engine)');
