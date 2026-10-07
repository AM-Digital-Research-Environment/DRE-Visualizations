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
 * The served file keeps its historical name, so every template, the
 * DashboardAssets helper and Module.php keep loading `js/dashboard-core.js`.
 */
export const CORE_SOURCES = [
  'js/core/base.js',
  'js/core/theme.js',
  'js/core/data.js',
  'js/core/libs.js',
  'js/core/charts.js',
  'js/core/maps.js',
  'js/core/toolbar.js',
  'js/core/embed.js',
  'js/core/graph-walk.js',
  'js/core/reveal.js',
  'js/core/startup.js',
];
export const CORE_BUNDLE = 'js/dashboard-core.js';

/** The chart-builder bundle; its source order is DashboardAssets::CHART_SCRIPTS. */
export const CHART_BUNDLE = 'js/dashboard-charts.bundle.js';

/** Every generated JavaScript file. Scanners read the sources instead. */
export const GENERATED_JS = [CORE_BUNDLE, CHART_BUNDLE];

/** Whether an asset/-relative path (forward slashes) is a generated file. */
export function isGeneratedJs(assetPath) {
  return GENERATED_JS.includes(assetPath) || assetPath.endsWith('.bundle.js');
}
