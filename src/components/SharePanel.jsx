import { useMemo, useState, useEffect } from 'react';
import { buildShareLink, presentModeUrl } from '../lib/share';
import { qrSvg } from '../lib/qr';
import { CONFIG_VERSION } from '../lib/dashboardConfig';

/** QR codes get hard to scan past ~1,000 chars; 1,500 is the hard cap. */
const QR_MAX_CHARS = 1500;

/**
 * Share modal: QR code + copyable link for the current dashboard.
 *
 * Share mode (ISSUE-67): the link and the QR encode an EXPLICIT presentation
 * mode, chosen here — `Lean` (`?lean=1`: no editor chrome) or `Full` (editable).
 * Default is the mode the presenter is in. Both variants are normalized
 * (`presentModeUrl`), so the presenter's own mode never leaks into the link and
 * a Full link can never drop a recipient into presentation mode.
 *
 * QR payload selection:
 *   1. The current URL when it carries ?config= (short — ideal for scanning)
 *   2. The self-contained #/d/<base64> share link, when short enough
 *   3. No QR — friendly notice — when the embedded config is too long
 */
export default function SharePanel({ widgets, layout, lean = false, onClose }) {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState(lean ? 'lean' : 'full');

  const shareJson = useMemo(
    () => JSON.stringify({ version: CONFIG_VERSION, widgets, layout }),
    [widgets, layout],
  );
  const hashShareUrl = useMemo(() => buildShareLink(shareJson), [shareJson]);

  // A URL loaded with ?config= already re-opens this exact dashboard and is
  // dramatically shorter than the hash form — prefer it for the QR.
  const currentUrl = window.location.href;
  const hasConfigParam = new URLSearchParams(window.location.search).has('config');

  // The QR is an encoding of the copyable link — always the same artifact, so
  // what you scan is exactly what you can paste.
  const linkText = useMemo(
    () => presentModeUrl(hasConfigParam ? currentUrl : hashShareUrl, mode),
    [hasConfigParam, currentUrl, hashShareUrl, mode],
  );

  const qrText = linkText.length <= QR_MAX_CHARS ? linkText : null;
  const linkIsLong = qrText && qrText.length > 1000;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(linkText);
      setCopied(true);
    } catch {
      window.prompt('Copy this link:', linkText);
    }
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="add-widget-overlay" onClick={onClose}>
      <div className="add-widget-panel share-panel" onClick={e => e.stopPropagation()}>
        <div className="add-widget-header">
          <h3>🔗 Share Dashboard</h3>
          <button className="widget-btn widget-btn-remove" onClick={onClose}>✕</button>
        </div>

        {/* Which app the scanned link opens — one choice drives both the QR and
            the copyable link, so the two can never disagree. */}
        <div className="share-mode-row" role="group" aria-label="Share mode">
          <button
            className={`btn share-mode-btn${mode === 'full' ? ' active' : ''}`}
            aria-pressed={mode === 'full'}
            onClick={() => setMode('full')}
            title="Editable board — toolbar, drag and resize enabled"
          >
            🖥 Full board
          </button>
          <button
            className={`btn share-mode-btn${mode === 'lean' ? ' active' : ''}`}
            aria-pressed={mode === 'lean'}
            onClick={() => setMode('lean')}
            title="Clean view — no editor chrome or toolbar (adds ?lean=1)"
          >
            📱 Lean mode
          </button>
        </div>
        <div className="import-hint share-mode-hint">
          {mode === 'lean'
            ? 'Opens with no editor chrome — like an app. Leave with ✕ Exit or Esc.'
            : 'Opens the editable board, with the toolbar and layout controls.'}
        </div>

        {qrText ? (
          <div className="share-qr-wrap">
            {/* QR needs a white background + quiet zone to scan */}
            <div className="share-qr-card" dangerouslySetInnerHTML={{ __html: qrSvg(qrText) }} />
            <div className="share-qr-hint">
              {mode === 'lean'
                ? 'Scan to open this board in Lean mode'
                : 'Scan to open this dashboard on your phone'}
              {linkIsLong && <span className="share-qr-warn"> · long link — QR is dense</span>}
            </div>
          </div>
        ) : (
          <div className="import-notes share-noqr">
            <div>⚠ Link too long for a QR code ({linkText.length.toLocaleString()} chars).</div>
            <div>Trim the dashboard to fewer/smaller widgets, or load a hosted
              <code> ?config=</code> URL and share that instead.</div>
          </div>
        )}

        <div className="share-link-row">
          <input
            className="share-link-input"
            type="text"
            readOnly
            value={linkText}
            onFocus={e => e.target.select()}
          />
          <button className="btn btn-primary" onClick={handleCopy}>
            {copied ? '✓ Copied' : 'Copy Link'}
          </button>
        </div>
        <div className="import-hint">
          {hasConfigParam
            ? 'QR encodes the current URL — anyone who scans opens this exact dashboard'
            : 'Self-contained link — the full config is embedded in the URL'}
        </div>
      </div>
    </div>
  );
}
