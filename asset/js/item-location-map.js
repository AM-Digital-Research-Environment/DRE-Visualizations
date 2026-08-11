/**
 * Item location map — where a resource comes from and where it is held now.
 *
 * A small MapLibre panel appended under the knowledge graph when the item has
 * coordinates. Split out from the graph because it shares nothing with it: a
 * different renderer, a different library, and it loads MapLibre on its own so an
 * item WITHOUT coordinates never pays for the ~1 MiB map engine.
 *
 * Depends on: dashboard-core.js (ns.getBasemapStyle, ns.trackMap, ns.escapeHtml,
 * ns.ensureLibs) and MapLibre GL, which mount() loads on demand.
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) { console.warn('DreVisualizations: dashboard-core.js must load before item-location-map.js'); return; }

    /**
     * Render the map into an existing element.
     * @param {HTMLElement} mapEl  container for the map
     * @param {Object} itemMap     {origins: [{name,lat,lon,itemId}], current: [...]}
     * @param {string} siteBase    base URL for the item links in the popups
     */
    function render(mapEl, itemMap, siteBase) {
        if (typeof maplibregl === 'undefined') return;
        var origins = itemMap.origins || [];
        var current = itemMap.current || [];
        if (!origins.length && !current.length) return;

        var all = origins.concat(current);

        function create() {
            var map = new maplibregl.Map({
                container: mapEl,
                style: ns.getBasemapStyle(),
                center: [all[0].lon, all[0].lat],
                zoom: 3,
                attributionControl: ns.getMapAttributionOptions(),
                scrollZoom: false,
            });
            map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

            /** One marker + popup. Location names are curator data — always escaped. */
            function addMarkers(locs, color, roleLabel) {
                locs.forEach(function (loc) {
                    var popupHtml = '<strong>' + ns.escapeHtml(loc.name || '') + '</strong><br/>'
                        + '<span style="color:' + color + '">' + roleLabel + '</span>';
                    if (siteBase) popupHtml += '<br/><a href="' + ns.escapeHtml(siteBase) + '/item/'
                        + encodeURIComponent(loc.itemId) + '" style="font-size:12px">View location</a>';
                    new maplibregl.Marker({ color: color })
                        .setLngLat([loc.lon, loc.lat])
                        .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(popupHtml))
                        .addTo(map);
                });
            }

            map.on('load', function () {
                addMarkers(origins, ns.THEME.accent, 'Origin');
                addMarkers(current, ns.COLORS[1], 'Current location');

                // Fit bounds to all markers.
                if (all.length > 1) {
                    var bounds = new maplibregl.LngLatBounds();
                    all.forEach(function (loc) { bounds.extend([loc.lon, loc.lat]); });
                    map.fitBounds(bounds, { padding: 50, maxZoom: 8 });
                }
            });

            // Re-create with the new basemap + marker colours when the theme toggles.
            ns.trackMap(map, create);
            return map;
        }

        create();
    }

    /**
     * Append the "Locations" panel to `host` and mount the map into it, loading
     * MapLibre first. No-op when the item has no coordinates.
     */
    function mount(host, itemMap, siteBase) {
        var origins = (itemMap && itemMap.origins) || [];
        var current = (itemMap && itemMap.current) || [];
        if (!origins.length && !current.length) return;

        var wrapper = ns.el('div', 'rv-item-map-panel');
        wrapper.appendChild(ns.el('h3', null, ns.t('locations', 'Locations')));

        var legend = ns.el('div', 'rv-item-map-legend');
        function addKey(color, label) {
            var dot = ns.el('span', 'rv-legend-dot');
            dot.style.background = color;
            legend.appendChild(dot);
            legend.appendChild(ns.el('span', null, ' ' + label + ' '));
        }
        if (origins.length) addKey(ns.THEME.accent, ns.t('origin', 'Comes from here'));
        if (current.length) addKey(ns.COLORS[1], ns.t('currentLocation', 'Held here today'));
        wrapper.appendChild(legend);

        var mapEl = ns.el('div', 'rv-item-map-container');
        wrapper.appendChild(mapEl);
        host.appendChild(wrapper);

        (ns.ensureLibs ? ns.ensureLibs({ maplibre: true }) : Promise.resolve())
            .then(function () { render(mapEl, itemMap, siteBase); })
            .catch(function (err) { console.error('DreVisualizations:', err); });
    }

    ns.itemLocationMap = { mount: mount, render: render };
})();
