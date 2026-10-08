#!/usr/bin/env node
/**
 * Dependency-free contracts for dashboard headings, toolbars, and async state.
 *
 * These assertions intentionally pin the source-level integration boundary.
 * Browser smoke tests can prove that a deployed dashboard mounts; this check
 * prevents the module from silently rebuilding inaccessible markup first.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORE_SOURCES } from './lib/frontend-sources.mjs';

const ROOT = join(import.meta.dirname, '..');
const failures = [];

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function requireFragment(source, fragment, message) {
  if (!source.includes(fragment)) failures.push(message);
}

function rejectFragment(source, fragment, message) {
  if (source.includes(fragment)) failures.push(message);
}

const dashboard = read('asset/js/dashboard.js');
// The core's sources (the served dashboard-core.js is generated from them): the
// chart toolbar lives in toolbar.js, the per-chart embed button in embed.js.
const core = CORE_SOURCES.map((path) => read('asset/' + path)).join('\n');
const template = read('view/common/block-layout/partials/async-surface.phtml');
const dashboardTemplate = read('view/common/block-layout/partials/dashboard-async.phtml');
const asyncCore = read('asset/js/core/async.js');
const css = read('asset/css/dre-visualizations.css');

requireFragment(
  dashboard,
  '<div class="rv-chart-heading"><h3>',
  'dashboard chart titles must use the heading wrapper',
);
requireFragment(
  core,
  "bar.setAttribute('role', 'toolbar')",
  'chart action groups must expose the toolbar role',
);
requireFragment(
  core,
  "bar.setAttribute('aria-label'",
  'chart toolbars must have a stable accessible name',
);
requireFragment(
  core,
  "heading.appendChild(bar)",
  'chart toolbars must be siblings of the chart heading',
);
rejectFragment(
  core,
  'h3.appendChild(bar)',
  'chart controls must never be appended inside an h3',
);
rejectFragment(
  core,
  'title.appendChild(bar)',
  'chart controls must never be appended inside a heading element',
);
requireFragment(
  core,
  'aria-label="\' + ns.escapeHtml(saveTitle)',
  'icon-only chart controls must carry explicit accessible names',
);

for (const fragment of [
  'class="rv-dashboard-status rv-async-status"',
  'role="status"',
  'aria-live="polite"',
  'aria-atomic="true"',
  'class="rv-dashboard-content"',
  'class="rv-loading rv-async-loading" aria-hidden="true"',
  '<noscript>',
  "translate('This visualization needs JavaScript.')",
  "translate('Loading…')",
]) {
  requireFragment(template, fragment, `async surface partial is missing ${fragment}`);
}
rejectFragment(template, 'aria-busy="', 'aria-busy is set by the script while work is active, never server-side');
for (const fragment of ['ready-status', 'empty-status', 'error-status', 'partials/async-surface']) {
  requireFragment(dashboardTemplate, fragment, `async dashboard template is missing ${fragment}`);
}

// Every block that shows a spinner must get it — and its live region and
// <noscript> — from the one partial, never from hand-written markup.
for (const file of readdirSync(join(ROOT, 'view'), { recursive: true })) {
  const path = String(file).replace(/\\/g, '/');
  if (!path.endsWith('.phtml') || path.endsWith('partials/async-surface.phtml')) continue;
  if (read('view/' + path).includes('rv-spinner')) {
    failures.push(`view/${path} renders its own spinner; use partials/async-surface`);
  }
}
for (const fragment of [
  "container.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false')",
  "ns.t('retry', 'Try again')",
]) {
  requireFragment(asyncCore, fragment, `core/async.js is missing ${fragment}`);
}
requireFragment(
  dashboard,
  "container.setAttribute('aria-busy', 'true')",
  'async dashboards must expose their busy state while loading',
);
requireFragment(
  dashboard,
  "container.setAttribute('aria-busy', 'false')",
  'async dashboards must clear their busy state when loading finishes',
);
requireFragment(
  dashboard,
  'status.textContent = message',
  'async dashboard completion must update the persistent live region',
);
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

if (failures.length) {
  console.error(`Accessibility contracts: ${failures.length} finding(s)`);
  for (const message of failures) console.error(`  ${message}`);
  process.exit(1);
}

console.log(
  'Accessibility contracts: clean (headings, toolbars, async status, and map touch targets).',
);
