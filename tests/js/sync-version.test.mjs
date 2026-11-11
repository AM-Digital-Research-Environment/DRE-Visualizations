import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { promoteUnreleased } from '../../scripts/changelog-section.mjs';

// scripts/sync-version.mjs, the `npm version` hook, on a throwaway tree: what
// it writes is what scripts/check-release-metadata.mjs then requires.
const SCRIPT = fileURLToPath(new URL('../../scripts/sync-version.mjs', import.meta.url));
const REPO = 'https://github.com/AM-Digital-Research-Environment/DRE-Visualizations';
const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

### Fixed

- A fix.

## [2.50.0] - 2026-11-06

- Earlier.

[Unreleased]: ${REPO}/compare/v2.31.0...HEAD
[2.31.0]: ${REPO}/compare/v2.30.0...v2.31.0
`;

function tree(version, changelog = CHANGELOG) {
    const root = mkdtempSync(join(tmpdir(), 'dre-sync-version-'));
    mkdirSync(join(root, 'config'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', version }));
    writeFileSync(join(root, 'config/module.ini'), '[info]\nname = "DRE Visualizations"\nversion = "2.50.0"\nomeka_version_constraint = "^4.2.1"\n');
    writeFileSync(join(root, 'CITATION.cff'), 'cff-version: 1.2.0\nversion: "2.50.0"\ndate-released: 2026-11-06\nlicense: GPL-3.0-or-later\n');
    writeFileSync(join(root, 'CHANGELOG.md'), changelog);
    return root;
}

const sync = (root) => spawnSync(process.execPath, [SCRIPT, `--root=${root}`],
    { encoding: 'utf8', env: { ...process.env, SYNC_VERSION_DATE: '2026-11-20', npm_lifecycle_event: '' } });
const read = (root, file) => readFileSync(join(root, file), 'utf8');

test('the version reaches module.ini, CITATION.cff and a dated CHANGELOG section', () => {
    const root = tree('2.51.0');
    try {
        const result = sync(root);
        assert.equal(result.status, 0, result.stderr);
        assert.match(read(root, 'config/module.ini'), /^version = "2\.51\.0"$/m);
        assert.match(read(root, 'CITATION.cff'), /^version: "2\.51\.0"\ndate-released: 2026-11-20$/m);
        const changelog = read(root, 'CHANGELOG.md');
        assert.match(changelog, /## \[Unreleased\]\n\n## \[2\.51\.0\] - 2026-11-20\n\n### Fixed\n\n- A fix\.\n\n## \[2\.50\.0\] - 2026-11-06/);
        assert.match(changelog, new RegExp(`^\\[Unreleased\\]: ${REPO}/compare/v2\\.51\\.0\\.\\.\\.HEAD\\n\\[2\\.51\\.0\\]: ${REPO}/compare/v2\\.50\\.0\\.\\.\\.v2\\.51\\.0$`, 'm'));
        // A second run (npm re-running the hook, or by hand) changes nothing.
        const again = sync(root);
        assert.equal(again.status, 0, again.stderr);
        assert.match(again.stdout, /already in sync/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('a release with no [Unreleased] notes is refused', () => {
    const root = tree('2.51.0', CHANGELOG.replace('### Fixed\n\n- A fix.\n\n', ''));
    try {
        const result = sync(root);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /no \[Unreleased\] notes/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('promoteUnreleased keeps an editing placeholder under [Unreleased]', () => {
    const text = CHANGELOG.replace('## [Unreleased]\n', '## [Unreleased]\n\n<!-- Add entries here. -->\n');
    const out = promoteUnreleased(text, '2.51.0', '2026-11-20');
    assert.match(out, /## \[Unreleased\]\n\n<!-- Add entries here\. -->\n\n## \[2\.51\.0\] - 2026-11-20\n\n### Fixed/);
    assert.equal(promoteUnreleased(out, '2.51.0', '2026-11-21'), out, 'a version that has its section is left alone');
});
