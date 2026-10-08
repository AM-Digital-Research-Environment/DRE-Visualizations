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
         * a host page that already published the namespace, and
         * ns._libPromises covers repeat callers within this page. This runs
         * after the document is parsed, so — unlike a <script type="module"> in
         * the head — it cannot make Firefox discard an import map that follows
         * (DashboardAssets::MAPLIBRE_JS). `register` runs once, before any caller sees
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
