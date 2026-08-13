import { WIDGET_TYPES } from '../widgets';

/**
 * About modal — explains what WikiBento is and how to use it.
 */
export default function AboutPanel({ onClose }) {
  return (
    <div className="add-widget-overlay" onClick={onClose}>
      <div className="add-widget-panel about-panel" onClick={e => e.stopPropagation()}>
        <div className="add-widget-header">
          <h3>ⓘ About WikiBento</h3>
          <button className="widget-btn widget-btn-remove" onClick={onClose}>✕</button>
        </div>
        <div className="about-body">
          <h4>What it is</h4>
          <p>
            WikiBento is a drag-and-drop dashboard for Wikimedia — a single board
            for keeping an eye on things and acting on them. Wikimedia's data and
            activity live across many places: pageview and stats APIs, wiki pages,
            recent changes, Commons. WikiBento brings what you care about into one
            place — starting with metrics like article pageviews, external link
            counts, category sizes, file usage, and GLAM-style impact stats, and
            extending to listings and feeds you can click through and act on, like
            recent changes and usage trails.
          </p>
          <p>
            <strong>No backend, no login.</strong> Every widget talks directly to
            Wikimedia's public APIs from your browser. Your dashboard layout lives
            in your browser, and can be exported, imported, or shared as a link.
          </p>

          <h4>Basics</h4>
          <ul>
            <li><strong>+ Add Widget</strong> — the catalog covers metrics today (pageviews, link counts, category stats, GLAM impact, file usage, rankings), with more widget types to come.</li>
            <li><strong>Drag</strong> a widget's title bar to move it; drag the corner to resize.</li>
            <li><strong>⚙</strong> configures each widget (article, domain, category, file, month…).</li>
            <li>Widgets <strong>auto-refresh</strong> (hourly by default) and remember your layout.</li>
            <li><strong>⬇ Export / ⬆ Import</strong> round-trip the full dashboard as JSON.</li>
            <li><strong>🔗 Share</strong> copies a link with the dashboard embedded — or use <code>?config=&lt;url&gt;</code> to load a hosted config.</li>
            <li><strong>✨ Example</strong> loads a showcase dashboard with all {Object.keys(WIDGET_TYPES).length} widget types.</li>
          </ul>

          <h4>Try the demo file</h4>
          <p>
            A sample config lives on Wikimedia Commons — open this link to load it:
            <br />
            <a
              href="https://commons.wikimedia.org/wiki/Commons:WikiPortraits/Bento-demo.json"
              target="_blank"
              rel="noopener noreferrer"
            >Commons:WikiPortraits/Bento-demo.json</a>
          </p>

          <h4>Data &amp; etiquette</h4>
          <p>
            All data comes from Wikimedia APIs (pageviews REST API, MediaWiki
            Action API, Wikistats, Commons). Requests identify the tool in the
            User-Agent and are paced to respect Wikimedia's rate limits.
          </p>

          <p className="about-footer">
            Author: <a href="https://en.wikipedia.org/wiki/User:Fuzheado" target="_blank" rel="noopener noreferrer">Andrew Lih (User:Fuzheado)</a>
            {' · '}Built on react-grid-layout · Data © Wikimedia projects (CC BY-SA)
          </p>
        </div>
      </div>
    </div>
  );
}
