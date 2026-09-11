import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { resolveParams, findUnresolvedRefs, describeUnresolvedRefs, selectParamNames } from '../lib/params';
import { getParamSource, suggestForSource, validateLookupValue, normalizeLookupValue } from '../lib/paramSources';
import { compactNum, trendYScale, TREND_Y_TOP, TREND_Y_BOT } from '../lib/format';
import { resolveMonth, fmtMonth } from '../lib/scope';
import { resolveSourceValue, widgetOutputSignature } from '../lib/dataflow';
import { WIDGET_TYPES } from './index';
import { renderMarkdown } from '../lib/markdown';
import { qrSvg, qrModuleCount } from '../lib/qr';
import { createSpeechController } from '../lib/speech';
import { loadPannellum } from '../lib/pannellumLoader';
import '../vendor/pannellum.css';

/**
 * Frame around every widget — handles loading, error, title bar, refresh.
 */

/** ISSUE-58: clickable `{{widget:id}}` reference chips under text/textarea
 *  config fields — the emitter list, precise and one click to insert. */
function RefChips({ emitters, onInsert }) {
  if (!emitters || emitters.length === 0) return null;
  return (
    <div className="config-refs">
      <span className="config-refs-label">Insert a reference</span>
      {emitters.map((o) => (
        <button
          key={o.id}
          type="button"
          className="config-ref-chip"
          title={`Insert a reference to ${o.label}`}
          onClick={() => onInsert(`{{widget:${o.id}}}`)}
        >{`{{widget:${o.id}}}`}</button>
      ))}
    </div>
  );
}

/** ISSUE-59: per-card board-param selection — a checkbox per declared param.
 *  The value is a comma-separated allow-list; empty = every board param. */
function ParamPicker({ value, paramSpecs, onChange }) {
  const entries = Object.entries(paramSpecs || {});
  if (entries.length === 0) {
    return (
      <small className="config-hint">
        No board params declared — add a <code>params</code> block to the dashboard JSON.
      </small>
    );
  }
  const current = new Set(String(value || '').split(',').map((s) => s.trim()).filter(Boolean));
  const toggle = (name) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    // store in declaration order for a stable value; empty = all params
    onChange(Object.keys(paramSpecs).filter((n) => next.has(n)).join(','));
  };
  return (
    <div className="config-param-picker">
      {entries.map(([name, spec]) => (
        <label key={name} className="config-param-option">
          <input type="checkbox" checked={current.has(name)} onChange={() => toggle(name)} />
          <span>{spec.label || name} <code>{name}</code></span>
        </label>
      ))}
      <small className="config-hint">Only checked params render on this card — none checked shows all.</small>
    </div>
  );
}
export default function WidgetFrame({ widget, onRemove, onUpdateConfig, onRename, reloadKey, onAutoHeight, paramSpecs, paramValues, onSetParam, widgetOutputs, sourceOptions, onOutput }) {
  // ISSUE-50: resolve {{param}} placeholders ONCE here — the DATA path (fetch,
  // transform, titles, refresh interval) uses the resolved config; the ⚙ editor
  // path (config panel, handleConfigChange) deliberately uses the RAW
  // widget.config so a field edit never bakes a placeholder's resolved value
  // into the stored config (the "{{category}} lock-in" bug: editing
  // sampleCount used to overwrite category with the literal category name).
  // The placeholder stays visible in the ⚙ form — provenance, and overwriting
  // it manually is the documented freeze/override escape hatch.
  const resolvedConfig = useMemo(
    () => resolveParams(widget.config, paramValues, widgetOutputs),
    [widget.config, paramValues, widgetOutputs],
  );
  // ISSUE-51 (widget-to-widget dataflow): the emitted value of the widget this
  // one `source`s from, if any — structured access; `{{widget:id}}` interpolation
  // in any string field is a second, string-level pathway (see params.js).
  const sourceOutputValue = useMemo(
    () => resolveSourceValue(resolvedConfig, widgetOutputs),
    [resolvedConfig, widgetOutputs],
  );
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [showConfig, setShowConfig] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [copied, setCopied] = useState(false);
  // ISSUE-53: editable instance name (draft field in ⚙; committed on Apply →
  // onRename which dialogs + repoints any references). Re-synced when the id
  // actually changes (rename remounts the frame via React key, so this is
  // mostly belt-and-braces for load/import paths).
  const [instanceName, setInstanceName] = useState(widget.id);
  const [nameError, setNameError] = useState(null);
  useEffect(() => { setInstanceName(widget.id); }, [widget.id]);
  const intervalRef = useRef(null);
  // Request-serial guard: each load() claims a sequence number; only the
  // LATEST run may write state. Prevents a slow fetch started under an old
  // config/params (60 s SPARQL, batched imageinfo…) from landing after a
  // newer run and clobbering its result — the classic stale-write race that
  // compounds the moment widgets consume changing {{param}} feeds.
  const loadSeqRef = useRef(0);
  // Latest onAutoHeight via ref — load()'s closure must not go stale as the
  // app's layout state changes (content-based auto-fit, see App.onAutoHeight).
  const onAutoHeightRef = useRef(onAutoHeight);
  onAutoHeightRef.current = onAutoHeight;
  const def = WIDGET_TYPES[widget.widgetType];

  // Header shows the analyzed asset (from config, live) unless the user
  // explicitly set a custom _title. Falls back to the generic widget name.
  const headerTitle =
    resolvedConfig._title && resolvedConfig._title !== def?.name
      ? resolvedConfig._title
      : def?.labelFromConfig?.(resolvedConfig) || def?.name || widget.widgetType;

  // Header tooltip carries the internal slug too — the canonical identifier
  // used in the registry, dashboard.json widgetType, and bug reports.
  const headerTooltip = def
    ? `${def.name} (${def.id}) · ${headerTitle}`
    : headerTitle;

  // Renderer can depend on config (e.g. pageviews stat vs trend display mode).
  const renderer = def?.getRenderer?.(resolvedConfig) || def?.renderer || 'StatCard';

  const fmtRefresh = (secs) => {
    const s = secs || 3600;
    return s >= 3600 ? `${s / 3600}h` : `${s / 60}m`;
  };

  // Escape closes the info panel (same pattern as SharePanel).
  useEffect(() => {
    if (!showInfo) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowInfo(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showInfo]);

  // Copy a self-contained debug report for bug reports: the widget's
  // internal slug, its resolved renderer, the live config, freshness, and
  // the last error (if any) — everything an agent needs to reproduce.
  const debugInfo = () => JSON.stringify({
    widgetType: widget.widgetType,
    name: def?.name ?? null,
    icon: def?.icon ?? null,
    renderer,
    timeScope: def?.timeScope ?? null,
    config: resolvedConfig,
    fetchedAt: state.data?._fetchedAt ?? null,
    error: state.error ?? null,
  }, null, 2);

  const copyDebug = async () => {
    const text = debugInfo();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Legacy fallback for non-secure contexts.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Compact "what is this widget analyzing right now" summary, auto-built
  // from the registry configFields labels + live config values.
  const configSummary = () => {
    const parts = [];
    for (const f of def?.configFields || []) {
      const v = widget.config[f.key];
      if (v === undefined || v === null || v === '') continue;
      if (f.type === 'preset') {
        const p = (f.presets || []).find((x) => x.id === v);
        parts.push(`${f.label}: ${p ? p.label : v}`);
      } else if (f.type === 'select') {
        const o = (f.options || []).find((x) => x.value === v);
        parts.push(`${f.label}: ${o ? o.label : v}`);
      } else if (f.type === 'boolean') {
        parts.push(`${f.label}: ${v ? 'on' : 'off'}`);
      } else if (f.type === 'textarea') {
        const s = String(v);
        parts.push(`${f.label}: ${s.length > 48 ? s.slice(0, 48) + '…' : s}`);
      } else {
        parts.push(`${f.label}: ${v}`);
      }
    }
    return parts;
  };

  const TIME_SCOPE_LABELS = {
    month: 'Monthly data',
    range: 'Date range',
    day: 'Single day',
    point: 'Point-in-time',
  };


  const load = useCallback(async (force) => {
    // ISSUE-51: publish this widget's output to the board so consumers can
    // source from it. Runs in BOTH the static and fetch paths (the dataflow
    // producers — Text List / Filter / Count / Echo — are all static).
    // Skip undefined (an echo with no input isn't a value).
    const publishOutput = (transformed) => {
      if (def.emit && onOutput) {
        const emitted = def.emit(transformed, resolvedConfig);
        if (emitted !== undefined) onOutput(widget.id, emitted);
      }
    };
    if (!WIDGET_TYPES[widget.widgetType]?.fetch) {
      // Static widget (no fetch): render straight from config — the
      // transform also sees its `source` output (dataflow, ISSUE-51).
      const transformed = WIDGET_TYPES[widget.widgetType]?.transform
        ? WIDGET_TYPES[widget.widgetType].transform(null, resolvedConfig, { sourceOutput: sourceOutputValue })
        : null;
      setState({ loading: false, error: null, data: transformed, waiting: null });
      publishOutput(transformed);
      return;
    }
    // ISSUE-58: NEVER send an unresolved `{{…}}` placeholder to an API as if it
    // were content (MinT used to translate the literal token). Wait for the
    // producer; the output signature re-runs this load the moment it emits.
    const unresolved = findUnresolvedRefs(resolvedConfig);
    if (unresolved.length) {
      setState({ loading: false, error: null, data: null, waiting: unresolved });
      return;
    }
    const seq = ++loadSeqRef.current; // this run owns the state until a newer run starts
    setState(s => ({ ...s, loading: true, error: null, waiting: null }));
    try {
      const data = await def.fetch(resolvedConfig, { force, sourceOutput: sourceOutputValue }); // force = bust TTL/SWR caches (manual ↻ / Apply)
      if (seq !== loadSeqRef.current) return; // superseded — a newer run is in flight
      const transformed = def.transform(data, resolvedConfig, { sourceOutput: sourceOutputValue });

      transformed._fetchedAt = Date.now(); // freshness constitution: every live widget stamps its last run
      setState({ loading: false, error: null, data: transformed });
  // Content-based auto-fit: registry entries may declare autoHeight(view, config)
  // → px; the app fits the grid row height once (unless the user resized manually).
  const autoPx = def.autoHeight ? def.autoHeight(transformed, resolvedConfig) : null;
  if (autoPx && onAutoHeightRef.current) onAutoHeightRef.current(widget.id, autoPx);
      publishOutput(transformed);
    } catch (e) {
      if (seq !== loadSeqRef.current) return; // a stale failure must not blank a fresh result
      setState({ loading: false, error: e.message, data: null });
    }
  }, [widget.widgetType, resolvedConfig, def, sourceOutputValue, widget.id, onOutput]);

  // Load on mount, on widget-type change, or when the app signals a full
  // reload (reloadKey bumped by import / example / reset). Config edits
  // do NOT auto-reload — the ⚙ panel is a draft surface; Apply & Reload
  // (or ↻) commits. No speculative fetches while typing ("C", "Ca",
  // "Cat" must not each hit the APIs).
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, widget.widgetType]);

  // ISSUE-51 (widget-to-widget dataflow): re-load when a PRODUCER's output
  // changes — via a `source` config field or any {{widget:id}} reference in
  // this config. The signature is content-based, so a producer re-emitting an
  // identical value is a no-op (no refresh storms, no emit→reload→emit loops).
  // Deliberately built from the RAW config: resolution has already replaced
  // {{widget:id}} with the value, so the refs are only visible pre-resolution.
  const outputSig = useMemo(() => widgetOutputSignature(widget.config, widgetOutputs), [widget.config, widgetOutputs]);
  const prevOutputSigRef = useRef(null);
  useEffect(() => {
    if (outputSig !== null && outputSig !== prevOutputSigRef.current) {
      prevOutputSigRef.current = outputSig;
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputSig]);

  // Auto-refresh (static widgets have nothing to refresh)
  useEffect(() => {
    if (!WIDGET_TYPES[widget.widgetType]?.fetch) return;
    const secs = (resolvedConfig.refreshSeconds || 3600) * 1000;
    intervalRef.current = setInterval(load, secs);
    return () => clearInterval(intervalRef.current);
  }, [load, resolvedConfig.refreshSeconds]);

  // Invalidate any in-flight load on unmount — a slow fetch must not write
  // state after the widget is removed from the board.
  useEffect(() => () => { loadSeqRef.current += 1; }, []);

  const handleConfigChange = (key, value) => {
    onUpdateConfig(widget.id, { ...widget.config, [key]: value });
  };

  // ISSUE-58: emitter chips — every OTHER widget on the board that can emit,
  // shown under text/textarea config fields so `{{widget:id}}` references are
  // discoverable and inserted precisely (no typing ids from memory).
  const fieldRefs = useRef({});
  const refEmitters = useMemo(
    () => (sourceOptions || []).filter((o) => o.id !== widget.id),
    [sourceOptions, widget.id],
  );
  const insertRef = (key, token) => {
    const el = fieldRefs.current[key];
    const current = widget.config[key] || '';
    const start = el && typeof el.selectionStart === 'number' ? el.selectionStart : current.length;
    const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : current.length;
    handleConfigChange(key, current.slice(0, start) + token + current.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + token.length;
      try { el.setSelectionRange(pos, pos); } catch { /* inputs always support it */ }
    });
  };

  // ISSUE-53: commit the ⚙ name field — validation, then onRename (which may
  // open the repoint dialog when other widgets reference this id). Returns
  // true when the name is fine (so Apply can proceed); false leaves the panel
  // open with an inline error so the user can fix it.
  const commitRename = () => {
    const trimmed = instanceName.trim();
    setNameError(null);
    if (trimmed === widget.id) return true;
    if (!trimmed) { setNameError('Name cannot be empty'); return false; }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setNameError('Use only letters, numbers, - and _ (other widgets reference this as {{widget:name}} or via the source picker)');
      return false;
    }
    const r = onRename?.(widget.id, trimmed);
    if (r && r.ok === false && r.error) { setNameError(r.error); return false; }
    if (r && r.pending) setShowConfig(false); // dialog opens over the board; panel closes
    return true;
  };

  return (
    <div className="widget-frame">
      <div className="widget-header">
        <span className="widget-title" title={headerTooltip}>
          {def?.icon} {headerTitle}
          <span
            className="widget-id-chip"
            title="Instance name — how other widgets refer to this box (⚙ to rename; renames repoint references)"
            onClick={(e) => { e.stopPropagation(); setShowConfig(true); }}
          >{widget.id}</span>
        </span>
        <div className="widget-actions">
          <button
            className="widget-btn"
            onClick={() => { setShowInfo(!showInfo); setShowConfig(false); }}
            title="About this widget"
          >ⓘ</button>
          <button
            className="widget-btn"
            onClick={() => { setShowConfig(!showConfig); setShowInfo(false); }}
            title="Configure"
          >⚙</button>
          <button className="widget-btn" onClick={() => load(true)} title="Refresh">↻</button>
          <button
            className="widget-btn widget-btn-remove"
            onClick={() => onRemove(widget.id)}
            title="Remove"
          >✕</button>
        </div>
      </div>

      {showConfig && (
        <div className="widget-config">
          {/* ISSUE-53: instance identity + display title — every widget is
              referrable by a consistent, editable name. The name renames the
              id (dialog + repoint when others reference it); the title is the
              optional display override (config._title, header only). */}
          <div className="config-field config-name-field">
            <label>Name</label>
            <input
              type="text"
              value={instanceName}
              onChange={(e) => { setInstanceName(e.target.value); setNameError(null); }}
              placeholder="my-widget"
            />
            {/* ISSUE-54: one short line only — the old sentence wrapped to ~7
                lines on a 3-column card and cost 67–93px of panel height.
                The full explanation lives in the tooltip (and the rename
                dialog restates it when references actually need repointing). */}
            {nameError
              ? <small className="config-hint config-error">{nameError}</small>
              : (
                <small
                  className="config-hint"
                  title="How other widgets reference this box: {{widget:name}} in any config field, or the source picker. Renaming repoints references automatically."
                >{'{{widget:' + widget.id + '}}'}</small>
              )}
          </div>
          <div className="config-field">
            <label>Display title (optional)</label>
            <input
              type="text"
              value={widget.config._title || ''}
              onChange={(e) => handleConfigChange('_title', e.target.value)}
              placeholder="auto — e.g. the item being analyzed"
            />
          </div>
          {(def?.configFields || []).map(field => (
            <div key={field.key} className="config-field">
              <label>{field.label}</label>
              {field.type === 'select' || field.type === 'preset' ? (
                <select
                  value={widget.config[field.key] || ''}
                  onChange={e => { const v = e.target.value; if (field.type === 'preset') { const p = (field.presets || []).find(x => x.id === v); onUpdateConfig(widget.id, { ...widget.config, [field.key]: v, query: p ? p.query : widget.config.query, endpoint: p ? p.endpoint : widget.config.endpoint }); } else { handleConfigChange(field.key, v); } }}
                >
                  {field.options.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : field.type === 'source' ? (
                <div className="config-source-wrap">
                  {/* ISSUE-53: one consistent source control everywhere — a
                      combobox: dropdown of emitting widgets (datalist) AND
                      manual id entry. The picker lists every emitting widget
                      by instance id; typing a literal id works too. */}
                  <input
                    className="config-source-input"
                    list={`source-dl-${widget.id}`}
                    value={widget.config[field.key] || ''}
                    onChange={(e) => handleConfigChange(field.key, e.target.value)}
                    placeholder="— none — or type an instance id"
                  />
                  <datalist id={`source-dl-${widget.id}`}>
                    {(sourceOptions || [])
                      .filter((o) => o.id !== widget.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                  </datalist>
                  {field.hint && <small className="config-hint">{field.hint}</small>}
                </div>
              ) : field.type === 'params' ? (
                <ParamPicker
                  value={widget.config[field.key] || ''}
                  paramSpecs={paramSpecs}
                  onChange={(v) => handleConfigChange(field.key, v)}
                />
              ) : field.type === 'boolean' ? (
                <input
                  type="checkbox"
                  className="config-checkbox"
                  checked={!!widget.config[field.key]}
                  onChange={e => handleConfigChange(field.key, e.target.checked)}
                />
              ) : field.type === 'number' ? (
                <div className="config-number-wrap">
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    value={widget.config[field.key] || ''}
                    onChange={e => handleConfigChange(field.key, parseInt(e.target.value) || 0)}
                    placeholder={field.placeholder}
                  />
                  {(field.hint || (field.min !== undefined && field.max !== undefined)) && (
                    <small className="config-hint">
                      {field.hint}
                      {field.hint && field.min !== undefined && field.max !== undefined && ' · '}
                      {field.min !== undefined && field.max !== undefined && `${field.min}–${field.max.toLocaleString()}`}
                    </small>
                  )}
                </div>
              ) : field.type === 'textarea' ? (
                <div className="config-input-wrap">
                  <textarea
                    ref={(el) => { fieldRefs.current[field.key] = el; }}
                    value={widget.config[field.key] || ''}
                    onChange={e => handleConfigChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={field.rows || 6}
                  />
                  {!field.noRefs && <RefChips emitters={refEmitters} onInsert={(token) => insertRef(field.key, token)} />}
                </div>
              ) : (
                <div className="config-input-wrap">
                  <input
                    type="text"
                    ref={(el) => { fieldRefs.current[field.key] = el; }}
                    value={widget.config[field.key] || ''}
                    onChange={e => handleConfigChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                  />
                  {!field.noRefs && <RefChips emitters={refEmitters} onInsert={(token) => insertRef(field.key, token)} />}
                </div>
              )}
            </div>
          ))}
          <button className="widget-btn widget-btn-apply" onClick={() => { if (commitRename()) { setShowConfig(false); load(true); } }}>
            Apply & Reload
          </button>
        </div>
      )}

      {showInfo && (
        <div className="widget-info">
          <div className="widget-info-head">
            <span className="widget-info-name">{def?.icon} {def?.name || widget.widgetType}</span>
            <code className="widget-info-slug" title="Instance id — the stable name other widgets use to reference this box">{widget.id}</code>
          </div>
          {def?.id && (
            <div className="widget-info-row">
              <span className="widget-info-label">Type</span>
              <span><code>{def.id}</code></span>
            </div>
          )}
          {def?.description && <p className="widget-info-desc">{def.description}</p>}
          {def?.dataSource && (
            <div className="widget-info-row">
              <span className="widget-info-label">Data</span>
              <span>{def.dataSource}</span>
            </div>
          )}
          {configSummary().length > 0 && (
            <div className="widget-info-row">
              <span className="widget-info-label">Analyzing</span>
              <span>{configSummary().join(' · ')}</span>
            </div>
          )}
          {def?.timeScope && (
            <div className="widget-info-row">
              <span className="widget-info-label">Time scope</span>
              <span>{TIME_SCOPE_LABELS[def.timeScope] || def.timeScope}</span>
            </div>
          )}
          {def?.intensity && def.intensity !== 'low' && (
            <div className="widget-info-row">
              <span className="widget-info-label">Intensity</span>
              <span>{def.intensity === 'high' ? 'high — live scan/query, may take 10–60 s' : 'medium — extra fetches, may add a few seconds'}</span>
            </div>
          )}
          {def?.fetch && (
            <div className="widget-info-row">
              <span className="widget-info-label">Auto-refresh</span>
              <span>every {fmtRefresh(resolvedConfig.refreshSeconds)}</span>
            </div>
          )}
          {state.data?._fetchedAt && (
            <div className="widget-info-row">
              <span className="widget-info-label">Last updated</span>
              <span>{new Date(state.data._fetchedAt).toLocaleString()}</span>
            </div>
          )}
          {state.error && (
            <div className="widget-info-row widget-info-error">
              <span className="widget-info-label">Last error</span>
              <span>{state.error}</span>
            </div>
          )}
          <div className="widget-info-actions">
            <button className="widget-btn widget-btn-apply" onClick={copyDebug}>
              {copied ? '✓ Copied' : 'Copy debug info'}
            </button>
          </div>
        </div>
      )}

      <div className="widget-body">
        {state.loading && (
        <div className="widget-loading">
          {def?.intensity === 'high'
            ? (def?.loadingHint || 'Running a live scan — may take 10–60 s…')
            : 'Loading…'}
        </div>
      )}
        {state.error && (
          <div className="widget-error">
            <span>⚠ {state.error}</span>
            <button className="widget-btn" onClick={load}>Retry</button>
          </div>
        )}
        {state.waiting && !state.loading && !state.data && (
          <div className="widget-waiting">
            <span className="widget-waiting-icon" aria-hidden="true">⏳</span>
            <div className="widget-waiting-text">
              <div className="widget-waiting-title">Waiting for a reference</div>
              <div className="widget-waiting-detail">{describeUnresolvedRefs(state.waiting)}</div>
              <div className="widget-waiting-hint">
                No request was sent — this widget loads automatically once the reference resolves.
              </div>
            </div>
          </div>
        )}
        {state.data && !state.loading && (
  <>
    <WidgetContent type={renderer} data={state.data} paramSpecs={paramSpecs} paramValues={paramValues} onSetParam={onSetParam} />
    {def?.fetch && (
      <div className="widget-fetched" title={`Last fetched: ${new Date(state.data._fetchedAt).toLocaleString()}`}>
        ⏱ updated {new Date(state.data._fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · auto-refresh {fmtRefresh(resolvedConfig.refreshSeconds)}
      </div>
    )}
  </>
)}
 </div>
 </div>
  );
}

function WidgetContent({ type, data, paramSpecs, paramValues, onSetParam }) {
  switch (type) {
    case 'StatCard': return <StatCard data={data} />;
    case 'RankingCard': return <RankingCard data={data} />;
    case 'TrendCard': return <TrendCard data={data} />;
    case 'GlamCard': return <GlamCard data={data} />;
    case 'MarkdownCard': return <MarkdownCard data={data} />;
    case 'QrCard': return <QrCard data={data} />;
    case 'BoardControlsCard': return <BoardControlsCard data={data} paramSpecs={paramSpecs} paramValues={paramValues} onSetParam={onSetParam} />;
    case 'SpeakerCard': return <SpeakerCard data={data} onSetParam={onSetParam} />;
    case 'TopPagesExpandedCard': return <TopPagesExpandedCard data={data} />;
    case 'ExcerptCard': return <ExcerptCard data={data} />;
    case 'EditHistoryCard': return <EditHistoryCard data={data} />;
    case 'TranslateCard': return <TranslateCard data={data} />;
    case 'QualityCard': return <QualityCard data={data} />;
    case 'AssessmentsCard': return <AssessmentsCard data={data} />;
    case 'GalleryGridCard': return <GalleryGridCard data={data} />;
    case 'GalleryListCard': return <GalleryListCard data={data} />;
case 'MediaPlayerCard': return <MediaPlayerCard data={data} />;
    case 'ArticleListCard': return <ArticleListCard data={data} />;

    case 'ListSourceCard': return <ListSourceCard data={data} />;
    case 'EchoCard': return <EchoCard data={data} />;

    case 'SparqlCard': return <SparqlCard data={data} />;

    case 'WikiPageCard': return <WikiPageCard data={data} />;

    case 'CimSnapshotCard': return <CimSnapshotCard data={data} />;

    case 'CimTopFilesCard': return <CimTopFilesCard data={data} />;

    case 'FileTrafficCard': return <FileTrafficCard data={data} />;
    case 'WaybackGalleryCard': return <WaybackGalleryCard data={data} />;
    default: return <StatCard data={data} />;
  }
}

function StatCard({ data }) {
  return (
    <div className="stat-card">
      {data.title && <div className="stat-title" title={data.title}>{data.title}</div>}
      {data.subtitle && <div className="stat-subtitle">{data.subtitle}</div>}
      <div className="stat-value">{data.value ?? '—'}</div>
      <div className="stat-detail">{data.detail}</div>
      {data.trend && data.trend.length > 0 && (
        <div className="mini-sparkline">
          {data.trend.map((t, i) => {
            const max = Math.max(...data.trend.map(d => d[Object.keys(d)[1]]));
            const h = max > 0 ? (t[Object.keys(t)[1]] / max) * 30 : 0;
            return (
              <div
                key={i}
                className="spark-bar"
                style={{ height: `${Math.max(h, 1)}px` }}
                title={`${t.date || t[Object.keys(t)[0]]}: ${t[Object.keys(t)[1]]}`}
              />
            );
          })}
          <span className="spark-label">{data.trendLabel}</span>
        </div>
      )}
      {data.sample && data.sample.length > 0 && (
        <div className="sample-strip">
          {data.sample.map((img, i) => (
            <a
              key={i}
              className="sample-thumb"
              href={`https://commons.wikimedia.org/wiki/${encodeURIComponent(img.title)}`}
              target="_blank"
              rel="noopener noreferrer"
              title={img.title.replace(/^File:/, '')}
            >
              <img src={img.url} alt={img.title} loading="lazy" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function RankingCard({ data }) {
  const colClass = (i) => (data.colClasses?.[i] ? `ranking-col ${data.colClasses[i]}` : `ranking-col col-${i}`);
  return (
    <div className="ranking-card">
      {data.title && <div className="ranking-title" title={data.title}>{data.title}</div>}
      {data.subtitle && <div className="ranking-subtitle">{data.subtitle}</div>}
      {data.image?.url && (
        <a
          className="card-image"
          href={`https://commons.wikimedia.org/wiki/${encodeURIComponent(data.fileTitle || data.title)}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open on Commons"
        >
          <img src={data.image.url} alt={data.title} loading="lazy" />
        </a>
      )}
      {data.caption && <div className="card-caption">{data.caption}</div>}
      {data.columns && (
        <div className="ranking-header">
          {/* spacer matching the row rank-num, so header aligns with rows */}
          <span className="rank-num" />
          {data.columns.map((col, i) => (
            <span key={i} className={colClass(i)}>{col}</span>
          ))}
        </div>
      )}
      <div className="ranking-rows">
        {(data.rows || []).map((row, i) => (
          <div key={i} className="ranking-row">
            <span className="rank-num">{i + 1}.</span>
            {row.map((cell, j) => (
              <span key={j} className={colClass(j)} title={typeof cell === 'object' ? cell.text : String(cell)}>
                {typeof cell === 'object' && cell.links ? (
                  <span className="ranking-multi">
                    <span className="ranking-multi-name">{cell.text}</span>
                    <span className="ranking-multi-links">
                      {cell.links.map((l, k) => (
                        <a key={k} className="ranking-link" href={l.href} target="_blank" rel="noopener noreferrer">[{l.label}]</a>
                      ))}
                    </span>
                  </span>
                ) : (typeof cell === 'object' && cell.href ? (
                  <a className="ranking-link" href={cell.href} target="_blank" rel="noopener noreferrer">{cell.text}</a>
                ) : (typeof cell === 'object' ? cell.text : cell))}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function GlamCard({ data }) {
  return (
    <div className="glam-card">
      {data.title && (
        <div className="stat-title" title={data.title}>
          {data.href
            ? <a href={data.href} target="_blank" rel="noopener noreferrer">{data.title}</a>
            : data.title}
        </div>
      )}
      {data.subtitle && <div className="stat-subtitle">{data.subtitle}</div>}
      {data.emptyHint && <div className="widget-empty glam-empty">{data.emptyHint}</div>}
      {!data.emptyHint && (
      <div className="glam-stats">
        {(data.stats || []).map((s, i) => (
          <div key={i} className="glam-stat">
            <div className="glam-stat-value" title={s.value}>{s.value}</div>
            <div className="glam-stat-label">{s.label}</div>
            {s.sub && <div className="glam-stat-sub">{s.sub}</div>}
          </div>
        ))}
      </div>
      )}
      {data.filmstrip && data.filmstrip.length > 0 && (
        <div className="sample-strip">
          {data.filmstrip.map((img, i) => (
            <a
              key={i}
              className="sample-thumb"
              href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(img.title)}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`${img.title}: ${img.views.toLocaleString()} views`}
            >
              <img src={img.thumbUrl} alt={img.title} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {data.detail && data.detail.rows && data.detail.rows.length > 0 && (
        <div className="ranking-card glam-detail">
          {data.detail.title && (
            <div className="ranking-title" title={data.detail.title}>
              {data.detail.titleHref
                ? <a className="ranking-link" href={data.detail.titleHref} target="_blank" rel="noopener noreferrer">{data.detail.title}</a>
                : data.detail.title}
            </div>
          )}
          <div className="ranking-header">
            <span className="ranking-col col-0">Wiki</span>
            <span className="ranking-col col-1">Page</span>
            <span className="ranking-col col-2">Views</span>
          </div>
          <div className="ranking-rows">
            {data.detail.rows.map((row, i) => (
              <div key={i} className="ranking-row">
                <span className="ranking-col col-0" title={row.wiki}>{row.wiki.replace(/\.org$/, '')}</span>
                <span className="ranking-col col-1" title={`${row.wiki}:${row.page}`}>
                  {row.href
                    ? <a className="ranking-link" href={row.href} target="_blank" rel="noopener noreferrer">{row.page}</a>
                    : row.page}
                </span>
                <span className="ranking-col col-2">{row.views.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TrendCard({ data }) {
  const { chartData, chartKey, chartLabel } = data;
  if (!chartData || chartData.length === 0) return <div className="widget-empty">No trend data</div>;

  // ISSUE-42: the sparkline's Y scale — min–max by default (variation stays
  // visible for series that live far from zero), zero-based via the ⚙ toggle
  // (the statistically honest view for magnitude comparisons). Either way
  // the tick labels + gridlines say exactly what vertical position means.
  const scale = trendYScale(chartData.map((d) => d[chartKey]), { zero: !!data.zeroY });
  const { min, max, ticks, yAt } = scale;
  const range = max - min || 1;

  const points = chartData.map((d, i) => {
    const x = (i / (chartData.length - 1)) * 100;
    const y = yAt(d[chartKey]);
    return `${x},${y}`;
  }).join(' ');

  const latest = chartData[chartData.length - 1]?.[chartKey];

  return (
    <div className="trend-card">
      {data.title && <div className="trend-title" title={data.title}>{data.title}</div>}
      {data.subtitle && <div className="trend-subtitle">{data.subtitle}</div>}
      <div className="trend-plot">
        <div className="trend-ylabels" aria-hidden="true">
          {ticks.map((t, i) => (
            <span key={i} style={{ top: `${t.y}%` }}>{compactNum(t.v)}</span>
          ))}
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="trend-svg" role="img"
          aria-label={`${chartLabel || 'trend'}: latest ${Number(latest).toLocaleString()} · min ${Number(min).toLocaleString()} · max ${Number(max).toLocaleString()}`}>
          <title>{`${chartLabel || 'trend'} — latest ${Number(latest).toLocaleString()} · min ${Number(min).toLocaleString()} · max ${Number(max).toLocaleString()}`}</title>
          {ticks.map((t, i) => (
            <line key={i} x1="0" x2="100" y1={t.y} y2={t.y} className="trend-gridline" vectorEffect="non-scaling-stroke" />
          ))}
          <polyline
            points={points}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <polygon
            points={`0,${TREND_Y_BOT} ${points} 100,${TREND_Y_BOT}`}
            fill="var(--accent)"
            fillOpacity="0.1"
          />
        </svg>
      </div>
      <div className="trend-labels">
        <span>{chartData[0]?.[Object.keys(chartData[0])[0]]}</span>
        <span>{chartLabel}</span>
        <span>{chartData[chartData.length - 1]?.[Object.keys(chartData[chartData.length - 1])[0]]}</span>
      </div>
    </div>
  );
}

function MarkdownCard({ data }) {
  return (
    <div
      className="markdown-card"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(data.markdown, { allowExternalImages: data.allowExternalImages }) }}
    />
  );
}

/** QR Code (ISSUE-65) — encodes any text/URL locally and renders it as inline
 *  SVG. White code area + quiet zone: a QR needs a light background and a
 *  margin to scan, and this one must also scan as a printed or saved file
 *  (Save SVG). The payload never leaves the page — no shortener, no redirect
 *  hop, no scan analytics, which is the whole point of the widget. */
function QrCard({ data }) {
  const text = data?.text || '';
  const ecLevel = data?.ecLevel || null;
  const margin = data?.margin ?? 4;
  const [saved, setSaved] = useState(false);
  const svg = useMemo(() => {
    if (!text.trim() || !ecLevel) return null;
    try {
      const label = `QR code: ${text.length > 80 ? `${text.slice(0, 80)}…` : text}`;
      return qrSvg(text, { ecLevel, margin, label });
    } catch {
      return null; // encoder refused (payload too large for any version)
    }
  }, [text, ecLevel, margin]);
  const modules = svg ? qrModuleCount(text, ecLevel) : null;

  // Client-side download: the SVG carries its own white quiet zone, so the
  // saved file scans on its own (print it, paste it into a sign).
  const saveSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qr-code.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  if (!text.trim()) {
    return <div className="widget-empty">Nothing to encode yet — add a URL or some text in ⚙.</div>;
  }
  if (data?.tooLong) {
    return (
      <div className="widget-empty">
        ⚠ {text.length.toLocaleString()} characters is too long for a scannable QR code
        (max {(data.maxChars || 1500).toLocaleString()}). Shorten the URL — a wiki short link
        (w.wiki) or a category/PetScan URL stays scannable.
      </div>
    );
  }
  if (!svg) {
    return (
      <div className="widget-empty">
        ⚠ This text does not fit any QR version (max {(data?.maxBytes || 2953).toLocaleString()} bytes).
      </div>
    );
  }
  return (
    <div className="qr-card">
      <div className="qr-code-wrap" dangerouslySetInnerHTML={{ __html: svg }} />
      {data.caption ? <div className="qr-caption">{data.caption}</div> : null}
      <div className="qr-meta">
        <span>EC {ecLevel}</span>
        <span>{modules}×{modules}</span>
        <span>{text.length.toLocaleString()} chars</span>
        <button
          className="qr-save"
          onClick={saveSvg}
          title="Download this QR as a standalone SVG (white quiet zone included)"
        >{saved ? '✓ Saved' : 'Save SVG'}</button>
      </div>
      {(data.note || data.dense) && (
        <div className="qr-notes">
          {data.note ? <span className="qr-warn">{data.note}</span> : null}
          {data.dense ? <span className="qr-warn">dense — scan from a larger card, or print it</span> : null}
        </div>
      )}
    </div>
  );
}

/** Translator (MinT) — machine translation via Wikimedia MinT (no key, no
 *  proxy; CORS verified 2026-09-05). Renders original + translation + the
 *  serving model. Fetch errors (unsupported pair etc.) surface through the
 *  widget error path with a friendly message. */
function TranslateCard({ data }) {
  const orig = data?.original || '';
  const tr = data?.translation || '';
  const lang = (c) => String(c || '').toUpperCase();
  return (
    <div className="translate-card">
      {orig && (
        <div className="translate-block">
          <div className="translate-lang">{lang(data?.from)}</div>
          <div className="translate-original">{orig}</div>
        </div>
      )}
      <div className="translate-arrow">↓</div>
      <div className="translate-block">
        <div className="translate-lang">
          {lang(data?.to)}{data?.model ? ` · ${data.model}` : ''}
        </div>
        <div className="translate-result">
          {tr || <span className="widget-empty">No translation yet.</span>}
        </div>
      </div>
      {data?.truncated && <div className="translate-note">Translated the first 8,000 characters.</div>}
    </div>
  );
}

/** Board Controls (ISSUE-50) — renders one control group per declared board
 *  param (buttons / select / text); a change writes the param via onSetParam,
 *  which re-resolves every widget config referencing {{param}} and bumps
 *  reloadKey → referencing widgets re-fetch. The specs/values/setter arrive
 *  as WidgetFrame props (only this renderer consumes them) — `data` is just
 *  the card's own config (title). */
function BoardControlsCard({ data, paramSpecs, paramValues, onSetParam }) {
  const specs = paramSpecs || {};
  const declared = Object.keys(specs);
  // ISSUE-59: a card may render a subset of the board's params (per-widget scoping).
  const names = selectParamNames(specs, data.show);
  return (
    <div className="board-controls">
      {data.title && <div className="stat-title">{data.title}</div>}
      {declared.length === 0 && (
        <div className="widget-empty">
          No board params declared. Add a <code>params</code> block to the
          dashboard JSON, then reference them with <code>{'{{name}}'}</code> in
          any widget config.
        </div>
      )}
      {declared.length > 0 && names.length === 0 && (
        <div className="widget-empty">
          None of this card's selected params exist on the board — pick params in ⚙
          (or clear the selection to show all).
        </div>
      )}
      {names.map((name) => {
        const spec = specs[name];
        const current = paramValues?.[name] ?? '';
        return (
          <div key={name} className="board-param-group">
            <div className="board-param-label">{spec.label}</div>
            {spec.type === 'text' ? (
              <input
                className="board-param-input"
                value={current}
                placeholder={spec.label}
                onChange={(e) => onSetParam?.(name, e.target.value)}
              />
            ) : spec.type === 'select' ? (
              <select
                className="board-param-select"
                value={current}
                onChange={(e) => onSetParam?.(name, e.target.value)}
              >
                {(spec.options || []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : spec.type === 'number' ? (
              <NumberParam spec={spec} value={current} onSetParam={onSetParam} name={name} />
            ) : spec.type === 'month' ? (
              <MonthParam spec={spec} value={current} onSetParam={onSetParam} name={name} />
            ) : spec.type === 'lookup' ? (
              <LookupParam spec={spec} value={current} onSetParam={onSetParam} name={name} />
            ) : (
              <div className="board-param-buttons">
                {(spec.options || []).map((opt) => (
                  <button
                    key={opt}
                    className={`board-param-btn${opt === current ? ' active' : ''}`}
                    onClick={() => onSetParam?.(name, opt)}
                    aria-pressed={opt === current}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Lookup param (ISSUE-67) — the validated "one box" producer.
 *
 *  Free text + live suggestions + a capability badge, backed by a named option
 *  source (src/lib/paramSources.js). Three deliberate UI choices:
 *
 *  1. It commits on Enter or on picking a suggestion — NOT on every keystroke.
 *     A param fans out to every referencing widget, so committing per character
 *     would fire an N-widget re-fetch storm (13 cards on the glam demo).
 *  2. The badge describes the COMMITTED value, not the draft, so it never shows
 *     a verdict for something the board isn't actually using yet.
 *  3. A stale-response guard (the ISSUE-57 pattern) drops suggestions from a
 *     superseded query — typing fast must not let an old result win.
 *
 *  An unknown/absent source degrades to a plain text input: a bad source id
 *  must never break a board. */
function LookupParam({ spec, value, onSetParam, name }) {
  const source = getParamSource(spec.source);
  const [draft, setDraft] = useState(value ?? '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState({ state: 'empty' });
  const [optionCount, setOptionCount] = useState(null);
  const seq = useRef(0);

  // Keep the draft in step with external changes (another card, URL, import).
  useEffect(() => { setDraft(value ?? ''); }, [value]);

  // Validate the committed value. Best-effort: a failed check is `unknown`.
  useEffect(() => {
    if (!value) { setVerdict({ state: 'empty' }); return undefined; }
    const my = ++seq.current;
    let alive = true;
    setVerdict({ state: 'checking' });
    validateLookupValue(spec.source, value, { options: spec.options })
      .then((v) => { if (alive && my === seq.current) setVerdict(v); })
      .catch(() => { if (alive && my === seq.current) setVerdict({ state: 'unknown' }); });
    return () => { alive = false; };
  }, [value, spec.source, spec.options]);

  // Warm an enumerable source on mount so the first keystroke is instant, and
  // report its size (this is also the freshness note for the downloaded list).
  useEffect(() => {
    if (source?.kind !== 'enumerable' || !source.load) return undefined;
    let alive = true;
    source.load()
      .then((list) => { if (alive) setOptionCount(list.length); })
      .catch(() => { if (alive) setOptionCount(null); });
    return () => { alive = false; };
  }, [source]);

  // Debounced suggestions for the draft. Enumerable sources filter in-memory,
  // so they need no debounce at all; server searches wait for a typing pause.
  useEffect(() => {
    if (!open) return undefined;
    const my = ++seq.current;
    let alive = true;
    const delay = source?.kind === 'search' ? 280 : 0;
    const t = setTimeout(() => {
      setBusy(true);
      suggestForSource(spec.source, draft, { options: spec.options })
        .then((s) => { if (alive && my === seq.current) setSuggestions(s); })
        .catch(() => { if (alive && my === seq.current) setSuggestions([]); })
        .finally(() => { if (alive && my === seq.current) setBusy(false); });
    }, delay);
    return () => { alive = false; clearTimeout(t); };
  }, [draft, open, spec.source, spec.options, source]);

  const commit = (raw) => {
    const v = normalizeLookupValue(spec.source, raw);
    if (!v) return;
    onSetParam?.(name, v);
    setDraft(v);
    setOpen(false);
  };

  const BADGE = {
    ok: { glyph: '✓', cls: 'ok', title: verdict.note || 'valid' },
    unregistered: { glyph: '⚠', cls: 'warn', title: verdict.note || 'not registered' },
    invalid: { glyph: '✗', cls: 'bad', title: verdict.note || 'not found' },
    unknown: { glyph: '?', cls: 'unknown', title: verdict.note || 'could not verify' },
    checking: { glyph: '…', cls: 'unknown', title: 'checking…' },
  }[verdict.state];

  return (
    <div className="lookup-wrap">
      <div className="lookup-row">
        <input
          className="board-param-input lookup-input"
          value={draft}
          placeholder={source?.placeholder || spec.label}
          aria-label={spec.label}
          onChange={(e) => { setDraft(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
            else if (e.key === 'Escape') setOpen(false);
          }}
        />
        {BADGE && (
          <span className={`lookup-badge ${BADGE.cls}`} title={BADGE.title} role="status">
            {BADGE.glyph}
          </span>
        )}
      </div>
      {open && (suggestions.length > 0 || busy) && (
        <div className="lookup-suggest" role="listbox">
          {busy && suggestions.length === 0 && <div className="lookup-suggest-empty">searching…</div>}
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              className="lookup-suggest-item"
              onMouseDown={(e) => e.preventDefault()} // keep focus, avoid the blur race
              onClick={() => commit(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="lookup-meta">
        {source?.hint || 'Free text; press ↵ to apply. A suggestion applies immediately.'}
        {optionCount != null && ` · ${optionCount.toLocaleString()} options`}
      </div>
    </div>
  );
}

/** Number param (ISSUE-50 #4) — kiosk-friendly slider + numeric readout.
 *  spec.options = [min, max, step] (strings from the spec line); the value is
 *  stored as a string (interpolation is string-level — fetchers parseInt). */
function NumberParam({ spec, value, onSetParam, name }) {
  const opts = (spec.options || []).map(Number);
  const min = Number.isFinite(opts[0]) ? opts[0] : 0;
  const max = Number.isFinite(opts[1]) ? opts[1] : 100;
  const step = Number.isFinite(opts[2]) && opts[2] > 0 ? opts[2] : 1;
  const num = Number(value);
  const current = Number.isFinite(num) ? Math.min(Math.max(num, min), max) : min;
  return (
    <div className="board-param-number">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        aria-label={spec.label}
        onChange={(e) => onSetParam?.(name, e.target.value)}
      />
      <span className="board-param-number-value">{current}</span>
    </div>
  );
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** Month param (ISSUE-50 #5) — ‹ › stepper + Latest chip. Value = month
 *  number 1–12 (the widgets' own year-resolution semantics apply), 0/empty =
 *  latest available. Label shows the RESOLVED month-year so the picker is
 *  truthful about what will be fetched (temporal-scope constitution spirit). */
function MonthParam({ spec, value, onSetParam, name }) {
  const num = parseInt(value);
  const resolved = resolveMonth(num); // 0/invalid → latest available month, matching fetchers
  const shift = (delta) => {
    const next = (((num || resolved.month) - 1 + delta + 12) % 12) + 1;
    onSetParam?.(name, String(next));
  };
  return (
    <div className="board-param-month">
      <button className="board-param-btn" onClick={() => shift(-1)} title="Previous month">←</button>
      <button
        className={`board-param-btn month-current${num ? '' : ' latest'}`}
        onClick={() => onSetParam?.(name, '0')}
        title="Click for latest available data"
      >
        {num ? MONTH_NAMES[num - 1] : 'Latest'}
        {num > 0 && (
          <span className="month-resolved"> → {fmtMonth(resolved.year, resolved.month)}</span>
        )}
      </button>
      <button className="board-param-btn" onClick={() => shift(1)} title="Next month">→</button>
    </div>
  );
}

/** Expanded Top-Pages rows: thumbnail + title + views + summary (hatnote). */
function TopPagesExpandedCard({ data }) {
  return (
    <div className="ranking-card toppages-expanded">
      {data.title && <div className="ranking-title" title={data.title}>{data.title}</div>}
      {data.subtitle && <div className="ranking-subtitle">{data.subtitle}</div>}
      <div className="ranking-rows">
        {(data.rows || []).map((row, i) => (
          <div key={i} className="toppages-row">
            <span className="rank-num">{i + 1}.</span>
            {row.imageUrl ? (
              <a className="toppages-thumb" href={row.url || '#'} target="_blank" rel="noopener noreferrer" title={row.title}>
                <img src={row.imageUrl} alt={row.title} loading="lazy" />
              </a>
            ) : (
              <span className="toppages-thumb toppages-thumb-empty" title="No thumbnail available" />
            )}
            <div className="toppages-body">
              <div className="toppages-line">
                <a className="toppages-title" href={row.url || '#'} target="_blank" rel="noopener noreferrer">{row.title}</a>
                <span className="toppages-views">{row.views}</span>
              </div>
              {row.summary && <div className="toppages-summary">{row.summary}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Article Excerpt — title, description, thumbnail + first paragraph. */
function ExcerptCard({ data }) {
  return (
    <div className="excerpt-card">
      {data.title && (
        <div className="excerpt-title" title={data.title}>
          <a href={data.pageUrl || '#'} target="_blank" rel="noopener noreferrer">{data.title}</a>
        </div>
      )}
      {data.description && <div className="excerpt-desc">{data.description}</div>}
      <div className="excerpt-body">
        {data.thumbnailUrl && (
          <img className="excerpt-thumb" src={data.thumbnailUrl} alt={data.title} loading="lazy" />
        )}
        {data.extract && <p className="excerpt-text">{data.extract}</p>}
      </div>
    </div>
  );
}

/** Edit History — newest-first rows: byte delta, user, time, comment. */
function formatEditTime(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function EditHistoryCard({ data }) {
  const rows = data.rows || [];
  return (
    <div className="ranking-card edit-history-card">
      <div className="ranking-title" title={data.title}>{data.title}</div>
      <div className="ranking-subtitle">Recent edits (newest first)</div>
      <div className="ranking-rows">
        {rows.length === 0 && <div className="widget-empty">No edits found</div>}
        {rows.map((r) => (
          <div key={r.revid} className="edit-row">
            <div className="edit-line">
              <span
                className={`edit-delta ${r.delta == null ? '' : r.delta >= 0 ? 'delta-pos' : 'delta-neg'}`}
                title={r.delta == null ? 'older than shown' : 'bytes changed by this edit'}
              >
                {r.delta == null ? '·' : (r.delta >= 0 ? '+' : '−') + Math.abs(r.delta)}
              </span>
              <a
                className="edit-user"
                href={`https://${data.project || 'en.wikipedia'}.org/wiki/Special:Contributions/${encodeURIComponent(r.user)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {r.user}
              </a>
              <span className="edit-time">{formatEditTime(r.timestamp)}</span>
            </div>
            <div className="edit-comment" title={r.comment}>{r.comment}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Article Quality — ORES class + probability distribution (or continuous score). */
const GRADE_COLORS = { FA: '#c9a227', GA: '#3cb371', B: '#5b8dd9', C: '#9fb7d9', Start: '#d9a36b', Stub: '#d97b6b' };
const GRADE_ORDER = ['FA', 'GA', 'B', 'C', 'Start', 'Stub'];

function QualityCard({ data }) {
  if (data.grade == null && data.score != null) {
    const pct = Math.round(data.score * 100);
    return (
      <div className="quality-card">
        <div className="quality-title" title={data.title}>{data.title}</div>
        <div className="quality-grade-row">
          <span className="quality-grade" style={{ background: pct >= 70 ? '#3cb371' : pct >= 40 ? '#5b8dd9' : '#d97b6b' }}>{pct}%</span>
          <span className="quality-model" title={data.model}>{data.model}</span>
        </div>
        <div className="quality-bar">
          <div className="quality-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="quality-sub">Revision {data.revid}</div>
      </div>
    );
  }
  const probs = data.probabilities || {};
  return (
    <div className="quality-card">
      <div className="quality-title" title={data.title}>{data.title}</div>
      <div className="quality-grade-row">
        <span className="quality-grade" style={{ background: GRADE_COLORS[data.grade] || 'var(--accent)' }}>{data.grade}</span>
        <span className="quality-model" title={data.model}>{data.model}</span>
      </div>
      <div className="quality-probs">
        {GRADE_ORDER.map((g) => (
          <div key={g} className={`quality-prob-row${g === data.grade ? ' is-top' : ''}`}>
            <span className="quality-prob-label">{g}</span>
            <div className="quality-prob-bar">
              <div
                className="quality-prob-fill"
                style={{ width: `${((probs[g] || 0) * 100).toFixed(1)}%`, background: GRADE_COLORS[g] }}
              />
            </div>
            <span className="quality-prob-pct">{((probs[g] || 0) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <div className="quality-sub">Revision {data.revid}</div>
    </div>
  );
}

/** WikiProject Assessment — project × class × importance rows. */
function AssessmentsCard({ data }) {
  const rows = data.rows || [];
  return (
    <div className="ranking-card assessments-card">
      <div className="ranking-title" title={data.title}>{data.title}</div>
      <div className="ranking-subtitle">
        {data.total > rows.length ? `Top ${rows.length} of ${data.total} WikiProjects` : `${data.total} WikiProject${data.total === 1 ? '' : 's'}`}
      </div>
      <div className="ranking-rows">
        {rows.length === 0 && <div className="widget-empty">No WikiProject assessments found</div>}
        {rows.map((r, i) => (
          <div key={i} className="assess-row">
            <span className="assess-project" title={`WikiProject ${r.project}`}>{r.project}</span>
            <span className={`assess-badge assess-class cls-${r.class || 'none'}`}>{r.class || '—'}</span>
            <span className={`assess-badge assess-importance imp-${r.importance || 'none'}`}>{r.importance || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Article Gallery — grid of thumbs with captions below (size: small/medium/large).
 *  Grouped mode (rows carry `group: { key, label }`) inserts a full-width
 *  group header at each group boundary; caption-less tiles show their file
 *  name when the transform sets `showFileName`. */
function GalleryGridCard({ data }) {
  const size = data.size || 'medium';
  const fit = data.fit || 'contain';
  const rows = data.rows || [];
  const tiles = [];
  for (let i = 0; i < rows.length; i++) {
    const img = rows[i];
    const prev = rows[i - 1];
    if (img.group && (!prev || !prev.group || prev.group.key !== img.group.key)) {
      tiles.push(<div key={`grp-${img.group.key}`} className="gallery-group-header">{img.group.label}</div>);
    }
    tiles.push(
      <a key={img.title || `img-${i}`} className="gallery-item" href={img.fileUrl} target="_blank" rel="noopener noreferrer" title={img.caption || img.title}>
        <img className="gallery-thumb" src={img.thumbUrl} alt={img.caption || img.title} loading="lazy" style={{ objectFit: fit }} />
        {(img.caption || img.showFileName) && <span className="gallery-caption">{img.caption || img.title}</span>}
      </a>
    );
  }
  return (
    <div className="gallery-card">
      <div className="ranking-title" title={data.title}>{data.title}</div>
      <div className="ranking-subtitle">{data.subtitle}</div>
      <div className={`gallery-grid gallery-${size}`}>
        {rows.length === 0 && <div className="widget-empty">{data.emptyText || 'No images found'}</div>}
        {tiles}
      </div>
    </div>
  );
}

/** Article List — clickable rows: optional thumb left, title + intro. */
function ArticleListCard({ data }) {
  const rows = data.rows || [];
  return (
    <div className="article-list-card">
      {data.title && <div className="ranking-title" title={data.title}>{data.title}</div>}
      {data.subtitle && <div className="ranking-subtitle">{data.subtitle}</div>}
      <div className="ranking-rows">
        {rows.length === 0 && <div className="widget-empty">No articles</div>}
        {rows.map((r) => (
          <a key={r.title} className="article-list-row" href={r.pageUrl} target="_blank" rel="noopener noreferrer" title={r.title}>
            {r.thumbUrl && <img className="article-list-thumb" src={r.thumbUrl} alt="" loading="lazy" />}
            <span className="article-list-body">
              <span className="article-list-title">{r.title}</span>
              {r.extract && <span className="article-list-extract">{r.extract}</span>}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

/** Text List / Filter Lines — a numbered, scrollable list of lines (the
 *  visible face of any widget that emits an array of strings). */
function ListSourceCard({ data }) {
  const rows = data.lines || [];
  return (
    <div className="ranking-card">
      {data.title && <div className="ranking-title" title={data.title}>{data.title}</div>}
      {data.subtitle && <div className="ranking-subtitle">{data.subtitle}</div>}
      <div className="list-source-body">
        {rows.length === 0
          ? <div className="widget-empty">{data.emptyText || 'Nothing yet — connect a source in ⚙.'}</div>
          : rows.map((s, i) => (
              <div key={i} className="list-source-row">
                <span className="rank-num">{i + 1}.</span>
                <span className="list-source-item" title={s}>{s}</span>
              </div>
            ))}
      </div>
    </div>
  );
}

/** Value Display (echo) — renders whatever a widget outputs: number/string as
 *  a big readout, an array as a list, an object as pretty JSON. */
function EchoCard({ data }) {
  if (data.kind === 'none' || data.value === undefined) {
    return (
      <div className="echo-card">
        {data.title && <div className="ranking-title" title={data.title}>{data.title}</div>}
        <div className="widget-empty">
          No value yet — open ⚙ and pick a <em>source</em> widget (e.g. Line Count).
        </div>
      </div>
    );
  }
  if (data.kind === 'array') {
    return <ListSourceCard data={{ title: data.title, subtitle: data.subtitle, lines: data.value }} />;
  }
  if (data.kind === 'object') {
    return (
      <div className="echo-card">
        {data.title && <div className="ranking-title" title={data.title}>{data.title}</div>}
        {data.subtitle && <div className="ranking-subtitle">{data.subtitle}</div>}
        <pre className="echo-json">{JSON.stringify(data.value, null, 2)}</pre>
      </div>
    );
  }
  return (
    <div className="stat-card">
      {data.title && <div className="stat-title" title={data.title}>{data.title}</div>}
      {data.subtitle && <div className="stat-subtitle">{data.subtitle}</div>}
      <div className="stat-value">{data.value ?? '—'}</div>
    </div>
  );
}

/** Article Gallery — list rows: thumb left, caption right.
 *  Grouped mode inserts a group header at each group boundary. */
function GalleryListCard({ data }) {
  const rows = data.rows || [];
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    const img = rows[i];
    const prev = rows[i - 1];
    if (img.group && (!prev || !prev.group || prev.group.key !== img.group.key)) {
      items.push(<div key={`grp-${img.group.key}`} className="gallery-group-header">{img.group.label}</div>);
    }
    items.push(
      <a key={img.title || `img-${i}`} className="gallery-list-item" href={img.fileUrl} target="_blank" rel="noopener noreferrer">
        <img className="gallery-list-thumb" src={img.thumbUrl} alt={img.caption || img.title} loading="lazy" />
        <div className="gallery-list-body">
          <span className="gallery-list-caption">{img.caption || img.title}</span>
          <span className="gallery-list-file">{img.title}</span>
        </div>
      </a>
    );
  }
  return (
    <div className="gallery-card gallery-list-card">
      <div className="ranking-title" title={data.title}>{data.title}</div>
      <div className="ranking-subtitle">{data.subtitle}</div>
      <div className="gallery-list">
        {rows.length === 0 && <div className="widget-empty">{data.emptyText || 'No images found'}</div>}
        {items}
      </div>
    </div>
  );
}

/** Choose the playback URL for a track: best transcoded VP9 WebM for the
 *  requested quality (auto = largest ≤1080p), else the original file.
 *  Derivatives include the original (non-/transcoded/ path) — excluded here. */
function pickPlayUrl(row, quality) {
  // Quality is HEIGHT-based ("480p" = 640x480): compare against dv.height.
  const webm = (row.derivatives || [])
    .filter((d) => d.type.startsWith('video/webm') && d.src.includes('/transcoded/') && d.height)
    .sort((a, b) => a.height - b.height);
  const target = quality !== 'auto' ? parseInt(quality, 10) || 0 : 0;
  if (target) {
    const under = webm.filter((d) => d.height <= target);
    if (under.length) return under[under.length - 1].src;
    if (webm.length) return webm[0].src;
  } else {
    const capped = webm.filter((d) => d.height <= 1080);
    if (capped.length) return capped[capped.length - 1].src;
    if (webm.length) return webm[webm.length - 1].src;
  }
  return row.originalUrl || '';
}

/**
 * Speaker — text-to-speech output widget (GitHub issue #16), first of the
 * output/effector family.
 *
 * SAFETY (see src/lib/speech.js + issue #16): never speaks until ▶ has been
 * clicked on THIS widget ("armed") — the browser only guards speak() until
 * the first page click, so the widget enforces its own gate. speakOnChange
 * (registry default OFF) auto-speaks after arming, debounced (Board Controls
 * text inputs fire per keystroke). Mute is controller-global: one mute
 * button silences every speaker. Zero-voice engines (headless CI) render a
 * degraded state — never an error, never a console exception.
 */
function SpeakerCard({ data, onSetParam }) {
  const text = String(data?.text ?? '');
  const speakOnChange = data?.speakOnChange === true;
  const [status, setStatus] = useState('idle'); // idle | speaking | degraded
  const [muted, setMuted] = useState(false);
  const [armed, setArmed] = useState(false);
  const [voices, setVoices] = useState([]);
  const [voice, setVoice] = useState(''); // in-card picker (runtime roster; not persisted)
  const [note, setNote] = useState(null);
  const ctlRef = useRef(null);
  const armedRef = useRef(false);
  const voicesRef = useRef([]);
  const prevTextRef = useRef(text);
  const stallTimer = useRef(null);
  const debounceTimer = useRef(null);
  const settledRef = useRef(true);

  // Bind the shared controller + scan the voice roster (async voiceschanged).
  useEffect(() => {
    if (!ctlRef.current) {
      ctlRef.current = createSpeechController({
        synth: typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null,
        Utterance: typeof window !== 'undefined' && window.SpeechSynthesisUtterance ? window.SpeechSynthesisUtterance : null,
      });
      setMuted(ctlRef.current.isMuted());
    }
    const ctl = ctlRef.current;
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!ctl.hasSynth()) {
      setStatus('degraded');
      setNote('Speech synthesis is not available in this browser.');
      return undefined;
    }
    const scan = () => {
      const list = (synth.getVoices?.() || []).slice();
      voicesRef.current = list;
      setVoices(list);
      setStatus((s) => (list.length === 0 ? 'degraded' : s === 'degraded' ? 'idle' : s));
      setNote((n) => (n && n.includes('No voice') ? (list.length === 0 ? n : null) : n));
      if (list.length === 0) setNote('No voice available on this device — the text is shown below.');
    };
    scan();
    const unsubMute = ctl.onMuteChange(setMuted);
    synth.addEventListener?.('voiceschanged', scan);
    return () => {
      unsubMute?.();
      synth.removeEventListener?.('voiceschanged', scan);
      clearTimeout(stallTimer.current);
      clearTimeout(debounceTimer.current);
      ctl.stopAll();
    };
  }, []);

  const say = useCallback((msg) => {
    const ctl = ctlRef.current;
    if (!ctl || !String(msg).trim()) return;
    settledRef.current = false;
    setNote(null);
    clearTimeout(stallTimer.current);
    // Stall guard: Firefox headless queues an utterance that never starts nor
    // errors; if nothing settles in 6s, cancel + degrade instead of hanging.
    stallTimer.current = setTimeout(() => {
      if (!settledRef.current) {
        settledRef.current = true;
        ctl.stopAll();
        setStatus('degraded');
        setNote('Speech did not start — no working voice on this device.');
      }
    }, 6000);
    const finish = (next) => {
      settledRef.current = true;
      clearTimeout(stallTimer.current);
      setStatus(next);
    };
    const res = ctl.speak(msg, {
      voice: voice || null,
      rate: 1,
      volume: 0.8,
      onstart: () => {
        settledRef.current = true;
        clearTimeout(stallTimer.current);
        setStatus('speaking');
      },
      onend: () => finish(voicesRef.current.length > 0 ? 'idle' : 'degraded'),
      onerror: (code) => {
        settledRef.current = true;
        clearTimeout(stallTimer.current);
        if (code === 'not-allowed') setNote('Click ▶ to let this widget speak.');
        else if (code !== 'interrupted') setNote(`Speech error (${code})`);
        setStatus(voicesRef.current.length > 0 ? 'idle' : 'degraded');
      },
    });
    if (!res.ok) {
      settledRef.current = true;
      if (res.reason === 'muted') setNote('🔇 Muted — click the mute button to unmute.');
      else if (res.reason === 'empty') setNote('Nothing to speak — add text in ⚙ or point a {{param}} at it.');
      else if (res.reason === 'no-synth') { setStatus('degraded'); setNote('Speech synthesis is not available in this browser.'); }
      else if (res.reason === 'not-supported') { setStatus('degraded'); setNote('Speech synthesis failed to start.'); }
    }
  }, [voice]);

  const handlePlay = useCallback(() => {
    if (muted) { setNote('🔇 Muted — click the mute button to unmute.'); return; }
    if (voicesRef.current.length === 0) { setStatus('degraded'); setNote('No voice available on this device — the text is shown below.'); return; }
    armedRef.current = true;
    setArmed(true);
    say(text);
  }, [muted, text, say]);

  const handleStop = useCallback(() => {
    ctlRef.current?.stopAll();
    setStatus(voicesRef.current.length > 0 ? 'idle' : 'degraded');
  }, []);

  const handleToggleMute = useCallback(() => {
    const ctl = ctlRef.current;
    if (!ctl) return;
    const nowMuted = ctl.toggleMuted();
    onSetParam?.('audioMuted', nowMuted ? 'true' : 'false'); // persist/share via ISSUE-50 params
  }, [onSetParam]);

  // speakOnChange — announce text updates ONLY once armed (safety gate).
  useEffect(() => {
    const prev = prevTextRef.current;
    prevTextRef.current = text;
    if (!speakOnChange || text === prev) return undefined;
    if (!armedRef.current) {
      setNote('Text updated — press ▶ to hear it.');
      return undefined;
    }
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => say(text), 800); // keystroke debounce
    return () => clearTimeout(debounceTimer.current);
  }, [text, speakOnChange, say]);

  const noVoice = voices.length === 0;
  const showVoicePicker = voices.length > 1 && !noVoice;
  return (
    <div className="speaker-card">
      <div className="speaker-controls">
        {noVoice ? (
          <span className="speaker-degraded">🔇 No voice on this device</span>
        ) : status === 'speaking' ? (
          <button className="widget-btn" onClick={handleStop} title="Stop speaking">⏹ Stop</button>
        ) : (
          <button
            className="widget-btn"
            onClick={handlePlay}
            title={armed ? 'Speak this text' : 'Click once to let this widget speak — after that it may auto-speak when its text changes'}
          >
            {armed ? '▶ Speak' : '▶ Speak (enable)'}
          </button>
        )}
        <button className="widget-btn" onClick={handleToggleMute} title={muted ? 'Unmute all speakers' : 'Mute all speakers'}>
          {muted ? '🔇' : '🔊'}
        </button>
        {showVoicePicker && (
          <select
            className="board-param-select speaker-voice"
            aria-label="Voice"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
          >
            <option value="">Auto ({voices[0]?.lang || 'device'})</option>
            {voices.map((v) => (
              <option key={`${v.name}-${v.lang}`} value={v.name}>{v.name} — {v.lang}</option>
            ))}
          </select>
        )}
        <span className={`speaker-status${status === 'speaking' ? ' speaking' : ''}`} aria-live="polite">
          {status === 'speaking' ? '🔊 Speaking…' : noVoice ? '' : muted ? 'Muted' : armed ? 'Ready' : 'Press ▶ once to enable'}
        </span>
      </div>
      {note && <div className="widget-empty speaker-note" aria-live="polite">{note}</div>}
      <div className="speaker-text">
        {text ? text : <span className="widget-empty">No text yet — type some in ⚙ or point a board {{param}} at the text field.</span>}
      </div>
    </div>
  );
}

/** Media player — video/audio embed + jukebox playlist (ISSUE-39). */
function MediaPlayerCard({ data }) {
  const rows = data.rows || [];
  const forcedType = data.mediaType || 'auto';
  const quality = data.quality || 'auto';
  const loopPlaylist = !!data.loopPlaylist;
  const shuffle = !!data.shuffle;
  const autoplay = !!data.autoplay;
  const [index, setIndex] = useState(0);
  const [showStart, setShowStart] = useState(false);
  const mediaRef = useRef(null);

  // Play order — original order, or one Fisher-Yates shuffle per playlist change.
  const order = useMemo(() => {
    const idx = rows.map((_, i) => i);
    if (shuffle && idx.length > 1) {
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
    }
    return idx;
  }, [rows, shuffle]);

  // New fetch / config → back to the top; show the Start pill when autoplay
  // is requested but the browser hasn't granted a user gesture yet.
  useEffect(() => {
    setIndex(0);
    setShowStart(autoplay && rows.length > 0);
  }, [rows, autoplay]);

  const current = rows[order[index]];
  const isLast = order.length > 0 && index >= order.length - 1;
  const isAudio = current?.mediaType === 'audio' && forcedType !== 'video';
  const single = rows.length === 1;

  const playNext = useCallback(() => {
    setIndex((i) => (i >= order.length - 1 ? (loopPlaylist ? 0 : i) : i + 1));
  }, [order.length, loopPlaylist]);

  const playPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : (loopPlaylist && order.length > 1 ? order.length - 1 : 0)));
  }, [loopPlaylist, order.length]);

  if (!current) {
    return (
      <div className="media-card">
        <div className="ranking-title">{data.title}</div>
        <div className="ranking-subtitle">{data.subtitle}</div>
        <div className="widget-empty">No playable files found</div>
      </div>
    );
  }

  const playUrl = pickPlayUrl(current, quality);
  const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–');
  const mediaProps = {
    ref: mediaRef,
    key: playUrl,
    controls: true,
    preload: 'metadata',
    src: playUrl,
    autoPlay: autoplay,
    onEnded: playNext,
    onPlaying: () => setShowStart(false),
    loop: single && loopPlaylist,
  };

  return (
    <div className="media-card">
      <div className="ranking-title" title={data.title}>{data.title}</div>
      <div className="ranking-subtitle">{data.subtitle}</div>
      <div className="media-stage">
        {isAudio
          ? <audio {...mediaProps} className="media-audio" />
          : <video {...mediaProps} className="media-video" />}
        {showStart && (
          <button
            className="media-start"
            onClick={() => { setShowStart(false); mediaRef.current?.play().catch(() => {}); }}
          >
            ▶ Start
          </button>
        )}
      </div>
      <div className="media-meta">
        <a className="media-title" href={current.fileUrl} target="_blank" rel="noopener noreferrer" title={current.title}>
          {current.title}
        </a>
        <span className="media-duration">{fmtDur(current.duration)}</span>
      </div>
      {data.showDescription && (current.description || current.artist || current.license) && (
        <div className="media-desc">
          {current.description && <div className="media-desc-text">{current.description}</div>}
          {(current.artist || current.license) && (
            <div className="media-desc-credit">
              {[current.artist, current.license].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      )}
      <div className="media-controls">
        <button className="media-btn" onClick={playPrev} title="Previous track" disabled={order.length < 2}>⏮</button>
        <button className="media-btn" onClick={playNext} title={isLast && !loopPlaylist ? 'End of playlist' : 'Next track'} disabled={isLast && !loopPlaylist}>⏭</button>
        <span className="media-pos">{index + 1} / {order.length}</span>
        <span className="media-badges">
          {shuffle && <span className="media-badge" title="Shuffle on">🔀</span>}
          {loopPlaylist && <span className="media-badge" title="Loop playlist on">🔁</span>}
        </span>
      </div>
      {data.annotation && (
        <div
          className="media-annotation"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(data.annotation, { allowExternalImages: false }) }}
        />
      )}
    </div>
  );
}

/** 360° Panorama Viewer — Pannellum WebGL viewer over a Commons file. */
function PanoramaCard({ data }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('mounting');

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data.url) return;
    let cancelled = false;
    let viewer = null;
    setStatus(data.equirectangular === false ? 'not360' : 'loading');

    loadPannellum().then((pannellum) => {
      if (cancelled || !el.isConnected) return;
      try {
        viewer = pannellum.viewer(el, {
          type: 'equirectangular',
          panorama: data.url,
          autoLoad: true,
          ...(data.autoRotate ? { autoRotate: 2 } : {}),
          title: data.fileTitle ? data.fileTitle.replace(/^File:/, '').replace(/_/g, ' ') : undefined,
          showFullscreenCtrl: true,
        });
        viewer.on('load', () => { if (!cancelled) setStatus('loaded'); });
        viewer.on('error', (msg) => { if (!cancelled) setStatus(`error:${msg}`); });
      } catch (e) {
        if (!cancelled) setStatus(`error:${e.message}`);
      }
    }).catch((e) => {
      if (!cancelled) setStatus(`error:${e.message}`);
    });

    // Keep the WebGL canvas in sync with widget resizes.
    const ro = new ResizeObserver(() => { try { viewer?.resize(); } catch { /* noop */ } });
    ro.observe(el);
    return () => {
      cancelled = true;
      ro.disconnect();
      try { viewer?.destroy(); } catch { /* noop */ }
    };
  }, [data.url, data.autoRotate, data.equirectangular, data.fileTitle]);

  const label = data.fileTitle ? data.fileTitle.replace(/^File:/, '').replace(/_/g, ' ') : '360° panorama';
  return (
    <div className="panorama-card">
      <div className="panorama-meta">
        <span className="panorama-file" title={data.fileTitle}>{label}</span>
        {data.equirectangular === false ? (
          <span className="panorama-badge warn">not 2:1 — may not be a 360°</span>
        ) : (
          <span className="panorama-badge">360° · {data.width}×{data.height}</span>
        )}
        {data.originalUrl && (
          <a className="panorama-orig" href={data.originalUrl} target="_blank" rel="noopener noreferrer" title="Open original file">⤴</a>
        )}
      </div>
      <div className="panorama-container no-drag" ref={containerRef}>
        {status.startsWith('error') && (
          <div className="widget-error"><span>⚠ {status.slice(6)}</span></div>
        )}
        {status === 'not360' && (
          <div className="panorama-placeholder">This file is not 2:1 equirectangular — it may still be a Photo Sphere (Pannellum auto-detects GPano XMP).</div>
        )}
      </div>
    </div>
  );
}

/** SPARQL Query — one renderer, mode decided by the transform (auto-detect
 *  or the ⚙ override). Composes the existing StatCard/TrendCard and the
 *  new BarCard/TableCard — no new chart library. */
function SparqlCard({ data }) {
  if (!data) return <div className="widget-empty">No data</div>;
  if (data.mode === 'stat') return <StatCard data={data} />;
  if (data.mode === 'line') return <TrendCard data={data} />;
  if (data.mode === 'bar') return <BarCard data={data} />;
  return <TableCard data={data} />;
}

/** Table — generic columns, scrollable body (the SPARQL fallback). */
function TableCard({ data }) {
  const columns = data.columns || [];
  const rows = data.rows || [];
  return (
    <div className="table-card">
      {data.title && <div className="ranking-title" title={data.title}>{data.title}</div>}
      {data.subtitle && <div className="ranking-subtitle">{data.subtitle}</div>}
      <div className="table-scroll">
        <table className="sparql-table">
          <thead>
            <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td className="widget-empty" colSpan={columns.length || 1}>No rows</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>{r.map((cell, j) => <td key={j} title={String(cell)}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Bar — horizontal label→value bars (hand-rolled, zero-chart-library style). */
function BarCard({ data }) {
  const rows = data.rows || [];
  const max = Math.max(...rows.map((r) => r.value || 0), 1);
  return (
    <div className="bar-card">
      {data.title && <div className="ranking-title" title={data.title}>{data.title}</div>}
      {data.subtitle && <div className="ranking-subtitle">{data.subtitle}</div>}
      <div className="bar-rows">
        {rows.length === 0 && <div className="widget-empty">No rows</div>}
        {rows.map((r, i) => (
          <div key={i} className="bar-row" title={`${r.label}: ${r.value?.toLocaleString?.() ?? r.value}`}>
            <span className="bar-label">{r.label}</span>
            <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.max((r.value / max) * 100, 1)}%` }} /></span>
            <span className="bar-value">{typeof r.value === 'number' ? r.value.toLocaleString() : r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Wiki Page — an iframe to the wiki itself (desktop or m. site).
 *  Wikimedia pages send no X-Frame-Options / frame-ancestors (verified
 *  2026-08-13), so a direct embed works; links browse inside the widget. */
function WikiPageCard({ data }) {
  if (!data?.url) return <div className="widget-empty">{data?.error || 'Enter a page title'}</div>;
  return (
    <div className="wikipage-card">
      <iframe
        className="wikipage-iframe"
        src={data.url}
        title={data.page}
        referrerPolicy="no-referrer"
        loading="lazy"
        // ISSUE-62: custom URLs are untrusted third-party pages — sandbox them
        // (scripts + their own origin so their app works; no top-navigation or
        // popups-escape). Wikimedia pages stay unsandboxed as before.
        {...(data.external
          ? { sandbox: 'allow-scripts allow-same-origin allow-forms allow-presentation', allow: 'fullscreen' }
          : {})}
      />
    </div>
  );
}

/** CIM Snapshot — 4 stat tiles + optional view trend (File Spotlight). */
function CimSnapshotCard({ data }) {
  return (
    <div className="glam-card">
      {data.title && (
        <div className="stat-title" title={data.title}>
          {data.href
            ? <a href={data.href} target="_blank" rel="noopener noreferrer">{data.title}</a>
            : data.title}
        </div>
      )}
      {data.subtitle && <div className="stat-subtitle">{data.subtitle}</div>}
      {data.image?.url && (
        <a
          className="card-image"
          href={data.fileHref || data.href}
          target="_blank"
          rel="noopener noreferrer"
          title="Open on Commons"
        >
          <img src={data.image.url} alt={data.title} loading="lazy" />
        </a>
      )}
      <div className="glam-stats">
        {(data.stats || []).map((s, i) => (
          <div key={i} className="glam-stat">
            <div className="glam-stat-value" title={s.value}>{s.value}</div>
            <div className="glam-stat-label">{s.label}</div>
            {s.sub && <div className="glam-stat-sub">{s.sub}</div>}
          </div>
        ))}
      </div>
      {data.gap && (
        <div className="cim-gap" title="Deep scope sweeps subcategories up to 7 levels — this number is the reach of the whole tree, not just the category itself">
          <div className="cim-gap-bar" aria-hidden="true">
            <span className="cim-gap-direct" style={{ width: `${Math.max((data.gap.direct / data.gap.tree) * 100, 0.75)}%` }} />
          </div>
          <div className="cim-gap-caption">
            {data.gap.direct.toLocaleString()} direct · {data.gap.tree.toLocaleString()} in tree
            ({data.gap.ratio.toLocaleString()}×) — tree reach, not direct attribution
          </div>
        </div>
      )}
      {data.trend && data.trend.length > 0 && (
        <div className="mini-sparkline">
          {(() => {
            const max = Math.max(...data.trend.map((t) => t.views), 1);
            return data.trend.map((t, i) => (
              <div key={i} className="spark-bar" style={{ height: `${Math.max((t.views / max) * 30, 1)}px` }} title={`${t.date}: ${t.views.toLocaleString()} views`} />
            ));
          })()}
          <span className="spark-label">monthly views</span>
        </div>
      )}
    </div>
  );
}

/** CIM Top Files — ranked rows with 48px thumbs (RankingCard has none). */
function CimTopFilesCard({ data }) {
  const rows = data.rows || [];
  return (
    <div className="ranking-card">
      {data.title && <div className="ranking-title" title={data.title}>{data.title}</div>}
      {data.subtitle && <div className="ranking-subtitle">{data.subtitle}</div>}
      <div className="ranking-header">
        <span className="rank-num" />
        <span className="ranking-col col-1">File</span>
        <span className="ranking-col col-2">Views</span>
      </div>
      <div className="ranking-rows">
        {rows.length === 0 && <div className="widget-empty">No files</div>}
        {rows.map((r, i) => (
          <div key={r.title} className="ranking-row cim-top-file">
            <span className="rank-num">{i + 1}.</span>
            <a className="cim-top-file-main" href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(r.title.replace(/ /g, '_'))}`} target="_blank" rel="noopener noreferrer" title={r.title}>
              {r.thumbUrl && <img className="cim-top-file-thumb" src={r.thumbUrl} alt="" loading="lazy" />}
              <span className="cim-top-file-name">{r.title}</span>
            </a>
            <span className="ranking-col cim-top-file-views">{r.views.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** CIM File Traffic — interactive monthly traffic chart for one file.
 *  SVG line chart with labeled X (months) and Y (views) axes; −/+ buttons
 *  zoom the displayed window (3/6/12/24 months) client-side — the fetch
 *  window (up to 24 months) is sliced, no refetch. The displayed range is
 *  always shown in the card header (the constitutional scope rule). */
function FileTrafficCard({ data }) {
  const [months, setMonths] = useState(6);
  const all = data.rows || [];
  const opts = [3, 6, 12, 24];
  const slice = all.slice(-months);
  const max = Math.max(...slice.map((r) => r.views), 1);
  const W = 340;
  const H = 170;
  const PAD_L = 52;
  const PAD_R = 10;
  const PAD_T = 12;
  const PAD_B = 26;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: PAD_T + plotH * (1 - f), v: max * f }));
  const xAt = (i) => PAD_L + (slice.length <= 1 ? plotW / 2 : (i / (slice.length - 1)) * plotW);
  const yAt = (v) => PAD_T + plotH * (1 - v / max);
  const pts = slice.map((r, i) => `${xAt(i)},${yAt(r.views)}`).join(' ');
  const startMonth = slice[0]?.date;
  const endMonth = slice[slice.length - 1]?.date;
  return (
    <div className="file-traffic-card">
      {data.title && <div className="ranking-title" title={data.title}>{data.title}</div>}
      {data.subtitle && <div className="ranking-subtitle">{data.subtitle}</div>}
      <div className="file-traffic-toolbar">
        <span className="file-traffic-range">{slice.length ? `${startMonth} → ${endMonth} · ${slice.length} months` : 'no data'}</span>
        <span className="file-traffic-zoom">
          <button className="widget-btn" disabled={months >= opts[opts.length - 1]} onClick={() => setMonths(opts[Math.min(opts.indexOf(months) + 1, opts.length - 1)])} title="Show more months (zoom out)">−</button>
          <button className="widget-btn" disabled={months <= opts[0]} onClick={() => setMonths(opts[Math.max(opts.indexOf(months) - 1, 0)])} title="Show fewer months (zoom in)">+</button>
        </span>
      </div>
      {slice.length === 0 ? <div className="widget-empty">No traffic data</div> : (
        <div className="file-traffic-chart">
          <svg viewBox={`0 0 ${W} ${H}`} className="file-traffic-svg">
            {/* Y gridlines + labels */}
            {yTicks.map((t, i) => (
              <g key={i}>
                <line x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y} className="file-traffic-grid" />
                <text x={PAD_L - 6} y={t.y + 3} textAnchor="end" className="file-traffic-axis">{compactNum(t.v)}</text>
              </g>
            ))}
            {/* X labels (every 2nd month when crowded) */}
            {slice.map((r, i) => (
              (slice.length <= 6 || i % 2 === 0) && (
                <text key={i} x={xAt(i)} y={H - PAD_B + 14} textAnchor="middle" className="file-traffic-axis">
                  {r.date.slice(2)}
                </text>
              )
            ))}
            {/* Y axis title */}
            <text x={12} y={PAD_T + 6} textAnchor="middle" transform={`rotate(-90 12 ${PAD_T + 6})`} className="file-traffic-axis-title">views</text>
            {/* X axis title */}
            <text x={PAD_L + plotW / 2} y={H - 3} textAnchor="middle" className="file-traffic-axis-title">month</text>
            {/* line + hover points */}
            <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {slice.map((r, i) => (
              <circle key={i} cx={xAt(i)} cy={yAt(r.views)} r="2.5" className="file-traffic-point">
                <title>{`${r.date}: ${r.views.toLocaleString()} views`}</title>
              </circle>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}

/** Wayback Snapshot Gallery — screenshot tiles of a website at chosen
 *  dates. Each tile embeds the closest capture (id_ = toolbar-less
 *  replay) in a fixed 1280x960 iframe scaled down to tile size — the
 *  classic screenshot-thumbnail technique. Tiles are display-only
 *  (pointer-events off); the caption links open the full snapshot. */
function WaybackGalleryCard({ data }) {
  const rows = data.rows || [];
  return (
    <div className="wayback-card">
      {data.title && <div className="ranking-title" title={data.title}>{data.title}</div>}
      {data.subtitle && <div className="ranking-subtitle">{data.subtitle}</div>}
      {data.stale && (
        <div className="wayback-stale">⚠ showing cached snapshots — live lookup unavailable, retrying on refresh</div>
      )}
      <div className="wayback-grid">
        {rows.length === 0 && <div className="widget-empty">No captures found</div>}
        {rows.map((r, i) => (
          <div key={i} className="wayback-tile">
            {r.available && r.withinTolerance ? (
              <div className="wayback-shot">
                <iframe
                  src={r.replayUrl}
                  title={`${data.title} ${r.captureDate}`}
                  loading="lazy"
                  tabIndex="-1"
                  aria-hidden="true"
                />
              </div>
            ) : (
              <div className="wayback-missing">
                {r.lookupFailed
                  ? 'lookup failed — retries on refresh'
                  : r.available
                    ? `no capture within ±${data.toleranceDays || 30} days`
                    : 'no captures on record'}
              </div>
            )}
            <div className="wayback-cap">
              <a href={r.snapshotUrl || r.replayUrl} target="_blank" rel="noopener noreferrer">
                {r.captureDate || r.date}
              </a>
              {r.available && !r.withinTolerance && (
                <span className="wayback-off"> · nearest {r.diffDays}d away</span>
              )}
              {r.available && r.status && r.status !== '200' && (
                <span className="wayback-off"> · HTTP {r.status}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
