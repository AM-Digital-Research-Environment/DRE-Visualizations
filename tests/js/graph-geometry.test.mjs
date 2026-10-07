import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The production graph-canvas.js, whole. Loading it only defines functions, so
// a bare `window.RV` is the whole sandbox: ns.graphGeometry needs no DOM.
function load(file) {
    const window = { RV: {} };
    vm.runInNewContext(readFileSync(new URL(`../../asset/js/${file}`, import.meta.url), 'utf8'),
        { window, console }, { filename: `asset/js/${file}` });
    return window.RV;
}
const geo = load('graph-canvas.js').graphGeometry;
const identity = { x: 0, y: 0, k: 1 };
const node = (id, x, y, r) => ({ id, x, y, r });

test('graph-canvas.js publishes the geometry beside the canvas factory', () => {
    const ns = load('graph-canvas.js');
    assert.equal(typeof ns.GraphCanvas.create, 'function');
    assert.equal(geo.HIT_SLOP, 3);
    assert.equal(geo.MIN_HIT_RADIUS, 6);
    assert.equal(geo.LINK_HIT, 36, 'a link is hit within 6px (compared squared)');
});

test('screen projection applies zoom, then pan', () => {
    const view = { x: 10, y: -20, k: 2 };
    assert.equal(geo.screenX(view, { x: 5, y: 7 }), 20);
    assert.equal(geo.screenY(view, { x: 5, y: 7 }), -6);
});

test('the squared distance to a segment clamps to its endpoints', () => {
    assert.equal(geo.distToSegment(5, 3, 0, 0, 10, 0), 9, 'perpendicular foot inside the segment');
    assert.equal(geo.distToSegment(-3, 4, 0, 0, 10, 0), 25, 'before the start: distance to the start');
    assert.equal(geo.distToSegment(13, 4, 0, 0, 10, 0), 25, 'past the end: distance to the end');
    assert.equal(geo.distToSegment(3, 4, 0, 0, 0, 0), 25, 'a zero-length segment is a point');
});

test('the hit radius scales with zoom but never drops below the 6px floor', () => {
    assert.equal(geo.hitRadius(10, 1), 13);
    assert.equal(geo.hitRadius(10, 2), 23);
    assert.equal(geo.hitRadius(10, 0.2), 9, '2px drawn → the 6px floor + slop');
    assert.equal(geo.hitRadius(0, 1), 9);
});

test('a node is hit inside its slop-padded radius and missed outside it', () => {
    const n = node('a', 100, 100, 10);
    assert.equal(geo.nodeAt([n], identity, 112, 100), n, 'radius 10 + slop 3 reaches 13px');
    assert.equal(geo.nodeAt([n], identity, 100, 113), n, 'the boundary itself counts');
    assert.equal(geo.nodeAt([n], identity, 114, 100), null);
});

test('zooming out keeps a tiny node clickable through the minimum radius', () => {
    const n = node('a', 100, 100, 1);
    const far = { x: 0, y: 0, k: 0.2 };   // the node sits at (20, 20) and is drawn 0.2px wide
    assert.equal(geo.nodeAt([n], far, 28, 20), n);
    assert.equal(geo.nodeAt([n], far, 30, 20), null);
});

test('hit testing follows the pan/zoom transform', () => {
    const n = node('a', 10, 10, 5);
    const view = { x: 50, y: 40, k: 3 };   // screen (80, 70), hit radius 18
    assert.equal(geo.nodeAt([n], view, 80, 70), n);
    assert.equal(geo.nodeAt([n], view, 97, 70), n);
    assert.equal(geo.nodeAt([n], view, 99, 70), null);
    assert.equal(geo.nodeAt([n], identity, 80, 70), null, 'the untransformed position is not a hit');
});

test('overlapping nodes resolve to the nearest centre, then to the one on top', () => {
    const a = node('a', 100, 100, 10);
    const b = node('b', 108, 100, 10);
    assert.equal(geo.nodeAt([a, b], identity, 102, 100), a);
    assert.equal(geo.nodeAt([a, b], identity, 106, 100), b);
    const c = node('c', 100, 100, 10);
    assert.equal(geo.nodeAt([a, c], identity, 100, 100), c, 'a tie goes to the node painted last');
});

test('a link is hit within 6px of its chord, and the nearest link wins', () => {
    const s = node('s', 0, 0, 5), t = node('t', 100, 0, 5), u = node('u', 0, 10, 5), v = node('v', 100, 10, 5);
    const st = { source: s, target: t }, uv = { source: u, target: v };
    assert.equal(geo.linkAt([st], identity, 50, 5), st, '5px off');
    assert.equal(geo.linkAt([st], identity, 50, 6), null, 'exactly 6px is outside (strict)');
    assert.equal(geo.linkAt([st, uv], identity, 50, 3), st);
    assert.equal(geo.linkAt([st, uv], identity, 50, 7), uv);
    assert.equal(geo.linkAt([st], { x: 0, y: 0, k: 2 }, 100, 11), null, 'the chord moves with the zoom');
    assert.equal(geo.linkAt([st], { x: 0, y: 0, k: 2 }, 100, 5), st);
});

test('nothing to hit returns null', () => {
    assert.equal(geo.nodeAt([], identity, 0, 0), null);
    assert.equal(geo.linkAt([], identity, 0, 0), null);
});
