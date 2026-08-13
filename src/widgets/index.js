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
} from './dataSources';

const NAMESPACE_LABELS = {
  '0': 'articles only',
  '0|1': 'articles + talk',
  '6': 'files',
  '10': 'templates',
  '14': 'categories',
};

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
      topN: 0, // 0 = all 100
      filterNoise: true,
      refreshSeconds: 3600,
    },
    renderer: 'RankingCard',
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
      { key: 'topN', label: 'Top N (0 = all)', type: 'number', placeholder: '0' },
      { key: 'filterNoise', label: 'Filter TLD/spam noise (.xxx, XXX…)', type: 'boolean' },
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
      const topN = config.topN ? Math.min(config.topN, 100) : 100;
      const rows = articles.slice(0, topN);
      return {
        title: `${data.fullLang || 'en'} Wikipedia`,
        subtitle: `${data.dateLabel} · top ${rows.length}${filtered ? ` (${filtered} filtered)` : ''}${data.source === 'wmf' ? ' · via WMF Pageviews API' : ''}${data.totalTrafficShort ? ` · ${data.totalTrafficShort} views total` : ''}`,
        columns: ['#', 'Article', 'Views'],
        rows: rows.map((a) => [String(a.rank), a.title, a.views_short]),
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
};
