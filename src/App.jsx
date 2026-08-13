import { useState, useCallback, useEffect } from 'react';
import GridLayout from 'react-grid-layout';
import WidgetFrame from './widgets/WidgetFrame';
import AddWidgetPanel from './components/AddWidgetPanel';
import ImportPanel from './components/ImportPanel';
import AboutPanel from './components/AboutPanel';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import SharePanel from './components/SharePanel';
import ErrorBoundary from './components/ErrorBoundary';
import { WIDGET_TYPES } from './widgets';
import { EXAMPLE_DASHBOARD, CONFIG_VERSION, validateDashboard } from './lib/dashboardConfig';
import { readConfigParam, readHashConfig, fetchRemoteConfig, decodeDashboardHash } from './lib/share';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './App.css';

const STORAGE_KEY = 'wikibento-layout';

// Default starter widgets
const DEFAULT_WIDGETS = [
  {
    id: 'pageviews-main',
    widgetType: 'pageviews',
    config: { ...WIDGET_TYPES.pageviews.defaults },
  },
  {
    id: 'linkcount-libretexts',
    widgetType: 'linkcount',
    config: { ...WIDGET_TYPES.linkcount.defaults },
  },
  {
    id: 'top-wikipedias',
    widgetType: 'topWikipedias',
    config: { ...WIDGET_TYPES.topWikipedias.defaults },
  },
];

const DEFAULT_LAYOUT = [
  { i: 'pageviews-main', x: 0, y: 0, w: 3, h: 4, minW: 2, minH: 3 },
  { i: 'linkcount-libretexts', x: 3, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  { i: 'top-wikipedias', x: 0, y: 4, w: 4, h: 4, minW: 3, minH: 3 },
];

export default function App() {
  const [widgets, setWidgets] = useState([]);
  const [layout, setLayout] = useState([]);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [bootError, setBootError] = useState(null);
  // Grid width follows the window — recomputed on resize (rAF-throttled so
  // react-grid-layout doesn't re-layout on every pixel of a window drag).
  const [gridWidth, setGridWidth] = useState(() => window.innerWidth - 40);
  // Grafana-style: below 768px viewport, render a single-column stack instead
  // of the 12-col grid (75px-wide columns are unusable on phones).
  const isMobile = gridWidth + 40 < 768;

  useEffect(() => {
    let rafId;
    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => setGridWidth(window.innerWidth - 40));
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Boot: URL config (?config= or #/d/…) takes priority over localStorage,
  // which takes priority over defaults.
  useEffect(() => {
    let cancelled = false;
    const apply = (widgets, layout) => {
      setWidgets(widgets);
      setLayout(layout);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ widgets, layout }));
    };
    const loadSaved = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.widgets?.length && parsed.layout?.length) {
            apply(parsed.widgets, parsed.layout);
            return;
          }
        }
      } catch (e) { /* corrupt, use defaults */ }
      apply(DEFAULT_WIDGETS, DEFAULT_LAYOUT);
    };
    const boot = async () => {
      const configUrl = readConfigParam();
      const hashPayload = readHashConfig();
      let loadedFromUrl = false;
      try {
        if (configUrl) {
          const text = await fetchRemoteConfig(configUrl);
          const r = validateDashboard(text);
          if (!r.valid) throw new Error(r.errors[0]);
          apply(r.widgets, r.layout);
          loadedFromUrl = true;
        } else if (hashPayload) {
          const r = validateDashboard(decodeDashboardHash(hashPayload));
          if (!r.valid) throw new Error(r.errors[0]);
          apply(r.widgets, r.layout);
          loadedFromUrl = true;
        }
      } catch (e) {
        setBootError(e.message);
      }
      if (!loadedFromUrl) loadSaved();
      if (!cancelled) setInitialized(true);
    };
    boot();
    return () => { cancelled = true; };
  }, []);

  // Persist to localStorage on changes
  const persist = useCallback((newWidgets, newLayout) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ widgets: newWidgets, layout: newLayout }));
  }, []);

  const handleLayoutChange = useCallback((newLayout) => {
    setLayout(newLayout);
    persist(widgets, newLayout);
  }, [widgets, persist]);

  const handleAddWidget = useCallback((widget) => {
    const newWidgets = [...widgets, widget];
 const newLayout = [
  ...layout,
  (() => {
   // Per-widget layout constraints from the registry (react-grid-layout
   // minW/minH/maxW/maxH) — e.g. the 360° viewer needs a minimum size.
   const dl = WIDGET_TYPES[widget.widgetType]?.defaultLayout || { w: 3, h: 3, minW: 2, minH: 2 };
   return {
    i: widget.id, x: 0, y: Infinity,
    w: dl.w, h: dl.h, minW: dl.minW, minH: dl.minH,
    ...(dl.maxW != null ? { maxW: dl.maxW } : {}),
    ...(dl.maxH != null ? { maxH: dl.maxH } : {}),
   };
  })(),
 ];
    setWidgets(newWidgets);
    setLayout(newLayout);
    persist(newWidgets, newLayout);
  }, [widgets, layout, persist]);

  const handleRemoveWidget = useCallback((id) => {
    const newWidgets = widgets.filter(w => w.id !== id);
    const newLayout = layout.filter(l => l.i !== id);
    setWidgets(newWidgets);
    setLayout(newLayout);
    persist(newWidgets, newLayout);
  }, [widgets, layout, persist]);

  const handleUpdateConfig = useCallback((id, newConfig) => {
    const newWidgets = widgets.map(w =>
      w.id === id ? { ...w, config: newConfig } : w
    );
    setWidgets(newWidgets);
    persist(newWidgets, layout);
  }, [widgets, layout, persist]);

  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setWidgets(DEFAULT_WIDGETS);
    setLayout(DEFAULT_LAYOUT);
  }, []);

  /** Replace the whole dashboard (example load / successful import). */
  const applyDashboard = useCallback((dashboard) => {
    setWidgets(dashboard.widgets);
    setLayout(dashboard.layout);
    persist(dashboard.widgets, dashboard.layout);
  }, [persist]);

  const handleLoadExample = useCallback(() => {
    applyDashboard(EXAMPLE_DASHBOARD);
  }, [applyDashboard]);

  const handleImport = useCallback((dashboard) => {
    applyDashboard(dashboard);
    setShowImportPanel(false);
  }, [applyDashboard]);

  const handleExport = useCallback(() => {
    const config = { version: CONFIG_VERSION, widgets, layout };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dashboard.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [widgets, layout]);

  /** Open the Share panel (QR code + copyable link). */
  const openShare = useCallback(() => setShowShare(true), []);

  if (!initialized) {
    return (
      <div className="boot-splash">
        <div className="boot-spinner" />
        <span>Loading dashboard…</span>
      </div>
    );
  }

  const widgetItems = widgets.map(w => (
    <div key={w.id} className="grid-item">
      <ErrorBoundary
        resetKey={w.config}
        label={WIDGET_TYPES[w.widgetType]?.name || w.widgetType}
      >
        <WidgetFrame
          widget={w}
          onRemove={handleRemoveWidget}
          onUpdateConfig={handleUpdateConfig}
        />
      </ErrorBoundary>
    </div>
  ));

  // Mobile stack order follows the grid layout (top-left first), not the
  // widgets array order — dragging on desktop only changes `layout` positions,
  // so sorting by (y, x) keeps the phone stack in visual reading order.
  const layoutPos = new Map(layout.map(l => [l.i, l]));
  const mobileItems = [...widgetItems].sort((a, b) => {
    const la = layoutPos.get(a.key) || { y: Infinity, x: Infinity };
    const lb = layoutPos.get(b.key) || { y: Infinity, x: Infinity };
    return (la.y - lb.y) || (la.x - lb.x);
  });

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <h1>📊 WikiBento</h1>
          <span className="app-subtitle">Wikimedia Dashboard</span>
        </div>
        <div className="app-actions">
          <button className="btn" onClick={handleLoadExample} title={`Load an example dashboard with all ${Object.keys(WIDGET_TYPES).length} widget types`}>
            ✨ Example
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddPanel(true)}>
            + Add Widget
          </button>
          <button className="btn" onClick={() => setShowImportPanel(true)} title="Import dashboard config from JSON">
            ⬆ Import
          </button>
          <button className="btn" onClick={openShare} title="Share via QR code or link (config embedded in the URL)">
            🔗 Share
          </button>
          <button className="btn" onClick={handleExport} title="Export dashboard config as JSON">
            ⬇ Export
          </button>
          <button className="btn btn-danger" onClick={handleReset} title="Reset to defaults">
            ↺ Reset
          </button>
          <button className="btn" onClick={() => setShowAbout(true)} title="About WikiBento">
            ⓘ
          </button>
          <button className="btn" onClick={() => setShowDiagnostics(true)} title="Network self-test (debugging)">
            🧪
          </button>
        </div>
      </header>

      {bootError && (
        <div className="boot-banner">
          ⚠ Could not load dashboard from URL: {bootError}
          <button className="widget-btn" onClick={() => setBootError(null)} title="Dismiss">✕</button>
        </div>
      )}

      <div className="dashboard-container">
        {isMobile ? (
          <div className="mobile-stack">{mobileItems}</div>
        ) : (
          <GridLayout
            className="layout"
            layout={layout}
            cols={12}
            rowHeight={80}
            width={gridWidth}
            onLayoutChange={handleLayoutChange}
            dragConfig={{ handle: '.widget-header', cancel: '.no-drag' }}
            compactType="vertical"
            margin={[12, 12]}
            containerPadding={[0, 0]}
          >
            {widgetItems}
          </GridLayout>
        )}

        {widgets.length === 0 && (
          <div className="empty-state">
            <p>No widgets yet. Click <strong>+ Add Widget</strong> to get started.</p>
          </div>
        )}
      </div>

      {showAddPanel && (
        <AddWidgetPanel
          onAdd={handleAddWidget}
          onClose={() => setShowAddPanel(false)}
        />
      )}

      {showImportPanel && (
        <ImportPanel
          onImport={handleImport}
          onClose={() => setShowImportPanel(false)}
        />
      )}

      {showShare && (
        <SharePanel
          widgets={widgets}
          layout={layout}
          onClose={() => setShowShare(false)}
        />
      )}

      {showAbout && (
        <AboutPanel onClose={() => setShowAbout(false)} />
      )}

      {showDiagnostics && (
        <DiagnosticsPanel onClose={() => setShowDiagnostics(false)} />
      )}
    </div>
  );
}
