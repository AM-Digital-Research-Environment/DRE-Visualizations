/**
 * Generated dashboard core. Do not edit directly.
 * Source order: scripts/lib/frontend-sources.mjs CORE_SOURCES (asset/js/core/).
 * Rebuild: npm run build
 */
/* ---- js/core/base.js ---- */
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
;

/* ---- js/core/icons.js ---- */
/**
 * Dashboard core: the module's one icon set — 24×24 stroke path bodies for
 * ns.iconSvg / ns.iconButton (base.js).
 *
 * Every glyph that more than one surface draws lives here, so "save as image"
 * is the same arrow on a chart, the knowledge graph and the entity network, and
 * the fullscreen, copy and close glyphs cannot drift apart. A glyph only one
 * surface ever draws (the stat-card badges, the knowledge graph's label and
 * freeze toggles) may stay beside its code, but anything shared comes from here.
 * The bodies are module-authored constants, never curator data.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    ns.ICONS = {
        // Fullscreen: four corners out / in.
        expand: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>'
            + '<line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
        collapse: '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>'
            + '<line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>',
        // Save as image (a download tray) and download data (a sheet).
        save: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>'
            + '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
        csv: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>'
            + '<path d="M14 2v6h6"/><path d="M8 13h8M8 17h8"/>',
        // Fill patterns (decals) toggle.
        patterns: '<line x1="4" y1="20" x2="20" y2="4"/><line x1="4" y1="14" x2="14" y2="4"/>'
            + '<line x1="4" y1="8" x2="8" y2="4"/><line x1="10" y1="20" x2="20" y2="10"/>'
            + '<line x1="16" y1="20" x2="20" y2="16"/>',
        // Copy embed code, and the confirmation that replaces it.
        embed: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
        check: '<polyline points="20 6 9 17 4 12"/>',
        close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        reset: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
        pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>'
            + '<circle cx="12" cy="10" r="3"/>',
        book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5'
            + 'a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>'
    };
})();
;

/* ---- js/core/theme.js ---- */
/**
 * Dashboard core: shared design tokens — the categorical, halo and entity-type
 * palettes, the THEME object, and the ECharts theme built from them.
 *
 * THEMING — follows the DRE theme.
 * ----------------------------------------------------------------------------
 * Chart colours are NOT hard-coded here; they are read at runtime from the
 * Africa Multiple "Digital Research Environment" theme's CSS custom properties
 * (design tokens):
 *   https://github.com/AM-Digital-Research-Environment/DRE-theme
 *
 * `readTheme()` resolves the theme tokens (--primary, --ink, --surface, …) into
 * the shared THEME object and builds an ECharts theme from them. The theme
 * resolves the mode before first paint and writes it as `data-theme` on <html>
 * and <body>; the module follows that resolved mode — including the live
 * toggle, subscribed once in startup.js through ns.onThemeChange (which
 * delegates to window.DRETokens) — by re-reading the tokens and calling
 * `chart.setTheme()` (ECharts 6) on every live chart, rebuilding every map and
 * repainting every tracked canvas renderer (ns.refresh, charts.js).
 *
 * ►► Resolve colours through `ns.cssColor('--token', 'literal')` — never add a
 *    raw hex value that won't react to the theme, and take the literal from
 *    scripts/lib/dre-tokens-fallback.json. ◄◄
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    // Categorical palette for multi-series charts — led by the Africa Multiple
    // cluster brand colours, then harmonious extensions for charts with many
    // series. Rebuilt per light/dark by readTheme() (via buildPalette) and
    // mutated IN PLACE so modules that captured a reference see the update.
    // Compare-mode still relies on a stable colour-by-index mapping.
    //
    //   Cluster brand: Uni-Grün #009260 · Gelb #F59C08 · Hellblau #44B8F2 ·
    //                  Braun #D57912 · Dunkelblau #00268A · Gold #CCA352
    //
    // The dark variant lifts the two darkest brand hues (Uni-Grün, Dunkelblau),
    // which are near-invisible on the forest-dark surface, and nudges the rest
    // lighter so every series stays legible.
    ns._PALETTE_LIGHT = [
        '#009260', '#f59c08', '#44b8f2', '#d57912', '#00268a', '#cca352',
        '#0e7c71', '#8a4fb0', '#6fa82e', '#b0392e', '#2e6fe0', '#8c6a2b'
    ];
    ns._PALETTE_DARK = [
        '#1fb083', '#f7ae3a', '#7ccbf7', '#ec9a4d', '#6e8ce8', '#dcc084',
        '#3fb8a5', '#b49be6', '#9ccb4e', '#e8705a', '#6ba0f2', '#cba45e'
    ];

    /** The cluster categorical palette for the given mode (fresh copy). */
    ns.buildPalette = function (dark) {
        return (dark ? ns._PALETTE_DARK : ns._PALETTE_LIGHT).slice();
    };

    ns.COLORS = ns.buildPalette(false);

    // Community-halo ring palette (knowledge graph). A ring encodes the node's
    // co-occurrence community while the fill encodes its entity type, so the
    // halos are deliberately DISTINCT from the categorical fills above — but
    // they stay in the same warm "pigment" world as the brand (no Material
    // pink/indigo). Light mode uses deep pigment-pot tones, inkier than every
    // fill, so rings read as drawn outlines on the warm-stone surface; dark
    // mode lifts the same hue stations luminous for the forest surface.
    // Rebuilt per mode by readTheme() and mutated IN PLACE like COLORS, so the
    // graph's _rvRebuild re-colours rings on every light/dark toggle.
    ns._HALO_LIGHT = [
        '#8e2a4c', // wine
        '#9a4a16', // sienna
        '#67701f', // moss
        '#11607e', // petrol
        '#44549b', // slate indigo
        '#7b2f86', // plum
        '#6f4a1d', // cocoa
        '#a83a68'  // magenta clay
    ];
    ns._HALO_DARK = [
        '#e87b9b', // rose
        '#dd8a55', // copper
        '#bdc24f', // chartreuse
        '#54b2d8', // cyan
        '#9b9bee', // periwinkle
        '#c873d2', // orchid
        '#d4a878', // sand
        '#e388b9'  // pink clay
    ];

    /** The community-halo ring palette for the given mode (fresh copy). */
    ns.buildHaloPalette = function (dark) {
        return (dark ? ns._HALO_DARK : ns._HALO_LIGHT).slice();
    };

    ns.HALO = ns.buildHaloPalette(false);

    /* ------------------------------------------------------------------ */
    /*  Entity-type colours — one mapping for every network                */
    /* ------------------------------------------------------------------ */

    // An entity type must keep ONE colour everywhere: a person is the same hue on
    // an item's knowledge graph, on the Entity Network, and on a contributor
    // network. Colouring by the *index* a category happened to land at cannot do
    // that — the knowledge graph discovers categories in per-item order, so Person
    // could be slot 1 (the project hue) on one item and slot 3 on the next.
    //
    // Slots 0-2 are inherited from the convention the contributor network already
    // encoded (person / project / institution), so those three graphs keep the
    // colours they have today and everything else lines up behind them.
    //
    // This is the entity-TYPE axis only. Graphs that colour by a different axis —
    // Louvain community (Discursive Communities) or one hue per individual
    // co-author (Collaboration Network) — legitimately index the palette directly
    // and must not be routed through here.
    var ENTITY_SLOT = {
        // 0 — people
        'person': 0, 'persons': 0, 'people': 0, 'creator': 0, 'author': 0, 'agent': 0,
        // 1 — projects
        'project': 1, 'projects': 1,
        // 2 — organisations
        'institution': 2, 'institutions': 2, 'organization': 2, 'organisation': 2,
        'organizations': 2, 'organisations': 2, 'affiliation': 2, 'affiliations': 2,
        'sponsor': 2, 'sponsors': 2, 'funder': 2, 'funders': 2,
        // 3 — subjects (the data model folds the former free-form tags in here)
        'subject': 3, 'subjects': 3, 'tag': 3, 'tags': 3, 'topic': 3, 'topics': 3,
        'keyword': 3, 'keywords': 3,
        // 4 — places
        'location': 4, 'locations': 4, 'place': 4, 'places': 4, 'spatial': 4,
        'country': 4, 'countries': 4,
        // 5 — genre / form
        'genre': 5, 'genres': 5, 'format': 5, 'formats': 5,
        'resource type': 5, 'type of resource': 5,
        // 6 — languages
        'language': 6, 'languages': 6,
        // 7 — contributor roles (marcrel:*), kept apart from plain Person so a
        //     graph showing both does not give them one swatch
        'contributor': 7, 'contributors': 7, 'role': 7, 'roles': 7,
        // 8 — items (also the fallback: an unrecognised label on these graphs is
        //     almost always a resource-class name on the centre node, which is an
        //     item, and which the renderer already marks out by size and border)
        'item': 8, 'items': 8, 'research item': 8, 'research items': 8,
        'linked item': 8, 'linked items': 8,
        // 9 / 10 — the knowledge graph's two discovery-flavoured item buckets
        'related item': 9, 'related items': 9,
        'shared item': 10, 'shared items': 10,
        // 11 — groupings
        'research section': 11, 'research sections': 11, 'section': 11, 'sections': 11,
        'group': 11, 'groups': 11
    };
    var ENTITY_SLOT_FALLBACK = 8;

    /** Palette slot for an entity-type label (case/whitespace-insensitive). */
    ns.entityColorIndex = function (name) {
        var key = String(name == null ? '' : name).toLowerCase().trim().replace(/\s+/g, ' ');
        var slot = ENTITY_SLOT[key];
        return slot === undefined ? ENTITY_SLOT_FALLBACK : slot;
    };

    // Slot → the DRE theme's published entity-type token. The family used to
    // live here and nowhere else, as a private registry, while DRE Search
    // authored against a CSS variable (--type-entity-term) that nothing defined
    // — so a Person chip in search results and a Person node in a graph could
    // not be guaranteed to be the same hue. The theme now publishes the family
    // (see DESIGN.md §9), which makes it one name per meaning across all three
    // repositories; the palette slot stays as the fallback for a non-DRE host.
    var ENTITY_TOKEN = [
        '--entity-person', '--entity-project', '--entity-organisation',
        '--entity-subject', '--entity-location', '--entity-genre',
        '--entity-language', '--entity-contributor', '--entity-item',
        '--entity-item-related', '--entity-item-shared', '--entity-grouping'
    ];

    /** The stable colour for an entity-type label, in the active theme. */
    ns.entityColor = function (name) {
        var slot = ns.entityColorIndex(name);
        var swatch = ns.COLORS[slot % ns.COLORS.length];
        var token = ENTITY_TOKEN[slot];
        return token ? ns.cssColor(token, swatch) : swatch;
    };

    // Resolved token colours, per theme. Resolving one costs a style write, a
    // forced style recalculation and a canvas readback, and the canvas graphs
    // ask for an entity colour per node per frame; readTheme() clears this.
    var _colorCache = Object.create(null);

    // Shared design tokens. Colour values are placeholders here; readTheme()
    // overwrites them in place (so modules that captured `ns.THEME` see updates)
    // from the DRE theme's CSS variables on load and on every theme change.
    // These are the values readTheme() overwrites, so they only ever paint in
    // the guard path — before the theme has resolved, or on a host without it.
    // They were nonetheless a whole second palette: a teal accent (#22817b, not
    // Uni-Grün), Material's #b2dfdb, and the cold greys #333 / #666 / #e0e0e0 /
    // #f0f0f0 that DESIGN.md names as an anti-pattern. A safety net is exactly
    // where a design system quietly stores a different design, so these are now
    // the theme's own generated light values (dre-tokens-fallback.json) and the
    // shared lint checks them.
    ns.THEME = {
        accent: '#007a50',        // ← --primary
        accentDark: '#006743',    // ← --primary-hover
        accentLight: '#e4f0e6',   // ← --primary-muted
        gradientEnd: '#e4f0e6',   // ← --primary-muted (bar/area gradient tail)
        text: '#3c342d',          // ← --ink (primary chart text)
        textMuted: '#5f5650',     // ← --ink-light (axis labels, secondary)
        heading: '#261d15',       // ← --ink-strong
        border: '#fdfcf9',        // ← --surface (segment gaps, marker strokes)
        grid: '#dbd7d1',          // ← --border (axis lines)
        gridLight: '#eae8e3',     // ← --border-light (split lines)
        surface: '#fdfcf9',       // ← --surface (export background)
        muted: '#716a66',         // ← --muted (dimmed graph marks)
        // ← --font-body (in-chart UI text) / --font-display (in-canvas titles)
        fontFamily: '"Hanken Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
        fontDisplay: '"Spectral", Georgia, "Times New Roman", serif',
        fontSize: 12,   // Hanken sits visually smaller than the canvas default at 11
        fontSizeTitle: 14,
        fontSizeEmphasis: 13,
        labelMaxLen: 30,
        barMaxWidth: 24,
        barMaxWidthWide: 40
    };

    ns._echartsTheme = null;
    ns._darkMode = false;

    /* ------------------------------------------------------------------ */
    /*  Theme-token resolution                                             */
    /* ------------------------------------------------------------------ */

    // DRE-theme publishes the canonical token bridge as `window.DRETokens`
    // (asset/js/dre-token-bridge.js; DESIGN-INTEGRATION.md "JavaScript token
    // bridge"). Every call below prefers it, so the module resolves tokens and
    // the theme mode exactly as the theme and DRE Search do. The local
    // implementations are only the off-theme fallback, for a host that does not
    // ship DRE-theme (an isolated preview, an embed on another stack).
    //
    // The technique is the same either way, and it matters: zrender (ECharts)
    // and MapLibre both FAIL to parse oklch()/oklab(), so a hidden probe parented
    // to <body> inherits the live [data-theme] cascade and a 1px canvas
    // rasterises whatever the browser computed into a plain sRGB string.
    function bridge() {
        var tokens = window.DRETokens;
        return tokens && typeof tokens.cssColor === 'function' ? tokens : null;
    }

    var _probe = null;
    var _ctx = null;

    function getProbe() {
        if (!_probe) {
            _probe = document.createElement('span');
            _probe.setAttribute('aria-hidden', 'true');
            _probe.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:0;height:0;pointer-events:none';
        }
        // Keep the probe parented to <body> so it inherits the active
        // body[data-theme] cascade (it may be created before <body> exists).
        var host = document.body || document.documentElement;
        if (host && _probe.parentNode !== host) host.appendChild(_probe);
        return _probe;
    }

    /**
     * Rasterise any browser-parseable CSS colour (incl. oklch()/oklab()/
     * color-mix()) to a plain rgb()/rgba() string that zrender and MapLibre
     * can parse.
     */
    ns.toRGB = function (color) {
        var tokens = bridge();
        if (tokens && typeof tokens.toRGB === 'function') return tokens.toRGB(color);
        if (!_ctx) {
            var cv = document.createElement('canvas');
            cv.width = cv.height = 1;
            _ctx = cv.getContext('2d', { willReadFrequently: true });
        }
        if (!_ctx) return color;
        _ctx.clearRect(0, 0, 1, 1);
        _ctx.fillStyle = '#000';
        _ctx.fillStyle = color;            // browser parses oklch/color-mix here
        _ctx.fillRect(0, 0, 1, 1);
        var d = _ctx.getImageData(0, 0, 1, 1).data;
        if (d[3] === 0) return 'rgba(0,0,0,0)';
        if (d[3] === 255) return 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')';
        return 'rgba(' + d[0] + ',' + d[1] + ',' + d[2] + ',' + (d[3] / 255).toFixed(3) + ')';
    };

    /**
     * Resolve a CSS custom property to a plain rgb()/rgba() colour string.
     *
     * The fallback is only ever painted on a host without DRE-theme. Copy it from
     * scripts/lib/dre-tokens-fallback.json (its light or dark column) and write
     * it as a LITERAL at the call site — `ns.cssColor('--ink', '#3c342d')` — so
     * the shared token lint can check it. A fallback computed at run time, or a
     * call through a local alias of this function, is invisible to it.
     *
     * @param {string} name  e.g. '--primary'
     * @param {string} fallback  used when the host theme lacks the token
     */
    ns.cssColor = function (name, fallback) {
        fallback = fallback || '#000';
        var key = name + '|' + fallback;
        if (key in _colorCache) return _colorCache[key];
        var color;
        var tokens = bridge();
        if (tokens) {
            color = tokens.cssColor(name, fallback);
        } else {
            try {
                var probe = getProbe();
                probe.style.color = '';
                probe.style.color = 'var(' + name + ', ' + fallback + ')';
                var resolved = getComputedStyle(probe).color;
                color = ns.toRGB(resolved || fallback) || fallback;
            } catch (e) {
                return fallback; // not cached: the probe may simply not exist yet
            }
        }
        _colorCache[key] = color;
        return color;
    };

    /**
     * Resolve a CSS custom property holding a font stack (e.g. --font-body)
     * to the active theme's computed font-family string. Unlike colours this
     * needs no rasterising — canvas font shorthand accepts a stack directly.
     */
    ns.cssFont = function (name, fallback) {
        var tokens = bridge();
        if (tokens && typeof tokens.cssFont === 'function') return tokens.cssFont(name, fallback);
        try {
            var probe = getProbe();
            probe.style.fontFamily = '';
            probe.style.fontFamily = 'var(' + name + ', ' + fallback + ')';
            return getComputedStyle(probe).fontFamily || fallback;
        } catch (e) {
            return fallback;
        }
    };

    /**
     * Whether the active theme is dark.
     *
     * The answer is the RESOLVED `data-theme` that DRE-theme writes to <html>
     * and <body> before first paint (the stored choice, else the OS default) —
     * never the OS preference on a themed page, which inverts for every visitor
     * who chose the other mode. Only a host that writes no attribute at all
     * falls through to the media query, exactly as window.DRETokens.isDark()
     * does and as the `:root:not([data-theme="light"])` guard in the module's
     * CSS fallback does, so canvas and HTML still agree off-theme.
     */
    ns.isDark = function () {
        var tokens = bridge();
        if (tokens && typeof tokens.isDark === 'function') return tokens.isDark();
        var body = document.body && document.body.getAttribute('data-theme');
        if (body === 'dark') return true;
        if (body === 'light') return false;
        var root = document.documentElement.getAttribute('data-theme');
        if (root === 'dark') return true;
        if (root === 'light') return false;
        return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    };

    /**
     * Call `handler(isDark)` whenever the resolved theme mode changes; returns
     * an unsubscribe function. Delegates to window.DRETokens.onThemeChange, so
     * the page shares the theme's one observer; off-theme, one local observer
     * watches `data-theme` on <html> and <body> for every subscriber.
     */
    var _themeListeners = [];
    var _themeObserver = null;
    ns.onThemeChange = function (handler) {
        if (typeof handler !== 'function') return function () {};
        var tokens = bridge();
        if (tokens && typeof tokens.onThemeChange === 'function') return tokens.onThemeChange(handler);
        _themeListeners.push(handler);
        if (!_themeObserver && window.MutationObserver) {
            _themeObserver = new window.MutationObserver(function () {
                var dark = ns.isDark();
                _themeListeners.slice().forEach(function (listener) {
                    try { listener(dark); } catch (e) { /* one bad listener must not stop the others */ }
                });
            });
            var options = { attributes: true, attributeFilter: ['data-theme'] };
            _themeObserver.observe(document.documentElement, options);
            if (document.body) _themeObserver.observe(document.body, options);
        }
        return function () {
            var at = _themeListeners.indexOf(handler);
            if (at !== -1) _themeListeners.splice(at, 1);
        };
    };

    /** Parse an 'rgb(r,g,b)' / 'rgba(...)' string to a [r,g,b] array. */
    function _parseRGB(s) {
        var m = /(\d+)\D+(\d+)\D+(\d+)/.exec(s || '');
        return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
    }

    /** Lerp between two browser-parseable colours (incl. oklch / var()); → 'rgb()'. */
    ns.mix = function (a, b, t) {
        var pa = _parseRGB(ns.toRGB(a)), pb = _parseRGB(ns.toRGB(b));
        return 'rgb(' + Math.round(pa[0] + (pb[0] - pa[0]) * t) + ','
            + Math.round(pa[1] + (pb[1] - pa[1]) * t) + ','
            + Math.round(pa[2] + (pb[2] - pa[2]) * t) + ')';
    };

    /** A browser-parseable colour (incl. a resolved token) at `alpha` opacity; → 'rgba()'. */
    ns.withAlpha = function (color, alpha) {
        return 'rgba(' + _parseRGB(ns.toRGB(color)).join(',') + ',' + alpha + ')';
    };

    /**
     * Five-stop sequential ramp from a faint surface tint (low values) to the
     * brand accent / Uni-Grün (high values), resolved for the ACTIVE theme. Use
     * for heatmap / density visualMaps so low cells sit quietly on the panel and
     * the ramp follows light / dark instead of being locked to a light palette.
     *
     * @param {number[]} [ratios] how far each stop sits toward the surface
     *     (0 = full accent); the default suits a visualMap, the choropleth
     *     passes its own slightly lighter set
     */
    ns.accentRamp = function (ratios) {
        var base = ns._darkMode ? ns.cssColor('--surface', '#0e1612') : ns.cssColor('--surface', '#fdfcf9');
        return (ratios || [0.86, 0.65, 0.44, 0.22, 0]).map(function (r) {
            return ns.mix(ns.THEME.accent, base, r);
        });
    };

    /** Read DRE theme tokens into THEME (in place) and rebuild the ECharts theme. */
    ns.readTheme = function () {
        _colorCache = Object.create(null);
        ns._darkMode = ns.isDark();

        // Re-point the categorical palette to the active light/dark cluster set,
        // mutating the array in place so captured references stay valid.
        var pal = ns.buildPalette(ns._darkMode);
        ns.COLORS.length = 0;
        Array.prototype.push.apply(ns.COLORS, pal);

        // Same in-place swap for the knowledge-graph community halo rings.
        var halo = ns.buildHaloPalette(ns._darkMode);
        ns.HALO.length = 0;
        Array.prototype.push.apply(ns.HALO, halo);

        var t = ns.THEME;
        var dark = ns._darkMode;

        // Type follows the DRE theme: Hanken Grotesk for in-chart UI text,
        // Spectral for the rare in-canvas title — same stacks the page uses,
        // with the theme's own fallbacks for non-DRE hosts.
        t.fontFamily = ns.cssFont('--font-body',
            '"Hanken Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif');
        t.fontDisplay = ns.cssFont('--font-display',
            '"Spectral", Georgia, "Times New Roman", serif');

        // Each fallback is the theme's generated value for that mode
        // (scripts/lib/dre-tokens-fallback.json), written as one literal call
        // per mode so the token lint checks every one of them. They paint only
        // on a host without DRE-theme; under the theme each token resolves.
        t.accent      = dark ? ns.cssColor('--primary', '#4da67b') : ns.cssColor('--primary', '#007a50');
        t.accentDark  = dark ? ns.cssColor('--primary-hover', '#6ab38e') : ns.cssColor('--primary-hover', '#006743');
        t.accentLight = dark ? ns.cssColor('--primary-muted', '#153023') : ns.cssColor('--primary-muted', '#e4f0e6');
        t.gradientEnd = t.accentLight;
        t.text        = dark ? ns.cssColor('--ink', '#e3e1db') : ns.cssColor('--ink', '#3c342d');
        t.textMuted   = dark ? ns.cssColor('--ink-light', '#b0aea7') : ns.cssColor('--ink-light', '#5f5650');
        t.heading     = dark ? ns.cssColor('--ink-strong', '#f6f5f1') : ns.cssColor('--ink-strong', '#261d15');
        t.border      = dark ? ns.cssColor('--surface', '#0e1612') : ns.cssColor('--surface', '#fdfcf9');
        t.surface     = t.border;
        t.grid        = dark ? ns.cssColor('--border', '#2c3531') : ns.cssColor('--border', '#dbd7d1');
        t.gridLight   = dark ? ns.cssColor('--border-light', '#1e2622') : ns.cssColor('--border-light', '#eae8e3');
        // The quiet, de-emphasised mark colour (dimmed graph nodes and edges):
        // the theme's warm muted ink, so a faded mark stays in the stone family
        // instead of turning the cold blue-grey it used to be.
        t.muted       = dark ? ns.cssColor('--muted', '#9c9891') : ns.cssColor('--muted', '#716a66');

        ns._echartsTheme = ns.buildEchartsTheme();
        return t;
    };
    /** Build an ECharts theme object from the resolved THEME tokens. */
    ns.buildEchartsTheme = function () {
        var t = ns.THEME;
        // One clean axis style for every axis type. No split lines and no split
        // areas anywhere: charts read cleanly on the panel surface and bar charts
        // (value axis on the x-axis) no longer get vertical "graph paper" lines.
        // ECharts keeps the baseline on category axes and hides it on value axes
        // by default, which is exactly the clean look we want.
        var axis = {
            axisLine:  { lineStyle: { color: t.grid } },
            axisTick:  { lineStyle: { color: t.grid } },
            axisLabel: { color: t.textMuted, fontFamily: t.fontFamily },
            splitLine: { show: false },
            splitArea: { show: false }
        };
        return {
            color: ns.COLORS,
            backgroundColor: 'transparent',   // let the panel --surface show through
            textStyle: { color: t.text, fontFamily: t.fontFamily },
            title: {
                // In-canvas titles take the display serif, matching the HTML
                // <h3> headings the dashboard renders around the charts.
                textStyle: { color: t.heading, fontFamily: t.fontDisplay },
                subtextStyle: { color: t.textMuted, fontFamily: t.fontFamily }
            },
            legend: {
                textStyle: { color: t.text, fontFamily: t.fontFamily },
                pageTextStyle: { color: t.textMuted }
            },
            tooltip: {
                backgroundColor: ns._darkMode ? ns.cssColor('--surface-raised', '#151d19') : ns.cssColor('--surface-raised', '#faf8f4'),
                borderColor: t.grid,
                textStyle: { color: t.text, fontFamily: t.fontFamily }
            },
            categoryAxis: axis,
            valueAxis: axis,
            logAxis: axis,
            timeAxis: axis,
            line: { lineStyle: { width: 2 } },
            pie: { itemStyle: { borderColor: t.border, borderWidth: 2 } },
            scatter: { itemStyle: { borderColor: t.border, borderWidth: 1 } },
            graph: {
                itemStyle: { borderColor: t.border },
                lineStyle: { color: t.grid },
                label: { color: t.text, fontFamily: t.fontFamily }
            },
            treemap: {
                itemStyle: { borderColor: t.border },
                breadcrumb: { itemStyle: { color: t.gridLight, textStyle: { color: t.text } } }
            },
            sunburst: { itemStyle: { borderColor: t.border, borderWidth: 1 } },
            heatmap: { itemStyle: { borderColor: t.border, borderWidth: 1 } },
            sankey: {
                label: { color: t.text },
                lineStyle: { color: 'source', opacity: 0.4 }
            },
            visualMap: { textStyle: { color: t.text, fontFamily: t.fontFamily } },
            timeline: {
                lineStyle: { color: t.grid },
                label: { color: t.textMuted, fontFamily: t.fontFamily },
                controlStyle: { color: t.textMuted, borderColor: t.grid }
            }
        };
    };

    /** Background colour to use when exporting a chart as a PNG. */
    ns.exportBg = function () {
        return ns._darkMode ? ns.cssColor('--surface', '#0e1612') : ns.cssColor('--surface', '#fdfcf9');
    };
})();
;

/* ---- js/core/data.js ---- */
/**
 * Dashboard core: where module assets and generated data live, and the one
 * loader every generated artifact goes through — the published-generation
 * manifest, the per-page body cache, and the pruned-generation retry.
 *
 * Needs nothing from the other core files, so tests/js/dashboard.test.mjs runs
 * it on its own with `fetch` as the only stub. Source file of the generated
 * asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    ns.basePath = '';     // Omeka base path, set by the dashboard orchestrator

    /** Resolve a module asset (under asset/) to an absolute URL, e.g.
     *  ns.moduleAsset('data/geo/countries.geojson'). Needs ns.basePath. */
    ns.moduleAsset = function (path) {
        return ns.basePath + '/modules/DreVisualizations/asset/' + path;
    };

    /**
     * Resolve a generated-data path through the atomically published manifest.
     * The checked endpoint serves only the current generation with no-store.
     */
    ns.dataBase = function () {
        if (!window.RV_DATA_BASE) throw new Error('No canonical snapshot endpoint configured');
        return window.RV_DATA_BASE;
    };
    ns.dataAsset = function (path) {
        path = String(path || '').replace(/^\/+/, '');
        if (!path || path.split('/').some(function (segment) { return segment === '..'; })) {
            return Promise.reject(new Error('Invalid generated-data path'));
        }
        if (!ns._dataManifestPromise) {
            var manifestUrl = ns.dataBase() + 'current.json';
            ns._dataManifestPromise = fetch(manifestUrl, {
                cache: 'no-store', credentials: 'same-origin'
            }).then(function (response) {
                if (!response.ok) throw new Error('Snapshot unavailable');
                return response.json();
            }).then(function (manifest) {
                var id = manifest && String(manifest.generationId || '');
                if (!/^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/.test(id)) throw new Error('Invalid snapshot manifest');
                return id;
            }).catch(function (error) { ns._dataManifestPromise = null; throw error; });
        }
        return ns._dataManifestPromise.then(function (generationId) {
            return ns.dataBase() + 'generations/' + generationId + '/' + path;
        });
    };

    // Artifact bodies by generation URL, for this page only. Generation URLs are
    // immutable, so two blocks (or a block and the sparkline) asking for the
    // same artifact share one download. Text, not parsed JSON, is shared: every
    // caller gets its own objects and may sort or annotate them freely. The
    // server's no-store still keeps withdrawn data out of the browser's cache.
    ns._dataBodies = Object.create(null);

    /** Central JSON loader for every generated dashboard artifact. */
    ns.fetchDataJson = function (path, options) {
        options = options || {};
        var signal = options.signal;
        var requestOptions = Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options);
        delete requestOptions.signal; // a shared download must not die with one caller
        function download(url) {
            if (!ns._dataBodies[url]) {
                ns._dataBodies[url] = fetch(url, requestOptions).then(function (response) {
                    if (!response.ok) {
                        var error = new Error('Generated data not found (' + response.status + '): ' + url);
                        error.status = response.status;
                        throw error;
                    }
                    return response.text();
                });
                ns._dataBodies[url].catch(function () { delete ns._dataBodies[url]; });
            }
            return ns._dataBodies[url];
        }
        function read(url) {
            var body = download(url);
            if (signal) {
                // Honour the caller's cancellation without cancelling the download.
                body = Promise.race([body, new Promise(function (resolve, reject) {
                    var abort = function () {
                        var error = new Error('Aborted');
                        error.name = 'AbortError';
                        reject(error);
                    };
                    if (signal.aborted) abort();
                    else signal.addEventListener('abort', abort, { once: true });
                })]);
            }
            return body.then(function (text) { return JSON.parse(text); });
        }
        return ns.dataAsset(path).then(function (url) {
            var manifest = ns._dataManifestPromise;
            return read(url).catch(function (error) {
                if (error.status !== 404) throw error;
                // A long-lived page may point at a pruned generation. Concurrent
                // failures share a single refreshed manifest; retry only a new URL.
                if (ns._dataManifestPromise === manifest) ns._dataManifestPromise = null;
                return ns.dataAsset(path).then(function (freshUrl) {
                    if (freshUrl === url) throw error;
                    return read(freshUrl);
                });
            });
        }).then(function (payload) {
            if (!payload || typeof payload !== 'object') {
                throw new Error('Generated data has an invalid top-level value');
            }
            return payload;
        });
    };
})();
;

/* ---- js/core/libs.js ---- */
/**
 * Dashboard core: the lazy loader for the heavy third-party libraries (ECharts,
 * its word-cloud extension, MapLibre and the d3-force stack).
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    /**
     * Inject the heavy chart/map libraries on demand, returning a Promise that
     * resolves once the requested libraries are ready. Calls cache per library,
     * so a map-only block can load MapLibre without preventing a later dashboard
     * from loading ECharts.
     *
     * URLs come from window.RV_LIBS (emitted by the DashboardAssets helper on the
     * lazy surfaces). When a library was loaded eagerly, its global is already
     * defined and that part resolves immediately.
     *
     * Recognised keys: `echarts`, `wordcloud` (implies echarts), `maplibre`, and
     * `d3` (the d3-force stack the graph renderer simulates with).
     *
     * The default set — what a dashboard asks for — includes `d3` because a
     * dashboard cannot know which charts it holds until its JSON has arrived, and
     * this runs before that fetch. At ~17 KiB beside the 1.1 MiB of ECharts already
     * in the same set, requesting it unconditionally costs less than the round trip
     * a chart-driven decision would need. Callers that know exactly what they need
     * (the knowledge graph, the maps) still pass an explicit set and get only that.
     */
    ns.ensureLibs = function (required) {
        required = required || { echarts: true, wordcloud: true, maplibre: true, d3: true };
        if (required.wordcloud) required.echarts = true;

        ns._libPromises = ns._libPromises || {};
        var cfg = window.RV_LIBS || {};
        var head = document.head || document.getElementsByTagName('head')[0];

        function loadScript(key, src, isReady) {
            if (isReady && isReady()) return Promise.resolve();
            if (ns._libPromises[key]) return ns._libPromises[key];
            ns._libPromises[key] = new Promise(function (resolve, reject) {
                if (!src) {
                    resolve();
                    return;
                }
                var existing = head.querySelector('script[src="' + src + '"]');
                if (existing) {
                    if (existing.dataset.rvLoaded || (isReady && isReady())
                        || (document.readyState !== 'loading' && !existing.dataset.rvLoading)) {
                        existing.dataset.rvLoaded = '1';
                        resolve();
                        return;
                    }
                    existing.addEventListener('load', function () {
                        existing.dataset.rvLoaded = '1';
                        delete existing.dataset.rvLoading;
                        resolve();
                    });
                    existing.addEventListener('error', reject);
                    return;
                }
                var s = document.createElement('script');
                s.src = src;
                s.dataset.rvLoading = '1';
                s.onload = function () {
                    s.dataset.rvLoaded = '1';
                    delete s.dataset.rvLoading;
                    resolve();
                };
                s.onerror = function (error) {
                    // Drop the dead tag, so "Try again" injects a fresh one.
                    if (s.parentNode) s.parentNode.removeChild(s);
                    reject(error);
                };
                head.appendChild(s);
            });
            forgetOnFailure(key);
            return ns._libPromises[key];
        }

        /**
         * A failed load must not be cached: every surface's "Try again" reruns
         * its request through here, and a remembered rejection would fail it
         * again at once without touching the network.
         */
        function forgetOnFailure(key) {
            var promise = ns._libPromises[key];
            promise.catch(function () {
                if (ns._libPromises[key] === promise) delete ns._libPromises[key];
            });
        }

        /**
         * The ESM counterpart of loadScript, for libraries that ship as modules
         * rather than as a global-defining classic script (MapLibre 6 and up).
         *
         * A dynamic import() is legal inside this classic script and the browser's
         * own module map de-duplicates by resolved URL, so the injected-<script>
         * bookkeeping loadScript needs has no equivalent here: `isReady` covers
         * the case where an eager surface already imported it (DashboardAssets
         * emits an inline module shim there), and ns._libPromises covers repeat
         * callers within this page. `register` runs once, before any caller sees
         * the promise settle, and is where the namespace becomes a global.
         */
        function loadModule(key, src, isReady, register) {
            if (isReady && isReady()) return Promise.resolve();
            if (ns._libPromises[key]) return ns._libPromises[key];
            ns._libPromises[key] = !src
                ? Promise.resolve()
                // eslint-disable-next-line no-unsanitized/method -- server-configured RV_LIBS URL
                : import(src).then(function (mod) {
                    if (register) register(mod);
                });
            forgetOnFailure(key);
            return ns._libPromises[key];
        }

        function loadStyle(href) {
            if (!href || head.querySelector('link[href="' + href + '"]')) return;
            var l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = href;
            head.appendChild(l);
        }

        var work = [];
        var echartsReady = function () { return typeof window.echarts !== 'undefined'; };
        var maplibreReady = function () { return typeof window.maplibregl !== 'undefined'; };
        // d3-force is the only d3 module the module needs a global for; testing
        // for the entry point (not just `window.d3`) also means a host page that
        // already ships full d3 satisfies this without a second download.
        var d3Ready = function () { return !!(window.d3 && window.d3.forceSimulation); };

        if (required.d3 && !d3Ready()) {
            // RV_LIBS.d3 is an ORDERED list (DashboardAssets::D3_SCRIPTS): the
            // d3-force UMD wrapper resolves d3-quadtree / d3-dispatch / d3-timer
            // off the shared `d3` global, so these must EXECUTE sequentially —
            // chained, never Promise.all'd like the independent libraries below.
            var d3Srcs = cfg.d3;
            if (typeof d3Srcs === 'string') d3Srcs = [d3Srcs];
            if (!Array.isArray(d3Srcs)) d3Srcs = [];
            var chain = Promise.resolve();
            d3Srcs.forEach(function (src, i) {
                chain = chain.then(function () { return loadScript('d3-' + i, src, null); });
            });
            work.push(chain);
        }

        if (required.maplibre) {
            loadStyle(cfg.maplibreCss);
            work.push(loadModule('maplibre', cfg.maplibre, maplibreReady, function (mod) {
                // MapLibre 6 is ESM and defines no global; publish the namespace
                // under the name every builder already reaches for.
                window.maplibregl = mod;
                // The worker is a separate file. MapLibre resolves it from
                // import.meta.url by default, but only under its upstream `.mjs`
                // name — scripts/vendor-maplibre.mjs renames it, so it has to be
                // named explicitly (which also gives it Omeka's ?v=). This must
                // happen before the first Map is constructed, which it does: no
                // caller sees the promise resolve until this returns.
                if (cfg.maplibreWorker && typeof mod.setWorkerUrl === 'function') {
                    mod.setWorkerUrl(cfg.maplibreWorker);
                }
            }));
        }
        if (required.echarts) {
            var echartsPromise = loadScript('echarts', cfg.echarts, echartsReady);
            work.push(echartsPromise);
            if (required.wordcloud) {
                work.push(echartsPromise.then(function () {
                    return loadScript('wordcloud', cfg.wordcloud, function () { return !!ns._wordcloudLoaded; })
                        .then(function () { ns._wordcloudLoaded = true; });
                }));
            }
        }

        return Promise.all(work);
    };
})();
;

/* ---- js/core/async.js ---- */
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
                message = message || ns.t('visualizationLoadError', 'The visualization could not be loaded.');
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
;

/* ---- js/core/charts.js ---- */
/**
 * Dashboard core: the lifecycle of every live visualisation — ECharts
 * instances, MapLibre maps (registered by ns.trackMap in maps.js) and custom
 * canvas renderers — from creation and resizing to re-theming and disposal,
 * plus the chart-level helpers builders share.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    ns._allCharts = [];   // tracked ECharts instances
    ns._allMaps = [];     // tracked MapLibre maps: { map, rebuild, el }
    ns._allRenderers = []; // tracked custom renderers: { el, redraw, dispose }

    /* ------------------------------------------------------------------ */
    /*  ECharts instances                                                  */
    /* ------------------------------------------------------------------ */

    /**
     * Init an ECharts instance using the current theme, tracking it for
     * re-theming and resizing. Every chart also gets:
     *   - `role="img"` and an accessible name from its panel heading (and
     *     description), unless the builder set its own — the canvas itself
     *     says nothing to a screen reader;
     *   - no animation when the reader prefers reduced motion (an option set
     *     here is a default the builder's own `animation` still overrides).
     */
    ns.initChart = function (el) {
        if (!ns._echartsTheme) ns.readTheme();
        var existing = window.echarts.getInstanceByDom && window.echarts.getInstanceByDom(el);
        if (existing) existing.dispose();
        var chart = echarts.init(el, ns._echartsTheme);
        ns._allCharts.push(chart);
        if (ns.prefersReducedMotion()) chart.setOption({ animation: false });
        var label = ns.labelChart(el);
        // ECharts writes its own generic aria-label ("This is a chart…") on the
        // container once a builder enables `aria`; a description replaces it.
        if (label) chart.setOption({ aria: { label: { description: label } } });
        ns.observeResize(el);
        return chart;
    };

    /**
     * Give a chart container an image role and a name from its panel heading
     * and description. Returns the name, or '' when the container already has
     * one (a builder that labels its own chart) or no heading to take it from.
     */
    ns.labelChart = function (el) {
        if (!el || !el.setAttribute || el.hasAttribute('aria-label')) return '';
        var panel = el.closest && el.closest('.chart-panel');
        var heading = panel && panel.querySelector('h3');
        var desc = panel && panel.querySelector('.chart-description');
        var name = heading ? (heading.textContent || '').trim() : '';
        if (!name) return '';
        var label = name + (desc && desc.textContent ? ': ' + desc.textContent.trim() : '');
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', label);
        return label;
    };

    // One ResizeObserver for every chart container: a chart resizes when ITS
    // box changes — grid reflow, a sidebar, fullscreen, a late web font — not
    // only on window resize. Callbacks are coalesced into one frame. MapLibre
    // maps track their own container (trackResize), so they are not observed.
    var _resizeObserver = null;
    var _resizeQueued = null;
    ns.observeResize = function (el) {
        if (typeof window.ResizeObserver !== 'function') return;
        if (!_resizeObserver) {
            _resizeObserver = new window.ResizeObserver(function (entries) {
                if (_resizeQueued) return;
                _resizeQueued = entries.map(function (entry) { return entry.target; });
                requestAnimationFrame(function () {
                    var targets = _resizeQueued || [];
                    _resizeQueued = null;
                    targets.forEach(function (target) {
                        var chart = window.echarts && echarts.getInstanceByDom(target);
                        if (chart && !chart.isDisposed()) {
                            try { chart.resize(); } catch (e) { /* detached */ }
                        } else {
                            _resizeObserver.unobserve(target);
                        }
                    });
                });
            });
        }
        _resizeObserver.observe(el);
    };

    /**
     * Run a chart builder and make its result rebuildable on a light/dark
     * switch. Builders bake palette and entity colours into their options, so
     * re-applying the old option in a new theme keeps stale colours; instead
     * ns.refresh() disposes the instance and runs `build` again. A builder that
     * sets its own `_rvRebuild` (same instance, extra DOM — the word cloud,
     * heatmap, boxplot) keeps it. Returns whatever `build` returns.
     */
    ns.buildChart = function (build) {
        var chart = build();
        if (chart && typeof chart.setOption === 'function' && typeof chart._rvRebuild !== 'function') {
            chart._rvRebuild = function () {
                if (!chart.isDisposed()) chart.dispose();
                ns.buildChart(build);
            };
        }
        return chart;
    };

    /**
     * Track a renderer that owns its own canvas — neither an ECharts instance nor
     * a MapLibre map, so neither of the two lists above can re-theme it. The
     * knowledge graph is the one such surface: it paints nodes and edges itself,
     * and on a light/dark toggle it only needs a repaint with the freshly read
     * tokens (no re-layout — node positions must survive the toggle).
     *
     * `redraw` is a zero-arg closure invoked by ns.refresh() AFTER readTheme(), so
     * it sees the new ns.THEME / ns.COLORS / ns.HALO values. Entries whose element
     * has left the document are dropped instead of called.
     *
     * @param {HTMLElement} el      the container, used as the liveness check
     * @param {Function}    redraw  repaint with the current theme
     * @param {Function}   [dispose] release workers, observers and simulations
     *                               when ns.disposeWithin removes the element
     * @returns {Function} untrack — drop the entry without disposing it
     */
    ns.trackRenderer = function (el, redraw, dispose) {
        var entry = { el: el, redraw: redraw, dispose: dispose };
        ns._allRenderers.push(entry);
        return function () {
            ns._allRenderers = ns._allRenderers.filter(function (candidate) { return candidate !== entry; });
        };
    };

    /* ------------------------------------------------------------------ */
    /*  Disposal and re-theming                                            */
    /* ------------------------------------------------------------------ */

    /**
     * Dispose the charts, maps and renderers inside `root` — and any whose
     * element has left the document — BEFORE an owner replaces its DOM.
     */
    ns.disposeWithin = function (root) {
        function removed(el) { return !el || !el.isConnected || (root && (el === root || root.contains(el))); }
        ns._allCharts = ns._allCharts.filter(function (chart) {
            if (chart.isDisposed()) return false;
            if (!removed(chart.getDom())) return true;
            if (_resizeObserver) _resizeObserver.unobserve(chart.getDom());
            chart.dispose();
            return false;
        });
        ns._allMaps = ns._allMaps.filter(function (entry) {
            if (!removed(entry.el)) return true;
            try { entry.map.remove(); } catch (e) { /* already removed */ }
            return false;
        });
        ns._allRenderers = ns._allRenderers.filter(function (entry) {
            if (!removed(entry.el)) return true;
            if (entry.dispose) entry.dispose();
            return false;
        });
    };
    /** Drop (and dispose) every tracked visualisation that has left the document. */
    ns.pruneCharts = function () { ns.disposeWithin(null); };

    /**
     * Re-assert the ACTIVE theme's resolved style colours (tooltip, legend, base
     * text, axes) onto a chart. Necessary because getOption() pins the PREVIOUS
     * theme's resolved values, so re-applying that option (notMerge) would keep
     * e.g. a light tooltip / light axis labels on the dark theme. A final merge
     * setOption with the fresh theme styles overrides those stale pins — this is
     * what makes the hover tooltip and axes follow light / dark.
     */
    ns._reapplyThemeStyles = function (c) {
        var th = ns._echartsTheme, t = ns.THEME, opt = c.getOption();
        var axisStyle = {
            axisLabel: { color: t.textMuted },
            axisLine: { lineStyle: { color: t.grid } },
            axisTick: { lineStyle: { color: t.grid } }
        };
        var ov = {
            color: ns.COLORS,
            textStyle: { color: t.text },
            tooltip: th.tooltip,
            legend: th.legend,
            title: th.title
        };
        ['xAxis', 'yAxis', 'radiusAxis', 'angleAxis', 'singleAxis', 'parallelAxis'].forEach(function (k) {
            if (opt[k] && opt[k].length) ov[k] = opt[k].map(function () { return axisStyle; });
        });
        c.setOption(ov);
    };

    /**
     * Re-apply the active theme to every live chart and map. Triggered when the
     * DRE theme toggles between light and dark (or the system preference does).
     */
    ns.refresh = function () {
        ns.readTheme();
        ns.pruneCharts();

        // ECharts 6: switch the instance theme live, then re-assert the resolved
        // theme styles. Graph-type charts re-apply their structural (per-node /
        // edge) colours via _rvRebuild; the rest get their option re-applied with
        // notMerge (setTheme's documented caveat after merge-mode setOptions).
        // _reapplyThemeStyles then overrides the stale colours getOption() pinned.
        ns._allCharts.forEach(function (c) {
            try {
                c.setTheme(ns._echartsTheme);
                if (typeof c._rvRebuild === 'function') {
                    c._rvRebuild();
                    // A dashboard rebuild disposes this instance and builds a
                    // fresh one from the data, already in the new theme.
                    if (c.isDisposed()) return;
                } else {
                    c.setOption(c.getOption(), { notMerge: true });
                }
                ns._reapplyThemeStyles(c);
            } catch (e) { /* keep going */ }
        });

        // MapLibre: rebuild each map so it picks up the new basemap + colours.
        var maps = ns._allMaps.slice();
        ns._allMaps = [];
        maps.forEach(function (entry) {
            try { if (entry.map && entry.map.remove) entry.map.remove(); } catch (e) { /* noop */ }
            try { if (typeof entry.rebuild === 'function') entry.rebuild(); } catch (e) { /* noop */ }
        });

        // Custom canvas renderers (the knowledge graph): repaint in place, so the
        // simulation's node positions survive the toggle. Drop detached entries.
        ns._allRenderers = ns._allRenderers.filter(function (entry) {
            return entry.el && entry.el.isConnected;
        });
        ns._allRenderers.forEach(function (entry) {
            try { entry.redraw(); } catch (e) { /* keep going */ }
        });
    };

    /* ------------------------------------------------------------------ */
    /*  Builder helpers                                                    */
    /* ------------------------------------------------------------------ */

    /** Build a dataZoom config (slider + scroll) for timeline-type charts. */
    ns.buildDataZoom = function (count) {
        if (count <= 15) return [];
        return [
            { type: 'slider', start: 0, end: 100, bottom: 8, height: 22 },
            { type: 'inside' }
        ];
    };

    /**
     * Add click-to-navigate and pointer cursor on chart elements. Builders put
     * `itemId` on each series data item, which identifies the clicked datum even
     * when two share a name; `entries` (an array, or a function returning the
     * current one) is only the fallback lookup by name.
     */
    ns.addClickHandler = function (chart, entries, siteBase) {
        if (!siteBase) return;
        chart.on('click', function (params) {
            var id = params.data && typeof params.data === 'object' ? params.data.itemId : null;
            if (id == null) {
                var list = typeof entries === 'function' ? entries() : entries;
                var entry = (list || []).find(function (e) { return e.name === params.name; });
                id = entry && entry.itemId;
            }
            if (id != null && id !== '') {
                window.location.href = ns.itemUrl(siteBase, id);
            }
        });
        chart.getZr().on('mousemove', function (e) {
            chart.getZr().setCursorStyle(e.target ? 'pointer' : 'default');
        });
    };
})();
;

/* ---- js/core/maps.js ---- */
/**
 * Dashboard core: the shared MapLibre layer — map construction and controls,
 * the self-hosted basemap and its glyphs, attribution, legends, PNG export,
 * and the small hover / fit helpers the map surfaces have in common.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    /* ------------------------------------------------------------------ */
    /*  Construction and tracking                                          */
    /* ------------------------------------------------------------------ */

    /**
     * Construct a MapLibre map, or return null after showing a notice in its
     * container. Since MapLibre 6.7 the constructor THROWS (GPUInitializationError)
     * when WebGL2 is unavailable — blocked GPU, old device, some VMs — instead of
     * firing an `error` event, so every surface creates its maps through here
     * and simply returns on null.
     */
    ns.createMap = function (options) {
        // Every map speaks the page language: MapLibre's own control names,
        // tooltips and gesture hints come from the module's translated strings.
        options = Object.assign({ locale: ns.mapLocale() }, options);
        try {
            return new maplibregl.Map(options);
        } catch (error) {
            console.warn('DreVisualizations: map unavailable', error);
            var container = typeof options.container === 'string'
                ? document.getElementById(options.container) : options.container;
            if (container) {
                ns.setChildren(container, [ns.el('div', 'rv-no-data rv-map-unavailable', ns.t('mapUnavailable',
                    'This map needs WebGL, which this browser or device cannot provide.'))]);
            }
            return null;
        }
    };

    /**
     * MapLibre's interface strings, translated. The keys are MapLibre's own
     * (its default `locale` table); the values go through RV_I18N like every
     * other string the module shows, so a French page gets French zoom buttons
     * and gesture hints (DESIGN-INTEGRATION.md "Maps").
     */
    ns.mapLocale = function () {
        return {
            'AttributionControl.ToggleAttribution': ns.t('mapToggleAttribution', 'Toggle attribution'),
            'FullscreenControl.Enter': ns.t('fullscreen', 'Fullscreen'),
            'FullscreenControl.Exit': ns.t('exitFullscreen', 'Exit fullscreen'),
            'GlobeControl.Enable': ns.t('mapGlobeEnable', 'Show as a globe'),
            'GlobeControl.Disable': ns.t('mapGlobeDisable', 'Show as a flat map'),
            'Map.Title': ns.t('mapTitle', 'Map'),
            'Marker.Title': ns.t('mapMarker', 'Map marker'),
            'NavigationControl.ResetBearing': ns.t('mapResetBearing', 'Reset the map to north'),
            'NavigationControl.ZoomIn': ns.t('mapZoomIn', 'Zoom in'),
            'NavigationControl.ZoomOut': ns.t('mapZoomOut', 'Zoom out'),
            'Popup.Close': ns.t('mapClosePopup', 'Close popup'),
            'CooperativeGesturesHandler.WindowsHelpText': ns.t('mapGestureWindows', 'Use Ctrl + scroll to zoom the map'),
            'CooperativeGesturesHandler.MacHelpText': ns.t('mapGestureMac', 'Use ⌘ + scroll to zoom the map'),
            'CooperativeGesturesHandler.MobileHelpText': ns.t('mapGestureMobile', 'Use two fingers to move the map')
        };
    };

    /**
     * The one navigation-control preset every map uses: zoom in / out, no
     * compass. The maps are north-up overviews that never rotate on purpose,
     * so a compass is a control with nothing to do.
     */
    ns.navControl = function () {
        return new maplibregl.NavigationControl({ showCompass: false });
    };

    /**
     * The shared fullscreen button (core/fullscreen.js) as a MapLibre control,
     * in place of MapLibre's FullscreenControl: it expands `target` — the map's
     * chart panel, legend included — rather than the bare canvas, and it is the
     * same button, label and Escape behaviour as the graphs'.
     */
    ns.mapFullscreenControl = function (target) {
        var box = null;
        var button = null;
        return {
            onAdd: function (map) {
                box = document.createElement('div');
                box.className = 'maplibregl-ctrl maplibregl-ctrl-group';
                button = ns.fullscreenButton(target || map.getContainer(), {
                    className: 'rv-map-fullscreen',
                    onChange: function () {
                        requestAnimationFrame(function () {
                            try { map.resize(); } catch (e) { /* removed */ }
                        });
                    }
                });
                box.appendChild(button);
                return box;
            },
            onRemove: function () {
                if (button && button.rvDispose) button.rvDispose();
                if (box && box.parentNode) box.parentNode.removeChild(box);
            }
        };
    };

    /**
     * Standard MapLibre map bootstrap shared by the map chart builders: themed
     * basemap, visible source attribution, cooperative gestures, and the common
     * control set. Options:
     *   center, zoom  — initial camera (default [0, 15] / 1.5);
     *   nav           — false to skip the navigation control (ns.navControl);
     *   globe         — false to skip the GlobeControl (default on when the
     *                   vendored MapLibre provides it).
     * Callers still wire theme rebuilds themselves via ns.trackMap(map, rebuild),
     * and must return when it gives null (no WebGL; see ns.createMap).
     */
    ns.initMap = function (el, opts) {
        opts = opts || {};
        var map = ns.createMap({
            container: el,
            style: ns.getBasemapStyle(),
            center: opts.center || [0, 15],
            zoom: opts.zoom != null ? opts.zoom : 1.5,
            attributionControl: ns.getMapAttributionOptions(),
            cooperativeGestures: true
        });
        if (!map) return null;
        if (opts.nav !== false) map.addControl(ns.navControl(), 'top-right');
        map.addControl(ns.mapFullscreenControl(el.closest('.chart-panel') || el.parentNode), 'top-right');
        if (opts.globe !== false && maplibregl.GlobeControl) {
            map.addControl(new maplibregl.GlobeControl(), 'top-right');
        }
        return map;
    };

    /**
     * Track a MapLibre map for re-theming. `rebuild` is a zero-arg closure that
     * re-creates the map (with the current basemap + theme colours) into the
     * same container; it is invoked on theme change.
     */
    ns.trackMap = function (map, rebuild) {
        ns._allMaps.push({ map: map, rebuild: rebuild, el: map.getContainer() });
        map.on('remove', function () {
            ns._allMaps = ns._allMaps.filter(function (entry) { return entry.map !== map; });
        });
        ns.attachMapAttribution(map);
        return map;
    };

    /* ------------------------------------------------------------------ */
    /*  Legend and export                                                  */
    /* ------------------------------------------------------------------ */

    /**
     * Mount a map legend BELOW the map — appended to the enclosing .chart-panel,
     * not absolutely positioned over the basemap — so it never covers countries,
     * markers or their labels. One placement shared by every map chart
     * (choropleth, geographic origins, …) for consistency; the cluster-partner
     * map builds its own toggleable legend the same way. Any stale legend (e.g.
     * from the rebuild a light/dark theme toggle triggers) is removed first so
     * duplicates never stack.
     *
     * @param {HTMLElement} el          the container the map was rendered into
     * @param {string}      innerHtml   legend markup
     * @param {string}     [extraClass] extra class, e.g. 'rv-choropleth-legend'
     * @returns {HTMLElement} the legend element
     */
    ns.mountMapLegend = function (el, innerHtml, extraClass) {
        var panel = el.closest('.chart-panel') || el.parentNode || el;
        var stale = panel.querySelector('.rv-map-legend');
        if (stale) stale.remove();
        var legend = document.createElement('div');
        legend.className = 'rv-map-legend' + (extraClass ? ' ' + extraClass : '');
        // eslint-disable-next-line no-unsanitized/property -- callers pass legend markup built with ns.escapeHtml
        legend.innerHTML = innerHtml;
        panel.appendChild(legend);
        return legend;
    };

    /**
     * A MapLibre map as a PNG data URL, or null when it cannot be read.
     *
     * The map MUST have been created with
     * `canvasContextAttributes: { preserveDrawingBuffer: true }`; without it
     * WebGL is free to discard the buffer after each frame and the canvas reads back
     * blank. Labels come along for free — MapLibre draws them into the same canvas —
     * but DOM overlays (popups, controls, a legend) do not, which matches how the
     * ECharts exports behave.
     */
    ns.mapPng = function (map) {
        try {
            // Force one more frame first: after a filter change the last painted
            // frame can predate it, and the buffer is what we are about to read.
            if (typeof map.redraw === 'function') map.redraw();
            else if (typeof map.triggerRepaint === 'function') map.triggerRepaint();
            return map.getCanvas().toDataURL('image/png');
        } catch (e) {
            console.warn('DreVisualizations: map PNG export failed', e);
            return null;
        }
    };

    /* ------------------------------------------------------------------ */
    /*  Basemap and attribution                                            */
    /* ------------------------------------------------------------------ */

    /**
     * Glyph endpoint for MapLibre text layers. Falls back to the Noto Sans
     * ranges this module ships, so labels render with no third-party request.
     * Every symbol layer must name ns.MAP_LABEL_FONT: a layer without `text-font`
     * asks for MapLibre's default "Open Sans Regular,Arial Unicode MS Regular"
     * stack, which this endpoint does not serve, so its labels silently vanish.
     * The fontstack name is the one the common hosts also serve, so a
     * configured endpoint resolves the same `text-font`.
     */
    ns.MAP_LABEL_FONT = ['Noto Sans Regular'];

    ns.mapGlyphs = function () {
        return String((window.RV_MAP_CONFIG || {}).glyphs || '')
            || ns.moduleAsset('fonts/{fontstack}/{range}.pbf');
    };

    /**
     * Basemap assembled from the country outlines already shipped for the
     * choropleth: land, coastlines and borders with no tile server and no
     * third-party call. This is the default, so maps read as maps out of the
     * box; an administrator can still point the basemap settings at any
     * MapLibre style. Colours resolve from DRE theme tokens, so it follows
     * light/dark like every other surface.
     */
    ns.selfHostedBasemapStyle = function () {
        var dark = ns._darkMode;
        return {
            version: 8,
            name: 'DRE self-hosted basemap',
            glyphs: ns.mapGlyphs(),
            sources: {
                'dre-countries': {
                    type: 'geojson',
                    data: ns.moduleAsset('data/geo/countries.geojson'),
                    attribution: 'Natural Earth'
                }
            },
            layers: [
                {
                    id: 'background', type: 'background',
                    paint: { 'background-color': (dark ? ns.cssColor('--surface-sunken', '#070d0a') : ns.cssColor('--surface-sunken', '#f3f0eb')) }
                },
                {
                    id: 'dre-country-fill', type: 'fill', source: 'dre-countries',
                    paint: { 'fill-color': (dark ? ns.cssColor('--surface', '#0e1612') : ns.cssColor('--surface', '#fdfcf9')) }
                },
                {
                    id: 'dre-country-line', type: 'line', source: 'dre-countries',
                    paint: {
                        'line-color': (dark ? ns.cssColor('--border-strong', '#49534e') : ns.cssColor('--border-strong', '#bfbab3')),
                        'line-width': 0.6
                    }
                },
                {
                    // Placed at each polygon's pole of inaccessibility by MapLibre.
                    // Natural Earth carries no importance rank, so which labels
                    // survive at low zoom is decided by collision alone.
                    id: 'dre-country-label', type: 'symbol', source: 'dre-countries',
                    layout: {
                        'text-field': ['coalesce', ['get', 'NAME_EN'], ['get', 'NAME'], ['get', 'ADMIN']],
                        'text-font': ns.MAP_LABEL_FONT,
                        'text-size': ['interpolate', ['linear'], ['zoom'], 1, 9, 4, 12, 7, 15],
                        'text-max-width': 8,
                        'text-padding': 6
                    },
                    paint: {
                        'text-color': (dark ? ns.cssColor('--ink-light', '#b0aea7') : ns.cssColor('--ink-light', '#5f5650')),
                        'text-halo-color': (dark ? ns.cssColor('--surface', '#0e1612') : ns.cssColor('--surface', '#fdfcf9')),
                        'text-halo-width': 1.2
                    }
                }
            ]
        };
    };

    /**
     * Get the configured basemap style. RV_MAP_CONFIG (DashboardAssets, via
     * Site\BasemapStyle::mapConfig) names a style URL per mode, or none; read
     * with `||`, never `??`, so an empty string can never become a style URL.
     * When the URL is this module's own self-hosted default (`selfHosted`), or
     * there is none, build that basemap here from the LIVE tokens instead —
     * the served document can only carry the theme's fallback colours. Either
     * way maps stay privacy-safe by default: no tile, style or glyph request
     * leaves the Omeka origin.
     */
    ns.getBasemapStyle = function () {
        var config = window.RV_MAP_CONFIG || {};
        if (config.selfHosted) return ns.selfHostedBasemapStyle();
        var configured = ns._darkMode
            ? (config.darkStyle || config.lightStyle)
            : (config.lightStyle || config.darkStyle);
        return configured || ns.selfHostedBasemapStyle();
    };

    /**
     * Suppress MapLibre's construction-time attribution control. A style credits
     * its own sources and MapLibre renders that automatically, so passing the
     * configured text as well printed the same tiles twice in different words
     * ("© OpenStreetMap contributors © CARTO | © CARTO, © OpenStreetMap
     * contributors"). Whether a style credits itself is only knowable once it has
     * loaded, so ns.trackMap() attaches the control then.
     */
    ns.getMapAttributionOptions = function () {
        return false;
    };

    /**
     * Attach exactly one attribution control once the style is loaded. The
     * style's own source credits win; the configured text is the fallback for a
     * style that declares none, which is what makes it a safety net rather than
     * a duplicate. A map with nothing to credit gets no control.
     */
    ns.attachMapAttribution = function (map) {
        var apply = function () {
            if (map._rvAttributionAdded) return; // one control per map, never two
            var sources;
            try {
                sources = (map.getStyle() || {}).sources || {};
            } catch (e) {
                return;
            }
            map._rvAttributionAdded = true;
            var options = { compact: true };
            var credited = Object.keys(sources).some(function (id) {
                return sources[id] && sources[id].attribution;
            });
            if (!credited) {
                var text = String((window.RV_MAP_CONFIG || {}).attribution || '');
                if (!text) return; // nothing to credit — no empty control
                options.customAttribution = ns.escapeHtml(text);
            }
            map.addControl(new maplibregl.AttributionControl(options));
        };
        if (map.isStyleLoaded && map.isStyleLoaded()) {
            apply();
        } else {
            map.once('load', apply);
        }
        return map;
    };

    /* ------------------------------------------------------------------ */
    /*  Interaction helpers                                                */
    /* ------------------------------------------------------------------ */

    /**
     * Move the `hover` feature-state from one feature of `source` to another,
     * so exactly one feature reads as hovered. Either id may be null (null
     * `next` clears the hover). Returns `next`, to store as the new current id:
     *   hoverId = ns.moveHover(map, SRC, hoverId, f.id);
     */
    ns.moveHover = function (map, source, prev, next) {
        if (prev !== null && prev !== next) map.setFeatureState({ source: source, id: prev }, { hover: false });
        if (next !== null) map.setFeatureState({ source: source, id: next }, { hover: true });
        return next;
    };

    /**
     * Fit a map to a set of points: [lng, lat] pairs or { lon, lat } objects,
     * or anything else through `lngLat(point)` → [lng, lat]. Nothing happens
     * for an empty set, so callers need no guard of their own.
     */
    ns.fitToPoints = function (map, points, options, lngLat) {
        var bounds = new maplibregl.LngLatBounds();
        (points || []).forEach(function (p) {
            bounds.extend(lngLat ? lngLat(p) : (Array.isArray(p) ? p : [p.lon, p.lat]));
        });
        if (!bounds.isEmpty()) map.fitBounds(bounds, options);
        return bounds;
    };
})();
;

/* ---- js/core/toolbar.js ---- */
/**
 * Dashboard core: the per-chart toolbar — save as image, download as CSV, and
 * the fill-pattern (decal) toggle every chart shares.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    /* ------------------------------------------------------------------ */
    /*  Fill patterns (decals)                                             */
    /* ------------------------------------------------------------------ */

    ns._decalEnabled = false;

    /** Toggle decal patterns on all tracked ECharts instances (skips charts flagged _noDecal). */
    ns.toggleDecals = function () {
        ns._decalEnabled = !ns._decalEnabled;
        ns.pruneCharts();
        ns._allCharts.forEach(function (c) {
            if (c._noDecal) return;
            c.setOption({ aria: { enabled: true, decal: { show: ns._decalEnabled } } });
        });
        // Update all toggle button states.
        document.querySelectorAll('[data-action="decal"]').forEach(function (btn) {
            btn.classList.toggle('rv-toolbar-btn-active', ns._decalEnabled);
            btn.title = ns._decalEnabled
                ? ns.t('hidePatterns', 'Hide the fill patterns')
                : ns.t('showPatterns', 'Tell the colours apart with fill patterns');
        });
    };

    /** Flatten the currently rendered ECharts series into an accessible table. */
    ns.chartCsvRows = function (chart) {
        if (!chart) return [];
        // A renderer that is not an ECharts instance (the d3-force canvas graphs)
        // has no `option` to walk, and its natural tabular form is not
        // series/category/value anyway — a network's is an edge list. Let it supply
        // its own rows.
        if (typeof chart.csvRows === 'function') return chart.csvRows();
        if (!chart.getOption) return [];
        var option = chart.getOption() || {};
        var xCategories = option.xAxis && option.xAxis[0] && option.xAxis[0].data || [];
        var yCategories = option.yAxis && option.yAxis[0] && option.yAxis[0].data || [];
        var categories = xCategories.length ? xCategories : yCategories;
        var rows = [[
            ns.t('series', 'Series'),
            ns.t('category', 'Category'),
            ns.t('value', 'Value')
        ]];
        (option.series || []).forEach(function (series) {
            (series.data || []).forEach(function (point, index) {
                var raw = point && typeof point === 'object' && !Array.isArray(point)
                    ? point.value : point;
                var name = point && typeof point === 'object' && !Array.isArray(point) && point.name != null
                    ? point.name : (categories[index] != null ? categories[index] : index + 1);
                var value = Array.isArray(raw) ? raw.join(' | ') : raw;
                if (value == null || typeof value === 'object') value = JSON.stringify(value == null ? '' : value);
                rows.push([series.name || series.type || '', name, value]);
            });
        });
        return rows;
    };

    /** Download the chart's tabular fallback as UTF-8 CSV. */
    ns.downloadChartCsv = function (chart, title) {
        var rows = ns.chartCsvRows(chart);
        if (rows.length < 2) return;
        var csvCell = function (value) {
            var text = String(value == null ? '' : value);
            return '"' + text.replace(/"/g, '""') + '"';
        };
        var csv = '\ufeff' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
        var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        var link = document.createElement('a');
        link.href = url;
        link.download = (title || 'chart').trim().replace(/[\\/:*?"<>|]+/g, '-') + '.csv';
        link.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    };

    /* ------------------------------------------------------------------ */
    /*  Data table — the non-canvas alternative                           */
    /* ------------------------------------------------------------------ */

    // A canvas chart is an image to a screen reader and opaque to Ctrl+F; an
    // aria-label summarises it but cannot carry its numbers. Every chart with
    // tabular data therefore gets a collapsed "Data table" disclosure under it,
    // built from the very rows the CSV download writes (ns.chartCsvRows), so the
    // table, the file and the picture can never disagree. Built on open, from
    // the live instance, so it follows a filter or a light/dark rebuild.
    var DATA_TABLE_ROWS = 500;

    /** A scrollable, focusable table of `rows` (header row first). */
    ns.buildDataTable = function (rows, caption) {
        var wrap = ns.el('div', 'rv-data-table-scroll');
        // A scrollable region must be reachable by keyboard and named.
        wrap.tabIndex = 0;
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', caption || ns.t('dataTable', 'Data table'));
        var table = ns.el('table', 'rv-data-table-grid');
        if (caption) table.appendChild(ns.el('caption', 'rv-sr-only', caption));
        var head = ns.el('thead');
        var headRow = ns.el('tr');
        (rows[0] || []).forEach(function (cell) {
            var th = ns.el('th', null, String(cell == null ? '' : cell));
            th.scope = 'col';
            headRow.appendChild(th);
        });
        head.appendChild(headRow);
        table.appendChild(head);
        var body = ns.el('tbody');
        rows.slice(1, DATA_TABLE_ROWS + 1).forEach(function (row) {
            var tr = ns.el('tr');
            row.forEach(function (cell) {
                var td = ns.el('td', typeof cell === 'number' ? 'rv-num' : null,
                    typeof cell === 'number' ? ns.formatNumber(cell) : String(cell == null ? '' : cell));
                tr.appendChild(td);
            });
            body.appendChild(tr);
        });
        table.appendChild(body);
        wrap.appendChild(table);
        if (rows.length - 1 > DATA_TABLE_ROWS) {
            var note = ns.el('p', 'rv-data-table-note', ns.fill(
                ns.t('dataTableTruncated', 'Showing the first {count} rows. Download data (CSV) for all of them.'),
                { count: ns.formatNumber(DATA_TABLE_ROWS) }));
            return ns.setChildren(ns.el('div'), [wrap, note]);
        }
        return wrap;
    };

    /**
     * Mount the collapsed "Data table" disclosure at the foot of `panel`.
     * `rowsFn` returns the current rows (header first); with fewer than two
     * there is nothing to tabulate and nothing is mounted.
     */
    ns.attachDataTable = function (panel, rowsFn, caption) {
        if (!panel || panel.querySelector('.rv-data-table')) return;
        if ((rowsFn() || []).length < 2) return;
        var details = ns.el('details', 'rv-data-table');
        var summary = ns.el('summary', 'rv-data-table-toggle', ns.t('dataTable', 'Data table'));
        details.appendChild(summary);
        details.addEventListener('toggle', function () {
            if (!details.open) return;
            ns.setChildren(details, [summary, ns.buildDataTable(rowsFn() || [], caption)]);
        });
        panel.appendChild(details);
    };

    /**
     * The `.rv-chart-heading` row a toolbar mounts into. Dashboards render it;
     * other surfaces (Compare, What's New, Network Explorer, the semantic map)
     * have a bare <h3>, which gets wrapped, or no heading, which gets a row.
     */
    function chartHeading(panel) {
        var heading = panel.querySelector('.rv-chart-heading');
        if (heading) return heading;
        heading = document.createElement('div');
        heading.className = 'rv-chart-heading';
        var title = panel.querySelector('h3');
        if (title && title.parentNode) {
            title.parentNode.insertBefore(heading, title);
            heading.appendChild(title);
        } else {
            panel.insertBefore(heading, panel.firstChild);
        }
        return heading;
    }

    /** One shared glyph (core/icons.js) as markup for the toolbar string below. */
    function icon(body) { return ns.iconSvg(body).outerHTML; }

    /** Attach HTML-level toolbar (image, CSV, and pattern controls). */
    ns.attachToolbar = function (panel, chart) {
        if (!panel || !chart || !chart.getDataURL) return;
        // A dashboard rebuild (light/dark switch) replaces the ECharts instance
        // in the same container; the buttons act on whichever one is live.
        var dom = typeof chart.getDom === 'function' ? chart.getDom() : null;
        var live = function () {
            var current = dom && window.echarts && echarts.getInstanceByDom(dom);
            return current && !current.isDisposed() ? current : chart;
        };
        var showDecal = !chart._noDecal;
        var decalTitle = ns._decalEnabled
            ? ns.t('hidePatterns', 'Hide the fill patterns')
            : ns.t('showPatterns', 'Tell the colours apart with fill patterns');
        var saveTitle = ns.t('saveImage', 'Save this chart as an image');
        var csvTitle = ns.t('downloadCsv', 'Download data (CSV)');
        var hasCsv = ns.chartCsvRows(chart).length > 1;
        var title = panel.querySelector('h3');
        var panelTitle = title ? (title.textContent || '').trim() : '';
        var toolbarLabel = ns.t('chartActions', 'Chart actions');
        var bar = document.createElement('div');
        bar.className = 'rv-chart-toolbar';
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', panelTitle ? toolbarLabel + ': ' + panelTitle : toolbarLabel);
        // eslint-disable-next-line no-unsanitized/property -- icon constants + escaped titles
        bar.innerHTML = (showDecal
            ? '<button type="button" class="rv-toolbar-btn' + (ns._decalEnabled ? ' rv-toolbar-btn-active' : '') + '" data-action="decal" title="' + ns.escapeHtml(decalTitle) + '" aria-label="' + ns.escapeHtml(decalTitle) + '">'
            + icon(ns.ICONS.patterns)
            + '</button>'
            : '')
            + '<button type="button" class="rv-toolbar-btn" data-action="save" title="' + ns.escapeHtml(saveTitle) + '" aria-label="' + ns.escapeHtml(saveTitle) + '">'
            + icon(ns.ICONS.save)
            + '</button>'
            + (hasCsv
                ? '<button type="button" class="rv-toolbar-btn" data-action="csv" title="' + ns.escapeHtml(csvTitle) + '" aria-label="' + ns.escapeHtml(csvTitle) + '">'
                + icon(ns.ICONS.csv) + '</button>'
                : '');
        chartHeading(panel).appendChild(bar);
        if (hasCsv && !chart._noDataTable) {
            ns.attachDataTable(panel, function () { return ns.chartCsvRows(live()); }, panelTitle);
        }
        bar.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var name = panelTitle || 'chart';
            if (btn.dataset.action === 'save') {
                var url = live().getDataURL({ pixelRatio: 2, backgroundColor: ns.exportBg() });
                var a = document.createElement('a');
                a.href = url;
                a.download = name.replace(/[\\/:*?"<>|]+/g, '-') + '.png';
                a.click();
            } else if (btn.dataset.action === 'csv') {
                ns.downloadChartCsv(live(), name);
            } else if (btn.dataset.action === 'decal') {
                ns.toggleDecals();
            }
        });
    };
})();
;

/* ---- js/core/embed.js ---- */
/**
 * Dashboard core: the copy-embed-code buttons and the snippet they copy.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    /* ------------------------------------------------------------------ */
    /*  Embed buttons (copy iframe snippet)                                */
    /* ------------------------------------------------------------------ */

    // The copy-embed-code affordance shared by the on-page visualizations AND the
    // /dre-embed snippet gallery: one snippet builder, one resize listener, one
    // clipboard helper, one button factory — so the embed format lives in exactly
    // one place. A block opts in by stamping data-embed-slug (+ data-site-base) on
    // its container; dashboards get a per-chart button, the single-widget blocks
    // one button for the whole block. Never shown inside an embed (dre-embed-body).

    // The copy-feedback window (DESIGN-INTEGRATION.md "Copy feedback").
    var COPIED_MS = 2000;

    // Host-side listener that resizes the iframe to the height the embed posts
    // (paired with the reporter in view/dre-visualizations/layout/embed.phtml).
    // Guarded + idempotent, so pasting several snippets on one page installs it
    // once. The escaped <\/script> keeps a copied snippet from closing an inline
    // <script> on the host page; its runtime value is a real </script>.
    /* eslint-disable no-useless-escape -- the escaped <\/script> is deliberate, see above */
    ns.embedListener = "<script>(function(){if(window.__dreEmbedResize)return;window.__dreEmbedResize=1;"
        + "window.addEventListener('message',function(e){if(!e.data||e.data.type!=='dre-embed-height')return;"
        + "var f=document.getElementsByTagName('iframe');for(var i=0;i<f.length;i++){"
        + "if(f[i].contentWindow===e.source){f[i].style.height=e.data.height+'px';}}});})();<\/script>";
    /* eslint-enable no-useless-escape */

    /** Build the copy-paste embed snippet (iframe + the resize listener). */
    ns.embedSnippet = function (src, title, height) {
        var px = Math.max(1, Math.round(Number(height) || 600));
        return '<iframe src="' + ns.escapeHtml(src) + '" title="' + ns.escapeHtml(title || '') + '"'
            + ' loading="lazy" scrolling="no" style="width:100%;border:0;height:' + px + 'px"></iframe>\n'
            + ns.embedListener;
    };

    /** Absolute embed URL for a block (and optional chart key). */
    ns.embedUrl = function (siteBase, slug, chartKey) {
        var origin = (window.location && window.location.origin) || '';
        return origin + siteBase + '/dre-embed/' + slug + (chartKey ? '/' + chartKey : '');
    };

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
    }

    /** Copy text to the clipboard; resolves whether via the async API or fallback. */
    ns.copyToClipboard = function (text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
        }
        fallbackCopy(text);
        return Promise.resolve();
    };

    /**
     * Copy feedback, the same on every surface of the product: the visible
     * label reads "Copied" for two seconds and the word is announced. The
     * labelled button hands its label to window.DREUtils.flashLabel (which
     * swaps it and announces through the theme's shared region); the icon-only
     * one swaps its glyph and name, and announces through ns.announce, which
     * also prefers DREUtils and keeps a local region for a host without it.
     */
    function flashCopied(btn, label, restoreTitle) {
        var copied = ns.t('copied', 'Copied');
        var utils = window.DREUtils;
        clearTimeout(btn._embedTimer);
        ns.setChildren(btn, [ns.iconSvg(ns.ICONS.check)].concat(label ? [label] : []));
        btn.classList.add('rv-toolbar-btn-active');
        btn.title = copied;
        if (label && utils && typeof utils.flashLabel === 'function') {
            utils.flashLabel(label, copied, COPIED_MS);
        } else {
            if (label) {
                if (!('label' in label.dataset)) label.dataset.label = label.textContent;
                label.textContent = copied;
            } else {
                btn.setAttribute('aria-label', copied);
            }
            ns.announce(copied);
        }
        btn._embedTimer = setTimeout(function () {
            ns.setChildren(btn, [ns.iconSvg(ns.ICONS.embed)].concat(label ? [label] : []));
            if (label && label.dataset.label != null) label.textContent = label.dataset.label;
            btn.classList.remove('rv-toolbar-btn-active');
            btn.title = restoreTitle;
            btn.setAttribute('aria-label', label ? label.dataset.label || restoreTitle : restoreTitle);
        }, COPIED_MS);
    }

    /**
     * A copy-embed-code button element. opts: { src, title, height, label }.
     * With `label` it renders icon + text (block-level); otherwise icon-only (the
     * dense chart toolbar). Reuses the .rv-toolbar-btn skin, so it follows the DRE
     * theme like every other control.
     */
    ns.makeEmbedButton = function (opts) {
        var labelTxt = opts.label || '';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rv-toolbar-btn rv-embed-btn' + (labelTxt ? ' rv-embed-btn--labeled' : '');
        var label = labelTxt ? ns.el('span', 'rv-embed-label', labelTxt) : null;
        ns.setChildren(btn, [ns.iconSvg(ns.ICONS.embed)].concat(label ? [label] : []));
        var copyTitle = ns.t('copyEmbed', 'Copy the code to put this on another website');
        btn.title = copyTitle;
        // A labelled button is named by its visible text, so "Copied" replaces
        // that name while it shows; an icon-only one needs an explicit name.
        if (!label) btn.setAttribute('aria-label', copyTitle);
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            ns.copyToClipboard(ns.embedSnippet(opts.src, opts.title, opts.height)).then(function () {
                flashCopied(btn, label, copyTitle);
            });
        });
        return btn;
    };

    /**
     * Per-chart embed buttons for an embeddable dashboard. Adds one button to each
     * chart panel's toolbar — creating the toolbar for map panels that have none
     * (attachToolbar only runs for ECharts charts). No-op off the live site or for
     * a non-embeddable dashboard (no data-embed-slug).
     */
    ns.addEmbedButtons = function (container) {
        if (!container || !container.classList || (document.body && document.body.classList.contains('dre-embed-body'))) return;
        // Per-chart embeds are a dashboard-only surface (the standard async render
        // path). Widgets that reuse ns.renderInto must not get per-chart buttons —
        // their /dre-embed/<slug>/<chart> URL has no single-chart route and 404s.
        var dashboard = container.classList.contains('dashboard-async-container')
            ? container : container.closest('.dashboard-async-container');
        if (!dashboard) return;
        var slug = dashboard.getAttribute('data-embed-slug');
        if (!slug) return;
        var siteBase = dashboard.getAttribute('data-site-base') || '';
        var panels = container.querySelectorAll('.chart-panel');
        for (var i = 0; i < panels.length; i++) {
            (function (panel) {
                var cc = panel.querySelector('[data-chart]');
                var h3 = panel.querySelector('h3');
                if (!cc || !h3) return;
                var key = cc.getAttribute('data-chart');
                var heading = panel.querySelector('.rv-chart-heading');
                var bar = panel.querySelector('.rv-chart-toolbar');
                if (!bar) {
                    bar = document.createElement('div');
                    bar.className = 'rv-chart-toolbar';
                    bar.setAttribute('role', 'toolbar');
                    bar.setAttribute('aria-label', ns.t('chartActions', 'Chart actions') + ': ' + (h3.textContent || '').trim());
                    if (heading) heading.appendChild(bar);
                }
                bar.appendChild(ns.makeEmbedButton({
                    src: ns.embedUrl(siteBase, slug, key),
                    title: ns.chartLabel ? ns.chartLabel(key) : ((ns.CHART_LABELS && ns.CHART_LABELS[key]) || key),
                    height: 520
                }));
            })(panels[i]);
        }
    };

    /**
     * Whole-block embed button for the single-visualization blocks (entity
     * network, spatial map, network explorer, compare, project explorer, what's
     * new). Mounted on the stable outer .resource-vis-block wrapper — never the
     * inner container, which the block's own controller rebuilds on render.
     */
    ns.setupBlockEmbedButtons = function () {
        if (document.body && document.body.classList.contains('dre-embed-body')) return;
        var hosts = document.querySelectorAll('[data-embed-slug]:not(.dashboard-async-container)');
        for (var i = 0; i < hosts.length; i++) {
            (function (host) {
                var wrap = host.closest('.resource-vis-block') || host.parentNode;
                if (!wrap || wrap._dreEmbedBtn) return;
                wrap._dreEmbedBtn = true;
                var bar = document.createElement('div');
                bar.className = 'rv-embed-block-toolbar';
                bar.appendChild(ns.makeEmbedButton({
                    src: ns.embedUrl(host.getAttribute('data-site-base') || '', host.getAttribute('data-embed-slug')),
                    title: document.title || host.getAttribute('data-embed-slug'),
                    height: 600,
                    label: ns.t('embedThis', 'Embed this')
                }));
                wrap.insertBefore(bar, wrap.firstChild);
            })(hosts[i]);
        }
    };
})();
;

/* ---- js/core/fullscreen.js ---- */
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
;

/* ---- js/core/graph-walk.js ---- */
/**
 * Dashboard core: the arrow-key model every graph on the site shares — the
 * d3-force graphs (graph-force.js) and the MapLibre Entity Network
 * (entity-graph-ui.js). Here so both renderer chains, which never load each
 * other, walk with one implementation.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    /**
     * One arrow-key step through a graph. Left/Right step through every visible
     * node in reading order and make the node they land on the "hub"; Up/Down
     * then walk that hub's own neighbours, falling back to the reading order
     * when the hub has none. Holding the hub across an Up/Down run is what keeps
     * the walk predictable — re-rooting on every step would wander off.
     *
     * Pure: no DOM, no rendering. The caller owns focus, announcements and
     * every other key (Enter, zoom, Escape), which differ per renderer.
     *
     * @param {string}   key        the KeyboardEvent.key
     * @param {Array}    order      visible node keys, in reading order (non-empty)
     * @param {*}        focus      the focused node key, or null
     * @param {Object}   walk       { hub, cursor } — the caller's walk state,
     *                              updated in place; start it at { hub: null, cursor: -1 }
     * @param {Function} neighbours hub key → its visible neighbours' keys
     * @returns {*} the key to focus next, or null when `key` is not an arrow
     */
    ns.graphStep = function (key, order, focus, walk, neighbours) {
        var at = focus == null ? -1 : order.indexOf(focus);
        var dir;
        if (key === 'ArrowRight' || key === 'ArrowLeft') {
            dir = key === 'ArrowRight' ? 1 : -1;
            walk.hub = order[(at + dir + order.length) % order.length];
            walk.cursor = -1;
            return walk.hub;
        }
        if (key === 'ArrowDown' || key === 'ArrowUp') {
            dir = key === 'ArrowDown' ? 1 : -1;
            if (walk.hub == null) walk.hub = focus == null ? order[0] : focus;
            var nb = neighbours(walk.hub);
            if (!nb.length) {
                walk.hub = order[(at + dir + order.length) % order.length];
                return walk.hub;
            }
            walk.cursor = (walk.cursor + dir + nb.length) % nb.length;
            return nb[walk.cursor];
        }
        return null;
    };
})();
;

/* ---- js/core/reveal.js ---- */
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
;

/* ---- js/core/startup.js ---- */
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
;
