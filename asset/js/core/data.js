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
