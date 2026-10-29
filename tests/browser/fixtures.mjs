/**
 * Fixture pages for the browser suite: each block as the module's PHP renders
 * it — the async-surface markup (persistent status node, aria-hidden spinner)
 * around the container its controller hydrates — on a bare page WITHOUT
 * DRE-theme, so every colour comes from the module's own fallbacks, light or
 * dark. The data endpoints are stubbed per test with page.route() (see
 * lifecycle.spec.mjs); this file only builds HTML.
 *
 * Each page loads exactly what its asset plan in config/asset-plans.json loads
 * (the `after` chain first, files de-duplicated as Laminas does, the published
 * library URLs merged first-wins as core/base.js merges them), so a plan that
 * lists a script out of order fails here, not on the live site.
 */
import { assetPlans, planScripts } from '../../scripts/lib/frontend-sources.mjs';

const MANIFEST = assetPlans();

/** A plan and the plans it runs after, in emission order (DashboardAssets::emit). */
function planChain(name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const plan = MANIFEST.plans[name];
  if (!plan) throw new Error(`Unknown asset plan: ${name}`);
  return [...(plan.after ? planChain(plan.after, seen) : []), name];
}

/** What the head carries for a plan: scripts, library URLs and whether the stylesheet. */
function assetsFor(planName) {
  const chain = planChain(planName);
  const scripts = [...new Set(chain.flatMap((name) => planScripts(MANIFEST, name)))];
  const libs = {};
  for (const name of chain) {
    for (const key of MANIFEST.plans[name].publish || []) {
      if (key in libs) continue;
      const value = MANIFEST.libs[key];
      libs[key] = Array.isArray(value) ? value.map((path) => `/asset/${path}`) : `/asset/${value}`;
    }
  }
  return { scripts, libs, stylesheet: chain.some((name) => MANIFEST.plans[name].stylesheet) };
}

/**
 * JSON that cannot close its <script> element: `<`, `>` and `&` as \u escapes,
 * as DashboardAssets' JSON_HEX_TAG / JSON_HEX_AMP flags write them.
 */
const inertJson = (value) => JSON.stringify(value).replace(/[<>&]/g,
  (c) => String.fromCharCode(92) + 'u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

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

/** partials/dashboard-async.phtml for one artifact. */
function dashboardBlock(itemId, extra = {}) {
  return `<div class="resource-vis-block dashboard-block">${surface('dashboard-async-container', {
    'item-id': itemId,
    ...extra,
    'ready-status': 'Visualisations ready.',
    'empty-status': 'No visualisations are available.',
    'error-status': 'The visualisation could not be loaded.',
  }, { statusInside: true })}</div>`;
}

/**
 * name → { plan, body, data }. `data` says which generated data the suite
 * serves: 'synthetic' (small hand-made answers in lifecycle.spec.mjs) or
 * 'golden' (tests/golden/, the precompute's output on the synthetic corpus).
 */
const PAGES = {
  compare: {
    plan: 'compare',
    data: 'synthetic',
    body: `<div class="resource-vis-block compare-block">${surface('compare-container')}</div><div id="ownership"></div>`,
  },
  dashboard: {
    plan: 'dashboard',
    data: 'synthetic',
    body: dashboardBlock('test'),
  },
  semantic: {
    plan: 'semanticMap',
    data: 'synthetic',
    body: `<div class="resource-vis-block semantic-map-block">${surface('semantic-map-container', { 'embed-slug': 'semantic-map' })}</div>`,
  },
  'collection-overview': {
    plan: 'dashboard',
    data: 'golden',
    body: dashboardBlock('collection-overview', { layout: 'collectionOverview', 'embed-slug': 'collection-overview' }),
  },
  publications: {
    plan: 'dashboard',
    data: 'golden',
    body: dashboardBlock('publications', { 'embed-slug': 'publications' }),
  },
  'network-explorer': {
    plan: 'network',
    data: 'golden',
    body: `<div class="resource-vis-block network-explorer-block">${surface('network-explorer-container', { 'embed-slug': 'network-explorer' })}</div>`,
  },
  'whats-new': {
    plan: 'whatsNew',
    data: 'golden',
    body: `<div class="resource-vis-block whats-new-block">${surface('whats-new-container', { 'embed-slug': 'whats-new' })}</div>`,
  },
  'project-explorer': {
    plan: 'explorer',
    data: 'golden',
    body: `<div class="resource-vis-block explorer-block">${surface('dashboard-explorer-container', { 'embed-slug': 'project-explorer' })}</div>`,
  },
  'discursive-communities': {
    plan: 'entityGraph',
    data: 'golden',
    body: `<div class="resource-vis-block communities-block">${surface('dre-entity-graph', { 'embed-slug': 'discursive-communities', fullscreen: 'own' })}</div>`,
  },
  'spatial-exploration': {
    plan: 'spatial',
    data: 'golden',
    body: `<div class="resource-vis-block spatial-exploration-block">${surface('dre-spatial-exploration', { 'embed-slug': 'spatial-exploration' })}</div>`,
  },
};

export const FIXTURES = Object.keys(PAGES);

/** Which generated data a fixture is served: 'synthetic' or 'golden'. */
export const FIXTURE_DATA = Object.fromEntries(Object.entries(PAGES).map(([name, page]) => [name, page.data]));

/**
 * One fixture page. `theme` writes data-theme on <html> and <body>, as
 * DRE-theme does; `i18n` seeds the translated strings (window.RV_I18N).
 */
export function fixturePage(name, { theme = 'light', i18n = {} } = {}) {
  const page = PAGES[name];
  if (!page) return null;
  const { scripts, libs, stylesheet } = assetsFor(page.plan);
  const tags = scripts.map((path) => `<script defer src="/asset/${path}"></script>`).join('');
  const css = stylesheet ? `<link rel="stylesheet" href="/asset/${MANIFEST.stylesheet}">` : '';
  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DRE Visualizations fixture: ${name}</title>
${css}
<style>
  body { margin: 0; padding: 1rem; background: var(--rv-bg); color: var(--rv-text-strong);
         font-family: system-ui, sans-serif; }
  main { max-width: 76rem; margin: 0 auto; }
</style>
<script type="application/json" id="rv-config-1">${inertJson({ dataBase: '/s/test/dre-data/', i18n })}</script>
<script type="application/json" id="rv-config-2">${inertJson({ libs })}</script>
${tags}
</head>
<body data-theme="${theme}"><main><h1>Fixture: ${name}</h1>${page.body}</main></body>
</html>`;
}
