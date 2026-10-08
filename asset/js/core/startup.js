/**
 * Dashboard core: start-up. Resolves the theme, watches for light/dark
 * switches, mounts the block embed buttons and installs the global resize
 * fallbacks. It calls into every other core file as soon as it runs, so it
 * MUST stay last in the concatenation order.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    /* ------------------------------------------------------------------ */
    /*  Theme watchers + global resize                                     */
    /* ------------------------------------------------------------------ */

    var _refreshTimer;
    function scheduleRefresh() {
        clearTimeout(_refreshTimer);
        _refreshTimer = setTimeout(function () {
            if (ns.isDark() !== ns._darkMode) ns.refresh();
        }, 60);
    }

    // Body-dependent setup. This script is injected in <head>, so <body> may not
    // exist yet (the colour probe and the theme observer both need it). Defer
    // until the DOM is ready; charts/maps also init on DOMContentLoaded, and
    // initChart() lazily resolves the theme as a safety net.
    function setupThemeWatchers() {
        // Resolve tokens now that <body> exists, so the probe inherits the active
        // body[data-theme] cascade and the first chart renders in the right theme.
        ns.readTheme();

        // ONE subscription for the whole module. DRE-theme writes the resolved
        // mode to `data-theme` on <html> and <body> — for the manual toggle and
        // for an OS change alike — and ns.onThemeChange (window.DRETokens when
        // the theme is present) reports it. ns.refresh() then re-themes every
        // chart and map and repaints every tracked renderer, including the
        // knowledge graph and the entity network, so no surface keeps an
        // observer of its own and no surface asks the OS which mode is active.
        ns.onThemeChange(scheduleRefresh);
    }

    function onReady() {
        setupThemeWatchers();
        ns.setupBlockEmbedButtons();
    }
    if (document.body) {
        onReady();
    } else {
        document.addEventListener('DOMContentLoaded', onReady, { once: true });
    }

    // Without ResizeObserver (very old browsers) fall back to window resizes.
    // Maps need neither: MapLibre's trackResize observes their containers.
    if (typeof window.ResizeObserver !== 'function') {
        var _resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(_resizeTimer);
            _resizeTimer = setTimeout(function () {
                ns.pruneCharts();
                ns._allCharts.forEach(function (c) { try { c.resize(); } catch (e) {} });
            }, 100);
        });
    }

    // Re-fit charts/maps when a collapsible section (.rv-collapsible) is expanded:
    // a chart sized while its panel was hidden (the closed <details> uses
    // content-visibility) needs a resize once the panel is visible again. The
    // `toggle` event does not bubble, so listen in the capture phase. Mirrors the
    // working knowledge-graph fullscreen resize.
    document.addEventListener('toggle', function (e) {
        var d = e.target;
        if (!d || !d.classList || !d.classList.contains('rv-collapsible') || !d.open) return;
        requestAnimationFrame(function () {
            ns.pruneCharts();
            ns._allCharts.forEach(function (c) { try { c.resize(); } catch (e) {} });
            ns._allMaps.forEach(function (m) { try { m.map.resize(); } catch (e) {} });
        });
    }, true);
})();
