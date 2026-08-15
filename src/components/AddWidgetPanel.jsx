import { useState } from 'react';
import { WIDGET_TYPES } from '../widgets';

/** Catalog organization (ISSUE-32): two discovery views (flat list /
 *  categorized two-pane) + search that overrides both + type filter +
 *  intensity badges + recently-used section. */
const CATEGORIES = [
  { id: '__recent__', label: 'Recent', icon: '🕓', recent: true },
  { id: 'Articles', label: 'Articles', icon: '📄' },
  { id: 'Categories & GLAM', label: 'Categories & GLAM', icon: '📁' },
  { id: 'Rankings & Platforms', label: 'Rankings & Platforms', icon: '🏆' },
  { id: 'Files & Media', label: 'Files & Media', icon: '🖼️' },
  { id: 'Web & History', label: 'Web & History', icon: '🕰️' },
  { id: 'Queries & Power', label: 'Queries & Power', icon: '🧠' },
  { id: 'Content & Embeds', label: 'Content & Embeds', icon: '📝' },
];

const TYPE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'stat', label: '📊 Stats' },
  { id: 'trend', label: '📈 Trends' },
  { id: 'table', label: '🗒️ Tables' },
  { id: 'media', label: '🖼️ Media' },
  { id: 'query', label: '🧠 Queries' },
  { id: 'embed', label: '🔌 Embeds' },
];

// renderer → type family (for glyphs + the type filter)
const TYPE_BY_RENDERER = {
  StatCard: 'stat', GlamCard: 'stat', CimSnapshotCard: 'stat',
  ExcerptCard: 'stat', QualityCard: 'stat',
  TrendCard: 'trend', FileTrafficCard: 'trend',
  RankingCard: 'table', TopPagesExpandedCard: 'table', EditHistoryCard: 'table',
  AssessmentsCard: 'table', ArticleListCard: 'table',
  GalleryGridCard: 'media', GalleryListCard: 'media', CimTopFilesCard: 'media',
  WaybackGalleryCard: 'media', PanoramaCard: 'media',
  SparqlCard: 'query',
  MarkdownCard: 'embed', WikiPageCard: 'embed',
};

const typeOf = (def) => TYPE_BY_RENDERER[def.renderer] || 'stat';

const INTENSITY_BADGE = {
  high: { label: 'slow', cls: 'intensity-high', title: 'Intensive — live scan/query, may take 10–60 s' },
  medium: { label: 'medium', cls: 'intensity-medium', title: 'Extra fetches — may add a few seconds' },
};

const RECENT_KEY = 'wikibento-recent-widgets';
const VIEW_KEY = 'wikibento-addview';

function readRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}

function markRecent(typeId) {
  try {
    const r = [typeId, ...readRecent().filter((x) => x !== typeId)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(r));
  } catch { /* best-effort */ }
}

export default function AddWidgetPanel({ onAdd, onClose }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [view, setView] = useState(() => {
    try { return localStorage.getItem(VIEW_KEY) || 'categories'; } catch { return 'categories'; }
  });
  const [activeCat, setActiveCat] = useState('Articles');
  const [recent, setRecent] = useState(readRecent);

  const types = Object.values(WIDGET_TYPES);
  const searchActive = search.trim().length > 0;
  const q = search.trim().toLowerCase();

  const matches = (def) =>
    !searchActive ||
    def.name.toLowerCase().includes(q) ||
    def.description.toLowerCase().includes(q) ||
    (def.dataSource || '').toLowerCase().includes(q) ||
    (def.category || '').toLowerCase().includes(q);

  const filtered = types.filter((def) => matches(def) && (typeFilter === 'all' || typeOf(def) === typeFilter));
  const recentTypes = recent.map((id) => WIDGET_TYPES[id]).filter(Boolean);
  const countIn = (cat) => (cat.recent ? recentTypes.length : types.filter((d) => d.category === cat.id).length);

  const handleAdd = (def) => {
    const id = `${def.id}-${Date.now()}`;
    onAdd({ id, widgetType: def.id, config: { ...def.defaults } });
    markRecent(def.id);
    setRecent(readRecent());
  };

  const setViewAndPersist = (v) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* best-effort */ }
  };

  const item = (def) => (
    <div key={def.id} className="add-widget-item" onClick={() => handleAdd(def)}>
      <span className="add-widget-icon">{def.icon}</span>
      <div>
        <div className="add-widget-name">
          {def.name}
          {def.experimental && <span className="add-widget-badge" title="Experimental — depends on third-party service health">alpha</span>}
          {INTENSITY_BADGE[def.intensity] && (
            <span className={`add-widget-badge ${INTENSITY_BADGE[def.intensity].cls}`} title={INTENSITY_BADGE[def.intensity].title}>
              {INTENSITY_BADGE[def.intensity].label}
            </span>
          )}
        </div>
        <div className="add-widget-desc">{def.description}</div>
      </div>
      <span className="add-widget-type" title={`${typeOf(def)} widget`}>{TYPE_FILTERS.find((f) => f.id === typeOf(def))?.label.split(' ')[1] || ''}</span>
      <span className="add-widget-add">+</span>
    </div>
  );

  const flatList = (list, withRecent) => (
    <div className="add-widget-list">
      {withRecent && recentTypes.length > 0 && (
        <>
          <div className="add-widget-section">Recent</div>
          {recentTypes.map(item)}
          <div className="add-widget-section">All widgets</div>
        </>
      )}
      {list.map(item)}
      {list.length === 0 && <div className="add-widget-empty">No widgets match "{search}"</div>}
    </div>
  );

  return (
    <div className="add-widget-overlay" onClick={onClose}>
      <div className="add-widget-panel" onClick={(e) => e.stopPropagation()}>
        <div className="add-widget-header">
          <h3>Add Widget</h3>
          <div className="add-widget-view-toggle" role="group" aria-label="Catalog view">
            <button className={view === 'flat' ? 'active' : ''} onClick={() => setViewAndPersist('flat')} title="Flat list of all widgets">☰ List</button>
            <button className={view === 'categories' ? 'active' : ''} onClick={() => setViewAndPersist('categories')} title="Browse by category">▤ Categories</button>
          </div>
          <button className="widget-btn widget-btn-remove" onClick={onClose}>✕</button>
        </div>
        <input
          type="text"
          className="add-widget-search"
          placeholder="Search widgets… (name, source, category)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div className="add-widget-typefilter">
          {TYPE_FILTERS.map((f) => (
            <button key={f.id} className={typeFilter === f.id ? 'active' : ''} onClick={() => setTypeFilter(f.id)}>{f.label}</button>
          ))}
        </div>

        {searchActive ? (
          flatList(filtered, false)
        ) : view === 'flat' ? (
          flatList(filtered, true)
        ) : (
          <div className="add-widget-panes">
            <div className="add-widget-rail">
              {CATEGORIES.map((cat) => {
                const n = countIn(cat);
                if (cat.recent && n === 0) return null;
                return (
                  <button
                    key={cat.id}
                    className={`add-widget-cat ${activeCat === cat.id ? 'active' : ''}`}
                    onClick={() => setActiveCat(cat.id)}
                  >
                    <span className="add-widget-cat-icon">{cat.icon}</span>
                    <span className="add-widget-cat-label">{cat.label}</span>
                    <span className="add-widget-cat-count">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="add-widget-pane">
              {activeCat === '__recent__'
                ? flatList(recentTypes, false)
                : flatList(filtered.filter((d) => d.category === activeCat), false)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
