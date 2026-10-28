/**
 * Embed iframe height reporter: posts the document height to the parent on
 * load, resize and DOM mutations (charts populate asynchronously and lazily).
 * The host page pairs it with the listener in the embed snippet
 * (RV.embedSnippet, core/embed.js).
 *
 * Loaded by the bare embed layout (view/dre-visualizations/layout/embed.phtml)
 * as a file rather than inline script, so the embed page needs no
 * `'unsafe-inline'` in a script-src policy. Depends on nothing.
 */
(function () {
    'use strict';

    if (window.parent === window) return;
    var last = 0;
    function post() {
        var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
        if (h && h !== last) {
            last = h;
            window.parent.postMessage({ type: 'dre-embed-height', height: h }, '*');
        }
    }
    window.addEventListener('load', post);
    window.addEventListener('resize', post);
    function observe() {
        if ('ResizeObserver' in window) {
            new ResizeObserver(post).observe(document.body);
        } else {
            setInterval(post, 1000);
        }
    }
    // Deferred, so the body exists; the guard covers a non-deferred load.
    if (document.body) observe(); else document.addEventListener('DOMContentLoaded', observe);
    // Nudge a few times early, before the charts/maps finish their first paint.
    var t = 0, iv = setInterval(function () { post(); if (++t > 20) clearInterval(iv); }, 300);
})();
