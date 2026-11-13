/**
 * Treemap chart builder: hierarchical space-filling visualization.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 *
 * Data format: [{ name, value, children: [{ name, value }] }]
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME;
    var initChart = ns.initChart, truncateLabel = ns.truncateLabel;
    // The bare fallbacks only serve a stand-alone harness without dashboard-core.
    var formatNumber = function (n) { return ns.formatNumber ? ns.formatNumber(n) : String(n); };
    var t = function (key, english) { return ns.t ? ns.t(key, english) : english; };

    ns.charts = ns.charts || {};

    ns.charts.buildTreemap = function (el, data) {
        if (!data || !data.length) return;
        var chart = initChart(el);
        // Each top-level group gets an id so a click can re-root the map on
        // it, the way a breadcrumb step does.
        var groups = data.map(function (node, i) {
            var copy = { id: 'rv-treemap-' + i };
            Object.keys(node).forEach(function (key) { copy[key] = node[key]; });
            return copy;
        });
        var idByName = {};
        groups.forEach(function (node) {
            if (node.children && node.children.length) idByName[node.name] = node.id;
        });

        chart.setOption({
            tooltip: {
                confine: true,
                formatter: function (p) {
                    // treePathInfo[0] is the root ("All"), the breadcrumb's start.
                    var path = p.treePathInfo.slice(1).map(function (n) {
                        return echarts.format.encodeHTML(n.name || '');
                    }).filter(Boolean);
                    var count = Number(p.value || 0);
                    // ns.plural comes from dashboard-core; the bare fallback only
                    // serves a stand-alone harness (tests/js/html-safety.test.mjs).
                    var items = ns.plural ? ns.plural(count, 'item', 'item', 'items', true) : count + ' items';
                    return path.join(' \u203a ') + '<br/>' + echarts.format.encodeHTML(items);
                }
            },
            aria: { enabled: true },
            series: [{
                type: 'treemap',
                // The root's name heads the breadcrumb, the way back after a click.
                name: t('treemapAll', 'All'),
                data: groups,
                roam: false,
                // Clicks are handled below. ECharts' own 'zoomToNode' scales the
                // whole map instead, so a box at the edge stays half off-screen.
                nodeClick: false,
                top: 8,
                left: 0,
                right: 0,
                bottom: 36,
                breadcrumb: {
                    show: true,
                    bottom: 4,
                    itemStyle: { textStyle: { fontSize: THEME.fontSize } }
                },
                label: {
                    show: true,
                    fontSize: THEME.fontSize,
                    formatter: function (p) { return truncateLabel(p.name, 20) + '\n' + formatNumber(p.value); }
                },
                upperLabel: {
                    show: true,
                    height: 24,
                    fontSize: THEME.fontSize,
                    // The header strip is the parent's background, painted in
                    // the border colour (--surface), so it takes ink, not
                    // --surface: in that colour it was invisible.
                    color: THEME.heading,
                    fontWeight: 600,
                    formatter: function (p) { return truncateLabel(p.name, 30) + '  ' + formatNumber(p.value); }
                },
                // borderColor (cell gaps) comes from the theme (= --surface).
                itemStyle: {
                    borderWidth: 2,
                    gapWidth: 1
                },
                // levels[0] is ECharts' invisible root; the data's first level
                // (projects, content sources) is levels[1] and carries the
                // headers, its children the lighter shades.
                levels: [
                    {
                        itemStyle: { borderWidth: 0, gapWidth: 4 },
                        upperLabel: { show: false }
                    },
                    {
                        itemStyle: { borderWidth: 3, gapWidth: 2 },
                        upperLabel: { show: true }
                    },
                    {
                        itemStyle: { borderWidth: 1, gapWidth: 1 },
                        colorSaturation: [0.35, 0.6]
                    }
                ]
            }]
        });

        // A click on a group, or on any box inside it, fills the panel with
        // that group, so a small one (a few dozen podcast episodes beside
        // thousands of research items) can be read; the breadcrumb leads back.
        chart.on('click', function (p) {
            var top = p.treePathInfo && p.treePathInfo[1];
            var id = top && idByName[top.name];
            if (id) chart.dispatchAction({ type: 'treemapRootToNode', seriesIndex: 0, targetNodeId: id });
        });

        return chart;
    };
})();
