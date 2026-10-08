/**
 * Dashboard core: the one asynchronous-state pattern every block shares —
 * loading, ready, empty, error with "Try again", and unavailable — so a
 * visitor (and a screen reader) meets the same markup and wording on every
 * surface (DESIGN-INTEGRATION.md "Asynchronous states").
 *
 * The server half is view/common/block-layout/partials/async-surface.phtml:
 * a persistent `role="status"` node rendered BEFORE the block's container (so
 * the block's own controller can replace the container's children without
 * destroying the live region), the aria-hidden spinner, and the <noscript>
 * message. This file is the client half.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    /**
     * The persistent status node for `container`: the partial's sibling node,
     * else one inside the container (the dashboard partial's form), else a new
     * visually hidden one inserted before the container.
     */
    ns.asyncStatusNode = function (container) {
        var prev = container.previousElementSibling;
        if (prev && prev.classList && prev.classList.contains('rv-async-status')) return prev;
        var inner = container.querySelector && container.querySelector('.rv-dashboard-status');
        if (inner) return inner;
        var status = document.createElement('p');
        status.className = 'rv-dashboard-status rv-async-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.setAttribute('aria-atomic', 'true');
        if (container.parentNode) container.parentNode.insertBefore(status, container);
        return status;
    };

    /** The spinner the partial renders, for a surface that loads again. */
    ns.loadingIndicator = function (message) {
        var box = ns.el('div', 'rv-loading rv-async-loading');
        box.setAttribute('aria-hidden', 'true');
        box.appendChild(ns.el('div', 'rv-spinner'));
        box.appendChild(ns.el('span', null, message || ns.t('loading', 'Loading…')));
        return box;
    };

    /**
     * An error notice: the surface-specific message and, when `retry` is
     * given, a "Try again" button that reruns the request. Technical detail
     * belongs in the console, never in `message`.
     */
    ns.errorNotice = function (message, retry) {
        var notice = ns.el('div', 'rv-error rv-async-error');
        notice.appendChild(ns.el('p', 'rv-async-message', message));
        if (typeof retry === 'function') {
            var button = ns.el('button', 'rv-retry-btn', ns.t('retry', 'Try again'));
            button.type = 'button';
            button.addEventListener('click', function () {
                button.disabled = true;
                retry();
            });
            notice.appendChild(button);
        }
        return notice;
    };

    /**
     * The state machine for one asynchronous surface. `container` is the
     * block's STABLE element: its children may be replaced, the element is not.
     * aria-busy is true only while work is active and false after every
     * terminal outcome; each state is announced through the one status node
     * without moving focus.
     *
     *   var state = ns.asyncState(container);
     *   state.loading();
     *   load().then(function () { state.ready(); })
     *         .catch(function (e) { console.error(e); state.error(msg, run); });
     */
    ns.asyncState = function (container) {
        var status = ns.asyncStatusNode(container);
        function settle(state, message) {
            container.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
            container.dataset.state = state;
            if (message != null) status.textContent = message;
        }
        return {
            status: status,
            loading: function (message) {
                message = message || ns.t('loading', 'Loading…');
                // A retry: the error notice gives way to the spinner again.
                var notice = container.querySelector('.rv-async-error');
                if (notice && notice.parentNode) notice.parentNode.replaceChild(ns.loadingIndicator(message), notice);
                settle('loading', message);
            },
            ready: function (message) {
                settle('ready', message || ns.t('visualizationReady', 'Visualization ready.'));
            },
            /** Show a quiet message in `target` (default: the container). */
            empty: function (message, target) {
                ns.setChildren(target || container, [ns.el('p', 'rv-no-data', message)]);
                settle('empty', message);
            },
            /** Show the message and a "Try again" button that calls `retry`. */
            error: function (message, retry, target) {
                message = message || ns.t('visualizationLoadError', 'The visualisation could not be loaded.');
                ns.setChildren(target || container, [ns.errorNotice(message, retry)]);
                settle('error', message);
            },
            /** A quiet message with no retry: the service is off, not failing. */
            unavailable: function (message, target) {
                ns.setChildren(target || container, [ns.el('p', 'rv-no-data rv-unavailable', message)]);
                settle('unavailable', message);
            },
            /** Announce without changing state (e.g. a filter result count). */
            announce: function (message) {
                status.textContent = message;
            }
        };
    };

    /**
     * Speak a short message without a status node of one's own: the theme's
     * shared region (window.DREUtils.announce) when DRE-theme is present, else
     * one module-wide visually hidden region.
     */
    var _region = null;
    ns.announce = function (message) {
        var utils = window.DREUtils;
        if (utils && typeof utils.announce === 'function') {
            utils.announce(message);
            return;
        }
        if (!_region) {
            _region = document.createElement('p');
            _region.className = 'rv-dashboard-status';
            _region.setAttribute('role', 'status');
            _region.setAttribute('aria-live', 'polite');
            _region.setAttribute('aria-atomic', 'true');
            document.body.appendChild(_region);
        }
        _region.textContent = '';
        // Set after a tick, so a repeated message is a change and re-announces.
        setTimeout(function () { _region.textContent = message; }, 50);
    };
})();
