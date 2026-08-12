import { useMemo, useState, useEffect } from 'react';
import { buildShareLink } from '../lib/share';
import { qrSvg } from '../lib/qr';
import { CONFIG_VERSION } from '../lib/dashboardConfig';

/** QR codes get hard to scan past ~1,000 chars; 1,500 is the hard cap. */
const QR_MAX_CHARS = 1500;

/**
 * Share modal: QR code + copyable link for the current dashboard.
 * QR payload selection:
 *   1. The current URL when it carries ?config= (short — ideal for scanning)
 *   2. The self-contained #/d/<base64> share link, when short enough
 *   3. No QR — friendly notice — when the embedded config is too long
 */
export default function SharePanel({ widgets, layout, onClose }) {
  const [copied, setCopied] = useState(false);

  const shareJson = useMemo(
    () => JSON.stringify({ version: CONFIG_VERSION, widgets, layout }),
    [widgets, layout],
  );
  const hashShareUrl = useMemo(() => buildShareLink(shareJson), [shareJson]);

  // A URL loaded with ?config= already re-opens this exact dashboard and is
  // dramatically shorter than the hash form — prefer it for the QR.
  const currentUrl = window.location.href;
  const hasConfigParam = new URLSearchParams(window.location.search).has('config');

  const linkText = hasConfigParam ? currentUrl : hashShareUrl;
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

        {qrText ? (
          <div className="share-qr-wrap">
            {/* QR needs a white background + quiet zone to scan */}
            <div className="share-qr-card" dangerouslySetInnerHTML={{ __html: qrSvg(qrText) }} />
            <div className="share-qr-hint">
              Scan to open this dashboard on your phone
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
