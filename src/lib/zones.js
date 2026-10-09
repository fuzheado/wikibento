/**
 * Clickable zones on a card's image — the parser (ISSUE-138, slice A).
 *
 * Storage is **text in a textarea**, following this repo's precedent for structured config (the map's `points` as "one
 * place per line", `spec`'s pipes, pasted GeoJSON) rather than a nested array. That keeps the board readable and
 * pasteable, needs no new config-field type, and lets a person fix a box by hand — see `docs/ZONES.md`.
 *
 * The line grammar the design fixed:
 *
 *     geometry | label | kind | value | action
 *
 *   · **geometry** — `x,y,w,h` as percentages of the image (the flat host), or `at pitch,yaw` (a 360° host: parsed
 *     here, drawn by the sphere slice, so an author can write either today).
 *   · **label**    — what the reader sees on reveal; `-` for none.
 *   · **kind**     — the thing the value names (`article`, `file`, `category`, …); `-` for none.
 *   · **value**    — what a click publishes, in the app's reference form (`de:Piz Nuna`, `File:X`, `Category:Y`).
 *   · **action**   — `send` (publish it — the default), `open` (the file page in a new tab), `-` for a label only.
 *
 * Malformed lines are **reported, never silently dropped**: `problems` comes back beside the zones so the card can say
 * how many it ignored, and which. A silent drop is the failure mode this project keeps writing guards against.
 *
 * A box is **never clamped**: a zone moved silently lands on the wrong part of a picture, which is worse than a line
 * that refuses to load.
 */

export const ZONE_ACTIONS = ['send', 'open', '-'];

/** One number, or null when it is not one. `Number('')` is 0, which would turn an empty field into a real value. */
const num = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** `-` (and nothing) mean "absent" everywhere a field is optional. */
const blank = (v) => v === undefined || v === '' || v === '-';

/**
 * The zones text → `{ zones, problems }`.
 *
 * A zone is `{ line, geometry: 'box' | 'at', …coordinates, label, kind, value, action }` — `line` is kept so a problem
 * message and the ⚙ panel point at the same place.
 */
export function parseZones(text) {
  const zones = [];
  const problems = [];
  String(text ?? '').split('\n').forEach((raw, index) => {
    const line = raw.trim();
    const at = index + 1;
    if (!line || line.startsWith('#')) return;                       // blank lines and `#` comments
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 2) {
      problems.push(`line ${at}: needs at least "geometry | label" — the fields are geometry | label | kind | value | action`);
      return;
    }
    const [geom, label, kind, value, action] = parts;
    const zone = {
      line: at,
      label: blank(label) ? '' : label,
      kind: blank(kind) ? '' : kind,
      value: blank(value) ? '' : value,
      action: blank(action) ? 'send' : action,
    };
    if (!ZONE_ACTIONS.includes(zone.action)) {
      problems.push(`line ${at}: action "${zone.action}" is not one of ${ZONE_ACTIONS.filter((a) => a !== '-').join(', ')}`);
      return;
    }

    // A direction on a sphere — parsed here so a tour's line can be written today; the flat card ignores it.
    if (/^at\b/i.test(geom)) {
      const [pitch, yaw] = geom.replace(/^at\b/i, '').split(',').map((v) => num(v));
      if (pitch === null || yaw === null) {
        problems.push(`line ${at}: "at" needs pitch,yaw — e.g. "at -2,48"`);
        return;
      }
      if (pitch < -90 || pitch > 90) {
        problems.push(`line ${at}: pitch ${pitch} is outside -90…90 — it cannot mean what it says`);
        return;
      }
      zones.push({ ...zone, geometry: 'at', pitch, yaw: ((yaw + 540) % 360) - 180 });   // the engine's convention
      return;
    }

    // A percentage box on a flat image: `x,y,w,h`.
    const [x, y, w, h] = geom.split(',').map((v) => num(v));
    if ([x, y, w, h].some((v) => v === null)) {
      problems.push(`line ${at}: geometry must be four percentages "x,y,w,h" — e.g. "18.1,14.4,5.7,6.7"`);
      return;
    }
    if (x < 0 || y < 0 || x > 100 || y > 100) {
      problems.push(`line ${at}: x/y (${x},${y}) must be percentages between 0 and 100`);
      return;
    }
    if (w <= 0 || h <= 0 || x + w > 100.5 || y + h > 100.5) {
      problems.push(`line ${at}: the box (${x},${y},${w},${h}) has no size or runs past the image — not clamped`);
      return;
    }
    zones.push({ ...zone, geometry: 'box', x, y, w, h });
  });
  return { zones, problems };
}

/** `{ zones }` → the text, so the editor (slice B) can write what it read. Round-trips through `parseZones`. */
export function serialiseZones(zones = []) {
  return zones.filter((z) => z && z.geometry).map((z) => {
    const geom = z.geometry === 'at' ? `at ${z.pitch},${z.yaw}` : `${z.x},${z.y},${z.w},${z.h}`;
    const or = (v, fallback = '-') => (v === undefined || v === null || v === '' ? fallback : v);
    return [geom, or(z.label), or(z.kind), or(z.value), or(z.action, 'send')].join(' | ');
  }).join('\n');
}

/** The zones a click can act on — a label-only line is a reveal, not an emitter. */
export const emittingZones = (zones = []) => zones.filter((z) => z.value);

/**
 * A reference → the wiki URL an `open` zone should hand the browser.
 *
 * The reference form is the app's own (`de:Piz Nuna`, `commonswiki:Category:Birds`, `en:Marie Curie`), split on the
 * FIRST colon so a title may keep its own (`commonswiki:File:Dogs, jackals.jpg`). The prefix is a language code or a
 * dbname — the two things a board already writes — and anything unrecognised is treated as a language code, which is
 * what an author means nine times in ten and is honest about the tenth (the URL simply 404s on that wiki).
 */
const WIKI_HOSTS = {
  commons: 'commons.wikimedia.org', commonswiki: 'commons.wikimedia.org',
  wikidata: 'www.wikidata.org', wikidatawiki: 'www.wikidata.org',
  meta: 'meta.wikimedia.org', metawiki: 'meta.wikimedia.org',
  species: 'species.wikimedia.org', specieswiki: 'species.wikimedia.org',
};
/** A prefix that is a *namespace*, not a wiki: `Category:Birds` is a Commons title, not a language called "category". */
const COMMONS_NAMESPACES = ['file', 'category', 'template', 'help', 'gallery', 'creator', 'institution', 'user', 'special'];

/** A language code, which is the only other thing a board writes there: `en`, `de`, `zh-yue`, `be-tarask`. */
const LANGUAGE = /^[a-z]{2,3}(-[a-z]{2,8})?$/;

export function zoneUrl(value) {
  const raw = String(value || '').trim();
  const colon = raw.indexOf(':');
  if (colon < 0) return null;                       // a bare title has no wiki to open it on
  const prefix = raw.slice(0, colon).trim().toLowerCase();
  const title = raw.slice(colon + 1).trim();
  if (!prefix || !title) return null;
  // Encode a title, then put back the characters MediaWiki leaves literal — the namespace colon, and the
  // sub-delimiters titles are full of (`File:Dogs, jackals (Plate XI)!.jpg`). A slash stays encoded: a literal one
  // would end the title. Both forms resolve; this is the one a browser bar and a wikitext link show.
  const LITERAL = { '3A': ':', '2C': ',', '28': '(', '29': ')', '27': "'", '21': '!', '2A': '*', '2B': '+' };
  const href = (host, page) => `https://${host}/wiki/${encodeURIComponent(page.replace(/ /g, '_'))
    .replace(/%(3A|2C|28|29|27|21|2A|2B)/g, (m, hex) => LITERAL[hex])}`;
  if (WIKI_HOSTS[prefix]) return href(WIKI_HOSTS[prefix], title);
  if (COMMONS_NAMESPACES.includes(prefix)) return href('commons.wikimedia.org', raw);   // keep the namespace in the title
  // Anything else that is not language-shaped is refused rather than guessed at: a made-up host produces a URL that
  // cannot exist, which is worse than no link — the same reasoning as the parser's "never clamp a box".
  return LANGUAGE.test(prefix) ? href(`${prefix}.wikipedia.org`, title) : null;
}
