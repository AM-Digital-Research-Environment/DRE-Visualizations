import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The data-colour contract (README "Theming", the theme's DESIGN.md §9):
// stops 1–6 of the categorical palette ARE the cluster's --brand-* pigments,
// duplicated in core/theme.js on purpose, so they must move in lockstep with
// the theme. scripts/lib/dre-tokens-fallback.json is the theme's generated
// token file, vendored byte for byte (VENDORED.sha256), never hand-edited.
const tokens = JSON.parse(readFileSync(new URL('../../scripts/lib/dre-tokens-fallback.json', import.meta.url), 'utf8'));
const window = { RV: {} };
vm.runInNewContext(readFileSync(new URL('../../asset/js/core/theme.js', import.meta.url), 'utf8'),
    { window, document: { documentElement: {} } }, { filename: 'asset/js/core/theme.js' });
// Arrays made in the sandbox have its prototypes: compare copies.
const ns = window.RV;

test('palette stops 1–6 are the --brand-* tokens, in the documented order', () => {
    const brand = ['--brand-green', '--brand-gelb', '--brand-hellblau', '--brand-braun', '--brand-dunkelblau', '--brand-gold']
        .map((name) => {
            assert.ok(tokens.shared[name], `${name} is in the vendored token fallback`);
            return tokens.shared[name].toLowerCase();
        });
    assert.deepEqual(Array.from(ns._PALETTE_LIGHT).slice(0, 6).map((hex) => hex.toLowerCase()), brand);
});

test('both modes have twelve distinct hues', () => {
    for (const palette of [ns._PALETTE_LIGHT, ns._PALETTE_DARK]) {
        assert.equal(palette.length, 12);
        assert.equal(new Set(palette.map((hex) => hex.toLowerCase())).size, 12);
    }
});
