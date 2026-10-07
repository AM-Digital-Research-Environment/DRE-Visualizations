/**
 * Sibling-items sparkline: on a research item that belongs to a project, render
 * the project's items-per-year as a compact line with the current item's year
 * marked. Reads the item's year and parent projects from its precomputed
 * `item-contexts` artifact, then reuses the project's dashboard `timeline`.
 * Stays hidden when not applicable (no parent project with a multi-year
 * dashboard).
 *
 * Depends on: dashboard-core.js (window.RV: THEME, COLORS, initChart).
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) return;
    var THEME = ns.THEME, initChart = ns.initChart;

    function render(container, block, timeline, itemYear, projectName, siteBase, projectId) {
        var years = Object.keys(timeline).sort();
        block.hidden = false;
        var text = (projectName || ns.t('thisProject', 'This project')) + ': '
            + ns.t('itemsPerYear', 'items per year');
        var heading = ns.el('h2');
        // A real link, so the project is reachable from the keyboard too.
        if (siteBase && projectId) {
            var link = ns.el('a', 'sibling-sparkline-link', text);
            link.href = ns.itemUrl(siteBase, projectId);
            heading.appendChild(link);
        } else {
            heading.textContent = text;
        }
        var head = ns.el('div', 'sibling-sparkline-head');
        head.appendChild(heading);
        var el = ns.el('div', 'sibling-sparkline-chart');
        ns.setChildren(container, [head, el]);

        var chart = initChart(el);
        var data = years.map(function (y) { return timeline[y]; });
        var markData = (itemYear && timeline[itemYear] !== undefined)
            ? [{ xAxis: String(itemYear), yAxis: timeline[itemYear] }] : [];

        chart.setOption({
            tooltip: { trigger: 'axis', confine: true },
            grid: { left: 38, right: 16, top: 16, bottom: 26 },
            xAxis: {
                type: 'category', data: years, boundaryGap: false,
                axisLabel: { color: THEME.textMuted, fontSize: THEME.fontSize },
                axisLine: { lineStyle: { color: THEME.grid } }
            },
            yAxis: {
                type: 'value', minInterval: 1,
                axisLabel: { color: THEME.textMuted, fontSize: THEME.fontSize },
                splitLine: { lineStyle: { color: THEME.gridLight } }
            },
            series: [{
                type: 'line', data: data, smooth: true, showSymbol: true, symbolSize: 5,
                lineStyle: { color: THEME.accent, width: 2 },
                itemStyle: { color: THEME.accent },
                areaStyle: { color: THEME.accent, opacity: 0.12 },
                markPoint: markData.length ? {
                    symbolSize: 44, symbol: 'pin',
                    itemStyle: { color: ns.COLORS[1] },
                    data: markData,
                    // Dark label: the pin is always a light amber (COLORS[1]) in
                    // both themes, so the theme's ink-on-pastel reads far better
                    // than white.
                    label: { formatter: ns.t('thisItem', 'this'), color: ns.cssColor('--ink-on-pastel', '#332619'), fontSize: THEME.fontSize - 2 }
                } : undefined
            }]
        });
        return chart;
    }

    function initSparkline(container) {
        var block = container.closest('.sibling-sparkline-block');
        if (!block) return;
        var itemId = container.dataset.itemId;
        var basePath = container.dataset.basePath || '';
        var siteBase = container.dataset.siteBase || '';
        if (!itemId) return;
        ns.basePath = basePath;

        ns.fetchDataJson('item-contexts/' + encodeURIComponent(itemId) + '.json').then(function (item) {
            var iYear = item.year;
            var parents = item.parents || [];
            if (!parents.length) return;

            (function tryNext(i) {
                if (i >= parents.length) return;
                var p = parents[i];
                ns.fetchDataJson('item-dashboards/' + encodeURIComponent(p.id) + '.json').then(function (dash) {
                    var tl = dash && dash.timeline;
                    if (tl && Object.keys(tl).length > 1) {
                        // Applicable: pull ECharts on demand, then render. Items
                        // without a matching multi-year project never load it.
                        (ns.ensureLibs ? ns.ensureLibs({ echarts: true }) : Promise.resolve()).then(function () {
                            render(container, block, tl, iYear, p.name, siteBase, p.id);
                        }).catch(function () {});
                    } else {
                        tryNext(i + 1);
                    }
                }).catch(function () { tryNext(i + 1); });
            })(0);
        }).catch(function () { /* leave the block hidden */ });
    }

    function init() {
        // ECharts is loaded on demand inside the render path (ns.ensureLibs), so
        // the applicability fetch below runs without pulling the heavy library.
        var cs = document.querySelectorAll('.sibling-sparkline-container');
        for (var i = 0; i < cs.length; i++) initSparkline(cs[i]);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
