/**
 * Dashboard core: the per-chart toolbar — save as image, download as CSV, and
 * the fill-pattern (decal) toggle every chart shares.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    /* ------------------------------------------------------------------ */
    /*  Fill patterns (decals)                                             */
    /* ------------------------------------------------------------------ */

    ns._decalEnabled = false;

    /** Toggle decal patterns on all tracked ECharts instances (skips charts flagged _noDecal). */
    ns.toggleDecals = function () {
        ns._decalEnabled = !ns._decalEnabled;
        ns.pruneCharts();
        ns._allCharts.forEach(function (c) {
            if (c._noDecal) return;
            c.setOption({ aria: { enabled: true, decal: { show: ns._decalEnabled } } });
        });
        // Update all toggle button states.
        document.querySelectorAll('[data-action="decal"]').forEach(function (btn) {
            btn.classList.toggle('rv-toolbar-btn-active', ns._decalEnabled);
            btn.title = ns._decalEnabled
                ? ns.t('hidePatterns', 'Hide the fill patterns')
                : ns.t('showPatterns', 'Tell the colours apart with fill patterns');
        });
    };

    /** Flatten the currently rendered ECharts series into an accessible table. */
    ns.chartCsvRows = function (chart) {
        if (!chart) return [];
        // A renderer that is not an ECharts instance (the d3-force canvas graphs)
        // has no `option` to walk, and its natural tabular form is not
        // series/category/value anyway — a network's is an edge list. Let it supply
        // its own rows.
        if (typeof chart.csvRows === 'function') return chart.csvRows();
        if (!chart.getOption) return [];
        var option = chart.getOption() || {};
        var xCategories = option.xAxis && option.xAxis[0] && option.xAxis[0].data || [];
        var yCategories = option.yAxis && option.yAxis[0] && option.yAxis[0].data || [];
        var categories = xCategories.length ? xCategories : yCategories;
        var rows = [[
            ns.t('series', 'Series'),
            ns.t('category', 'Category'),
            ns.t('value', 'Value')
        ]];
        (option.series || []).forEach(function (series) {
            (series.data || []).forEach(function (point, index) {
                var raw = point && typeof point === 'object' && !Array.isArray(point)
                    ? point.value : point;
                var name = point && typeof point === 'object' && !Array.isArray(point) && point.name != null
                    ? point.name : (categories[index] != null ? categories[index] : index + 1);
                var value = Array.isArray(raw) ? raw.join(' | ') : raw;
                if (value == null || typeof value === 'object') value = JSON.stringify(value == null ? '' : value);
                rows.push([series.name || series.type || '', name, value]);
            });
        });
        return rows;
    };

    /** Download the chart's tabular fallback as UTF-8 CSV. */
    ns.downloadChartCsv = function (chart, title) {
        var rows = ns.chartCsvRows(chart);
        if (rows.length < 2) return;
        var csvCell = function (value) {
            var text = String(value == null ? '' : value);
            return '"' + text.replace(/"/g, '""') + '"';
        };
        var csv = '\ufeff' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
        var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        var link = document.createElement('a');
        link.href = url;
        link.download = (title || 'chart').trim().replace(/[\\/:*?"<>|]+/g, '-') + '.csv';
        link.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    };

    /* ------------------------------------------------------------------ */
    /*  Data table — the non-canvas alternative                           */
    /* ------------------------------------------------------------------ */

    // A canvas chart is an image to a screen reader and opaque to Ctrl+F; an
    // aria-label summarises it but cannot carry its numbers. Every chart with
    // tabular data therefore gets a collapsed "Data table" disclosure under it,
    // built from the very rows the CSV download writes (ns.chartCsvRows), so the
    // table, the file and the picture can never disagree. Built on open, from
    // the live instance, so it follows a filter or a light/dark rebuild.
    var DATA_TABLE_ROWS = 500;

    /** A scrollable, focusable table of `rows` (header row first). */
    ns.buildDataTable = function (rows, caption) {
        var wrap = ns.el('div', 'rv-data-table-scroll');
        // A scrollable region must be reachable by keyboard and named.
        wrap.tabIndex = 0;
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', caption || ns.t('dataTable', 'Data table'));
        var table = ns.el('table', 'rv-data-table-grid');
        if (caption) table.appendChild(ns.el('caption', 'rv-sr-only', caption));
        var head = ns.el('thead');
        var headRow = ns.el('tr');
        (rows[0] || []).forEach(function (cell) {
            var th = ns.el('th', null, String(cell == null ? '' : cell));
            th.scope = 'col';
            headRow.appendChild(th);
        });
        head.appendChild(headRow);
        table.appendChild(head);
        var body = ns.el('tbody');
        rows.slice(1, DATA_TABLE_ROWS + 1).forEach(function (row) {
            var tr = ns.el('tr');
            row.forEach(function (cell) {
                var td = ns.el('td', typeof cell === 'number' ? 'rv-num' : null,
                    typeof cell === 'number' ? ns.formatNumber(cell) : String(cell == null ? '' : cell));
                tr.appendChild(td);
            });
            body.appendChild(tr);
        });
        table.appendChild(body);
        wrap.appendChild(table);
        if (rows.length - 1 > DATA_TABLE_ROWS) {
            var note = ns.el('p', 'rv-data-table-note', ns.fill(
                ns.t('dataTableTruncated', 'Showing the first {count} rows. Download data (CSV) for all of them.'),
                { count: ns.formatNumber(DATA_TABLE_ROWS) }));
            return ns.setChildren(ns.el('div'), [wrap, note]);
        }
        return wrap;
    };

    /**
     * Mount the collapsed "Data table" disclosure at the foot of `panel`.
     * `rowsFn` returns the current rows (header first); with fewer than two
     * there is nothing to tabulate and nothing is mounted.
     */
    ns.attachDataTable = function (panel, rowsFn, caption) {
        if (!panel || panel.querySelector('.rv-data-table')) return;
        if ((rowsFn() || []).length < 2) return;
        var details = ns.el('details', 'rv-data-table');
        var summary = ns.el('summary', 'rv-data-table-toggle', ns.t('dataTable', 'Data table'));
        details.appendChild(summary);
        details.addEventListener('toggle', function () {
            if (!details.open) return;
            ns.setChildren(details, [summary, ns.buildDataTable(rowsFn() || [], caption)]);
        });
        panel.appendChild(details);
    };

    /**
     * The `.rv-chart-heading` row a toolbar mounts into. Dashboards render it;
     * other surfaces (Compare, What's New, Network Explorer, the semantic map)
     * have a bare <h3>, which gets wrapped, or no heading, which gets a row.
     */
    function chartHeading(panel) {
        var heading = panel.querySelector('.rv-chart-heading');
        if (heading) return heading;
        heading = document.createElement('div');
        heading.className = 'rv-chart-heading';
        var title = panel.querySelector('h3');
        if (title && title.parentNode) {
            title.parentNode.insertBefore(heading, title);
            heading.appendChild(title);
        } else {
            panel.insertBefore(heading, panel.firstChild);
        }
        return heading;
    }

    /** One shared glyph (core/icons.js) as markup for the toolbar string below. */
    function icon(body) { return ns.iconSvg(body).outerHTML; }

    /** Attach HTML-level toolbar (image, CSV, and pattern controls). */
    ns.attachToolbar = function (panel, chart) {
        if (!panel || !chart || !chart.getDataURL) return;
        // A dashboard rebuild (light/dark switch) replaces the ECharts instance
        // in the same container; the buttons act on whichever one is live.
        var dom = typeof chart.getDom === 'function' ? chart.getDom() : null;
        var live = function () {
            var current = dom && window.echarts && echarts.getInstanceByDom(dom);
            return current && !current.isDisposed() ? current : chart;
        };
        var showDecal = !chart._noDecal;
        var decalTitle = ns._decalEnabled
            ? ns.t('hidePatterns', 'Hide the fill patterns')
            : ns.t('showPatterns', 'Tell the colours apart with fill patterns');
        var saveTitle = ns.t('saveImage', 'Save this chart as an image');
        var csvTitle = ns.t('downloadCsv', 'Download data (CSV)');
        var hasCsv = ns.chartCsvRows(chart).length > 1;
        var title = panel.querySelector('h3');
        var panelTitle = title ? (title.textContent || '').trim() : '';
        var toolbarLabel = ns.t('chartActions', 'Chart actions');
        var bar = document.createElement('div');
        bar.className = 'rv-chart-toolbar';
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', panelTitle ? toolbarLabel + ': ' + panelTitle : toolbarLabel);
        // eslint-disable-next-line no-unsanitized/property -- icon constants + escaped titles
        bar.innerHTML = (showDecal
            ? '<button type="button" class="rv-toolbar-btn' + (ns._decalEnabled ? ' rv-toolbar-btn-active' : '') + '" data-action="decal" title="' + ns.escapeHtml(decalTitle) + '" aria-label="' + ns.escapeHtml(decalTitle) + '">'
            + icon(ns.ICONS.patterns)
            + '</button>'
            : '')
            + '<button type="button" class="rv-toolbar-btn" data-action="save" title="' + ns.escapeHtml(saveTitle) + '" aria-label="' + ns.escapeHtml(saveTitle) + '">'
            + icon(ns.ICONS.save)
            + '</button>'
            + (hasCsv
                ? '<button type="button" class="rv-toolbar-btn" data-action="csv" title="' + ns.escapeHtml(csvTitle) + '" aria-label="' + ns.escapeHtml(csvTitle) + '">'
                + icon(ns.ICONS.csv) + '</button>'
                : '');
        chartHeading(panel).appendChild(bar);
        if (hasCsv && !chart._noDataTable) {
            ns.attachDataTable(panel, function () { return ns.chartCsvRows(live()); }, panelTitle);
        }
        bar.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var name = panelTitle || 'chart';
            if (btn.dataset.action === 'save') {
                var url = live().getDataURL({ pixelRatio: 2, backgroundColor: ns.exportBg() });
                var a = document.createElement('a');
                a.href = url;
                a.download = name.replace(/[\\/:*?"<>|]+/g, '-') + '.png';
                a.click();
            } else if (btn.dataset.action === 'csv') {
                ns.downloadChartCsv(live(), name);
            } else if (btn.dataset.action === 'decal') {
                ns.toggleDecals();
            }
        });
    };
})();
