/**
 * Entity Network — the collection-wide, multi-entity co-occurrence graph for the
 * Discursive Communities site-page block. Renders the precomputed
 * communities/entity-graph.json with MapLibre GL — the same WebGL renderer every
 * DRE map already ships — instead of a dedicated graph library.
 *
 * Node positions are baked at precompute time (ForceAtlas2 in PHP, projected to
 * pseudo lng/lat), so the client does ZERO layout work: pan/zoom over ~15k edges
 * stays GPU-bound and the network renders instantly and identically every load.
 * MapLibre symbol layers give label collision for free.
 *
 * Self-contained controller (it does NOT use the ECharts window.RV.charts
 * registry — MapLibre is a separate renderer): it fetches the data, builds the
 * UI, and owns all interaction. From dashboard-core.js it takes the shared theme
 * tokens (ns.THEME / ns.COLORS / ns.HALO, resolved to concrete RGB), which it
 * re-reads on every light/dark toggle to recolour the layers in place, and the
 * shared helpers below.
 *
 * Depends on (loaded first, deferred — the module never renders this block
 * without them, so there are no local fallbacks):
 *   - asset/js/dashboard-core.js → window.RV (theme tokens, ns.el / ns.fold /
 *     ns.t, ns.moveHover, ns.mountWhenVisible, and ns.ensureLibs — the shared
 *     lazy loader that pulls in MapLibre GL on mount, so a page with both a
 *     dashboard and this graph loads MapLibre exactly once)
 *   - asset/js/entity-graph-ui.js → ns.egUI (the keyboard walker and its live
 *     region, the text alternative, the cluster filter, export + fullscreen)
 *
 * Data (compact row arrays, see EntityGraphTrait::buildEntityGraph):
 *   { types: ['Person','Organisation','Location','Subject','Tag'],
 *     sections: ['Knowledges', 'Learning', ...],   // research-section overlay labels
 *     nodes: [[id, label, type, count, degree, community, section, lng, lat, rank], ...],
 *     edges: [[sourceIndex, targetIndex, weight], ...],
 *     meta:  { weightMin, weightMax, communityCount, sectionCount, bounds:[w,s,e,n], ... } }
 *
 * `section` is the index of the entity's dominant research section into `sections`,
 * or -2 for a cross-section bridge and -1 for an entity in no sectioned work.
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) { console.warn('DreVisualizations: dashboard-core.js must load before entity-graph.js'); return; }
    var el = ns.el;
    var escapeHtml = ns.escapeHtml;
    function t(key, fallback) { return ns.t(key, fallback); }

    var SRC_NODES = 'eg-nodes';
    var SRC_EDGES = 'eg-edges';
    var L_EDGES = 'eg-edge-lines';
    var L_NODES = 'eg-node-circles';
    var L_LABELS = 'eg-node-labels';

    var MIN_RADIUS = 3;
    var MAX_RADIUS = 18;

    /* ------------------------------------------------------------------ */
    /*  Theme bridge (dashboard-core.js) — concrete RGB, mutated in place  */
    /* ------------------------------------------------------------------ */

    // ns.THEME / ns.COLORS / ns.HALO are re-read in place on every light/dark
    // toggle, so they are always looked up at paint time, never captured.

    // Resolved through the type NAME via the shared registry, so Person here is the
    // same hue as Person on an item's knowledge graph and on a contributor network.
    // Indexing the palette by the position in `types` used to make Organisation the
    // project colour. `_types` is set by build() once the payload is decoded.
    var _types = [];
    function typeColor(typeIdx) {
        return ns.entityColor(_types[typeIdx] || '');
    }
    // Unclustered and bridge nodes: the theme's warm muted ink, faded — not a
    // cold blue-grey of its own. THEME.muted is re-read on every theme change.
    function dimColor() { return ns.withAlpha(ns.THEME.muted, 0.3); }

    /* ------------------------------------------------------------------ */
    /*  Decode the compact payload                                         */
    /* ------------------------------------------------------------------ */

    function decode(payload) {
        var meta = payload.meta || {};
        return {
            types: payload.types || [],
            sections: payload.sections || [],
            weightMin: meta.weightMin || 2,
            weightMax: meta.weightMax || 2,
            communityCount: meta.communityCount || 0,
            bounds: meta.bounds || null,
            nodes: (payload.nodes || []).map(function (r) {
                // v2.19+ inserts `section` after `community` (10 fields). Older
                // precomputed files omit it (9 fields: …community, lng, lat, rank) —
                // stay compatible until the next regeneration so positions never shift.
                var s = r.length >= 10;
                return {
                    id: r[0], label: r[1], type: r[2], count: r[3], degree: r[4],
                    community: r[5], section: s ? r[6] : -1,
                    lng: s ? r[7] : r[6], lat: s ? r[8] : r[7], rank: (s ? r[9] : r[8]) || 0
                };
            }),
            edges: payload.edges || []
        };
    }

    /* ------------------------------------------------------------------ */
    /*  Main build                                                         */
    /* ------------------------------------------------------------------ */

    function build(container, data, ctx) {
        var types = data.types;
        var sections = data.sections || [];
        var siteBase = ctx.siteBase;

        // typeColor() resolves through the shared entity-type registry by name.
        _types = types;

        container.innerHTML = '';

        /* -- header + description -- */
        var header = el('div', 'dashboard-header');
        header.appendChild(el('h2', null, t('degTitle', 'Entity network')));
        header.appendChild(el('span', 'dashboard-total',
            ns.plural(data.nodes.length, 'degEntity', 'entity', 'entities', true) + ' · '
            + ns.plural(data.edges.length, 'link', 'link', 'links', true)
            + (data.communityCount ? (' · ' + ns.plural(data.communityCount, 'degGroup', 'group', 'groups', true)) : '')));
        container.appendChild(header);

        container.appendChild(el('p', 'chart-description',
            t('degDescription', 'People, organisations, places, subjects and tags are linked here when they are recorded on the same research item. The more often two of them appear together, the closer they sit, so the map falls into groups of entities that share a research context. Drag to pan and scroll to zoom; hover over an entity to pick out its links, or click it for a summary and a link to its page.')));

        /* -- toolbar -- */
        var toolbar = el('div', 'deg-toolbar');
        container.appendChild(toolbar);

        /* -- stage: map canvas + side panel -- */
        var stage = el('div', 'deg-stage');
        var canvas = el('div', 'deg-canvas');
        canvas.setAttribute('role', 'application');
        canvas.tabIndex = 0;
        canvas.setAttribute('aria-label', ns.t('degCanvasLabel', 'Network of entities that appear on the same research items. Use the arrow keys to move between connected entities and Enter to select one.'));
        var sidebar = el('div', 'deg-sidebar');
        stage.appendChild(canvas);
        stage.appendChild(sidebar);
        container.appendChild(stage);

        var legend = el('div', 'deg-legend');
        container.appendChild(legend);

        /* -- derived data -- */
        var maxDegree = 1, maxWeight = 1;
        data.nodes.forEach(function (n) { if (n.degree > maxDegree) maxDegree = n.degree; });
        data.edges.forEach(function (e) { if (e[2] > maxWeight) maxWeight = e[2]; });

        var commSet = {};
        data.nodes.forEach(function (n) { if (n.community >= 0) commSet[n.community] = true; });
        var commIds = Object.keys(commSet).map(Number).sort(function (a, b) { return a - b; });

        // Cluster summaries for the filter. The payload names no anchor (unlike the
        // co-author network's), so take each cluster's most central member — `rank`
        // is the precompute's own hub ordering, lowest first — which is the only
        // handle a reader has on an otherwise anonymous community number.
        var clusters = commIds.map(function (id) {
            var size = 0, anchor = null, best = Infinity;
            data.nodes.forEach(function (n) {
                if (n.community !== id) return;
                size++;
                if (n.rank < best) { best = n.rank; anchor = n.label; }
            });
            return { id: id, size: size, anchor: anchor };
        }).sort(function (a, b) { return (b.size - a.size) || (a.id - b.id); });

        // adjacency[i] = [{ j, w }] sorted by weight desc.
        var adjacency = data.nodes.map(function () { return []; });
        data.edges.forEach(function (e) {
            adjacency[e[0]].push({ j: e[1], w: e[2] });
            adjacency[e[1]].push({ j: e[0], w: e[2] });
        });
        adjacency.forEach(function (list) { list.sort(function (a, b) { return b.w - a.w; }); });
        // incident[i] = ids of the edge features touching node i. Both sources use
        // generateId, so a feature id is its index: edge k is data.edges[k].
        var incident = data.nodes.map(function () { return []; });
        data.edges.forEach(function (e, k) { incident[e[0]].push(k); incident[e[1]].push(k); });

        var nodeFeatures = {
            type: 'FeatureCollection',
            features: data.nodes.map(function (n, i) {
                return {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
                    properties: {
                        i: i, type: n.type, comm: n.community, sec: n.section,
                        r: MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(n.degree / maxDegree),
                        label: n.label, rank: n.rank
                    }
                };
            })
        };
        var edgeFeatures = {
            type: 'FeatureCollection',
            features: data.edges.map(function (e) {
                var s = data.nodes[e[0]], t = data.nodes[e[1]];
                return {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: [[s.lng, s.lat], [t.lng, t.lat]] },
                    properties: {
                        s: e[0], t: e[1], w: e[2], st: s.type, tt: t.type,
                        // Endpoint communities, so isolating a cluster can drop the
                        // edges that leave it without a per-feature lookup at filter
                        // time — the expression has to be pure to run on the GPU.
                        sc: s.community, tc: t.community,
                        wn: Math.sqrt(e[2] / maxWeight)
                    }
                };
            })
        };

        var bounds = data.bounds;
        if (!bounds) {
            var w = 180, s = 90, e2 = -180, n2 = -90;
            data.nodes.forEach(function (nd) {
                if (nd.lng < w) w = nd.lng; if (nd.lng > e2) e2 = nd.lng;
                if (nd.lat < s) s = nd.lat; if (nd.lat > n2) n2 = nd.lat;
            });
            bounds = [w, s, e2, n2];
        }

        /* -- interaction state (persists across theme recolours) -- */
        var enabledTypes = {};
        types.forEach(function (_t, i) { enabledTypes[i] = true; });
        var weightMin = data.weightMin;
        var colorMode = 'type';        // 'type' | 'community' | 'section'
        var commFilter = null;         // isolate one cluster, or null for all
        var selectedIndex = null;
        var focusIndex = null;         // keyboard focus (distinct from selection)
        var map = null;
        var fitted = false;
        var hoverPopup = null;
        var hoverId = null;
        var listPanel = null;          // the text alternative, mounted at the end

        /* ------------------------------------------------------------------ */
        /*  Paint expressions                                                  */
        /* ------------------------------------------------------------------ */

        function sectionColor(i) {
            return ns.COLORS[i % ns.COLORS.length];
        }

        function nodeColorExpr() {
            var expr, pal, i;
            if (colorMode === 'community') {
                pal = ns.HALO;
                expr = ['match', ['get', 'comm']];
                for (i = 0; i < commIds.length; i++) {
                    expr.push(commIds[i], pal[commIds[i] % pal.length]);
                }
                expr.push(dimColor());           // default: unclustered (-1)
                return expr;
            }
            if (colorMode === 'section' && sections.length) {
                expr = ['match', ['get', 'sec']];
                for (i = 0; i < sections.length; i++) {
                    expr.push(i, sectionColor(i));
                }
                expr.push(dimColor());           // default: bridge (-2) / no section (-1)
                return expr;
            }
            // Through the shared registry, exactly like the legend, the type chips
            // and the sidebar swatches (typeColor). Painting the circles by their
            // position in `types` instead put Organisation, Location and Tag in
            // hues their own swatches did not use — the same defect 2.22.1 fixed for
            // the categories, still live in the paint expression.
            expr = ['match', ['get', 'type']];
            for (i = 0; i < types.length; i++) {
                expr.push(i, typeColor(i));
            }
            expr.push(ns.THEME.textMuted);
            return expr;
        }

        function edgeOpacityExpr(min, max) {
            return ['+', min, ['*', max - min, ['get', 'wn']]];
        }
        function hoverOpacityExpr(base, hovered) {
            return ['case', ['boolean', ['feature-state', 'hover'], false], hovered, base];
        }
        // The keyboard cursor outranks the pointer: a reader arrowing through the
        // graph must be able to see where they are even as the mouse sits elsewhere.
        function strokeWidthExpr() {
            return ['case',
                ['boolean', ['feature-state', 'focus'], false], 3.5,
                ['boolean', ['feature-state', 'hover'], false], 2.5,
                1];
        }
        function strokeColorExpr() {
            return ['case',
                ['boolean', ['feature-state', 'focus'], false], ns.THEME.accent,
                ns.THEME.surface];
        }

        /* ------------------------------------------------------------------ */
        /*  Filters + selection                                                */
        /* ------------------------------------------------------------------ */

        function enabledList() {
            var out = [];
            types.forEach(function (_t, i) { if (enabledTypes[i]) out.push(i); });
            return out;
        }
        function allTypesOn() { return enabledList().length === types.length; }

        /**
         * Is this node currently drawn? Type and cluster are the facets that hide
         * nodes; the min-link select only thins edges. The keyboard walker and the
         * text alternative both need this so neither can land on something invisible.
         */
        function visibleNode(index) {
            var n = data.nodes[index];
            if (!n) return false;
            if (!enabledTypes[n.type]) return false;
            return commFilter == null || n.community === commFilter;
        }

        // A facet is "active" whenever the view is narrowed from its default: a type
        // switched off, the min-link raised, a cluster isolated, or an entity
        // selected. Drives the enabled state of the Clear-filters button (colour
        // mode is a lens, not a facet).
        function filtersActive() {
            return !allTypesOn() || weightMin > data.weightMin
                || commFilter != null || selectedIndex != null;
        }
        function updateClearState() {
            if (clearBtn) clearBtn.disabled = !filtersActive();
        }

        function nodeFilter() {
            var parts = [];
            if (!allTypesOn()) parts.push(['in', ['get', 'type'], ['literal', enabledList()]]);
            if (commFilter != null) parts.push(['==', ['get', 'comm'], commFilter]);
            if (!parts.length) return null;
            return parts.length === 1 ? parts[0] : ['all'].concat(parts);
        }
        function edgeFilter() {
            var parts = [];
            if (weightMin > data.weightMin) parts.push(['>=', ['get', 'w'], weightMin]);
            if (!allTypesOn()) {
                var lst = ['literal', enabledList()];
                parts.push(['in', ['get', 'st'], lst]);
                parts.push(['in', ['get', 'tt'], lst]);
            }
            // Both ends, so an isolated cluster shows only its internal structure
            // rather than a fringe of edges running to hidden nodes.
            if (commFilter != null) {
                parts.push(['==', ['get', 'sc'], commFilter]);
                parts.push(['==', ['get', 'tc'], commFilter]);
            }
            if (!parts.length) return null;
            return parts.length === 1 ? parts[0] : ['all'].concat(parts);
        }
        function labelFilter() {
            var base = nodeFilter();
            if (selectedIndex == null) return base;
            var ids = [selectedIndex];
            adjacency[selectedIndex].forEach(function (nb) { ids.push(nb.j); });
            // The keyboard-focused entity keeps its label even when it sits outside
            // the selected neighbourhood — otherwise arrowing away from a selection
            // moves an invisible cursor.
            if (focusIndex != null && ids.indexOf(focusIndex) === -1) ids.push(focusIndex);
            var sel = ['in', ['get', 'i'], ['literal', ids]];
            return base ? ['all', base, sel] : sel;
        }

        /**
         * A selection as feature-state, not as filters or data-driven paint: the
         * selected neighbourhood carries `sel` and its incident edges `hl`, so a
         * click touches only those features instead of re-evaluating ~15k edges
         * and re-tiling the edge layer. Paint expressions switch only when a
         * selection starts or ends (selectionMode).
         */
        var selectedNodes = [], selectedEdges = [], selectionMode = null;
        function setStates(source, ids, state) {
            ids.forEach(function (id) { map.setFeatureState({ source: source, id: id }, state); });
        }
        function applySelectionPaint() {
            if (!map || !map.getLayer(L_NODES)) return;
            setStates(SRC_NODES, selectedNodes, { sel: false });
            setStates(SRC_EDGES, selectedEdges, { hl: false });
            selectedNodes = [];
            selectedEdges = [];
            if (selectedIndex != null) {
                selectedNodes = [selectedIndex].concat(adjacency[selectedIndex].map(function (nb) { return nb.j; }));
                selectedEdges = incident[selectedIndex].slice();
                setStates(SRC_NODES, selectedNodes, { sel: true });
                setStates(SRC_EDGES, selectedEdges, { hl: true });
            }
            var mode = selectedIndex == null ? 'none' : 'selected';
            if (mode === selectionMode) return;
            selectionMode = mode;
            var hl = ['boolean', ['feature-state', 'hl'], false];
            map.setPaintProperty(L_EDGES, 'line-opacity', mode === 'none'
                ? edgeOpacityExpr(0.08, 0.5)
                : ['case', hl, 0.85, edgeOpacityExpr(0.02, 0.1)]);
            map.setPaintProperty(L_NODES, 'circle-opacity', mode === 'none'
                ? hoverOpacityExpr(0.9, 1)
                : ['case', ['boolean', ['feature-state', 'sel'], false], 1, 0.16]);
        }
        function edgeColorExpr() {
            return ['case', ['boolean', ['feature-state', 'hl'], false], ns.THEME.accent, ns.THEME.grid];
        }

        /**
         * The keyboard cursor, as a feature-state ring.
         *
         * The source is created with `generateId: true`, which assigns each feature
         * an id from its position in the features array — and those are built in node
         * order, so a feature id IS a node index. That equality is what lets the
         * focus ring be set from an index without a lookup.
         */
        var focusFeature = null;
        function paintFocus(index) {
            if (!map || !map.getSource(SRC_NODES)) return;
            if (focusFeature !== null) {
                map.setFeatureState({ source: SRC_NODES, id: focusFeature }, { focus: false });
            }
            focusFeature = index == null ? null : index;
            if (focusFeature !== null) {
                map.setFeatureState({ source: SRC_NODES, id: focusFeature }, { focus: true });
            }
        }

        /** Move the keyboard cursor: ring it, centre it, and relabel it. */
        function setFocus(index) {
            var previous = focusIndex;
            focusIndex = index;
            paintFocus(index);
            // Without a selection every visible node may carry a label, so the
            // filter only changes when the cursor enters or leaves a node outside
            // the selected neighbourhood — re-laying out every label on every
            // arrow key is what made keyboard walking stutter.
            var outside = function (i) { return i != null && selectedIndex != null && selectedNodes.indexOf(i) === -1; };
            if (map && map.getLayer(L_LABELS) && (outside(previous) || outside(index))) {
                map.setFilter(L_LABELS, labelFilter());
            }
            if (index == null) return;
            var node = data.nodes[index];
            hideHover();
            try {
                map.easeTo({ center: [node.lng, node.lat], zoom: Math.max(map.getZoom(), 3.5), duration: 260 });
            } catch (err) { /* ignore */ }
        }

        function applyFilters() {
            updateClearState();
            // A facet change can hide whatever the keyboard was on; dropping the
            // cursor is better than leaving it on something no longer drawn.
            if (focusIndex != null && !visibleNode(focusIndex)) setFocus(null);
            if (listPanel) listPanel.refresh();
            if (!map || !map.getLayer(L_EDGES)) return;
            map.setFilter(L_EDGES, edgeFilter());
            map.setFilter(L_NODES, nodeFilter());
            applySelectionPaint(); // first: labelFilter() reads the neighbourhood
            if (map.getLayer(L_LABELS)) map.setFilter(L_LABELS, labelFilter());
        }

        function selectIndex(index) {
            selectedIndex = index;
            applyFilters();
            if (index == null) showOverview(); else showDetail(index);
        }

        /* ------------------------------------------------------------------ */
        /*  Layer (re)build                                                    */
        /* ------------------------------------------------------------------ */

        function addAll(m) {
            if (!m.getSource(SRC_EDGES)) m.addSource(SRC_EDGES, { type: 'geojson', data: edgeFeatures, generateId: true });
            if (!m.getSource(SRC_NODES)) m.addSource(SRC_NODES, { type: 'geojson', data: nodeFeatures, generateId: true });

            if (!m.getLayer(L_EDGES)) {
                m.addLayer({
                    id: L_EDGES, type: 'line', source: SRC_EDGES,
                    layout: { 'line-cap': 'round' },
                    paint: {
                        // Edges of the selection (feature-state `hl`) are drawn
                        // in the accent, wider; see applySelectionPaint().
                        'line-color': edgeColorExpr(),
                        'line-width': ['case', ['boolean', ['feature-state', 'hl'], false],
                            ['+', 1, ['*', 2.5, ['get', 'wn']]],
                            ['+', 0.4, ['*', 2.1, ['get', 'wn']]]],
                        'line-opacity': edgeOpacityExpr(0.08, 0.5)
                    }
                });
                // A new map (or style) starts with no feature-state.
                selectedNodes = [];
                selectedEdges = [];
                selectionMode = null;
            }
            if (!m.getLayer(L_NODES)) m.addLayer({
                id: L_NODES, type: 'circle', source: SRC_NODES,
                paint: {
                    'circle-radius': ['get', 'r'],
                    'circle-color': nodeColorExpr(),
                    'circle-opacity': hoverOpacityExpr(0.9, 1),
                    'circle-stroke-width': strokeWidthExpr(),
                    'circle-stroke-color': strokeColorExpr()
                }
            });
            if (!m.getLayer(L_LABELS)) m.addLayer({
                id: L_LABELS, type: 'symbol', source: SRC_NODES,
                layout: {
                    'text-field': ['get', 'label'],
                    'text-font': ns.MAP_LABEL_FONT,
                    'text-size': 12,
                    'text-variable-anchor': ['top', 'bottom', 'right', 'left'],
                    'text-radial-offset': ['+', 0.4, ['/', ['get', 'r'], 14]],
                    'text-justify': 'auto',
                    'symbol-sort-key': ['get', 'rank']
                },
                paint: {
                    'text-color': ns.THEME.text,
                    'text-halo-color': ns.THEME.surface,
                    'text-halo-width': 1.3
                }
            });

            applyFilters();

            if (!fitted && bounds) {
                fitted = true;
                try {
                    m.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
                        { padding: 36, duration: 0 });
                } catch (err) { /* degenerate bounds */ }
            }
        }

        /* ------------------------------------------------------------------ */
        /*  Hover popup                                                        */
        /* ------------------------------------------------------------------ */

        function hoverHtml(node) {
            var bits = [];
            if (types[node.type]) bits.push(escapeHtml(types[node.type]));
            bits.push(escapeHtml(ns.plural(node.count, 'item', 'item', 'items', true)));
            bits.push(escapeHtml(ns.plural(node.degree, 'link', 'link', 'links', true)));
            return '<div class="rv-popup-content"><strong>' + escapeHtml(node.label) + '</strong>'
                + '<span class="deg-popup-meta">' + bits.join(' · ') + '</span></div>';
        }
        function showHover(e) {
            var f = e.features && e.features[0];
            if (!f) return;
            map.getCanvas().style.cursor = 'pointer';
            hoverId = ns.moveHover(map, SRC_NODES, hoverId, f.id);
            var node = data.nodes[Number(f.properties.i)];
            if (!node) return;
            if (!hoverPopup) {
                hoverPopup = new window.maplibregl.Popup({
                    closeButton: false, closeOnClick: false, offset: 12, className: 'rv-map-popup'
                });
            }
            hoverPopup.setLngLat([node.lng, node.lat]).setHTML(hoverHtml(node)).addTo(map);
        }
        function hideHover() {
            map.getCanvas().style.cursor = '';
            hoverId = ns.moveHover(map, SRC_NODES, hoverId, null);
            if (hoverPopup) hoverPopup.remove();
        }

        /* ------------------------------------------------------------------ */
        /*  Map                                                                */
        /* ------------------------------------------------------------------ */

        // The graph is laid out in pseudo-coordinates, so it wants no basemap —
        // only a themed backdrop and the glyphs its node labels are drawn from.
        function graphStyle() {
            return {
                version: 8,
                glyphs: ns.mapGlyphs(),
                sources: {},
                layers: [{ id: 'bg', type: 'background', paint: { 'background-color': ns.THEME.surface } }]
            };
        }

        function createMap() {
            map = ns.createMap({
                container: canvas,
                style: graphStyle(),
                center: [0, 0],
                zoom: 1,
                attributionControl: ns.getMapAttributionOptions(),
                renderWorldCopies: false,
                dragRotate: false,
                pitchWithRotate: false,
                maxZoom: 9,
                maxBounds: [[-179, -85], [179, 85]],
                // WebGL may discard the drawing buffer after each frame, which makes
                // the canvas read back blank; this keeps it so the PNG export can
                // read it. Since MapLibre 5 the flag is only read from
                // canvasContextAttributes (merged over the library defaults); a
                // top-level `preserveDrawingBuffer` is silently ignored.
                canvasContextAttributes: { preserveDrawingBuffer: true },
                // MapLibre binds the arrow keys to panning. On a graph they are worth
                // more as a way to walk between entities (see the keyboard walker
                // below, which matches the knowledge graph's model), and +/-/0 still
                // zoom, so nothing is lost by taking them.
                keyboard: false
            });
            if (!map) return;
            map.addControl(ns.navControl(), 'top-right');
            map.on('load', function () { addAll(map); });

            map.on('click', function (e) {
                if (!map.getLayer(L_NODES)) return;
                var feats = map.queryRenderedFeatures(e.point, { layers: [L_NODES] });
                selectIndex(feats.length ? Number(feats[0].properties.i) : null);
            });
            map.on('mousemove', L_NODES, showHover);
            map.on('mouseleave', L_NODES, hideHover);

            // One tab stop, not two: the stage itself is the focusable thing (it owns
            // the key handling), so MapLibre's inner canvas must not also be in the
            // tab order behind it.
            var inner = canvas.querySelector('.maplibregl-canvas');
            if (inner) inner.setAttribute('tabindex', '-1');
            // MapLibre's trackResize observes the container; no observer needed here.
        }

        /* ------------------------------------------------------------------ */
        /*  Sidebar: overview ⇄ selected entity                               */
        /* ------------------------------------------------------------------ */

        function showOverview() {
            sidebar.innerHTML = '';
            sidebar.appendChild(el('div', 'deg-side-title', t('degSideTitle', 'Network')));
            var counts = {};
            data.nodes.forEach(function (n) { counts[n.type] = (counts[n.type] || 0) + 1; });
            var list = el('div', 'deg-type-counts');
            types.forEach(function (label, i) {
                if (!counts[i]) return;
                var row = el('div', 'deg-type-row');
                var sw = el('span', 'deg-swatch'); sw.style.background = typeColor(i);
                row.appendChild(sw);
                row.appendChild(el('span', 'deg-type-name', label));
                row.appendChild(el('span', 'deg-type-val', String(counts[i])));
                list.appendChild(row);
            });
            sidebar.appendChild(list);
            sidebar.appendChild(el('p', 'deg-side-hint', t('degSideHint', 'Hover over an entity, or click it, to see what it is connected to.')));
        }

        function showDetail(index) {
            var info = data.nodes[index];
            if (!info) return;
            sidebar.innerHTML = '';

            var typeTag = el('div', 'deg-detail-type', types[info.type] || t('degLabel', 'Entity'));
            typeTag.style.color = typeColor(info.type);
            sidebar.appendChild(typeTag);

            var titleWrap = el('div', 'deg-detail-title');
            if (siteBase && info.id) {
                var a = el('a', null, info.label);
                a.href = ns.itemUrl(siteBase, info.id);
                titleWrap.appendChild(a);
            } else {
                titleWrap.textContent = info.label;
            }
            sidebar.appendChild(titleWrap);

            sidebar.appendChild(el('div', 'deg-detail-stats',
                ns.plural(info.count, 'item', 'item', 'items', true) + ' · '
                + ns.plural(info.degree, 'degConnection', 'connection', 'connections', true)));

            if (sections.length) {
                var secLabel = info.section >= 0 ? sections[info.section]
                    : (info.section === -2 ? t('degMultipleSections', 'Multiple sections') : null);
                if (secLabel) {
                    var secRow = el('div', 'deg-detail-stats');
                    secRow.appendChild(el('span', 'deg-detail-section-label', t('degSectionLabel', 'Section:') + ' '));
                    secRow.appendChild(el('span', null, secLabel));
                    sidebar.appendChild(secRow);
                }
            }

            var nbrs = adjacency[index] || [];
            if (nbrs.length) {
                sidebar.appendChild(el('div', 'deg-detail-subhead',
                    ns.fill(t('degStrongest', 'Strongest connections ({shown} of {total})'),
                        { shown: Math.min(nbrs.length, 15), total: nbrs.length })));
                var ul = el('div', 'deg-neighbors');
                nbrs.slice(0, 15).forEach(function (nb) {
                    var ni = data.nodes[nb.j];
                    if (!ni) return;
                    var btn = el('button', 'deg-neighbor'); btn.type = 'button';
                    var sw = el('span', 'deg-swatch'); sw.style.background = typeColor(ni.type);
                    btn.appendChild(sw);
                    btn.appendChild(el('span', 'deg-neighbor-name', ni.label));
                    btn.appendChild(el('span', 'deg-neighbor-w', String(nb.w)));
                    btn.addEventListener('click', function () { focusNode(nb.j); });
                    ul.appendChild(btn);
                });
                sidebar.appendChild(ul);
            }

            if (siteBase && info.id) {
                var open = el('a', 'deg-open', t('degOpenPage', 'Open this entity’s page →'));
                open.href = ns.itemUrl(siteBase, info.id);
                sidebar.appendChild(open);
            }
        }

        /** Centre the camera on a node and select it (used by search + neighbours). */
        function focusNode(index) {
            var node = data.nodes[index];
            if (!node) return;
            hideHover();
            try {
                map.easeTo({ center: [node.lng, node.lat], zoom: Math.max(map.getZoom(), 4), duration: 500 });
            } catch (err) { /* ignore */ }
            selectIndex(index);
        }

        /* ------------------------------------------------------------------ */
        /*  Toolbar controls                                                   */
        /* ------------------------------------------------------------------ */

        // Search ----------------------------------------------------------
        var searchWrap = el('div', 'deg-search');
        var search = el('input', 'deg-search-input');
        search.type = 'search';
        search.placeholder = t('searchEntitiesPlaceholder', 'Search entities…');
        search.setAttribute('aria-label', ns.t('searchEntities', 'Search entities'));
        var results = el('div', 'deg-search-results'); results.hidden = true;
        searchWrap.appendChild(search); searchWrap.appendChild(results);
        toolbar.appendChild(searchWrap);

        // Options rather than buttons, so the input can keep focus and drive the
        // highlight through aria-activedescendant — the standard combobox pattern
        // (ns.egUI.wireSearchKeys owns the keys and the ARIA state).
        var hitSeq = 0;
        function currentHits() {
            return Array.prototype.slice.call(results.querySelectorAll('.deg-search-hit'));
        }
        function closeResults() { results.hidden = true; }
        function takeHit(option) {
            var idx = Number(option.dataset.index);
            search.value = data.nodes[idx].label;
            closeResults();
            searchKeys.reset();
            focusNode(idx);
        }

        var searchKeys = ns.egUI.wireSearchKeys(search, results, {
            hits: currentHits,
            onPick: takeHit,
            onClose: closeResults
        });

        search.addEventListener('input', function () {
            var q = ns.fold(search.value.trim());
            ns.setChildren(results);
            if (q.length < 2) { closeResults(); searchKeys.sync(); return; }
            var hits = [];
            for (var i = 0; i < data.nodes.length && hits.length < 8; i++) {
                // Only what the reader could actually navigate to: a hit filtered
                // out by a type chip or an isolated cluster is a dead end.
                if (visibleNode(i) && ns.fold(data.nodes[i].label).indexOf(q) !== -1) hits.push(i);
            }
            if (!hits.length) { closeResults(); searchKeys.sync(); return; }
            hits.forEach(function (idx) {
                var n = data.nodes[idx];
                var item = el('div', 'deg-search-hit');
                item.id = 'deg-hit-' + (++hitSeq);
                item.setAttribute('role', 'option');
                item.setAttribute('aria-selected', 'false');
                item.dataset.index = String(idx);
                var sw = el('span', 'deg-swatch'); sw.style.background = typeColor(n.type);
                item.appendChild(sw);
                item.appendChild(el('span', 'deg-search-hit-name', n.label));
                item.addEventListener('mousedown', function (ev) {
                    // mousedown, not click: focusout would otherwise close the list
                    // out from under the pointer before the click resolved.
                    ev.preventDefault();
                    takeHit(item);
                });
                results.appendChild(item);
            });
            results.hidden = false;
            searchKeys.sync();
        });

        // Type filter chips ----------------------------------------------
        var chips = el('div', 'deg-chips');
        types.forEach(function (label, i) {
            if (!data.nodes.some(function (n) { return n.type === i; })) return;
            var chip = el('button', 'deg-chip deg-chip-on'); chip.type = 'button';
            chip.setAttribute('aria-pressed', 'true');
            var sw = el('span', 'deg-swatch'); sw.style.background = typeColor(i);
            chip.appendChild(sw);
            chip.appendChild(el('span', null, label));
            chip.addEventListener('click', function () {
                enabledTypes[i] = !enabledTypes[i];
                chip.classList.toggle('deg-chip-on', enabledTypes[i]);
                chip.setAttribute('aria-pressed', String(enabledTypes[i]));
                if (selectedIndex != null && !enabledTypes[data.nodes[selectedIndex].type]) {
                    selectIndex(null);
                } else {
                    applyFilters();
                }
            });
            chip._sw = sw; chip._i = i;
            chips.appendChild(chip);
        });
        toolbar.appendChild(chips);

        // Min-weight select ----------------------------------------------
        var weightSelect = null;
        var steps = [data.weightMin, 3, 5, 10, 20].filter(function (v, idx) {
            return idx === 0 || (v > data.weightMin && v <= data.weightMax);
        });
        if (steps.length > 1) {
            var wWrap = el('label', 'deg-weight');
            wWrap.appendChild(el('span', null, t('degSharedItems', 'Shared items')));
            var sel = el('select', 'deg-weight-select');
            steps.forEach(function (v, idx) {
                var o = el('option', null, idx === 0 ? t('degAnyWeight', 'Any')
                    : ns.fill(t('degOrMore', '{count} or more'), { count: v }));
                o.value = String(v); sel.appendChild(o);
            });
            sel.addEventListener('change', function () {
                weightMin = Number(sel.value) || data.weightMin;
                applyFilters();
            });
            wWrap.appendChild(sel);
            toolbar.appendChild(wWrap);
            weightSelect = sel;
        }

        // Isolate a group ------------------------------------------------
        var clusterSelect = null;
        if (clusters.length > 1) {
            clusterSelect = ns.egUI.buildClusterSelect(clusters, function (id) {
                commFilter = id;
                // A group occupies a region of the map, so go there — isolating one and leaving the
                // camera across the map would just show empty space.
                if (id != null && map) {
                    var w = 180, s = 90, e2 = -180, n2 = -90, found = false;
                    data.nodes.forEach(function (nd) {
                        if (nd.community !== id) return;
                        found = true;
                        if (nd.lng < w) w = nd.lng; if (nd.lng > e2) e2 = nd.lng;
                        if (nd.lat < s) s = nd.lat; if (nd.lat > n2) n2 = nd.lat;
                    });
                    if (found) {
                        try {
                            map.fitBounds([[w, s], [e2, n2]], { padding: 48, duration: 500, maxZoom: 7 });
                        } catch (err) { /* degenerate bounds */ }
                    }
                }
                // Drop a selection the filter just hid, rather than leaving the
                // sidebar describing an entity that is no longer on screen.
                if (selectedIndex != null && !visibleNode(selectedIndex)) selectIndex(null);
                else applyFilters();
            });
            toolbar.appendChild(clusterSelect.el);
        }

        // Clear filters --------------------------------------------------
        // One click back to the default view: all types on, min-link at "All", every
        // cluster shown, search emptied and any selection dropped. Disabled while
        // nothing is active.
        var clearBtn = el('button', 'deg-btn deg-clear'); clearBtn.type = 'button';
        clearBtn.textContent = t('clearFilters', 'Clear all filters');
        clearBtn.title = t('degClearFiltersTitle', 'Show every entity again and drop the current selection');
        clearBtn.disabled = true;
        clearBtn.addEventListener('click', function () {
            types.forEach(function (_t, i) { enabledTypes[i] = true; });
            Array.prototype.forEach.call(chips.querySelectorAll('.deg-chip'), function (chip) {
                chip.classList.add('deg-chip-on');
                chip.setAttribute('aria-pressed', 'true');
            });
            weightMin = data.weightMin;
            if (weightSelect) weightSelect.value = String(data.weightMin);
            commFilter = null;
            if (clusterSelect) clusterSelect.reset();
            search.value = '';
            results.hidden = true;
            searchKeys.reset();
            setFocus(null);
            selectIndex(null); // resets selection + calls applyFilters() → updateClearState()
        });
        toolbar.appendChild(clearBtn);

        toolbar.appendChild(el('div', 'deg-spacer'));

        // Colour-by control (type / cluster / section) -------------------
        var colorModes = [{
            id: 'type', label: t('degType', 'Type'),
            title: t('degColorByType', 'Colour the entities by type')
        }];
        if (data.communityCount > 0) colorModes.push({
            id: 'community', label: t('degCluster', 'Group'),
            title: t('degColorByGroup', 'Colour the entities by group')
        });
        if (sections.length) colorModes.push({
            id: 'section', label: t('degSection', 'Section'),
            title: t('degColorBySection', 'Colour the entities by section')
        });
        if (colorModes.length > 1) {
            var modeWrap = el('div', 'deg-colormode');
            modeWrap.setAttribute('role', 'group');
            modeWrap.setAttribute('aria-label', t('degColorByLabel', 'Colour entities by'));
            modeWrap.appendChild(el('span', 'deg-colormode-label', t('degColorBy', 'Colour by')));
            var modeBtns = {};
            var setMode = function (id) {
                if (colorMode === id) return;
                colorMode = id;
                Object.keys(modeBtns).forEach(function (k) {
                    var on = k === id;
                    modeBtns[k].classList.toggle('is-on', on);
                    modeBtns[k].setAttribute('aria-pressed', String(on));
                });
                if (map && map.getLayer(L_NODES)) map.setPaintProperty(L_NODES, 'circle-color', nodeColorExpr());
                rebuildLegend();
                if (selectedIndex != null) showDetail(selectedIndex);
            };
            colorModes.forEach(function (m) {
                var b = el('button', 'deg-btn deg-mode-btn'); b.type = 'button';
                b.textContent = m.label;
                b.title = m.title;
                b.classList.toggle('is-on', colorMode === m.id);
                b.setAttribute('aria-pressed', String(colorMode === m.id));
                b.addEventListener('click', function () { setMode(m.id); });
                modeBtns[m.id] = b;
                modeWrap.appendChild(b);
            });
            toolbar.appendChild(modeWrap);
        }

        // Reset view ------------------------------------------------------
        var resetBtn = ns.iconButton(ns.ICONS.reset, ns.t('resetView', 'Reset view'));
        resetBtn.addEventListener('click', function () { resetView(); });
        toolbar.appendChild(resetBtn);

        function resetView() {
            setFocus(null);
            selectIndex(null);
            if (map && bounds) {
                try {
                    map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 36, duration: 500 });
                } catch (err) {}
            }
        }

        // Fullscreen ------------------------------------------------------
        // The whole block, not just the map: the toolbar, sidebar and legend are how
        // a reader drives this graph. The stage's own ResizeObserver picks the new
        // size up, so there is nothing to re-fit by hand.
        var block = container.closest('.communities-block') || container;
        toolbar.appendChild(ns.egUI.buildFullscreenButton(block, function () {
            if (map) { try { map.resize(); } catch (err) {} }
        }));

        // Export ----------------------------------------------------------
        ns.egUI.buildExportButtons({
            name: 'entity-network',
            png: function () { return map ? ns.mapPng(map) : null; },
            rows: function () { return entityRows(); }
        }).forEach(function (btn) { toolbar.appendChild(btn); });

        /**
         * The visible entities as CSV rows. The cluster and the dominant research
         * section are computed by this precompute and published nowhere else, so the
         * entity table — not the edge list, which is the picture on screen — is what
         * is worth handing a reader for their own analysis.
         */
        function entityRows() {
            var head = [
                t('degLabel', 'Entity'), t('degType', 'Type'),
                t('degItemsColumn', 'Items'), t('degLinksColumn', 'Links'), t('community', 'Group')
            ];
            if (sections.length) head.push(t('degSection', 'Section'));
            head.push(t('degUrl', 'URL'));
            var rows = [head];
            data.nodes.forEach(function (n, i) {
                if (!visibleNode(i)) return;
                var row = [
                    n.label, types[n.type] || '', n.count, n.degree,
                    n.community >= 0 ? (n.community + 1) : ''
                ];
                if (sections.length) {
                    row.push(n.section >= 0 ? sections[n.section]
                        : (n.section === -2 ? t('degMultipleSections', 'Multiple sections') : ''));
                }
                row.push((siteBase && n.id) ? (ns.itemUrl(siteBase, n.id)) : '');
                rows.push(row);
            });
            return rows;
        }

        /* ------------------------------------------------------------------ */
        /*  Legend                                                             */
        /* ------------------------------------------------------------------ */

        function rebuildLegend() {
            legend.innerHTML = '';
            if (colorMode === 'community') {
                legend.appendChild(el('span', 'deg-legend-note',
                    t('degGroupLegend', 'Each colour is a group of entities that keep appearing together. Grey entities belong to no group.')));
                return;
            }
            if (colorMode === 'section') {
                sections.forEach(function (label, i) {
                    if (!data.nodes.some(function (n) { return n.section === i; })) return;
                    var row = el('span', 'deg-legend-item');
                    var sw = el('span', 'deg-swatch'); sw.style.background = sectionColor(i);
                    row.appendChild(sw);
                    row.appendChild(el('span', null, label));
                    legend.appendChild(row);
                });
                var hasBridge = data.nodes.some(function (n) { return n.section === -2; });
                var hasNone = data.nodes.some(function (n) { return n.section === -1; });
                if (hasBridge || hasNone) {
                    var grow = el('span', 'deg-legend-item');
                    var gsw = el('span', 'deg-swatch'); gsw.style.background = dimColor();
                    grow.appendChild(gsw);
                    grow.appendChild(el('span', null,
                        hasBridge && hasNone ? t('degMultipleOrNoSection', 'Multiple / no section')
                            : (hasBridge ? t('degMultipleSections', 'Multiple sections') : t('degNoSection', 'No section'))));
                    legend.appendChild(grow);
                }
                return;
            }
            types.forEach(function (label, i) {
                if (!data.nodes.some(function (n) { return n.type === i; })) return;
                var row = el('span', 'deg-legend-item');
                var sw = el('span', 'deg-swatch'); sw.style.background = typeColor(i);
                row.appendChild(sw);
                row.appendChild(el('span', null, label));
                legend.appendChild(row);
            });
        }

        /* ------------------------------------------------------------------ */
        /*  Theme: recolour layers + chrome in place (no re-layout)           */
        /* ------------------------------------------------------------------ */

        function applyTheme() {
            ns.readTheme();
            if (map && map.getLayer(L_NODES)) {
                map.setPaintProperty('bg', 'background-color', ns.THEME.surface);
                map.setPaintProperty(L_NODES, 'circle-color', nodeColorExpr());
                // The expression, not a flat colour: it also carries the accent the
                // keyboard focus ring is drawn in, which a flat value would erase.
                map.setPaintProperty(L_NODES, 'circle-stroke-color', strokeColorExpr());
                map.setPaintProperty(L_EDGES, 'line-color', edgeColorExpr());
                if (map.getLayer(L_LABELS)) {
                    map.setPaintProperty(L_LABELS, 'text-color', ns.THEME.text);
                    map.setPaintProperty(L_LABELS, 'text-halo-color', ns.THEME.surface);
                }
            }
            Array.prototype.forEach.call(chips.querySelectorAll('.deg-chip'), function (chip) {
                if (chip._sw) chip._sw.style.background = typeColor(chip._i);
            });
            rebuildLegend();
            if (listPanel) listPanel.refresh();   // its type swatches follow the theme
            if (selectedIndex != null) showDetail(selectedIndex); else showOverview();
        }

        // Re-themed through the module's ONE theme subscription (startup.js →
        // ns.refresh), which repaints tracked renderers only AFTER readTheme()
        // has re-read the tokens — this graph used to race that with a private
        // MutationObserver of its own. The map is not ns.trackMap'd: a rebuild
        // would lose the camera and the selection, and paint updates suffice.
        ns.trackRenderer(container, applyTheme);

        /* ------------------------------------------------------------------ */
        /*  Text alternative                                                   */
        /* ------------------------------------------------------------------ */

        // A WebGL canvas is opaque to a screen reader and to Ctrl+F. This is the
        // tabular fallback: every visible entity, grouped by type, as a real link.
        listPanel = ns.egUI.buildListPanel({
            groups: function () {
                var byType = {};
                data.nodes.forEach(function (n, i) {
                    if (!visibleNode(i)) return;
                    (byType[n.type] || (byType[n.type] = [])).push(n);
                });
                return types.map(function (label, i) {
                    if (!byType[i]) return null;
                    return {
                        name: label,
                        color: typeColor(i),
                        // Hubs first, the same order the map gives labels to, so the
                        // list reads in the order the picture emphasises.
                        rows: byType[i].sort(function (a, b) { return a.rank - b.rank; })
                            .map(function (n) {
                                return {
                                    label: n.label,
                                    url: (siteBase && n.id) ? (ns.itemUrl(siteBase, n.id)) : null,
                                    meta: ns.plural(n.count, 'item', 'item', 'items', true)
                                        + ' · ' + ns.plural(n.degree, 'link', 'link', 'links', true)
                                };
                            })
                    };
                }).filter(Boolean);
            }
        });
        container.appendChild(listPanel.el);

        /* ------------------------------------------------------------------ */
        /*  Keyboard                                                           */
        /* ------------------------------------------------------------------ */

        function attachKeyboard() {
            ns.egUI.attachKeyboard(canvas, {
                // Hubs first (the precompute's own `rank`), so the walk starts where
                // the graph is densest rather than at an arbitrary array position.
                order: function () {
                    var out = [];
                    for (var i = 0; i < data.nodes.length; i++) if (visibleNode(i)) out.push(i);
                    return out.sort(function (a, b) { return data.nodes[a].rank - data.nodes[b].rank; });
                },
                neighbours: function (i) {
                    return (adjacency[i] || [])
                        .filter(function (nb) { return visibleNode(nb.j) && nb.w >= weightMin; })
                        .map(function (nb) { return nb.j; });
                },
                describe: function (i) {
                    var n = data.nodes[i];
                    return n.label + ', ' + (types[n.type] || '')
                        + ', ' + ns.plural(n.count, 'item', 'item', 'items', true)
                        + ', ' + ns.plural(n.degree, 'link', 'link', 'links', true)
                        + '. ' + t('degEnterToSelect', 'Press Enter to select.');
                },
                onFocus: setFocus,
                onActivate: function (i) { selectIndex(i === selectedIndex ? null : i); },
                // Report whether the key was consumed, so one Escape clears the
                // selection and only a second leaves fullscreen.
                onEscape: function () {
                    if (selectedIndex == null) return false;
                    selectIndex(null);
                    return true;
                },
                onZoom: function (direction) {
                    if (!map) return;
                    try { map.zoomTo(map.getZoom() + (direction > 0 ? 0.6 : -0.6), { duration: 200 }); }
                    catch (err) { /* ignore */ }
                },
                onFit: resetView
            });
        }

        /* -- go -- */
        rebuildLegend();
        showOverview();
        createMap();
        attachKeyboard();
    }

    /* ------------------------------------------------------------------ */
    /*  Fetch + mount                                                      */
    /* ------------------------------------------------------------------ */

    function initContainer(container) {
        var basePath = container.dataset.basePath || '';
        var siteBase = container.dataset.siteBase || '';
        var state = ns.asyncState(container);
        ns.basePath = basePath;
        function run() {
            state.loading();
            // Load MapLibre on demand through the shared loader (dashboard-core.js) —
            // the same path the dashboards use — so a page with both a dashboard and
            // this graph loads MapLibre exactly once. Fetch the data in parallel.
            Promise.all([
                ns.fetchDataJson('communities/entity-graph.json'),
                ns.ensureLibs({ maplibre: true })
            ]).then(function (res) {
                var data = decode(res[0]);
                if (!data.nodes.length) {
                    state.empty(t('degNone', 'There is no entity network to show yet.'));
                    return;
                }
                if (typeof window.maplibregl === 'undefined') throw new Error('MapLibre is not available');
                build(container, data, { basePath: basePath, siteBase: siteBase });
                state.ready(t('degReady', 'Entity network ready.'));
            }).catch(function (err) {
                console.error('DreVisualizations entity-graph:', err);
                state.error(t('visualizationLoadError', 'The visualisation could not be loaded.'), run);
            });
        }
        run();
    }

    // Defer the (heavier) fetch + render until the block nears the viewport.
    function init() {
        var cs = document.querySelectorAll('.dre-entity-graph');
        for (var i = 0; i < cs.length; i++) {
            ns.mountWhenVisible(cs[i], initContainer.bind(null, cs[i]));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
