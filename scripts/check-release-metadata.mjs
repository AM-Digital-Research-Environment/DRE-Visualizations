#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { changelogDate, changelogSection } from './changelog-section.mjs';

const ROOT = join(import.meta.dirname, '..');
const CANONICAL = 'https://github.com/AM-Digital-Research-Environment/DRE-Visualizations';
const failures = [];
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const packageJson = JSON.parse(read('package.json'));
const moduleIni = read('config/module.ini');
const readme = read('README.md');
const requiredReleaseFiles = [
  'LICENSE',
  'THIRD_PARTY_NOTICES',
  'SECURITY.md',
  'CHANGELOG.md',
  'CITATION.cff',
  'config/amira-profile.json',
  // The self-hosted basemap. Without these the maps silently lose their land,
  // borders and every label, so they are release-blocking assets.
  'asset/data/geo/countries.geojson',
  'asset/fonts/OFL.txt',
  'asset/fonts/Noto Sans Regular/0-255.pbf',
  'asset/fonts/Noto Sans Regular/8192-8447.pbf',
];
let profile = null;
try {
  profile = JSON.parse(read('config/amira-profile.json'));
} catch (error) {
  failures.push(`config/amira-profile.json is not valid JSON: ${error.message}`);
}
const versionMatch = /^version\s*=\s*"([^"]+)"/m.exec(moduleIni);
const linkMatch = /^module_link\s*=\s*"([^"]+)"/m.exec(moduleIni);
const moduleVersion = versionMatch ? versionMatch[1] : '';
const packageVersion = String(packageJson.version || '');

if (!moduleVersion) failures.push('config/module.ini has no version');
if (moduleVersion !== packageVersion) {
  failures.push(`module.ini version ${moduleVersion || '(missing)'} != package.json ${packageVersion || '(missing)'}`);
}
// package-lock.json repeats the version twice (top level and the root
// package); `npm version` updates both, a hand edit of package.json does not.
try {
  const lock = JSON.parse(read('package-lock.json'));
  for (const [where, value] of [['version', lock.version], ['packages[""].version', lock.packages?.['']?.version]]) {
    if (value !== moduleVersion) failures.push(`package-lock.json ${where} ${value || '(missing)'} != module.ini ${moduleVersion}`);
  }
} catch (error) {
  failures.push(`package-lock.json check failed: ${error.message}`);
}
// Omeka S 4.2.1 is the only core CI and the golden suites run against.
const constraint = /^omeka_version_constraint\s*=\s*"([^"]+)"/m.exec(moduleIni)?.[1];
if (constraint !== '^4.2.1') {
  failures.push(`module.ini omeka_version_constraint ${constraint || '(missing)'} != "^4.2.1" (the core CI tests)`);
}
if ((linkMatch && linkMatch[1]) !== CANONICAL) failures.push(`module_link must be ${CANONICAL}`);
if (packageJson.repository?.url !== `git+${CANONICAL}.git`) {
  failures.push('package.json repository URL is not canonical');
}
// CITATION.cff is the one metadata file nothing else reads, so it goes stale
// silently — a "Cite this repository" button naming a version that was never
// tagged. Pin it to module.ini and to the CHANGELOG entry for that version.
// Flat scalars only, so regex rather than a YAML dependency.
try {
  const citation = read('CITATION.cff');
  const field = (key) => {
    const match = new RegExp(`^${key}:\\s*"?([^"\\n]+?)"?\\s*$`, 'm').exec(citation);
    return match ? match[1] : '';
  };
  if (field('version') !== moduleVersion) {
    failures.push(`CITATION.cff version ${field('version') || '(missing)'} != module.ini ${moduleVersion}`);
  }
  if (field('repository-code') !== CANONICAL) failures.push(`CITATION.cff repository-code must be ${CANONICAL}`);
  if (!/^\s*(?:-\s*)?orcid:\s*"https:\/\/orcid\.org\/[\dX-]{19}"\s*$/m.test(citation)) {
    failures.push('CITATION.cff author ORCID is missing or malformed');
  }
  // Keep a Changelog: `## [x.y.z] - YYYY-MM-DD`, with notes (release.yml
  // publishes them as the release body) and an [Unreleased] section above.
  const changelog = read('CHANGELOG.md');
  const released = changelogDate(changelog, moduleVersion);
  if (!released) {
    failures.push(`CHANGELOG.md has no "## [${moduleVersion}] - YYYY-MM-DD" entry`);
  } else if (field('date-released') !== released) {
    failures.push(`CITATION.cff date-released ${field('date-released') || '(missing)'} != CHANGELOG ${released}`);
  }
  if (!changelogSection(changelog, moduleVersion)) failures.push(`CHANGELOG.md has no notes for ${moduleVersion}`);
  if (changelogSection(changelog, 'Unreleased') === null) failures.push('CHANGELOG.md has no ## [Unreleased] section');
  if (/^## (?!\[)/m.test(changelog.replace(/\r\n/g, '\n'))) {
    failures.push('CHANGELOG.md has a version heading without brackets (Keep a Changelog: ## [x.y.z] - YYYY-MM-DD)');
  }
} catch (error) {
  failures.push(`CITATION.cff check failed: ${error.message}`);
}

if (!readme.includes(`${CANONICAL}/releases/latest/download/DreVisualizations.zip`)) {
  failures.push('README does not install from the canonical DreVisualizations.zip release asset');
}
for (const path of requiredReleaseFiles) {
  try {
    if (!read(path).trim()) failures.push(`${path} is empty`);
  } catch {
    failures.push(`${path} is missing`);
  }
}
if (profile && profile.schemaVersion !== 1) failures.push('AMIRA profile schemaVersion must be 1');
if (profile && (!profile.itemSets || !profile.templates
    || !Array.isArray(profile.wordcloudCorpora) || !Array.isArray(profile.embeddingCorpora))) {
  failures.push('AMIRA profile is missing selectors or corpus configuration');
} else if (profile) {
  const seen = new Set();
  for (const corpus of profile.wordcloudCorpora) {
    if (!corpus || typeof corpus.id !== 'string' || seen.has(corpus.id)
        || typeof corpus.itemSetKey !== 'string'
        || !Number.isInteger(profile.itemSets[corpus.itemSetKey])) {
      failures.push('AMIRA profile has an invalid or duplicate word-cloud corpus');
      break;
    }
    seen.add(corpus.id);
  }
  const embeddingIds = new Set();
  for (const corpus of profile.embeddingCorpora) {
    const hasItemSet = corpus && typeof corpus.itemSetKey === 'string'
      && Number.isInteger(profile.itemSets[corpus.itemSetKey]);
    const hasTemplate = corpus && typeof corpus.templateKey === 'string'
      && Number.isInteger(profile.templates[corpus.templateKey]);
    if (!corpus || typeof corpus.id !== 'string' || embeddingIds.has(corpus.id)
        || typeof corpus.label !== 'string' || !corpus.label.trim()
        || hasItemSet === hasTemplate || !Array.isArray(corpus.textFields)
        || !corpus.textFields.length) {
      failures.push('AMIRA profile has an invalid or duplicate embedding corpus');
      break;
    }
    embeddingIds.add(corpus.id);
  }
}
// MapLibre 6 ships as three ES-module files whose names are coupled in two
// directions: the entry point and the worker both import a version-stamped
// shared chunk, and DashboardAssets names the version-stamped worker so it can
// hand it to setWorkerUrl(). Bumping the library renames two of the three, and
// every miss is a silent runtime 404 — a blank map, not a build error. Assert
// the whole triangle resolves.
try {
  const vendored = new Set(readdirSync(join(ROOT, 'asset/vendor')));
  const helper = read('src/View/Helper/DashboardAssets.php');
  const workerMatch = /const MAPLIBRE_WORKER_JS\s*=\s*'vendor\/([^']+)'/.exec(helper);
  if (!workerMatch) {
    failures.push('DashboardAssets::MAPLIBRE_WORKER_JS is missing');
  } else if (!vendored.has(workerMatch[1])) {
    failures.push(`DashboardAssets::MAPLIBRE_WORKER_JS names asset/vendor/${workerMatch[1]}, which is not vendored`);
  }
  for (const entry of ['maplibre-gl.js', workerMatch?.[1]].filter(Boolean)) {
    if (!vendored.has(entry)) {
      failures.push(`asset/vendor/${entry} is missing`);
      continue;
    }
    // A relative import resolves against import.meta.url and drops Omeka's
    // ?v= cache-buster, so the vendored builds must be self-contained.
    if (/(?:\bfrom\s*|\bimport\s*\(\s*)["'`]\.\.?\//.test(read(`asset/vendor/${entry}`))) {
      failures.push(`asset/vendor/${entry} imports a relative chunk — re-vendor with npm run vendor:maplibre`);
    }
  }
  for (const stale of vendored) {
    if (/^maplibre-gl-(shared|worker)-/.test(stale)) failures.push(`asset/vendor/${stale} is a stale MapLibre chunk`);
  }
} catch (error) {
  failures.push(`vendored MapLibre check failed: ${error.message}`);
}

for (const stale of ['/ResourceVisualizations', 'resource-visualizations']) {
  if (readme.includes(stale) || moduleIni.includes(stale) || JSON.stringify(packageJson).includes(stale)) {
    failures.push(`stale release/repository reference remains: ${stale}`);
  }
}

const tagFlag = process.argv.indexOf('--tag');
const suppliedTag = tagFlag >= 0 ? process.argv[tagFlag + 1] : '';
if (tagFlag >= 0) {
  const expected = `v${moduleVersion}`;
  if (suppliedTag !== expected) failures.push(`release tag ${suppliedTag || '(missing)'} != ${expected}`);
}

if (failures.length) {
  console.error(`Release metadata: ${failures.length} finding(s)`);
  for (const failure of failures) console.error('  ' + failure);
  process.exit(1);
}
console.log(`Release metadata: ${moduleVersion} and canonical URLs agree${suppliedTag ? ` with ${suppliedTag}` : ''}.`);
