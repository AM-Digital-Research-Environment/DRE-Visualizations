/**
 * Knowledge Graph controller — wires the four pieces together on an item page.
 *
 *   knowledge-graph-data.js  → the payload, the REST fallback, the IDF filters
 *   graph-force.js           → the reusable d3-force canvas renderer
 *   knowledge-graph-ui.js    → the toolbar, filter panel, legend, text alternative
 *   item-location-map.js     → the MapLibre panel below, when the item is placed
 *
 * This file owns only the sequence: lazy-mount → load → build → mount chrome. It
 * replaces the former ECharts `graph`/`force` series, which ran its layout to a
 * frozen state with no collision pass — nodes overlapped, only the centre carried
 * a label, and dragging one moved it through a static picture.
 *
 * The payload contract is unchanged, so no regeneration is needed.
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) { console.warn('DreVisualizations: dashboard-core.js must load before knowledge-graph.js'); return; }

    function t(key, fallback) { return ns.t(key, fallback); }

    /**
     * Categorical fill for a node's category index (re-read on a theme toggle).
     *
     * Resolved through the category's NAME, not its index: the precompute appends
     * categories in per-item discovery order, so index 1 is Person on one item and
     * Project on the next. `ns.entityColor` pins each entity type to one slot, so a
     * person is the same hue on every item page and on every other network.
     */
    function colorOfIn(categories) {
        return function (i) {
            var cat = categories[i];
            return ns.entityColor(cat ? cat.name : '');
        };
    }

    /**
     * Halo colour for a node's community, or null when it has none. The ring
     * palette is deliberately distinct from the categorical fills, so a node's
     * cluster reads independently of its entity type.
     */
    function haloOf(node) {
        var c = node.community;
        if (c === undefined || c === null || c < 0) return null;
        return ns.HALO[c % ns.HALO.length];
    }

    function showMessage(container, cls, text) {
        ns.setChildren(container, [ns.el('p', cls, text)]);
    }

    /* ------------------------------------------------------------------ */
    /*  Build                                                             */
    /* ------------------------------------------------------------------ */

    function build(container, data, siteBase, seed) {
        var kgData = ns.kgData;
        var kgUI = ns.kgUI;
        var categories = data.categories || [];
        var maxStrength = (data.stats || {}).maxStrength || 1;
        var colorOf = colorOfIn(categories);

        var graph = ns.ForceGraph.create(container, {
            nodes: kgData.toNodeSpecs(data.nodes, siteBase),
            categories: categories,
            seed: seed,
            colorOf: colorOf,
            haloOf: haloOf,
            forces: kgData.buildForces(maxStrength),
            tooltip: kgUI.tooltipRows(categories, colorOf),
            announce: kgUI.announcer(categories),
            ariaLabel: t('kgCanvasLabel', 'Knowledge graph. Use the arrow keys to move between '
                + 'connected entities and Enter to select one.')
            // No onActivate: a click selects rather than navigates. The link to the
            // record lives in the detail card, so leaving the page is always a
            // second, deliberate act — and works identically on a finger.
        });

        graph.setGraph({
            nodes: data.nodes,
            links: kgData.toLinkSpecs(data.edges, maxStrength)
        }, false);
        graph.resize();

        // The detail card lives INSIDE the stage so it follows the graph into
        // fullscreen; the click that selects a node is what reveals it.
        var card = kgUI.buildDetailCard(graph, categories, colorOf);
        container.appendChild(card.el);
        graph.onSelect(card.show);

        // Chrome below the stage: legend, gesture hint, text alternative. Below —
        // never over the canvas — the same rule the module's map legends follow.
        var panel = container.parentElement;
        var legend = kgUI.buildLegend(graph, categories, colorOf);
        if (panel) {
            panel.appendChild(legend.el);
            panel.appendChild(kgUI.buildHint());
            panel.appendChild(kgUI.buildListPanel(graph, categories));
        }
        graph.onTheme(legend.recolour);

        var block = container.closest('.knowledge-graph-block');
        if (block) {
            // The legend is not rebuilt on a filter change: filters only ever remove
            // nodes, so the chips built from the full graph stay a valid superset.
            kgUI.mountToolbar(block, graph, data, function (state) {
                var filtered = kgData.filterGraph(data.nodes, data.edges, state);
                graph.setGraph({
                    nodes: filtered.nodes,
                    links: kgData.toLinkSpecs(filtered.edges, maxStrength)
                }, true);
            });
        }

        // A located item also gets a map; MapLibre loads only in that case. It goes
        // in the disclosure panel with the rest of the chrome (fullscreen lays that
        // panel out as a column and hides the map, which is not what fullscreen is
        // for), and mount() is a no-op when the item has no coordinates.
        if (data.itemMap) {
            ns.itemLocationMap.mount(panel || container.parentElement, data.itemMap, siteBase);
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Init                                                              */
    /* ------------------------------------------------------------------ */

    function initKnowledgeGraph(container) {
        if (!container.dataset.itemId) return;
        var siteBase = container.dataset.siteBase || '';
        var seed = parseInt(container.dataset.itemId, 10) || 1;

        ns.kgData.load(container).then(function (data) {
            if (!data || !data.nodes || data.nodes.length < 2) {
                showMessage(container, 'rv-no-data', t('kgNoRelationships', 'No relationships found.'));
                return;
            }
            if (typeof d3 === 'undefined' || !d3.forceSimulation) {
                showMessage(container, 'rv-error', t('kgNoEngine', 'Graph library failed to load.'));
                return;
            }
            build(container, data, siteBase, seed);
        }).catch(function (err) {
            console.error('DreVisualizations:', err);
            showMessage(container, 'rv-error', t('kgLoadError', 'Failed to load knowledge graph.'));
        });
    }

    /**
     * Lazy-mount: the graph sits below the item metadata, so defer the d3-force
     * stack and the render until the block nears the viewport. Mirrors dashboard.js.
     * Note it asks for d3 ONLY — an item page whose one viz block is the graph never
     * downloads ECharts, and MapLibre follows later if the item has coordinates.
     */
    function mountWhenVisible(container) {
        var run = function () {
            (ns.ensureLibs ? ns.ensureLibs({ d3: true }) : Promise.resolve())
                .then(function () { initKnowledgeGraph(container); })
                .catch(function (err) {
                    console.error('DreVisualizations:', err);
                    showMessage(container, 'rv-error', t('kgNoEngine', 'Graph library failed to load.'));
                });
        };
        if (!('IntersectionObserver' in window)) { run(); return; }
        var io = new IntersectionObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) {
                if (entries[i].isIntersecting) { io.disconnect(); run(); break; }
            }
        }, { rootMargin: '600px 0px' });
        io.observe(container);
    }

    function init() {
        var cs = document.querySelectorAll('.knowledge-graph-container');
        for (var i = 0; i < cs.length; i++) mountWhenVisible(cs[i]);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
