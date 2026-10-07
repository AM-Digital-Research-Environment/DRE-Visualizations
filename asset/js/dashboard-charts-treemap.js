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

    ns.charts = ns.charts || {};

    ns.charts.buildTreemap = function (el, data) {
        if (!data || !data.length) return;
        var chart = initChart(el);

        chart.setOption({
            tooltip: {
                confine: true,
                formatter: function (p) {
                    var path = p.treePathInfo.map(function (n) {
                        return echarts.format.encodeHTML(n.name || '');
                    }).filter(Boolean);
                    var count = Number(p.value || 0);
                    // ns.plural comes from dashboard-core; the bare fallback only
                    // serves a stand-alone harness (scripts/check-html-safety.mjs).
                    var items = ns.plural ? ns.plural(count, 'item', 'item', 'items', true) : count + ' items';
                    return path.join(' \u203a ') + '<br/>' + echarts.format.encodeHTML(items);
                }
            },
            aria: { enabled: true },
            series: [{
                type: 'treemap',
                data: data,
                roam: false,
                nodeClick: false,
                breadcrumb: {
                    show: true,
                    bottom: 5,
                    itemStyle: { textStyle: { fontSize: THEME.fontSize } }
                },
                label: {
                    show: true,
                    fontSize: THEME.fontSize,
                    formatter: function (p) { return truncateLabel(p.name, 20); }
                },
                upperLabel: {
                    show: true,
                    height: 22,
                    fontSize: THEME.fontSize,
                    color: THEME.border,
                    formatter: function (p) { return truncateLabel(p.name, 30); }
                },
                // borderColor (cell gaps) comes from the theme (= --surface).
                itemStyle: {
                    borderWidth: 2,
                    gapWidth: 1
                },
                levels: [
                    {
                        itemStyle: { borderWidth: 3, gapWidth: 3 },
                        upperLabel: { show: true }
                    },
                    {
                        itemStyle: { borderWidth: 1, gapWidth: 1 },
                        colorSaturation: [0.35, 0.6]
                    }
                ]
            }]
        });

        return chart;
    };
})();
