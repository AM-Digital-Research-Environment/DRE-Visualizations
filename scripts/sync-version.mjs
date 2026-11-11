#!/usr/bin/env node
/**
 * Copy package.json's version everywhere else the release version is written
 * (the same mechanism as DRE-theme's script of the same name).
 *
 *   npm version <major|minor|patch|x.y.z> -m "Release v%s"
 *                                           runs this as the `version` hook
 *   node scripts/sync-version.mjs           same edits, nothing staged
 *   node scripts/sync-version.mjs --root=<dir>   ... in another copy of the tree
 *
 * npm bumps package.json and package-lock.json, then runs the `version`
 * script before it commits and tags `v<version>`. This writes the same number
 * into
 *
 *   config/module.ini   version — what Omeka shows an admin, the asset ?v=
 *                       cache-buster, and what release.yml greps the
 *                       packaged archive for
 *   CITATION.cff        version, and date-released → today
 *   CHANGELOG.md        promotes the [Unreleased] notes to `## [x.y.z] - today`
 *
 * and, under `npm version`, stages them so they land in the version commit.
 * `npm run check:release` (scripts/check-release-metadata.mjs) asserts the
 * result. Re-running it for a version already written changes nothing.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { promoteUnreleased } from './changelog-section.mjs';

const rootFlag = process.argv.find((arg) => arg.startsWith('--root='));
const ROOT = rootFlag ? resolve(rootFlag.slice('--root='.length)) : join(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error(`sync-version: package.json version "${version}" is not x.y.z`);
  process.exit(1);
}
const today = process.env.SYNC_VERSION_DATE || new Date().toISOString().slice(0, 10);
const touched = [];

function edit(file, transform) {
  const path = join(ROOT, file);
  if (!existsSync(path)) throw new Error(`sync-version: ${file} is missing`);
  const before = readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) {
    writeFileSync(path, after);
    touched.push(file);
  }
}

try {
  // release.yml and check-release-metadata.mjs read the exact spelling
  // `version = "x.y.z"` at the start of a line.
  edit('config/module.ini', (text) => {
    if (!/^version\s*=\s*"[^"]*"/m.test(text)) throw new Error('sync-version: no version line in config/module.ini');
    return text.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`);
  });
  // The release date moves only with the version, so a re-run is a no-op.
  edit('CITATION.cff', (text) => {
    const bumped = text.replace(/^version:\s*.*$/m, `version: "${version}"`);
    return bumped === text ? text : bumped.replace(/^date-released:\s*.*$/m, `date-released: ${today}`);
  });
  edit('CHANGELOG.md', (text) => {
    const promoted = promoteUnreleased(text, version, today);
    if (promoted === null) {
      throw new Error(`sync-version: CHANGELOG.md has no [Unreleased] notes to release as ${version}; write them first`);
    }
    return promoted;
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (process.env.npm_lifecycle_event === 'version' && touched.length) {
  const add = spawnSync('git', ['add', '--', ...touched], { cwd: ROOT, stdio: 'inherit' });
  if (add.status !== 0) process.exit(add.status ?? 1);
}
console.log(`sync-version: ${version}${touched.length ? ` → ${touched.join(', ')}` : ' (already in sync)'}`);
