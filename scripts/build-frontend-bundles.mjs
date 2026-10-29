#!/usr/bin/env node
/**
 * Generates committed files from the modular front-end sources:
 *   - asset/js/dashboard-core.js — CORE_SOURCES (scripts/lib/frontend-sources.mjs)
 *     concatenated in order;
 *   - asset/js/dashboard-charts.bundle.js — `chartSources` (config/asset-plans.json)
 *     concatenated in order;
 *   - a minified `.min.js` / `.min.css` copy of both bundles and of
 *     asset/css/dre-visualizations.css, each with a `.map` — what Omeka serves;
 *   - config/dashboard-layouts.json — each layout's chart keys, read by PHP
 *     (EmbedController answers 404 for a chart a layout does not render);
 *   - config/client-strings.json — every interface string the browser code
 *     can show (see scripts/lib/client-strings.mjs), translated by PHP.
 * `--check` fails when any is stale.
 *
 * Both bundles are plain concatenations of self-contained IIFEs, served as one
 * classic <script> each: native ES modules would drop Omeka's `?v=` cache-buster
 * from every relative import. The readable bundles stay committed and ship:
 * the contract checks and unit tests load them, and the source maps point at
 * them, so devtools show readable code on the live site too.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { collectClientStrings } from './lib/client-strings.mjs';
import { CHART_BUNDLE, CORE_BUNDLE, CORE_SOURCES, STYLESHEET, assetPlans, minifiedPath } from './lib/frontend-sources.mjs';

const ROOT = join(import.meta.dirname, '..');
const paths = assetPlans().chartSources;
if (!paths.length) throw new Error('No chart sources were found');

/** Banner + each source under a path marker, as one classic script. */
function bundle(title, order, sources) {
  const banner = [
    '/**',
    ` * Generated ${title}. Do not edit directly.`,
    ` * Source order: ${order}.`,
    ' * Rebuild: npm run build',
    ' */',
    '',
  ].join('\n');
  return banner + sources.map((path) => {
    const contents = readFileSync(join(ROOT, 'asset', path), 'utf8').replace(/\r\n/g, '\n').trimEnd();
    return `/* ---- ${path} ---- */\n${contents}\n;`;
  }).join('\n\n') + '\n';
}

const coreOutputPath = join(ROOT, 'asset', CORE_BUNDLE);
const expectedCore = bundle('dashboard core', 'scripts/lib/frontend-sources.mjs CORE_SOURCES (asset/js/core/)', CORE_SOURCES);
const chartOutputPath = join(ROOT, 'asset', CHART_BUNDLE);
const expectedCharts = bundle('chart-builder bundle', 'config/asset-plans.json chartSources', paths);

const layoutsPath = join(ROOT, 'config', 'dashboard-layouts.json');
const sandbox = { window: { RV: {} } };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(ROOT, 'asset', 'js', 'dashboard-layouts.js'), 'utf8'), sandbox);
const layouts = Object.fromEntries(Object.entries(sandbox.window.RV.LAYOUTS || {})
  .map(([name, layout]) => [name, [...layout.order]]));
if (!Object.keys(layouts).length) throw new Error('dashboard-layouts.js defined no layouts');
const expectedLayouts = JSON.stringify({
  $comment: 'Generated from asset/js/dashboard-layouts.js by npm run build. Do not edit.',
  layouts,
}, null, 2) + '\n';

const stringsPath = join(ROOT, 'config', 'client-strings.json');
const { strings, conflicts } = collectClientStrings(ROOT);
// One key, one English source text: two fallbacks for the same key would
// make the translated string depend on which file happened to load first.
if (conflicts.length) {
  console.error('Interface strings: one key has different English texts:');
  for (const conflict of conflicts) console.error('  ' + conflict);
  process.exit(1);
}
const expectedStrings = JSON.stringify({
  $comment: 'Generated from asset/js by npm run build (scripts/lib/client-strings.mjs). Do not edit.',
  strings,
}, null, 2) + '\n';

/**
 * The served copy of an asset/-relative readable file and its source map, as
 * [path, contents] pairs. The map names the readable file beside it and carries
 * no copy of it. ES2022 is the level the sources are linted at; without a
 * target esbuild may rewrite them into newer syntax than they were written in.
 */
function minified(readable, contents, loader) {
  const served = minifiedPath(readable);
  const { code, map } = transformSync(contents, {
    loader,
    minify: true,
    target: 'es2022',
    sourcemap: 'external',
    sourcefile: basename(readable),
    sourcesContent: false,
  });
  const link = `sourceMappingURL=${basename(served)}.map`;
  return [
    [join(ROOT, 'asset', served), `${code.trimEnd()}\n${loader === 'css' ? `/*# ${link} */` : `//# ${link}`}\n`],
    [join(ROOT, 'asset', served + '.map'), map.trimEnd() + '\n'],
  ];
}

const stylesheet = readFileSync(join(ROOT, 'asset', STYLESHEET), 'utf8').replace(/\r\n/g, '\n');

const outputs = [
  [coreOutputPath, expectedCore],
  [chartOutputPath, expectedCharts],
  ...minified(CORE_BUNDLE, expectedCore, 'js'),
  ...minified(CHART_BUNDLE, expectedCharts, 'js'),
  ...minified(STYLESHEET, stylesheet, 'css'),
  [layoutsPath, expectedLayouts],
  [stringsPath, expectedStrings],
];
if (process.argv.includes('--check')) {
  const stale = outputs.filter(([path, contents]) => {
    try { return readFileSync(path, 'utf8').replace(/\r\n/g, '\n') !== contents; } catch { return true; }
  });
  if (stale.length) {
    console.error(`Generated front-end files are stale (${stale.map(([path]) => path.slice(ROOT.length + 1)).join(', ')}); run npm run build.`);
    process.exit(1);
  }
  console.log(`Front-end bundles: clean (${CORE_SOURCES.length} core sources, ${paths.length} chart sources, ${Object.keys(layouts).length} layouts, ${Object.keys(strings).length} interface strings).`);
} else {
  for (const [path, contents] of outputs) writeFileSync(path, contents, 'utf8');
  console.log(`Built the core (${CORE_SOURCES.length} sources) and chart (${paths.length} sources) bundles, dashboard layouts and ${Object.keys(strings).length} interface strings.`);
}
