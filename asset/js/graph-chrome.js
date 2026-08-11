/**
 * GraphChrome — the renderer-agnostic chrome a ForceGraph needs around its canvas:
 * a clickable category legend, the detail card a selection opens, an edge-colour
 * key, and the gesture hint.
 *
 * Split out from knowledge-graph-ui.js so a second consumer does not have to pull
 * in the knowledge graph's own chrome (its slider filter panel, its relationship
 * list, its floating toolbar) to reuse the four pieces that are not
 * knowledge-graph-specific. Like graph-canvas.js and graph-force.js, this file
 * knows nothing about Omeka: every label and row comes from a hook the caller
 * supplies, so it can serve a co-occurrence network as easily as a knowledge graph.
 *
 * It talks to a ForceGraph only through its public surface (select, adjacency,
 * toggleCategory, categoriesInUse) — never its internals.
 *
 * Reuses the .rv-kg-card / .rv-kg-legend / .rv-edge-legend styles the knowledge
 * graph already ships, so there is one visual language for every graph on the site
 * and one place to restyle them.
 *
 * Depends on: dashboard-core.js (ns.el, ns.setChildren, ns.iconButton, ns.t).
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) { console.warn('DreVisualizations: dashboard-core.js must load before graph-chrome.js'); return; }

    var el = ns.el;
    function t(key, fallback) { return ns.t(key, fallback); }

    var CLOSE_ICON = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';

    /* ------------------------------------------------------------------ */
    /*  Legend                                                             */
    /* ------------------------------------------------------------------ */

    /**
     * Clickable category swatches. Toggling a chip hides that category in the
     * graph — which is the only filter some graphs get, so it earns its place.
     *
     * Placed BELOW the stage by the caller, never over it: the same rule the
     * module's map legends follow, so a legend can never cover the data.
     *
     * @param {Object}   graph       a ForceGraph controller
     * @param {Array}    categories  [{ name }]
     * @param {Function} colorOf     categoryIndex → colour
     * @returns {{el: HTMLElement, recolour: Function}}
     */
    function buildLegend(graph, categories, colorOf) {
        var wrap = el('div', 'rv-kg-legend');
        var used = graph.categoriesInUse();
        var chips = [];

        categories.forEach(function (cat, i) {
            if (!used[i]) return;
            var chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'rv-kg-legend-chip';
            chip.setAttribute('aria-pressed', 'true');
            var swatch = el('span', 'rv-kg-legend-swatch');
            swatch.style.background = colorOf(i);
            chip.appendChild(swatch);
            chip.appendChild(el('span', null, cat.name));
            chip.addEventListener('click', function () {
                var on = chip.getAttribute('aria-pressed') !== 'true';
                chip.setAttribute('aria-pressed', String(on));
                chip.classList.toggle('rv-kg-legend-off', !on);
                graph.toggleCategory(i, on);
            });
            chips.push({ swatch: swatch, i: i });
            wrap.appendChild(chip);
        });

        return {
            el: wrap,
            recolour: function () {
                chips.forEach(function (c) { c.swatch.style.background = colorOf(c.i); });
            }
        };
    }

    /* ------------------------------------------------------------------ */
    /*  Edge-colour key                                                    */
    /* ------------------------------------------------------------------ */

    /**
     * A key for edges whose colour carries a relationship, as short coloured rules
     * rather than swatches — an edge is a line, so the key should look like one.
     *
     * @param {Array} rows [{ label, color }]
     * @returns {?HTMLElement} null when there is nothing to explain
     */
    function buildLineLegend(rows) {
        rows = (rows || []).filter(function (r) { return r && r.label; });
        if (!rows.length) return null;
        var wrap = el('div', 'rv-edge-legend');
        rows.forEach(function (r) {
            var row = el('span', 'rv-map-legend-row');
            var line = el('span', 'rv-map-legend-line');
            line.style.background = r.color;
            row.appendChild(line);
            row.appendChild(el('span', null, r.label));
            wrap.appendChild(row);
        });
        return wrap;
    }

    /* ------------------------------------------------------------------ */
    /*  Detail card                                                        */
    /* ------------------------------------------------------------------ */

    /**
     * The panel a selection opens, mounted INSIDE the stage so it travels with the
     * graph into fullscreen.
     *
     * This is what lets a click *select* rather than navigate: the obvious gesture
     * for "tell me more" keeps the graph, and the jump to the record lives here as
     * a real `<a>` — keyboard-reachable, long-pressable, openable in a new tab, and
     * identical on a finger, where there is no hover to read a node with.
     *
     * @param {Object} graph a ForceGraph controller
     * @param {Object} spec {
     *     typeLabel: node → string,      // the small-caps line above the title
     *     typeColor: node → colour,
     *     metaRows:  node → [string],    // one <li> each, falsy entries dropped
     *     url:       node → href|null,
     *     openLabel: string
     * }
     * @returns {{el: HTMLElement, show: Function}} `show` is the graph.onSelect hook
     */
    function buildDetailCard(graph, spec) {
        spec = spec || {};
        var card = el('div', 'rv-kg-card');
        card.hidden = true;

        var close = ns.iconButton(CLOSE_ICON, t('close', 'Close'), t('close', 'Close'));
        close.classList.add('rv-kg-card-close');
        close.addEventListener('click', function () { graph.select(null); });

        var title = el('h4', 'rv-kg-card-title');
        var type = el('p', 'rv-kg-card-type');
        var meta = el('ul', 'rv-kg-card-meta');
        var rels = el('p', 'rv-kg-card-rels');
        var link = el('a', 'rv-kg-card-link');

        card.appendChild(close);
        card.appendChild(title);
        card.appendChild(type);
        card.appendChild(meta);
        card.appendChild(rels);
        card.appendChild(link);

        function show(node) {
            if (!node) {
                card.hidden = true;
                return;
            }
            title.textContent = node.name;

            var typeText = spec.typeLabel ? spec.typeLabel(node) : '';
            type.textContent = typeText || '';
            type.hidden = !typeText;
            if (typeText && spec.typeColor) type.style.color = spec.typeColor(node);

            ns.setChildren(meta, (spec.metaRows ? spec.metaRows(node) : [])
                .filter(Boolean)
                .map(function (text) { return el('li', null, text); }));

            // Name the KINDS of connection this node participates in, so the reader
            // gets them without chasing each edge label. Generic: it reads the link
            // names the caller already put on the graph.
            var adj = graph.adjacency()[node.id] || {};
            var seen = {}, names = [];
            Object.keys(adj).forEach(function (other) {
                var name = adj[other] && adj[other].name;
                if (name && !seen[name]) { seen[name] = true; names.push(name); }
            });
            rels.textContent = names.length
                ? t('kgVia', 'Connected through') + ': ' + names.slice(0, 6).join(', ')
                    + (names.length > 6 ? '…' : '')
                : '';

            var href = spec.url ? spec.url(node) : null;
            if (href) {
                link.href = href;
                link.textContent = (spec.openLabel || t('kgOpenRecord', 'Open this record')) + ' →';
                link.hidden = false;
            } else {
                link.hidden = true;
                link.removeAttribute('href');
            }
            card.hidden = false;
        }

        return { el: card, show: show };
    }

    /* ------------------------------------------------------------------ */
    /*  Hint + mounting                                                    */
    /* ------------------------------------------------------------------ */

    /** The gesture hint that sits under a graph. */
    function buildHint(text) {
        return el('p', 'rv-kg-hint', text);
    }

    /**
     * Append chrome below a graph's stage, inside the enclosing .chart-panel.
     *
     * Idempotent: a previous group is removed first, so a rebuild (a light/dark
     * toggle, a re-render into the same panel) can never stack two legends — the
     * bug the map legends had to fix the same way.
     *
     * @param {HTMLElement} stage  the container the graph rendered into
     * @param {Array}       nodes  elements to append, in order; falsy entries skipped
     */
    function mountBelow(stage, nodes) {
        var panel = stage.closest('.chart-panel') || stage.parentNode || stage;
        var stale = panel.querySelector('.rv-graph-chrome');
        if (stale) stale.remove();
        var group = el('div', 'rv-graph-chrome');
        (nodes || []).forEach(function (node) { if (node) group.appendChild(node); });
        panel.appendChild(group);
        return group;
    }

    ns.graphChrome = {
        buildLegend: buildLegend,
        buildLineLegend: buildLineLegend,
        buildDetailCard: buildDetailCard,
        buildHint: buildHint,
        mountBelow: mountBelow
    };
})();
