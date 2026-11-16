/**
 * Co-author institutions map (the Publications dashboard's `coAuthorMap`):
 * the geocoded institutions the authors and editors are affiliated with, as
 * circles sized by their people and coloured by their place in the cluster,
 * with a line from the hub (the University of Bayreuth) to every institution
 * it shares publications with.
 *
 * Data (Aggregators::buildCoAuthorInstitutionMap):
 *   { hub: itemId,
 *     institutions: [{ itemId, name, lat, lon, category: 'hub'|'amrc'|'partner'|'other',
 *                      authors, publications, joint, people: [{ id, name }] }],
 *     coverage: { people, mappedPeople, publications, mappedPublications } }
 * `joint` counts the publications on which two different people bring the
 * hub and the institution; the precompute does that counting.
 *
 * A canvas map has no table of its own, so the builder hands the toolbar
 * `csvRows` (CSV download and the "Data table" disclosure) and `getDataURL`
 * (save as image) like the canvas networks do.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var t = ns.t;

    ns.charts = ns.charts || {};

    var CATEGORIES = ['hub', 'amrc', 'partner', 'other'];
    var PEOPLE_SHOWN = 30;

    // `hubName` names the hub in the legend; without it (a popup or table row
    // that already names the institution) the hub is described by its role.
    function categoryLabel(key, hubName) {
        switch (key) {
            case 'hub': return hubName || t('coAuthorMapHub', 'Where most of the authors and editors work');
            case 'amrc': return t('coAuthorMapAmrc', 'Africa Multiple Research Centre');
            case 'partner': return t('coAuthorMapPartner', 'Other cluster partner');
            default: return t('coAuthorMapOther', 'Other institution');
        }
    }

    // The network's affiliation colours where the meanings meet: the cluster
    // in the first palette hue, partners in the second, the rest muted.
    function categoryColour(key) {
        switch (key) {
            case 'hub': return ns.COLORS[0];
            case 'amrc': return ns.COLORS[2];
            case 'partner': return ns.COLORS[1];
            default: return ns.THEME.muted;
        }
    }

    ns.charts.buildCoAuthorMap = function (el, data, siteBase) {
        var rows = (data && data.institutions) || [];
        if (!rows.length || typeof maplibregl === 'undefined') return null;

        var hub = null;
        rows.forEach(function (r) { if (r.itemId === data.hub) hub = r; });
        var hubName = hub ? hub.name : '';
        var counts = {};
        rows.forEach(function (r) { counts[r.category] = (counts[r.category] || 0) + 1; });

        el.style.borderRadius = '6px';
        var current = null;

        function popupContent(r) {
            var box = ns.el('div', 'rv-popup-content');
            var title = ns.el('strong', null, r.name);
            box.appendChild(title);
            box.appendChild(ns.el('div', 'rv-popup-sub', categoryLabel(r.category)));
            var meta = [
                ns.plural(r.authors, 'authorOrEditor', 'author or editor', 'authors and editors', true),
                ns.plural(r.publications, 'publication', 'publication', 'publications', true)
            ];
            if (hub && r.itemId !== hub.itemId && r.joint > 0) {
                meta.push(ns.fill(t('coAuthorMapJoint', '{count} with {hub}'), {
                    count: ns.formatNumber(r.joint), hub: hubName
                }));
            }
            box.appendChild(ns.el('div', 'rv-popup-meta', meta.join(' · ')));
            var list = ns.el('ul', 'rv-popup-items');
            (r.people || []).slice(0, PEOPLE_SHOWN).forEach(function (p) {
                var li = ns.el('li');
                if (siteBase && p.id) {
                    var a = ns.el('a', null, p.name);
                    a.href = ns.itemUrl(siteBase, p.id);
                    li.appendChild(a);
                } else {
                    li.textContent = p.name;
                }
                list.appendChild(li);
            });
            box.appendChild(list);
            var rest = (r.people || []).length - PEOPLE_SHOWN;
            if (rest > 0) {
                box.appendChild(ns.el('div', 'rv-popup-meta',
                    ns.fill(t('coAuthorMapMore', 'and {count} more'), { count: ns.formatNumber(rest) })));
            }
            if (siteBase && r.itemId) {
                var link = ns.el('a', 'rv-popup-location-link', t('viewOrganisation', 'View organisation') + ' →');
                link.href = ns.itemUrl(siteBase, r.itemId);
                box.appendChild(link);
            }
            return box;
        }

        function legendHtml() {
            var esc = ns.escapeHtml;
            var html = CATEGORIES.filter(function (k) { return counts[k]; }).map(function (k) {
                return '<div class="rv-map-legend-row"><span class="rv-map-legend-dot" style="background:'
                    + esc(categoryColour(k)) + '"></span> ' + esc(categoryLabel(k, hubName))
                    + ' (' + esc(ns.formatNumber(counts[k])) + ')</div>';
            }).join('');
            if (hub) {
                html += '<div class="rv-map-legend-row"><span class="rv-map-legend-line" style="background:'
                    + esc(categoryColour('hub')) + '"></span> '
                    + esc(ns.fill(t('coAuthorMapLines', 'Publications shared with {hub}'), { hub: hubName })) + '</div>';
            }
            var c = data.coverage;
            if (c && c.people) {
                html += '<div class="rv-map-legend-caption">' + esc(ns.fill(
                    t('coAuthorMapCoverage', '{mapped} of {people} linked authors and editors have a mapped affiliation; {mappedPublications} of {publications} publications have at least one of them.'),
                    {
                        mapped: ns.formatNumber(c.mappedPeople), people: ns.formatNumber(c.people),
                        mappedPublications: ns.formatNumber(c.mappedPublications),
                        publications: ns.formatNumber(c.publications)
                    })) + '</div>';
            }
            return html;
        }

        function create() {
            // preserveDrawingBuffer, so "Save as image" can read the canvas.
            var map = ns.initMap(el, { center: [10, 15], zoom: 1.3, exportable: true });
            if (!map) return null;
            current = map;

            map.on('load', function () {
                var circles = rows.map(function (r, i) {
                    return {
                        type: 'Feature', id: i,
                        geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
                        properties: {
                            index: i, name: r.name, authors: r.authors,
                            colour: categoryColour(r.category), hub: r.category === 'hub'
                        }
                    };
                });
                var lines = !hub ? [] : rows.filter(function (r) {
                    return r.itemId !== hub.itemId && r.joint > 0;
                }).map(function (r) {
                    return {
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: [[hub.lon, hub.lat], [r.lon, r.lat]] },
                        properties: { index: rows.indexOf(r), joint: r.joint, width: Math.max(1, Math.min(7, Math.sqrt(r.joint) * 1.4)) }
                    };
                });

                map.addSource('coauthor-links', { type: 'geojson', data: { type: 'FeatureCollection', features: lines } });
                map.addSource('coauthor-institutions', { type: 'geojson', data: { type: 'FeatureCollection', features: circles } });

                map.addLayer({
                    id: 'coauthor-lines', type: 'line', source: 'coauthor-links',
                    layout: { 'line-cap': 'round' },
                    paint: { 'line-color': categoryColour('hub'), 'line-width': ['get', 'width'], 'line-opacity': 0.4 }
                });
                // Square-root scale: area follows people, and the hub (about half of
                // the mapped people on AMIRA) does not swallow its neighbours.
                map.addLayer({
                    id: 'coauthor-points', type: 'circle', source: 'coauthor-institutions',
                    layout: { 'circle-sort-key': ['-', 0, ['get', 'authors']] },
                    paint: {
                        'circle-color': ['get', 'colour'],
                        'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'authors']], 1, 5, 7, 16, 14, 24],
                        'circle-opacity': 0.85,
                        'circle-stroke-color': ['case', ['get', 'hub'], ns.THEME.text, ns.THEME.border],
                        'circle-stroke-width': ['case', ['get', 'hub'], 2.5, 1.5]
                    }
                });
                map.addLayer({
                    id: 'coauthor-labels', type: 'symbol', source: 'coauthor-institutions',
                    layout: {
                        'text-font': ns.MAP_LABEL_FONT, 'text-field': ['get', 'name'], 'text-size': 11,
                        'text-offset': [0, 1.6], 'text-anchor': 'top', 'text-optional': true,
                        'text-max-width': 12, 'symbol-sort-key': ['-', 0, ['get', 'authors']]
                    },
                    paint: { 'text-color': ns.THEME.text, 'text-halo-color': ns.THEME.border, 'text-halo-width': 1.5 }
                });

                var popup = null;
                function show(lngLat, node) {
                    if (popup) popup.remove();
                    popup = ns.mapPopup({ offset: 10, maxWidth: '320px', className: 'rv-map-popup' })
                        .setLngLat(lngLat).setDOMContent(node).addTo(map);
                }
                map.on('click', 'coauthor-points', function (e) {
                    var r = rows[e.features[0].properties.index];
                    if (r) show([r.lon, r.lat], popupContent(r));
                });
                map.on('click', 'coauthor-lines', function (e) {
                    var r = rows[e.features[0].properties.index];
                    if (!r) return;
                    var box = ns.el('div', 'rv-popup-content');
                    box.appendChild(ns.el('strong', null, hubName + ' – ' + r.name));
                    box.appendChild(ns.el('div', 'rv-popup-meta',
                        ns.plural(r.joint, 'sharedPublication', 'shared publication', 'shared publications', true)));
                    show(e.lngLat, box);
                });
                ['coauthor-points', 'coauthor-lines'].forEach(function (layer) {
                    map.on('mouseenter', layer, function () { map.getCanvas().style.cursor = 'pointer'; });
                    map.on('mouseleave', layer, function () { map.getCanvas().style.cursor = ''; });
                });

                ns.fitToPoints(map, rows, { padding: 40, maxZoom: 5, duration: 0 });
                ns.mountMapLegend(el, legendHtml());
            });

            ns.trackMap(map, create);
            return map;
        }

        if (!create()) return null;

        return {
            _noDecal: true,
            resize: function () { if (current) current.resize(); },
            getDataURL: function () { return (current && ns.mapPng(current)) || ''; },
            csvRows: function () {
                var out = [[
                    t('institution', 'Institution'),
                    t('category', 'Category'),
                    t('authorsAndEditors', 'Authors and editors'),
                    t('publications', 'Publications'),
                    ns.fill(t('coAuthorMapJointHeader', 'Publications shared with {hub}'), { hub: hubName }),
                    t('latitude', 'Latitude'),
                    t('longitude', 'Longitude')
                ]];
                rows.forEach(function (r) {
                    out.push([r.name, categoryLabel(r.category), r.authors, r.publications,
                        r.category === 'hub' ? '' : r.joint, r.lat, r.lon]);
                });
                return out;
            }
        };
    };
})();
