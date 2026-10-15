/**
 * Map chart builders: geographic origins map, self-location mini map.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var truncateLabel = ns.truncateLabel, getBasemapStyle = ns.getBasemapStyle;
    var esc = ns.escapeHtml;

    ns.charts = ns.charts || {};

    /* -- Map popup builder -- */

    function buildMapPopup(props, locItems, page, perPage, siteBase) {
        var total = locItems.length;
        var totalPages = Math.ceil(total / perPage);
        var start = page * perPage;
        var pageItems = locItems.slice(start, start + perPage);

        var h = '<div class="rv-popup-content">';
        h += '<strong>' + ns.escapeHtml(props.name || '') + '</strong>';
        h += ' <span class="rv-popup-count">' + esc(ns.plural(props.value, 'item', 'item', 'items', true)) + '</span>';

        if (pageItems.length) {
            h += '<ul class="rv-popup-items">';
            pageItems.forEach(function (it) {
                var url = siteBase ? ns.itemUrl(siteBase, it.id) : '#';
                var title = truncateLabel(it.title, 55);
                h += '<li><a href="' + esc(url) + '">' + esc(title) + '</a></li>';
            });
            h += '</ul>';
        }

        if (totalPages > 1) {
            h += '<div class="rv-popup-pagination">';
            if (page > 0) h += '<button type="button" data-page="' + (page - 1) + '">\u2190</button>';
            h += '<span>' + (page + 1) + ' / ' + totalPages + '</span>';
            if (page < totalPages - 1) h += '<button type="button" data-page="' + (page + 1) + '">\u2192</button>';
            h += '</div>';
        }

        if (props.itemId && siteBase) {
            h += '<a class="rv-popup-location-link" href="' + esc(ns.itemUrl(siteBase, props.itemId)) + '">'
                + esc(ns.t('openPlacePage', 'Open this place\u2019s page')) + ' \u2192</a>';
        }

        h += '</div>';
        return h;
    }

    /* -- Geographic origins map -- */

    /*
     * Overlays read from the whole dashboard (the 4th argument):
     *   currentLocations      — where items are held now, an orange bubble layer
     *   geoFlows              — origin → current-location lines
     *   publicationCountries  — the Publications dashboard's countries
     *                           [{country, outline, count, lat, lon, items}],
     *                           shaded under its places-of-publication bubbles
     */
    ns.charts.buildMap = function (el, data, siteBase, allData) {
        var hasOriginData = data && data.length;
        var hasCurrentData = allData && allData.currentLocations && allData.currentLocations.length;
        var countryRows = (allData && allData.publicationCountries) || [];
        var shading = countryRows.length > 0 && ns.countryShading ? ns.countryShading : null;
        if ((!hasOriginData && !hasCurrentData && !shading) || typeof maplibregl === 'undefined') return null;
        data = data || [];

        el.style.borderRadius = '6px';

        // Wrapped so the theme engine can rebuild the map (new basemap + theme
        // colours) on a live light/dark toggle — see dashboard-core ns.refresh().
        function create() {
        // Attribution hidden — source info in map tiles. Users can inspect via browser.
        var map = ns.initMap(el, { center: [0, 15], zoom: 1.5 });
        if (!map) return;

        map.on('load', function () {

            var features = data.map(function (loc) {
                return {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [loc.lon, loc.lat] },
                    properties: { name: loc.name, value: loc.value, itemId: loc.itemId }
                };
            });

            map.addSource('locations', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: features },
                cluster: true,
                clusterMaxZoom: 8,
                clusterRadius: 40,
            });

            map.addLayer({
                id: 'clusters', type: 'circle', source: 'locations',
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': ['step', ['get', 'point_count'], COLORS[0], 10, COLORS[1], 30, COLORS[5]],
                    'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 32],
                    'circle-stroke-width': 2, 'circle-stroke-color': THEME.border,
                }
            });

            map.addLayer({
                id: 'cluster-count', type: 'symbol', source: 'locations',
                filter: ['has', 'point_count'],
                layout: { 'text-font': ns.MAP_LABEL_FONT, 'text-field': '{point_count_abbreviated}', 'text-size': 12 },
                // White count with a soft dark halo so it reads on every cluster
                // brand colour (Uni-Grün through Gold) in both themes.
                paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.45)', 'text-halo-width': 1 }
            });

            map.addLayer({
                id: 'points', type: 'circle', source: 'locations',
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': THEME.accent,
                    'circle-radius': ['interpolate', ['linear'], ['get', 'value'], 1, 7, 50, 18, 200, 28],
                    'circle-stroke-width': 2, 'circle-stroke-color': THEME.border, 'circle-opacity': 0.85,
                }
            });

            map.addLayer({
                id: 'point-labels', type: 'symbol', source: 'locations',
                filter: ['!', ['has', 'point_count']],
                layout: { 'text-font': ns.MAP_LABEL_FONT, 'text-field': '{name}', 'text-size': 11, 'text-offset': [0, 1.8], 'text-anchor': 'top' },
                paint: { 'text-color': THEME.text, 'text-halo-color': THEME.border, 'text-halo-width': 1.5 }
            });

            var locationItems = {};
            data.forEach(function (loc) {
                if (loc.items && loc.items.length) locationItems[loc.name] = loc.items;
            });

            // --- Current-location layer (orange) ---
            // Where items are *held now* (dcterms:provenance) — Locations AND
            // Institutions, both geocoded. Its own clustered layer, so it shows on
            // every dashboard map, with or without origin→current flows.
            var currentData = (allData && allData.currentLocations) || [];
            var hasCurrent = currentData.length > 0;
            var currentColor = COLORS[2];
            var currentItems = {};

            if (hasCurrent) {
                var curFeatures = currentData.map(function (loc) {
                    if (loc.items && loc.items.length) currentItems[loc.name] = loc.items;
                    return {
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [loc.lon, loc.lat] },
                        properties: { name: loc.name, value: loc.value, itemId: loc.itemId }
                    };
                });

                map.addSource('currentLocations', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: curFeatures },
                    cluster: true, clusterMaxZoom: 8, clusterRadius: 40,
                });

                map.addLayer({
                    id: 'cur-clusters', type: 'circle', source: 'currentLocations',
                    filter: ['has', 'point_count'],
                    paint: {
                        'circle-color': currentColor,
                        'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 30, 30],
                        'circle-stroke-width': 2, 'circle-stroke-color': THEME.border,
                    }
                });

                map.addLayer({
                    id: 'cur-cluster-count', type: 'symbol', source: 'currentLocations',
                    filter: ['has', 'point_count'],
                    layout: { 'text-font': ns.MAP_LABEL_FONT, 'text-field': '{point_count_abbreviated}', 'text-size': 12 },
                    paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.45)', 'text-halo-width': 1 }
                });

                map.addLayer({
                    id: 'cur-points', type: 'circle', source: 'currentLocations',
                    filter: ['!', ['has', 'point_count']],
                    paint: {
                        'circle-color': currentColor,
                        'circle-radius': ['interpolate', ['linear'], ['get', 'value'], 1, 7, 50, 16, 200, 26],
                        'circle-stroke-width': 2, 'circle-stroke-color': THEME.border, 'circle-opacity': 0.85,
                    }
                });

                map.addLayer({
                    id: 'cur-point-labels', type: 'symbol', source: 'currentLocations',
                    filter: ['!', ['has', 'point_count']],
                    layout: { 'text-font': ns.MAP_LABEL_FONT, 'text-field': '{name}', 'text-size': 11, 'text-offset': [0, 1.8], 'text-anchor': 'top' },
                    paint: { 'text-color': THEME.text, 'text-halo-color': THEME.border, 'text-halo-width': 1.5 }
                });
            }

            // --- GeoFlows overlay (origin → current location arcs) ---
            var geoFlows = allData && allData.geoFlows;
            var hasFlows = geoFlows && geoFlows.links && geoFlows.links.length > 0;

            if (hasFlows) {
                var flowFeatures = geoFlows.links.map(function (l) {
                    return {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: [[l.fromLon, l.fromLat], [l.toLon, l.toLat]]
                        },
                        properties: {
                            from: l.from, to: l.to, value: l.value,
                            width: Math.max(1, Math.min(6, Math.sqrt(l.value)))
                        }
                    };
                });

                map.addSource('flows', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: flowFeatures }
                });

                // Flow lines rendered below origin points.
                map.addLayer({
                    id: 'flow-lines',
                    type: 'line',
                    source: 'flows',
                    paint: {
                        'line-color': THEME.accent,
                        'line-width': ['get', 'width'],
                        'line-opacity': 0.35
                    }
                }, 'clusters'); // insert before clusters layer

                // Current-location dots — only when there is no standalone current
                // layer (older precomputes without `currentLocations`); otherwise the
                // orange clustered layer above already renders them.
                if (!hasCurrent) {
                var seenCurrents = {};
                var currentFeatures = [];
                geoFlows.links.forEach(function (l) {
                    var key = l.toLat + ',' + l.toLon;
                    if (!seenCurrents[key]) {
                        seenCurrents[key] = true;
                        currentFeatures.push({
                            type: 'Feature',
                            geometry: { type: 'Point', coordinates: [l.toLon, l.toLat] },
                            properties: { name: l.to }
                        });
                    }
                });

                map.addSource('currents', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: currentFeatures }
                });

                map.addLayer({
                    id: 'current-dots',
                    type: 'circle',
                    source: 'currents',
                    paint: {
                        'circle-radius': 7,
                        'circle-color': currentColor,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': THEME.border,
                        'circle-opacity': 0.85
                    }
                });

                map.addLayer({
                    id: 'current-labels',
                    type: 'symbol',
                    source: 'currents',
                    layout: { 'text-font': ns.MAP_LABEL_FONT, 'text-field': '{name}', 'text-size': 11, 'text-offset': [0, 1.8], 'text-anchor': 'top' },
                    paint: { 'text-color': THEME.text, 'text-halo-color': THEME.border, 'text-halo-width': 1.5 }
                });
                }
            }

            // --- Popup management (single popup at a time) ---
            var activePopup = null;
            function showPopup(lngLat, html) {
                if (activePopup) activePopup.remove();
                activePopup = ns.mapPopup({ offset: 12, maxWidth: '320px', className: 'rv-map-popup' })
                    .setLngLat(lngLat)
                    .setHTML(html)
                    .addTo(map);
                return activePopup;
            }

            // A popup listing a place's items, eight to a page.
            function showListPopup(lngLat, props, list) {
                var perPage = 8;
                showPopup(lngLat, buildMapPopup(props, list, 0, perPage, siteBase));
                (function attach() {
                    var pe = activePopup && activePopup.getElement();
                    if (!pe) return;
                    pe.querySelectorAll('[data-page]').forEach(function (btn) {
                        btn.addEventListener('click', function (evt) {
                            evt.stopPropagation();
                            activePopup.setHTML(buildMapPopup(props, list, parseInt(btn.dataset.page, 10), perPage, siteBase));
                            attach();
                        });
                    });
                })();
            }

            map.on('click', 'points', function (e) {
                var props = e.features[0].properties;
                showListPopup(e.lngLat, props, locationItems[props.name] || []);
            });

            if (hasFlows) {
                map.on('click', 'flow-lines', function (e) {
                    var p = e.features[0].properties;
                    showPopup(e.lngLat,
                        '<div class="rv-popup-content"><strong>' + esc(p.from || '')
                        + '</strong> \u2192 <strong>' + esc(p.to || '') + '</strong><br/>'
                        + esc(ns.plural(p.value, 'item', 'item', 'items', true)) + '</div>');
                });

                map.on('click', 'current-dots', function (e) {
                    var p = e.features[0].properties;
                    showPopup(e.lngLat,
                        '<div class="rv-popup-content"><strong>' + esc(p.name || '')
                        + '</strong><br/><em>' + esc(ns.t('currentLocation', 'Current location')) + '</em></div>');
                });

                ['flow-lines', 'current-dots'].forEach(function (layerId) {
                    map.on('mouseenter', layerId, function () { map.getCanvas().style.cursor = 'pointer'; });
                    map.on('mouseleave', layerId, function () { map.getCanvas().style.cursor = ''; });
                });
            }

            map.on('click', 'clusters', function (e) {
                var clusterId = e.features[0].properties.cluster_id;
                // MapLibre 4+ returns a Promise; the old callback form is ignored.
                map.getSource('locations').getClusterExpansionZoom(clusterId).then(function (zoom) {
                    map.easeTo({ center: e.lngLat, zoom: zoom });
                }).catch(function () { /* cluster gone after a data change */ });
            });

            map.on('mouseenter', 'points', function () { map.getCanvas().style.cursor = 'pointer'; });
            map.on('mouseleave', 'points', function () { map.getCanvas().style.cursor = ''; });
            map.on('mouseenter', 'clusters', function () { map.getCanvas().style.cursor = 'pointer'; });
            map.on('mouseleave', 'clusters', function () { map.getCanvas().style.cursor = ''; });

            // --- Current-location interactions (item-list popups + cluster zoom) ---
            if (hasCurrent) {
                map.on('click', 'cur-points', function (e) {
                    var props = e.features[0].properties;
                    showListPopup(e.lngLat, props, currentItems[props.name] || []);
                });

                map.on('click', 'cur-clusters', function (e) {
                    var clusterId = e.features[0].properties.cluster_id;
                    map.getSource('currentLocations').getClusterExpansionZoom(clusterId).then(function (zoom) {
                        map.easeTo({ center: e.lngLat, zoom: zoom });
                    }).catch(function () { /* cluster gone after a data change */ });
                });

                ['cur-points', 'cur-clusters'].forEach(function (layerId) {
                    map.on('mouseenter', layerId, function () { map.getCanvas().style.cursor = 'pointer'; });
                    map.on('mouseleave', layerId, function () { map.getCanvas().style.cursor = ''; });
                });
            }

            // --- Country shading (publications) ---
            // Countries filled on the accent ramp by how many publications
            // appeared there, beneath every bubble and line. A country too small
            // for the outlines (Singapore) is a disc of the same colour.
            // Rows join the outlines on `outline` (the outline's own name, set
            // when the country's title matched one), else on the title.
            function countryKey(r) { return String(r.outline || r.country).toLowerCase(); }
            var countryByName = {};
            var maxCountry = 1;
            countryRows.forEach(function (r) {
                if (!r || !r.country) return;
                countryByName[countryKey(r)] = r;
                maxCountry = Math.max(maxCountry, r.count || 0);
            });
            var countryRamp = shading ? shading.ramp() : null;
            var countryBreaks = shading ? shading.breaks(maxCountry) : null;

            if (shading) {
                shading.load().then(function (geo) {
                    if (!map || !map.getStyle || map.getSource('pub-countries')) return;
                    var fill = shading.fill(countryRamp, countryBreaks);
                    var below = map.getLayer('flow-lines') ? 'flow-lines' : 'clusters';
                    var outlined = {};
                    var shaded = {
                        type: 'FeatureCollection',
                        features: geo.features.map(function (f) {
                            var props = f.properties || {};
                            var row = shading.featureMatch(props, countryByName);
                            if (row) outlined[countryKey(row)] = true;
                            return {
                                type: 'Feature', geometry: f.geometry,
                                properties: { count: row ? row.count || 0 : 0, key: row ? countryKey(row) : '' }
                            };
                        })
                    };
                    map.addSource('pub-countries', { type: 'geojson', data: shaded });
                    map.addLayer({
                        id: 'country-fill', type: 'fill', source: 'pub-countries',
                        paint: { 'fill-color': fill, 'fill-opacity': 0.85 }
                    }, below);
                    map.addLayer({
                        id: 'country-line', type: 'line', source: 'pub-countries',
                        paint: { 'line-color': THEME.border, 'line-width': 0.5 }
                    }, below);

                    var loose = countryRows.filter(function (r) {
                        return r && r.country && !outlined[countryKey(r)]
                            && r.lat != null && r.lon != null
                            && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon));
                    });
                    if (loose.length) {
                        map.addSource('pub-country-dots', {
                            type: 'geojson',
                            data: {
                                type: 'FeatureCollection',
                                features: loose.map(function (r) {
                                    return {
                                        type: 'Feature',
                                        geometry: { type: 'Point', coordinates: [Number(r.lon), Number(r.lat)] },
                                        properties: { count: r.count || 0, key: countryKey(r) }
                                    };
                                })
                            }
                        });
                        map.addLayer({
                            id: 'country-dots', type: 'circle', source: 'pub-country-dots',
                            paint: {
                                'circle-color': fill, 'circle-radius': 6,
                                'circle-stroke-width': 1, 'circle-stroke-color': THEME.border
                            }
                        }, below);
                    }

                    // A click on a country lists its publications — unless a
                    // bubble above it took the click.
                    var bubbleLayers = ['clusters', 'points', 'cur-clusters', 'cur-points', 'flow-lines', 'current-dots'];
                    function onCountry(e) {
                        var over = map.queryRenderedFeatures(e.point, {
                            layers: bubbleLayers.filter(function (id) { return map.getLayer(id); })
                        });
                        if (over.length || !e.features || !e.features.length) return;
                        var row = countryByName[e.features[0].properties.key];
                        if (!row) return;
                        showListPopup(e.lngLat, { name: row.country, value: row.count }, row.items || []);
                    }
                    ['country-fill', 'country-dots'].forEach(function (layerId) {
                        if (!map.getLayer(layerId)) return;
                        map.on('click', layerId, onCountry);
                        map.on('mousemove', layerId, function (e) {
                            var counted = e.features && e.features.length && e.features[0].properties.count > 0;
                            map.getCanvas().style.cursor = counted ? 'pointer' : '';
                        });
                        map.on('mouseleave', layerId, function () { map.getCanvas().style.cursor = ''; });
                    });
                }).catch(function (err) {
                    if (window.console) console.error('Country shading failed:', err);
                });
            }

            // --- Fit bounds ---
            if (features.length === 1 && !hasFlows && !hasCurrent && !shading) {
                map.setCenter(features[0].geometry.coordinates);
                map.setZoom(4);
            } else {
                var pts = features.map(function (f) { return f.geometry.coordinates; })
                    .concat(hasFlows ? geoFlows.links.map(function (l) { return [l.toLon, l.toLat]; }) : [])
                    .concat(hasCurrent ? currentData.map(function (loc) { return [loc.lon, loc.lat]; }) : [])
                    .concat(countryRows.filter(function (r) {
                        return r && r.lat != null && r.lon != null && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon));
                    }).map(function (r) { return [Number(r.lon), Number(r.lat)]; }));
                ns.fitToPoints(map, pts, { padding: 40, maxZoom: 6 });
            }

            // --- Legend (rendered below the map; see ns.mountMapLegend) ---
            if (shading) {
                var swatches = countryRamp.stops.map(function (c) {
                    return '<span class="rv-map-legend-swatch" style="background:' + esc(c) + '"></span>';
                }).join('');
                ns.mountMapLegend(el,
                    '<div class="rv-map-legend-row"><span>1</span>' + swatches + '<span>' + esc(String(maxCountry)) + '</span></div>'
                        + '<div class="rv-map-legend-caption">' + esc(ns.t('publicationsPerCountry', 'Publications per country')) + '</div>'
                        + (features.length
                            ? '<div class="rv-map-legend-row"><span class="rv-map-legend-dot" style="background:' + esc(THEME.accent) + '"></span> '
                                + esc(ns.t('placeOfPublication', 'Place of publication')) + '</div>'
                            : ''),
                    'rv-choropleth-legend');
            } else if (hasCurrent || hasFlows) {
                var legendHtml =
                    '<div class="rv-map-legend-row"><span class="rv-map-legend-dot" style="background:' + esc(THEME.accent) + '"></span> ' + esc(ns.t('origin', 'Place of origin')) + '</div>' +
                    '<div class="rv-map-legend-row"><span class="rv-map-legend-dot" style="background:' + esc(currentColor) + '"></span> ' + esc(ns.t('currentLocation', 'Current location')) + '</div>';
                if (hasFlows) {
                    legendHtml += '<div class="rv-map-legend-row"><span class="rv-map-legend-line" style="background:' + esc(THEME.accent) + '"></span> ' + esc(ns.t('flow', 'Flow')) + '</div>';
                }
                ns.mountMapLegend(el, legendHtml);
            }
        });

        ns.trackMap(map, create);
        return { resize: function () { map.resize(); } };
        }
        return create();
    };

    /* -- Self-location mini map -- */

    ns.charts.buildMiniMap = function (el, data) {
        if (!data || !Number.isFinite(Number(data.lat)) || !Number.isFinite(Number(data.lon))
            || typeof maplibregl === 'undefined') return null;
        el.style.borderRadius = '6px';

        function create() {
        var map = ns.createMap({
            container: el,
            style: getBasemapStyle(),
            center: [data.lon, data.lat],
            zoom: 4,
            attributionControl: ns.getMapAttributionOptions(),
            scrollZoom: false,
        });
        if (!map) return;
        map.addControl(ns.navControl(), 'top-right');
        new maplibregl.Marker({ color: THEME.accent })
            .setLngLat([data.lon, data.lat])
            .addTo(map)
            .setPopup(ns.mapPopup({ offset: 12 }).setHTML('<strong>' + esc(data.name || '') + '</strong>'));
        ns.trackMap(map, create);
        return { resize: function () { map.resize(); } };
        }
        return create();
    };
})();
