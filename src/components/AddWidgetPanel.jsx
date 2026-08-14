import { useState } from 'react';
import { WIDGET_TYPES } from '../widgets';

export default function AddWidgetPanel({ onAdd, onClose }) {
  const [search, setSearch] = useState('');
  const types = Object.values(WIDGET_TYPES);

  const filtered = search
    ? types.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase())
      )
    : types;

  const handleAdd = (typeId) => {
    const def = WIDGET_TYPES[typeId];
    const id = `${typeId}-${Date.now()}`;
    onAdd({
      id,
      widgetType: typeId,
      config: { ...def.defaults },
    });
  };

  return (
    <div className="add-widget-overlay" onClick={onClose}>
      <div className="add-widget-panel" onClick={e => e.stopPropagation()}>
        <div className="add-widget-header">
          <h3>Add Widget</h3>
          <button className="widget-btn widget-btn-remove" onClick={onClose}>✕</button>
        </div>
        <input
          type="text"
          className="add-widget-search"
          placeholder="Search widgets…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
        <div className="add-widget-list">
          {filtered.map(def => (
            <div key={def.id} className="add-widget-item" onClick={() => handleAdd(def.id)}>
              <span className="add-widget-icon">{def.icon}</span>
              <div>
                <div className="add-widget-name">
                  {def.name}
                  {def.experimental && <span className="add-widget-badge" title="Experimental — depends on third-party service health">alpha</span>}
                </div>
                <div className="add-widget-desc">{def.description}</div>
              </div>
              <span className="add-widget-add">+</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="add-widget-empty">No widgets match "{search}"</div>
          )}
        </div>
      </div>
    </div>
  );
}
