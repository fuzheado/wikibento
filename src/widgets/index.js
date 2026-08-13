/**
 * Widget Registry — defines all available widget types.
 * Each entry: { id, name, description, icon, defaults, renderer }
 */

import {
  fetchPageviews,
  fetchExternalLinks,
  fetchCategorySize,
  fetchWikistats,
  fetchFileUsage,
  fetchGlamStats,
  fetchTopPages,
  fetchArticleSummary,
  fetchArticleQuality,
  fetchAssessments,
  fetchEditHistory,
  fetchArticleGallery,
  fetchPanoramaFile,
 fetchCommonsGallery,
 fetchArticleList,
 fetchSparql,
 fetchCimSnapshot,
 fetchCimTrend,
 fetchCimTopFiles,
 fetchCimTopWikis,
 fetchCimTopPages,
 fetchCimTopEditors,
 fetchCimLeaderboard,
 fetchCimFileSpotlight,
} from './dataSources';
import { SPARQL_PRESETS, getPreset } from '../lib/sparqlPresets';

const NAMESPACE_LABELS = {
  '0': 'articles only',
  '0|1': 'articles + talk',
  '6': 'files',
  '10': 'templates',
  '14': 'categories',
};

/** Shared project picker for the article-focused widgets. */
const PROJECT_OPTIONS = [
  { value: 'en.wikipedia', label: 'English Wikipedia' },
  { value: 'de.wikipedia', label: 'German Wikipedia' },
  { value: 'fr.wikipedia', label: 'French Wikipedia' },
];

// ── Commons Impact Metrics (CIM) shared options ─────────────
// Precomputed monthly data for allow-listed categories. Unregistered
// categories 404 ("not loaded yet") — the widgets surface a friendly
// register hint; the GLAM live walk is a separate widget (unchanged).
const CIM_SCOPES = [
  { value: 'deep', label: 'Deep (whole tree)' },
  { value: 'shallow', label: 'Shallow (category only)' },
];
const CIM_WIKIS = [
  { value: 'all-wikis', label: 'All wikis' },
  ...PROJECT_OPTIONS,
];
const CIM_EDIT_TYPES = [
  { value: 'all-edit-types', label: 'All edit types' },
  { value: 'create', label: 'Creates' },
  { value: 'update', label: 'Updates' },
];
const CIM_CATEGORY_FIELD = { key: 'category', label: 'Commons category', type: 'text', placeholder: 'Files from the Biodiversity Heritage Library' };
const CIM_MONTH_FIELD = { key: 'month', label: 'Month (default: last complete month)', type: 'number', placeholder: '7' };
const cimRanking = (title, subtitle, columns, rows, colClasses) => ({ title, subtitle, columns, rows, colClasses });

// Wiki Page widget: en/de/fr + Commons (the shared PROJECT_OPTIONS stays
// article-focused — commons.wikimedia breaks the other article widgets).
const WIKI_PAGE_PROJECTS = [
  ...PROJECT_OPTIONS,
  { value: 'commons.wikimedia', label: 'Wikimedia Commons' },
];

// Previous calendar month (complete pageview data) for widget defaults.
const PREV_MONTH = (() => {
  const d = new Date();
  return { year: d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(), month: d.getMonth() === 0 ? 12 : d.getMonth() };
})();

// Noisy sponsored/TLD articles that pollute the top list (.xxx, .xyz,
// XXX, XXXX (beer)…) — filtered by default (config: filterNoise).
const NOISE_RE = [
  /^\.[a-z0-9-]{1,63}$/i,        // dot-TLD pages: .xxx, .xyz, .top
  /^x{3,4}(\s*\([^)]*\))?$/i,  // bare/sponsored XXX variants: xxx, XXXX (beer)
];

export const WIDGET_TYPES = {
  pageviews: {
    id: 'pageviews',
    name: 'Article Pageviews',
    icon: '📊',
    description: '30-day pageview count for a Wikipedia article',
    labelFromConfig: (c) => c.article?.replace(/_/g, ' '),
    defaults: {
      article: 'Main_Page',
      project: 'en.wikipedia',
      displayMode: 'stat', // 'stat' | 'trend'
      refreshSeconds: 3600,
    },
    renderer: 'StatCard',
    getRenderer: (config) => config.displayMode === 'trend' ? 'TrendCard' : 'StatCard',
    dataSource: 'pageviews',
    configFields: [
      { key: 'article', label: 'Article', type: 'text', placeholder: 'Main_Page' },
      { key: 'project', label: 'Project', type: 'select', options: [
        { value: 'en.wikipedia', label: 'English Wikipedia' },
        { value: 'de.wikipedia', label: 'German Wikipedia' },
        { value: 'fr.wikipedia', label: 'French Wikipedia' },
        { value: 'commons.wikimedia', label: 'Wikimedia Commons' },
      ]},
      { key: 'displayMode', label: 'Display', type: 'select', options: [
        { value: 'stat', label: 'Stat Card' },
        { value: 'trend', label: 'Trend Chart' },
      ]},
    ],
    fetch: (config) => fetchPageviews(config.article, config.project),
    transform: (data, config) => {
      if (config.displayMode === 'stat') {
        return {
          title: `${data.article.replace(/_/g, ' ')}`,
          subtitle: '30-day pageviews',
          value: data.total?.toLocaleString(),
          detail: `~${data.avg?.toLocaleString()}/day`,
          trend: data.trend,
          trendLabel: 'Daily views',
        };
      }
      return {
        chartData: data.trend,
        chartKey: 'views',
        chartLabel: 'Daily Pageviews',
        title: `${data.article.replace(/_/g, ' ')}`,
        subtitle: '30-day pageviews',
      };
    },
  },

  linkcount: {
    id: 'linkcount',
    name: 'External Link Count',
    icon: '🔗',
    description: 'Count pages linking to a domain on Wikipedia',
    labelFromConfig: (c) => c.domain,
    defaults: {
      domain: 'Libretexts.org',
      wiki: 'en.wikipedia',
      namespace: '', // '' = all namespaces; '0' = article space only
      refreshSeconds: 3600,
    },
    renderer: 'StatCard',
    dataSource: 'exturlusage',
    configFields: [
      { key: 'domain', label: 'Domain', type: 'text', placeholder: 'example.org' },
      { key: 'wiki', label: 'Wiki', type: 'select', options: [
        { value: 'en.wikipedia', label: 'English Wikipedia' },
        { value: 'de.wikipedia', label: 'German Wikipedia' },
        { value: 'fr.wikipedia', label: 'French Wikipedia' },
      ]},
      { key: 'namespace', label: 'Namespace', type: 'select', options: [
        { value: '', label: 'All namespaces' },
        { value: '0', label: 'Articles only' },
        { value: '0|1', label: 'Articles + Talk' },
        { value: '6', label: 'Files' },
        { value: '10', label: 'Templates' },
        { value: '14', label: 'Categories' },
      ]},
    ],
    fetch: (config) => fetchExternalLinks(config.domain, config.wiki, config.namespace),
    transform: (data) => ({
      title: `Links to ${data.domain}`,
      subtitle: `on ${data.wiki}.org${data.namespace ? ` · ${NAMESPACE_LABELS[data.namespace] || `ns ${data.namespace}`}` : ''}${data.totalExact ? '' : ' (5,000+ total)'}`,
      value: typeof data.total === 'string' ? data.total : data.total?.toLocaleString(),
      detail: data.totalExact ? 'total pages linking' : 'pages linking (capped)',
    }),
  },

  categorySize: {
    id: 'categorySize',
    name: 'Category Size',
    icon: '📁',
    description: 'File/page count for a Commons or Wikipedia category',
    labelFromConfig: (c) => c.category?.replace(/^Category:\s*/i, ''),
    defaults: {
      category: 'Images from Wiki Loves Monuments 2024',
      wiki: 'commons.wikimedia',
      sampleCount: 6,
      refreshSeconds: 3600,
    },
    renderer: 'StatCard',
    dataSource: 'categoryinfo',
    configFields: [
      { key: 'category', label: 'Category', type: 'text', placeholder: 'Images from X' },
      { key: 'wiki', label: 'Wiki', type: 'select', options: [
        { value: 'commons.wikimedia', label: 'Wikimedia Commons' },
        { value: 'en.wikipedia', label: 'English Wikipedia' },
      ]},
      { key: 'sampleCount', label: 'Sample imgs', type: 'number', placeholder: '0 = off, max 24' },
    ],
    fetch: (config) => fetchCategorySize(config.category, config.wiki, config.sampleCount),
    transform: (data, config) => ({
      title: data.category,
      subtitle: config.wiki === 'commons.wikimedia' ? 'on Wikimedia Commons' : `on ${config.wiki}`,
      value: data.total?.toLocaleString(),
      detail: `${data.files?.toLocaleString() || 0} files, ${data.pages?.toLocaleString() || 0} pages, ${data.subcats?.toLocaleString() || 0} subcats`,
      sample: data.sample || [],
    }),
  },

  wikistats: {
    id: 'wikistats',
    name: 'Wiki Stats',
    icon: '🌐',
    description: 'Aggregate stats for a Wikipedia language edition',
    labelFromConfig: (c) => c.lang ? `${c.lang}.wikipedia.org` : null,
    defaults: {
      table: 'wikipedias',
      lang: 'en',
      refreshSeconds: 7200,
    },
    renderer: 'StatCard',
    dataSource: 'wikistats',
    configFields: [
      { key: 'lang', label: 'Language', type: 'select', options: [
        { value: 'en', label: 'English' },
        { value: 'de', label: 'German' },
        { value: 'fr', label: 'French' },
        { value: 'ja', label: 'Japanese' },
        { value: 'zh', label: 'Chinese' },
        { value: 'es', label: 'Spanish' },
        { value: 'ar', label: 'Arabic' },
        { value: 'pt', label: 'Portuguese' },
        { value: 'ru', label: 'Russian' },
        { value: 'it', label: 'Italian' },
      ]},
      { key: 'table', label: 'Project Type', type: 'select', options: [
        { value: 'wikipedias', label: 'Wikipedias' },
        { value: 'wiktionaries', label: 'Wiktionaries' },
        { value: 'wikisources', label: 'Wikisources' },
      ]},
    ],
    fetch: (config) => fetchWikistats(config.table, config.lang),
    transform: (data) => ({
      title: `${data.lang || data.rows?.[0]?.lang}.wikipedia.org`,
      subtitle: 'Aggregate statistics',
      value: (parseInt(data.good) || parseInt(data.total) || 0).toLocaleString(),
      detail: data.good ? `Articles: ${parseInt(data.good).toLocaleString()} · Edits: ${parseInt(data.edits).toLocaleString()} · Users: ${parseInt(data.users).toLocaleString()}` : '',
    }),
  },

  fileUsage: {
    id: 'fileUsage',
    name: 'File Usage Map',
    icon: '🖼️',
    description: 'How many wikis use a Commons file, with top breakdown',
    labelFromConfig: (c) => c.filename?.replace(/^File:\s*/i, ''),
    defaults: {
      filename: 'Example.jpg',
      topN: 10,
      showImage: true,
      showCaption: false,
      refreshSeconds: 3600,
    },
    renderer: 'RankingCard',
    dataSource: 'globalusage',
    configFields: [
      { key: 'filename', label: 'Commons Filename', type: 'text', placeholder: 'Example.jpg' },
      { key: 'topN', label: 'Top N wikis', type: 'number', placeholder: '10' },
      { key: 'showImage', label: 'Show image', type: 'boolean' },
      { key: 'showCaption', label: 'Show caption', type: 'boolean' },
    ],
    fetch: (config) => fetchFileUsage(config.filename, config.topN),
    transform: (data, config) => ({
      title: `Usage of ${data.filename}`,
      subtitle: `${data.totalUsages} uses across ${data.totalWikis} wikis`,
      fileTitle: `File:${data.filename.replace(/^File:\s*/i, '')}`,
      columns: ['Wiki', 'Uses'],
      rows: data.top.map(({ wiki, count }) => [wiki, count.toLocaleString()]),
      image: config.showImage !== false ? data.image : null,
      caption: config.showCaption ? data.image?.description : null,
    }),
  },

  glamorgan: {
    id: 'glamorgan',
    name: 'GLAM Category Usage',
    icon: '📈',
    description: 'Impact stats for a Commons category: files, used files, pages, total views (GLAMorgan-style)',
    labelFromConfig: (c) => c.category?.replace(/^Category:\s*/i, ''),
    defaults: {
      category: 'Featured pictures on Wikimedia Commons',
      depth: 0,
      year: PREV_MONTH.year,
      month: PREV_MONTH.month,
      negcats: '',
      negdepth: 0,
      fileBudget: 500,
      topN: 5,
      showDetail: true,
      refreshSeconds: 7200,
    },
    renderer: 'GlamCard',
    dataSource: 'petscan-style walk + pageviews',
    configFields: [
      { key: 'category', label: 'Category', type: 'text', placeholder: 'Images from X' },
      { key: 'depth', label: 'Depth', type: 'number', placeholder: '0-12' },
      { key: 'year', label: 'Year', type: 'number', placeholder: '2026' },
      { key: 'month', label: 'Month', type: 'number', placeholder: '1-12' },
      { key: 'negcats', label: 'Exclude cats', type: 'text', placeholder: 'Cat A|Cat B' },
      { key: 'negdepth', label: 'Excl depth', type: 'number', placeholder: '0' },
      { key: 'fileBudget', label: 'File budget', type: 'number', placeholder: '500' },
      { key: 'topN', label: 'Top images', type: 'number', placeholder: '5' },
      { key: 'showDetail', label: 'Top file detail', type: 'boolean' },
    ],
    fetch: (config) => fetchGlamStats(config),
    transform: (data) => ({
      title: data.category,
      subtitle: `${data.monthLabel} · ${data.files.toLocaleString()} files${data.cappedFiles ? ' (capped)' : ''}${data.partialViews ? ' · views partial' : ''}`,
      stats: [
        { label: 'Files in category', value: data.files.toLocaleString(), sub: data.cappedFiles ? 'budget-capped' : undefined },
        { label: 'Files viewed', value: data.viewedFiles.toLocaleString(), sub: `of ${data.usedFiles.toLocaleString()} used` },
        { label: 'Pages using files', value: data.pages.toLocaleString(), sub: `on ${data.wikis.toLocaleString()} wikis` },
        { label: 'Total views', value: data.totalViews.toLocaleString(), sub: data.monthLabel },
      ],
      filmstrip: data.top,
      detail: data.detail,
    }),
  },

  topWikipedias: {
    id: 'topWikipedias',
    name: 'Top 10 Wikipedias',
    icon: '🏆',
    description: 'Largest Wikipedias by article count',
    defaults: {
      refreshSeconds: 7200,
    },
    renderer: 'RankingCard',
    dataSource: 'wikistats',
    configFields: [],
    fetch: () => fetchWikistats('wikipedias', null),
    transform: (data) => ({
      title: 'Largest Wikipedias',
      subtitle: 'By article count',
      columns: ['Language', 'Articles'],
      rows: (data.rows || []).map(r => [r.lang, (parseInt(r.good) || 0).toLocaleString()]),
    }),
  },

  topPages: {
    id: 'topPages',
    name: 'Top Wikipedia Articles',
    icon: '🔥',
    description: 'Most-visited articles on a Wikipedia language edition (top.hatnote.com)',
    labelFromConfig: (c) => c.lang ? `${c.lang}.wikipedia` : null,
    defaults: {
      lang: 'en',
      dateMode: 'latest', // 'latest' | 'date'
      year: new Date().getUTCFullYear(),
      month: new Date().getUTCMonth() + 1,
      day: new Date().getUTCDate(),
      topN: 10, // 0 = default (10), 100 = all
      filterNoise: true,
      showExpanded: false, // thumbnail + summary per row (hatnote data)
      refreshSeconds: 3600,
    },
    renderer: 'RankingCard',
    getRenderer: (config) => config.showExpanded ? 'TopPagesExpandedCard' : 'RankingCard',
    dataSource: 'top.hatnote.com (via /api/proxy) + WMF pageviews top fallback',
    configFields: [
      { key: 'lang', label: 'Language', type: 'select', options: [
        { value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' },
        { value: 'fr', label: 'Français' }, { value: 'ko', label: '한국어' },
        { value: 'et', label: 'Eesti' }, { value: 'sv', label: 'Svenska' },
        { value: 'hu', label: 'Magyar' }, { value: 'da', label: 'Dansk' },
        { value: 'it', label: 'Italiano' }, { value: 'pa', label: 'ਪੰਜਾਬੀ' },
        { value: 'ca', label: 'Català' }, { value: 'es', label: 'Español' },
        { value: 'fa', label: 'فارسی' }, { value: 'ur', label: 'اردو' },
        { value: 'zh', label: '中文' }, { value: 'kn', label: 'ಕನ್ನಡ' },
        { value: 'no', label: 'Norsk bokmål' }, { value: 'bn', label: 'বাংলা' },
        { value: 'id', label: 'Bahasa Indonesia' }, { value: 'ta', label: 'தமிழ்' },
        { value: 'lv', label: 'Latviešu' }, { value: 'el', label: 'Ελληνικά' },
        { value: 'fi', label: 'Suomi' }, { value: 'ar', label: 'العربية' },
        { value: 'cs', label: 'Čeština' }, { value: 'or', label: 'ଓଡ଼ିଆ' },
        { value: 'te', label: 'తెలుగు' }, { value: 'gl', label: 'Galego' },
      ]},
      { key: 'dateMode', label: 'Date', type: 'select', options: [
        { value: 'latest', label: 'Latest available' },
        { value: 'date', label: 'Specific date…' },
      ]},
      { key: 'year', label: 'Year', type: 'number', placeholder: '2026' },
      { key: 'month', label: 'Month', type: 'number', placeholder: '1-12' },
      { key: 'day', label: 'Day', type: 'number', placeholder: '1-31' },
      { key: 'topN', label: 'Top N (0 = default 10, 100 = all)', type: 'number', placeholder: '10' },
      { key: 'filterNoise', label: 'Filter TLD/spam noise (.xxx, XXX…)', type: 'boolean' },
      { key: 'showExpanded', label: 'Expanded view (thumbnail + summary)', type: 'boolean' },
    ],
    fetch: (config) => fetchTopPages(config),
    transform: (data, config) => {
      let articles = data.articles;
      let filtered = 0;
      if (config.filterNoise !== false) {
        articles = articles.filter((a) => {
          const bad = NOISE_RE.some((re) => re.test(a.title));
          if (bad) filtered++;
          return !bad;
        });
      }
      // topN: 0/missing = default 10; 100 = all; anything else = that many
      const raw = config.topN == null || config.topN <= 0 ? 10 : config.topN;
      const topN = Math.min(raw, 100);
      const rows = articles.slice(0, topN);
      const subtitle = `${data.dateLabel} · ${topN >= 100 ? `all ${rows.length}` : `top ${rows.length}`}${filtered ? ` (${filtered} filtered)` : ''}${data.source === 'wmf' ? ' · via WMF Pageviews API' : ''}${data.totalTrafficShort ? ` · ${data.totalTrafficShort} views total` : ''}`;
      if (config.showExpanded) {
        return {
          title: `${data.fullLang || 'en'} Wikipedia`,
          subtitle,
          expanded: true,
          columns: ['Article', 'Views'],
          rows: rows.map((a) => ({
            title: a.title,
            views: a.views_short,
            imageUrl: a.imageUrl,
            summary: a.summary,
            url: a.url,
          })),
        };
      }
      return {
        title: `${data.fullLang || 'en'} Wikipedia`,
        subtitle,
        columns: ['Article', 'Views'],
        // No rank column: the RankingCard numbers rows sequentially 1..N,
        // so after noise filtering the list is renumbered (no gaps).
        rows: rows.map((a) => [a.title, a.views_short]),
      };
    },
  },

  markdown: {
    id: 'markdown',
    name: 'Text / Markdown',
    icon: '📝',
    description: 'Free-form Markdown card — notes, headings, links, explanations',
    defaults: {
      text: '## Welcome\n\nThis is a **Markdown** card. Click ⚙ to edit the text.',
      allowExternalImages: false,
      refreshSeconds: 86400,
    },
    renderer: 'MarkdownCard',
    dataSource: 'static (no fetch)',
    configFields: [
      { key: 'text', label: 'Markdown content', type: 'textarea', rows: 8, placeholder: '# Heading\n\nSome **bold** text…' },
      { key: 'allowExternalImages', label: 'Allow external images (any https host)', type: 'boolean' },
    ],
    // No fetch — a static widget: WidgetFrame renders transform(null, config)
    transform: (data, config) => ({ markdown: config.text, allowExternalImages: config.allowExternalImages }),
  },

  excerpt: {
    id: 'excerpt',
    name: 'Article Excerpt',
    icon: '📄',
    description: 'First paragraph, description, and thumbnail for an article',
    labelFromConfig: (c) => c.article?.replace(/_/g, ' '),
    defaults: {
      article: 'Albert Einstein',
      project: 'en.wikipedia',
      refreshSeconds: 3600,
    },
    renderer: 'ExcerptCard',
    dataSource: 'REST /page/summary',
    configFields: [
      { key: 'article', label: 'Article', type: 'text', placeholder: 'Albert Einstein' },
      { key: 'project', label: 'Project', type: 'select', options: PROJECT_OPTIONS },
    ],
    fetch: (config) => fetchArticleSummary(config.article, config.project),
    transform: (data) => ({
      title: data.title,
      description: data.description,
      extract: data.extract,
      thumbnailUrl: data.thumbnailUrl,
      pageUrl: data.pageUrl,
    }),
  },

  edithistory: {
    id: 'edithistory',
    name: 'Edit History',
    icon: '🕓',
    description: 'Recent edits to an article, newest first, with byte deltas',
    labelFromConfig: (c) => c.article?.replace(/_/g, ' '),
    defaults: {
      article: 'Albert Einstein',
      project: 'en.wikipedia',
      limit: 10,
      refreshSeconds: 3600,
    },
    renderer: 'EditHistoryCard',
    dataSource: 'Action API prop=revisions',
    configFields: [
      { key: 'article', label: 'Article', type: 'text', placeholder: 'Albert Einstein' },
      { key: 'project', label: 'Project', type: 'select', options: PROJECT_OPTIONS },
      { key: 'limit', label: 'Edits to show', type: 'number', placeholder: '10 (max 50)' },
    ],
    fetch: (config) => fetchEditHistory(config.article, config.project, Math.min(parseInt(config.limit) || 10, 50)),
    transform: (data) => ({
      title: data.article.replace(/_/g, ' '),
      project: data.project,
      rows: data.rows,
    }),
  },

  quality: {
    id: 'quality',
    name: 'Article Quality (ORES)',
    icon: '🏅',
    description: 'Predicted quality class for an article (Lift Wing / ORES)',
    labelFromConfig: (c) => c.article?.replace(/_/g, ' '),
    defaults: {
      article: 'Albert Einstein',
      project: 'en.wikipedia',
      refreshSeconds: 3600,
    },
    renderer: 'QualityCard',
    dataSource: 'Lift Wing (api.wikimedia.org)',
    configFields: [
      { key: 'article', label: 'Article', type: 'text', placeholder: 'Albert Einstein' },
      { key: 'project', label: 'Project', type: 'select', options: PROJECT_OPTIONS },
    ],
    fetch: (config) => fetchArticleQuality(config.article, config.project),
    transform: (data) => ({
      title: data.article.replace(/_/g, ' '),
      grade: data.grade,
      probabilities: data.probabilities,
      score: data.score,
      revid: data.revid,
      model: data.model,
    }),
  },

  assessments: {
    id: 'assessments',
    name: 'WikiProject Assessment',
    icon: '🧭',
    description: 'Quality + importance ratings from WikiProject banners',
    labelFromConfig: (c) => c.article?.replace(/_/g, ' '),
    defaults: {
      article: 'Albert Einstein',
      project: 'en.wikipedia',
      topN: 12,
      refreshSeconds: 3600,
    },
    renderer: 'AssessmentsCard',
    dataSource: 'Action API prop=pageassessments',
    configFields: [
      { key: 'article', label: 'Article', type: 'text', placeholder: 'Albert Einstein' },
      { key: 'project', label: 'Project', type: 'select', options: PROJECT_OPTIONS },
      { key: 'topN', label: 'Projects to show', type: 'number', placeholder: '12 (max 50)' },
    ],
    fetch: (config) => fetchAssessments(config.article, config.project, Math.min(parseInt(config.topN) || 12, 50)),
    transform: (data) => ({
      title: data.article.replace(/_/g, ' '),
      rows: data.rows,
      total: data.total,
    }),
  },

  gallery: {
    id: 'gallery',
    name: 'Article Gallery',
    icon: '🖼️',
    description: 'Significant images in an article with captions (grid or list)',
    labelFromConfig: (c) => c.article?.replace(/_/g, ' '),
    defaults: {
      article: 'Albert Einstein',
      project: 'en.wikipedia',
      displayMode: 'grid',   // 'grid' | 'list'
      iconSize: 'medium',    // grid: 'small' | 'medium' | 'large'
      imageFit: 'contain',   // grid: 'contain' (letterbox) | 'cover' (fill-crop)
      minSize: 200,          // drop images smaller than this (px)
      maxItems: 0,           // 0 = all
      refreshSeconds: 3600,
    },
    renderer: 'GalleryGridCard',
    getRenderer: (config) => config.displayMode === 'list' ? 'GalleryListCard' : 'GalleryGridCard',
    dataSource: 'REST /page/media-list + imageinfo',
    configFields: [
      { key: 'article', label: 'Article', type: 'text', placeholder: 'Albert Einstein' },
      { key: 'project', label: 'Project', type: 'select', options: PROJECT_OPTIONS },
      { key: 'displayMode', label: 'Display', type: 'select', options: [
        { value: 'grid', label: 'Grid (captions below)' },
        { value: 'list', label: 'List (thumb left, caption right)' },
      ]},
      { key: 'iconSize', label: 'Grid size', type: 'select', options: [
        { value: 'small', label: 'Small' },
        { value: 'medium', label: 'Medium' },
        { value: 'large', label: 'Large' },
      ]},
      { key: 'imageFit', label: 'Grid image fit', type: 'select', options: [
        { value: 'contain', label: 'Letterbox (always show whole image)' },
        { value: 'cover', label: 'Fill crop (square crop)' },
      ]},
      { key: 'minSize', label: 'Min image size (px)', type: 'number', placeholder: '200' },
      { key: 'maxItems', label: 'Max images (0 = all)', type: 'number', placeholder: '0' },
    ],
    fetch: (config) => fetchArticleGallery(config.article, config.project, config.minSize, config.maxItems),
    transform: (data, config) => ({
      title: data.article.replace(/_/g, ' '),
      subtitle: `${data.rows.length} images${data.dropped ? ` · ${data.dropped} filtered (tiny/uncaptioned)` : ''}`,
      rows: data.rows,
      size: config.iconSize || 'medium',
      fit: config.imageFit || 'contain',
    }),
  },

  fileGallery: {
    id: 'fileGallery',
    name: 'Commons File Gallery',
    icon: '🗂️',
    description: 'Gallery of any Commons files you list — grid or list, ordered or random',
    labelFromConfig: (c) => `${(c.files || '').split('\n').filter(Boolean).length} files`,
    defaults: {
      files: 'File:The Earth seen from Apollo 17.jpg\nFile:Airplane vortex edit.jpg\nFile:Albert Einstein Head.jpg',
      order: 'listed',      // 'listed' | 'random' | 'alpha' | 'largest'
      displayMode: 'grid',  // 'grid' | 'list'
      iconSize: 'medium',
      imageFit: 'contain',
      maxItems: 0,          // 0 = all
      refreshSeconds: 3600,
    },
    renderer: 'GalleryGridCard',
    getRenderer: (config) => config.displayMode === 'list' ? 'GalleryListCard' : 'GalleryGridCard',
    dataSource: 'Commons API imageinfo (batched)',
    configFields: [
      { key: 'files', label: 'Commons files (one per line)', type: 'textarea', rows: 8, placeholder: 'File:Example.jpg\nFile:Another photo.png' },
      { key: 'order', label: 'Order', type: 'select', options: [
        { value: 'listed', label: 'As listed' },
        { value: 'random', label: 'Random (reshuffles each refresh)' },
        { value: 'alpha', label: 'Alphabetical' },
        { value: 'largest', label: 'Largest first (by dimensions)' },
      ]},
      { key: 'displayMode', label: 'Display', type: 'select', options: [
        { value: 'grid', label: 'Grid (captions below)' },
        { value: 'list', label: 'List (thumb left, caption right)' },
      ]},
      { key: 'iconSize', label: 'Grid size', type: 'select', options: [
        { value: 'small', label: 'Small' },
        { value: 'medium', label: 'Medium' },
        { value: 'large', label: 'Large' },
      ]},
      { key: 'imageFit', label: 'Grid image fit', type: 'select', options: [
        { value: 'contain', label: 'Letterbox (always show whole image)' },
        { value: 'cover', label: 'Fill crop (square crop)' },
      ]},
      { key: 'maxItems', label: 'Max files (0 = all)', type: 'number', placeholder: '0' },
    ],
    fetch: (config) => fetchCommonsGallery(config.files),
    transform: (data, config) => {
      const ORDER_LABELS = { listed: 'as listed', random: 'random order', alpha: 'alphabetical', largest: 'largest first' };
      const order = config.order || 'listed';
      const rows = [...data.rows];
      if (order === 'random') {
        // Fisher–Yates shuffle — fresh order every refresh (transform re-runs on load).
        for (let i = rows.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rows[i], rows[j]] = [rows[j], rows[i]];
        }
      } else if (order === 'alpha') {
        rows.sort((a, b) => a.title.localeCompare(b.title));
      } else if (order === 'largest') {
        rows.sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
      }
      const maxItems = Math.max(parseInt(config.maxItems) || 0, 0);
      const subtitleBits = [
        `${rows.length} file${rows.length === 1 ? '' : 's'}`,
        order !== 'listed' ? ORDER_LABELS[order] : null,
        data.missing ? `${data.missing} not found` : null,
      ].filter(Boolean);
      return {
        title: 'Commons files',
        subtitle: subtitleBits.join(' · '),
        rows: maxItems ? rows.slice(0, maxItems) : rows,
        size: config.iconSize || 'medium',
        fit: config.imageFit || 'contain',
      };
    },
  },

  articleList: {
    id: 'articleList',
    name: 'Article List',
    icon: '📋',
    description: 'Clickable list of articles — pasted titles, optional thumbnails + intros',
    labelFromConfig: (c) => `${(c.articles || '').split('\n').filter(Boolean).length} articles`,
    defaults: {
      articles: 'Ada Lovelace\nAlbert Einstein',
      project: 'en.wikipedia',
      enrich: true,          // thumbnails + intros via pageimages|extracts
      maxItems: 0,           // 0 = all
      refreshSeconds: 3600,
    },
    renderer: 'ArticleListCard',
    dataSource: 'MediaWiki API pageimages|extracts (batched, optional)',
    configFields: [
      { key: 'articles', label: 'Article titles (one per line)', type: 'textarea', rows: 8, placeholder: 'Ada Lovelace\nAlbert Einstein' },
      { key: 'project', label: 'Project', type: 'select', options: PROJECT_OPTIONS },
      { key: 'enrich', label: 'Thumbnails + intros', type: 'boolean' },
      { key: 'maxItems', label: 'Max articles (0 = all)', type: 'number', placeholder: '0' },
    ],
    fetch: (config) => fetchArticleList(config.articles, config.project, { enrich: config.enrich, maxItems: config.maxItems }),
    transform: (data, config) => ({
      title: 'Articles',
      subtitle: `${data.rows.length} article${data.rows.length === 1 ? '' : 's'}${config.enrich ? ' · with thumbnails + intros' : ''}`,
      rows: data.rows,
    }),
  },

  cimSnapshot: {
    id: 'cimSnapshot',
    name: 'CIM Category Snapshot',
    icon: '🎯',
    description: 'Exact precomputed stats for a CIM-registered Commons category — files, used, wikis, pages',
    labelFromConfig: (c) => (c.category || '').replace(/_/g, ' '),
    defaults: { category: 'Files from the Biodiversity Heritage Library', scope: 'deep', month: 0, refreshSeconds: 3600 },
    renderer: 'CimSnapshotCard',
    dataSource: 'CIM category-metrics-snapshot (precomputed, allow-list)',
    configFields: [
      CIM_CATEGORY_FIELD,
      { key: 'scope', label: 'Scope', type: 'select', options: CIM_SCOPES },
      CIM_MONTH_FIELD,
    ],
    fetch: (config) => fetchCimSnapshot(config.category, config.scope, undefined, config.month),
    transform: (data, config) => ({
      title: data.category.replace(/_/g, ' '),
      subtitle: `precomputed (CIM) · ${config.scope === 'shallow' ? 'shallow' : 'deep'}${data.filesDeep !== data.files ? ` · deep: ${data.filesDeep.toLocaleString()} files` : ''}`,
      stats: [
        { label: 'Files', value: data.files.toLocaleString(), sub: config.scope === 'shallow' ? 'shallow' : 'deep' },
        { label: 'Files used', value: data.used.toLocaleString(), sub: config.scope === 'shallow' ? 'shallow' : 'deep' },
        { label: 'Wikis', value: data.wikis.toLocaleString(), sub: config.scope === 'shallow' ? 'shallow' : 'deep' },
        { label: 'Pages', value: data.pages.toLocaleString(), sub: config.scope === 'shallow' ? 'shallow' : 'deep' },
      ],
    }),
  },

  cimTrend: {
    id: 'cimTrend',
    name: 'CIM Views Over Time',
    icon: '📈',
    description: 'Monthly pageview trend of pages using a CIM category\'s files',
    labelFromConfig: (c) => (c.category || '').replace(/_/g, ' '),
    defaults: { category: 'Files from the Biodiversity Heritage Library', scope: 'deep', wiki: 'all-wikis', months: 6, month: 0, refreshSeconds: 3600 },
    renderer: 'TrendCard',
    dataSource: 'CIM pageviews-per-category-monthly',
    configFields: [
      CIM_CATEGORY_FIELD,
      { key: 'scope', label: 'Scope', type: 'select', options: CIM_SCOPES },
      { key: 'wiki', label: 'Wiki', type: 'select', options: CIM_WIKIS },
      { key: 'months', label: 'Months (2–24)', type: 'number', placeholder: '6' },
      CIM_MONTH_FIELD,
    ],
    fetch: (config) => fetchCimTrend(config.category, config.scope, config.wiki, undefined, config.month, config.months),
    transform: (data, config) => ({
      title: data.category.replace(/_/g, ' '),
      subtitle: `pageviews of using pages · ${config.scope} · precomputed (CIM)`,
      chartData: data.rows,
      chartKey: 'views',
      chartLabel: 'views',
    }),
  },

  cimTopFiles: {
    id: 'cimTopFiles',
    name: 'CIM Top Files',
    icon: '🖼️',
    description: 'Most-viewed files in a CIM category — thumbnails + views',
    labelFromConfig: (c) => (c.category || '').replace(/_/g, ' '),
    defaults: { category: 'Files from the Biodiversity Heritage Library', scope: 'deep', wiki: 'all-wikis', month: 0, topN: 10, refreshSeconds: 3600 },
    renderer: 'CimTopFilesCard',
    dataSource: 'CIM top-viewed-media-files-monthly + imageinfo',
    configFields: [
      CIM_CATEGORY_FIELD,
      { key: 'scope', label: 'Scope', type: 'select', options: CIM_SCOPES },
      { key: 'wiki', label: 'Wiki', type: 'select', options: CIM_WIKIS },
      CIM_MONTH_FIELD,
      { key: 'topN', label: 'Top N', type: 'number', placeholder: '10' },
    ],
    fetch: (config) => fetchCimTopFiles(config.category, config.scope, config.wiki, undefined, config.month, config.topN),
    transform: (data, config) => ({
      title: data.category.replace(/_/g, ' '),
      subtitle: `top files by pageviews · ${config.scope} · precomputed (CIM)`,
      rows: data.rows.map((r) => ({ title: r.title.replace(/_/g, ' '), views: r.views, thumbUrl: r.thumbUrl })),
    }),
  },

  cimTopWikis: {
    id: 'cimTopWikis',
    name: 'CIM Top Wikis',
    icon: '🌍',
    description: 'Which wikis use a CIM category\'s files most',
    labelFromConfig: (c) => (c.category || '').replace(/_/g, ' '),
    defaults: { category: 'Files from the Biodiversity Heritage Library', scope: 'deep', month: 0, topN: 10, refreshSeconds: 3600 },
    renderer: 'RankingCard',
    dataSource: 'CIM top-wikis-per-category-monthly',
    configFields: [CIM_CATEGORY_FIELD, { key: 'scope', label: 'Scope', type: 'select', options: CIM_SCOPES }, CIM_MONTH_FIELD, { key: 'topN', label: 'Top N', type: 'number', placeholder: '10' }],
    fetch: (config) => fetchCimTopWikis(config.category, config.scope, undefined, config.month, config.topN),
    transform: (data, config) => cimRanking(
      data.category.replace(/_/g, ' '),
      `wikis using the files · ${config.scope} · precomputed (CIM)`,
      ['Wiki', 'Views'],
      data.rows.map((r) => [r.wiki, r.views.toLocaleString()]),
      ['cim-name', 'cim-num'],
    ),
  },

  cimTopPages: {
    id: 'cimTopPages',
    name: 'CIM Top Pages',
    icon: '📄',
    description: 'Pages that use a CIM category\'s files, by views',
    labelFromConfig: (c) => (c.category || '').replace(/_/g, ' '),
    defaults: { category: 'Files from the Biodiversity Heritage Library', scope: 'deep', wiki: 'all-wikis', month: 0, topN: 10, refreshSeconds: 3600 },
    renderer: 'RankingCard',
    dataSource: 'CIM top-pages-per-category-monthly',
    configFields: [CIM_CATEGORY_FIELD, { key: 'scope', label: 'Scope', type: 'select', options: CIM_SCOPES }, { key: 'wiki', label: 'Wiki', type: 'select', options: CIM_WIKIS }, CIM_MONTH_FIELD, { key: 'topN', label: 'Top N', type: 'number', placeholder: '10' }],
    fetch: (config) => fetchCimTopPages(config.category, config.scope, config.wiki, undefined, config.month, config.topN),
    transform: (data, config) => cimRanking(
      data.category.replace(/_/g, ' '),
      `pages using the files · ${config.scope} · precomputed (CIM)`,
      ['Wiki', 'Page', 'Views'],
      data.rows.map((r) => [r.wiki, r.page.replace(/_/g, ' '), r.views.toLocaleString()]),
      ['cim-name', 'cim-name', 'cim-num'],
    ),
  },

  cimTopEditors: {
    id: 'cimTopEditors',
    name: 'CIM Top Editors',
    icon: '✍️',
    description: 'Top contributors to a CIM category, by edit count',
    labelFromConfig: (c) => (c.category || '').replace(/_/g, ' '),
    defaults: { category: 'Files from the Biodiversity Heritage Library', scope: 'deep', editType: 'all-edit-types', month: 0, topN: 10, refreshSeconds: 3600 },
    renderer: 'RankingCard',
    dataSource: 'CIM top-editors-monthly',
    configFields: [CIM_CATEGORY_FIELD, { key: 'scope', label: 'Scope', type: 'select', options: CIM_SCOPES }, { key: 'editType', label: 'Edit type', type: 'select', options: CIM_EDIT_TYPES }, CIM_MONTH_FIELD, { key: 'topN', label: 'Top N', type: 'number', placeholder: '10' }],
    fetch: (config) => fetchCimTopEditors(config.category, config.scope, config.editType, undefined, config.month, config.topN),
    transform: (data, config) => cimRanking(
      data.category.replace(/_/g, ' '),
      `top editors · ${config.editType === 'all-edit-types' ? 'all edits' : config.editType + 's'} · precomputed (CIM)`,
      ['Editor', 'Edits'],
      data.rows.map((r) => [r.user, r.edits.toLocaleString()]),
      ['cim-name', 'cim-num'],
    ),
  },

  cimLeaderboard: {
    id: 'cimLeaderboard',
    name: 'CIM Global Leaderboard',
    icon: '🏆',
    description: 'Top 100 most-viewed categories on Commons (precomputed)',
    labelFromConfig: () => 'Top 100',
    defaults: { scope: 'deep', wiki: 'all-wikis', month: 0, highlight: '', refreshSeconds: 3600 },
    renderer: 'RankingCard',
    dataSource: 'CIM top-viewed-categories-monthly',
    configFields: [
      { key: 'scope', label: 'Scope', type: 'select', options: CIM_SCOPES },
      { key: 'wiki', label: 'Wiki', type: 'select', options: CIM_WIKIS },
      CIM_MONTH_FIELD,
      { key: 'highlight', label: 'Highlight category (optional)', type: 'text', placeholder: 'Wiki Loves Monuments 2024' },
    ],
    fetch: (config) => fetchCimLeaderboard(config.scope, config.wiki, undefined, config.month),
    transform: (data, config) => {
      const highlight = (config.highlight || '').trim();
      const hl = highlight ? data.rows.find((r) => r.category.replace(/_/g, ' ').toLowerCase() === highlight.toLowerCase()) : null;
      return cimRanking(
        'Most-viewed categories',
        hl
          ? `#${hl.rank} of top 100 · ${hl.category.replace(/_/g, ' ')} (${hl.views.toLocaleString()} views)`
          : highlight ? `${highlight} not in the top 100 · precomputed (CIM)` : 'top 100 · precomputed (CIM)',
        ['Rank', 'Category', 'Views'],
        data.rows.map((r) => [String(r.rank), r.category.replace(/_/g, ' '), r.views.toLocaleString()]),
        ['cim-rank', 'cim-name', 'cim-num'],
      );
    },
  },

  cimFileSpotlight: {
    id: 'cimFileSpotlight',
    name: 'CIM File Spotlight',
    icon: '🔦',
    description: 'One Commons file: wikis/pages using it + monthly view trend',
    labelFromConfig: (c) => (c.filename || '').replace(/_/g, ' '),
    defaults: { filename: 'Dogs, jackals, wolves, and foxes (Plate XI).jpg', wiki: 'all-wikis', month: 0, refreshSeconds: 3600 },
    renderer: 'CimSnapshotCard',
    dataSource: 'CIM media-file-metrics-snapshot + pageviews-per-media-file-monthly',
    configFields: [
      { key: 'filename', label: 'Commons file', type: 'text', placeholder: 'Dogs, jackals, wolves, and foxes (Plate XI).jpg' },
      { key: 'wiki', label: 'Wiki', type: 'select', options: CIM_WIKIS },
      CIM_MONTH_FIELD,
    ],
    fetch: (config) => fetchCimFileSpotlight(config.filename, config.wiki, undefined, config.month),
    transform: (data, config) => ({
      title: data.file.replace(/_/g, ' '),
      subtitle: `precomputed (CIM) · pageviews of pages using this file`,
      stats: [
        { label: 'Wikis using it', value: data.wikis.toLocaleString(), sub: 'leveraging-wiki-count' },
        { label: 'Pages using it', value: data.pages.toLocaleString(), sub: 'leveraging-page-count' },
        { label: 'Views (month)', value: data.views.toLocaleString(), sub: 'pageviews of using pages' },
      ],
      trend: data.trend,
    }),
  },

  wikiPage: {
    id: 'wikiPage',
    name: 'Wiki Page',
    icon: '📄',
    description: 'Embed any MediaWiki page — desktop or mobile view, links browse inside',
    labelFromConfig: (c) => (c.page || '').trim().replace(/_/g, ' '),
    defaults: {
      page: 'Help:Introduction',
      project: 'en.wikipedia',
      mobile: false,       // true = the m. site (mobile skin)
      fragment: '',        // optional #anchor
      refreshSeconds: 3600,
    },
    renderer: 'WikiPageCard',
    dataSource: 'static (iframe to the wiki)',
    configFields: [
      { key: 'page', label: 'Page', type: 'text', placeholder: 'Help:Introduction' },
      { key: 'project', label: 'Project', type: 'select', options: WIKI_PAGE_PROJECTS },
      { key: 'mobile', label: 'Mobile view (?useformat=mobile)', type: 'boolean' },
      { key: 'fragment', label: 'Section anchor (optional)', type: 'text', placeholder: 'History' },
    ],
    // Static widget — no fetch: the iframe IS the widget (Wikimedia pages
    // send no X-Frame-Options / frame-ancestors, verified 2026-08-13).
    transform: (data, config) => {
      const project = config.project || 'en.wikipedia';
      const mobile = !!config.mobile;
      const page = String(config.page || '').trim();
      if (!page) return { url: null, page: '', project };
      const title = page.replace(/ /g, '_');
      const frag = String(config.fragment || '').replace(/^#/, '').trim();
      // Mobile view on the SAME domain. The m. subdomains are retired —
      // en.m.wikipedia.org 301s to en.wikipedia.org (verified 2026-08-13),
      // so host-swapping no longer works. `?useformat=mobile` is
      // MobileFrontend's own preview parameter — it activates the mobile
      // view on the standard domain (verified 200 + Minerva skin HTML,
      // 2026-08-13; no special cookies). `?useskin=minerva` also works but
      // is the generic skin override rather than the documented switch.
      const host = project === 'commons.wikimedia'
        ? 'https://commons.wikimedia.org'
        : `https://${project}.org`;
      return {
        url: `${host}/wiki/${title}${mobile ? '?useformat=mobile' : ''}${frag ? `#${frag.replace(/ /g, '_')}` : ''}`,
        page: title.replace(/_/g, ' '),
        project,
      };
    },
  },

  sparql: {
    id: 'sparql',
    name: 'SPARQL Query',
    icon: '🧠',
    description: 'Run any SPARQL query — Wikidata (WDQS) or Commons (QLever); big number, bars, table, or trend',
    labelFromConfig: (c) => (getPreset(c.preset)?.label || (c.query || '').split('\n')[0]?.slice(0, 40) || 'SPARQL'),
    defaults: {
      preset: 'met-collection',
      query: '',
      endpoint: 'wdqs',      // 'wdqs' | 'qlever-commons' | 'humaniki'
      renderer: 'auto',      // 'auto' | 'stat' | 'bar' | 'line' | 'table'
      maxRows: 100,
      refreshSeconds: 1800,
    },
    renderer: 'SparqlCard',
    dataSource: 'WDQS / QLever SPARQL + Humaniki API',
    configFields: [
      { key: 'preset', label: 'Preset (fills the query)', type: 'preset',
        options: SPARQL_PRESETS.map((p) => ({ value: p.id, label: p.label })),
        presets: SPARQL_PRESETS },
      { key: 'query', label: 'SPARQL query', type: 'textarea', rows: 10, placeholder: 'SELECT ...' },
      { key: 'endpoint', label: 'Endpoint', type: 'select', options: [
        { value: 'wdqs', label: 'Wikidata (WDQS)' },
        { value: 'qlever-commons', label: 'Commons SDC (QLever)' },
        { value: 'humaniki', label: 'Humaniki (gender gap, precomputed)' },
      ]},
      { key: 'renderer', label: 'Renderer (auto-detects)', type: 'select', options: [
        { value: 'auto', label: 'Auto (from result shape)' },
        { value: 'stat', label: 'Big number' },
        { value: 'bar', label: 'Bar chart' },
        { value: 'line', label: 'Line chart' },
        { value: 'table', label: 'Table' },
      ]},
      { key: 'maxRows', label: 'Max rows', type: 'number', placeholder: '100' },
    ],
    fetch: (config) => {
      const preset = getPreset(config.preset);
      const query = config.query || preset?.query || '';
      const endpoint = config.endpoint || preset?.endpoint || 'wdqs';
      return fetchSparql(query, endpoint, config.maxRows);
    },
    transform: (data, config) => {
      const preset = getPreset(config.preset);
      const title = preset?.label || 'SPARQL result';
      const vars = data.vars || [];
      const rows = data.rows || [];
      const fmt = (v) => (typeof v === 'number' ? v.toLocaleString() : String(v ?? '—'));
      // Which vars are numeric (per first row's coerced type)?
      const numeric = (v) => rows.length > 0 && typeof rows[0][v] === 'number';
      const numericVars = vars.filter(numeric);
      const dateish = (v) => /year|date|time|month|decade|century/i.test(v) && !numeric(v);
      const labelVar = vars.find((v) => /label$/i.test(v) && !numeric(v)) || vars.find((v) => !numeric(v) && !dateish(v));

      // Manual override wins; otherwise detect from the result shape.
      let mode = config.renderer || 'auto';
      if (mode === 'auto') {
        if (!rows.length || !numericVars.length) mode = 'table';
        else if (rows.length === 1) mode = 'stat';
        else if (vars.some(dateish)) mode = 'line';
        else if (numericVars.length === 1) mode = 'bar';
        else mode = 'table';
      }
      if (mode === 'bar' && !labelVar) mode = 'table';

      if (mode === 'stat') {
        const valueVar = numericVars[numericVars.length - 1] || vars[vars.length - 1];
        const value = rows[0][valueVar];
        const detail = vars.filter((v) => v !== valueVar).map((v) => `${v}: ${fmt(rows[0][v])}`).join(' · ');
        return {
          mode,
          title,
          subtitle: `${rows.length} row · ${valueVar}`,
          value: valueVar === 'pct' ? `${value}%` : fmt(value),
          detail,
        };
      }
      if (mode === 'line') {
        const xVar = vars.find(dateish) || vars.find((v) => !numeric(v));
        const yVar = numericVars[0];
        return {
          mode,
          title,
          subtitle: `${rows.length} points · ${yVar} by ${xVar}`,
          chartData: rows.map((r) => ({ date: String(r[xVar]), value: r[yVar] })),
          chartKey: 'value',
          chartLabel: yVar,
        };
      }
      if (mode === 'bar') {
        const rows2 = rows
          .map((r) => ({ label: fmt(r[labelVar]), value: r[numericVars[0]] }))
          .slice(0, 25);
        return { mode, title, subtitle: `${rows2.length} rows · ${numericVars[0]}`, rows: rows2 };
      }
      // table (default)
      return {
        mode: 'table',
        title,
        subtitle: `${rows.length} rows · ${vars.join(', ')}`,
        columns: vars,
        rows: rows.map((r) => vars.map((v) => fmt(r[v]))),
      };
    },
  },

  panorama360: {
    id: 'panorama360',
    name: '360° Panorama Viewer',
    icon: '🌐',
    description: 'Interactive 360° panorama from a Commons equirectangular file',
    labelFromConfig: (c) => c.filename?.replace(/^File:\s*/i, '').replace(/_/g, ' '),
    defaults: {
      filename: "File:'Imiloa grounds 360 Degree View (20220329 Hilo Planetarium HQ-CC2).jpg",
      project: 'commons.wikimedia',
      autoRotate: false,
      refreshSeconds: 3600,
    },
    renderer: 'PanoramaCard',
    dataSource: 'Commons imageinfo + Pannellum',
    // Per-widget layout constraints (react-grid-layout minW/minH/maxW/maxH).
    defaultLayout: { w: 4, h: 3, minW: 3, minH: 2 },
    configFields: [
      { key: 'filename', label: 'Commons file (360° / equirectangular)', type: 'text', placeholder: 'File:Example 360.jpg' },
      { key: 'project', label: 'Project', type: 'select', options: [
        { value: 'commons.wikimedia', label: 'Wikimedia Commons' },
      ]},
      { key: 'autoRotate', label: 'Auto-rotate', type: 'boolean' },
    ],
    fetch: (config) => fetchPanoramaFile(config.filename, config.project),
    transform: (data, config) => ({
      fileTitle: data.fileTitle,
      url: data.url,
      originalUrl: data.originalUrl,
      width: data.width,
      height: data.height,
      equirectangular: data.equirectangular,
      mime: data.mime,
      autoRotate: config.autoRotate,
    }),
  },
};
