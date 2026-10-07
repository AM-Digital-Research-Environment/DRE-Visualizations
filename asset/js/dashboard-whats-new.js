/**
 * What's New controller: recent additions + most-active projects, with a
 * 3/6/12-month window selector. Loads item-dashboards/whats-new.json.
 *
 * Depends on: dashboard-core.js, dashboard-registry.js (CHART_MAP.topProjects).
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) return;

    var escapeHtml = ns.escapeHtml;

    function render(container, data, siteBase) {
        container.innerHTML = '';
        var windows = data.windows;
        var active = windows[0];

        var header = document.createElement('div');
        header.className = 'dashboard-header';
        header.innerHTML = '<h2>' + escapeHtml(ns.t('whatsNewTitle', "What's new")) + '</h2>'
            + '<span class="dashboard-total">'
            + escapeHtml(ns.fill(ns.t('whatsNewUpTo', 'up to {date}'), { date: data.reference })) + '</span>';
        container.appendChild(header);

        var sw = document.createElement('div');
        sw.className = 'compare-type-switcher whats-new-windows';
        windows.forEach(function (w) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rv-btn whats-new-window-btn' + (w === active ? ' rv-btn-active' : '');
            btn.textContent = ns.t('whatsNewLast', 'Last') + ' ' + ns.plural(w.months, 'month', 'month', 'months', true);
            btn.addEventListener('click', function () {
                active = w;
                Array.prototype.forEach.call(sw.children, function (b, i) {
                    b.classList.toggle('rv-btn-active', windows[i] === active);
                });
                renderBody();
            });
            sw.appendChild(btn);
        });
        container.appendChild(sw);

        var body = document.createElement('div');
        body.className = 'whats-new-body';
        container.appendChild(body);

        function renderBody() {
            body.innerHTML = '';

            if (active.topProjects && active.topProjects.length) {
                var panel = document.createElement('div');
                panel.className = 'chart-panel chart-panel-wide';
                panel.appendChild(ns.el('h3', '', ns.t('whatsNewTopProjects', 'Projects that added the most')));
                var el = document.createElement('div');
                el.className = 'chart-container';
                panel.appendChild(el);
                body.appendChild(panel);
                if (ns.CHART_MAP && ns.CHART_MAP.topProjects) {
                    var projects = active.topProjects;
                    var chart = ns.buildChart(function () { return ns.CHART_MAP.topProjects(el, projects, siteBase); });
                    if (chart) ns.attachToolbar(panel, chart);
                }
            }

            var heading = document.createElement('h3');
            heading.className = 'whats-new-heading';
            heading.textContent = ns.plural(active.count, 'newItem', 'new item', 'new items', true);
            body.appendChild(heading);

            var grid = document.createElement('div');
            grid.className = 'whats-new-grid';
            (active.items || []).forEach(function (it) {
                var card = document.createElement('a');
                card.className = 'whats-new-card';
                card.href = ns.itemUrl(siteBase, it.id);
                card.innerHTML = '<span class="whats-new-card-title">' + escapeHtml(it.title) + '</span>'
                    + '<span class="whats-new-card-date">' + escapeHtml(it.created) + '</span>';
                grid.appendChild(card);
            });
            if (!grid.children.length) {
                grid.innerHTML = '<div class="rv-no-data">'
                    + escapeHtml(ns.t('whatsNewEmptyPeriod', 'Nothing was added in this period.')) + '</div>';
            }
            body.appendChild(grid);
        }

        renderBody();
    }

    function initWhatsNew(container) {
        var basePath = container.dataset.basePath || '';
        var siteBase = container.dataset.siteBase || '';
        ns.basePath = basePath;
        Promise.all([
            ns.fetchDataJson('item-dashboards/whats-new.json'),
            // Wait for ECharts rather than leaving the spinner up if it is
            // still loading or failed to load.
            ns.ensureLibs ? ns.ensureLibs({ echarts: true }) : Promise.resolve()
        ]).then(function (values) {
            var data = values[0];
            if (!data || !data.windows || !data.windows.length) {
                ns.setChildren(container, [ns.el('div', 'rv-no-data', ns.t('whatsNewNone', 'Nothing has been added recently.'))]);
                return;
            }
            render(container, data, siteBase);
        }).catch(function () {
            ns.setChildren(container, [ns.el('div', 'rv-error', ns.t('whatsNewLoadError', 'Recent additions could not be loaded. Please try again.'))]);
        });
    }

    function init() {
        var cs = document.querySelectorAll('.whats-new-container');
        for (var i = 0; i < cs.length; i++) initWhatsNew(cs[i]);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
