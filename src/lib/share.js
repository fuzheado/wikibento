/**
 * URL-based dashboard loading & sharing.
 *
 * Two mechanisms:
 *   ?config=<url>   — fetch a hosted dashboard.json. Wiki page URLs
 *                     (*.wikipedia.org / *.wikimedia.org / …) are fetched via
 *                     the Action API (CORS-enabled); any other URL needs the
 *                     host to send CORS headers (raw.githubusercontent.com,
 *                     Toolforge tools, etc.).
 *   #/d/<base64url> — the full dashboard config embedded in the URL hash
 *                     (self-contained link; no hosting needed).
 */

import { fetchTextWithRetry } from './httpRetry';

const WIKI_HOST_RE = /(wikipedia|wikimedia|wiktionary|wikisource|wikiquote|wikibooks|wikiversity|wikinews|wikivoyage|wikispecies)\.org$/;

/** Bare w.wiki/XXXX (no scheme) — the Wikimedia URL shortener. */
const WWIKI_BARE_RE = /^w\.wiki\//i;

/** UTF-8-safe base64url (no + / or padding — URL-safe). */
export function encodeDashboardHash(json) {
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode a #/d/<base64url> hash payload back to a JSON string. */
export function decodeDashboardHash(hash) {
  const b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

/** Build the self-contained share link for the current dashboard. */
export function buildShareLink(json) {
  return `${window.location.origin}${window.location.pathname}#/d/${encodeDashboardHash(json)}`;
}

/** Presentation-mode params (ISSUE-18): ?lean=1 is chrome-free, ?kiosk=1 adds
 *  a fullscreen attempt. `lean` is the param a *scanned* link should carry. */
export const LEAN_PARAM = 'lean';
export const KIOSK_PARAM = 'kiosk';

/**
 * Normalize a share URL to an explicit presentation mode.
 *
 * `mode: 'lean'` → `?lean=1` (no editor chrome, no fullscreen); `mode: 'full'`
 * → neither present-mode param. Both modes strip any `?lean`/`?kiosk` already
 * on the URL, so sharing is explicit rather than accidental: the presenter's
 * own mode must not leak into the link, and a `full` link must never drop the
 * recipient into a presentation mode.
 *
 * `kiosk` is deliberately never encoded: the fullscreen request requires a user
 * gesture and the `?kiosk=1` boot path must not attempt it (see App.jsx), so a
 * scanned link could not honour it — lean is the honest target for a QR.
 */
export function presentModeUrl(url, mode) {
  const u = new URL(url);
  u.searchParams.delete(KIOSK_PARAM);
  u.searchParams.delete(LEAN_PARAM);
  if (mode === 'lean') u.searchParams.set(LEAN_PARAM, '1');
  return u.toString();
}

/** Pull a ?config= URL (decoded) from the current query string, if any. */
export function readConfigParam() {
  const v = new URLSearchParams(window.location.search).get('config');
  return v && v.trim() ? v.trim() : null;
}

/** Pull a #/d/<base64url> payload from the current hash, if any. */
export function readHashConfig() {
  const m = window.location.hash.match(/^#\/d\/([A-Za-z0-9_-]+)$/);
  return m ? m[1] : null;
}

/**
 * Fetch a remote dashboard config as text.
 * Wiki page URLs go through the Action API (parse → wikitext) which is
 * CORS-enabled; other URLs are fetched directly (host must allow CORS).
 * w.wiki short URLs are expanded via the same-origin /api/resolve endpoint
 * (deploy/server.js) when available, since browsers can't follow the redirect
 * (the target page sends no CORS headers).
 */
/** Friendly HTTP failure for a config URL — a 404 is almost always a wrong
 *  path (or a file that hasn't been deployed), not a server fault. */
function httpError(status, href, rawUrl) {
  return status === 404
    ? `config not found (HTTP 404) — check the ?config= path: ${href || rawUrl}`
    : `Fetch failed: HTTP ${status} for ${rawUrl}`;
}

/** True when a fetched config response is actually an HTML document (SPA
 *  fallback or error page) rather than JSON — the classic "missing file on the
 *  dev server" case, which otherwise surfaces as "Unexpected token '<'". */
export function looksLikeHtml(text) {
  return /^\s*(<!doctype\s+html[\s>]|<\/?html[\s>])/i.test(String(text ?? ''));
}

export async function fetchRemoteConfig(url) {
  // Bare w.wiki/XXXX (no scheme) → https://w.wiki/XXXX
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && WWIKI_BARE_RE.test(url)) {
    url = `https://${url}`;
  }
  let u = new URL(url, window.location.origin); // relative paths resolve against the app origin

  // w.wiki short URL → ask the same-origin resolver for the final target.
  if (u.hostname === 'w.wiki') {
    const resolved = await resolveShortUrl(u.href);
    if (resolved) {
      u = new URL(resolved, window.location.origin);
    } else {
      // No resolver (plain static host): try the browser fetch directly —
      // works only when the redirect target sends CORS headers.
      const resp = await fetch(u);
      if (!resp.ok) throw new Error(httpError(resp.status, u.href, url));
      const text = await resp.text();
      if (looksLikeHtml(text)) {
        throw new Error(`the URL returned an HTML page, not JSON — the config file probably doesn't exist (HTTP ${resp.status}) or the path is wrong: ${u.href}`);
      }
      return text;
    }
  }

  if (WIKI_HOST_RE.test(u.hostname)) return fetchWikiPageText(u);
  const resp = await fetch(u);
  if (!resp.ok) throw new Error(httpError(resp.status, u.href, url));
  const text = await resp.text();
  if (looksLikeHtml(text)) {
    throw new Error(`the URL returned an HTML page, not JSON — the config file probably doesn't exist (HTTP ${resp.status}) or the path is wrong: ${u.href}`);
  }
  return text;
}

/** Resolve a short URL to its final target via the same-origin resolver.
 *  Returns null when the resolver isn't available (e.g. plain static host). */
async function resolveShortUrl(shortUrl) {
  try {
    const api = new URL('/api/resolve', window.location.origin);
    api.searchParams.set('url', shortUrl);
    const resp = await fetch(api);
    if (!resp.ok) return null;
    const d = await resp.json();
    return d.url || null;
  } catch {
    return null;
  }
}

/** Fetch the raw wikitext of a wiki page via action=parse (CORS-enabled).
 *  Accepts /wiki/Title and /w/index.php?title=Title URL forms, and strips
 *  <syntaxhighlight>/<pre> wrappers so JSON stored inside wiki markup tags
 *  still parses. */
async function fetchWikiPageText(u) {
  let title = null;
  const m = u.pathname.match(/\/wiki\/(.+)$/);
  if (m) {
    title = decodeURIComponent(m[1]);
  } else if (u.pathname.endsWith('/w/index.php')) {
    title = u.searchParams.get('title');
  }
  if (!title) throw new Error(`Not a wiki page URL: ${u.pathname} (expected /wiki/Page_Title)`);
  const api = new URL('/w/api.php', u.origin);
  api.search = new URLSearchParams({
    action: 'parse',
    page: title,
    prop: 'wikitext',
    format: 'json',
    origin: '*',
  });
  let raw;
  try {
    raw = await fetchTextWithRetry(api.href, { timeoutMs: 15000, retries: 2 });
  } catch (e) {
    throw new Error(`Wiki fetch failed: ${e.message}`);
  }
  if (looksLikeHtml(raw)) throw new Error('Wiki fetch failed: the API returned an HTML page, not JSON');
  const d = JSON.parse(raw);
  let text = d?.parse?.wikitext?.['*'];
  if (text === undefined) throw new Error(d?.error?.info || 'Wiki page not found or not parseable');
  // Strip a single top-level syntaxhighlight/pre wrapper, if present.
  const wrapped = text.match(/^\s*<(?:syntaxhighlight|pre)(?:\s[^>]*)?>([\s\S]*?)<\/(?:syntaxhighlight|pre)>\s*$/);
  if (wrapped) text = wrapped[1];
  return text;
}
