/**
 * Similarity scatter: one corpus's records at their place in the shared
 * semantic map (precomputed by the embeddings build, filtered per dashboard by
 * the generator). Expects `{groups: [name], points: [[id, x, y, group, faint, title]]}`.
 * Records with too little description are drawn faint and in a series of their
 * own: past largeThreshold ECharts ignores per-point styles. Registers into
 * window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;

    ns.charts = ns.charts || {};

    ns.charts.buildSemanticScatter = function (el, data, siteBase) {
        var groups = data && Array.isArray(data.groups) ? data.groups : [];
        var points = data && Array.isArray(data.points) ? data.points : [];
        if (!groups.length || points.length < 3) return;
        var chart = ns.initChart(el);

        var series = [];
        groups.forEach(function (name, index) {
            [false, true].forEach(function (faint) {
                var rows = points.filter(function (p) { return p[3] === index && !!p[4] === faint; });
                if (!rows.length) return;
                series.push({
                    name: name,
                    type: 'scatter',
                    large: true,
                    largeThreshold: 800,
                    symbolSize: 9,
                    itemStyle: { color: COLORS[index % COLORS.length], opacity: faint ? 0.2 : 0.78 },
                    emphasis: { focus: 'series', scale: 1.5 },
                    data: rows.map(function (p) {
                        return { value: [p[1], p[2]], _itemId: p[0], title: p[5], group: name };
                    })
                });
            });
        });

        chart.setOption({
            tooltip: {
                trigger: 'item',
                confine: true,
                formatter: function (params) {
                    var row = params.data || {};
                    return '<strong>' + echarts.format.encodeHTML(row.title || '') + '</strong><br>'
                        + echarts.format.encodeHTML(row.group || '');
                }
            },
            // Like the full Semantic Map: ECharts' generated label would list
            // every point; the panel description and data list carry the meaning.
            aria: { enabled: false },
            legend: {
                type: 'scroll', bottom: 0, left: 'center',
                textStyle: { color: THEME.text, fontFamily: THEME.fontFamily }
            },
            grid: { left: 12, right: 12, top: 12, bottom: 56 },
            xAxis: { type: 'value', show: false, scale: true },
            yAxis: { type: 'value', show: false, scale: true },
            dataZoom: [
                { type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'ctrl', moveOnMouseMove: true },
                { type: 'inside', yAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'ctrl', moveOnMouseMove: true }
            ],
            series: series
        });
        // The coordinates carry no units, so the table lists the records by
        // type instead of series/category/value rows of x | y pairs.
        chart.csvRows = function () {
            var rows = [[ns.t('semanticType', 'Resource type'), ns.t('title', 'Title'),
                ns.t('semanticLowSignalColumn', 'Lightly described')]];
            points.slice().sort(function (a, b) {
                return a[3] - b[3] || String(a[5] || '').localeCompare(String(b[5] || ''), ns.locale);
            }).forEach(function (p) {
                rows.push([groups[p[3]] || '', p[5] || '', p[4] ? ns.t('yes', 'Yes') : '']);
            });
            return rows;
        };
        chart.on('click', function (params) {
            if (params.data && params.data._itemId && siteBase) {
                window.location.href = ns.itemUrl(siteBase, params.data._itemId);
            }
        });
        return chart;
    };
})();
