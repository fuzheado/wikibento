import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportRows, toCsv, csvField, csvFilename } from '../src/lib/exportData.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Saving a widget's data (ISSUE-77).
 *
 * The point of exporting DATA rather than a picture is that a reader can reuse it, so the tests care
 * about three things: every shape a widget actually produces maps to rows, the CSV is spec-correct
 * (a comma or a quote inside a value must not break the file), and nothing is invented — a value the
 * widget does not hold stays empty rather than becoming a dash.
 */

test('a 2-D table passes through with its columns', () => {
  const d = { columns: ['institution', 'count'], rows: [['Met', 12], ['Rijks', 9]] };
  assert.deepEqual(exportRows(d), { columns: ['institution', 'count'], rows: [['Met', 12], ['Rijks', 9]] });
  assert.equal(toCsv(exportRows(d)), 'institution,count\r\nMet,12\r\nRijks,9\r\n');
});

test('rows of objects become columns in first-seen order, missing cells empty', () => {
  const d = { rows: [{ label: 'Nobel', value: 1 }, { label: 'Davy', value: 2, extra: 'x' }] };
  const out = exportRows(d);
  assert.deepEqual(out.columns, ['label', 'value', 'extra']);
  assert.deepEqual(out.rows, [['Nobel', 1, ''], ['Davy', 2, 'x']], 'a cell the row lacks is empty, not invented');
});

test('a timeline exports one row per event with the pieces the renderer flattened', () => {
  const d = {
    timeline: { lanes: [{        // the real payload nests them: { timeline: { lanes }, rows, vars }
      label: 'Anne Frank',
      origin: 1929.45,
      events: [
        { year: 1929, month: 6, day: 12, precision: 'day', kind: 'born', label: '', at: 1929.45 },
        { year: 1944, month: 10, day: 1, precision: 'month', kind: 'lived in', label: 'Bergen-Belsen concentration camp', at: 1944.75 },
      ],
    }, {
      label: 'Martin Luther King Jr.',
      origin: 1929.04,
      events: [{ year: 1964, month: 1, day: 1, precision: 'year', kind: 'awarded', label: 'Nobel Peace Prize', at: 1964 }],
    }] },
  };
  const out = exportRows(d);
  assert.deepEqual(out.columns, ['lane', 'date', 'precision', 'kind', 'event', 'age']);
  assert.deepEqual(out.rows, [
    ['Anne Frank', '1929-06-12', 'day', 'born', '', '0'],
    ['Anne Frank', '1944-10', 'month', 'lived in', 'Bergen-Belsen concentration camp', '15'],
    ['Martin Luther King Jr.', '1964', 'year', 'awarded', 'Nobel Peace Prize', '34'],
  ]);
  assert.equal(toCsv(out).split('\r\n')[0], 'lane,date,precision,kind,event,age');
});

test('a timeline prefers its events over the raw query rows it also carries', () => {
  // The timeline card needs the query rows (to re-lay-out on zoom) AND the built events. The export a
  // reader wants is the events — the raw rows are still reachable through the Table renderer.
  const d = {
    rows: [{ who: 'Q4583', whoLabel: 'Anne Frank', date: '1929-06-12T00:00:00Z', kind: 'born', whatLabel: '' }],
    timeline: { lanes: [{ label: 'Anne Frank', origin: 1929.45, events: [{ year: 1929, month: 6, day: 12, precision: 'day', kind: 'born', label: '', at: 1929.45 }] }] },
  };
  const out = exportRows(d);
  assert.deepEqual(out.columns, ['lane', 'date', 'precision', 'kind', 'event', 'age']);
  assert.equal(out.rows[0][0], 'Anne Frank');
});

test('a chart series exports its points', () => {
  const d = { chartData: [{ date: '2026-08-01', value: 1200 }, { date: '2026-08-02', value: 1310 }] };
  assert.deepEqual(exportRows(d), {
    columns: ['date', 'value'],
    rows: [['2026-08-01', 1200], ['2026-08-02', 1310]],
  });
});

test('a gallery exports its files', () => {
  const d = { items: [{ title: 'File:A.jpg', url: 'https://x/a.jpg' }, { title: 'File:B.jpg', url: 'https://x/b.jpg' }] };
  assert.deepEqual(exportRows(d).columns, ['title', 'url']);
});

test('a stat exports one labelled row, and needs a title to make sense', () => {
  const d = { value: '621 KB', detail: 'raw bundle' };
  assert.deepEqual(exportRows(d, { title: 'Bundle size' }), {
    columns: ['metric', 'value', 'detail'],
    rows: [['Bundle size', '621 KB', 'raw bundle']],
  });
  assert.equal(exportRows(d).rows[0][0], 'value', 'without a title it says what it is');
});

test('a payload with no data yields null, so no dead download button appears', () => {
  assert.equal(exportRows(null), null);
  assert.equal(exportRows({}), null);
  assert.equal(exportRows({ rows: [] }), null);
  assert.equal(exportRows({ error: 'nope' }), null);
  assert.equal(exportRows('text'), null);
});

test('CSV quoting survives commas, quotes, newlines and unicode', () => {
  assert.equal(csvField('plain'), 'plain');
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField('two\nlines'), '"two\nlines"');
  assert.equal(csvField('Múzeum, Budapest'), '"Múzeum, Budapest"');
  assert.equal(csvField(null), '', 'a missing value is empty, never "null"');
  assert.equal(csvField(0), '0', 'zero is a value');
  const csv = toCsv({ columns: ['name', 'note'], rows: [['O\'Brien, J.', 'said "hi"']] });
  assert.equal(csv, 'name,note\r\n"O\'Brien, J.","said ""hi"""\r\n');
});

test('CSV line endings are CRLF, as the spec requires and Excel expects', () => {
  const csv = toCsv({ columns: ['a'], rows: [['1'], ['2']] });
  assert.ok(csv.includes('\r\n'));
  assert.ok(csv.endsWith('\r\n'));
  assert.equal(csv.split('\r\n').filter(Boolean).length, 3);
});

test('filenames are recognisable and safe on disk', () => {
  const when = new Date('2026-09-12T10:00:00Z');
  assert.equal(csvFilename('pageview', 'Marie Curie (Q7186)', when), 'wikibento-pageview-marie-curie-2026-09-12.csv');
  assert.equal(csvFilename('sparql', 'Two lives, one axis (Marie × Pierre Curie)', when),
    'wikibento-sparql-two-lives-one-axis-marie-pierre-curie-2026-09-12.csv');
  assert.equal(csvFilename('editHistory', null, when), 'wikibento-edit-history-2026-09-12.csv', 'camelCase ids kebab for filenames');
  assert.ok(!/[\\/:*?"<>|\s]/.test(csvFilename('x', 'a/b:c*d?e"f<g>h|i j', when)), 'no path-hostile characters');
});

/**
 * A structural guard, because the change that introduced this file broke the app SILENTLY.
 *
 * Inserting the CSV helper just above `function WidgetFrame(` put it between `export default` and the
 * component, so the module's default export became the helper: App rendered `saveCsv(props)` — which
 * returns a boolean — for every card. No exception, no error boundary, no console output, and the
 * build was happy; the page simply had no widgets. Nothing in the test suite could see it until a
 * browser did.
 */
test('the widget frame still default-exports the component, not a helper', () => {
  // process.cwd(), not import.meta.url: esbuild's bundle changes the latter (a trap this repo has
  // hit before — see the tutorial-beats test).
  const src = readFileSync(join(process.cwd(), 'src/widgets/WidgetFrame.jsx'), 'utf8');
  assert.match(src, /export default function WidgetFrame\(/, 'App imports the default export — it must be the component');
  assert.equal((src.match(/export default/g) || []).length, 1, 'exactly one default export');
});
