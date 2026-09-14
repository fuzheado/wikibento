/**
 * Data export — turning a widget's rendered payload back into rows (ISSUE-77).
 *
 * Every widget already holds its data in a shape it can render; this module maps the shapes we
 * actually produce to `{ columns, rows }` so any widget can be saved as CSV without teaching each one
 * about files. The mapping is deliberately shape-based rather than type-based — a `timeline` and a
 * `sparql` table both end up as rows, and a widget that grows a new shape only needs a case here.
 *
 * Two rules that matter more than the coverage:
 *
 *  1. **Export the DATA, not the pixels.** A chart's screenshot is a picture of numbers; the CSV is
 *     the numbers, and it is what a reader can actually reuse. That is also why this half of the
 *     export story needs no dependency, no canvas and no cross-origin agony.
 *  2. **Never invent a value.** A cell that the widget does not hold is left empty rather than filled
 *     with a dash or a guess: the file is data, and a reader may feed it to a spreadsheet.
 */

/** Does this payload look like a 2-D table (columns + array rows)? */
const isTable = (d) => Array.isArray(d?.columns) && Array.isArray(d?.rows) &&
  (d.rows.length === 0 || Array.isArray(d.rows[0]));

/** Column list for an array of plain objects, in first-seen order. */
function columnsOf(rows) {
  const cols = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  }
  return cols;
}

/**
 * A timestamp cell the way a spreadsheet wants it: ISO, no timezone guessing, and **no invented
 * precision** — a year-precision date is stored as 1 January, and writing "1964-01" would assert a
 * month the source never claimed.
 */
const isoDate = (ev) => {
  if (!ev || !Number.isFinite(ev.year)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  if (!ev.month || ev.precision === 'year') return String(ev.year);
  return ev.precision === 'day' ? `${ev.year}-${pad(ev.month)}-${pad(ev.day)}` : `${ev.year}-${pad(ev.month)}`;
};

/**
 * Map a widget payload to `{ columns, rows }`, or null when there is nothing table-shaped in it.
 * `opts.title` is used for the single-row "stat" case, which has a value but no column names.
 */
export function exportRows(data, opts = {}) {
  if (!data || typeof data !== 'object') return null;

  // 1. A real 2-D table (the SPARQL table renderer, edit history, assessments…).
  if (isTable(data)) {
    const columns = data.columns.length ? data.columns : columnsOf(data.rows.map((r) => Object.fromEntries(r.map((c, i) => [String(i), c]))));
    return { columns: columns.map(String), rows: data.rows.map((r) => r.map((c) => (c == null ? '' : c))) };
  }

  // 2. A timeline: one row per event, with the pieces the renderer had to flatten for display.
  //    Note WHERE the lanes live: the card's payload is `{ timeline: { lanes }, rows, vars, … }`, so
  //    the lanes are nested one level down — a flattened fixture hid that, and the export quietly fell
  //    through to the raw query rows underneath.
  const lanes = data.lanes || data.timeline?.lanes;
  if (Array.isArray(lanes) && lanes.length) {
    const rows = [];
    for (const lane of lanes) {
      for (const e of lane.events || []) {
        rows.push([
          lane.label,
          isoDate(e),
          e.precision || '',
          e.kind || '',
          e.label || '',
          // the event's own words, and (in age mode) how old the subject was
          e.at != null && lane.origin != null ? String(Math.floor(e.at - lane.origin)) : '',
        ]);
      }
    }
    if (!rows.length) return null;
    rows.sort((a, b) => (a[0] === b[0] ? String(a[1]).localeCompare(String(b[1])) : 0));
    return { columns: ['lane', 'date', 'precision', 'kind', 'event', 'age'], rows };
  }

  // 3. Rows of objects (rankings, CIM lists, top files/pages, galleries as rows…).
  if (Array.isArray(data.rows) && data.rows.length && typeof data.rows[0] === 'object') {
    const columns = columnsOf(data.rows);
    if (!columns.length) return null;
    return { columns, rows: data.rows.map((r) => columns.map((c) => (r?.[c] == null ? '' : r[c]))) };
  }

  // 4. A chart series (pageviews, CIM traffic, SPARQL line) — the points behind the line.
  if (Array.isArray(data.chartData) && data.chartData.length) {
    const columns = columnsOf(data.chartData);
    if (!columns.length) return null;
    return { columns, rows: data.chartData.map((r) => columns.map((c) => (r?.[c] == null ? '' : r[c]))) };
  }

  // 5. Galleries and media lists: the files, with whatever else the payload carries about them.
  if (Array.isArray(data.items) && data.items.length) {
    const columns = columnsOf(data.items);
    if (!columns.length) return null;
    return { columns, rows: data.items.map((r) => columns.map((c) => (r?.[c] == null ? '' : r[c]))) };
  }

  // 6. A stat: one row, and the reader needs to know what the number is.
  if (data.value != null && typeof data.value !== 'object') {
    return {
      columns: ['metric', 'value', 'detail'],
      rows: [[opts.title || 'value', data.value, data.detail || '']],
    };
  }

  return null;
}

/** RFC 4180 quoting: only quote when needed, and double the quotes inside. */
export function csvField(value) {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** `{ columns, rows }` → a CSV document (CRLF line endings, as the spec says). */
export function toCsv({ columns, rows }) {
  const lines = [columns.map(csvField).join(',')];
  for (const r of rows) lines.push(r.map(csvField).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * `wikibento-pageview-marie-curie-2026-09-12.csv` — recognisable in a downloads folder, whatever the
 * format (the extension is the last argument so one function names every export).
 */
export function exportFilename(widgetType, title, ext, now = new Date()) {
  const slug = String(title || '')
    .replace(/\(Q\d+\)/g, '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 48)
    .replace(/-+$/, '');
  const stamp = now.toISOString().slice(0, 10);
  // registry ids are camelCase (editHistory) — kebab them so the filename reads like a filename
  const type = String(widgetType || '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return ['wikibento', type, slug, stamp].filter(Boolean).join('-') + `.${ext}`;
}

/** The CSV case, kept as its own name because that is how the callers think about it. */
export const csvFilename = (widgetType, title, now = new Date()) =>
  exportFilename(widgetType, title, 'csv', now);
