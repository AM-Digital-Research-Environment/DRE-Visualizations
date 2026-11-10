#!/usr/bin/env node
/**
 * Source-level accessibility policies that no rendered test can see: the one
 * spinner partial, the stylesheet's touch-target and status rules, and how map
 * popups are built. Everything a rendered page or a unit test can check lives
 * there instead: the async-surface markup in tests/AsyncSurfaceTest.php (the
 * real partial, rendered), the async state machine in tests/js/async.test.mjs,
 * and the chart headings and toolbars in the browser suite
 * (tests/browser/lifecycle.spec.mjs, "every block boots").
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const failures = [];

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function requireFragment(source, fragment, message) {
  if (!source.includes(fragment)) failures.push(message);
}

const css = read('asset/css/dre-visualizations.css');

// Every block that shows a spinner must get it — and its live region and
// <noscript> — from the one partial, never from hand-written markup.
for (const file of readdirSync(join(ROOT, 'view'), { recursive: true })) {
  const path = String(file).replace(/\\/g, '/');
  if (!path.endsWith('.phtml') || path.endsWith('partials/async-surface.phtml')) continue;
  if (read('view/' + path).includes('rv-spinner')) {
    failures.push(`view/${path} renders its own spinner; use partials/async-surface`);
  }
}
requireFragment(
  css,
  '.rv-dashboard-status {',
  'the persistent dashboard status needs a visually hidden treatment',
);
requireFragment(
  css,
  '.resource-vis-block .maplibregl-ctrl button,',
  'touch maps must include MapLibre navigation controls in the module boundary',
);
requireFragment(
  css,
  '.rv-item-map-panel .maplibregl-popup-close-button {',
  'item-map popup close controls must be included in the touch-target contract',
);
requireFragment(
  css,
  'min-height: var(--size-control-lg, 2.75rem);',
  'MapLibre touch controls must use the shared 44px control token',
);
requireFragment(
  css,
  'padding-inline-end: calc(var(--size-control-lg, 2.75rem) + var(--rv-space-2));',
  'touch popups must reserve content space for the enlarged close control',
);

// Map popups: every one comes from ns.mapPopup (core/maps.js), which closes it
// on Escape, and a marker gets its popup only after addTo() (MapLibre's addTo
// drops the Enter / Space listener an earlier setPopup attached).
const mapsCore = read('asset/js/core/maps.js');
requireFragment(mapsCore, 'ns.mapPopup = function', 'core/maps.js must provide ns.mapPopup');
for (const file of readdirSync(join(ROOT, 'asset/js'), { recursive: true })) {
  const path = 'asset/js/' + String(file).replace(/\\/g, '/');
  if (!path.endsWith('.js') || path.endsWith('.bundle.js') || path.endsWith('dashboard-core.js') || path.endsWith('.min.js')) continue;
  const source = read(path);
  const own = source === mapsCore ? source.replace('new maplibregl.Popup(options)', '') : source;
  if (/new (window\.)?maplibregl\.Popup\(/.test(own)) {
    failures.push(`${path} constructs a MapLibre popup directly; use ns.mapPopup so Escape closes it`);
  }
  if (/\.setPopup\([^;]*?\)\s*\.addTo\(/s.test(source) || /\.setPopup\([\s\S]{0,300}?\);\s*\w+\.addTo\(/.test(source)) {
    failures.push(`${path} sets a marker popup before addTo(); the popup would not open from the keyboard`);
  }
}

if (failures.length) {
  console.error(`Accessibility contracts: ${failures.length} finding(s)`);
  for (const message of failures) console.error(`  ${message}`);
  process.exit(1);
}

console.log(
  'Accessibility contracts: clean (one spinner partial, status and map touch-target styles, map popups).',
);
