/**
 * Dashboard core: the one fullscreen control every surface uses — each chart
 * panel, the single-visualization blocks, the knowledge graph and the entity
 * network (DESIGN-INTEGRATION.md "Shared widgets": one icon button per
 * surface, aria-pressed reflecting the state, a label swapping between
 * "Fullscreen" and "Exit fullscreen", and the fullscreen layer at --z-stage).
 *
 * It expands the surface IN the page (the `.rv-fullscreen` class, laid out by
 * the stylesheet at --rv-z-stage) rather than through the browser Fullscreen
 * API: a block's toolbar, sidebar, facets, legend and text alternative are how
 * a reader drives it, and the API would take the canvas out from under them.
 * So the surface that expands is always the smallest one holding the picture
 * AND its controls — the chart panel when they sit inside it (a word cloud's
 * slider, a map's legend), the whole block when they sit outside every panel
 * (the spatial exploration's picker, the compare selectors). That is also why
 * maps no longer use MapLibre's own FullscreenControl.
 *
 * Surfaces can nest — a chart panel inside the expanded project explorer — so
 * Escape always leaves the innermost one first.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    // ONE key listener for every surface, in the bubble phase on purpose: a
    // surface whose own Escape clears a selection or closes a list stops (or
    // claims, with preventDefault) the event there, so only a second Escape
    // leaves fullscreen. Document order puts an expanded block before the
    // expanded panel inside it, so the last open surface is the innermost.
    document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape' || ev.defaultPrevented) return;
        var open = document.querySelectorAll('.rv-fullscreen');
        for (var i = open.length - 1; i >= 0; i--) {
            if (typeof open[i]._rvSetFullscreen === 'function') {
                open[i]._rvSetFullscreen(false);
                ev.preventDefault();
                return;
            }
        }
    });

    /**
     * Keep `target`'s place in the page while it is lifted out of the flow, so
     * the grid or column it left does not close up behind it: the charts
     * beneath do not reflow and resize, and leaving fullscreen puts the reader
     * back exactly where they were on the page.
     */
    function holdPlace(target) {
        if (!target.parentNode) return null;
        var style = window.getComputedStyle(target);
        var spacer = document.createElement('div');
        spacer.className = 'rv-fullscreen-placeholder';
        spacer.setAttribute('aria-hidden', 'true');
        spacer.style.height = target.offsetHeight + 'px';
        spacer.style.marginTop = style.marginTop;
        spacer.style.marginBottom = style.marginBottom;
        spacer.style.gridColumn = style.gridColumn;
        target.parentNode.insertBefore(spacer, target.nextSibling);
        return spacer;
    }

    /**
     * A fullscreen toggle for `target`.
     *
     * @param {HTMLElement} target  the element that expands (a chart panel or a block)
     * @param {Object} [opts] {
     *     onChange:  (on) => void  — refit canvases after each toggle;
     *     className: string        — replaces the default `.rv-btn` skin (a chart
     *                                toolbar uses `.rv-toolbar-btn`)
     * }
     * @returns {HTMLButtonElement}
     */
    ns.fullscreenButton = function (target, opts) {
        opts = opts || {};
        var btn = ns.iconButton(ns.ICONS.expand, ns.t('fullscreen', 'Fullscreen'));
        if (opts.className) btn.className = opts.className;
        btn.classList.add('rv-fullscreen-btn');
        var spacer = null;

        function sync(on) {
            var label = on ? ns.t('exitFullscreen', 'Exit fullscreen') : ns.t('fullscreen', 'Fullscreen');
            btn.setAttribute('aria-pressed', String(on));
            btn.setAttribute('aria-label', label);
            btn.title = label;
            btn.classList.toggle('rv-toolbar-btn-active', on);
            ns.setChildren(btn, [ns.iconSvg(on ? ns.ICONS.collapse : ns.ICONS.expand)]);
        }

        function apply(on) {
            if (on === target.classList.contains('rv-fullscreen')) return;
            if (on) spacer = holdPlace(target);
            target.classList.toggle('rv-fullscreen', on);
            if (!on && spacer) {
                if (spacer.parentNode) spacer.parentNode.removeChild(spacer);
                spacer = null;
            }
            sync(on);
            // Maps inside take the wheel while the surface fills the screen.
            if (ns.stageMaps) ns.stageMaps(target, on);
            if (typeof opts.onChange === 'function') opts.onChange(on);
            // For a picture whose size is not only its box (the word cloud
            // sets its type in pixels): it re-lays itself out on this.
            target.dispatchEvent(new CustomEvent('rv-fullscreenchange', { detail: { fullscreen: on } }));
        }

        btn.addEventListener('click', function () {
            apply(!target.classList.contains('rv-fullscreen'));
        });
        target._rvSetFullscreen = apply;

        // A control rebuilt while its surface is expanded starts in the state
        // the surface is in.
        sync(target.classList.contains('rv-fullscreen'));
        return btn;
    };
})();
