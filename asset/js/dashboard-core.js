/**
 * Dashboard core: shared design tokens, helpers, and utilities.
 *
 * Initialises the window.RV namespace and exposes THEME, COLORS,
 * and helper functions used by all chart modules.
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
 * light / dark theme — including the live theme toggle, watched below via a
 * MutationObserver — by re-reading the tokens and calling `chart.setTheme()`
 * (ECharts 6) on every live chart and rebuilding every map.
 *
 * ►► Resolve colours through `ns.cssColor('--token', fallback)` — never add a
 *    raw hex value that won't react to the theme. ◄◄
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    // Omeka emits the active site language on <html>. Keep all number and date
    // formatting aligned with it, falling back to the visitor locale only when
    // the document does not declare one.
    ns.locale = document.documentElement.lang || navigator.language || 'en';
    ns.strings = window.RV_I18N || {};
    ns.t = function (key, fallback) {
        return Object.prototype.hasOwnProperty.call(ns.strings, key) ? ns.strings[key] : fallback;
    };

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

    /** The stable colour for an entity-type label, in the active theme. */
    ns.entityColor = function (name) {
        return ns.COLORS[ns.entityColorIndex(name) % ns.COLORS.length];
    };

    // Shared design tokens. Colour values are placeholders here; readTheme()
    // overwrites them in place (so modules that captured `ns.THEME` see updates)
    // from the DRE theme's CSS variables on load and on every theme change.
    ns.THEME = {
        accent: '#22817b',        // ← --primary
        accentDark: '#1a655f',    // ← --primary-hover
        accentLight: '#b2dfdb',   // ← --primary-muted
        gradientEnd: '#b2dfdb',   // ← --primary-muted (bar/area gradient tail)
        text: '#333',             // ← --ink (primary chart text)
        textMuted: '#666',        // ← --ink-light (axis labels, secondary)
        heading: '#222',          // ← --ink-strong
        border: '#fff',           // ← --surface (segment gaps, marker strokes)
        grid: '#e0e0e0',          // ← --border (axis lines)
        gridLight: '#f0f0f0',     // ← --border-light (split lines)
        surface: '#fafafa',       // ← --surface (export background)
        fontFamily: 'system-ui, sans-serif',  // ← --font-body (in-chart UI text)
        fontDisplay: 'Georgia, serif',        // ← --font-display (in-canvas titles)
        fontSize: 12,   // Hanken sits visually smaller than the canvas default at 11
        fontSizeTitle: 14,
        fontSizeEmphasis: 13,
        labelMaxLen: 30,
        barMaxWidth: 24,
        barMaxWidthWide: 40
    };

    ns._allCharts = [];   // tracked ECharts instances
    ns._allMaps = [];     // tracked MapLibre maps: { map, rebuild }
    ns._allRenderers = []; // tracked custom renderers: { el, redraw }
    ns._echartsTheme = null;
    ns._darkMode = false;
    ns.basePath = '';     // Omeka base path, set by the dashboard orchestrator

    /** Resolve a module asset (under asset/) to an absolute URL, e.g.
     *  ns.moduleAsset('data/geo/countries.geojson'). Needs ns.basePath. */
    ns.moduleAsset = function (path) {
        return ns.basePath + '/modules/DreVisualizations/asset/' + path;
    };

    /**
     * Resolve a generated-data path through the atomically published manifest.
     * Old installations without current.json keep working through the legacy
     * data/<path> fallback. The manifest is fetched once per page with no-store;
     * generation URLs themselves are immutable and browser-cacheable.
     */
    ns.dataAsset = function (path) {
        path = String(path || '').replace(/^\/+/, '');
        if (!path || path.split('/').some(function (segment) { return segment === '..'; })) {
            return Promise.reject(new Error('Invalid generated-data path'));
        }
        if (!ns._dataManifestPromise) {
            var manifestUrl = ns.moduleAsset('data/current.json');
            ns._dataManifestPromise = fetch(manifestUrl, {
                cache: 'no-store', credentials: 'same-origin'
            }).then(function (response) {
                if (!response.ok) return null;
                return response.json();
            }).then(function (manifest) {
                var id = manifest && String(manifest.generationId || '');
                return /^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/.test(id) ? id : null;
            }).catch(function () { return null; });
        }
        return ns._dataManifestPromise.then(function (generationId) {
            var prefix = generationId ? 'data/generations/' + generationId + '/' : 'data/';
            return ns.moduleAsset(prefix + path);
        });
    };

    /** Central JSON loader for every generated dashboard artifact. */
    ns.fetchDataJson = function (path, options) {
        return ns.dataAsset(path).then(function (url) {
            var requestOptions = Object.assign({ credentials: 'same-origin' }, options || {});
            return fetch(url, requestOptions).then(function (response) {
                if (!response.ok) throw new Error('Generated data not found (' + response.status + ')');
                return response.json();
            });
        }).then(function (payload) {
            if (!payload || typeof payload !== 'object') {
                throw new Error('Generated data has an invalid top-level value');
            }
            return payload;
        });
    };

    /* ------------------------------------------------------------------ */
    /*  Lazy library loader                                                */
    /* ------------------------------------------------------------------ */

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
                s.onerror = reject;
                head.appendChild(s);
            });
            return ns._libPromises[key];
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
                : import(src).then(function (mod) {
                    if (register) register(mod);
                });
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
                // The worker is a separate chunk. MapLibre resolves it from
                // import.meta.url by default, but only under its upstream `.mjs`
                // name — scripts/vendor-maplibre.mjs renames it and stamps the
                // library version in, so it has to be named explicitly. This must
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
        try {
            var probe = getProbe();
            probe.style.color = '';
            probe.style.color = 'var(' + name + ', ' + fallback + ')';
            var resolved = getComputedStyle(probe).color;
            return ns.toRGB(resolved || fallback) || fallback;
        } catch (e) {
            return fallback;
        }
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
     */
    ns.accentRamp = function () {
        var base = ns.cssColor('--surface', ns._darkMode ? '#1e1e1e' : '#ffffff');
        return [0.86, 0.65, 0.44, 0.22, 0].map(function (r) {
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

    /* ------------------------------------------------------------------ */
    /*  Chart / map lifecycle                                              */
    /* ------------------------------------------------------------------ */

    /** Init an ECharts instance using the current theme, tracking it for re-theming. */
    ns.initChart = function (el) {
        if (!ns._echartsTheme) ns.readTheme();
        var chart = echarts.init(el, ns._echartsTheme);
        ns._allCharts.push(chart);
        return chart;
    };

    /**
     * Track a MapLibre map for re-theming. `rebuild` is a zero-arg closure that
     * re-creates the map (with the current basemap + theme colours) into the
     * same container; it is invoked on theme change.
     */
    ns.trackMap = function (map, rebuild) {
        ns._allMaps.push({ map: map, rebuild: rebuild });
        ns.attachMapAttribution(map);
        return map;
    };

    /* ------------------------------------------------------------------ */
    /*  Icon buttons                                                       */
    /* ------------------------------------------------------------------ */

    // One innerHTML sink for every inline icon in the module. The bodies passed in
    // are module-authored path constants, never curator data — routing them all
    // through here is what keeps the count in check-html-safety.mjs flat as blocks
    // gain controls, instead of one sink per button.
    var _iconHost = null;

    /** Build an inline 24×24 stroke icon from an SVG path body. */
    ns.iconSvg = function (body, size) {
        if (!_iconHost) _iconHost = document.createElement('div');
        size = size || 14;
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
     */
    ns.trackRenderer = function (el, redraw) {
        ns._allRenderers.push({ el: el, redraw: redraw });
    };

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
        legend.innerHTML = innerHtml;
        panel.appendChild(legend);
        return legend;
    };

    /** Background colour to use when exporting a chart as a PNG. */
    ns.exportBg = function () {
        return ns.cssColor('--surface', ns._darkMode ? '#1e1e1e' : '#ffffff');
    };

    /**
     * A MapLibre map as a PNG data URL, or null when it cannot be read.
     *
     * The map MUST have been created with `preserveDrawingBuffer: true`; without it
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

    /**
     * Get the configured basemap style. Blank configuration intentionally
     * yields a same-document background style, making maps privacy-safe by
     * default (no tile/style/glyph requests leave the Omeka origin).
     */
    /**
     * Glyph endpoint for MapLibre text layers. Falls back to the Noto Sans
     * ranges this module ships, so labels render with no third-party request.
     * The fontstack name is the one the common hosts also serve, so a
     * configured endpoint resolves the same `text-font`.
     */
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
                    paint: { 'background-color': ns.cssColor('--surface-sunken', dark ? '#1a1a1a' : '#f1ede6') }
                },
                {
                    id: 'dre-country-fill', type: 'fill', source: 'dre-countries',
                    paint: { 'fill-color': ns.cssColor('--surface', dark ? '#242424' : '#fdfcfa') }
                },
                {
                    id: 'dre-country-line', type: 'line', source: 'dre-countries',
                    paint: {
                        'line-color': ns.cssColor('--border-strong', dark ? '#4a4a4a' : '#c3b9a9'),
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
                        'text-font': ['Noto Sans Regular'],
                        'text-size': ['interpolate', ['linear'], ['zoom'], 1, 9, 4, 12, 7, 15],
                        'text-max-width': 8,
                        'text-padding': 6
                    },
                    paint: {
                        'text-color': ns.cssColor('--ink-light', dark ? '#a49c91' : '#6c6357'),
                        'text-halo-color': ns.cssColor('--surface', dark ? '#242424' : '#fdfcfa'),
                        'text-halo-width': 1.2
                    }
                }
            ]
        };
    };

    ns.getBasemapStyle = function () {
        var config = window.RV_MAP_CONFIG || {};
        var configured = ns._darkMode
            ? (config.darkStyle || config.lightStyle)
            : (config.lightStyle || config.darkStyle);
        if (configured) return configured;
        return ns.selfHostedBasemapStyle();
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
                options.customAttribution = text.replace(/[&<>"']/g, function (ch) {
                    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
                });
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

    /**
     * Standard MapLibre map bootstrap shared by the map chart builders: themed
     * basemap, visible source attribution, cooperative gestures, and the common
     * control set. Options:
     *   center, zoom  — initial camera (default [0, 15] / 1.5);
     *   nav           — NavigationControl options ({ visualizePitch: true } by
     *                   default; e.g. { showCompass: false }) or false to skip;
     *   globe         — false to skip the GlobeControl (default on when the
     *                   vendored MapLibre provides it).
     * Callers still wire theme rebuilds themselves via ns.trackMap(map, rebuild).
     */
    ns.initMap = function (el, opts) {
        opts = opts || {};
        var map = new maplibregl.Map({
            container: el,
            style: ns.getBasemapStyle(),
            center: opts.center || [0, 15],
            zoom: opts.zoom != null ? opts.zoom : 1.5,
            attributionControl: ns.getMapAttributionOptions(),
            cooperativeGestures: true
        });
        if (opts.nav !== false) {
            map.addControl(new maplibregl.NavigationControl(opts.nav || { visualizePitch: true }), 'top-right');
        }
        map.addControl(new maplibregl.FullscreenControl(), 'top-right');
        if (opts.globe !== false && maplibregl.GlobeControl) {
            map.addControl(new maplibregl.GlobeControl(), 'top-right');
        }
        return map;
    };

    /** Remove disposed charts from the tracking array. */
    ns.pruneCharts = function () {
        ns._allCharts = ns._allCharts.filter(function (c) { return !c.isDisposed(); });
    };

    /**
     * Re-apply the active theme to every live chart and map. Triggered when the
     * DRE theme toggles between light and dark (or the system preference does).
     */
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
    /*  Helpers                                                            */
    /* ------------------------------------------------------------------ */

    /** Build a dataZoom config (slider + scroll) for timeline-type charts. */
    ns.buildDataZoom = function (count) {
        if (count <= 15) return [];
        return [
            { type: 'slider', start: 0, end: 100, bottom: 8, height: 22 },
            { type: 'inside' }
        ];
    };

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

    /** Escape plain text before inserting it through innerHTML. */
    ns.escapeHtml = function (value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
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

    /** Create a DOM element with optional class and text content. */
    ns.el = function (tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    };

    /** Add click-to-navigate and pointer cursor on chart elements. */
    ns.addClickHandler = function (chart, entries, siteBase) {
        if (!siteBase) return;
        chart.on('click', function (params) {
            var entry = entries.find(function (e) { return e.name === params.name; });
            if (entry && entry.itemId) {
                window.location.href = siteBase + '/item/' + entry.itemId;
            }
        });
        chart.getZr().on('mousemove', function (e) {
            chart.getZr().setCursorStyle(e.target ? 'pointer' : 'default');
        });
    };

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

    /* -- Global decal toggle state -- */

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

    /** Attach HTML-level toolbar (image, CSV, and pattern controls). */
    ns.attachToolbar = function (panel, chart) {
        if (!chart || !chart.getDataURL) return;
        var showDecal = !chart._noDecal;
        var decalTitle = ns._decalEnabled
            ? ns.t('hidePatterns', 'Hide the fill patterns')
            : ns.t('showPatterns', 'Tell the colours apart with fill patterns');
        var saveTitle = ns.t('saveImage', 'Save this chart as an image');
        var csvTitle = ns.t('downloadCsv', 'Download this chart’s data as a spreadsheet (CSV)');
        var hasCsv = ns.chartCsvRows(chart).length > 1;
        var bar = document.createElement('span');
        bar.className = 'rv-chart-toolbar';
        bar.innerHTML = (showDecal
            ? '<button type="button" class="rv-toolbar-btn' + (ns._decalEnabled ? ' rv-toolbar-btn-active' : '') + '" data-action="decal" title="' + ns.escapeHtml(decalTitle) + '">'
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/><line x1="4" y1="14" x2="14" y2="4"/><line x1="4" y1="8" x2="8" y2="4"/><line x1="10" y1="20" x2="20" y2="10"/><line x1="16" y1="20" x2="20" y2="16"/></svg>'
            + '</button>'
            : '')
            + '<button type="button" class="rv-toolbar-btn" data-action="save" title="' + ns.escapeHtml(saveTitle) + '">'
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
            + '</button>'
            + (hasCsv
                ? '<button type="button" class="rv-toolbar-btn" data-action="csv" title="' + ns.escapeHtml(csvTitle) + '">'
                + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8"/></svg></button>'
                : '');
        var title = panel.querySelector('h3');
        if (title) title.appendChild(bar);
        bar.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            if (btn.dataset.action === 'save') {
                var url = chart.getDataURL({ pixelRatio: 2, backgroundColor: ns.exportBg() });
                var a = document.createElement('a');
                a.href = url;
                a.download = (panel.querySelector('h3').textContent || 'chart').trim() + '.png';
                a.click();
            } else if (btn.dataset.action === 'csv') {
                ns.downloadChartCsv(chart, panel.querySelector('h3').textContent || 'chart');
            } else if (btn.dataset.action === 'decal') {
                ns.toggleDecals();
            }
        });
    };

    /* ------------------------------------------------------------------ */
    /*  Embed buttons (copy iframe snippet)                                */
    /* ------------------------------------------------------------------ */

    // The copy-embed-code affordance shared by the on-page visualizations AND the
    // /dre-embed snippet gallery: one snippet builder, one resize listener, one
    // clipboard helper, one button factory — so the embed format lives in exactly
    // one place. A block opts in by stamping data-embed-slug (+ data-site-base) on
    // its container; dashboards get a per-chart button, the single-widget blocks
    // one button for the whole block. Never shown inside an embed (dre-embed-body).

    var EMBED_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
    var CHECK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

    // Host-side listener that resizes the iframe to the height the embed posts
    // (paired with the reporter in view/dre-visualizations/layout/embed.phtml).
    // Guarded + idempotent, so pasting several snippets on one page installs it
    // once. The escaped <\/script> keeps a copied snippet from closing an inline
    // <script> on the host page; its runtime value is a real </script>.
    ns.embedListener = "<script>(function(){if(window.__dreEmbedResize)return;window.__dreEmbedResize=1;"
        + "window.addEventListener('message',function(e){if(!e.data||e.data.type!=='dre-embed-height')return;"
        + "var f=document.getElementsByTagName('iframe');for(var i=0;i<f.length;i++){"
        + "if(f[i].contentWindow===e.source){f[i].style.height=e.data.height+'px';}}});})();<\/script>";

    /** Build the copy-paste embed snippet (iframe + the resize listener). */
    ns.embedSnippet = function (src, title, height) {
        return '<iframe src="' + src + '" title="' + (title || '') + '"'
            + ' loading="lazy" scrolling="no" style="width:100%;border:0;height:' + (height || 600) + 'px"></iframe>\n'
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

    // Briefly swap a button to a "copied" check, then restore its markup/title.
    function flashCopied(btn, restoreHtml, restoreTitle) {
        var copied = ns.t('copied', 'Copied');
        btn.innerHTML = CHECK_ICON + (btn.dataset.embedLabel ? '<span>' + ns.escapeHtml(copied) + '</span>' : '');
        btn.classList.add('rv-toolbar-btn-active');
        btn.title = copied;
        clearTimeout(btn._embedTimer);
        btn._embedTimer = setTimeout(function () {
            btn.innerHTML = restoreHtml;
            btn.classList.remove('rv-toolbar-btn-active');
            btn.title = restoreTitle;
        }, 1600);
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
        if (labelTxt) btn.dataset.embedLabel = labelTxt;
        var baseHtml = EMBED_ICON + (labelTxt ? '<span>' + ns.escapeHtml(labelTxt) + '</span>' : '');
        btn.innerHTML = baseHtml;
        var copyTitle = ns.t('copyEmbed', 'Copy the code to put this on another website');
        btn.title = copyTitle;
        btn.setAttribute('aria-label', copyTitle);
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            ns.copyToClipboard(ns.embedSnippet(opts.src, opts.title, opts.height)).then(function () {
                flashCopied(btn, baseHtml, copyTitle);
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
        if (!container.classList.contains('dashboard-async-container')) return;
        var slug = container.getAttribute('data-embed-slug');
        if (!slug) return;
        var siteBase = container.getAttribute('data-site-base') || '';
        var panels = container.querySelectorAll('.chart-panel');
        for (var i = 0; i < panels.length; i++) {
            (function (panel) {
                var cc = panel.querySelector('[data-chart]');
                var h3 = panel.querySelector('h3');
                if (!cc || !h3) return;
                var key = cc.getAttribute('data-chart');
                var bar = h3.querySelector('.rv-chart-toolbar');
                if (!bar) {
                    bar = document.createElement('span');
                    bar.className = 'rv-chart-toolbar';
                    h3.appendChild(bar);
                }
                bar.appendChild(ns.makeEmbedButton({
                    src: ns.embedUrl(siteBase, slug, key),
                    title: (ns.CHART_LABELS && ns.CHART_LABELS[key]) || key,
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
                    label: 'Embed this'
                }));
                wrap.insertBefore(bar, wrap.firstChild);
            })(hosts[i]);
        }
    };

    /** Backward-compatible helpers bundle for external chart modules. */
    ns.helpers = {
        THEME: ns.THEME, COLORS: ns.COLORS,
        initChart: ns.initChart, truncateLabel: ns.truncateLabel
    };

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
    // exist yet (the colour probe and the MutationObserver both need it). Defer
    // until the DOM is ready; charts/maps also init on DOMContentLoaded, and
    // initChart() lazily resolves the theme as a safety net.
    function setupThemeWatchers() {
        // Resolve tokens now that <body> exists, so the probe inherits the active
        // body[data-theme] cascade and the first chart renders in the right theme.
        ns.readTheme();

        // The DRE theme toggle sets `data-theme` on <body> (and updates it on
        // system changes when no manual choice is stored). Watching that single
        // attribute covers both the manual toggle and the system-preference path.
        if (window.MutationObserver) {
            new MutationObserver(scheduleRefresh).observe(document.body, {
                attributes: true, attributeFilter: ['data-theme']
            });
        }
        // Fallback for host themes that rely solely on the media query.
        if (window.matchMedia) {
            var mq = window.matchMedia('(prefers-color-scheme: dark)');
            var onMqChange = function () {
                if (!(document.body && document.body.getAttribute('data-theme'))) scheduleRefresh();
            };
            if (mq.addEventListener) mq.addEventListener('change', onMqChange);
            else if (mq.addListener) mq.addListener(onMqChange);
        }
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

    // Single global resize handler for all tracked charts + maps.
    var _resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(function () {
            ns.pruneCharts();
            ns._allCharts.forEach(function (c) { try { c.resize(); } catch (e) {} });
            ns._allMaps.forEach(function (m) { try { m.map.resize(); } catch (e) {} });
        }, 100);
    });

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
