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
 * the shared THEME object and builds an ECharts theme from them. Because the
 * theme re-defines those tokens for dark mode (on `body[data-theme="dark"]`
 * and `@media (prefers-color-scheme: dark)`), the module follows the active
 * light / dark theme — including the live theme toggle, watched in startup.js
 * via a MutationObserver — by re-reading the tokens and calling `chart.setTheme()`
 * (ECharts 6) on every live chart and rebuilding every map (ns.refresh, charts.js).
 *
 * ►► Resolve colours through `ns.cssColor('--token', fallback)` — never add a
 *    raw hex value that won't react to the theme. ◄◄
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

    // Hidden probe + 1px canvas, used to resolve CSS custom properties — which
    // are oklch()/color-mix() in the DRE theme — into a plain sRGB string in the
    // *currently active* theme. This matters: zrender (ECharts) and MapLibre both
    // FAIL to parse oklch()/oklab(), so handing them the raw token makes text and
    // shapes fall back to wrong colours. We must rasterise to rgb() ourselves.
    var _probe = null;
    var _ctx = null;

    function getProbe() {
        if (!_probe) {
            _probe = document.createElement('span');
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
        if (!_ctx) {
            var cv = document.createElement('canvas');
            cv.width = cv.height = 1;
            _ctx = cv.getContext('2d', { willReadFrequently: true });
        }
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
     * @param {string} name  e.g. '--primary'
     * @param {string} fallback  used when the host theme lacks the token
     */
    ns.cssColor = function (name, fallback) {
        fallback = fallback || '#000';
        var key = name + '|' + fallback;
        if (key in _colorCache) return _colorCache[key];
        var color;
        try {
            var probe = getProbe();
            probe.style.color = '';
            probe.style.color = 'var(' + name + ', ' + fallback + ')';
            var resolved = getComputedStyle(probe).color;
            color = ns.toRGB(resolved || fallback) || fallback;
        } catch (e) {
            return fallback; // not cached: the probe may simply not exist yet
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
        try {
            var probe = getProbe();
            probe.style.fontFamily = '';
            probe.style.fontFamily = 'var(' + name + ', ' + fallback + ')';
            return getComputedStyle(probe).fontFamily || fallback;
        } catch (e) {
            return fallback;
        }
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
        var base = ns.cssColor('--surface', ns._darkMode ? '#0e1612' : '#fdfcf9');
        return (ratios || [0.86, 0.65, 0.44, 0.22, 0]).map(function (r) {
            return ns.mix(ns.THEME.accent, base, r);
        });
    };

    /** Whether the active theme is dark: body[data-theme] wins, else system. */
    ns.isDark = function () {
        var attr = document.body && document.body.getAttribute('data-theme');
        if (attr === 'dark') return true;
        if (attr === 'light') return false;
        return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
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
        var c = ns.cssColor;

        // Type follows the DRE theme: Hanken Grotesk for in-chart UI text,
        // Spectral for the rare in-canvas title — same stacks the page uses,
        // with the theme's own fallbacks for non-DRE hosts.
        t.fontFamily = ns.cssFont('--font-body',
            '"Hanken Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif');
        t.fontDisplay = ns.cssFont('--font-display',
            '"Spectral", Georgia, "Times New Roman", serif');

        t.accent      = c('--primary', '#22817b');
        t.accentDark  = c('--primary-hover', '#1a655f');
        t.accentLight = c('--primary-muted', '#b2dfdb');
        t.gradientEnd = c('--primary-muted', '#b2dfdb');
        t.text        = c('--ink', ns._darkMode ? '#e0e0e0' : '#333333');
        t.textMuted   = c('--ink-light', ns._darkMode ? '#aaaaaa' : '#666666');
        t.heading     = c('--ink-strong', ns._darkMode ? '#f0f0f0' : '#222222');
        t.border      = c('--surface', ns._darkMode ? '#1e1e1e' : '#ffffff');
        t.surface     = t.border;
        t.grid        = c('--border', ns._darkMode ? '#3a3a3a' : '#e0e0e0');
        t.gridLight   = c('--border-light', ns._darkMode ? '#333333' : '#f0f0f0');

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
                backgroundColor: ns.cssColor('--surface-raised', t.surface),
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
        return ns.cssColor('--surface', ns._darkMode ? '#0e1612' : '#fdfcf9');
    };
})();
