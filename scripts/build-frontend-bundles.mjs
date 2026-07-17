#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

if (process.argv.includes('--check')) {
  let actual = '';
  try { actual = readFileSync(outputPath, 'utf8'); } catch { /* reported below */ }
  if (actual !== expected) {
    console.error('Front-end bundle is stale; run npm run build.');
    process.exit(1);
  }
  console.log(`Front-end bundle: clean (${paths.length} modular sources).`);
} else {
  writeFileSync(outputPath, expected, 'utf8');
  console.log(`Built asset/js/dashboard-charts.bundle.js from ${paths.length} sources.`);
}
