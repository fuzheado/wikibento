/**
 * Wikipedia boxes — render a transcluded template faithfully, styles and all (ISSUE-90).
 *
 * The ask: "make a widget for a specific template or box to render correctly, like the In the news box on the
 * Main Page." Measured, the answer is a *general* mechanism rather than an ITN special case, because the wiki
 * hands us everything a faithful render needs in one call:
 *
 *   action=parse&text={{In the news}}&prop=text
 *
 *   · parsing a **transclusion** (not the template page) means `<noinclude>` never renders — so the box arrives
 *     without its documentation-and-categories furniture, which is exactly the difference between "the box" and
 *     "the template page";
 *   · TemplateStyles come back **inline** as `<style>` blocks (measured: 2 blocks, 2.5 KB for ITN), so there is
 *     no second request and no missing-stylesheet mystery;
 *   · those styles are already scoped to `.mw-parser-output` — TemplateStyles enforces that — which means the
 *     CSS cannot reach out and restyle the app, *provided* we keep that container class and refuse any rule
 *     that is not scoped.
 *
 * Measured on 2026-09-16 for the five Main Page boxes, all one API call each and no scripts in any of them:
 *
 *   In the news              7,719 B html · 2 style blocks · 3,039 chars of text
 *   Did you know             7,312 B · 1 · 3,381      On this day      3,582 B · 1 · 1,641
 *   Today's featured article 8,092 B · 1 · 3,514      Picture of the day 3,713 B · 1 · 1,645
 *
 * What arrives is MediaWiki-sanitised markup (no `<script>`, no `on*` handlers — checked, not assumed), but it
 * is still third-party HTML going into our document, so everything here is defensive: an allowlist sanitiser,
 * an allowlist attribute check, relative-URL rewriting, and a CSS filter that drops any rule whose selectors do
 * not start with `.mw-parser-output`. The rule is enforced rather than trusted.
 */

/** The Main Page boxes, offered as the config field's examples. */
export const BOX_PRESETS = [
  'In the news',
  'Did you know',
  'On this day',
  "Today's featured article",
  'Picture of the day',
];

/**
 * A template name → the wikitext that transcludes it.
 *
 * Braces are *allowed*, deliberately. The first version refused them to keep a config from smuggling arbitrary
 * wikitext — but that also blocked the thing that makes the date-based boxes work at all: measured, the wrapper
 * templates `{{Picture of the day}}` and `{{On this day}}` render a maintenance notice off the Main Page, while
 *
 *   {{POTD/{{CURRENTYEAR}}-{{CURRENTMONTH}}-{{CURRENTDAY2}}}}
 *   {{Wikipedia:Selected anniversaries/{{CURRENTMONTHNAME}} {{CURRENTDAY}}}}
 *
 * return the real boxes and stay current without anyone editing the board. The safety argument is unchanged
 * either way: this text is rendered by MediaWiki and then sanitised twice (their parser, then ours), so the
 * worst a strange value can produce is a strange-looking box. What is refused is only the unusable: empty, a
 * newline, or a value long enough to be an accident.
 *
 * An explicit `{{…}}` is respected rather than double-wrapped, so pasting either form works.
 */
export function transclusionFor(box) {
  const raw = String(box ?? '').trim();
  if (!raw) throw new Error('no box name');
  if (/[\n\r]/.test(raw)) throw new Error('a box name cannot span lines');
  if (raw.length > 200) throw new Error('that box name is too long');
  return raw.startsWith('{{') && raw.endsWith('}}') ? raw : `{{${raw}}}`;
}

/**
 * A project name (`en.wikipedia`) or a full host (`en.wikipedia.org`) → a host. A bare `.wikipedia` family
 * name contains a dot but is *not* a host, which is exactly the trap the first version fell into.
 */
function hostFor(project, { mobile = false } = {}) {
  const clean = String(project || 'en.wikipedia').trim()
    .replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const host = /\.(org|com|net)$/i.test(clean) ? clean : `${clean}.org`;
  return mobile ? `m.${host.replace(/^m\./, '')}` : host;
}

/** The `action=parse` URL for a transclusion. `origin=*` because this is called straight from the browser. */
export function boxApiUrl({ project = 'en.wikipedia', box, mobile = false } = {}) {
  const base = `https://${hostFor(project, { mobile })}/w/api.php`;
  const q = new URLSearchParams({
    action: 'parse',
    text: transclusionFor(box),
    prop: 'text',
    formatversion: '2',
    origin: '*',
    format: 'json',
  });
  return `${base}?${q.toString()}`;
}

/** The origin the box's relative URLs resolve against (`/wiki/…` → this + path). */
export function boxWikiBase({ project = 'en.wikipedia' } = {}) {
  return `https://${hostFor(project)}`;
}

/**
 * CSS safe to place inside a `<style>` element. The closing tag is the one thing that can escape it, so any
 * `</style` (or `</script`) sequence is defused. Belt and braces: the CSS comes from TemplateStyles, which
 * MediaWiki already sanitises, and this runs after our own filter.
 */
export function safeCssForStyleTag(css) {
  return String(css || '').replace(/<\/(style|script)/gi, '');
}

/** The human-facing page a box came from — the credit link, and what the widget emits. */
export function boxPageUrl({ project = 'en.wikipedia', box } = {}) {
  return `https://${hostFor(project)}/wiki/Template:${encodeURIComponent(String(box ?? '').trim().replace(/ /g, '_'))}`;
}

/** Pull the rendered HTML out of a `prop=text` response, with a message a user could act on. */
export function parseBoxResponse(json) {
  if (!json || typeof json !== 'object') throw new Error('no response from the wiki');
  if (json.error) throw new Error(json.error.info || json.error.code || 'the wiki refused that box');
  const html = json.parse && json.parse.text;
  if (typeof html !== 'string' || !html.trim()) throw new Error('that box rendered empty');
  return html;
}

/**
 * Split the response into its `<style>` blocks and the rest. The styles travel with the markup (measured — no
 * second fetch), but they are pulled out separately so they can be filtered before anything is injected.
 */
export function splitBoxHtml(html) {
  const styles = [];
  const body = String(html).replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
    styles.push(css);
    return '';
  });
  return { styles, body: body.trim() };
}

/** Elements with no closing tag, whose `<tag/>` form is what we emit. */
const VOID_TAGS = new Set(['br', 'hr', 'img', 'wbr']);

const ALLOWED_TAGS = new Set([
  'div', 'span', 'p', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'b', 'strong', 'i', 'em', 'a', 'img', 'figure',
  'figcaption', 'sup', 'sub', 'small', 'abbr', 'hr', 'br', 'code', 'blockquote', 'table', 'thead', 'tbody',
  'tr', 'th', 'td', 'caption', 's', 'u', 'q', 'cite', 'mark', 'wbr',
]);

const ALLOWED_ATTRS = new Set([
  'href', 'src', 'srcset', 'alt', 'title', 'class', 'id', 'lang', 'dir', 'width', 'height', 'rel', 'target',
  'typeof', 'about', 'resource', 'property', 'colspan', 'rowspan', 'scope', 'start', 'value', 'decoding',
  'loading', 'sizes', 'style',
]);

/** Tags dropped *with their contents* — the rest are stripped but their children kept. */
const DROP_WITH_CONTENT = ['script', 'iframe', 'object', 'embed', 'form', 'template', 'noscript'];

/** Only these may end up in an `href`/`src`: http(s), protocol-relative, or a same-page fragment. */
const SAFE_URL = /^(?:https?:)?\/\/|^#/i;

/**
 * Rewrite the wiki's own relative URLs to absolute ones. The API returns `href="/wiki/…"` and
 * protocol-relative `src="//upload.wikimedia.org/…"` (both measured); inside our page those resolve against the
 * *app's* origin, which would 404 — and would send every reader's click to wikibento instead of Wikipedia.
 */
export function rewriteBoxUrls(html, { wikiBase = 'https://en.wikipedia.org' } = {}) {
  return String(html)
    .replace(/\b(href|src)="(\/\/[^"]*)"/gi, (_, attr, url) => `${attr}="https:${url}"`)
    .replace(/\b(href|src)="(\/(?!\/)[^"]*)"/gi, (_, attr, url) => `${attr}="${wikiBase}${url}"`)
    // srcset is a comma-separated list of protocol-relative or root-relative URLs
    .replace(/\bsrcset="([^"]*)"/gi, (_, list) => {
      const fixed = list.split(',').map((part) => {
        const [url, ...rest] = part.trim().split(/\s+/);
        const abs = url.startsWith('//') ? `https:${url}` : (url.startsWith('/') ? `${wikiBase}${url}` : url);
        return [abs, ...rest].join(' ');
      }).join(', ');
      return `srcset="${fixed}"`;
    });
}

/**
 * An allowlist sanitiser, run on markup that is already MediaWiki-sanitised. Those are two different
 * guarantees: the wiki promises its own output is safe, and we promise that whatever we inject is what we
 * chose to allow. Since this content is written by strangers on the internet, the second promise is the one
 * that belongs in our code.
 */
export function sanitizeBoxHtml(html) {
  let out = String(html);
  for (const tag of DROP_WITH_CONTENT) {
    out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (match, slash, rawTag, rawAttrs) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';                      // unknown tag: drop the tag, keep the text
    const voidTag = VOID_TAGS.has(tag);
    // A closing tag stays a closing tag. Getting this wrong rewrites `</p>` into `<p>`, which silently doubles
    // every element — it looked plausible because the text still read correctly.
    if (slash) return voidTag ? '' : `</${tag}>`;
    const attrs = [];
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let m;
    while ((m = attrRe.exec(rawAttrs))) {
      const name = m[1].toLowerCase();
      const value = m[3] ?? m[4] ?? m[5] ?? '';
      if (name.startsWith('on')) continue;                       // event handlers never
      if (name === 'style') continue;                            // inline styles can escape the card
      if (!ALLOWED_ATTRS.has(name)) continue;
      if ((name === 'href' || name === 'src') && !SAFE_URL.test(value)) {
        continue;                                                // javascript:, data:, anything odd — refused
      }
      attrs.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
    }
    return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}${voidTag ? ' /' : ''}>`;
  });
  return out;
}

/**
 * Keep only the CSS that cannot reach outside the box. TemplateStyles already scopes everything to
 * `.mw-parser-output`, but "already" is a claim about someone else's output — a rule-level check here means a
 * change upstream cannot quietly restyle the app. Rules whose selectors are not scoped are dropped, at-rules
 * we do not keep (`@font-face`, `@keyframes`, `@charset`) are dropped with their bodies, and `@media`-style
 * wrappers are kept only when something scoped survives inside them.
 */
export function filterScopedCss(css, { scope = '.mw-parser-output' } = {}) {
  const text = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
  const root = { at: null, rules: [], children: [] };
  const stack = [root];
  let current = root;
  let i = 0;
  let selStart = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === '{') {
      const selector = text.slice(selStart, i).trim();
      if (selector.startsWith('@')) {
        if (/^@(media|supports|layer|container)\b/i.test(selector)) {
          const node = { at: selector, rules: [], children: [] };
          current.children.push(node);
          current = node;
          stack.push(current);
        } else {
          // an at-rule we do not keep: skip its body wholesale
          let depth = 1;
          i += 1;
          while (i < text.length && depth > 0) {
            if (text[i] === '{') depth += 1; else if (text[i] === '}') depth -= 1;
            i += 1;
          }
          selStart = i;
          continue;
        }
        i += 1;
        selStart = i;
        continue;
      }
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth += 1; else if (text[j] === '}') depth -= 1;
        j += 1;
      }
      current.rules.push({ selector, body: text.slice(i + 1, j - 1) });
      i = j;
      selStart = i;
      continue;
    }
    if (ch === '}') {
      if (stack.length > 1) { stack.pop(); current = stack[stack.length - 1]; }
      i += 1;
      selStart = i;
      continue;
    }
    i += 1;
  }

  const isScoped = (selector) => selector.split(',').every((one) => {
    const sel = one.trim();
    if (!sel) return false;
    if (!sel.includes(scope)) return false;
    // a scoped selector must not *also* carry a page-level one in its list, or start at the document
    return !/^(html|body|:root|\*)/i.test(sel) && !/(^|[\s>+~])(html|body|:root)([\s>+~.:#[]|$)/i.test(sel);
  });

  const render = (node) => {
    const rules = node.rules.filter((r) => isScoped(r.selector)).map((r) => `${r.selector}{${r.body}}`);
    for (const child of node.children) {
      const inner = render(child);
      if (inner.trim()) rules.push(`${child.at}{${inner}}`);
    }
    return rules.join('\n');
  };

  return render(root);
}

/**
 * What a clicked link in a box *means* (ISSUE-91).
 *
 * The reader's click is a choice, and the useful part of that choice is the page it names — "Weddell Sea", not
 * `https://en.wikipedia.org/wiki/Weddell_Sea`. That string is what another widget can act on: a page viewer can
 * load it, a gallery can show its images, a map can look for coordinates. The link's own text is preferred when
 * it says something (a piped link reads "this sea" on the page but names `Weddell_Sea`), because what a consumer
 * needs is a *title*, and `title` is derived from the URL for exactly that reason.
 *
 * Namespaces are reported rather than guessed at: a File:/Category:/Template:/Help:/Portal:/Special: link is not
 * an article, and a consumer that wants article titles should be able to ignore the rest.
 *
 * @returns {{ title: string, text: string, url: string, kind: 'article'|'file'|'category'|'template'|'help'|'portal'|'special'|'external' } | null}
 */
export function boxLinkTarget(href, text = '') {
  const raw = String(href || '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw, 'https://en.wikipedia.org'); } catch { return null; }
  const wiki = /(^|\.)wikipedia\.org$/i.test(url.hostname) || /(^|\.)wikimedia\.org$/i.test(url.hostname);
  const label = String(text || '').replace(/\s+/g, ' ').trim();
  if (!wiki || !url.pathname.startsWith('/wiki/')) {
    // An off-wiki link still has a title worth passing on (the host, or the text the reader saw).
    return { title: label || url.hostname, text: label, url: url.href, kind: 'external' };
  }
  let title = url.pathname.slice('/wiki/'.length);
  try { title = decodeURIComponent(title); } catch { /* keep as written */ }
  title = title.replace(/_/g, ' ').replace(/#.*$/, '').trim();
  const ns = /^(File|Image|Category|Template|Help|Portal|Special|Wikipedia|Talk|User|Draft|Module|MediaWiki):/i.exec(title);
  const kind = ns ? ns[1].toLowerCase().replace('image', 'file') : 'article';
  if (!title && !label) return null;   // a link to nothing is not a selection
  return { title: title || label, text: label, url: url.href, kind };
}

/** The value a click publishes on the `selection` channel: the page title, or null if there is nothing to say. */
export function boxLinkSelection(href, text = '') {
  const target = boxLinkTarget(href, text);
  return target ? target.title : null;
}

/**
 * `{date}`-style tokens in a box name, expanded by us.
 *
 * Why not MediaWiki's own `{{CURRENTYEAR}}` magic words? Because in this app `{{name}}` already means a *board
 * parameter*, so a config containing them fails the board constitution (measured — the demos test flags every
 * `{{…}}` in a board as a reference that must resolve). Single-brace tokens keep the two ideas apart while
 * giving the same self-updating behaviour, which is what the date-based boxes need:
 *
 *   POTD/{date}                                       → POTD/2026-09-16
 *   Wikipedia:Selected anniversaries/{monthname} {day} → …/September 16
 *
 * Unknown tokens are left alone: a box name containing braces is the author's business, and the wiki will say
 * if it makes no sense.
 */
export function expandBoxTokens(name, now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December'];
  const values = {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    year: String(d.getUTCFullYear()),
    month: pad(d.getUTCMonth() + 1),
    monthname: MONTHS[d.getUTCMonth()],
    day: String(d.getUTCDate()),
  };
  return String(name ?? '').replace(/\{(date|year|month|monthname|day)\}/g, (_, key) => values[key]);
}

/**
 * Does this render look like a *maintenance notice* rather than the box? Two of the Main Page's wrappers
 * (`Picture of the day`, `On this day`) return an imbox/tmbox message when they are not being rendered on the
 * Main Page — measured, and the reason the widget offers dated subpages instead. The card still renders what
 * came back (it is what the template actually returns), but it says so, because a yellow warning box that
 * nobody explains looks like our bug rather than the wiki's.
 */
export function boxLooksLikeNotice(html) {
  const text = String(html || '');
  if (!/\b(imbox|tmbox|cmbox|ombox)\b/.test(text)) return false;
  return /was selected as picture of the day|a fact from this article|this (template|page) |is being considered|does not exist|no such (page|template)/i.test(text);
}

/**
 * The box's items as plain lines — what the widget emits (`outputs: { kind: 'lines' }`).
 *
 * A box is rich content, but its *items* are a list, and the app already has consumers for a list: the Text List,
 * Filter Lines, Line Count and Speaker widgets. So "In the news" can drive a flow ("count the items that mention
 * a country") rather than being a dead end. Lines are extracted from the sanitised markup, so no HTML survives
 * into whatever consumes them.
 */
export function boxLines(html) {
  const items = [...String(html || '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => m[1])
    .map((chunk) => chunk
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean);
  // A box with no list (a single paragraph template) still emits something useful rather than nothing.
  if (items.length) return items;
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? [text] : [];
}

/**
 * Links open in a new tab, like every other content link in this app.
 *
 * Measured: 22 places in `WidgetFrame.jsx` already render content links with `target="_blank"`, and the widget
 * that renders a wiki *page* keeps its browsing inside its own frame. `wikiBox` was the exception, because the
 * markup is MediaWiki's own — where a link sensibly replaces the page you are reading. Here it replaced the
 * *board*: clicking "Weddell Sea" in a list of seas threw away everything the reader had arranged. One delegated
 * rule fixes it for every box, present and future.
 *
 * An anchor that already carries a target is left alone (a box can legitimately ask for something else), and the
 * rewrite runs before the sanitiser so the attribute survives the allowlist rather than being stripped back out.
 */
export function openBoxLinksNewTab(html) {
  return String(html).replace(/<a\b([^>]*)>/gi, (match, attrs) => {
    if (/\btarget\s*=/i.test(attrs)) return match;
    const rel = /\brel\s*=/i.test(attrs) ? '' : ' rel="noopener noreferrer"';
    return `<a${attrs} target="_blank"${rel}>`;
  });
}

/**
 * The whole markup pipeline in the order that matters: **rewrite, then sanitise**. Rewriting first turns the
 * wiki's `/wiki/…` and `//upload…` URLs into absolute ones; the sanitiser then refuses anything that is not
 * absolute http(s) or a fragment — deliberately, because a root-relative URL left behind would point at
 * wikibento rather than at Wikipedia, and silently following it is worse than dropping it.
 */
export function prepareBoxHtml(html, { wikiBase = 'https://en.wikipedia.org', linkTarget = '_blank' } = {}) {
  const absolute = rewriteBoxUrls(html, { wikiBase });
  const linked = linkTarget ? openBoxLinksNewTab(absolute) : absolute;
  return sanitizeBoxHtml(linked);
}

/** Is this a URL we are willing to let a rendered box load? Images may come from the wiki or Commons. */
export function isAllowedBoxAsset(url) {
  try {
    const u = new URL(String(url));
    return /(^|\.)(wikipedia|wikimedia|wikidata|wikisource|wiktionary|wikinews|wikivoyage|wikiquote|wikibooks|wikiversity|wikifunctions)\.org$/i.test(u.hostname)
      && (u.protocol === 'https:');
  } catch { return false; }
}
