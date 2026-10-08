/**
 * Entity Network chrome — the parts a reader touches that are NOT the map: the
 * keyboard walker and its live region, the text alternative, the cluster filter,
 * and the export / fullscreen controls.
 *
 * Split out from entity-graph.js so that file stays what it is — the controller
 * that owns the payload, the MapLibre layers and the filter expressions. This one
 * only ever talks back through the hooks it is handed, so it needs to know nothing
 * about MapLibre. Mirrors the knowledge-graph.js / knowledge-graph-ui.js split.
 *
 * Depends on: dashboard-core.js (ns.el, ns.setChildren, ns.iconButton, ns.t).
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) { console.warn('DreVisualizations: dashboard-core.js must load before entity-graph-ui.js'); return; }

    var el = ns.el;
    function t(key, fallback) { return ns.t(key, fallback); }

    // Glyphs come from the module's one icon set (core/icons.js).
    var ICON = ns.ICONS;

    /* ------------------------------------------------------------------ */
    /*  Keyboard walker                                                    */
    /* ------------------------------------------------------------------ */

    /**
     * Make a graph reachable without a pointer, and audible to a screen reader.
     *
     * A WebGL canvas is opaque to both: before this the Entity Network carried
     * role="application" and a label but had no key handling at all, so there was
     * no way in. The arrow keys run the one walk every graph on the site shares
     * (ns.graphStep, dashboard-core) — left/right step through the entities and set
     * the "hub", up/down then walk that hub's own neighbours — so there is one set
     * of gestures for the knowledge graph, the co-occurrence networks and this map.
     *
     * @param {HTMLElement} host  the focusable stage (a click target already)
     * @param {Object} spec {
     *     order:     () => number[],          // visible node indices, reading order
     *     neighbours: (i) => number[],        // visible neighbours of i
     *     describe:  (i) => string,           // what a screen reader hears
     *     onFocus:   (i) => void,             // centre it, paint the focus ring
     *     onActivate:(i) => void,             // select it
     *     onEscape:  () => boolean,           // true when it consumed the key
     *     onZoom:    (factor) => void,
     *     onFit:     () => void
     * }
     * @returns {{focused: Function, clear: Function, announce: Function}}
     */
    function attachKeyboard(host, spec) {
        var status = el('p', 'deg-status');
        status.setAttribute('aria-live', 'polite');
        host.appendChild(status);

        var focusIdx = null;
        var walk = { hub: null, cursor: -1 };

        function announce(text) { status.textContent = text || ''; }

        function moveTo(i) {
            focusIdx = i;
            spec.onFocus(i);
            announce(spec.describe(i));
        }

        function clear() {
            focusIdx = null;
            walk.hub = null;
            walk.cursor = -1;
            announce('');
        }

        host.addEventListener('keydown', function (ev) {
            // Let the map's own controls (the zoom buttons) keep their keys.
            if (ev.target !== host && ev.target.closest
                && ev.target.closest('.maplibregl-ctrl')) {
                return;
            }

            var order = spec.order();
            if (!order.length) return;
            var next = ns.graphStep(ev.key, order, focusIdx, walk, spec.neighbours);
            if (next != null) { moveTo(next); ev.preventDefault(); return; }

            if (ev.key === 'Enter' || ev.key === ' ') {
                if (focusIdx != null) { spec.onActivate(focusIdx); ev.preventDefault(); }
                return;
            } else if (ev.key === '+' || ev.key === '=') {
                spec.onZoom(1); ev.preventDefault(); return;
            } else if (ev.key === '-' || ev.key === '_') {
                spec.onZoom(-1); ev.preventDefault(); return;
            } else if (ev.key === '0') {
                spec.onFit(); ev.preventDefault(); return;
            } else if (ev.key === 'Escape') {
                // Whatever the graph still has to clear comes first, so Escape does
                // not leave fullscreen while a selection is open behind it.
                if (spec.onEscape()) { ev.stopPropagation(); return; }
                if (focusIdx != null) { clear(); spec.onFocus(null); ev.stopPropagation(); }
            }
        });

        host.addEventListener('blur', function () {
            if (focusIdx == null) return;
            clear();
            spec.onFocus(null);
        });

        return {
            focused: function () { return focusIdx; },
            clear: function () { clear(); spec.onFocus(null); },
            announce: announce
        };
    }

    /* ------------------------------------------------------------------ */
    /*  Search: keyboard support for the results list                      */
    /* ------------------------------------------------------------------ */

    /**
     * Turn the search box into a real combobox: type, then arrow through the hits
     * and press Enter, without the pointer. Focus deliberately stays in the input
     * (aria-activedescendant, the standard pattern) so typing keeps working while
     * the highlight moves.
     *
     * The caller renders the hits; this owns the highlight, the keys and the ARIA
     * wiring. `spec.hits()` returns the currently rendered option elements.
     *
     * @returns {{reset: Function, sync: Function}} `sync` after re-rendering hits
     */
    function wireSearchKeys(input, results, spec) {
        var listId = 'deg-search-list-' + (ns._degSearchSeq = (ns._degSearchSeq || 0) + 1);
        results.id = listId;
        results.setAttribute('role', 'listbox');
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-controls', listId);
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');

        var active = -1;

        function paint() {
            var hits = spec.hits();
            hits.forEach(function (hit, i) {
                var on = i === active;
                hit.classList.toggle('is-active', on);
                hit.setAttribute('aria-selected', String(on));
            });
            if (active >= 0 && hits[active]) {
                input.setAttribute('aria-activedescendant', hits[active].id);
                if (hits[active].scrollIntoView) hits[active].scrollIntoView({ block: 'nearest' });
            } else {
                input.removeAttribute('aria-activedescendant');
            }
        }

        function reset() {
            active = -1;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
        }

        function sync() {
            active = -1;
            input.setAttribute('aria-expanded', String(!results.hidden));
            paint();
        }

        input.addEventListener('keydown', function (ev) {
            var hits = spec.hits();
            if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
                if (!hits.length) return;
                active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
                paint();
                ev.preventDefault();
            } else if (ev.key === 'Enter') {
                // No highlight yet: Enter takes the first hit, which is what a
                // reader who typed a full name expects.
                var pick = active >= 0 ? hits[active] : hits[0];
                if (pick) { spec.onPick(pick); ev.preventDefault(); }
            } else if (ev.key === 'Escape') {
                if (!results.hidden) { spec.onClose(); reset(); ev.stopPropagation(); }
            }
        });

        // focusout, not blur: moving the pointer onto an option must not close the
        // list before the click lands, and there is no timeout to get wrong.
        input.parentNode.addEventListener('focusout', function (ev) {
            if (ev.relatedTarget && input.parentNode.contains(ev.relatedTarget)) return;
            spec.onClose();
            reset();
        });

        return { reset: reset, sync: sync };
    }

    /* ------------------------------------------------------------------ */
    /*  Cluster filter                                                     */
    /* ------------------------------------------------------------------ */

    /**
     * Isolate one co-occurrence cluster.
     *
     * The block is called Discursive Communities and the clusters were the one axis
     * a reader could not filter on: the chips filter by type, the select below by
     * link weight, and colouring by cluster only ever recoloured. A <select> rather
     * than chips because Louvain routinely finds dozens of clusters, and each is
     * named by its most central member, which is the only handle a reader has on it.
     *
     * @param {Array} clusters [{ id, size, anchor }] sorted by size, largest first
     * @param {Function} onChange  called with the cluster id, or null for all
     */
    function buildClusterSelect(clusters, onChange) {
        var wrap = el('label', 'deg-weight deg-cluster');
        wrap.appendChild(el('span', null, t('degCluster', 'Group')));
        var sel = el('select', 'deg-weight-select deg-cluster-select');

        var all = el('option', null, t('degAllClusters', 'All groups'));
        all.value = '';
        sel.appendChild(all);
        clusters.forEach(function (c) {
            var name = c.anchor
                ? (c.anchor + ' (' + c.size + ')')
                : (t('community', 'Group') + ' ' + (c.id + 1) + ' (' + c.size + ')');
            var o = el('option', null, ns.truncateLabel(name, 34));
            o.value = String(c.id);
            sel.appendChild(o);
        });

        sel.addEventListener('change', function () {
            onChange(sel.value === '' ? null : Number(sel.value));
        });
        wrap.appendChild(sel);
        return { el: wrap, reset: function () { sel.value = ''; } };
    }

    /* ------------------------------------------------------------------ */
    /*  Export + fullscreen controls                                       */
    /* ------------------------------------------------------------------ */

    /**
     * Save the graph as a PNG and its entities as a CSV.
     *
     * The CSV is the ENTITY table, not the edge list: the cluster and dominant
     * research section are computed by this precompute and are available nowhere
     * else, whereas the edges are the picture on screen. It follows the visible
     * filters, so what a reader exports is what they narrowed to.
     *
     * @param {Object} spec { png: () => dataUrl|null, rows: () => string[][], name: string }
     * @returns {HTMLElement[]}
     */
    function buildExportButtons(spec) {
        var png = ns.iconButton(ICON.save, t('saveGraphImage', 'Save this graph as an image'), t('saveGraphImage', 'Save this graph as an image'));
        png.addEventListener('click', function () {
            var url = spec.png();
            if (!url) return;
            var a = el('a');
            a.href = url;
            a.download = spec.name + '.png';
            a.click();
        });

        var csv = ns.iconButton(ICON.csv, t('downloadGraphData', 'Download the data'),
            t('degCsvTitle', 'Download the entities you can see as a spreadsheet (CSV)'));
        csv.addEventListener('click', function () {
            // Reuses the module's one CSV writer (BOM + CRLF + quoting) through the
            // renderer-supplied-rows path in ns.chartCsvRows.
            ns.downloadChartCsv({ csvRows: spec.rows }, spec.name);
        });

        return [png, csv];
    }

    /**
     * Fullscreen the whole block, not just the map: the toolbar, the sidebar and
     * the legend are how a reader drives this graph, and MapLibre's own control
     * would take the canvas out from under them. Same `.rv-fullscreen` convention
     * (and the same Escape handling) as the knowledge graph.
     *
     * @param {HTMLElement} block   the element to expand
     * @param {Function}    onChange called with the new state after each toggle
     */
    function buildFullscreenButton(block, onChange) {
        // The shared control (core/fullscreen.js): aria-pressed, the label swap
        // and the Escape handling are the same on every surface. Its key listener
        // runs in the bubble phase, after the graph's own Escape (clear the
        // selection first) has had the chance to stop the event.
        return ns.fullscreenButton(block, { onChange: onChange });
    }

    /* ------------------------------------------------------------------ */
    /*  Text alternative                                                   */
    /* ------------------------------------------------------------------ */

    /**
     * Every visible entity as real links, grouped by type — the tabular fallback a
     * WebGL canvas cannot give a screen reader, and a Ctrl+F-able index for
     * everyone else. Built on open, and rebuilt each time, so it always reflects
     * the filters currently applied.
     *
     * @param {Object} spec {
     *     groups: () => [{ name, color, rows: [{ label, url, meta }] }],
     *     total:  () => number
     * }
     */
    function buildListPanel(spec) {
        var details = el('details', 'rv-kg-list deg-list');
        var summary = el('summary', null, t('degListToggle', 'See these entities as a list'));
        details.appendChild(summary);

        function rebuild() {
            while (details.childNodes.length > 1) details.removeChild(details.lastChild);
            var groups = spec.groups();
            if (!groups.length) {
                details.appendChild(el('p', 'rv-kg-list-meta', t('noData', 'Nothing to show')));
                return;
            }
            groups.forEach(function (group) {
                var head = el('h4', 'rv-kg-list-head');
                var sw = el('span', 'deg-swatch');
                sw.style.background = group.color;
                head.appendChild(sw);
                head.appendChild(el('span', null, group.name + ' (' + group.rows.length + ')'));
                details.appendChild(head);

                var ul = el('ul', 'rv-kg-list-items');
                group.rows.forEach(function (row) {
                    var li = el('li');
                    if (row.url) {
                        var a = el('a', null, row.label);
                        a.href = row.url;
                        li.appendChild(a);
                    } else {
                        li.appendChild(el('span', null, row.label));
                    }
                    if (row.meta) li.appendChild(el('span', 'rv-kg-list-meta', ' — ' + row.meta));
                    ul.appendChild(li);
                });
                details.appendChild(ul);
            });
        }

        details.addEventListener('toggle', function () { if (details.open) rebuild(); });
        return {
            el: details,
            // Called when the filters or the theme change: only worth the work while
            // the disclosure is actually open.
            refresh: function () { if (details.open) rebuild(); }
        };
    }

    ns.egUI = {
        attachKeyboard: attachKeyboard,
        wireSearchKeys: wireSearchKeys,
        buildClusterSelect: buildClusterSelect,
        buildExportButtons: buildExportButtons,
        buildFullscreenButton: buildFullscreenButton,
        buildListPanel: buildListPanel
    };
})();
