#!/usr/bin/env node
/**
 * Dependency-free contracts for dashboard headings, toolbars, and async state.
 *
 * These assertions intentionally pin the source-level integration boundary.
 * Browser smoke tests can prove that a deployed dashboard mounts; this check
 * prevents the module from silently rebuilding inaccessible markup first.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
const core = read('asset/js/dashboard-core.js');
const template = read('view/common/block-layout/partials/dashboard-async.phtml');
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
  'class="rv-dashboard-status"',
  'role="status"',
  'aria-live="polite"',
  'aria-atomic="true"',
  'class="rv-dashboard-content"',
  'data-ready-status=',
  'data-empty-status=',
  'data-error-status=',
]) {
  requireFragment(template, fragment, `async dashboard template is missing ${fragment}`);
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
