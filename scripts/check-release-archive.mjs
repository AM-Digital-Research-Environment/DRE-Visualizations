#!/usr/bin/env node
/**
 * Checks a built release archive (git archive --prefix=DreVisualizations/):
 *
 *   - every asset the module loads at runtime — each path config/asset-plans.json
 *     names, the source-mapped readable bundles and the generated config JSON —
 *     is in the archive. The export-ignore
 *     globs in .gitattributes strip modular sources (dashboard-charts-*.js …),
 *     so a runtime file that happens to match one would vanish silently;
 *   - no installation-derived generated data and no development material ships.
 *
 * Usage: node scripts/check-release-archive.mjs DreVisualizations.zip
 */
import { execFileSync } from 'node:child_process';
import { MINIFIED, minifiedPath, runtimeAssets as planAssets } from './lib/frontend-sources.mjs';

const archive = process.argv[2];
if (!archive) {
  console.error('Usage: node scripts/check-release-archive.mjs <archive.zip>');
  process.exit(2);
}
const entries = new Set(execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' })
  .split('\n').map((line) => line.trim()).filter(Boolean));
const prefix = 'DreVisualizations/';
const failures = [];

// Every file a plan can load (config/asset-plans.json). The chart sources are
// the bundle's inputs, deliberately not shipped.
const runtimeAssets = new Set(planAssets().map((path) => 'asset/' + path));
// The served minified files, their source maps and the readable files the maps
// point back to, so devtools on the live site show readable code.
const debugAssets = MINIFIED.flatMap((path) => [path, minifiedPath(path) + '.map']).map((path) => 'asset/' + path);
for (const required of [...runtimeAssets, ...debugAssets,
  'config/asset-plans.json', 'config/dashboard-layouts.json', 'config/client-strings.json', 'config/module.ini', 'Module.php',
  // The translation catalogue Omeka's translator is pointed at (module.config.php).
  'language/template.pot']) {
  if (!entries.has(prefix + required)) failures.push(`missing runtime file: ${required}`);
}

const forbidden = [
  /^DreVisualizations\/asset\/data\/((item-dashboards|communities|knowledge-graphs|photo-galleries|featured-collections|item-set-dashboards|generations)\/|network-explorer\.json$|current\.json$)/,
  /^DreVisualizations\/(tests|scripts|tools|node_modules|\.github)\//,
  /^DreVisualizations\/(package(-lock)?\.json|phpstan[^/]*\.neon(\.dist)?)$/,
];
for (const entry of entries) {
  if (forbidden.some((pattern) => pattern.test(entry))) failures.push(`must not ship: ${entry.slice(prefix.length)}`);
}

if (failures.length) {
  console.error(`Release archive: ${failures.length} finding(s)`);
  for (const failure of failures) console.error('  ' + failure);
  process.exit(1);
}
console.log(`Release archive: ${entries.size} entries; all ${runtimeAssets.size} runtime assets present, no generated or development files.`);
