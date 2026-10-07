/**
 * Dashboard core: the arrow-key model every graph on the site shares — the
 * d3-force graphs (graph-force.js) and the MapLibre Entity Network
 * (entity-graph-ui.js). Here so both renderer chains, which never load each
 * other, walk with one implementation.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    /**
     * One arrow-key step through a graph. Left/Right step through every visible
     * node in reading order and make the node they land on the "hub"; Up/Down
     * then walk that hub's own neighbours, falling back to the reading order
     * when the hub has none. Holding the hub across an Up/Down run is what keeps
     * the walk predictable — re-rooting on every step would wander off.
     *
     * Pure: no DOM, no rendering. The caller owns focus, announcements and
     * every other key (Enter, zoom, Escape), which differ per renderer.
     *
     * @param {string}   key        the KeyboardEvent.key
     * @param {Array}    order      visible node keys, in reading order (non-empty)
     * @param {*}        focus      the focused node key, or null
     * @param {Object}   walk       { hub, cursor } — the caller's walk state,
     *                              updated in place; start it at { hub: null, cursor: -1 }
     * @param {Function} neighbours hub key → its visible neighbours' keys
     * @returns {*} the key to focus next, or null when `key` is not an arrow
     */
    ns.graphStep = function (key, order, focus, walk, neighbours) {
        var at = focus == null ? -1 : order.indexOf(focus);
        var dir;
        if (key === 'ArrowRight' || key === 'ArrowLeft') {
            dir = key === 'ArrowRight' ? 1 : -1;
            walk.hub = order[(at + dir + order.length) % order.length];
            walk.cursor = -1;
            return walk.hub;
        }
        if (key === 'ArrowDown' || key === 'ArrowUp') {
            dir = key === 'ArrowDown' ? 1 : -1;
            if (walk.hub == null) walk.hub = focus == null ? order[0] : focus;
            var nb = neighbours(walk.hub);
            if (!nb.length) {
                walk.hub = order[(at + dir + order.length) % order.length];
                return walk.hub;
            }
            walk.cursor = (walk.cursor + dir + nb.length) % nb.length;
            return nb[walk.cursor];
        }
        return null;
    };
})();
