/**
 * Choropleth map builder: country-level item counts on Natural Earth 110m.
 *
 * Data: [{ country, count }] — joined against the GeoJSON ADMIN/NAME property
 * (lower-cased), matching the dashboard's ChoroplethMap so the two render the
 * same country set. MapLibre fill layer with a log-spaced step ramp derived
 * from the DRE --primary accent (ns.countryShading, core/maps.js); theme-aware
 * via ns.getBasemapStyle + ns.trackMap (rebuilds on light/dark toggle).
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME;

    ns.charts = ns.charts || {};

    // The outlines, ramp, breaks and name join every country map shares (core/maps.js).
    var shading = ns.countryShading;
    var loadCountries = shading.load;
    var buildRamp = shading.ramp;
    var buildBreaks = shading.breaks;
    var fillExpression = shading.fill;
    var extendBounds = shading.extendBounds;
    var featureName = shading.featureName;
    var featureMatch = shading.featureMatch;

    ns.charts.buildChoropleth = function (el, data, siteBase) {
        if (!data || !data.length || typeof maplibregl === 'undefined') return null;
        el.style.borderRadius = '6px';

        // country (lower-cased) → count, and the running total for shares.
        var counts = {};
        var total = 0;
        data.forEach(function (d) {
            if (!d.country) return;
            var k = String(d.country).toLowerCase();
            counts[k] = (counts[k] || 0) + (d.count || 0);
            total += d.count || 0;
        });
        var maxCount = Math.max.apply(null, data.map(function (d) { return d.count || 0; }).concat(1));

        function lookupCount(props) {
            return featureMatch(props, counts) || 0;
        }

        function countryName(props) {
            return featureName(props) || ns.t('unknownCountry', 'Unknown');
        }

        // Wrapped so the theme engine can rebuild the map on a light/dark toggle.
        function create() {
            var map = ns.initMap(el, { center: [10, 18], zoom: 1.3 });
            if (!map) return;

            map.on('load', function () {
                loadCountries().then(function (geo) {
                    if (!map || !map.getStyle) return;
                    var ramp = buildRamp();
                    var breaks = buildBreaks(maxCount);

                    // Inject a numeric `count` the fill expression reads against.
                    var merged = {
                        type: 'FeatureCollection',
                        features: geo.features.map(function (f) {
                            var props = f.properties || {};
                            var copy = {};
                            for (var k in props) copy[k] = props[k];
                            copy.count = lookupCount(props);
                            return { type: 'Feature', geometry: f.geometry, properties: copy };
                        })
                    };

                    map.addSource('countries', { type: 'geojson', data: merged });

                    map.addLayer({
                        id: 'country-fill', type: 'fill', source: 'countries',
                        paint: {
                            'fill-color': fillExpression(ramp, breaks),
                            'fill-outline-color': THEME.border,
                            'fill-opacity': 0.9
                        }
                    });
                    map.addLayer({
                        id: 'country-line', type: 'line', source: 'countries',
                        paint: { 'line-color': THEME.border, 'line-width': 0.5 }
                    });

                    // --- Hover popup (country, count, share) ---
                    var activePopup = null;
                    var activeCountry = null; // the popup's HTML is rebuilt only when this changes
                    map.on('mousemove', 'country-fill', function (e) {
                        if (!e.features || !e.features.length) return;
                        var props = e.features[0].properties || {};
                        var name = countryName(props);
                        if (!activePopup) {
                            activePopup = ns.mapPopup({ closeButton: false, closeOnClick: false, offset: 8, className: 'rv-map-popup' });
                        }
                        activePopup.setLngLat(e.lngLat);
                        if (name === activeCountry && activePopup.isOpen()) return;
                        activeCountry = name;
                        var count = Number(props.count || 0);
                        map.getCanvas().style.cursor = count > 0 ? 'pointer' : '';
                        var share = total > 0 ? (count / total * 100) : 0;
                        var html = '<div class="rv-popup-content"><strong>' + ns.escapeHtml(name) + '</strong>'
                            + (count > 0
                                ? '<br/><span class="rv-popup-count">' + ns.escapeHtml(ns.plural(count, 'item', 'item', 'items', true)
                                  + ' · ' + new Intl.NumberFormat(ns.locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(share) + '%') + '</span>'
                                : '<br/><em>' + ns.escapeHtml(ns.t('noItems', 'No items')) + '</em>')
                            + '</div>';
                        activePopup.setHTML(html).addTo(map);
                    });
                    map.on('mouseleave', 'country-fill', function () {
                        map.getCanvas().style.cursor = '';
                        activeCountry = null;
                        if (activePopup) { activePopup.remove(); activePopup = null; }
                    });

                    // --- Fit to countries that have data ---
                    var bounds = new maplibregl.LngLatBounds();
                    var any = false;
                    merged.features.forEach(function (f) {
                        if ((f.properties.count || 0) > 0) { extendBounds(bounds, f.geometry); any = true; }
                    });
                    if (any && !bounds.isEmpty()) {
                        map.fitBounds(bounds, { padding: 36, maxZoom: 5, duration: 0 });
                    }

                    // --- Legend (rendered below the map; see ns.mountMapLegend) ---
                    var swatches = ramp.stops.map(function (c) {
                        return '<span class="rv-map-legend-swatch" style="background:' + c + '"></span>';
                    }).join('');
                    ns.mountMapLegend(el,
                        '<div class="rv-map-legend-row"><span>1</span>' + swatches
                            + '<span>' + maxCount + '</span></div>'
                            + '<div class="rv-map-legend-caption">' + ns.escapeHtml(ns.t('itemsPerCountry', 'Items per country')) + '</div>',
                        'rv-choropleth-legend');
                }).catch(function (err) {
                    if (window.console) console.error('Choropleth load failed:', err);
                });
            });

            ns.trackMap(map, create);
            return { resize: function () { map.resize(); } };
        }
        return create();
    };
})();
