import { useState, useEffect, useRef, useCallback } from 'react';
import { WIDGET_TYPES } from './index';
import { renderMarkdown } from '../lib/markdown';
import { loadPannellum } from '../lib/pannellumLoader';
import '../vendor/pannellum.css';

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
    case 'TopPagesExpandedCard': return <TopPagesExpandedCard data={data} />;
    case 'ExcerptCard': return <ExcerptCard data={data} />;
    case 'EditHistoryCard': return <EditHistoryCard data={data} />;
    case 'QualityCard': return <QualityCard data={data} />;
    case 'AssessmentsCard': return <AssessmentsCard data={data} />;
    case 'GalleryGridCard': return <GalleryGridCard data={data} />;
    case 'GalleryListCard': return <GalleryListCard data={data} />;
    case 'ArticleListCard': return <ArticleListCard data={data} />;
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
