import { useState, useRef } from 'react';
import { validateDashboard } from '../lib/dashboardConfig';

/**
 * Modal for importing a dashboard config from a JSON file or pasted JSON.
 * Validates with validateDashboard(); shows errors/warnings; on success
 * hands the validated { widgets, layout } to the parent.
 */
export default function ImportPanel({ onImport, onClose }) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [imported, setImported] = useState(false);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result || ''));
      setImported(false);
    };
    reader.readAsText(file);
    e.target.value = ''; // allow re-selecting the same file
  };

  const handleImport = () => {
    const result = validateDashboard(text);
    setErrors(result.errors);
    setWarnings(result.warnings);
    if (result.valid && result.widgets) {
      setImported(true);
      onImport({ widgets: result.widgets, layout: result.layout });
    }
  };

  return (
    <div className="add-widget-overlay" onClick={onClose}>
      <div className="add-widget-panel import-panel" onClick={e => e.stopPropagation()}>
        <div className="add-widget-header">
          <h3>⬆ Import Dashboard</h3>
          <button className="widget-btn widget-btn-remove" onClick={onClose}>✕</button>
        </div>

        <div className="import-actions">
          <button className="btn" onClick={() => fileRef.current?.click()}>📂 Choose dashboard.json…</button>
          <span className="import-hint">or paste JSON below</span>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
        </div>

        <textarea
          className="import-textarea"
          placeholder='{ "widgets": [ { "id": "...", "widgetType": "...", "config": {...} } ], "layout": [ { "i": "...", "x": 0, "y": 0, "w": 3, "h": 3 } ] }'
          value={text}
          onChange={e => { setText(e.target.value); setImported(false); }}
          spellCheck={false}
        />

        {imported && (
          <div className="import-ok">✓ Dashboard imported — {warnings.length} warning(s)</div>
        )}
        {warnings.length > 0 && !imported && (
          <div className="import-notes">
            {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
          </div>
        )}
        {errors.length > 0 && (
          <div className="import-errors">
            {errors.map((e, i) => <div key={i}>✖ {e}</div>)}
          </div>
        )}

        <div className="import-footer">
          <button className="btn btn-primary" onClick={handleImport} disabled={!text.trim()}>Import</button>
          <span className="import-hint">Format spec: docs/JSON-FORMAT.md</span>
        </div>
      </div>
    </div>
  );
}
