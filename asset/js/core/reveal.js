/**
 * Dashboard core: reveal-on-scroll. Observes server-rendered
 * [data-rv-reveal] nodes as soon as it loads, so it comes late in the order.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    /* ------------------------------------------------------------------ */
    /*  Reveal-on-scroll (shared)                                          */
    /*                                                                      */
    /*  Fade + rise elements as they enter the viewport, one-shot. Mirrors  */
    /*  the amira dashboard's revealOnScroll action. Two ways to use it:    */
    /*   - dynamic nodes (e.g. masonry tiles built in JS): call             */
    /*     ns.revealOnScroll(node, {delay}) right after creating them;      */
    /*   - server-rendered nodes: add a `data-rv-reveal="<delayMs>"`        */
    /*     attribute and the auto-init below observes them on load.         */
    /*  The CSS (`[data-reveal=hidden|shown]`) does the actual transition,  */
    /*  and honours prefers-reduced-motion; with JS off, nodes stay visible */
    /*  (no `data-reveal` is ever set).                                     */
    /* ------------------------------------------------------------------ */

    ns._revealObserver = null;
    function revealObserver() {
        if (ns._revealObserver) return ns._revealObserver;
        if (!('IntersectionObserver' in window)) return null;
        ns._revealObserver = new IntersectionObserver(function (entries, obs) {
            entries.forEach(function (e) {
                if (!e.isIntersecting) return;
                var el = e.target;
                var delay = +(el.dataset.rvRevealDelay || 0);
                if (delay > 0) {
                    setTimeout(function () { el.setAttribute('data-reveal', 'shown'); }, delay);
                } else {
                    el.setAttribute('data-reveal', 'shown');
                }
                obs.unobserve(el);
            });
        }, { rootMargin: '0px 0px -8% 0px' });
        return ns._revealObserver;
    }

    var _reducedMotion = !!(window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    ns.revealOnScroll = function (node, opts) {
        opts = opts || {};
        // Reduced motion (or no IntersectionObserver) → leave the node visible.
        if (_reducedMotion) return;
        var obs = revealObserver();
        if (!obs) return;
        if (opts.delay) node.dataset.rvRevealDelay = String(opts.delay);
        node.setAttribute('data-reveal', 'hidden');
        obs.observe(node);
    };

    function initReveal() {
        var els = document.querySelectorAll('[data-rv-reveal]');
        Array.prototype.forEach.call(els, function (el) {
            var d = parseInt(el.getAttribute('data-rv-reveal'), 10);
            ns.revealOnScroll(el, { delay: isFinite(d) ? d : 0 });
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initReveal, { once: true });
    } else {
        initReveal();
    }
})();
