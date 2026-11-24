/**
 * Gantt chart builder: project timelines with start/end date bars.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var initChart = ns.initChart, truncateLabel = ns.truncateLabel;

    ns.charts = ns.charts || {};

    ns.charts.buildGantt = function (el, data, siteBase) {
        if (!data || !data.length) return;
        var chart = initChart(el);
        var projects = data.slice().reverse();
        var names = projects.map(function (p) { return p.name; });
        var minYear = 9999, maxYear = 0;

        // The dates are calendar days ("2021-01-01"), which parse as UTC
        // midnight. Every reading below is in UTC too: in the visitor's own
        // zone, west of Greenwich, that midnight is still the previous day, and
        // a project starting in January read "Dec 2020" on a year-early axis.
        var barData = projects.map(function (p, i) {
            var start = new Date(p.start).getTime();
            var end = new Date(p.end).getTime();
            var sy = new Date(p.start).getUTCFullYear();
            var ey = new Date(p.end).getUTCFullYear();
            if (sy < minYear) minYear = sy;
            if (ey > maxYear) maxYear = ey;
            return {
                name: p.name, value: [i, start, end, p.itemId],
                itemStyle: { color: COLORS[i % COLORS.length], borderRadius: 3 }
            };
        });

        chart.setOption({
            // The time axis labels its ticks in UTC, like the bars.
            useUTC: true,
            tooltip: {
                confine: true,
                formatter: function (params) {
                    var v = params.value;
                    var dateOptions = { year: 'numeric', month: 'short', timeZone: 'UTC' };
                    var s = ns.formatDate(v[1], dateOptions);
                    var e = ns.formatDate(v[2], dateOptions);
                    return '<strong>' + echarts.format.encodeHTML(params.name) + '</strong><br/>' + s + ' \u2192 ' + e;
                }
            },
            aria: { enabled: true },
            // Sized to the real label width (ECharts 6 outer bounds), not a fixed 220px.
            grid: { left: 8, right: 30, top: 10, bottom: 30 },
            xAxis: {
                type: 'time',
                min: Date.UTC(minYear, 0, 1),
                max: Date.UTC(maxYear + 1, 0, 1),
                axisLabel: { fontSize: THEME.fontSize }
            },
            yAxis: {
                type: 'category', data: names,
                axisLabel: {
                    fontSize: THEME.fontSize, width: 200, overflow: 'truncate',
                    formatter: function (v) { return truncateLabel(v, 28); }
                }
            },
            series: [{
                type: 'custom',
                renderItem: function (params, api) {
                    var catIdx = api.value(0);
                    var start = api.coord([api.value(1), catIdx]);
                    var end = api.coord([api.value(2), catIdx]);
                    var height = api.size([0, 1])[1] * 0.6;
                    return {
                        type: 'rect', shape: { x: start[0], y: start[1] - height / 2, width: end[0] - start[0], height: height },
                        style: api.style()
                    };
                },
                encode: { x: [1, 2], y: 0 },
                data: barData
            }]
        });

        chart.on('click', function (p) {
            if (p.value && p.value[3] && siteBase && ns.confirmOpen(chart, p)) window.location.href = ns.itemUrl(siteBase, p.value[3]);
        });
        return chart;
    };
})();
