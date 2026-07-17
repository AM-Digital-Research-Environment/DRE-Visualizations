#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const CANONICAL = 'https://github.com/AM-Digital-Research-Environment/ResourceVisualizations';
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
  'config/amira-profile.json',
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
if ((linkMatch && linkMatch[1]) !== CANONICAL) failures.push(`module_link must be ${CANONICAL}`);
if (packageJson.repository?.url !== `git+${CANONICAL}.git`) {
  failures.push('package.json repository URL is not canonical');
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
if (profile && (!profile.itemSets || !Array.isArray(profile.wordcloudCorpora))) {
  failures.push('AMIRA profile is missing itemSets or wordcloudCorpora');
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
}
for (const stale of ['DRE-Visualizations', '/ResourceVisualizations/archive/']) {
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
