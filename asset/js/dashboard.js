/**
 * Dashboard orchestrator.
 *
 * Reads chart builders, layouts, labels, and descriptions from
 * the window.RV namespace (populated by the modular JS files)
 * and wires up async + inline dashboard rendering.
 *
 * Load order (see DashboardAssets): dashboard-core.js, then the generated
 * dashboard-charts.bundle.js (layouts, every chart builder and the registry,
 * concatenated from DashboardAssets::CHART_SCRIPTS), then this orchestrator.
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
        return { layoutKey: layoutKey, layout: layout, chartOnly: chartOnly, keys: keys };
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

        // Header title. Defaults to "Visualisations" (Publications, YouTube,
        // Collection Dashboard, item-page dashboards) unless the block template
        // pins its own via `data-title` — the curated "Collection Overview"
        // names itself "Collection overview" so its heading matches the block.
        var headTitle = (host && host.dataset && host.dataset.title) || ns.t('visualisations', 'Visualisations');
        var headInner = '<h2>' + escapeHtml(headTitle) + '</h2>';

        var chartsHtml = '<div class="dashboard-charts' + (chartOnly ? ' dashboard-charts--single' : '') + '">';
        plan.keys.forEach(function (key) {
            // A single-chart embed fills the frame: always full-width and tall.
            var wide = (chartOnly || layout.wide.indexOf(key) >= 0) ? ' chart-panel-wide' : '';
            var tall = (chartOnly || layout.tall.indexOf(key) >= 0) ? ' chart-container-tall' : '';
            // The registry's translated title/description; the raw tables only
            // when dashboard-registry.js has not loaded.
            var label = labelOverrides[key] || (ns.chartLabel ? ns.chartLabel(key)
                : ((ns.CHART_LABELS && ns.CHART_LABELS[key]) || key));
            var desc = Object.prototype.hasOwnProperty.call(descOverrides, key)
                ? descOverrides[key]
                : (ns.chartDescription ? ns.chartDescription(key)
                    : ((ns.CHART_DESCRIPTIONS && ns.CHART_DESCRIPTIONS[key]) || ''));
            chartsHtml += '<div class="chart-panel' + wide + '">'
                + '<div class="rv-chart-heading"><h3>' + escapeHtml(label) + '</h3></div>'
                + (desc ? '<p class="chart-description">' + escapeHtml(desc) + '</p>' : '')
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
                + statsHtml
                + chartsHtml
                + '</div>'
                + '</details>';
        } else {
            // eslint-disable-next-line no-unsanitized/property -- escaped heading, labels and descriptions
            container.innerHTML = statsHtml
                + (chartOnly ? '' : '<div class="dashboard-header">' + headInner + '</div>')
                + chartsHtml;
        }

        var failures = 0;
        var settled = false; // once true, a failure is reported to the host directly
        function fail(el, key, error) {
            failures++;
            el.textContent = ns.t('visualizationsUnavailable', 'Visualisations are unavailable.');
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

    function showMessage(container, message, state) {
        var content = container.querySelector('.rv-dashboard-content') || container;
        var status = container.querySelector('.rv-dashboard-status');
        container.setAttribute('aria-busy', 'false');
        container.dataset.state = state;
        if (status) status.textContent = message;
        content.replaceChildren();
        var notice = document.createElement('div');
        notice.className = 'rv-no-data rv-dashboard-message';
        var text = document.createElement('p');
        text.textContent = message;
        notice.appendChild(text);
        if (state === 'error') {
            // A reload also retries failed ESM/library requests and the manifest.
            var retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'rv-dashboard-reload';
            retry.textContent = ns.t('reloadPage', 'Reload page');
            retry.addEventListener('click', function () { window.location.reload(); });
            notice.appendChild(retry);
        }
        content.appendChild(notice);
    }

    function initAsyncDashboard(container) {
        var itemId = container.dataset.itemId;
        var basePath = container.dataset.basePath || '';
        var siteBase = container.dataset.siteBase || '';
        var content = container.querySelector('.rv-dashboard-content') || container;
        var status = container.querySelector('.rv-dashboard-status');
        var finish = function (message) {
            container.setAttribute('aria-busy', 'false');
            if (status) status.textContent = message;
        };
        container.setAttribute('aria-busy', 'true');
        container.dataset.state = 'loading';
        ns.basePath = basePath; // expose for builders that load module assets (e.g. choropleth GeoJSON)
        var directory = /^[a-z0-9-]+$/.test(container.dataset.dashboardDir || '')
            ? container.dataset.dashboardDir : 'item-dashboards';

        return ns.fetchDataJson(directory + '/' + encodeURIComponent(itemId) + '.json').then(function (data) {
            if (!data || !data.totalItems) {
                var emptyMessage = container.dataset.emptyStatus || ns.t('noData', 'Nothing to show');
                showMessage(container, emptyMessage, 'empty');
                finish(emptyMessage);
                return;
            }
            return ns.ensureLibs(ns.chartLibraries ? ns.chartLibraries(data, container) : { echarts: true }).then(function () {
            content.innerHTML = '';
            var failures = renderDashboard(content, data, siteBase, true, container);
            container.dataset.state = failures ? 'partial' : 'ready';
            finish(failures
                ? ns.t('visualizationsPartial', 'Some visualisations could not be loaded.')
                : (container.dataset.readyStatus || ns.t('visualizationsReady', 'Visualisations ready.')));
            });
        });
    }

    /* ------------------------------------------------------------------ */
    /*  Inline dashboard (data-dashboard attribute)                        */
    /* ------------------------------------------------------------------ */

    function initInlineDashboard(container) {
        var raw = container.getAttribute('data-dashboard');
        if (!raw) return;
        var data;
        try { data = JSON.parse(raw); } catch (e) { return; }
        var siteBase = container.dataset.siteBase || '';
        return ns.ensureLibs(ns.chartLibraries ? ns.chartLibraries(data, container) : { echarts: true }).then(function () {
            renderDashboard(container.parentElement || container, data, siteBase);
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
    function mountWhenVisible(container, render) {
        ns.mountWhenVisible(container, function () {
            Promise.resolve().then(render).catch(function (error) {
                console.warn('[DreVisualizations] Dashboard failed', error);
                showMessage(container, container.dataset.errorStatus
                    || ns.t('visualizationsUnavailable', 'Visualisations are unavailable.'), 'error');
            });
        });
    }

    function init() {
        var async = document.querySelectorAll('.dashboard-async-container');
        for (var i = 0; i < async.length; i++) {
            (function (c) { mountWhenVisible(c, function () { return initAsyncDashboard(c); }); })(async[i]);
        }
        var inline = document.querySelectorAll('.dashboard-container');
        for (var j = 0; j < inline.length; j++) {
            (function (c) { mountWhenVisible(c, function () { return initInlineDashboard(c); }); })(inline[j]);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
