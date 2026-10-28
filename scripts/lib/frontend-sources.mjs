/**
 * The generated front-end files and the sources they are built from, shared by
 * the build (scripts/build-frontend-bundles.mjs), the contract checks and the
 * unit tests, so every one of them agrees on which file is the source of truth.
 *
 * Paths are relative to asset/.
 */

/**
 * dashboard-core.js is concatenated from these focused sources, IN THIS ORDER.
 * The order is load-bearing only at the end: reveal.js and startup.js act as
 * soon as they run (startup.js resolves the theme and mounts the block embed
 * buttons), so everything they call must already be defined above them.
 *
 * The readable bundle keeps its historical name; what the DashboardAssets
 * helper and the templates load is its minified copy (see MINIFIED below).
 */
export const CORE_SOURCES = [
  'js/core/base.js',
  'js/core/icons.js',
  'js/core/theme.js',
  'js/core/data.js',
  'js/core/libs.js',
  'js/core/async.js',
  'js/core/charts.js',
  'js/core/maps.js',
  'js/core/toolbar.js',
  'js/core/embed.js',
  'js/core/fullscreen.js',
  'js/core/graph-walk.js',
  'js/core/reveal.js',
  'js/core/startup.js',
];
export const CORE_BUNDLE = 'js/dashboard-core.js';

/** The chart-builder bundle; its source order is DashboardAssets::CHART_SCRIPTS. */
export const CHART_BUNDLE = 'js/dashboard-charts.bundle.js';

/** The hand-written stylesheet. */
export const STYLESHEET = 'css/dre-visualizations.css';

/** The served copy of a readable file: `x.js` → `x.min.js`, `x.css` → `x.min.css`. */
export function minifiedPath(path) {
  return path.replace(/\.(js|css)$/, '.min.$1');
}

/**
 * What Omeka serves: the two bundles and the stylesheet, minified by the build
 * with a source map beside each that points back at the readable file.
 */
export const MINIFIED = [CORE_BUNDLE, CHART_BUNDLE, STYLESHEET];

/** Every generated JavaScript file. Scanners read the sources instead. */
export const GENERATED_JS = [CORE_BUNDLE, CHART_BUNDLE, minifiedPath(CORE_BUNDLE), minifiedPath(CHART_BUNDLE)];

/** Whether an asset/-relative path (forward slashes) is a generated file. */
export function isGeneratedJs(assetPath) {
  return GENERATED_JS.includes(assetPath) || assetPath.endsWith('.bundle.js');
}
