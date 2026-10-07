import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The shared arrow-key model (ns.graphStep), from its dashboard-core source file.
const window = { RV: {} };
vm.runInNewContext(readFileSync(new URL('../../asset/js/core/graph-walk.js', import.meta.url), 'utf8'),
    { window }, { filename: 'asset/js/core/graph-walk.js' });
const step = window.RV.graphStep;

// 0 is a hub of 1 and 2; 3 has no neighbours. Index 0 must work as a key: the
// Entity Network walks node indices, not ids.
const order = [0, 1, 2, 3];
const adj = { 0: [1, 2], 1: [0], 2: [0], 3: [] };
const neighbours = (hub) => adj[hub];
const fresh = () => ({ hub: null, cursor: -1 });

test('left/right step through the reading order, wrapping, and set the hub', () => {
    const walk = fresh();
    assert.equal(step('ArrowRight', order, null, walk, neighbours), 0);
    assert.equal(walk.hub, 0);
    assert.equal(step('ArrowLeft', order, 0, walk, neighbours), 3, 'wraps backwards');
    assert.equal(step('ArrowRight', order, 3, walk, neighbours), 0, 'wraps forwards');
    assert.equal(walk.cursor, -1);
});

test('up/down walk the hub’s neighbours without re-rooting on each step', () => {
    const walk = fresh();
    step('ArrowRight', order, null, walk, neighbours);               // focus + hub: 0
    assert.equal(step('ArrowDown', order, 0, walk, neighbours), 1);
    assert.equal(step('ArrowDown', order, 1, walk, neighbours), 2, 'still walking 0’s neighbours');
    assert.equal(step('ArrowDown', order, 2, walk, neighbours), 1, 'wraps within the neighbours');
    assert.equal(step('ArrowUp', order, 1, walk, neighbours), 2);
    assert.equal(walk.hub, 0);
});

test('up/down with no focus yet starts from the first node', () => {
    const walk = fresh();
    assert.equal(step('ArrowDown', order, null, walk, neighbours), 1);
    assert.equal(walk.hub, 0);
});

test('a hub with no neighbours falls back to the reading order and moves the hub', () => {
    const walk = fresh();
    assert.equal(step('ArrowLeft', order, 0, walk, neighbours), 3);  // focus + hub: 3
    assert.equal(step('ArrowDown', order, 3, walk, neighbours), 0);
    assert.equal(walk.hub, 0);
    assert.equal(step('ArrowDown', order, 0, walk, neighbours), 1, 'then walks the new hub');
});

test('any other key is left to the caller', () => {
    const walk = fresh();
    for (const key of ['Enter', ' ', 'Escape', '+', '0', 'Tab']) {
        assert.equal(step(key, order, 1, walk, neighbours), null, key);
    }
    assert.deepEqual(walk, fresh(), 'and leaves the walk untouched');
});
