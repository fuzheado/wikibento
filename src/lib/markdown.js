/**
 * Tiny Markdown subset renderer for the Text/Markdown widget.
 *
 * Zero dependencies, escape-first (XSS-safe): input is HTML-escaped before any
 * markup is applied, links are restricted to http(s), and images are https-only
 * with a Wikimedia-host default allowlist (external hosts opt-in per widget).
 *
 * Supported:
 *   # ## ### headings · **bold** · *italic* · `code` · [text](https://…) · ![alt](https://…image)
 *   - bullets · 1. ordered lists · > quotes · --- hr · ``` fenced code blocks
 *   Paragraphs (blank-line separated)
 */

/** Default image allowlist: Wikimedia hosts only (privacy — see below). */
const WIKIMEDIA_IMAGE_HOST = /^https:\/\/([a-z0-9-]+\.)*wikimedia\.org\//;

/**
 * Privacy note: images load from the browser, so the viewer's IP + Referer + UA
 * go to the image host. Wikimedia hosts are fine; arbitrary third-party hosts
 * could be tracking pixels. So: Wikimedia images render by default; other
 * https images render only when the widget's `allowExternalImages` is on.
 */

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline markup on a single line. Escapes first — XSS-safe by construction. */
function inline(text, opts) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  // Images first (so ![alt](url) isn't eaten by the link rule), https only.
  s = s.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,
    (m, alt, url) => {
      const img = (opts?.allowExternalImages || WIKIMEDIA_IMAGE_HOST.test(url))
        ? `<img src="${url}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer">`
        : `<span class="markdown-img-blocked" title="Image not loaded: only Wikimedia-hosted images render by default. Enable 'Allow external images' in this widget's ⚙ settings.">🖼️ ${alt || 'external image blocked'}</span>`;
      return img;
    }
  );
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return s;
}

/** Render a Markdown string to HTML (safe for dangerouslySetInnerHTML). */
export function renderMarkdown(src, opts = {}) {
  if (!src) return '';
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let para = [];
  let i = 0;

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.map(line => inline(line, opts)).join('\n')}</p>`);
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    // Fenced code block
    if (/^```/.test(t)) {
      flushPara();
      const lang = t.slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i++;
      }
      i++; // closing fence
      const cls = lang ? ` class="lang-${escapeHtml(lang)}"` : '';
      out.push(`<pre><code${cls}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    // Heading (1-4 levels)
    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) {
      flushPara();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2], opts)}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushPara();
      out.push('<hr>');
      i++;
      continue;
    }

    // Blockquote (single level)
    if (/^>\s?/.test(t)) {
      flushPara();
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${quote.map(l => inline(l, opts)).join('\n')}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(t)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(/^[-*]\s+/, ''), opts)}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(t)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(/^\d+\.\s+/, ''), opts)}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Blank line → paragraph break
    if (t === '') {
      flushPara();
      i++;
      continue;
    }

    para.push(t);
    i++;
  }
  flushPara();
  return out.join('\n');
}
