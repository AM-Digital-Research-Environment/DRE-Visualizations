#!/usr/bin/env node
/**
 * Generates two committed files from the modular front-end sources:
 *   - asset/js/dashboard-charts.bundle.js — CHART_SCRIPTS concatenated in order;
 *   - config/dashboard-layouts.json — each layout's chart keys, read by PHP
 *     (EmbedController answers 404 for a chart a layout does not render).
 * `--check` fails when either is stale.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(import.meta.dirname, '..');
const helperPath = join(ROOT, 'src', 'View', 'Helper', 'DashboardAssets.php');
const outputPath = join(ROOT, 'asset', 'js', 'dashboard-charts.bundle.js');
const source = readFileSync(helperPath, 'utf8');
const marker = 'const CHART_SCRIPTS = [';
const start = source.indexOf(marker);
if (start === -1) throw new Error('DashboardAssets::CHART_SCRIPTS was not found');
const from = source.indexOf('[', start);
let depth = 0;
let end = -1;
for (let i = from; i < source.length; i++) {
  if (source[i] === '[') depth++;
  if (source[i] === ']' && --depth === 0) { end = i; break; }
}
if (end < 0) throw new Error('DashboardAssets::CHART_SCRIPTS could not be parsed');
const paths = [...source.slice(from, end + 1).matchAll(/'([^']+\.js)'/g)].map((match) => match[1]);
if (!paths.length) throw new Error('No chart sources were found');

const banner = [
  '/**',
  ' * Generated chart-builder bundle. Do not edit directly.',
  ' * Source order: DashboardAssets::CHART_SCRIPTS.',
  ' * Rebuild: npm run build',
  ' */',
  '',
].join('\n');
const expected = banner + paths.map((path) => {
  const contents = readFileSync(join(ROOT, 'asset', path), 'utf8').trimEnd();
  return `/* ---- ${path} ---- */\n${contents}\n;`;
}).join('\n\n') + '\n';

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

if (process.argv.includes('--check')) {
  let actual = '';
  let actualLayouts = '';
  try { actual = readFileSync(outputPath, 'utf8'); } catch { /* reported below */ }
  try { actualLayouts = readFileSync(layoutsPath, 'utf8'); } catch { /* reported below */ }
  if (actual !== expected || actualLayouts !== expectedLayouts) {
    console.error('Front-end bundle or config/dashboard-layouts.json is stale; run npm run build.');
    process.exit(1);
  }
  console.log(`Front-end bundle: clean (${paths.length} modular sources, ${Object.keys(layouts).length} layouts).`);
} else {
  writeFileSync(outputPath, expected, 'utf8');
  writeFileSync(layoutsPath, expectedLayouts, 'utf8');
  console.log(`Built asset/js/dashboard-charts.bundle.js from ${paths.length} sources and config/dashboard-layouts.json.`);
}
