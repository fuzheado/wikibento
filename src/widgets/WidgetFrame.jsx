import { useState, useEffect, useRef, useCallback } from 'react';
import { WIDGET_TYPES } from './index';
import { renderMarkdown } from '../lib/markdown';

/**
 * Frame around every widget — handles loading, error, title bar, refresh.
 */
export default function WidgetFrame({ widget, onRemove, onUpdateConfig }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [showConfig, setShowConfig] = useState(false);
  const intervalRef = useRef(null);
  const def = WIDGET_TYPES[widget.widgetType];

  // Header shows the analyzed asset (from config, live) unless the user
  // explicitly set a custom _title. Falls back to the generic widget name.
  const headerTitle =
    widget.config._title && widget.config._title !== def?.name
      ? widget.config._title
      : def?.labelFromConfig?.(widget.config) || def?.name || widget.widgetType;

  // Renderer can depend on config (e.g. pageviews stat vs trend display mode).
  const renderer = def?.getRenderer?.(widget.config) || def?.renderer || 'StatCard';

  const load = useCallback(async () => {
    if (!WIDGET_TYPES[widget.widgetType]?.fetch) {
      // Static widget (no fetch): render straight from config.
      setState({
        loading: false,
        error: null,
        data: WIDGET_TYPES[widget.widgetType]?.transform
          ? WIDGET_TYPES[widget.widgetType].transform(null, widget.config)
          : null,
      });
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await def.fetch(widget.config);
      const transformed = def.transform(data, widget.config);
      setState({ loading: false, error: null, data: transformed });
    } catch (e) {
      setState({ loading: false, error: e.message, data: null });
    }
  }, [widget.widgetType, widget.config]);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh (static widgets have nothing to refresh)
  useEffect(() => {
    if (!WIDGET_TYPES[widget.widgetType]?.fetch) return;
    const secs = (widget.config.refreshSeconds || 3600) * 1000;
    intervalRef.current = setInterval(load, secs);
    return () => clearInterval(intervalRef.current);
  }, [load, widget.config.refreshSeconds]);

  const handleConfigChange = (key, value) => {
    onUpdateConfig(widget.id, { ...widget.config, [key]: value });
  };

  return (
    <div className="widget-frame">
      <div className="widget-header">
        <span className="widget-title" title={headerTitle}>
          {def?.icon} {headerTitle}
        </span>
        <div className="widget-actions">
          <button
            className="widget-btn"
            onClick={() => setShowConfig(!showConfig)}
            title="Configure"
          >⚙</button>
          <button className="widget-btn" onClick={load} title="Refresh">↻</button>
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
              {field.type === 'select' ? (
                <select
                  value={widget.config[field.key] || ''}
                  onChange={e => handleConfigChange(field.key, e.target.value)}
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
                <input
                  type="number"
                  value={widget.config[field.key] || ''}
                  onChange={e => handleConfigChange(field.key, parseInt(e.target.value) || 0)}
                  placeholder={field.placeholder}
                />
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
          <button className="widget-btn widget-btn-apply" onClick={() => { setShowConfig(false); load(); }}>
            Apply & Reload
          </button>
        </div>
      )}

      <div className="widget-body">
        {state.loading && <div className="widget-loading">Loading…</div>}
        {state.error && (
          <div className="widget-error">
            <span>⚠ {state.error}</span>
            <button className="widget-btn" onClick={load}>Retry</button>
          </div>
        )}
        {state.data && !state.loading && (
          <WidgetContent type={renderer} data={state.data} />
        )}
      </div>
    </div>
  );
}

function WidgetContent({ type, data }) {
  switch (type) {
    case 'StatCard': return <StatCard data={data} />;
    case 'RankingCard': return <RankingCard data={data} />;
    case 'TrendCard': return <TrendCard data={data} />;
    case 'GlamCard': return <GlamCard data={data} />;
    case 'MarkdownCard': return <MarkdownCard data={data} />;
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
            <span key={i} className={`ranking-col col-${i}`}>{col}</span>
          ))}
        </div>
      )}
      <div className="ranking-rows">
        {(data.rows || []).map((row, i) => (
          <div key={i} className="ranking-row">
            <span className="rank-num">{i + 1}.</span>
            {row.map((cell, j) => (
              <span key={j} className={`ranking-col col-${j}`} title={String(cell)}>{cell}</span>
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
      {data.title && <div className="stat-title" title={data.title}>{data.title}</div>}
      {data.subtitle && <div className="stat-subtitle">{data.subtitle}</div>}
      <div className="glam-stats">
        {(data.stats || []).map((s, i) => (
          <div key={i} className="glam-stat">
            <div className="glam-stat-value" title={s.value}>{s.value}</div>
            <div className="glam-stat-label">{s.label}</div>
            {s.sub && <div className="glam-stat-sub">{s.sub}</div>}
          </div>
        ))}
      </div>
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
          {data.detail.title && <div className="ranking-title" title={data.detail.title}>{data.detail.title}</div>}
          <div className="ranking-header">
            <span className="ranking-col col-0">Wiki</span>
            <span className="ranking-col col-1">Page</span>
            <span className="ranking-col col-2">Views</span>
          </div>
          <div className="ranking-rows">
            {data.detail.rows.map((row, i) => (
              <div key={i} className="ranking-row">
                <span className="ranking-col col-0" title={row.wiki}>{row.wiki.replace(/\.org$/, '')}</span>
                <span className="ranking-col col-1" title={`${row.wiki}:${row.page}`}>{row.page}</span>
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
