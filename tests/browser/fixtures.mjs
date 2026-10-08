/**
 * Fixture pages for the browser suite: each block as the module's PHP renders
 * it — the async-surface markup (persistent status node, aria-hidden spinner)
 * around the container its controller hydrates — on a bare page WITHOUT
 * DRE-theme, so every colour comes from the module's own fallbacks, light or
 * dark. The data endpoints are stubbed per test with page.route() (see
 * lifecycle.spec.mjs); this file only builds HTML.
 */

const LIBS = `window.RV_DATA_BASE='/s/test/dre-data/';window.RV_LIBS={
echarts:'/asset/vendor/echarts.min.js',maplibre:'/asset/vendor/maplibre-gl.js',
maplibreWorker:'/asset/vendor/maplibre-gl-worker.js',maplibreCss:'/asset/vendor/maplibre-gl.css',
d3:['dispatch','quadtree','timer','force'].map(function(n){return '/asset/vendor/d3-'+n+'.min.js';})};`;

/** The partial's status node + container + spinner (async-surface.phtml). */
function surface(className, data = {}, { statusInside = false } = {}) {
  const attrs = Object.entries({ 'base-path': '', 'site-base': '/s/test', ...data })
    .map(([name, value]) => ` data-${name}="${value}"`).join('');
  const status = '<p class="rv-dashboard-status rv-async-status" role="status" aria-live="polite" aria-atomic="true">Loading…</p>';
  const spinner = '<div class="rv-loading rv-async-loading" aria-hidden="true"><div class="rv-spinner"></div><span>Loading…</span></div>';
  return statusInside
    ? `<div class="${className}"${attrs}>${status}<div class="rv-dashboard-content">${spinner}</div></div>`
    : `${status}<div class="${className}"${attrs}>${spinner}</div>`;
}

const PAGES = {
  compare: {
    scripts: ['vendor/echarts.min.js', 'js/dashboard-core.js', 'js/graph-canvas.js', 'js/graph-force.js',
      'js/dashboard-charts.bundle.js', 'js/dashboard-compare-unify.js', 'js/dashboard-compare.js'],
    body: `<div class="resource-vis-block compare-block">${surface('compare-container')}</div><div id="ownership"></div>`,
  },
  dashboard: {
    scripts: ['js/dashboard-core.js', 'js/dashboard-charts.bundle.js', 'js/dashboard.js'],
    body: `<div class="resource-vis-block dashboard-block">${surface('dashboard-async-container', {
      'item-id': 'test',
      'ready-status': 'Visualisations ready.',
      'empty-status': 'No visualisations are available.',
      'error-status': 'The visualization could not be loaded.',
    }, { statusInside: true })}</div>`,
  },
  semantic: {
    scripts: ['js/dashboard-core.js', 'js/semantic-map.js'],
    body: `<div class="resource-vis-block semantic-map-block">${surface('semantic-map-container', { 'embed-slug': 'semantic-map' })}</div>`,
  },
};

export const FIXTURES = Object.keys(PAGES);

/**
 * One fixture page. `theme` writes data-theme on <html> and <body>, as
 * DRE-theme does; `i18n` seeds window.RV_I18N.
 */
export function fixturePage(name, { theme = 'light', i18n = {} } = {}) {
  const page = PAGES[name];
  if (!page) return null;
  const scripts = page.scripts.map((path) => `<script defer src="/asset/${path}"></script>`).join('');
  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DRE Visualizations fixture: ${name}</title>
<link rel="stylesheet" href="/asset/css/dre-visualizations.css">
<style>
  body { margin: 0; padding: 1rem; background: var(--rv-bg); color: var(--rv-text-strong);
         font-family: system-ui, sans-serif; }
  main { max-width: 76rem; margin: 0 auto; }
</style>
<script>${LIBS}window.RV_I18N=${JSON.stringify(i18n)};</script>
${scripts}
</head>
<body data-theme="${theme}"><main><h1>Fixture: ${name}</h1>${page.body}</main></body>
</html>`;
}
