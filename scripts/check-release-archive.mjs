#!/usr/bin/env node
/**
 * Checks a built release archive (git archive --prefix=DreVisualizations/):
 *
 *   - every asset the module loads at runtime — each 'js/…', 'css/…' and
 *     'vendor/…' path DashboardAssets names, plus the generated chart bundle
 *     and the generated config JSON — is in the archive. The export-ignore
 *     globs in .gitattributes strip modular sources (dashboard-charts-*.js …),
 *     so a runtime file that happens to match one would vanish silently;
 *   - no installation-derived generated data and no development material ships.
 *
 * Usage: node scripts/check-release-archive.mjs DreVisualizations.zip
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const archive = process.argv[2];
if (!archive) {
  console.error('Usage: node scripts/check-release-archive.mjs <archive.zip>');
  process.exit(2);
}
const entries = new Set(execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' })
  .split('\n').map((line) => line.trim()).filter(Boolean));
const prefix = 'DreVisualizations/';
const failures = [];

// CHART_SCRIPTS are the bundle's modular sources, deliberately not shipped.
const helper = readFileSync(join(ROOT, 'src/View/Helper/DashboardAssets.php'), 'utf8')
  .replace(/const CHART_SCRIPTS = \[[\s\S]*?\];/, '');
const runtimeAssets = new Set([...helper.matchAll(/'((?:js|css|vendor)\/[^']+\.(?:js|css))'/g)].map((m) => 'asset/' + m[1]));
for (const required of [...runtimeAssets, 'asset/js/dashboard-charts.bundle.js',
  'config/dashboard-layouts.json', 'config/client-strings.json', 'config/module.ini', 'Module.php',
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
