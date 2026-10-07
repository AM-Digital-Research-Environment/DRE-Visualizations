/**
 * Affiliation map: a person's affiliated organisations (institutions) that carry
 * coordinates, as markers on a MapLibre map. Hidden by the orchestrator when the
 * `affiliationMap` data key is absent (no affiliation is geocoded).
 *
 * Data format: [{ name, lat, lon, itemId }]
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME;
    var esc = ns.escapeHtml;

    ns.charts = ns.charts || {};

    ns.charts.buildAffiliationMap = function (el, data, siteBase) {
        if (!data || !data.length || typeof maplibregl === 'undefined') return null;

        el.style.borderRadius = '6px';

        // Wrapped so the theme engine can rebuild the map (new basemap + marker
        // colours) on a live light/dark toggle — see dashboard-core ns.refresh().
        function create() {
            // globe: false — a handful of affiliation pins reads better flat.
            var map = ns.initMap(el, { center: [data[0].lon, data[0].lat], zoom: 3, globe: false });
            if (!map) return;

            map.on('load', function () {
                data.forEach(function (org) {
                    var html = '<strong>' + esc(org.name || '') + '</strong><br/>'
                        + '<span class="rv-popup-role" style="color:' + esc(THEME.accent) + '">'
                        + esc(ns.t('affiliation', 'Affiliation')) + '</span>';
                    // Project affiliation maps carry the affiliated members; the
                    // per-person map omits this field, so the block is skipped there.
                    if (org.members && org.members.length) {
                        html += '<br/><span class="rv-popup-meta">'
                            + esc(ns.plural(org.members.length, 'member', 'Member', 'Members')) + ': '
                            + esc(org.members.join(', ')) + '</span>';
                    }
                    if (siteBase && org.itemId) {
                        html += '<br/><a class="rv-popup-meta" href="' + esc(ns.itemUrl(siteBase, org.itemId)) + '">'
                            + esc(ns.t('viewOrganisation', 'View organisation')) + ' →</a>';
                    }
                    new maplibregl.Marker({ color: THEME.accent })
                        .setLngLat([org.lon, org.lat])
                        .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(html))
                        .addTo(map);
                });

                if (data.length > 1) {
                    ns.fitToPoints(map, data, { padding: 50, maxZoom: 8 });
                } else {
                    map.setCenter([data[0].lon, data[0].lat]);
                    map.setZoom(5);
                }
            });

            ns.trackMap(map, create);
            return { resize: function () { map.resize(); } };
        }
        return create();
    };
})();
