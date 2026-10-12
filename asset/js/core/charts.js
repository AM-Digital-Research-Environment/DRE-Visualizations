/**
 * Dashboard core: the lifecycle of every live visualisation — ECharts
 * instances, MapLibre maps (registered by ns.trackMap in maps.js) and custom
 * canvas renderers — from creation and resizing to re-theming and disposal,
 * plus the chart-level helpers builders share.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    ns._allCharts = [];   // tracked ECharts instances
    ns._allMaps = [];     // tracked MapLibre maps: { map, rebuild, el }
    ns._allRenderers = []; // tracked custom renderers: { el, redraw, dispose }

    /* ------------------------------------------------------------------ */
    /*  ECharts instances                                                  */
    /* ------------------------------------------------------------------ */

    /**
     * Init an ECharts instance using the current theme, tracking it for
     * re-theming and resizing. Every chart also gets:
     *   - `role="img"` and an accessible name from its panel heading (and
     *     description), unless the builder set its own — the canvas itself
     *     says nothing to a screen reader;
     *   - no animation when the reader prefers reduced motion (an option set
     *     here is a default the builder's own `animation` still overrides).
     */
    ns.initChart = function (el) {
        if (!ns._echartsTheme) ns.readTheme();
        var existing = window.echarts.getInstanceByDom && window.echarts.getInstanceByDom(el);
        if (existing) existing.dispose();
        var chart = echarts.init(el, ns._echartsTheme);
        ns._allCharts.push(chart);
        if (ns.prefersReducedMotion()) chart.setOption({ animation: false });
        var label = ns.labelChart(el);
        // ECharts writes its own generic aria-label ("This is a chart…") on the
        // container once a builder enables `aria`; a description replaces it.
        if (label) chart.setOption({ aria: { label: { description: label } } });
        ns.observeResize(el);
        return chart;
    };

    /**
     * Give a chart container an image role and a name from its panel heading
     * and description. Returns the name, or '' when the container already has
     * one (a builder that labels its own chart) or no heading to take it from.
     */
    ns.labelChart = function (el) {
        if (!el || !el.setAttribute || el.hasAttribute('aria-label')) return '';
        var panel = el.closest && el.closest('.chart-panel');
        var heading = panel && panel.querySelector('h3');
        var desc = panel && panel.querySelector('.chart-description');
        var name = heading ? (heading.textContent || '').trim() : '';
        if (!name) return '';
        var label = name + (desc && desc.textContent ? ': ' + desc.textContent.trim() : '');
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', label);
        return label;
    };

    // One ResizeObserver for every chart container: a chart resizes when ITS
    // box changes — grid reflow, a sidebar, fullscreen, a late web font — not
    // only on window resize. Callbacks are coalesced into one frame. MapLibre
    // maps track their own container (trackResize), so they are not observed.
    var _resizeObserver = null;
    var _resizeQueued = null;
    ns.observeResize = function (el) {
        if (typeof window.ResizeObserver !== 'function') return;
        if (!_resizeObserver) {
            _resizeObserver = new window.ResizeObserver(function (entries) {
                if (_resizeQueued) return;
                _resizeQueued = entries.map(function (entry) { return entry.target; });
                requestAnimationFrame(function () {
                    var targets = _resizeQueued || [];
                    _resizeQueued = null;
                    targets.forEach(function (target) {
                        var chart = window.echarts && echarts.getInstanceByDom(target);
                        if (chart && !chart.isDisposed()) {
                            try { chart.resize(); } catch (e) { /* detached */ }
                        } else {
                            _resizeObserver.unobserve(target);
                        }
                    });
                });
            });
        }
        _resizeObserver.observe(el);
    };

    /**
     * Run a chart builder and make its result rebuildable on a light/dark
     * switch. Builders bake palette and entity colours into their options, so
     * re-applying the old option in a new theme keeps stale colours; instead
     * ns.refresh() disposes the instance and runs `build` again. A builder that
     * sets its own `_rvRebuild` (same instance, extra DOM — the word cloud,
     * heatmap, boxplot) keeps it. Returns whatever `build` returns.
     */
    ns.buildChart = function (build) {
        var chart = build();
        if (chart && typeof chart.setOption === 'function' && typeof chart._rvRebuild !== 'function') {
            chart._rvRebuild = function () {
                if (!chart.isDisposed()) chart.dispose();
                ns.buildChart(build);
            };
        }
        return chart;
    };

    /**
     * Node diameters for a network chart: the circle's AREA follows the
     * node's `value`, scaled against the largest in the network, between `min`
     * and `max` px. The page's own entity (`isSelf`) is drawn at 45px.
     *
     * @returns {function(Object): number}
     */
    ns.networkNodeSize = function (nodes, min, max) {
        var top = nodes.reduce(function (m, nd) {
            return nd.isSelf ? m : Math.max(m, Number(nd.value) || 0);
        }, 0) || 1;
        return function (nd) {
            if (nd.isSelf) return 45;
            return Math.round(min + (max - min) * Math.sqrt(Math.max(0, Number(nd.value) || 0) / top));
        };
    };

    /** One d3-force settle: [x, y] per node, in the frame's proportions. */
    function settle(d3, nodes, edges, aspect, scale) {
        var byName = {};
        var sim = nodes.map(function (node) {
            var entry = { id: node.name, r: node.size * scale / 2 + 4 };
            if (node.fixed) { entry.fx = 0; entry.fy = 0; }
            byName[node.name] = entry;
            return entry;
        });
        var links = edges.filter(function (link) {
            return byName[link.source] && byName[link.target] && link.source !== link.target;
        }).map(function (link) { return { source: link.source, target: link.target }; });
        // The pull to the centre is weaker across than down, by the square of
        // the aspect, so the settled shape is about as wide as the frame.
        var pull = 0.08;
        var simulation = d3.forceSimulation(sim)
            .force('link', d3.forceLink(links).id(function (d) { return d.id; })
                .distance(function (link) { return link.source.r + link.target.r + 18; }).strength(0.6))
            .force('charge', d3.forceManyBody().strength(-40).distanceMax(220))
            .force('collide', d3.forceCollide(function (d) { return d.r; }).iterations(2))
            .force('x', d3.forceX(0).strength(pull / (aspect * aspect)))
            .force('y', d3.forceY(0).strength(pull))
            .stop();
        var ticks = Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay()));
        for (var i = 0; i < ticks; i++) simulation.tick();
        return sim.map(function (d) { return [d.x, d.y]; });
    }

    /**
     * How much ECharts will scale a settled network to draw it: a
     * `layout: 'none'` graph is fitted into 80% of the frame's limiting side,
     * its proportions kept.
     */
    function fitOf(positions, w, h) {
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        positions.forEach(function (p) {
            minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
            minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
        });
        return 0.8 * Math.min(w / Math.max(1, maxX - minX), h / Math.max(1, maxY - minY));
    }

    /**
     * Lay out an ECharts node-link chart before it is drawn, so the whole
     * network is in view. ECharts' own force layout spreads the nodes out in
     * pixels from the centre and never fits the result to the frame: a
     * project's handful of contributors happens to fit, but a collection-wide
     * network of 150 people runs far past every edge and opens zoomed in.
     *
     * Here d3-force settles the network into a compact shape with the frame's
     * proportions — nodes kept apart by their drawn size, unconnected groups
     * held together, `fixed` nodes (the page's own entity) at the centre — and
     * the chart draws it with `layout: 'none'`, which ECharts scales to the
     * frame on every resize and in fullscreen. Node sizes stay in px while the
     * layout scales, so when a network is too big for its frame (150 people
     * on a phone) the circles are drawn smaller and the network is settled
     * again, until it fits or the circles reach 40% of their size. A small
     * network is not blown up to fill the frame: the zoom keeps its links
     * within twice their settled length. d3-force seeds its own randomness,
     * so a network lays out the same on every load.
     *
     * Without d3 it returns null, and the caller keeps ECharts' force layout.
     *
     * @param {HTMLElement} el  the chart container
     * @param {Array<{name: string, size: number, fixed?: boolean}>} nodes
     *        `size` is the drawn diameter in px; names are unique
     * @param {Array<{source: string, target: string}>} links  by node name
     * @returns {{positions: Array<Array<number>>, scale: number, option: Object}|null}
     *        [x, y] per node in `nodes` order; `scale` multiplies every
     *        node's size; `option` goes into the graph series
     */
    ns.layoutNetwork = function (el, nodes, links) {
        var d3 = window.d3;
        if (!d3 || typeof d3.forceSimulation !== 'function' || !nodes.length) return null;
        var w = el.clientWidth || 600;
        var h = el.clientHeight || 350;
        var aspect = Math.min(3, Math.max(0.6, w / Math.max(1, h)));
        var scale = 1;
        var positions = null;
        var fit = 1;
        for (var pass = 0; pass < 3; pass++) {
            positions = settle(d3, nodes, links, aspect, scale);
            fit = fitOf(positions, w, h);
            if (fit >= 1 || scale <= 0.4 || pass === 2) break;
            scale = Math.max(0.4, scale * fit);
        }
        return { positions: positions, scale: scale, option: { layout: 'none', zoom: fit > 2 ? 2 / fit : 1 } };
    };

    /**
     * Track a renderer that owns its own canvas — neither an ECharts instance nor
     * a MapLibre map, so neither of the two lists above can re-theme it. The
     * knowledge graph is the one such surface: it paints nodes and edges itself,
     * and on a light/dark toggle it only needs a repaint with the freshly read
     * tokens (no re-layout — node positions must survive the toggle).
     *
     * `redraw` is a zero-arg closure invoked by ns.refresh() AFTER readTheme(), so
     * it sees the new ns.THEME / ns.COLORS / ns.HALO values. Entries whose element
     * has left the document are dropped instead of called.
     *
     * @param {HTMLElement} el      the container, used as the liveness check
     * @param {Function}    redraw  repaint with the current theme
     * @param {Function}   [dispose] release workers, observers and simulations
     *                               when ns.disposeWithin removes the element
     * @returns {Function} untrack — drop the entry without disposing it
     */
    ns.trackRenderer = function (el, redraw, dispose) {
        var entry = { el: el, redraw: redraw, dispose: dispose };
        ns._allRenderers.push(entry);
        return function () {
            ns._allRenderers = ns._allRenderers.filter(function (candidate) { return candidate !== entry; });
        };
    };

    /* ------------------------------------------------------------------ */
    /*  Disposal and re-theming                                            */
    /* ------------------------------------------------------------------ */

    /**
     * Dispose the charts, maps and renderers inside `root` — and any whose
     * element has left the document — BEFORE an owner replaces its DOM.
     */
    ns.disposeWithin = function (root) {
        function removed(el) { return !el || !el.isConnected || (root && (el === root || root.contains(el))); }
        ns._allCharts = ns._allCharts.filter(function (chart) {
            if (chart.isDisposed()) return false;
            if (!removed(chart.getDom())) return true;
            if (_resizeObserver) _resizeObserver.unobserve(chart.getDom());
            chart.dispose();
            return false;
        });
        ns._allMaps = ns._allMaps.filter(function (entry) {
            if (!removed(entry.el)) return true;
            try { entry.map.remove(); } catch (e) { /* already removed */ }
            return false;
        });
        ns._allRenderers = ns._allRenderers.filter(function (entry) {
            if (!removed(entry.el)) return true;
            if (entry.dispose) entry.dispose();
            return false;
        });
    };
    /** Drop (and dispose) every tracked visualisation that has left the document. */
    ns.pruneCharts = function () { ns.disposeWithin(null); };

    /**
     * Re-assert the ACTIVE theme's resolved style colours (tooltip, legend, base
     * text, axes) onto a chart. Necessary because getOption() pins the PREVIOUS
     * theme's resolved values, so re-applying that option (notMerge) would keep
     * e.g. a light tooltip / light axis labels on the dark theme. A final merge
     * setOption with the fresh theme styles overrides those stale pins — this is
     * what makes the hover tooltip and axes follow light / dark.
     */
    ns._reapplyThemeStyles = function (c) {
        var th = ns._echartsTheme, t = ns.THEME, opt = c.getOption();
        var axisStyle = {
            axisLabel: { color: t.textMuted },
            axisLine: { lineStyle: { color: t.grid } },
            axisTick: { lineStyle: { color: t.grid } }
        };
        var ov = {
            color: ns.COLORS,
            textStyle: { color: t.text },
            tooltip: th.tooltip,
            legend: th.legend,
            title: th.title
        };
        ['xAxis', 'yAxis', 'radiusAxis', 'angleAxis', 'singleAxis', 'parallelAxis'].forEach(function (k) {
            if (opt[k] && opt[k].length) ov[k] = opt[k].map(function () { return axisStyle; });
        });
        c.setOption(ov);
    };

    /**
     * Re-apply the active theme to every live chart and map. Triggered when the
     * DRE theme toggles between light and dark (or the system preference does).
     */
    ns.refresh = function () {
        ns.readTheme();
        ns.pruneCharts();

        // ECharts 6: switch the instance theme live, then re-assert the resolved
        // theme styles. Graph-type charts re-apply their structural (per-node /
        // edge) colours via _rvRebuild; the rest get their option re-applied with
        // notMerge (setTheme's documented caveat after merge-mode setOptions).
        // _reapplyThemeStyles then overrides the stale colours getOption() pinned.
        ns._allCharts.forEach(function (c) {
            try {
                c.setTheme(ns._echartsTheme);
                if (typeof c._rvRebuild === 'function') {
                    c._rvRebuild();
                    // A dashboard rebuild disposes this instance and builds a
                    // fresh one from the data, already in the new theme.
                    if (c.isDisposed()) return;
                } else {
                    c.setOption(c.getOption(), { notMerge: true });
                }
                ns._reapplyThemeStyles(c);
            } catch (e) { /* keep going */ }
        });

        // MapLibre: rebuild each map so it picks up the new basemap + colours.
        var maps = ns._allMaps.slice();
        ns._allMaps = [];
        maps.forEach(function (entry) {
            try { if (entry.map && entry.map.remove) entry.map.remove(); } catch (e) { /* noop */ }
            try { if (typeof entry.rebuild === 'function') entry.rebuild(); } catch (e) { /* noop */ }
        });

        // Custom canvas renderers (the knowledge graph): repaint in place, so the
        // simulation's node positions survive the toggle. Drop detached entries.
        ns._allRenderers = ns._allRenderers.filter(function (entry) {
            return entry.el && entry.el.isConnected;
        });
        ns._allRenderers.forEach(function (entry) {
            try { entry.redraw(); } catch (e) { /* keep going */ }
        });
    };

    /* ------------------------------------------------------------------ */
    /*  Builder helpers                                                    */
    /* ------------------------------------------------------------------ */

    /** Build a dataZoom config (slider + scroll) for timeline-type charts. */
    ns.buildDataZoom = function (count) {
        if (count <= 15) return [];
        return [
            { type: 'slider', start: 0, end: 100, bottom: 8, height: 22 },
            { type: 'inside' }
        ];
    };

    /**
     * Add click-to-navigate and pointer cursor on chart elements. Builders put
     * `itemId` on each series data item, which identifies the clicked datum even
     * when two share a name; `entries` (an array, or a function returning the
     * current one) is only the fallback lookup by name.
     */
    ns.addClickHandler = function (chart, entries, siteBase) {
        if (!siteBase) return;
        chart.on('click', function (params) {
            var id = params.data && typeof params.data === 'object' ? params.data.itemId : null;
            if (id == null) {
                var list = typeof entries === 'function' ? entries() : entries;
                var entry = (list || []).find(function (e) { return e.name === params.name; });
                id = entry && entry.itemId;
            }
            if (id != null && id !== '') {
                window.location.href = ns.itemUrl(siteBase, id);
            }
        });
        chart.getZr().on('mousemove', function (e) {
            chart.getZr().setCursorStyle(e.target ? 'pointer' : 'default');
        });
    };
})();
