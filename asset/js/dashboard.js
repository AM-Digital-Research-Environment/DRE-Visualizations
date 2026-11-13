/**
 * Dashboard orchestrator.
 *
 * Reads chart builders, layouts, labels, and descriptions from
 * the window.RV namespace (populated by the modular JS files)
 * and renders every async dashboard (.dashboard-async-container), its
 * loading, empty, error and partial states through the shared ns.asyncState.
 *
 * Load order (the `dashboard` plan in config/asset-plans.json): the core, then
 * the generated chart bundle (layouts, every chart builder and the registry,
 * concatenated from its `chartSources`), then this orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) return;
    var escapeHtml = ns.escapeHtml;

    /* ------------------------------------------------------------------ */
    /*  Render dashboard                                                   */
    /* ------------------------------------------------------------------ */

    /**
     * What a dashboard will draw: its layout, the chart keys that carry data (in
     * render order), and whether it is a single-chart embed. Shared by the
     * renderer and by library selection (ns.chartLibraries), so a library is
     * only fetched for a chart that is actually drawn.
     */
    function planDashboard(data, host) {
        // A block template may pin a specific layout via `data-layout` (e.g. the
        // curated "Collection Overview" sets data-layout="collectionOverview" so
        // it renders a trimmed subset of the same JSON the full "Collection
        // Dashboard" shows). Otherwise fall back to the data's own resourceType.
        var dataset = (host && host.dataset) || {};
        var layoutKey = dataset.layout || data.resourceType;
        var layout = (ns.LAYOUTS && ns.LAYOUTS[layoutKey]) || ns.DEFAULT_LAYOUT;
        // Single-visualization embed: the bare /dre-embed/<block>/<viz> route pins
        // one chart via data-chart-only. Render just that chart — full-bleed, and
        // with no stat cards, dashboard header, or collapsible accordion.
        var chartOnly = dataset.chartOnly || '';
        var keys = (chartOnly ? [chartOnly] : layout.order).filter(function (key) {
            var d = data[key];
            var hasData = Array.isArray(d) ? d.length > 0 : !!(d && Object.keys(d).length > 0);
            // The geographic map ('locations') also renders a current-location
            // overlay, so keep its panel when only current locations are present
            // (an item held somewhere with no recorded origin).
            if (key === 'locations' && !hasData && data.currentLocations && data.currentLocations.length) {
                hasData = true;
            }
            // Skip basic timeline when stacked timeline is available (redundant) —
            // unless a single-chart embed explicitly asked for the basic timeline.
            if (hasData && !chartOnly && key === 'timeline' && data.stackedTimeline
                && data.stackedTimeline.years && data.stackedTimeline.years.length > 0) return false;
            return hasData;
        });
        // Every chart that may be drawn, a tab switch included (library
        // selection needs them all), before the tab groups fold into one panel.
        var chartKeys = keys.slice();
        var tabs = {};
        if (!chartOnly) {
            (layout.tabs || []).forEach(function (group) {
                var members = group.keys.filter(function (key) { return keys.indexOf(key) >= 0; });
                if (members.length < 2) return;
                tabs[members[0]] = { label: group.label, keys: members };
                keys = keys.filter(function (key) { return members.indexOf(key) <= 0; });
            });
        }
        return { layoutKey: layoutKey, layout: layout, chartOnly: chartOnly, keys: keys,
            chartKeys: chartKeys, tabs: tabs, wide: packWidths(keys, layout, chartOnly, tabs) };
    }

    /**
     * Which of the drawn charts span both grid columns. A layout pairs its
     * half-width charts on paper, but charts without data drop out per record,
     * and a half-width chart whose partner dropped out (or that sits between two
     * wide ones) would leave an empty half row. Each run of consecutive
     * half-width charts is closed off in pairs; an odd one out, the run's last,
     * widens to fill its row. A tabbed panel is always wide: its switch and its
     * longest list need the room.
     */
    function packWidths(keys, layout, chartOnly, tabs) {
        var wide = {};
        var run = [];
        function closeRun() {
            if (run.length % 2) wide[run[run.length - 1]] = true;
            run = [];
        }
        keys.forEach(function (key) {
            if (chartOnly || layout.wide.indexOf(key) >= 0 || (tabs && tabs[key])) {
                closeRun();
                wide[key] = true;
            } else {
                run.push(key);
            }
        });
        closeRun();
        return wide;
    }

    /**
     * The builder for one chart: a per-dashboard override (`builders`, e.g. the
     * Publications page renders Languages as a pie instead of the registry's
     * bar), else the registry default.
     */
    function builderFor(data, key) {
        var name = (data.builders || {})[key];
        return (name && ns.charts && ns.charts[name]) || (ns.CHART_MAP && ns.CHART_MAP[key]) || null;
    }

    ns.planDashboard = planDashboard;
    ns.builderFor = builderFor;

    /**
     * Opening lines of a research project's dashboard: what the charts draw on,
     * the project's own collections (item sets, from the precompute's
     * `collections`; their pages redirect to the project, so they are not
     * linked) and, on the project item page, a link to the same project in the
     * Project explorer (data-explorer-url, stamped only when the site has a page
     * with that block). Every other resource type gets nothing.
     */
    function projectIntro(data, host) {
        if (!data || data.resourceType !== 'project') return '';
        var esc = ns.escapeHtml;
        var records = function (count) { return ns.plural(count, 'projectRecord', 'record', 'records', true); };
        var fill = ns.fill;
        var html = '';
        var total = Number(data.totalItems) || 0;
        if (total) {
            html += '<p>' + esc(fill(ns.t('projectIntro', 'These charts draw on the {records} of this research project.'),
                { records: records(total) })) + '</p>';
        }
        var collections = Array.isArray(data.collections) ? data.collections : [];
        collections.forEach(function (collection) {
            if (!collection || !collection.title) return;
            html += '<p class="rv-project-collection">' + esc(fill(ns.t('projectCollection', 'Collection: {title} ({records})'),
                { title: collection.title, records: records(Number(collection.items) || 0) })) + '</p>';
        });
        // The Project explorer compares records, so a project without any is
        // not in it.
        var explorerUrl = total && host && host.dataset ? host.dataset.explorerUrl : '';
        if (explorerUrl && /^(\/|https?:\/\/)/.test(explorerUrl)) {
            html += '<p><a href="' + esc(explorerUrl) + '">'
                + esc(ns.t('projectExplorerLink', 'Compare it with other projects in the Project explorer'))
                + '</a></p>';
        }
        return html ? '<div class="rv-dashboard-intro">' + html + '</div>' : '';
    }

    ns.projectIntro = projectIntro;

    // Panels past the first few are built as they approach the viewport: a
    // section dashboard holds ~20 ECharts instances and several WebGL maps, and
    // building them all in one task blocks the page for hundreds of milliseconds.
    var EAGER_PANELS = 4;

    function renderDashboard(container, data, siteBase, collapsible, host) {
        if (ns.disposeWithin) ns.disposeWithin(container);
        if (container._rvPanelObserver) {
            container._rvPanelObserver.disconnect();
            container._rvPanelObserver = null;
        }
        // The host owns configuration; the inner content owns replaceable markup.
        host = host || container;
        var plan = planDashboard(data, host);
        var layout = plan.layout;
        var chartOnly = plan.chartOnly;
        if (chartOnly) collapsible = false;

        // Optional per-dashboard overrides over the shared registry: retitle a
        // chart (`labels`) or reword its subheader (`descriptions`). Absent on
        // every other dashboard, so they all keep the registry defaults.
        var labelOverrides = data.labels || {};
        var descOverrides = data.descriptions || {};

        // Summary stat cards. The home "Collection Overview" layout OMITS them: the
        // DRE theme's home banner renders the same stat set (read from this very
        // precompute), so drawing them here too would duplicate the cards on the
        // home page. Every other dashboard that carries a `stats` array — the full
        // Collection Dashboard, Publications, YouTube — keeps its cards.
        var statsHtml = (!chartOnly && ns.renderStatCards && data.stats && plan.layoutKey !== 'collectionOverview')
            ? ns.renderStatCards(data.stats) : '';
        // A project dashboard opens with what it covers (projectIntro).
        var introHtml = chartOnly ? '' : projectIntro(data, host);

        // Header title. Defaults to "Visualisations" (Publications, YouTube,
        // Collection Dashboard, item-page dashboards) unless the block template
        // pins its own via `data-title` — the curated "Collection Overview"
        // names itself "Collection overview" so its heading matches the block.
        var headTitle = (host && host.dataset && host.dataset.title) || ns.t('visualisations', 'Visualisations');
        var headInner = '<h2>' + escapeHtml(headTitle) + '</h2>';

        // The registry's translated title/description, unless the dashboard
        // overrides them; the raw tables only when dashboard-registry.js has
        // not loaded.
        function labelFor(key) {
            return labelOverrides[key] || (ns.chartLabel ? ns.chartLabel(key)
                : ((ns.CHART_LABELS && ns.CHART_LABELS[key]) || key));
        }
        function descriptionFor(key) {
            return Object.prototype.hasOwnProperty.call(descOverrides, key)
                ? descOverrides[key]
                : (ns.chartDescription ? ns.chartDescription(key)
                    : ((ns.CHART_DESCRIPTIONS && ns.CHART_DESCRIPTIONS[key]) || ''));
        }

        /**
         * The switch of a tabbed panel: one toggle button per chart, named with
         * its entry count ("Journals (285)") so the reader sees the size of each
         * list before opening it. The first is pressed.
         */
        function tabsHtml(group) {
            var title = labelFor(group.label);
            return '<div class="rv-chart-tabs" role="group" aria-label="' + escapeHtml(title) + '">'
                + group.keys.map(function (key, index) {
                    var name = ns.fill(ns.t('chartTabCount', '{label} ({count})'), {
                        label: labelFor(key),
                        count: ns.formatNumber(ns.toEntries(data[key]).length)
                    });
                    return '<button type="button" class="rv-chart-tab" data-tab="' + escapeHtml(key)
                        + '" aria-pressed="' + (index === 0) + '">' + escapeHtml(name) + '</button>';
                }).join('')
                + '</div>';
        }

        var chartsHtml = '<div class="dashboard-charts' + (chartOnly ? ' dashboard-charts--single' : '') + '">';
        plan.keys.forEach(function (key) {
            // A single-chart embed fills the frame: always full-width and tall.
            var wide = plan.wide[key] ? ' chart-panel-wide' : '';
            var tall = (chartOnly || layout.tall.indexOf(key) >= 0) ? ' chart-container-tall' : '';
            var group = plan.tabs[key];
            var label = group ? labelFor(group.label) : labelFor(key);
            var desc = descriptionFor(key);
            chartsHtml += '<div class="chart-panel' + wide + (group ? ' rv-chart-panel-tabbed' : '') + '">'
                + '<div class="rv-chart-heading"><h3>' + escapeHtml(label) + '</h3></div>'
                + (group ? tabsHtml(group) : '')
                // A tabbed panel keeps the paragraph, empty or not, for the next tab.
                + (desc || group ? '<p class="chart-description"' + (desc ? '' : ' hidden') + '>' + escapeHtml(desc) + '</p>' : '')
                + '<div class="chart-container' + tall + '" data-chart="' + escapeHtml(key) + '"></div>'
                + '</div>';
        });
        chartsHtml += '</div>';

        // The async dashboards (Collection Overview, Publications, item-page
        // Visualisations) wrap their header + charts in a collapsible disclosure
        // that matches the DRE theme's "Linked resources" accordion. The shared
        // render path (inline mode, Project Explorer) leaves `collapsible`
        // undefined and keeps the flat layout it has always used.
        if (collapsible) {
            // eslint-disable-next-line no-unsanitized/property -- escaped heading, labels and descriptions
            container.innerHTML = '<details class="rv-collapsible" open>'
                + '<summary class="rv-collapsible__head">'
                + headInner
                + '<span class="rv-collapsible__chevron" aria-hidden="true"></span>'
                + '</summary>'
                + '<div class="rv-collapsible__panel">'
                + introHtml
                + statsHtml
                + chartsHtml
                + '</div>'
                + '</details>';
        } else {
            // eslint-disable-next-line no-unsanitized/property -- escaped heading, labels and descriptions
            container.innerHTML = statsHtml
                + (chartOnly ? '' : '<div class="dashboard-header">' + headInner + '</div>')
                + introHtml
                + chartsHtml;
        }

        var failures = 0;
        var settled = false; // once true, a failure is reported to the host directly
        function fail(el, key, error) {
            failures++;
            el.textContent = ns.t('visualizationLoadError', 'The visualisation could not be loaded.');
            el.classList.add('rv-chart-error');
            console.warn('[DreVisualizations] Chart failed: ' + key, error);
            if (settled && host.dataset) {
                host.dataset.state = 'partial';
                var status = host.querySelector && host.querySelector('.rv-dashboard-status');
                if (status) status.textContent = ns.t('visualizationsPartial', 'Some visualisations could not be loaded.');
            }
        }

        function build(key, el) {
            var builder = builderFor(data, key);
            el._rvBuilt = true;
            try {
                if (!builder) throw new Error('No builder registered for ' + key);
                // Rebuilt from its data on a light/dark switch (ns.buildChart);
                // the toolbar resolves the live instance at click time.
                var chart = ns.buildChart(function () { return builder(el, data[key], siteBase, data); });
                if (chart) ns.attachToolbar(el.closest('.chart-panel'), chart);
            } catch (error) {
                fail(el, key, error);
            }
        }

        var lazy = !chartOnly && plan.keys.length > EAGER_PANELS && typeof window.IntersectionObserver === 'function';
        var observer = lazy ? new window.IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                observer.unobserve(entry.target);
                build(entry.target.getAttribute('data-chart'), entry.target);
            });
        }, { rootMargin: '400px 0px' }) : null;
        if (observer) container._rvPanelObserver = observer;

        /**
         * Show another chart of a tabbed panel in the same container. The
         * builder replaces the ECharts instance (ns.initChart disposes the old
         * one), and the toolbar's save, CSV and data table act on whichever
         * instance is live, so they follow the switch. A panel not yet built
         * (still below the fold) only changes key: the observer builds it.
         */
        function showTab(panel, key) {
            var el = panel.querySelector('[data-chart]');
            if (!el || el.getAttribute('data-chart') === key) return;
            el.setAttribute('data-chart', key);
            panel.querySelectorAll('.rv-chart-tab').forEach(function (button) {
                button.setAttribute('aria-pressed', String(button.getAttribute('data-tab') === key));
            });
            var desc = panel.querySelector('.chart-description');
            if (desc) {
                desc.textContent = descriptionFor(key);
                desc.hidden = !desc.textContent;
            }
            // An open data table would still list the previous chart; it
            // refills from the live chart when opened again.
            var table = panel.querySelector('.rv-data-table');
            if (table) table.open = false;
            // The copied embed code is the chart on screen (core/embed.js).
            if (panel._rvEmbed) {
                panel._rvEmbed.src = ns.embedUrl(panel._rvEmbed.siteBase, panel._rvEmbed.slug, key);
                panel._rvEmbed.title = labelFor(key);
            }
            if (!el._rvBuilt) return;
            // ns.initChart names the chart from the panel's heading and
            // description, but only a container without a name of its own.
            el.removeAttribute('aria-label');
            build(key, el);
        }

        container.querySelectorAll('.rv-chart-panel-tabbed').forEach(function (panel) {
            panel.querySelectorAll('.rv-chart-tab').forEach(function (button) {
                button.addEventListener('click', function () { showTab(panel, button.getAttribute('data-tab')); });
            });
        });

        plan.keys.forEach(function (key, index) {
            var el = container.querySelector('[data-chart="' + key + '"]');
            if (!el) return;
            if (observer && index >= EAGER_PANELS) observer.observe(el);
            else build(key, el);
        });
        settled = true;

        // Single-chart embed for a key with no data in this JSON (or an unknown
        // key): leave a quiet note instead of a blank frame.
        if (chartOnly && !container.querySelector('[data-chart]')) {
            container.innerHTML = '<p class="rv-embed-empty">'
                + escapeHtml(ns.t('noVisualizationData', 'There is no data for this chart.')) + '</p>';
        }

        // Live-site only: add a copy-embed-code button to each chart on an
        // embeddable dashboard (no-op elsewhere). Shared impl in dashboard-core.js.
        if (ns.addEmbedButtons) ns.addEmbedButtons(container);
        // Resizing and light/dark theme changes are handled globally in
        // dashboard-core.js (ns.refresh and the shared ResizeObserver).
        return failures;
    }

    // Expose the render loop so other controllers (e.g. Project Explorer) reuse
    // the exact item-page renderer instead of duplicating it.
    ns.renderInto = renderDashboard;

    /* ------------------------------------------------------------------ */
    /*  Async dashboard (precomputed JSON)                                 */
    /* ------------------------------------------------------------------ */

    function initAsyncDashboard(container, content, state) {
        var itemId = container.dataset.itemId;
        var basePath = container.dataset.basePath || '';
        var siteBase = container.dataset.siteBase || '';
        state.loading();
        ns.basePath = basePath; // expose for builders that load module assets (e.g. choropleth GeoJSON)
        var directory = /^[a-z0-9-]+$/.test(container.dataset.dashboardDir || '')
            ? container.dataset.dashboardDir : 'item-dashboards';

        return ns.fetchDataJson(directory + '/' + encodeURIComponent(itemId) + '.json').then(function (data) {
            // A dashboard without records can still carry a panel: a research
            // project with no records yet publishes its members' map alone.
            if (!data || (!data.totalItems && !planDashboard(data, container).keys.length)) {
                state.empty(container.dataset.emptyStatus || ns.t('noData', 'Nothing to show'), content);
                return;
            }
            return ns.ensureLibs(ns.chartLibraries ? ns.chartLibraries(data, container) : { echarts: true }).then(function () {
                ns.setChildren(content);
                var failures = renderDashboard(content, data, siteBase, true, container);
                if (failures) state.partial();
                else state.ready(container.dataset.readyStatus || ns.t('visualizationsReady', 'Visualisations ready.'));
            });
        });
    }

    /* ------------------------------------------------------------------ */
    /*  Init                                                               */
    /* ------------------------------------------------------------------ */

    // Lazy-mount: render a dashboard only once it nears the viewport, loading the
    // heavy chart/map libraries on demand at that moment (ns.ensureLibs). Home and
    // landing dashboards sit below the fold, so this keeps ECharts + MapLibre and
    // the chart-render work off the initial load entirely. A dashboard already in
    // view (a dedicated dashboard page, or libraries loaded eagerly) fires the
    // observer at once and ensureLibs resolves immediately — unchanged there.
    function mountAsyncDashboard(container) {
        // The partial renders the live region inside the container and the
        // replaceable markup in .rv-dashboard-content (statusInside).
        var content = container.querySelector('.rv-dashboard-content') || container;
        var state = ns.asyncState(container);
        function run() {
            Promise.resolve().then(function () { return initAsyncDashboard(container, content, state); }).catch(function (error) {
                console.warn('[DreVisualizations] Dashboard failed', error);
                // "Try again" reruns the request in place (core/libs.js forgets a
                // failed library load and core/data.js a failed download, so the
                // rerun really refetches).
                state.error(container.dataset.errorStatus
                    || ns.t('visualizationLoadError', 'The visualisation could not be loaded.'), retry, content);
            });
        }
        function retry() {
            state.loading();
            run();
        }
        ns.mountWhenVisible(container, run);
    }

    function init() {
        var async = document.querySelectorAll('.dashboard-async-container');
        for (var i = 0; i < async.length; i++) mountAsyncDashboard(async[i]);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
