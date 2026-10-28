#!/usr/bin/env node
/**
 * The vendored browser libraries (asset/vendor/) against their one record,
 * asset/vendor/versions.json, and against npm.
 *
 *   node scripts/check-vendor.mjs                 offline: files, hashes, notices (npm run check:vendor)
 *   node scripts/check-vendor.mjs --latest        also compare every pin with the npm registry's latest
 *   node scripts/check-vendor.mjs --latest --warn-only   …reporting drift without failing
 *   node scripts/check-vendor.mjs --verify        also compare every vendored file with its npm tarball
 *
 * ECharts, echarts-wordcloud, MapLibre and the d3 force stack are the code that
 * reaches visitors' browsers, and they are committed files, not npm
 * dependencies, so Dependabot never proposes an upgrade for them. The monthly
 * "Vendored libraries" workflow runs --latest (a red scheduled run is the
 * notification) and --verify (a vendored file whose bytes differ from the
 * published package is never a choice, so that always fails).
 *
 * Offline, the check holds the repository to the manifest: every vendored file
 * is listed once and has the recorded SHA-256; THIRD_PARTY_NOTICES names the
 * same versions and hashes; and the version comment in DashboardAssets, while
 * it exists, agrees. The registry being unreachable makes --latest warn, not
 * fail: pinning behind `latest` is a legitimate choice, and an offline machine
 * is not a finding.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { latestVersion, packageFiles, sha256 } from './lib/npm-tarball.mjs';

const ROOT = join(import.meta.dirname, '..');
const VENDOR = join(ROOT, 'asset', 'vendor');
const MANIFEST = 'versions.json';
const args = new Set(process.argv.slice(2));
const inActions = process.env.GITHUB_ACTIONS === 'true';

/** How THIRD_PARTY_NOTICES names a package in its heading, where it names one with a version. */
const NOTICE_LABELS = {
  echarts: 'Apache ECharts',
  'echarts-wordcloud': 'echarts-wordcloud',
  'maplibre-gl': 'MapLibre GL JS',
  'd3-force': 'd3-force',
};

const failures = [];
const warnings = [];
const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);

const manifest = JSON.parse(readFileSync(join(VENDOR, MANIFEST), 'utf8'));
const packages = Object.entries(manifest.packages || {});
if (!packages.length) fail(`asset/vendor/${MANIFEST} lists no packages`);

// Every vendored file is listed exactly once, exists, and has its recorded hash.
const listed = new Map();
for (const [name, pkg] of packages) {
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version || '')) fail(`${name}: "${pkg.version}" is not an exact version`);
  for (const [file, entry] of Object.entries(pkg.files || {})) {
    if (listed.has(file)) fail(`${file} is listed under both ${listed.get(file)} and ${name}`);
    listed.set(file, name);
    const path = join(VENDOR, file);
    if (!existsSync(path)) { fail(`${name}: asset/vendor/${file} is listed but missing`); continue; }
    const actual = sha256(readFileSync(path));
    if (actual !== entry.sha256) fail(`asset/vendor/${file} has SHA-256 ${actual}; ${MANIFEST} records ${entry.sha256}`);
  }
}
for (const file of readdirSync(VENDOR)) {
  if (file !== MANIFEST && !listed.has(file)) fail(`asset/vendor/${file} is not in ${MANIFEST}`);
}

// THIRD_PARTY_NOTICES: the human-readable copy names the same versions and hashes.
const notices = readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES'), 'utf8');
for (const [name, label] of Object.entries(NOTICE_LABELS)) {
  const pkg = manifest.packages[name];
  if (!pkg) { fail(`${MANIFEST} has no ${name}, which THIRD_PARTY_NOTICES describes`); continue; }
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^${escaped} (\\d+\\.\\d+\\.\\d+)`, 'm').exec(notices);
  if (!heading) fail(`THIRD_PARTY_NOTICES has no "${label} <version>" heading`);
  else if (heading[1] !== pkg.version) fail(`THIRD_PARTY_NOTICES says ${label} ${heading[1]}; ${MANIFEST} pins ${pkg.version}`);
}
for (const match of notices.matchAll(/^\s+([\w.-]+\.(?:js|css))\s+([0-9a-f]{64})\s*$/gm)) {
  const [, file, hash] = match;
  const name = listed.get(file);
  if (!name) fail(`THIRD_PARTY_NOTICES records a hash for ${file}, which is not vendored`);
  else if (manifest.packages[name].files[file].sha256 !== hash) fail(`THIRD_PARTY_NOTICES records ${file} as ${hash}; the file is ${manifest.packages[name].files[file].sha256}`);
}

// The helper's version comment, while it carries one ("Pinned: echarts 6.1.0, …").
const helperPath = join(ROOT, 'src', 'View', 'Helper', 'DashboardAssets.php');
const helper = existsSync(helperPath) ? readFileSync(helperPath, 'utf8').replace(/\s*\n\s*(?:\/\/|\*)\s*/g, ' ') : '';
const pinned = /Pinned:\s*((?:[a-z0-9-]+ \d+\.\d+\.\d+(?:,\s*|\s+and\s+)?)+)/.exec(helper);
if (pinned) {
  for (const [, name, version] of pinned[1].matchAll(/([a-z0-9-]+) (\d+\.\d+\.\d+)/g)) {
    const pkg = manifest.packages[name];
    if (!pkg) fail(`DashboardAssets names ${name} ${version}, which ${MANIFEST} does not pin`);
    else if (pkg.version !== version) fail(`DashboardAssets says ${name} ${version}; ${MANIFEST} pins ${pkg.version}`);
  }
}

if (args.has('--latest')) {
  for (const [name, pkg] of packages) {
    let latest;
    try { latest = await latestVersion(name); } catch (error) { warn(`${name}: registry unreachable (${error.message})`); continue; }
    if (latest !== pkg.version) {
      (args.has('--warn-only') ? warn : fail)(`${name} ${pkg.version} is vendored; npm latest is ${latest}`);
    }
  }
}

if (args.has('--verify')) {
  for (const [name, pkg] of packages) {
    let files;
    try { files = await packageFiles(name, pkg.version); } catch (error) { fail(error.message); continue; }
    for (const [file, entry] of Object.entries(pkg.files)) {
      if (!entry.from) continue; // the module's own file (a notice), held to its hash above
      const upstream = files.get(`package/${entry.from}`);
      if (!upstream) { fail(`${name}@${pkg.version} ships no ${entry.from}`); continue; }
      const vendored = existsSync(join(VENDOR, file)) ? readFileSync(join(VENDOR, file)) : null;
      if (!vendored || !upstream.equals(vendored)) {
        fail(`asset/vendor/${file} differs from ${entry.from} in ${name}@${pkg.version} (${sha256(upstream)})`);
      }
    }
  }
}

for (const message of warnings) console.warn(inActions ? `::warning::${message}` : `warning: ${message}`);
if (failures.length) {
  console.error(`Vendored libraries: ${failures.length} finding(s)`);
  for (const message of failures) console.error(inActions ? `::error::${message}` : `  ${message}`);
  process.exit(1);
}
const modes = ['manifest', args.has('--latest') && 'npm latest', args.has('--verify') && 'tarball bytes'].filter(Boolean);
console.log(`Vendored libraries: clean (${packages.length} packages, ${listed.size} files; ${modes.join(', ')}).`);
