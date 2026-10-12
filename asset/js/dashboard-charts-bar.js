/**
 * Bar chart builder: horizontal bars for ranked lists, twenty to a page.
 *
 * A list longer than a page gets a pager under the chart (first, previous,
 * "21–40 of 143", next, last). Every page shares the first page's value axis,
 * so a bar's length compares across pages. The CSV download and the data
 * table carry the whole list, not just the page on screen.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var initChart = ns.initChart, truncateLabel = ns.truncateLabel;
    var toEntries = ns.toEntries, addClickHandler = ns.addClickHandler;

    ns.charts = ns.charts || {};

    var PAGE_SIZE = 20;

    /** One pager button: an icon with a spoken name. */
    function pagerButton(icon, label, onClick) {
        var btn = ns.el('button', 'rv-toolbar-btn rv-bar-pager-btn');
        btn.type = 'button';
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.appendChild(ns.iconSvg(icon));
        btn.addEventListener('click', onClick);
        return btn;
    }

    ns.charts.buildBarChart = function (el, data, siteBase) {
        // Largest first; Array#sort is stable, so ties keep the precompute's
        // order (alphabetical).
        var all = toEntries(data).slice().sort(function (a, b) { return b.value - a.value; });
        if (!all.length) return;
        var chart = initChart(el);
        var pages = Math.ceil(all.length / PAGE_SIZE);
        var page = 0;
        var axisMax = all[0].value;
        var shown = [];

        function render() {
            // The category axis draws its first entry at the bottom.
            shown = all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).reverse();
            chart.setOption({
                tooltip: { trigger: 'axis', confine: true, axisPointer: { type: 'shadow' } },
                aria: { enabled: true },
                // ECharts 6 keeps axis labels inside the canvas by default (grid
                // outerBoundsMode), so the grid sizes itself to the real label width
                // instead of an estimate from the character count.
                grid: { left: 8, right: 20, top: 10, bottom: 20 },
                xAxis: { type: 'value', minInterval: 1, max: pages > 1 ? axisMax : null },
                yAxis: {
                    type: 'category', data: shown.map(function (e) { return e.name; }),
                    axisLabel: {
                        fontSize: THEME.fontSize, width: 200, overflow: 'truncate',
                        formatter: function (v) { return truncateLabel(v, THEME.labelMaxLen); }
                    }
                },
                series: [{
                    type: 'bar',
                    data: shown.map(function (e, i) {
                        return { value: e.value, itemId: e.itemId, itemStyle: { color: COLORS[i % COLORS.length], borderRadius: [0, 3, 3, 0] } };
                    }),
                    barMaxWidth: THEME.barMaxWidth
                }]
            });
        }

        render();
        addClickHandler(chart, function () { return shown; }, siteBase);
        // The whole list, for the CSV download and the data table (core/toolbar.js).
        chart.csvRows = function () {
            return [[ns.t('series', 'Series'), ns.t('category', 'Category'), ns.t('value', 'Value')]]
                .concat(all.map(function (e) { return ['bar', e.name, e.value]; }));
        };

        // A single page needs no pager, and keeps the dashboard's
        // dispose-and-rebuild on a light/dark switch.
        if (el._rvBarPager) {
            el._rvBarPager.remove();
            el._rvBarPager = null;
        }
        if (pages < 2 || !el.parentNode) return chart;

        // A light/dark switch re-renders the page in place (COLORS and THEME are
        // updated in place), so the pager and the reader's page survive it.
        chart._rvRebuild = render;

        var status = ns.el('span', 'rv-bar-pager-status');
        status.setAttribute('aria-live', 'polite');
        var first = pagerButton(ns.ICONS.chevronsLeft, ns.t('firstPage', 'First page'), function () { go(0); });
        var prev = pagerButton(ns.ICONS.chevronLeft, ns.t('previousPage', 'Previous page'), function () { go(page - 1); });
        var next = pagerButton(ns.ICONS.chevronRight, ns.t('nextPage', 'Next page'), function () { go(page + 1); });
        var last = pagerButton(ns.ICONS.chevronsRight, ns.t('lastPage', 'Last page'), function () { go(pages - 1); });
        var pager = ns.setChildren(ns.el('div', 'rv-bar-pager'), [first, prev, status, next, last]);
        pager.setAttribute('role', 'group');
        var panel = el.closest('.chart-panel');
        var title = panel && panel.querySelector('h3');
        var titleText = title ? (title.textContent || '').trim() : '';
        pager.setAttribute('aria-label', titleText
            ? ns.fill(ns.t('pagesOf', 'Pages: {title}'), { title: titleText })
            : ns.t('pages', 'Pages'));

        function sync() {
            status.textContent = ns.fill(ns.t('rangeOfTotal', '{from}–{to} of {total}'), {
                from: ns.formatNumber(page * PAGE_SIZE + 1),
                to: ns.formatNumber(Math.min((page + 1) * PAGE_SIZE, all.length)),
                total: ns.formatNumber(all.length)
            });
            first.disabled = prev.disabled = page === 0;
            next.disabled = last.disabled = page === pages - 1;
        }

        function go(target) {
            target = Math.max(0, Math.min(pages - 1, target));
            if (target === page || chart.isDisposed()) return;
            page = target;
            render();
            sync();
        }

        sync();
        el.parentNode.insertBefore(pager, el.nextSibling);
        el._rvBarPager = pager;
        return chart;
    };
})();
