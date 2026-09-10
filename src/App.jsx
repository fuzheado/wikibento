import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import GridLayout from 'react-grid-layout';
import WidgetFrame from './widgets/WidgetFrame';
import AddWidgetPanel from './components/AddWidgetPanel';
import AskPanel from './components/AskPanel';
import ImportPanel from './components/ImportPanel';
import AboutPanel from './components/AboutPanel';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import SharePanel from './components/SharePanel';
import ErrorBoundary from './components/ErrorBoundary';
import ConfirmDialog from './components/ConfirmDialog';
import { WIDGET_TYPES } from './widgets';
import { EXAMPLE_DASHBOARD, CONFIG_VERSION, validateDashboard } from './lib/dashboardConfig';
import { parseParams, resolveParams, parseParamSpecText } from './lib/params';
import { renameWidgetRefs, findWidgetRefs } from './lib/dataflow';
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

// ISSUE-18: enter browser fullscreen when the ⛶ Present button is clicked.
// Attempted ONLY on the click path (browser requires a user gesture; the
// ?kiosk=1 boot path must NOT attempt it).
const FULLSCREEN_ON_PRESENT = true;

export default function App() {
  const [widgets, setWidgets] = useState([]);
  const [layout, setLayout] = useState([]);
  const [showAddPanel, setShowAddPanel] = useState(false);
const [showAskPanel, setShowAskPanel] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [bootError, setBootError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0); // bumped to force widget reloads (import/example/reset) — also by board-param changes (ISSUE-50)
  const [paramSpecs, setParamSpecs] = useState({});   // board params (ISSUE-50): { name: { label, type, options } }
  const [paramValues, setParamValues] = useState({}); // board params live values: { name: string }
  const [paramBlock, setParamBlock] = useState(null); // board params RAW (persisted; spec edits rewrite it)
  // ISSUE-51 (widget-to-widget dataflow): { widgetId → emitted value }. Built
  // live from each widget's registry `emit`, consumed via the `source` picker
  // or {{widget:id}} interpolation. Ephemeral — rebuilt from fresh loads,
  // never persisted.
  const [widgetOutputs, setWidgetOutputs] = useState({});
  // ISSUE-53: pending widget rename — resolved via a confirm dialog when other
  // widgets reference the id (source fields / {{widget:id}} tokens).
  const [pendingRename, setPendingRename] = useState(null); // { id, newId, refs: [{id, refs}] }
  // Kiosk / presentation mode (ISSUE-18): hides all editing chrome, locks the grid.
  const [kiosk, setKiosk] = useState(false);
  // Lean mode: the same chrome-free presentation WITHOUT fullscreen — the
  // browser stays resizable, so the board reads as a compact app.
  const [lean, setLean] = useState(false);
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
    // Kiosk boot: a ?kiosk=1 link stays kiosk across refreshes because the
    // param stays in the URL. Deliberately NOT persisted to localStorage —
    // a user who tries kiosk once must not silently land back in it.
    const params = new URLSearchParams(window.location.search);
    if (params.get('kiosk') === '1') setKiosk(true);
    else if (params.get('lean') === '1') setLean(true); // ?lean=1 — chrome-free, no fullscreen
    const apply = (widgets, layout, paramsBlock) => {
      const { specs, values } = parseParams(paramsBlock);
      setParamBlock(paramsBlock || null);
      setParamSpecs(specs);
      setParamValues(values);
      setWidgets(widgets);
      setLayout(layout);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ widgets, layout, params: paramsBlock || null }));
    };
    const loadSaved = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.widgets?.length && parsed.layout?.length) {
            apply(parsed.widgets, parsed.layout, parsed.params);
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
          apply(r.widgets, r.layout, JSON.parse(text).params);
          loadedFromUrl = true;
        } else if (hashPayload) {
          const json = JSON.parse(decodeDashboardHash(hashPayload)); // decode returns a JSON STRING
          const r = validateDashboard(json);
          if (!r.valid) throw new Error(r.errors[0]);
          apply(r.widgets, r.layout, json.params);
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

  // Present-mode enter/exit (kiosk + lean, ISSUE-18). Fullscreen is attempted
  // only on the kiosk click path (browser requires a user gesture; the
  // ?kiosk=1 boot path must NOT attempt it). Lean never goes fullscreen.
  const enterKiosk = useCallback(() => {
    setLean(false);
    setKiosk(true);
    if (FULLSCREEN_ON_PRESENT && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  const enterLean = useCallback(() => {
    setKiosk(false);
    setLean(true);
  }, []);

  const exitPresent = useCallback(() => {
    setKiosk(false);
    setLean(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    // Strip ?kiosk=1 / ?lean=1 so a refresh after Exit lands in normal mode
    // (ISSUE-18 checklist). Escape keeps the param — a present link stays a
    // present link unless the presenter deliberately leaves.
    const url = new URL(window.location.href);
    const had = url.searchParams.has('kiosk') || url.searchParams.has('lean');
    url.searchParams.delete('kiosk');
    url.searchParams.delete('lean');
    if (had) window.history.replaceState(null, '', url.toString());
  }, []);

  // Escape exits present mode (kiosk or lean, only while one is active).
  useEffect(() => {
    if (!kiosk && !lean) return;
    const onKey = (e) => { if (e.key === 'Escape') exitPresent(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kiosk, lean, exitPresent]);

  // Persist to localStorage on changes
  const persist = useCallback((newWidgets, newLayout, paramsBlock) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ widgets: newWidgets, layout: newLayout, params: paramsBlock || null }));
  }, []);

  /** ISSUE-44 Phase 3a — add an Ask-assembled board fragment BELOW the
   *  current board (additive, never supplants). Steps: undo snapshot →
   *  widget-id collision remap (atomic repoint of the fragment's refs) →
   *  param merge (incompatible collisions are renamed + repointed, never
   *  silently reinterpreted) → layout append in wiring order → full-board
   *  validateDashboard gate → apply + undo toast. */
  const [assemblyToast, setAssemblyToast] = useState(null); // { message, error?, prev? }
  useEffect(() => {
    if (!assemblyToast) return undefined;
    const t = setTimeout(() => setAssemblyToast(null), 12000);
    return () => clearTimeout(t);
  }, [assemblyToast]);

  const handleAddAssembly = useCallback((board) => {
    const frag = board?.widgets || [];
    if (!frag.length) return;
    const prev = { widgets, layout, paramBlock };

    // ── 1. Widget-id collision remap (fragment-internal, atomic) ──
    const taken = new Set(widgets.map((w) => w.id));
    const idMap = new Map(); // assembly id → applied id
    for (const w of frag) {
      let id = w.id;
      let n = 2;
      while (taken.has(id)) id = `${w.id.slice(0, 38)}-${n++}`;
      idMap.set(w.id, id);
      taken.add(id);
    }
    const remapId = (id) => idMap.get(id) || id;

    // ── 2. Param merge: same name + same shape → keep existing (user's live
    // value survives); same name + different shape → rename incoming and
    // repoint the fragment's {{param}} references (never reinterpret). ──
    const warnings = [];
    const mergedBlock = paramBlock && typeof paramBlock === 'object' && !Array.isArray(paramBlock) ? { ...paramBlock } : {};
    const paramMap = new Map(); // assembly param name → applied name
    for (const [name, def] of Object.entries(board.params || {})) {
      const existing = mergedBlock[name];
      const compatible = !existing
        || (existing.type === def.type && JSON.stringify(existing.options || []) === JSON.stringify(def.options || []));
      if (compatible) {
        paramMap.set(name, name);
        if (!existing) mergedBlock[name] = { ...def };
      } else {
        let n = 2;
        let newName = `${name.slice(0, 30)}-${n}`;
        while (mergedBlock[newName]) newName = `${name.slice(0, 30)}-${++n}`;
        mergedBlock[newName] = { ...def };
        paramMap.set(name, newName);
        warnings.push(`param “${name}” already exists with different options — added as “${newName}”`);
      }
    }
    const remapParam = (name) => paramMap.get(name) || name;

    // Rewrite a Board Controls spec string's param names (first field of
    // each line) that were renamed in the merge.
    const remapSpec = (spec) => String(spec || '').split('\n').map((line) => {
      const first = line.split('|')[0].trim();
      const mapped = paramMap.get(first);
      return mapped && mapped !== first ? line.replace(first, mapped) : line;
    }).join('\n');

    // ── 3. Build fragment configs: defaults underlay, refs remapped,
    // model-provided display title → config._title. ──
    const fragWidgets = frag.map((w) => {
      const def = WIDGET_TYPES[w.widgetType];
      const config = { ...(def?.defaults || {}) };
      const incoming = JSON.parse(JSON.stringify(w.config || {}));
      const str = JSON.stringify(incoming)
        .replace(/\{\{widget:([^}]+)\}\}/g, (m, id) => `{{widget:${remapId(String(id).trim())}}}`)
        .replace(/\{\{(?!widget:)([^}]+)\}\}/g, (m, name) => `{{${remapParam(name.trim())}}}`);
      const remapped = JSON.parse(str);
      const sourceKeys = (def?.configFields || []).filter((f) => f.type === 'source').map((f) => f.key);
      for (const k of sourceKeys) {
        if (remapped[k]) remapped[k] = remapId(String(remapped[k]).trim());
      }
      if (w.widgetType === 'boardControls' && remapped.spec) remapped.spec = remapSpec(remapped.spec);
      if (w.title) remapped._title = w.title;
      Object.assign(config, remapped);
      return { id: remapId(w.id), widgetType: w.widgetType, config };
    });

    // ── 4. Layout: append BELOW the current board in wiring order (concrete
    // y positions — validateDashboard requires numeric y), clamped by the
    // registry's per-widget constraints. ──
    const baseY = layout.reduce((m, l) => Math.max(m, (l.y || 0) + (l.h || 0)), 0);
    const fragLayout = fragWidgets.map((w, idx) => {
      const src = frag.find((f) => remapId(f.id) === w.id);
      const dl = WIDGET_TYPES[w.widgetType]?.defaultLayout || { w: 3, h: 3, minW: 2, minH: 2 };
      return {
        i: w.id,
        x: 0,
        y: baseY + idx * 2,
        w: Math.max(dl.minW ?? 2, Math.min(src.w || dl.w, dl.maxW ?? 12, 12)),
        h: Math.max(dl.minH ?? 2, Math.min(src.h || dl.h || 4, dl.maxH ?? 14, 14)),
        minW: dl.minW, minH: dl.minH,
        ...(dl.maxW != null ? { maxW: dl.maxW } : {}),
        ...(dl.maxH != null ? { maxH: dl.maxH } : {}),
      };
    });

    // ── 5. Gate: the FULL resulting board must pass validateDashboard. ──
    const allWidgets = [...widgets, ...fragWidgets];
    const allLayout = [...layout, ...fragLayout];
    const vd = validateDashboard({ version: CONFIG_VERSION, widgets: allWidgets, layout: allLayout, params: mergedBlock });
    if (!vd.valid) {
      setAssemblyToast({ message: `Assembled board rejected by validation: ${vd.errors[0]}`, error: true });
      return;
    }

    // ── 6. Apply: params state recomputed from the merged block (live
    // values survive — the block carries each param's chosen value). ──
    const { specs: newSpecs, values: newValues } = parseParams(mergedBlock);
    setWidgets(allWidgets);
    setLayout(allLayout);
    setParamBlock(Object.keys(mergedBlock).length ? mergedBlock : null);
    setParamSpecs(newSpecs);
    setParamValues(newValues);
    persist(allWidgets, allLayout, mergedBlock);
    const added = fragWidgets.length;
    const note = warnings.length ? ` · ${warnings.join(' · ')}` : '';
    setAssemblyToast({ message: `🧩 Added ${added} widget${added === 1 ? '' : 's'} below this board${note}`, prev });
  }, [widgets, layout, paramBlock, persist]);

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

const lastAutoH = useRef({});
// Content-based auto-fit (gallery-family widgets): the widget reports its
// natural pixel height after a successful load; fit the grid row height —
// but ONLY while the user hasn't resized it manually (h still equals the
// registry default or our last auto-applied value). Persists the fit.
const handleAutoHeight = useCallback((id, px) => {
  const item = layout.find((l) => l.i === id);
  if (!item) return;
  const wt = widgets.find((w) => w.id === id)?.widgetType;
  const defaultH = WIDGET_TYPES[wt]?.defaultLayout?.h ?? 3;
  const last = lastAutoH.current[id];
  if (item.h !== defaultH && item.h !== last) return; // user-managed size
  const m = kiosk || lean ? 4 : 12;
  const rows = Math.max(3, Math.min(14, Math.round(px / (80 + m))));
  if (rows === item.h) return;
  lastAutoH.current[id] = rows;
  const newLayout = layout.map((l) => (l.i === id ? { ...l, h: rows } : l));
  setLayout(newLayout);
  persist(widgets, newLayout);
}, [layout, widgets, kiosk, lean, persist]);

  const handleRemoveWidget = useCallback((id) => {
    const newWidgets = widgets.filter(w => w.id !== id);
    const newLayout = layout.filter(l => l.i !== id);
    setWidgets(newWidgets);
    setLayout(newLayout);
    persist(newWidgets, newLayout);
  }, [widgets, layout, persist]);

  const handleUpdateConfig = useCallback((id, newConfig) => {
    const target = widgets.find(w => w.id === id);
    const newWidgets = widgets.map(w =>
      w.id === id ? { ...w, config: newConfig } : w
    );
    setWidgets(newWidgets);
    persist(newWidgets, layout, paramBlock);
    // ISSUE-50: a Board Controls spec edit redefines the board's params.
    // Live values survive when the name still exists (kept if its value is
    // still among the options, else reset to the first option).
    if (target?.widgetType === 'boardControls' && 'spec' in newConfig) {
      const parsed = parseParamSpecText(newConfig.spec);
      setParamValues((prev) => {
        const next = {};
        for (const [name, entry] of Object.entries(parsed)) {
          const old = prev[name];
          next[name] = entry.options?.length
            ? (entry.options.includes(old) ? old : entry.options[0])
            : (old ?? '');
        }
        return next;
      });
      setParamSpecs(Object.fromEntries(Object.entries(parsed).map(([n, e]) => [
        n, { label: e.label, type: e.type || (e.options ? 'select' : 'text'), options: e.options },
      ])));
      setParamBlock(Object.keys(parsed).length ? parsed : null);
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        saved.params = Object.keys(parsed).length ? parsed : null;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      } catch { /* storage full/corrupt — params still live in memory */ }
      setReloadKey((k) => k + 1);
    }
  }, [widgets, layout, persist, paramBlock]);

  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setWidgets(DEFAULT_WIDGETS);
    setLayout(DEFAULT_LAYOUT);
    setWidgetOutputs({});
    setReloadKey((k) => k + 1);
  }, []);

  /** Replace the whole dashboard (example load / successful import). */
  const applyDashboard = useCallback((dashboard) => {
    const { specs, values } = parseParams(dashboard.params);
    setParamBlock(dashboard.params || null);
    setParamSpecs(specs);
    setParamValues(values);
    setWidgets(dashboard.widgets);
    setLayout(dashboard.layout);
    setWidgetOutputs({});
    persist(dashboard.widgets, dashboard.layout, dashboard.params);
    setReloadKey((k) => k + 1);
  }, [persist]);

  /** ISSUE-50 — write a board param; the reloadKey bump re-resolves every
   *  widget config referencing {{name}} and re-fetches them (config change →
   *  load() is the existing propagation trigger). */
  const handleSetParam = useCallback((name, value) => {    setParamValues((prev) => ({ ...prev, [name]: value }));
    setParamBlock((prev) => {
      const block = prev && typeof prev === 'object' ? { ...prev } : {};
      block[name] = { ...(block[name] || { label: name, type: 'text' }), value };
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        saved.params = block;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); // chosen value survives refresh
      } catch { /* storage full/corrupt — value still live in memory */ }
      return block;
    });
    setReloadKey((k) => k + 1);
  }, []);

  /** ISSUE-51 — a widget published its output. Value-compared so a consumer
   *  re-emitting an identical value is a no-op (no render storms). */
  const handleWidgetOutput = useCallback((id, value) => {
    setWidgetOutputs((prev) => {
      if (id in prev && JSON.stringify(prev[id]) === JSON.stringify(value)) return prev;
      return { ...prev, [id]: value };
    });
  }, []);

  // The `source` picker options: every widget on the board that can emit,
  // labeled by its INSTANCE ID + live header title so identical types and
  // renames stay distinguishable (ISSUE-53 — every widget is referrable by name).
  const sourceOptions = useMemo(
    () => widgets
      .filter((w) => WIDGET_TYPES[w.widgetType]?.emit)
      .map((w) => {
        const def = WIDGET_TYPES[w.widgetType];
        const label = def.labelFromConfig?.(w.config) || def.name || w.widgetType;
        return { id: w.id, label: `${def.icon} ${def.name} · ${w.id} — ${label}` };
      }),
    [widgets],
  );

  /** ISSUE-53 — rename a widget instance. Validates (non-empty, [A-Za-z0-9_-],
   *  unique), then either renames silently (no references) or opens the
   *  repoint dialog (references exist). Returns { ok, error?, pending? } so the
   *  ⚙ panel can surface inline validation errors.
   *  Resolution model (your question): dialog + atomic repoint — renaming
   *  repoints every `source` field and {{widget:id}} token across the whole
   *  board (never silently), and Cancel leaves everything untouched. */
  const applyRename = useCallback((id, newId) => {
    const newWidgets = widgets.map((w) =>
      w.id === id
        ? { ...w, id: newId, config: renameWidgetRefs(w.config, id, newId) }
        : { ...w, config: renameWidgetRefs(w.config, id, newId) },
    );
    const newLayout = layout.map((l) => (l.i === id ? { ...l, i: newId } : l));
    setWidgets(newWidgets);
    setLayout(newLayout);
    // ISSUE-53 fix: DO NOT clear all outputs on rename — consumers' reload
    // signatures compare against a per-frame prev ref, so a full clear made
    // producers re-emit IDENTICAL values post-rename and the signature
    // equality skipped the reload (chain froze at stale 0s). Only the renamed
    // widget's key goes stale: drop it; its remount re-emits under the new id
    // and its consumers re-source. Everyone else's outputs survive untouched.
    setWidgetOutputs((prev) => { const { [id]: _dropped, ...rest } = prev || {}; return rest; });
    persist(newWidgets, newLayout, paramBlock);
    setReloadKey((k) => k + 1);
  }, [widgets, layout, persist, paramBlock]);

  const handleRenameWidget = useCallback((id, newId) => {
    const trimmed = String(newId || '').trim();
    if (!trimmed || trimmed === id) return { ok: false, error: null }; // no-op
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return { ok: false, error: 'Use only letters, numbers, - and _ (references use {{widget:name}})' };
    }
    if (widgets.some((w) => w.id === trimmed)) {
      return { ok: false, error: `"${trimmed}" is already the name of another widget on this board` };
    }
    const refs = findWidgetRefs(widgets, id);
    if (refs.length) {
      setPendingRename({ id, newId: trimmed, refs });
      return { ok: true, pending: true };
    }
    applyRename(id, trimmed);
    return { ok: true };
  }, [widgets, applyRename]);

  const confirmRename = useCallback(() => {
    if (!pendingRename) return;
    applyRename(pendingRename.id, pendingRename.newId);
    setPendingRename(null);
  }, [pendingRename, applyRename]);

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

  // Board params (ISSUE-50): WidgetFrame resolves {{name}} placeholders
  // internally (resolvedConfig) — App passes RAW widget configs so the ⚙
  // editor edits what was authored and never bakes a resolved literal over
  // a placeholder (the "{{category}} lock-in" bug).
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
  onRename={handleRenameWidget}
  reloadKey={reloadKey}
 onAutoHeight={handleAutoHeight}
 paramSpecs={paramSpecs}
 paramValues={paramValues}
 onSetParam={handleSetParam}
 widgetOutputs={widgetOutputs}
 sourceOptions={sourceOptions}
 onOutput={handleWidgetOutput}
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
    <div className={`app ${kiosk ? 'kiosk' : lean ? 'lean' : ''}`}>
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
          <button className="btn btn-ask" onClick={() => setShowAskPanel(true)} title="Describe what you want - get widget suggestions (ML advisor)">
            ✨ Ask
          </button>
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
          <button className="btn" onClick={enterKiosk} title="Presentation mode — hides editing controls · Esc to exit">
            ⛶ Present
          </button>
          <button className="btn" onClick={enterLean} title="Lean mode — chrome-free like Present, but no fullscreen (resizable browser) · Esc to exit">
            ▣ Lean
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
 width={gridWidth}
 gridConfig={{ cols: 12, rowHeight: 80, margin: (kiosk || lean) ? [4, 4] : [12, 12], containerPadding: [0, 0] }}
 onLayoutChange={handleLayoutChange}
 dragConfig={{ handle: '.widget-header', cancel: '.no-drag' }}
 compactType="vertical"
 isDraggable={!(kiosk || lean)}
 isResizable={!(kiosk || lean)}
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
      {showAskPanel && (
        <AskPanel
          onAdd={handleAddWidget}
          onAddBoard={handleAddAssembly}
          onClose={() => setShowAskPanel(false)}
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
          lean={lean}
          onClose={() => setShowShare(false)}
        />
      )}

      {showAbout && (
        <AboutPanel onClose={() => setShowAbout(false)} />
      )}

      {assemblyToast && (
        <div className={`assembly-toast ${assemblyToast.error ? 'assembly-toast-error' : ''}`}>
          <span className="assembly-toast-msg">{assemblyToast.message}</span>
          {assemblyToast.prev && (
            <button
              className="assembly-toast-btn"
              onClick={() => {
                applyDashboard({ widgets: assemblyToast.prev.widgets, layout: assemblyToast.prev.layout, params: assemblyToast.prev.paramBlock });
                setAssemblyToast(null);
              }}
            >
              Undo
            </button>
          )}
          <button className="assembly-toast-close" onClick={() => setAssemblyToast(null)}>✕</button>
        </div>
      )}

      {showDiagnostics && (
        <DiagnosticsPanel onClose={() => setShowDiagnostics(false)} />
      )}

      {pendingRename && (
        <ConfirmDialog
          title={`Rename "${pendingRename.id}" to "${pendingRename.newId}"?`}
          message={`${pendingRename.refs.reduce((a, r) => a + r.refs, 0)} reference${pendingRename.refs.reduce((a, r) => a + r.refs, 0) === 1 ? '' : 's'} in ${pendingRename.refs.length} widget${pendingRename.refs.length === 1 ? '' : 's'} point to it (${pendingRename.refs.map((r) => `"${r.id}"`).join(', ')}) — they will be repointed to "${pendingRename.newId}". Cancel leaves everything unchanged.`}
          confirmLabel="Rename & repoint"
          onConfirm={confirmRename}
          onCancel={() => setPendingRename(null)}
        />
      )}

      {(kiosk || lean) && (
        <button className="kiosk-exit" onClick={exitPresent} title="Exit presentation mode (Esc)">
          ✕ Exit
        </button>
      )}
    </div>
  );
}
