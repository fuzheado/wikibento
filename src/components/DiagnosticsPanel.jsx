import { useState } from 'react';

/**
 * Network self-test — probes the exact endpoints the widgets use and
 * classifies failures by layer:
 *   - plain fetch      → the real request (fails with "Load failed" on iOS Safari)
 *   - mode: 'no-cors'  → connectivity only (opaque response = network path works;
 *                        reject = the connection itself fails)
 *   - cache: 'no-store' → rules out Safari's HTTP cache serving a stale entry
 *
 * Controls (en.wikipedia.org / commons.wikimedia.org) should always pass —
 * they're the endpoints the working widgets use.
 */
const PROBES = [
  { id: 'restbase', label: 'RESTBase pageviews (wikimedia.org)', url: 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Main_Page/daily/2026070100/2026073100' },
  { id: 'wikistats', label: 'Wikistats CSV (wmcloud.org)', url: 'https://wikistats.wmcloud.org/api.php?action=dump&table=wikipedias&format=csv' },
  { id: 'enwiki', label: 'Control: en.wikipedia.org API', url: 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&meta=siteinfo&siprop=general' },
  { id: 'commons', label: 'Control: commons.wikimedia.org API', url: 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&meta=siteinfo&siprop=general' },
];

const MODES = [
  { key: 'normal', label: 'normal fetch', opts: {} },
  { key: 'nocors', label: 'connectivity (no-cors)', opts: { mode: 'no-cors' } },
  { key: 'nostore', label: 'cache-bypass (no-store)', opts: { cache: 'no-store' } },
];

async function probe(url, opts) {
  const t0 = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, { ...opts, signal: controller.signal });
    const ok = resp.ok || resp.type === 'opaque';
    const bytes = (await resp.clone().text()).length;
    return { status: ok ? '✅' : `❌ HTTP ${resp.status}`, detail: `${Math.round(bytes / 1024)} KB · ${Math.round(performance.now() - t0)} ms${resp.type === 'opaque' ? ' (opaque)' : ''}` };
  } catch (e) {
    const timedOut = e.name === 'AbortError';
    return { status: '❌', detail: `${timedOut ? 'timed out (15s)' : e.message} · ${Math.round(performance.now() - t0)} ms` };
  } finally {
    clearTimeout(timer);
  }
}

export default function DiagnosticsPanel({ onClose }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);

  const run = async () => {
    setRunning(true);
    setResults([]);
    const acc = [];
    for (const p of PROBES) {
      const row = { probe: p, modes: {} };
      for (const m of MODES) {
        row.modes[m.key] = await probe(p.url, m.opts);
      }
      acc.push(row);
      setResults([...acc]);
    }
    setRunning(false);
  };

  return (
    <div className="add-widget-overlay" onClick={onClose}>
      <div className="add-widget-panel diag-panel" onClick={e => e.stopPropagation()}>
        <div className="add-widget-header">
          <h3>🧪 Network Self-Test</h3>
          <button className="widget-btn widget-btn-remove" onClick={onClose}>✕</button>
        </div>
        <div className="diag-body">
          <p className="import-hint">
            Probes the endpoints the widgets use. If the controls pass but the
            top two fail, the problem is specific to those hosts from this
            browser/network. Send the results to the WikiBento author.
          </p>
          <button className="btn btn-primary" onClick={run} disabled={running}>
            {running ? 'Testing…' : 'Run tests'}
          </button>
          <div className="diag-results">
            {results.map(row => (
              <div key={row.probe.id} className="diag-row">
                <div className="diag-label">{row.probe.label}</div>
                {MODES.map(m => (
                  <div key={m.key} className="diag-line">
                    <span className={`diag-status ${row.modes[m.key]?.status === '✅' ? 'diag-ok' : 'diag-bad'}`}>
                      {row.modes[m.key]?.status || '…'}
                    </span>
                    <span className="diag-mode">{m.label}</span>
                    <span className="diag-detail">{row.modes[m.key]?.detail || ''}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
