import { useState, useRef, useEffect } from 'react';
import { askLocal, loadManifest } from '../lib/askLocal';

/**
 * Ask WikiBento (ISSUE-44) — intent-first widget discovery.
 * User types what they want; the /api/ask relay (Toolforge → free LiftWing
 * LLM, see docs/DATA-SOURCES.md §23) returns recommendation cards with
 * pre-filled configs. Falls back to a local keyword matcher when the ML
 * relay is unavailable (no dead-ends). Recommendations are validated
 * server-side against the manifest; the client adds via the same onAdd
 * path as the catalog.
 */

const SAMPLES = [
  'Show a random sampling of images from a category',
  'How often is an image used in a certain category?',
  'Top articles in English Wikipedia this month',
  'A gallery of images for Albert Einstein',
  'Play a video playlist of Commons files',
  'Chart how popular a category is over time',
];

const RECENT_KEY = 'wikibento-recent-widgets';

function markRecent(typeId) {
  try {
    const r = [typeId, ...JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((x) => x !== typeId)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(r));
  } catch { /* best-effort */ }
}

// Session token cache (30-min expiry server-side; refetch on 401).
let tokenCache = { token: null, fetchedAt: 0 };
async function getSessionToken(force) {
  if (!force && tokenCache.token && Date.now() - tokenCache.fetchedAt < 25 * 60 * 1000) return tokenCache.token;
  const r = await fetch('/api/ask/session');
  if (!r.ok) throw new Error(`session ${r.status}`);
  const d = await r.json();
  tokenCache = { token: d.token, fetchedAt: Date.now() };
  return d.token;
}

async function askRelay(prompt) {
  let token = await getSessionToken(false);
  let r = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, token }),
  });
  if (r.status === 401) { // expired token — refresh once and retry
    token = await getSessionToken(true);
    r = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, token }),
    });
  }
  if (!r.ok) throw new Error(`ask ${r.status}`);
  return r.json();
}

export default function AskPanel({ onAdd, onClose }) {
  const [prompt, setPrompt] = useState('');
  const [turns, setTurns] = useState([]); // { role, prompt?, options?, note?, source?, error? }
  const [busy, setBusy] = useState(false);
  const [manifest, setManifest] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragBaseRef = useRef({ x: 0, y: 0 });
  const listRef = useRef(null);

  useEffect(() => {
    loadManifest().then(setManifest).catch(() => {}); // warm the local-fallback manifest + icons
  }, []);

  const iconOf = (id) => manifest?.widgets?.find((w) => w.id === id)?.icon || '📦';
  const nameOf = (id) => manifest?.widgets?.find((w) => w.id === id)?.name || id;

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [turns, busy]);

  const handleHeaderPointerDown = (e) => {
    if (e.target.closest('button, textarea, input')) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const base = { ...dragBaseRef.current };
    const clamp = (v, limit) => Math.max(-limit, Math.min(limit, v));
    const onMove = (ev) => {
      setOffset({
        x: clamp(base.x + (ev.clientX - startX), window.innerWidth / 2 - 120),
        y: clamp(base.y + (ev.clientY - startY), window.innerHeight / 2 - 80),
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.classList.remove('panel-dragging');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.classList.add('panel-dragging');
  };

  const submit = async (raw) => {
    const q = (raw || prompt).trim();
    if (!q || busy) return;
    setPrompt('');
    setBusy(true);
    setTurns((t) => [...t, { role: 'user', prompt: q }]);
    try {
      const d = await askRelay(q);
      setTurns((t) => [...t, { role: 'assistant', options: d.options || [], source: 'ml', cached: d.cached, note: d.options.length ? null : 'No good match — try rephrasing, or browse the catalog.' }]);
    } catch {
      // Graceful degradation: local matcher (no network, no key).
      const local = await askLocal(q);
      if (local.options.length) {
        setTurns((t) => [...t, { role: 'assistant', options: local.options, source: 'local', note: 'Offline suggestions — the ML advisor is unavailable right now.' }]);
      } else {
        setTurns((t) => [...t, { role: 'assistant', options: [], source: 'local', error: true, note: 'Ask is unavailable right now (the ML service is experimental and may be busy). Try again in a moment, or browse the catalog.' }]);
      }
    }
    setBusy(false);
  };

  const handleAdd = (opt) => {
    const id = `${opt.widgetType}-${Date.now()}`;
    onAdd({ id, widgetType: opt.widgetType, config: { ...opt.config } });
    markRecent(opt.widgetType);
  };

  const configChips = (config) => Object.entries(config || {}).filter(([, v]) => v !== undefined && v !== null && v !== '').slice(0, 4);

  return (
    <div className="add-widget-overlay" onClick={onClose}>
      <div className="add-widget-panel ask-panel" onClick={(e) => e.stopPropagation()} style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
        <div className="add-widget-header" onPointerDown={handleHeaderPointerDown} title="Drag to move">
          <h3>✨ Ask WikiBento</h3>
          <span className="ask-subhead">Describe what you want — get widgets, pre-configured</span>
          <button className="widget-btn widget-btn-remove" onClick={onClose}>✕</button>
        </div>

        <div className="ask-body" ref={listRef}>
          {turns.length === 0 && !busy && (
            <div className="ask-empty">
              <p>Instead of browsing the catalog, tell me what you want to see — I'll suggest the right widgets and fill in their settings.</p>
              <div className="ask-samples">
                {SAMPLES.map((s) => (
                  <button key={s} className="ask-chip" onClick={() => submit(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) => (
            <div key={i} className={`ask-turn ask-turn-${t.role}`}>
              {t.role === 'user' ? (
                <div className="ask-bubble">{t.prompt}</div>
              ) : (
                <div className="ask-reply">
                  {t.note && <div className={`ask-note ${t.error ? 'ask-note-error' : ''}`}>{t.note}</div>}
                  {t.options.map((o, j) => (
                    <div key={j} className="ask-card" onClick={() => handleAdd(o)} title="Click to add this widget">
                      <div className="ask-card-top">
                        <span className="add-widget-icon">{iconOf(o.widgetType)}</span>
                        <span className="ask-card-name">{nameOf(o.widgetType)}</span>
                        {t.source === 'local' && <span className="add-widget-badge ask-badge-local">offline</span>}
                      </div>
                      {o.reason && <div className="ask-card-reason">{o.reason}</div>}
                      {configChips(o.config).length > 0 && (
                        <div className="ask-card-config">
                          {configChips(o.config).map(([k, v]) => (
                            <span key={k} className="ask-config-chip">{k} → {String(v).slice(0, 40)}</span>
                          ))}
                        </div>
                      )}
                      <span className="add-widget-add ask-card-add">+</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="ask-turn ask-turn-assistant">
              <div className="ask-reply ask-thinking">
                <span className="ask-dots"><i /><i /><i /></span> Thinking…
              </div>
            </div>
          )}
        </div>

        <div className="ask-input-row">
          <textarea
            className="ask-input"
            rows={1}
            placeholder="e.g. Random photos from a category…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            disabled={busy}
          />
          <button className="widget-btn ask-send" onClick={() => submit()} disabled={busy || !prompt.trim()}>Suggest{'\u00A0'}→</button>
        </div>
        <div className="ask-footer">
          Powered by Wikimedia's free ML service (LiftWing) · prompts are not stored · experimental
        </div>
      </div>
    </div>
  );
}
