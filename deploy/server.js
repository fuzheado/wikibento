/**
 * WikiBento — zero-dependency static server for Toolforge (node20).
 * Serves dist/ with proper MIME types and cache headers.
 * Also resolves short URLs (w.wiki) for the ?config= loader via /api/resolve.
 * Also: /api/ask + /api/ask/session — the "Ask" natural-language widget
 * advisor relay (ISSUE-44). Relays a user's intent to Wikimedia's free
 * LiftWing LLM (llm-qwen36-27b) with a server-owned widget manifest as the
 * system prompt, enforces a narrow contract (no arbitrary system prompts /
 * models), validates widget ids against the manifest, and returns options
 * JSON. See docs/DATA-SOURCES.md §23 and docs/ISSUES.md ISSUE-44.
 * See docs/DEPLOYMENT.md; pattern per the toolforge-nodejs skill.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT || 8765; // Toolforge proxy sets PORT (8000 on k8s)
// On Toolforge: dist/ sits next to server.js in ~/www/js/. Locally, point
// WIKIBENTO_ROOT at the repo's dist/ (e.g. when running from deploy/).
const ROOT = resolve(process.env.WIKIBENTO_ROOT || join(__dirname, 'dist'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

// Tiny in-memory TTL cache for the /api/wayback-gallery endpoint.
const waybackCache = new Map();
const waybackCacheSet = (key, value, ttlMs) => waybackCache.set(key, { value, expires: Date.now() + ttlMs });
const waybackCacheGet = (key) => {
  const hit = waybackCache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) { waybackCache.delete(key); return null; }
  return hit.value;
};

// ── Ask advisor (ISSUE-44): zero-dep relay to the free LiftWing LLM ────────
// Narrow function, not a proxy: the server owns the system prompt (widget
// manifest embedded server-side), fixes model + params, validates output ids.
// Abuse defense (proportionate — upstream is free): Origin allowlist (soft
// gate), per-IP sliding windows + global tripwire, short-lived HMAC session
// token (control token, not secrecy), prompt caps, hash-keyed TTL cache.
const ASK_DISABLED = process.env.WIKIBENTO_ASK_DISABLED === '1';
const ASK_SECRET = process.env.WIKIBENTO_ASK_SECRET || randomBytes(24).toString('hex'); // rotates per restart unless set
const ASK_MODEL = process.env.WIKIBENTO_ASK_MODEL || 'llm-qwen36-27b';
const ASK_FALLBACK_MODEL = 'llm-qwen3-14b';
const ASK_UPSTREAM = (model) => `https://api.wikimedia.org/service/lw/inference/v1/models/${model}/openai/v1/chat/completions`;
const ASK_ALLOWED_ORIGINS = new Set([
  'https://wikibento.toolforge.org',
  'http://localhost:5173', 'http://localhost:4173', 'http://localhost:8765',
]);
const ASK_MAX_PROMPT = 1000; // chars
const ASK_MAX_TOKENS = 700; // output tokens
const ASK_TIMEOUT_MS = 45000;
const ASK_TTL_MS = 10 * 60 * 1000;
const ASK_UA = 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado) ask-relay';

const rlHits = new Map(); // ip -> { min: number[], hour: number[] }
const globalHits = [];    // one-hour window across everyone
const rlLimit = (ip, perMin, perHour, globalHour) => {
  const now = Date.now();
  const trim = (arr, ms) => { while (arr.length && arr[0] < now - ms) arr.shift(); };
  let hit = rlHits.get(ip);
  if (!hit) { hit = { min: [], hour: [] }; rlHits.set(ip, hit); }
  trim(hit.min, 60000); trim(hit.hour, 3600000); trim(globalHits, 3600000);
  if (hit.min.length >= perMin || hit.hour.length >= perHour || globalHits.length >= globalHour) {
    return Math.max(1, Math.ceil((60000 - (now - (hit.min[0] || now))) / 1000));
  }
  hit.min.push(now); hit.hour.push(now); globalHits.push(now);
  return 0;
};
const ipOf = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
const sha = (s) => createHmac('sha256', ASK_SECRET).update(String(s)).digest('hex');

const readBody = async (req) => {
  const chunks = [];
  for await (const c of req) {
    chunks.push(c);
    if (chunks.reduce((n, x) => n + x.length, 0) > 8192) throw new Error('body too large');
  }
  return Buffer.concat(chunks).toString('utf8');
};

// Session token: base64url({ip, exp}) + '.' + base64url(HMAC). IP-bound,
// 30-min expiry; rotating ASK_SECRET invalidates every outstanding token.
const issueToken = (ip) => {
  const payload = Buffer.from(JSON.stringify({ ip, exp: Date.now() + 30 * 60 * 1000 })).toString('base64url');
  const sig = Buffer.from(createHmac('sha256', ASK_SECRET).update(payload).digest()).toString('base64url');
  return `${payload}.${sig}`;
};
const verifyToken = (token, ip) => {
  try {
    const [payload, sig] = String(token).split('.');
    if (!payload || !sig) return false;
    const expect = Buffer.from(createHmac('sha256', ASK_SECRET).update(payload).digest());
    const got = Buffer.from(sig, 'base64url');
    if (expect.length !== got.length || !timingSafeEqual(expect, got)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() && data.ip === ip;
  } catch { return false; }
};

// Widget manifest (build-generated, shipped in dist/). Loaded once at first ask.
let askManifest = null;
let askManifestLoaded = false;
const getManifest = async () => {
  if (!askManifestLoaded) {
    try { askManifest = JSON.parse(await readFile(join(ROOT, 'manifest.json'), 'utf8')); } catch { askManifest = null; }
    askManifestLoaded = true;
  }
  return askManifest;
};
const manifestIds = (m) => new Map((m?.widgets || []).map((w) => [w.id, w]));

const askCache = new Map();
const askCacheSet = (k, v) => askCache.set(k, { v, exp: Date.now() + ASK_TTL_MS });
const askCacheGet = (k) => {
  const hit = askCache.get(k);
  if (!hit) return null;
  if (hit.exp < Date.now()) { askCache.delete(k); return null; }
  return hit.v;
};

const ASK_SYSTEM = (m) => `You are the WikiBento widget advisor. WikiBento is a browser dashboard for Wikimedia data (Wikipedia, Commons, Wikidata). A user describes something they want to see or do; you recommend the best widget(s) from the catalog below and return JSON only.

CATALOG (JSON array — ids are exact; use them verbatim, never invent ids):\n${JSON.stringify(m.widgets.map((w) => ({ id: w.id, name: w.name, nodeKind: w.nodeKind, description: w.description, dataSource: w.dataSource, category: w.category, type: w.type, timeScope: w.timeScope, outputs: w.outputs, consumesSource: w.consumesSource, configFields: w.configFields, defaults: w.defaults })))}`;

/** Dataflow manual for the Ask prompt.
 *
 *  DERIVED FROM THE MANIFEST ON PURPOSE: the emitter list and the source-field
 *  consumer list are read out of the catalog itself, so a widget added later
 *  that declares `outputs` (or a `source` config field) appears in the LLM
 *  prompt automatically. The manual used to hardcode "only these five emit",
 *  which silently disagreed with the catalog the moment a sixth emitter landed
 *  (ISSUE-65: qrCode emits its encoded text). */
const askManual = (m) => {
  const widgets = Array.isArray(m?.widgets) ? m.widgets : [];
  const emitters = widgets.filter((w) => w.outputs && w.outputs.kind);
  const consumers = widgets.filter((w) => w.consumesSource).map((w) => w.id);
  const freeText = widgets
    .filter((w) => (w.configFields || []).some((f) => f.type === 'textarea' && !f.noRefs))
    .map((w) => w.id);
  const emitterList = emitters
    .map((w) => {
      const what = {
        extract: 'the article extract text',
        lines: 'its lines (one per line)',
        count: 'a number',
        value: 'its value',
      }[w.outputs.kind] || `a ${w.outputs.kind}`;
      return `${w.id} emits ${what} (kind: ${w.outputs.kind})`;
    })
    .join('; ');
  const freeTextList = freeText.length > 4 ? `${freeText.slice(0, 4).join(', ')}, …` : freeText.join(', ');
  return `\n\nHOW WIKIBENTO WIDGETS CONNECT (dataflow):\n- PARAMS: any config field may reference a board parameter as {{param}} — parameters are set by the Board Controls widget (boardControls).\n- INTERPOLATION: any string config field may embed another widget's output as {{widget:<id>}} (a scalar, or a newline-joined list for list-shaped outputs).\n- FREE-TEXT FIELDS resolve {{param}} and {{widget:<id>}} too (${freeTextList}) — e.g. a qrCode can encode whatever a pageviews/params-driven widget is currently showing, so the code follows the board.\n- nodeKind = a widget's role: source (fetches/derives from Wikimedia APIs), controller (writes {{param}}s), transformer (consumes one feed, emits a filtered/transformed feed), reducer (feed → one count/stat), display (renders static/embedded content), effector (speaks text aloud), ai (machine translation / ML service).\n- 'source' config fields (type: source): the widget CONSUMES the output of an emitting widget chosen on the board. Widgets with such a field: ${consumers.join(', ') || '(none in this catalog)'}.\n- EMITTERS (only these ${emitters.length} produce output others can consume): ${emitterList || '(none)'}.\n- MULTI-STEP requests (e.g. "take article X's text, filter it, translate it to French"): recommend the chain of widgets in order (excerpt → filterLines → translate; or excerpt → translate with translate's text field fed via {{widget:<excerpt's board id>}}) and explain the wiring inside each option's reason. You cannot know widget instance ids on the user's board — never invent source values or {{widget:…}} ids; say which widgets to connect instead.\n- A widget whose config has no source field and no {{param}}/{{widget:…}} placeholders is standalone: give it concrete subjects from the user's request.`;
};

const ASK_RULES = `\n\nRULES:\n- Use EXACT widget ids from the catalog. Never invent ids.\n- Recommend 1-3 widgets. Prefer the most specific fit; add a second or third alternative only when genuinely useful (e.g. a precomputed vs live source for the same need).\n- INTENT MATCHING: when the user names a category ("from a category", "category …"), prefer widgets whose input is a category (categorySize, glamorgan, cim*). Do NOT pick file-list widgets (fileGallery, gallery, mediaPlayer) for category inputs — those take individual files. When the user names files or media, pick the file-based widgets instead.\n- For each option: widgetType = exact id; config = pre-filled with the user's subject using REAL names from the request (never invent subjects the user did not name; when none is given use a placeholder like "Example" for a category or "Main_Page" for an article); mode = a display mode only if the widget's displayMode field lists one; reason = one plain-language sentence.\n- If nothing fits, return {"options": []}.\n- Reply with JSON only — no prose, no markdown fences, no commentary.\n\nVALUE RULES (critical — invalid values break the widget):\n- category values: the BARE category title, copied VERBATIM from the user's request — keep the FULL span including qualifiers like 'in the United States', years, and subcategory paths; never shorten, paraphrase, or truncate it. Never prepend 'Category:'; drop quotes.\n- SUBJECT COMPLETENESS: pre-fill EVERY subject field the user explicitly gave (article, file, url, category, domain, lang, dates…) — omitting one makes the widget show a placeholder instead of the user's subject.\n- wiki/project/lang values: one of the listed options EXACTLY (e.g. "commons.wikimedia", "en.wikipedia", "de.wikipedia", "fr.wikipedia", "en"). Never "commons.org", never .org suffixes, never full URLs.\n- file values: "File:Name.ext" with the File: prefix (multiple files: one per line, each with the prefix).\n- article/page values: the page title (spaces are fine; do not add prefixes).\n- domain values: bare domain only, no https:// or www. (e.g. "example.org").\n- url values: the full https:// URL exactly as given in the request.\n- number fields (sampleCount, maxRows, maxItems, topN, …): plain numbers, no commas.
- source/widget-reference values: NEVER set a 'source' config field (or a {{widget:…}} reference) to a made-up id — the user picks the producing widget on the board; explain the needed wiring in the option's reason instead.\n\nOUTPUT SCHEMA: ${JSON.stringify({ options: [{ widgetType: 'id', config: { key: 'value' }, mode: 'display mode', reason: 'one sentence' }] })}\n\nEXAMPLES:\nUser: Show a random sampling of images from Wikimedia Commons category "Featured pictures on Wikimedia Commons"\nAssistant: ${JSON.stringify({ options: [{ widgetType: 'categorySize', config: { category: 'Featured pictures on Wikimedia Commons', wiki: 'commons.wikimedia', sampleCount: 6 }, reason: 'Category Size shows the category breakdown and samples random photos from it.' }] })}\nUser: I want to see how wikipedia.org looked in 2010 and 2020
Assistant: ${JSON.stringify({ options: [{ widgetType: 'waybackGallery', config: { url: 'https://wikipedia.org', dates: '2010-01-01\n2020-01-01', toleranceDays: 365 }, reason: 'Wayback Snapshot Gallery shows one archived screenshot per requested date.' }] })}
User: how often is an image used in a certain category\nAssistant: ${JSON.stringify({ options: [{ widgetType: 'fileUsage', config: { file: 'File:Example.jpg' }, reason: 'File Usage Map lists every wiki page that uses the file.' }, { widgetType: 'cimFileSpotlight', config: { file: 'File:Example.jpg' }, reason: 'CIM File Spotlight shows the file\'s usage wikis and view trend (precomputed).' }] })}`;

// ── Board-assembly mode (ISSUE-44 Phase 3a) ──
// The client may request mode:'board' — the advisor returns a COMPLETE wired
// fragment (params + widgets with self-assigned ids + {{param}}/{{widget:id}}
// wiring) instead of single-widget options. VALUE RULES are shared verbatim
// with the recommendation rules (single source of truth: extracted at runtime
// from ASK_RULES between its VALUE RULES and OUTPUT SCHEMA sections).
const ASK_VALUE_RULES = ASK_RULES.slice(ASK_RULES.indexOf('\n\nVALUE RULES (critical'), ASK_RULES.indexOf('\n\nOUTPUT SCHEMA:'));

const ASK_ASSEMBLY_MANUAL = `\n\nBOARD ASSEMBLY MODE: the user wants a set of widgets that work TOGETHER (a switcher + driven widgets, a dataflow chain, or a themed collection). Return a COMPLETE, WIRED board fragment:
- "widgets": the full widget list, IN WIRING ORDER (producers first), each with a UNIQUE kebab-case "id" YOU invent (ids are yours to assign — they describe the widget's role, e.g. "collection-switcher", "einstein-translate"), "widgetType" from the catalog, "config" pre-filled with the user's subjects, and layout "w"/"h" (w is 1-12 grid columns — galleries/panoramas need 12; h is 2-14 rows).
- "params": declare board parameters ONLY when a switcher/stepper drives the widgets (Board Controls pattern): { name: { label, type: "buttons"|"select"|"text"|"number"|"month", options: [...], value } }. Widgets reference a param as {{name}} anywhere in their config. Max 4 params.
- WIRING: a consumer widget's config field references a producer by its id — source fields (type "source") take the BARE producer id (e.g. "source": "museum-list"); text/textarea fields take {{widget:<producer-id>}} (list-shaped outputs feed textarea fields, text outputs feed text fields). Chain transitively (excerpt → translate → speaker can wire translate's text from excerpt and speaker's text from translate).
- Only wire fields that semantically make sense: excerpt text → translate/speaker text; listSource lines → articleList titles / filterLines source; filterLines → lineCount / articleList; a params switcher → any config field via {{name}}.
- Every {{widget:…}} id and every bare source id MUST match a widget id you declared; every {{param}} must match a declared param. Dangling references break the board.
- Do NOT wire anything when the widgets are independent (a plain 2-3 widget collection needs no wiring — just pre-fill each config).`;

const ASK_RULES_BOARD = `\n\nBOARD RULES:\n- Return JSON only: ${JSON.stringify({ board: { params: {}, widgets: [{ id: 'role-name-id', widgetType: 'id', config: { key: 'value or {{param:…}} or {{widget:…}}' }, w: 4, h: 3 }], summary: 'one sentence' } })}\n- widgetType: EXACT catalog ids. Use 2-6 widgets — the fewest that serve the request; add widgets only when the request implies them (a chain, a switcher + driven widgets, or complementary views). If the request is for ONE simple widget, prefer a normal recommendation instead (no board needed).\n- ids: kebab-case, unique within the board, descriptive of the role. Never reuse a catalog id as an instance id.\n- config: pre-fill subjects from the request using the value rules below; leave other fields out (defaults apply).\n- summary: one plain-language sentence describing the board.`;

const stripThink = (s) => String(s).replace(/<think>[\s\S]*?<\/think>/g, '').trim();

async function callLlm(model, system, user) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ASK_TIMEOUT_MS);
  try {
    const r = await fetch(ASK_UPSTREAM(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': ASK_UA },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
        max_tokens: ASK_MAX_TOKENS,
        temperature: 0.3,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`upstream HTTP ${r.status}`);
    const data = await r.json();
    return stripThink(data?.choices?.[0]?.message?.content || '');
  } finally { clearTimeout(timer); }
}

// Validate + sanitize the model's options: drop hallucinated ids, cap count,
// and normalize each config value against the widget's declared configFields:
// unknown keys dropped, select values checked against the real options,
// number/boolean coerced, and per-key sanity rules (bare category names,
// File: prefixes, bare domains, https URLs). Near-miss project aliases
// ("commons.org" → "commons.wikimedia") resolve instead of breaking.
const PROJECT_ALIASES = {
  commons: 'commons.wikimedia', 'commons.wikimedia.org': 'commons.wikimedia', 'commons.org': 'commons.wikimedia',
  en: 'en.wikipedia', 'en.wikipedia.org': 'en.wikipedia',
  de: 'de.wikipedia', 'de.wikipedia.org': 'de.wikipedia',
  fr: 'fr.wikipedia', 'fr.wikipedia.org': 'fr.wikipedia',
};
const fieldOf = (widgetDef, key) => (widgetDef?.configFields || []).find((f) => f.key === key);

function normalizeConfig(config, widgetDef) {
  const out = {};
  for (const [key, raw] of Object.entries(config || {})) {
    if (key.startsWith('_')) { out[key] = String(raw).slice(0, 200); continue; } // custom props pass through
    const field = fieldOf(widgetDef, key);
    if (!field) continue; // unknown key for this widget → drop
    if (field.type === 'number') {
      const n = Number(raw);
      if (Number.isFinite(n)) out[key] = n;
      continue;
    }
    if (field.type === 'boolean') {
      if (typeof raw === 'boolean') out[key] = raw;
      else if (raw === 'true' || raw === 'false') out[key] = raw === 'true';
      continue;
    }
    let s = String(raw).trim();
    if (field.type === 'select') {
      const opts = field.options || [];
      if (opts.length) {
        let hit = opts.find((o) => o.toLowerCase() === s.toLowerCase());
        if (!hit && key === 'wiki' || !hit && key === 'project' || !hit && key === 'lang') hit = PROJECT_ALIASES[s.toLowerCase()];
        if (!hit) continue; // invalid option → drop; the widget's own default applies
        out[key] = hit;
      } else { out[key] = s.slice(0, 100); }
      continue;
    }
    // text / textarea fields — per-key sanity rules
    if (key === 'category') {
      s = s.replace(/^["']|["']$/g, '').replace(/^category\s*:\s*/i, '').trim();
    } else if (key === 'file' || key === 'filename') {
      if (!/^file\s*:/i.test(s)) s = `File:${s}`;
    } else if (key === 'files') {
      // one per line; ensure each line carries the File: prefix
      s = s.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean)
        .map((l) => (/^file\s*:/i.test(l) ? l : `File:${l}`)).join('\n');
    } else if (key === 'domain') {
      s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
    } else if (key === 'url') {
      if (!/^https?:\/\//i.test(s)) continue; // not a URL → drop
    } else if (key === 'article' || key === 'page') {
      s = s.replace(/^["']|["']$/g, '').trim();
    }
    if (s.length > 200) s = s.slice(0, 200);
    out[key] = s;
  }
  return out;
}

function validateOptions(parsed, widgetDefs) {
  const out = [];
  for (const o of (Array.isArray(parsed?.options) ? parsed.options : [])) {
    if (out.length >= 5) break;
    const id = String(o?.widgetType || '');
    const def = widgetDefs.get(id);
    if (!def) continue; // hallucinated ids are dropped
    let mode;
    if (typeof o?.mode === 'string' && o.mode) {
      const modeField = fieldOf(def, 'displayMode');
      const valid = modeField?.options || [];
      mode = o.mode.slice(0, 40);
      if (valid.length && !valid.some((m) => m.toLowerCase() === mode.toLowerCase())) mode = undefined;
    }
    out.push({
      widgetType: id,
      config: normalizeConfig(o?.config, def),
      ...(mode ? { mode } : {}),
      ...(typeof o?.reason === 'string' && o.reason ? { reason: o.reason.slice(0, 240) } : {}),
    });
  }
  return out;
}

// ── Board-assembly validation (ISSUE-44 Phase 3a) ──
// Validates + sanitizes a model-returned {board:{params,widgets,summary}}.
// Strict where it must be (refs must resolve), graceful where it can be
// (a bad widget is DROPPED with its dependents, iteratively — the board
// survives without it). Returns { widgets, params, warnings } — widgets []
// means nothing usable survived and the client shows an error state.
const ASSEMBLY_MAX_WIDGETS = 8;
const ASSEMBLY_MAX_PARAMS = 4;
function validateAssembly(parsed, widgetDefs) {
  const warnings = [];
  const rawBoard = parsed?.board && typeof parsed.board === 'object' ? parsed.board : null;
  const rawWidgets = Array.isArray(rawBoard?.widgets) ? rawBoard.widgets : [];
  const rawParams = rawBoard?.params && typeof rawBoard.params === 'object' && !Array.isArray(rawBoard.params) ? rawBoard.params : {};

  // Params: name grammar, valid types, ≤ 4, options capped.
  const params = {};
  for (const [name, entry] of Object.entries(rawParams)) {
    if (Object.keys(params).length >= ASSEMBLY_MAX_PARAMS) { warnings.push(`more than ${ASSEMBLY_MAX_PARAMS} params — extra dropped`); break; }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) { warnings.push(`param "${String(name).slice(0, 30)}" dropped (name must be letters/digits/-/_)`); continue; }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const types = ['buttons', 'select', 'text', 'number', 'month'];
    const options = Array.isArray(entry.options) ? entry.options.map((s) => String(s).slice(0, 120)).filter(Boolean).slice(0, 12) : undefined;
    params[name] = {
      label: String(entry.label || name).slice(0, 80),
      type: types.includes(entry.type) ? entry.type : (options?.length ? 'select' : 'text'),
      ...(options?.length ? { options } : {}),
      ...(entry.value !== undefined ? { value: String(entry.value).slice(0, 200) } : {}),
    };
  }

  // Widgets: known types only, ids sanitized + deduped, configs normalized.
  const widgets = [];
  const ids = new Set();
  for (const w of rawWidgets) {
    if (widgets.length >= ASSEMBLY_MAX_WIDGETS) { warnings.push(`more than ${ASSEMBLY_MAX_WIDGETS} widgets — extra dropped`); break; }
    const type = String(w?.widgetType || '');
    const def = widgetDefs.get(type);
    if (!def) continue; // hallucinated type → dropped silently (same policy as options)
    let id = String(w?.id || type).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || type;
    let n = 2;
    while (ids.has(id)) id = `${id.slice(0, 38)}-${n++}`;
    ids.add(id);
    const num = (v, lo, hi, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
    widgets.push({
      id,
      widgetType: type,
      config: normalizeConfig(w?.config, def),
      w: num(w?.w, 1, 12, 3),
      h: num(w?.h, 2, 14, 4),
      ...(typeof w?.title === 'string' && w.title ? { title: w.title.slice(0, 80) } : {}),
    });
  }

  // Iterative prune: drop widgets whose {{widget:id}} / bare source id /
  // {{param}} references dangle (a dropped producer cascades to its
  // consumers — a broken chain is worse than a shorter one).
  let changed = true;
  while (changed && widgets.length) {
    changed = false;
    const liveIds = new Set(widgets.map((w) => w.id));
    for (let i = widgets.length - 1; i >= 0; i--) {
      const w = widgets[i];
      const cfgStr = JSON.stringify(w.config || {});
      const widgetRefs = [...cfgStr.matchAll(/\{\{widget:([^}]+)\}\}/g)].map((m) => m[1].trim());
      const paramRefs = [...cfgStr.matchAll(/\{\{(?!widget:)([^}]+)\}\}/g)].map((m) => m[1].trim());
      const sourceFields = (widgetDefs.get(w.widgetType)?.configFields || []).filter((f) => f.type === 'source').map((f) => f.key);
      const sourceRefs = sourceFields.map((k) => String(w.config?.[k] ?? '').trim()).filter(Boolean);
      const dangling = widgetRefs.some((r) => !liveIds.has(r))
        || paramRefs.some((r) => !(r in params))
        || sourceRefs.some((r) => !liveIds.has(r));
      if (dangling) {
        warnings.push(`widget "${w.id}" dropped — a reference it consumes is not on the board`);
        widgets.splice(i, 1);
        changed = true;
      }
    }
  }

  return { widgets, params, warnings };
}

// ── /api/petscan: capped PetScan relay for the GLAM widget (ISSUE-46) ──
// GLAMorgan's tree engine: PetScan resolves a Commons category tree with
// depth/negcats AND returns per-file global image usage with EXACT ns
// (giu=1) — eliminating the widget's namespace heuristic and usage-lookup
// bug class. PetScan is CORS-open but quick-intersection mode IGNORES `max`
// (39 MB responses for big trees), so the browser must not call it directly:
// this stateless relay fetches server-side, caps the response, truncates to
// the widget's file budget, and normalizes PetScan's DB-form output to the
// shape the client already consumes (File:-prefixed titles with spaces,
// wiki domain names). Truncation (byte cap hit) is reported so the client
// falls back to its bounded self-walk.

const PETSCAN_URL = 'https://petscan.wmcloud.org/';
const PETSCAN_MAX_BYTES = 25 * 1024 * 1024; // quick-intersection can exceed this (39 MB trees)
const PETSCAN_BUDGET_MAX = 30000; // client fileBudget ceiling (GLAM widget, matches GLAMorgan's 30K)
const PETSCAN_TIMEOUT_MS = 60000;
const PETSCAN_UA = 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado) petscan-relay';

// PetScan DB-name → Wikimedia domain (relay normalizes so the client's
// wikiToProject keeps working unchanged). Returns the input when unknown.
const WIKI_DB_TO_DOMAIN = [
  [/^commonswiki$/, 'commons.wikimedia.org'],
  [/^specieswiki$/, 'species.wikimedia.org'],
  [/^metawiki$/, 'meta.wikimedia.org'],
  [/^wikidatawiki$/, 'www.wikidata.org'],
  [/^([a-z]{2,3})wiki$/, (m) => `${m[1]}.wikipedia.org`],
  [/^([a-z_]+)wiki$/, (m) => `${m[1].replace(/_/g, '-')}.wikipedia.org`], // zh_yuewiki → zh-yue.wikipedia.org
  [/^([a-z-]+)wikisource$/, (m) => `${m[1]}.wikisource.org`],
  [/^([a-z-]+)wiktionary$/, (m) => `${m[1]}.wiktionary.org`],
  [/^([a-z-]+)wikivoyage$/, (m) => `${m[1]}.wikivoyage.org`],
  [/^([a-z-]+)wikiquote$/, (m) => `${m[1]}.wikiquote.org`],
  [/^([a-z-]+)wikinews$/, (m) => `${m[1]}.wikinews.org`],
  [/^([a-z-]+)wikiversity$/, (m) => `${m[1]}.wikiversity.org`],
  [/^([a-z-]+)wikibooks$/, (m) => `${m[1]}.wikibooks.org`],
];
function wikiDbToDomain(wikiDb) {
  const w = String(wikiDb || '');
  if (!w) return w;
  for (const [re, fn] of WIKI_DB_TO_DOMAIN) {
    const m = w.match(re);
    if (m) return typeof fn === 'function' ? fn(m) : fn;
  }
  return w; // unknown DB (testwiki, …) — client treats it as non-viewable
}

// PetScan request URL from widget-style params. negcats arrives as the
// widget's 'A|B' form; PetScan wants newline-separated (petscan.js rule).
function buildPetscanUrl({ cats, depth = 0, negcats = '', negdepth = 0, budget = 500 } = {}) {
  const params = new URLSearchParams({
    lang: 'commons', project: 'wikimedia',
    cats: String(cats), depth: String(depth),
    ns: '6', giu: '1',
    max: String(budget), start: '0',
    format: 'json', doit: '1', redirects: '0',
  });
  const neg = String(negcats || '').trim();
  if (neg) {
    params.set('negcats', neg.replace(/\|/g, '\n'));
    params.set('negdepth', String(negdepth));
  }
  return `${PETSCAN_URL}?${params}`;
}

// Normalize PetScan's {pages:[{page_title (DB form, underscores), giu:[{wiki
// (DB name), page, ns}]}]} into the client shape: File:-prefixed titles with
// spaces, usage keyed by title with wiki domains and exact ns. Truncates to
// budget (capped) — PetScan ignores max, so the budget is enforced here.
function normalizePetscanPages(pages, budget = 500) {
  const files = [];
  const usage = {};
  let capped = false;
  for (const p of Array.isArray(pages) ? pages : []) {
    if (files.length >= budget) { capped = true; break; }
    const title = `File:${String(p.page_title || '').replace(/_/g, ' ')}`;
    if (title.trim() === 'File:') continue;
    files.push(title);
    usage[title] = (Array.isArray(p.giu) ? p.giu : [])
      .map((u) => ({ wiki: wikiDbToDomain(u.wiki), page: String(u.page || ''), ns: Number(u.ns) }))
      .filter((u) => u.page);
  }
  return { files, usage, capped };
}

// Parse + validate relay query params; returns { ok, error?, params }.
function parsePetscanParams(url) {
  const clamp = (v, lo, hi, def) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : def;
  };
  const cats = String(url.searchParams.get('cats') || '').trim();
  if (!cats) return { ok: false, error: 'cats is required' };
  return {
    ok: true,
    params: {
      cats,
      depth: clamp(url.searchParams.get('depth'), 0, 12, 0),
      negcats: String(url.searchParams.get('negcats') || ''),
      negdepth: clamp(url.searchParams.get('negdepth'), 0, 12, 0),
      budget: clamp(url.searchParams.get('budget'), 1, PETSCAN_BUDGET_MAX, 500),
    },
  };
}

// Fetch PetScan with timeout + one retry, enforcing a byte cap. Returns
// { truncated } when the response exceeds the cap (caller falls back).
async function fetchPetscanBounded(petscanUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PETSCAN_TIMEOUT_MS);
  try {
    const r = await fetch(petscanUrl, { signal: ctrl.signal, headers: { 'User-Agent': PETSCAN_UA } });
    const len = Number(r.headers.get('content-length') || 0);
    if (len > PETSCAN_MAX_BYTES) return { truncated: true };
    const text = await r.text();
    if (!r.ok) throw new Error(`PetScan HTTP ${r.status}`);
    if (text.length > PETSCAN_MAX_BYTES) return { truncated: true };
    return { text };
  } finally {
    clearTimeout(timer);
  }
}

const json = (res, status, obj, extra = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(obj));
};
const logAsk = (ip, prompt, n, ms, cached, err) => console.log(JSON.stringify({
  ev: 'ask', ts: new Date().toISOString(), ip: sha(ip).slice(0, 12), plen: String(prompt).length, n, ms, cached: !!cached, err: err || null,
}));

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // ── /api/resolve: expand short URLs (w.wiki) to their final target ──
    // The browser can't follow w.wiki redirects (the target page sends no CORS
    // headers), so this endpoint follows the redirect server-side and returns
    // the final URL. The client then fetches via the Action API / direct fetch.
    if (url.pathname === '/api/resolve') {
      const target = url.searchParams.get('url') || '';
      if (!/^https:\/\//i.test(target)) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'url must be an absolute https:// URL' }));
        return;
      }
      try {
        const r = await fetch(target, { redirect: 'follow' });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ url: r.url || target, status: r.status }));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: `resolve failed: ${e.message}` }));
      }
      return;
    }

    // ── /api/proxy: CORS-enabled fetch proxy (https GET only) ──
    // Some data sources send no CORS headers (e.g. top.hatnote.com), so the
    // browser can't fetch them directly. This endpoint fetches server-side and
    // returns { status, body } wrapped in JSON with ACAO: * so the app (or any
    // origin) can read it. Read-only, https-only.
    if (url.pathname === '/api/proxy') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'GET only' }));
        return;
      }
      const target = url.searchParams.get('url') || '';
      if (!/^https:\/\//i.test(target)) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'url must be an absolute https:// URL' }));
        return;
      }
      try {
        const r = await fetch(target, {
          redirect: 'follow',
          headers: { 'User-Agent': 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado) proxy' },
        });
        const body = await r.text();
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ status: r.status, url: r.url || target, body }));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: `proxy fetch failed: ${e.message}` }));
      }
      return;
    }

    // ── /api/petscan: capped PetScan relay (ISSUE-46, GLAM widget) ──
    // Server-side only (PetScan quick-intersection ignores max; budget + byte
    // caps live here). Returns the normalized { source, files, usage, capped,
    // truncated } shape the widget's fetchGlamStats consumes.
    if (url.pathname === '/api/petscan') {
      const origin = req.headers.origin;
      if (origin && !ASK_ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: 'origin not allowed' });
      const ip = ipOf(req);
      const wait = rlLimit(ip, 20, 300, 5000); // protect a shared community service
      if (wait) return json(res, 429, { error: 'too many requests — try again shortly', retryAfterSeconds: wait }, { 'Retry-After': String(wait) });
      const parsed = parsePetscanParams(url);
      if (!parsed.ok) return json(res, 400, { error: parsed.error });
      const { cats, depth, negcats, negdepth, budget } = parsed.params;
      try {
        const fetched = await fetchPetscanBounded(buildPetscanUrl({ cats, depth, negcats, negdepth, budget }));
        if (fetched.truncated) return json(res, 200, { source: 'petscan', files: [], usage: {}, capped: true, truncated: true });
        const d = JSON.parse(fetched.text);
        if (!d || typeof d !== 'object') throw new Error('PetScan returned non-object JSON');
        const { files, usage, capped } = normalizePetscanPages(d.pages, budget);
        return json(res, 200, { source: 'petscan', files, usage, capped, truncated: false });
      } catch (e) {
        return json(res, 502, { error: `petscan failed: ${e.message}` });
      }
    }

    // ── /api/wayback-gallery: batch Wayback snapshot lookup ──
    // Server-side aggregation: the availability API's flakiness from
    // browsers is CORS-specific (intermittent missing ACAO) — server-side
    // it is reliable; the empty-`{}` bug case leaks the capture in the
    // `memento-location` response header, which we recover. CDX (the
    // authoritative index) is a second pass and can be 503-flaky, so it
    // degrades gracefully. In-memory TTL cache (10 min) by url|dates|tol.
    if (url.pathname === '/api/wayback-gallery') {
      const target = url.searchParams.get('url') || '';
      const datesRaw = (url.searchParams.get('dates') || '').split(',').map((d) => d.trim()).filter(Boolean);
      const tolerance = Math.max(parseInt(url.searchParams.get('tolerance')) || 30, 1);
      const clean = target.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      if (!clean || !datesRaw.length || datesRaw.length > 24) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'url and 1-24 dates (YYYY-MM-DD) required' }));
        return;
      }
      const dates = datesRaw.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
      if (!dates.length) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'dates must be YYYY-MM-DD' }));
        return;
      }
      const force = url.searchParams.get('force') === '1';
      const cacheKey = `${clean}|${dates.join(',')}|${tolerance}`;
      const hit = force ? null : waybackCacheGet(cacheKey);
      if (hit) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(hit));
        return;
      }
      const WB_UA = 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado) wayback-gallery';
      // The availability API is URL-form sensitive: `nytimes.com` returns {} while
      // `www.nytimes.com` finds the capture — same site, and the miss is the slower path
      // (measured 6.2 s vs 2.6 s on 2026-09-11, docs/WAYBACK-REPLAY-LATENCY.md). Ask both forms
      // and remember which one matched: replaying the wrong form is a 404 tile.
      const variants = (() => {
        const [host, ...rest] = clean.split('/');
        const tail = rest.length ? `/${rest.join('/')}` : '';
        return /^www\./i.test(host) ? [clean, host.replace(/^www\./i, '') + tail] : [clean, `www.${clean}`];
      })();
      const day = 86400000;
      const rowFor = (date, capTs, status, via, original, matchUrl) => {
        const captureDate = `${capTs.slice(0, 4)}-${capTs.slice(4, 6)}-${capTs.slice(6, 8)}`;
        const diffDays = Math.round(Math.abs((new Date(captureDate) - new Date(date)) / day));
        const target = matchUrl || clean;
        return {
          date,
          available: true,
          withinTolerance: diffDays <= tolerance,
          diffDays,
          timestamp: capTs,
          captureDate,
          status,
          via,
          matchedUrl: target,
          snapshotUrl: `https://web.archive.org/web/${capTs}/${original || target}`,
          replayUrl: `https://web.archive.org/web/${capTs}id_/${target}`,
        };
      };
      try {
        // Pass 1: availability API per date, trying BOTH URL forms (CORS is irrelevant
        // server-side; timeouts 10 s). Recover the memento-location header when the body
        // omits the capture (the known bug case).
        const availabilityFor = async (date, variant) => {
          const ts = date.replace(/-/g, '');
          const api = `https://archive.org/wayback/available?url=${encodeURIComponent(variant)}&timestamp=${ts}`;
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 10000);
          try {
            const r = await fetch(api, { signal: ctrl.signal, headers: { 'User-Agent': WB_UA } });
            const body = await r.json();
            const closest = body?.archived_snapshots?.closest;
            if (closest && closest.available && /^\d{14}$/.test(String(closest.timestamp))) {
              return rowFor(date, String(closest.timestamp), closest.status, 'availability', null, variant);
            }
            const memento = r.headers.get('memento-location') || '';
            const mTs = (memento.match(/\/web\/(\d{14})/) || [])[1];
            if (mTs) return rowFor(date, mTs, '200', 'memento', null, variant);
            return null;
          } catch {
            return null;
          } finally {
            clearTimeout(timer);
          }
        };
        // Capture count: the sparkline endpoint the IA calendar itself uses (0.65-6 s,
        // ~2 kB). Best effort and *concurrent* with pass 1, so it never delays a tile — it
        // exists so a miss can say "the archive has 12,480 captures" instead of implying the
        // archive is empty.
        const countPromise = (async () => {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 3500);
          try {
            const spark = `https://web.archive.org/__wb/sparkline?output=json&url=${encodeURIComponent(clean)}&collection=web`;
            const r = await fetch(spark, { signal: ctrl.signal, headers: { 'User-Agent': WB_UA } });
            const body = await r.json();
            const years = body?.years || {};
            return Object.values(years).reduce(
              (sum, months) => sum + (Array.isArray(months) ? months.reduce((s, n) => s + (Number(n) || 0), 0) : 0), 0);
          } catch {
            return 0;
          } finally {
            clearTimeout(timer);
          }
        })();
        const [rows, captureCount] = await Promise.all([
          Promise.all(dates.map(async (date) => {
            for (const variant of variants) {
              const hit = await availabilityFor(date, variant);
              if (hit) return hit;
            }
            return { date, available: false };
          })),
          countPromise,
        ]);
        // Fallback passes are time-boxed. The archive's own index latency dominates — its
        // Server-Timing header reported cdx.remote at 7.8 s / 16.4 s / 66.2 s on three comparable
        // captures — so a total miss must not become a minute of stacked retries. Measured before
        // this budget: 74 s for a URL with nothing in the index.
        const FALLBACK_BUDGET_MS = Number(process.env.WIKIBENTO_WAYBACK_BUDGET_MS) || 20000;
        const fallbackStart = Date.now();
        const budgetLeft = () => FALLBACK_BUDGET_MS - (Date.now() - fallbackStart);
        const timedFetch = async (u, capMs) => {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), Math.max(3000, Math.min(capMs, budgetLeft())));
          try {
            return await fetch(u, { signal: ctrl.signal, headers: { 'User-Agent': WB_UA } });
          } finally {
            clearTimeout(timer);
          }
        };
        const misses = rows.filter((r) => !r.available);
        let cdxRan = false;
        if (misses.length && budgetLeft() > 0) {
          try {
            const ms = dates.map((d) => new Date(d).getTime());
            const from = new Date(Math.min(...ms) - tolerance * day).toISOString().slice(0, 10).replace(/-/g, '');
            const to = new Date(Math.max(...ms) + tolerance * day).toISOString().slice(0, 10).replace(/-/g, '');
            // ONE query for all misses. Re-measured 2026-09-11: the wide span took 20.8 s here,
            // while six narrow per-date windows for the same dates took 11.8-53.5 s — narrower is
            // not reliably cheaper, so the extra query fan-out was not justified.
            for (const variant of variants) {
              if (budgetLeft() <= 0) break;
              const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(variant)}&from=${from}&to=${to}&output=json&fl=timestamp,original,statuscode&collapse=timestamp:6&filter=statuscode:200&limit=10000`;
              let cdxRows = null;
              let definitiveEmpty = false;
              for (let attempt = 0; attempt < 2 && !cdxRows && !definitiveEmpty && budgetLeft() > 0; attempt++) {
                try {
                  const r = await timedFetch(cdx, 25000);
                  const text = await r.text();
                  if (r.ok) {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) {
                      cdxRan = true;
                      if (parsed.length >= 2) cdxRows = parsed;
                      // An empty array is an ANSWER, not a failure: this URL is not in the index
                      // for this window. Marking it lets the card say "no captures on record"
                      // with confidence instead of "lookup failed — retry".
                      else definitiveEmpty = true;
                    }
                  }
                } catch { /* retry below */ }
                if (!cdxRows && !definitiveEmpty && attempt === 0 && budgetLeft() > 2000) {
                  await new Promise((r2) => setTimeout(r2, 800));
                }
              }
              if (cdxRows) {
                const cols = cdxRows[0];
                const iTs = cols.indexOf('timestamp');
                const iOrig = cols.indexOf('original');
                const iSt = cols.indexOf('statuscode');
                for (const miss of misses) {
                  if (miss.available) continue;
                  const targetMs = new Date(miss.date).getTime();
                  let best = null;
                  for (let row = 1; row < cdxRows.length; row++) {
                    const capTs = String(cdxRows[row][iTs] || '');
                    if (!/^\d{14}$/.test(capTs)) continue;
                    const d = Math.round(Math.abs((new Date(capTs.slice(0, 4), capTs.slice(4, 6) - 1, capTs.slice(6, 8)) - targetMs) / day));
                    if (!best || d < best.diffDays) {
                      best = { capTs, original: cdxRows[row][iOrig], status: cdxRows[row][iSt], diffDays: d };
                    }
                  }
                  if (best) Object.assign(miss, rowFor(miss.date, best.capTs, best.status, 'cdx', best.original, variant));
                }
                break;
              }
              if (definitiveEmpty) {
                for (const miss of misses) if (!miss.available) miss.provenAbsent = true;
                break;
              }
            }
          } catch { /* CDX entirely down — misses stay unavailable */ }
        }
        // Misses the index never answered for are FAILURES (retry-worthy), not absences.
        for (const miss of misses) {
          if (!miss.available && !miss.provenAbsent) miss.lookupFailed = true;
        }
        // Pass 3: per-miss timemap JSON queries (replay-cluster backend — healthy even when the
        // CDX index 503s; same columnar shape). Only for misses the index did not definitively
        // answer, and only while the budget lasts; both URL forms.
        for (const miss of misses) {
          if (miss.available || miss.provenAbsent || budgetLeft() <= 0) continue;
          const from = new Date(new Date(miss.date).getTime() - tolerance * day).toISOString().slice(0, 10).replace(/-/g, '');
          const to = new Date(new Date(miss.date).getTime() + tolerance * day).toISOString().slice(0, 10).replace(/-/g, '');
          for (const variant of variants) {
            if (budgetLeft() <= 0) break;
            try {
              const tm = `https://web.archive.org/web/timemap/json?url=${encodeURIComponent(variant)}&from=${from}&to=${to}`;
              const r = await timedFetch(tm, 15000);
              const text = await r.text();
              if (r.ok) {
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed) && parsed.length >= 2) {
                  const targetMs = new Date(miss.date).getTime();
                  let best = null;
                  for (let row = 1; row < parsed.length; row++) {
                    const capTs = String(parsed[row][1] || '');
                    const st = String(parsed[row][4] || '');
                    if (!/^\d{14}$/.test(capTs) || st !== '200') continue;
                    const d = Math.round(Math.abs((new Date(capTs.slice(0, 4), capTs.slice(4, 6) - 1, capTs.slice(6, 8)) - targetMs) / day));
                    if (!best || d < best.diffDays) best = { capTs, original: parsed[row][2], status: st, diffDays: d };
                  }
                  if (best) {
                    Object.assign(miss, rowFor(miss.date, best.capTs, best.status, 'timemap', best.original, variant));
                    break;
                  }
                }
              }
            } catch { /* timemap down too — this form is a dead end */ }
          }
        }
        const payload = { url: clean, rows, batch: true, captureCount, variants };
        if (rows.some((r) => r.available)) waybackCacheSet(cacheKey, payload, 10 * 60 * 1000);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(payload));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: `wayback lookup failed: ${e.message}` }));
      }
      return;
    }

    // ── /api/ask/session: short-lived HMAC control token ──
    if (url.pathname === '/api/ask/session') {
      const origin = req.headers.origin;
      if (origin && !ASK_ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: 'origin not allowed' });
      if (ASK_DISABLED) return json(res, 503, { error: 'Ask is disabled' });
      const ip = ipOf(req);
      const wait = rlLimit(ip, 30, 600, 10000);
      if (wait) return json(res, 429, { error: 'too many session requests', retryAfterSeconds: wait }, { 'Retry-After': String(wait) });
      return json(res, 200, { token: issueToken(ip), expiresIn: 1800 });
    }

    // ── /api/ask: intent → widget recommendations (narrow-function relay) ──
    if (url.pathname === '/api/ask') {
      const origin = req.headers.origin;
      if (origin && !ASK_ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: 'origin not allowed' });
      if (ASK_DISABLED) return json(res, 503, { error: 'Ask is disabled' });
      const ip = ipOf(req);
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'invalid JSON body' }); }
      const prompt = String(body?.prompt || '').trim();
      if (!prompt) return json(res, 400, { error: 'prompt is required' });
      if (prompt.length > ASK_MAX_PROMPT) return json(res, 400, { error: `prompt too long (max ${ASK_MAX_PROMPT} chars)` });
      if (!verifyToken(body?.token, ip)) return json(res, 401, { error: 'invalid or expired session token' });
      const wait = rlLimit(ip, 10, 60, 500);
      if (wait) return json(res, 429, { error: 'Ask rate limit reached — try again in a moment', retryAfterSeconds: wait }, { 'Retry-After': String(wait) });
      const manifest = await getManifest();
      if (!manifest) return json(res, 503, { error: 'Ask is not configured (widget manifest missing)' });
      const defs = manifestIds(manifest);
      const mode = body?.mode === 'board' ? 'board' : 'suggest';
      const cacheKey = sha(`${mode}|${prompt}|${manifest.version}`);
      const hit = askCacheGet(cacheKey);
      if (hit) {
        logAsk(ip, prompt, hit.options?.length ?? hit.board?.widgets?.length ?? 0, 0, true);
        return json(res, 200, { ...hit, cached: true });
      }
      const t0 = Date.now();
      const system = ASK_SYSTEM(manifest) + askManual(manifest) + (mode === 'board' ? ASK_ASSEMBLY_MANUAL + ASK_RULES_BOARD + ASK_VALUE_RULES : ASK_RULES);
      let content = null;
      try {
        content = await callLlm(ASK_MODEL, system, prompt);
      } catch {
        try { content = await callLlm(ASK_FALLBACK_MODEL, system, prompt); }
        catch (e2) { logAsk(ip, prompt, 0, Date.now() - t0, false, e2.message); return json(res, 502, { error: 'Ask service unavailable — try again in a moment' }); }
      }
      let parsed = null;
      try { parsed = JSON.parse(content); } catch { /* non-JSON reply → no valid options */ }
      const payload = { model: ASK_MODEL, manifestVersion: manifest.version };
      if (mode === 'board') {
        const board = validateAssembly(parsed, defs);
        payload.board = board;
        payload.options = []; // uniform shape for the legacy client path
      } else {
        payload.options = validateOptions(parsed, defs);
      }
      askCacheSet(cacheKey, payload);
      logAsk(ip, prompt, payload.options.length, Date.now() - t0, false);
      return json(res, 200, { ...payload, cached: false });
    }

    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = resolve(join(ROOT, pathname));
    // Prevent directory traversal
    if (!filePath.startsWith(ROOT + '/')) {
      res.writeHead(403, { 'Cache-Control': 'no-store' });
      res.end('Forbidden');
      return;
    }
    const data = await readFile(filePath);
    const immutable = pathname.startsWith('/assets/');
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      'Content-Length': data.length,
      // Assets are content-hashed → cache hard. index.html must always
      // revalidate so new builds propagate (old hashed bundles get deleted
      // on rsync --delete; a stale index.html would 404 on them).
      'Cache-Control': immutable
        ? 'public, max-age=604800, immutable'
        : pathname === '/index.html'
          ? 'no-cache'
          : 'public, max-age=3600',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Cache-Control': 'no-store' });
    res.end('Not found');
  }
});

// WIKIBENTO_TEST=1 (set by npm test) skips listen so tests can import helpers.
if (!process.env.WIKIBENTO_TEST) {
  server.listen(PORT, () => console.log(`WikiBento serving dist/ on port ${PORT}`));
}

export { normalizeConfig, validateOptions, validateAssembly, manifestIds, ASK_SYSTEM, askManual, ASK_RULES, ASK_RULES_BOARD, ASK_ASSEMBLY_MANUAL, buildPetscanUrl, wikiDbToDomain, normalizePetscanPages, parsePetscanParams };
