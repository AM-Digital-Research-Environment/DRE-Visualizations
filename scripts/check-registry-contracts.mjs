#!/usr/bin/env node
/**
 * Static contract checks for hand-maintained visualization registries.
 *
 * The asset plans (config/asset-plans.json), the chart layouts and the chart
 * registry need to move together. This script catches drift without requiring
 * Omeka or a browser. The block registry (slugs, templates, embeds, plans per
 * block) is checked by tests/BlockRegistryTest.php.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { assetPlans, runtimeAssets } from './lib/frontend-sources.mjs';

const ROOT = join(import.meta.dirname, '..');
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function loadRegistries() {
  const context = {
    window: { RV: { charts: new Proxy({}, { get: () => function noop() {} }) } },
  };
  context.global = context.window;
  vm.createContext(context);
  vm.runInContext(read(join(ROOT, 'asset/js/dashboard-layouts.js')), context, {
    filename: 'asset/js/dashboard-layouts.js',
  });
  vm.runInContext(read(join(ROOT, 'asset/js/dashboard-registry.js')), context, {
    filename: 'asset/js/dashboard-registry.js',
  });
  return context.window.RV;
}

function checkAssetPlans() {
  const manifest = assetPlans();
  for (const path of [...manifest.chartSources, ...runtimeAssets(manifest)]) {
    if (!existsSync(join(ROOT, 'asset', path))) fail(`config/asset-plans.json names a missing file: ${path}`);
  }

  // Every builder the chart sources register must be wired into CHART_MAP.
  const registrySource = read(join(ROOT, 'asset/js/dashboard-registry.js'));
  const registeredBuilders = new Set(
    [...registrySource.matchAll(/(?:ns\.charts|c)\.(build[A-Za-z0-9_]+)/g)].map((match) => match[1]),
  );
  for (const script of manifest.chartSources) {
    const path = join(ROOT, 'asset', script);
    if (!existsSync(path)) continue;
    const builders = [...read(path).matchAll(/ns\.charts\.(build[A-Za-z0-9_]+)\s*=/g)].map((match) => match[1]);
    for (const builder of builders) {
      if (!registeredBuilders.has(builder)) fail(`chartSources load unused chart builder ${builder} from ${script}`);
    }
  }

  // References inside the manifest resolve: groups, libraries, `after`.
  for (const [name, plan] of Object.entries(manifest.plans)) {
    if (plan.after && !manifest.plans[plan.after]) fail(`plan ${name}: after names no plan (${plan.after})`);
    for (const key of plan.publish || []) {
      if (!manifest.libs[key]) fail(`plan ${name}: publishes unknown library ${key}`);
    }
    for (const entry of plan.scripts || []) {
      if (entry.startsWith('@') && !manifest.groups[entry.slice(1)]) fail(`plan ${name}: unknown group ${entry}`);
      if (entry.startsWith('lib:') && !manifest.libs[entry.slice(4)]) fail(`plan ${name}: unknown library ${entry}`);
    }
  }
}

function checkLayouts(rv) {
  const map = rv.CHART_MAP || {};
  const labels = rv.CHART_LABELS || {};
  const layouts = Object.assign({ DEFAULT_LAYOUT: rv.DEFAULT_LAYOUT }, rv.LAYOUTS || {});

  for (const [name, layout] of Object.entries(layouts)) {
    const order = new Set(layout.order || []);
    for (const key of order) {
      if (!Object.prototype.hasOwnProperty.call(map, key)) {
        fail(`Layout ${name} references chart key without CHART_MAP entry: ${key}`);
      }
    }
    for (const bucket of ['wide', 'tall']) {
      for (const key of layout[bucket] || []) {
        if (!order.has(key)) {
          fail(`Layout ${name}.${bucket} contains key not present in order: ${key}`);
        }
      }
    }
  }

  for (const key of Object.keys(map)) {
    if (!Object.prototype.hasOwnProperty.call(labels, key)) {
      fail(`CHART_MAP key has no CHART_LABELS entry: ${key}`);
    }
  }
}

checkAssetPlans();
checkLayouts(loadRegistries());

if (failures.length) {
  console.error(`Registry contracts: ${failures.length} finding(s)\n`);
  for (const message of failures) console.error('  ' + message);
  process.exit(1);
}

console.log('Registry contracts: clean.');
