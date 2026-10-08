/**
 * Dashboard core: the one fullscreen control every surface uses — the
 * knowledge graph, the entity network and the maps (DESIGN-INTEGRATION.md
 * "Shared widgets": one icon button per surface, aria-pressed reflecting the
 * state, a label swapping between "Fullscreen" and "Exit fullscreen", and the
 * fullscreen layer at --z-stage).
 *
 * It expands the surface IN the page (the `.rv-fullscreen` class, laid out by
 * the stylesheet at --rv-z-stage) rather than through the browser Fullscreen
 * API: a block's toolbar, sidebar, legend and text alternative are how a reader
 * drives it, and the API would take the canvas out from under them. That is
 * also why maps no longer use MapLibre's own FullscreenControl.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    /**
     * A fullscreen toggle for `target`.
     *
     * @param {HTMLElement} target  the element that expands (the whole block)
     * @param {Object} [opts] {
     *     onChange:  (on) => void  — refit canvases after each toggle;
     *     className: string        — replaces the default `.rv-btn` skin (a map
     *                                control styles its own button)
     * }
     * @returns {HTMLButtonElement} with `rvDispose()` to drop its key listener
     */
    ns.fullscreenButton = function (target, opts) {
        opts = opts || {};
        var btn = ns.iconButton(ns.ICONS.expand, ns.t('fullscreen', 'Fullscreen'));
        if (opts.className) btn.className = opts.className;
        btn.classList.add('rv-fullscreen-btn');

        function sync(on) {
            var label = on ? ns.t('exitFullscreen', 'Exit fullscreen') : ns.t('fullscreen', 'Fullscreen');
            btn.setAttribute('aria-pressed', String(on));
            btn.setAttribute('aria-label', label);
            btn.title = label;
            btn.classList.toggle('rv-toolbar-btn-active', on);
            ns.setChildren(btn, [ns.iconSvg(on ? ns.ICONS.collapse : ns.ICONS.expand)]);
        }

        function apply(on) {
            target.classList.toggle('rv-fullscreen', on);
            sync(on);
            if (typeof opts.onChange === 'function') opts.onChange(on);
        }

        btn.addEventListener('click', function () {
            apply(!target.classList.contains('rv-fullscreen'));
        });
        // Bubble phase on purpose: a surface whose own Escape clears a selection
        // first stops the event there, so only a second Escape leaves fullscreen.
        function onKey(ev) {
            if (ev.key === 'Escape' && target.classList.contains('rv-fullscreen')) apply(false);
        }
        document.addEventListener('keydown', onKey);
        btn.rvDispose = function () { document.removeEventListener('keydown', onKey); };

        // A control rebuilt while its surface is expanded (a map re-created on
        // a light/dark switch) starts in the state the surface is in.
        sync(target.classList.contains('rv-fullscreen'));
        return btn;
    };
})();
