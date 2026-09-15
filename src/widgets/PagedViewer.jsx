import { useState, useEffect, useMemo, useRef } from 'react';
import {
  pageImageUrl, canCrop, spreadPairs, spreadOrder, spreadIndexOf, spreadLabel,
  spreadsFit, leafWidth, stripWindow,
} from '../lib/pagedViewer';

/**
 * PagedViewer — read a multi-page document: turn, zoom, jump, search, and **facing pages**.
 *
 * One component for every page source (ISSUE-81 / ISSUE-82). It knows nothing about archives: a source is
 * plain data (see src/lib/pagedViewer.js) and anything that needs the network is injected by the card that
 * wraps it:
 *
 *   <PagedViewer data={data} onSearch={fn} onPageText={fn} />
 *
 *   · `iaBook` (archive.org IIIF) passes the IIIF Content Search and per-canvas OCR fetchers;
 *   · the Commons document reader (ISSUE-82) will pass its own — or null, since a Commons PDF has no text
 *     layer unless Wikisource proofread it.
 *
 * Extracted from IaBookCard once there was a second source on the horizon, deliberately BEFORE facing pages
 * was written: this way the spread rules, the right-to-left case, the strip, the counter and the zoom ladder
 * exist once rather than twice.
 *
 * Three measured traps live here (docs/INTERNET-ARCHIVE.md, docs/DOCUMENT-VIEWER.md):
 *   · a page past the end is not an error — IIIF answers with a blank filler image and Wikimedia CLAMPS
 *     (page 189 of 188 returns page 188), so navigation and the strip clamp to the page count;
 *   · image URLs are templates (`{w}`, `{region}`), never built by hand per source, because a hand-built
 *     URL is what 400'd for a real PDF;
 *   · a right-to-left book shows the LATER leaf on the left, and the counter still reads "pages 4–5".
 */
const PV_WIDTHS = [400, 700, 1000, 1400];

export default function PagedViewer({ data, onSearch = null, onPageText = null }) {
  const pages = (data && data.pages) || [];
  const count = pages.length;
  const labels = useMemo(() => pages.map((p, i) => p.label || String(i + 1)), [pages]);
  const caps = (data && data.caps) || {};
  const direction = (data && data.direction) || 'left-to-right';

  const [page, setPage] = useState(0);
  const [wIdx, setWIdx] = useState(1);
  const [offset, setOffset] = useState(0);
  const [userSpread, setUserSpread] = useState(null);   // null = follow the card's width
  const [width, setWidth] = useState(0);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [text, setText] = useState(null);
  const [textBusy, setTextBusy] = useState(false);
  const stageRef = useRef(null);

  // Two pages need room. The threshold is a viewport property, exactly like the timeline's label slots, so
  // it is measured rather than configured — and a reader's own toggle wins until the widget reloads.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const inSpread = userSpread === null ? (caps.facing !== false && spreadsFit(width)) : userSpread;
  const pairs = useMemo(() => (inSpread ? spreadPairs(count, offset) : pages.map((_, i) => [i])), [inSpread, count, offset]);
  const safe = Math.max(0, Math.min(count - 1, page));
  const spreadIdx = spreadIndexOf(safe, pairs);
  const pair = pairs[spreadIdx] || [];
  const shown = spreadOrder(pair, direction);
  const current = pages[safe] || null;
  const w = leafWidth(PV_WIDTHS[wIdx], inSpread);

  const go = (index) => {
    setSel(null); setText(null);
    setPage(Math.max(0, Math.min(count - 1, index)));
  };
  const step = (delta) => {
    const next = pairs[Math.max(0, Math.min(pairs.length - 1, spreadIdx + delta))] || [];
    if (next.length) go(next[0]);
  };

  const runSearch = async (e) => {
    e.preventDefault();
    if (!onSearch || !q.trim()) return;
    setBusy(true); setProblem('');
    try {
      setHits(await onSearch(q, pages));
    } catch (err) {
      setProblem((err && err.message) || 'Search failed');
      setHits(null);
    } finally { setBusy(false); }
  };

  const toggleText = async () => {
    if (text !== null) { setText(null); return; }
    if (!onPageText || !current || !current.annotationPage) { setProblem('This page has no text'); return; }
    setTextBusy(true); setProblem('');
    try { setText(await onPageText(current, pages)); }
    catch (err) { setProblem((err && err.message) || 'No text for this page'); }
    finally { setTextBusy(false); }
  };

  const links = (data && data.links) || [];
  const head = (
    <div className="pv-head">
      {data && data.href
        ? <a className="pv-title" href={data.href} target="_blank" rel="noreferrer" title={data.title}>{data.title}</a>
        : <span className="pv-title">{data && data.title}</span>}
      {data && data.subtitle && <div className="pv-sub">{data.subtitle}</div>}
    </div>
  );

  // A source with no pages is a normal case (a text-only item, a document whose pages will not render):
  // say so and offer the links rather than showing an empty viewer that looks like a bug.
  if (!count) {
    return (
      <div className="pv-card">
        {head}
        <div className="widget-empty">{(data && data.notice) || 'No page images for this item'}</div>
        {!!links.length && (
          <div className="pv-links">
            {links.map((l) => <a key={l.label} className="pv-link" href={l.href} target="_blank" rel="noreferrer">{l.label} ↗</a>)}
          </div>
        )}
      </div>
    );
  }

  const strip = stripWindow(count, safe, 15);

  return (
    <div className="pv-card">
      {head}
      <div className="pv-toolbar">
        <button className="pv-btn" onClick={() => step(-1)} disabled={spreadIdx === 0} title={inSpread ? 'Previous spread' : 'Previous page'}>◀</button>
        <span className="pv-count">{inSpread ? spreadLabel(labels, pair) : `page ${labels[safe]}`} <span className="pv-of">of {count}</span></span>
        <button className="pv-btn" onClick={() => step(1)} disabled={spreadIdx >= pairs.length - 1} title={inSpread ? 'Next spread' : 'Next page'}>▶</button>
        <span className="pv-zoom">
          <button className="pv-btn" onClick={() => setWIdx(Math.max(0, wIdx - 1))} disabled={wIdx === 0} title="Smaller">−</button>
          <span className="pv-w">{w}px</span>
          <button className="pv-btn" onClick={() => setWIdx(Math.min(PV_WIDTHS.length - 1, wIdx + 1))} disabled={wIdx === PV_WIDTHS.length - 1} title="Larger">+</button>
        </span>
        {caps.facing !== false && (
          <button
            data-pv="facing"
            className={`pv-btn${inSpread ? ' is-on' : ''}`}
            onClick={() => setUserSpread(!inSpread)}
            title={inSpread ? 'One page at a time' : 'Two facing pages'}
            aria-pressed={inSpread}
          >{inSpread ? '▭' : '▭▭'}</button>
        )}
        {inSpread && (
          <button data-pv="shift" className="pv-btn" onClick={() => setOffset(offset === 0 ? 1 : 0)} title={offset === 0 ? 'The first leaf stands alone — click to pair it' : 'The first leaf is paired — click to leave it alone'}>{offset === 0 ? '⇥' : '⇤'}</button>
        )}
        {caps.text && (
          <button data-pv="text" className="pv-btn" onClick={toggleText} disabled={textBusy} title="Show this page's text">¶</button>
        )}
      </div>
      {onSearch && caps.search !== false && (
        <form className="pv-search" onSubmit={runSearch}>
          <input className="pv-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search inside…" aria-label="Search inside this document" />
          <button className="pv-btn" type="submit" disabled={busy}>{busy ? '…' : '🔍'}</button>
        </form>
      )}
      {problem && <div className="pv-problem">{problem}</div>}
      <div className={`pv-stage${inSpread ? ' is-spread' : ''}`} ref={stageRef}>
        {shown.map((idx, i) => (
          <button
            key={idx}
            className={`pv-leaf${inSpread ? (i === 0 ? ' is-left' : ' is-right') : ''}${idx === safe ? ' is-current' : ''}`}
            onClick={() => (inSpread ? go(idx) : undefined)}
            title={inSpread ? `Page ${labels[idx]}` : undefined}
          >
            <img
              className="pv-page"
              src={pageImageUrl(pages[idx], w, idx === safe && sel && sel.region && canCrop(pages[idx]) ? sel.region : undefined)}
              alt={`Page ${labels[idx]}`}
            />
          </button>
        ))}
      </div>
      {sel && (
        <div className="pv-hit">
          <span className="pv-hit-text">“{sel.text}” — page {sel.label}</span>
          {sel.region && canCrop(current) && (
            <img className="pv-hit-crop" src={pageImageUrl(current, 320, sel.region)} alt={`Where “${sel.text}” appears on page ${sel.label}`} />
          )}
        </div>
      )}
      {hits && (
        <div className="pv-hits">
          <div className="pv-hits-head">{hits.length ? `${hits.length} ${hits.length === 1 ? 'hit' : 'hits'}` : 'No hits in this document'}</div>
          {hits.slice(0, 40).map((h, i) => (
            <button key={i} className="pv-hit-row" onClick={() => { go(h.pageIndex >= 0 ? h.pageIndex : safe); setSel(h); }}>
              <span className="pv-hit-page">p. {h.label || '?'}</span>
              <span className="pv-hit-snip">{h.text}</span>
            </button>
          ))}
        </div>
      )}
      {text !== null && <div className="pv-text">{text || '(this page has no text)'}</div>}
      <div className="pv-strip">
        {strip.indices.map((idx) => (
          <button
            key={idx}
            className={`pv-thumb${pair.includes(idx) ? ' is-current' : ''}`}
            onClick={() => go(idx)}
            title={`Page ${labels[idx]}`}
          >
            <img src={pageImageUrl(pages[idx], 70)} alt={`Page ${labels[idx]}`} loading="lazy" />
          </button>
        ))}
      </div>
      {!!links.length && (
        <div className="pv-links">
          {links.map((l) => <a key={l.label} className="pv-link" href={l.href} target="_blank" rel="noreferrer">{l.label} ↗</a>)}
        </div>
      )}
    </div>
  );
}
