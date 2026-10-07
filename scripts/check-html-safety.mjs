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
import { isGeneratedJs } from './lib/frontend-sources.mjs';

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
    // Sources only: a generated bundle (dashboard-core.js, the chart bundle)
    // repeats them and would count every sink twice.
    else if (name.endsWith('.js') && !isGeneratedJs(relative(join(ROOT, 'asset'), path).split(sep).join('/'))) {
      files.push(path);
    }
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
const count = (regex) => sources.reduce((sum, file) => sum + occurrences(file.source, regex), 0);
const inventory = {
  setHTML: count(/\.setHTML\s*\(/g),
  innerHTML: count(/\.(?:inner|outer)HTML\s*\+?=/g),
  insertAdjacentHTML: count(/\.insertAdjacentHTML\s*\(/g),
  // Any HTML-returning formatter: `formatter: function`, `formatter: fn || function`,
  // and a named formatter reference. String templates ('{b}: {c}') are encoded
  // by ECharts itself and are not counted.
  tooltipFormatters: count(/tooltip\s*:\s*\{[\s\S]{0,600}?formatter\s*:\s*(?:[\w.]+\s*\|\|\s*)?(?:function|[\w.]+\s*[,}\n])/g),
};

// An exact ratchet: a new sink fails until it is reviewed and the baseline is
// raised, and a removed one fails until the baseline is lowered — so the
// numbers never drift into headroom that would hide the next sink.
const reviewedCounts = { setHTML: 11, innerHTML: 62, insertAdjacentHTML: 0, tooltipFormatters: 14 };
for (const [kind, value] of Object.entries(inventory)) {
  if (value !== reviewedCounts[kind]) {
    fail(`${kind} sink count is ${value}, reviewed baseline is ${reviewedCounts[kind]} — review the change and update reviewedCounts`);
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
  ['asset/js/item-location-map.js', 'ns.escapeHtml(ns.itemUrl(siteBase, loc.itemId))'],
  // dashboard-core.js is generated from asset/js/core/; the embed snippet lives in embed.js.
  ['asset/js/core/embed.js', "ns.escapeHtml(src) + '\" title=\"' + ns.escapeHtml(title || '')"],
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
