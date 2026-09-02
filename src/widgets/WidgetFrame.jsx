import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { resolveParams } from '../lib/params';
import { resolveMonth, fmtMonth } from '../lib/scope';
import { WIDGET_TYPES } from './index';
import { renderMarkdown } from '../lib/markdown';
import { loadPannellum } from '../lib/pannellumLoader';
import '../vendor/pannellum.css';

/**
 * Frame around every widget — handles loading, error, title bar, refresh.
 */
export default function WidgetFrame({ widget, onRemove, onUpdateConfig, reloadKey, onAutoHeight, paramSpecs, paramValues, onSetParam }) {
  // ISSUE-50: resolve {{param}} placeholders ONCE here — the DATA path (fetch,
  // transform, titles, refresh interval) uses the resolved config; the ⚙ editor
  // path (config panel, handleConfigChange) deliberately uses the RAW
  // widget.config so a field edit never bakes a placeholder's resolved value
  // into the stored config (the "{{category}} lock-in" bug: editing
  // sampleCount used to overwrite category with the literal category name).
  // The placeholder stays visible in the ⚙ form — provenance, and overwriting
  // it manually is the documented freeze/override escape hatch.
  const resolvedConfig = useMemo(
    () => resolveParams(widget.config, paramValues),
    [widget.config, paramValues],
  );
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [showConfig, setShowConfig] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef(null);
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
    if (!WIDGET_TYPES[widget.widgetType]?.fetch) {
      // Static widget (no fetch): render straight from config.
      setState({
        loading: false,
        error: null,
        data: WIDGET_TYPES[widget.widgetType]?.transform
          ? WIDGET_TYPES[widget.widgetType].transform(null, resolvedConfig)
          : null,
      });
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await def.fetch(resolvedConfig, { force }); // force = bust TTL/SWR caches (manual ↻ / Apply)
      const transformed = def.transform(data, resolvedConfig);

      transformed._fetchedAt = Date.now(); // freshness constitution: every live widget stamps its last run
      setState({ loading: false, error: null, data: transformed });
  // Content-based auto-fit: registry entries may declare autoHeight(view, config)
  // → px; the app fits the grid row height once (unless the user resized manually).
  const autoPx = def.autoHeight ? def.autoHeight(transformed, resolvedConfig) : null;
  if (autoPx && onAutoHeightRef.current) onAutoHeightRef.current(widget.id, autoPx);
    } catch (e) {
      setState({ loading: false, error: e.message, data: null });
    }
  }, [widget.widgetType, resolvedConfig]);

  // Load on mount, on widget-type change, or when the app signals a full
  // reload (reloadKey bumped by import / example / reset). Config edits
  // do NOT auto-reload — the ⚙ panel is a draft surface; Apply & Reload
  // (or ↻) commits. No speculative fetches while typing ("C", "Ca",
  // "Cat" must not each hit the APIs).
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, widget.widgetType]);

  // Auto-refresh (static widgets have nothing to refresh)
  useEffect(() => {
    if (!WIDGET_TYPES[widget.widgetType]?.fetch) return;
    const secs = (resolvedConfig.refreshSeconds || 3600) * 1000;
    intervalRef.current = setInterval(load, secs);
    return () => clearInterval(intervalRef.current);
  }, [load, resolvedConfig.refreshSeconds]);

  const handleConfigChange = (key, value) => {
    onUpdateConfig(widget.id, { ...widget.config, [key]: value });
  };

  return (
    <div className="widget-frame">
      <div className="widget-header">
        <span className="widget-title" title={headerTooltip}>
          {def?.icon} {headerTitle}
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
                <textarea
                  value={widget.config[field.key] || ''}
                  onChange={e => handleConfigChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={field.rows || 6}
                />
              ) : (
                <input
                  type="text"
                  value={widget.config[field.key] || ''}
                  onChange={e => handleConfigChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                />
              )}
            </div>
          ))}
          <button className="widget-btn widget-btn-apply" onClick={() => { setShowConfig(false); load(true); }}>
            Apply & Reload
          </button>
        </div>
      )}

      {showInfo && (
        <div className="widget-info">
          <div className="widget-info-head">
            <span className="widget-info-name">{def?.icon} {def?.name || widget.widgetType}</span>
            <code className="widget-info-slug">{def?.id || widget.widgetType}</code>
          </div>
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
    case 'BoardControlsCard': return <BoardControlsCard data={data} paramSpecs={paramSpecs} paramValues={paramValues} onSetParam={onSetParam} />;
    case 'TopPagesExpandedCard': return <TopPagesExpandedCard data={data} />;
    case 'ExcerptCard': return <ExcerptCard data={data} />;
    case 'EditHistoryCard': return <EditHistoryCard data={data} />;
    case 'QualityCard': return <QualityCard data={data} />;
    case 'AssessmentsCard': return <AssessmentsCard data={data} />;
    case 'GalleryGridCard': return <GalleryGridCard data={data} />;
    case 'GalleryListCard': return <GalleryListCard data={data} />;
case 'MediaPlayerCard': return <MediaPlayerCard data={data} />;
    case 'ArticleListCard': return <ArticleListCard data={data} />;

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

  const values = chartData.map(d => d[chartKey]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const points = chartData.map((d, i) => {
    const x = (i / (chartData.length - 1)) * 100;
    const y = 100 - ((d[chartKey] - min) / range) * 90;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="trend-card">
      {data.title && <div className="trend-title" title={data.title}>{data.title}</div>}
      {data.subtitle && <div className="trend-subtitle">{data.subtitle}</div>}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="trend-svg">
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        <polygon
          points={`0,100 ${points} 100,100`}
          fill="var(--accent)"
          fillOpacity="0.1"
        />
      </svg>
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

/** Board Controls (ISSUE-50) — renders one control group per declared board
 *  param (buttons / select / text); a change writes the param via onSetParam,
 *  which re-resolves every widget config referencing {{param}} and bumps
 *  reloadKey → referencing widgets re-fetch. The specs/values/setter arrive
 *  as WidgetFrame props (only this renderer consumes them) — `data` is just
 *  the card's own config (title). */
function BoardControlsCard({ data, paramSpecs, paramValues, onSetParam }) {
  const specs = paramSpecs || {};
  const names = Object.keys(specs);
  return (
    <div className="board-controls">
      {data.title && <div className="stat-title">{data.title}</div>}
      {names.length === 0 && (
        <div className="widget-empty">
          No board params declared. Add a <code>params</code> block to the
          dashboard JSON, then reference them with <code>{'{{name}}'}</code> in
          any widget config.
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

/** Article Gallery — grid of thumbs with captions below (size: small/medium/large). */
function GalleryGridCard({ data }) {
  const size = data.size || 'medium';
  const fit = data.fit || 'contain';
  const rows = data.rows || [];
  return (
    <div className="gallery-card">
      <div className="ranking-title" title={data.title}>{data.title}</div>
      <div className="ranking-subtitle">{data.subtitle}</div>
      <div className={`gallery-grid gallery-${size}`}>
        {rows.length === 0 && <div className="widget-empty">No captioned images found</div>}
        {rows.map((img) => (
          <a key={img.title} className="gallery-item" href={img.fileUrl} target="_blank" rel="noopener noreferrer" title={img.caption || img.title}>
            <img className="gallery-thumb" src={img.thumbUrl} alt={img.caption || img.title} loading="lazy" style={{ objectFit: fit }} />
            {img.caption && <span className="gallery-caption">{img.caption}</span>}
          </a>
        ))}
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

/** Article Gallery — list rows: thumb left, caption right. */
function GalleryListCard({ data }) {
  const rows = data.rows || [];
  return (
    <div className="gallery-card gallery-list-card">
      <div className="ranking-title" title={data.title}>{data.title}</div>
      <div className="ranking-subtitle">{data.subtitle}</div>
      <div className="gallery-list">
        {rows.length === 0 && <div className="widget-empty">No captioned images found</div>}
        {rows.map((img) => (
          <a key={img.title} className="gallery-list-item" href={img.fileUrl} target="_blank" rel="noopener noreferrer">
            <img className="gallery-list-thumb" src={img.thumbUrl} alt={img.caption || img.title} loading="lazy" />
            <div className="gallery-list-body">
              <span className="gallery-list-caption">{img.caption || img.title}</span>
              <span className="gallery-list-file">{img.title}</span>
            </div>
          </a>
        ))}
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
  if (!data?.url) return <div className="widget-empty">Enter a page title</div>;
  return (
    <div className="wikipage-card">
      <iframe
        className="wikipage-iframe"
        src={data.url}
        title={data.page}
        referrerPolicy="no-referrer"
        loading="lazy"
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
  const fmt = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n));
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
                <text x={PAD_L - 6} y={t.y + 3} textAnchor="end" className="file-traffic-axis">{fmt(t.v)}</text>
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
