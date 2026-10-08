/**
 * Dashboard core: the namespace and the small helpers every other file uses —
 * translation, text and number formatting, escaping, DOM construction, and the
 * lazy-mount observer.
 *
 * SOURCE FILE. asset/js/core/*.js are concatenated, in the order
 * scripts/lib/frontend-sources.mjs lists, into the served asset/js/dashboard-core.js
 * by `npm run build`; edit these files, never the generated one. Each file is its
 * own IIFE that reaches the others only through `window.RV`. Apart from setting
 * initial values, only reveal.js and startup.js act on load, so they come last.
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    /* ------------------------------------------------------------------ */
    /*  Interface strings                                                  */
    /* ------------------------------------------------------------------ */

    // Omeka emits the active site language on <html>, and the server formats
    // its counts in that same locale (NumberFormatter). Keep every client-side
    // Intl format aligned with it — never with navigator.language, which would
    // group the digits of one page two different ways — falling back to 'en'
    // when the document declares nothing (DESIGN-INTEGRATION.md "Numbers").
    ns.locale = document.documentElement.lang || 'en';
    ns.strings = window.RV_I18N || {};
    ns.t = function (key, fallback) {
        return Object.prototype.hasOwnProperty.call(ns.strings, key) ? ns.strings[key] : fallback;
    };
    /**
     * Fill the `{name}` placeholders of a translated template, so a translation
     * can reorder the parts: ns.fill(ns.t('inCountry', 'in {country}'), { country: c }).
     * The result is plain text — escape it before any innerHTML.
     */
    ns.fill = function (template, params) {
        return String(template).replace(/\{(\w+)\}/g, function (whole, name) {
            return params && Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole;
        });
    };

    /* ------------------------------------------------------------------ */
    /*  Text, numbers and escaping                                         */
    /* ------------------------------------------------------------------ */

    /** Truncate a string with ellipsis if it exceeds maxLen. */
    ns.truncateLabel = function (str, maxLen) {
        if (!str) return '';
        return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
    };

    /** Convert either format to array of { name, value, itemId? }. */
    ns.toEntries = function (data) {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        return Object.keys(data).map(function (k) { return { name: k, value: data[k] }; });
    };

    /**
     * A public item page URL. The id is URI-encoded, so the result is safe in
     * an href; inside HTML markup it still goes through ns.escapeHtml.
     */
    ns.itemUrl = function (siteBase, id) {
        return (siteBase || '') + '/item/' + encodeURIComponent(String(id));
    };

    /**
     * A count with its noun, translated and pluralised for the page locale:
     * ns.plural(3, 'member', 'Member', 'Members') → "3 Members". `key` names a
     * pair of RV_I18N entries, `<key>One` and `<key>Other`; omit the count by
     * passing `withCount` false (for a label such as "Members: …").
     */
    ns.plural = function (count, key, one, other, withCount) {
        var rule;
        try { rule = new Intl.PluralRules(ns.locale).select(Number(count)); } catch (e) { rule = count === 1 ? 'one' : 'other'; }
        var word = rule === 'one' ? ns.t(key + 'One', one) : ns.t(key + 'Other', other);
        return withCount ? ns.formatNumber(count) + ' ' + word : word;
    };

    /** Escape plain text before inserting it through innerHTML. */
    ns.escapeHtml = function (value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    };

    /**
     * Lower-case and strip diacritics, so a "cote" query finds "Côte" and
     * "laicite" finds "Laïcité". For matching only — never for display.
     */
    ns.fold = function (value) {
        var s = (value == null ? '' : String(value)).toLowerCase();
        return s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
    };

    /** Locale-consistent count formatting for stat cards, popups and tooltips. */
    ns.formatNumber = function (n) {
        var v = Number(n);
        return isFinite(v) ? new Intl.NumberFormat(ns.locale).format(v) : String(n == null ? '' : n);
    };

    /** Locale-consistent date formatting, with one safe fallback for bad input. */
    ns.formatDate = function (value, options) {
        var date = value instanceof Date ? value : new Date(value);
        if (!isFinite(date.getTime())) return '';
        return new Intl.DateTimeFormat(ns.locale, options || {}).format(date);
    };

    /** Live check of the user's reduced-motion preference (vestibular safety). */
    ns.prefersReducedMotion = function () {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    };

    /**
     * Run `run` once `el` comes within `rootMargin` (default 600px) of the
     * viewport, or at once where IntersectionObserver is missing. Every block
     * that sits below the fold defers its fetch, its libraries and its render
     * through here, so a page pays for a visualisation only when a reader nears it.
     */
    ns.mountWhenVisible = function (el, run, rootMargin) {
        if (!('IntersectionObserver' in window)) { run(); return; }
        var io = new IntersectionObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) {
                if (entries[i].isIntersecting) { io.disconnect(); run(); break; }
            }
        }, { rootMargin: rootMargin || '600px 0px' });
        io.observe(el);
    };

    /* ------------------------------------------------------------------ */
    /*  DOM and icon buttons                                               */
    /* ------------------------------------------------------------------ */

    /** Create a DOM element with optional class and text content. */
    ns.el = function (tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    };

    // One innerHTML sink for every inline icon in the module. The bodies passed in
    // are module-authored path constants, never curator data — routing them all
    // through here is what keeps the count in check-html-safety.mjs flat as blocks
    // gain controls, instead of one sink per button.
    var _iconHost = null;

    /** Build an inline 24×24 stroke icon from an SVG path body. */
    ns.iconSvg = function (body, size) {
        if (!_iconHost) _iconHost = document.createElement('div');
        size = size || 14;
        // eslint-disable-next-line no-unsanitized/property -- module-authored SVG path constants; size is a number
        _iconHost.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24"'
            + ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"'
            + ' stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
        return _iconHost.firstChild;   // appending it elsewhere detaches it from the host
    };

    /**
     * Replace an element's children with the given nodes (none = clear it).
     *
     * Two reasons this exists rather than `innerHTML = ''` plus appendChild: it
     * keeps clearing a node off the innerHTML sink inventory
     * (scripts/check-html-safety.mjs), and it falls back to a removal loop so no
     * shipped surface depends on `replaceChildren` — a 2020 DOM API, newer than
     * anything else the module relies on.
     */
    ns.setChildren = function (el, nodes) {
        nodes = nodes || [];
        if (el.replaceChildren) {
            el.replaceChildren.apply(el, nodes);
            return el;
        }
        while (el.firstChild) el.removeChild(el.firstChild);
        for (var i = 0; i < nodes.length; i++) el.appendChild(nodes[i]);
        return el;
    };

    /** A `.rv-btn` toolbar button carrying one ns.iconSvg glyph. */
    ns.iconButton = function (body, label, title) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rv-btn';
        btn.setAttribute('aria-label', label);
        btn.title = title || label;
        btn.appendChild(ns.iconSvg(body));
        return btn;
    };
})();
