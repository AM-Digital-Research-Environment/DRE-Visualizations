#!/usr/bin/env node
/**
 * Browser-HTML safety contracts for curator/imported metadata.
 *
 * This is intentionally dependency-free. It inventories high-risk DOM/MapLibre
 * sinks so new ones cannot arrive unnoticed, asserts the reviewed fixes remain
 * in place, and executes the treemap formatter with a malicious label fixture.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import vm from 'node:vm';

const ROOT = join(import.meta.dirname, '..');
const JS_DIR = join(ROOT, 'asset/js');
const failures = [];

function read(path) {
  return readFileSync(path, 'utf8');
}

function fail(message) {
  failures.push(message);
}

function collect(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) collect(path, files);
    else if (name.endsWith('.js') && !name.endsWith('.bundle.js')) files.push(path);
  }
  return files;
}

function occurrences(source, regex) {
  return [...source.matchAll(regex)].length;
}

const sources = collect(JS_DIR).map((path) => ({ path, source: read(path) }));
for (const file of sources) {
  if (/cartocdn\.com/i.test(file.source)) {
    fail(`${relative(ROOT, file.path).split(sep).join('/')} contains a hard-coded third-party basemap endpoint`);
  }
}
const inventory = {
  setHTML: sources.reduce((sum, file) => sum + occurrences(file.source, /\.setHTML\s*\(/g), 0),
  innerHTML: sources.reduce((sum, file) => sum + occurrences(file.source, /\.innerHTML\s*=/g), 0),
  tooltipFormatters: sources.reduce((sum, file) => sum
    + occurrences(file.source, /tooltip\s*:\s*\{[\s\S]{0,600}?formatter\s*:\s*function/g), 0),
};

// A reduction is always welcome; an increase requires deliberate review and a
// baseline update. These ceilings make HTML-producing code visible in PR CI.
const reviewedMaximums = { setHTML: 12, innerHTML: 80, tooltipFormatters: 15 };
for (const [kind, count] of Object.entries(inventory)) {
  if (count > reviewedMaximums[kind]) {
    fail(`${kind} sink count increased from reviewed maximum ${reviewedMaximums[kind]} to ${count}`);
  }
}

const requiredFixes = [
  ['asset/js/dashboard-charts-map.js', "esc(p.from || '')"],
  ['asset/js/dashboard-charts-map.js', "esc(p.to || '')"],
  ['asset/js/dashboard-charts-map.js', "esc(p.name || '')"],
  ['asset/js/dashboard-charts-map.js', 'Number.isFinite(Number(data.lat))'],
  ['asset/js/dashboard-charts-map.js', "esc(data.name || '')"],
  // The item location map moved out of knowledge-graph.js into its own module
  // when the graph switched to the d3-force canvas renderer; the guard follows it.
  ['asset/js/item-location-map.js', "ns.escapeHtml(loc.name || '')"],
  ['asset/js/item-location-map.js', 'ns.escapeHtml(siteBase)'],
  ['asset/js/dashboard-charts-treemap.js', 'echarts.format.encodeHTML(n.name'],
];
for (const [file, fragment] of requiredFixes) {
  if (!read(join(ROOT, file)).includes(fragment)) {
    fail(`${file} lost reviewed HTML-safety guard: ${fragment}`);
  }
}

// The former standalone geo-flow builder duplicated the map overlay and three
// unsafe popups. The registry contract covers the inverse (loaded-but-unused);
// this check prevents the dead file from quietly returning.
if (sources.some((file) => relative(ROOT, file.path).split(sep).join('/')
  === 'asset/js/dashboard-charts-geo-flows.js')) {
  fail('unused dashboard-charts-geo-flows.js must not be shipped');
}

// Execute the highest-risk custom formatter against a stored-XSS fixture.
let option;
const encodeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const context = {
  echarts: { format: { encodeHTML } },
  window: {
    RV: {
      THEME: { fontSize: 12, border: '#000' },
      charts: {},
      initChart: () => ({ setOption: (value) => { option = value; } }),
      truncateLabel: (value) => value,
    },
  },
};
vm.createContext(context);
vm.runInContext(read(join(JS_DIR, 'dashboard-charts-treemap.js')), context, {
  filename: 'asset/js/dashboard-charts-treemap.js',
});
context.window.RV.charts.buildTreemap({}, [{ name: 'fixture', value: 1 }]);
const malicious = '<img src=x onerror="globalThis.__xss=1">';
const rendered = option.tooltip.formatter({
  treePathInfo: [{ name: malicious }],
  value: 1,
});
if (rendered.includes('<img') || !rendered.includes('&lt;img')) {
  fail('treemap tooltip did not encode the malicious-label fixture');
}

if (failures.length) {
  console.error(`HTML safety contracts: ${failures.length} finding(s)`);
  for (const message of failures) console.error('  ' + message);
  process.exit(1);
}

console.log(`HTML safety contracts: clean (${inventory.setHTML} setHTML, ${inventory.innerHTML} innerHTML, ${inventory.tooltipFormatters} tooltip formatters reviewed).`);
