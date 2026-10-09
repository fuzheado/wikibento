import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { widgetTitle } from '../src/lib/widgetTitle.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';

/**
 * What a title bar reads, in priority order.
 *
 * This exists because the order was a ternary in `WidgetFrame.jsx`, and one widget needed a clause the others did
 * not: the Map is given `Q64` and only the fetch knows that means "Berlin", so a header that showed the config label
 * forever showed the query back at the reader (ISSUE-131's first rough edge). `labelFromData` is that clause, and it
 * is opt-in — a widget that sets `data.title` for its own content must not silently rename its header.
 */

const MAP_LIKE = {
  name: 'Map',
  labelFromConfig: (c) => String(c.place || '').trim() || null,
  labelFromData: (d) => String(d?.title || '').trim() || null,
};

test('the reader’s own rename wins over the resolved name', () => {
  assert.equal(
    widgetTitle({ def: MAP_LIKE, config: { _title: 'The city', place: 'Q64' }, data: { title: 'Berlin' } }),
    'The city',
  );
  // `_title` equal to the widget's generic name is not a rename — it is the legacy auto-set value, and the label
  // still shows through it (the frame has always treated it that way; this pins it).
  assert.equal(
    widgetTitle({ def: MAP_LIKE, config: { _title: 'Map', place: 'Q64' }, data: { title: 'Berlin' } }),
    'Berlin',
  );
});

test('data resolves what the config could only hint at', () => {
  assert.equal(widgetTitle({ def: MAP_LIKE, config: { place: 'Q64' }, data: { title: 'Berlin' } }), 'Berlin');
  assert.equal(widgetTitle({ def: MAP_LIKE, config: { place: 'Q64' }, data: null }), 'Q64', 'while loading, the query is what we have');
  assert.equal(widgetTitle({ def: MAP_LIKE, config: { place: 'Q64' }, data: {} }), 'Q64', 'data without a title does not blank the header');
  assert.equal(widgetTitle({ def: MAP_LIKE, config: { place: 'Q64' }, data: { title: '   ' } }), 'Q64');
});

test('a widget that declares no labelFromData keeps its old behaviour', () => {
  const def = { name: 'Pageviews', labelFromConfig: (c) => c.article?.replace(/_/g, ' ') || null };
  assert.equal(
    widgetTitle({ def, config: { article: 'Marie_Curie' }, data: { title: 'Something else entirely' } }),
    'Marie Curie',
    'data.title belongs to the card’s content; it is not a header rename unless the widget says so',
  );
});

test('with nothing to say, the generic name answers (and last, the type id)', () => {
  assert.equal(widgetTitle({ def: { name: 'Map' }, config: {}, data: null }), 'Map');
  assert.equal(widgetTitle({ def: null, config: {}, data: null, fallback: 'map' }), 'map');
  assert.equal(widgetTitle({}), 'widget');
});

test('every labelFromData in the registry survives the loading state', () => {
  // The header calls this on every render, including the first — when `state.data` is null. A widget that assumes
  // an object would throw on mount, which is the shape of bug a test can catch cheaply.
  for (const def of Object.values(WIDGET_TYPES)) {
    if (typeof def.labelFromData !== 'function') continue;
    assert.doesNotThrow(() => def.labelFromData(null), def.id);
    assert.doesNotThrow(() => def.labelFromData({}), def.id);
    const value = def.labelFromData(null);
    assert.ok(value === null || value === undefined || typeof value === 'string', `${def.id} → ${typeof value}`);
  }
});

test('the frame actually asks widgetTitle (the wire, not just the function)', () => {
  // The helper can be perfect and unused. The frame is the one caller, and this is the cheap assertion that the
  // resolved place name reaches the title bar (`npm run smoke:map` checks it in a browser as well).
  const frame = readFileSync('src/widgets/WidgetFrame.jsx', 'utf8');
  assert.match(frame, /import \{ widgetTitle \} from '\.\.\/lib\/widgetTitle';/);
  assert.match(frame, /const headerTitle = widgetTitle\(\{/);
});

test('a title that is still a reference token falls through to the widget\'s name (ISSUE-138)', () => {
  // A consumer card wired to a producer names itself from the value it is given — and until that value arrives the
  // config holds the *token*, which is a promise of a name rather than one. Printing it at the reader was the state
  // the zones demo shipped with: the Article Excerpt beside a clickable picture was titled
  // `{{widget:zones-image#selection}}` while it waited.
  const def = WIDGET_TYPES.excerpt;
  assert.equal(widgetTitle({ def, config: { article: 'en:Marie Curie' }, data: null }), 'en:Marie Curie');
  assert.equal(widgetTitle({ def, config: { article: '{{widget:zones-image#selection}}' }, data: null }),
    def.name, 'the token is not a name — the widget\'s own name is');
  // …and once the producer emits, the value is the title again, which is the whole point of the fallback.
  assert.equal(widgetTitle({ def, config: { article: '{{widget:x#selection}}' }, data: { title: 'Piz Nuna' } }),
    def.name, 'a fetched article still titles itself from its own data first');
  // An explicit rename still wins over everything, token or not.
  assert.equal(widgetTitle({ def, config: { _title: 'The peak you clicked', article: '{{widget:x}}' } }), 'The peak you clicked');
});
