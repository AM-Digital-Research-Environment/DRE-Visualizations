/**
 * Knowledge-graph data layer — loading, the REST fallback, and the IDF filters.
 *
 * Pure data: no DOM, no canvas, no d3. Everything here is a function of the
 * precomputed payload, which is what makes it unit-testable and keeps the
 * renderer (graph-force.js) and the chrome (knowledge-graph-ui.js) unaware of
 * how a "shared item" or a "commonality percentage" is defined.
 *
 * Payload contract (unchanged — see Precompute\KnowledgeGraphs):
 *   { nodes: [{id, name, category, symbolSize, itemId, isCenter?, freqPct?,
 *              strength?, sharedCount?, community?}],
 *     edges: [{source, target, name, isShared?, idf?, freqPct?}],
 *     categories: [{name}],
 *     stats: {maxStrength, maxFreqPct, communityCount},
 *     itemMap?: {origins, current} }
 *
 * Depends on: dashboard-core.js (ns.fetchDataJson, ns.basePath).
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) { console.warn('DreVisualizations: dashboard-core.js must load before knowledge-graph-data.js'); return; }

    // Property -> category mapping (used in the API fallback only; the precompute
    // owns the same table in PHP).
    var PROP_CAT = {
        'dcterms:creator': 'Person', 'dcterms:contributor': 'Person', 'foaf:member': 'Person',
        'dcterms:subject': 'Subject', 'dcterms:spatial': 'Location', 'dcterms:provenance': 'Location',
        'dcterms:isPartOf': 'Project', 'dcterms:format': 'Genre', 'frapo:isFundedBy': 'Institution',
        'dcterms:relation': 'Related item', 'dcterms:hasPart': 'Related item',
        'dcterms:replaces': 'Related item', 'dcterms:isReplacedBy': 'Related item',
        'dcterms:hasVersion': 'Related item', 'dcterms:isVersionOf': 'Related item',
        'dcterms:hasFormat': 'Related item'
    };

    function getCat(term) {
        if (PROP_CAT[term]) return PROP_CAT[term];
        if (term.indexOf('marcrel:') === 0) return 'Contributor';
        return null;
    }

    /* ------------------------------------------------------------------ */
    /*  Loading                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * Precomputed JSON first (instant), then a lightweight REST call that yields
     * direct relationships only — the graph a site gets before the first
     * "Regenerate now".
     */
    function load(container) {
        var itemId = container.dataset.itemId;
        ns.basePath = container.dataset.basePath || '';
        var apiBase = container.dataset.apiBase;

        return ns.fetchDataJson('knowledge-graphs/' + encodeURIComponent(itemId) + '.json')
            .catch(function () {
                return fetch(apiBase + '/items/' + itemId)
                    .then(function (r) { return r.json(); })
                    .then(buildFromApi);
            });
    }

    /** Build a graph from a single REST API item response (no shared items). */
    function buildFromApi(item) {
        var itemId = item['o:id'];
        var rc = item['o:resource_class'];
        var centerCat = (rc && rc['o:label']) || 'Item';

        var nodes = [], edges = [], categories = [{ name: centerCat }];
        var catMap = {}; catMap[centerCat] = 0;
        var seen = {};
        // Omeka happily stores the same linked resource twice on one property. Those
        // are one statement, and drawing them twice would double the node's degree —
        // which now feeds the hub sizing and the "connections in view" count.
        var edgeSeen = {};

        function ensureCat(name) {
            if (catMap[name] === undefined) { catMap[name] = categories.length; categories.push({ name: name }); }
            return catMap[name];
        }

        nodes.push({
            id: 'item_' + itemId, name: item['o:title'] || 'Item',
            category: 0, symbolSize: 45, isCenter: true, itemId: itemId
        });

        Object.keys(item).forEach(function (key) {
            if (!Array.isArray(item[key]) || key.indexOf(':') === -1) return;
            if (key.indexOf('o:') === 0 || key.indexOf('@') === 0) return;

            var cat = getCat(key);
            if (!cat) return;
            var catIdx = ensureCat(cat);

            item[key].forEach(function (v) {
                if (!v.value_resource_id) return;
                var nid = 'resource_' + v.value_resource_id;
                if (!seen[nid]) {
                    seen[nid] = true;
                    nodes.push({
                        id: nid, name: v.display_title || '', category: catIdx,
                        symbolSize: 22, itemId: v.value_resource_id
                    });
                }
                // Keyed by property too, so the same resource under two different
                // properties stays two statements — only exact repeats collapse.
                var ekey = nid + ' ' + key;
                if (edgeSeen[ekey]) return;
                edgeSeen[ekey] = true;
                edges.push({ source: 'item_' + itemId, target: nid, name: v.property_label || key });
            });
        });

        return { nodes: nodes, edges: edges, categories: categories };
    }

    /* ------------------------------------------------------------------ */
    /*  Visual weight of an edge / node                                    */
    /* ------------------------------------------------------------------ */

    /**
     * Map an edge to a visual width.
     *
     * Three registers: the centre's own statements (1.5), the cross edges among its
     * neighbours (1.0 — real statements, but they must not out-shout the centre's),
     * and the IDF-weighted shared links (0.6–3.0, distinctiveness = weight).
     */
    function edgeWidth(e, maxStrength) {
        if (e.kind === 'cross') return 1;
        if (!e.isShared || !maxStrength) return 1.5;
        return 0.6 + Math.min((e.idf || 0) / maxStrength, 1) * 2.4;
    }

    /** Map an edge to an opacity, on the same three registers as edgeWidth. */
    function edgeOpacity(e, maxStrength) {
        if (e.kind === 'cross') return 0.42;
        if (!e.isShared || !maxStrength) return 0.6;
        return 0.15 + Math.min((e.idf || 0) / maxStrength, 1) * 0.55;
    }

    /* ------------------------------------------------------------------ */
    /*  Filters                                                            */
    /* ------------------------------------------------------------------ */

    /** True when any shared edge carries IDF metadata (i.e. precomputed data). */
    function hasFilterData(data) {
        for (var i = 0; i < data.edges.length; i++) {
            if (data.edges[i].isShared && data.edges[i].idf !== undefined) return true;
        }
        return false;
    }

    /** True when any node was discovered through a shared resource. */
    function hasSharedNodes(data) {
        for (var i = 0; i < data.nodes.length; i++) {
            if (data.nodes[i].strength !== undefined) return true;
        }
        return false;
    }

    /**
     * Apply the slider filters to the full graph and return the surviving subset.
     *
     * Pipeline:
     * 1. Keep all direct (non-shared) edges.
     * 2. Keep shared edges where freqPct <= maxCommonality.
     * 3. For each shared node, recompute effective strength from surviving edges;
     *    drop the node when strength < minStrength.
     * 4. Remove orphaned edges (edges pointing at removed nodes).
     * 5. Cap at maxNodes (keep centre + all direct + highest-strength shared).
     */
    function filterGraph(allNodes, allEdges, state) {
        var i;

        // Steps 1-2: filter edges by commonality.
        var edges = [];
        for (i = 0; i < allEdges.length; i++) {
            var e = allEdges[i];
            if (!e.isShared || (e.freqPct || 0) <= state.maxCommonality) edges.push(e);
        }

        // Step 3: recompute strength for shared nodes from the surviving edges.
        var nodeStrength = {};
        for (i = 0; i < edges.length; i++) {
            if (edges[i].isShared) {
                nodeStrength[edges[i].source] = (nodeStrength[edges[i].source] || 0) + (edges[i].idf || 0);
            }
        }

        var keptIds = {};
        var sharedNodes = [];
        var nonSharedCount = 0;

        for (i = 0; i < allNodes.length; i++) {
            var nd = allNodes[i];
            if (nd.isCenter) { keptIds[nd.id] = true; continue; }
            if (nd.strength !== undefined) {
                var eff = nodeStrength[nd.id] || 0;
                if (eff >= state.minStrength) sharedNodes.push({ node: nd, eff: eff });
            } else {
                nonSharedCount++;
                keptIds[nd.id] = true;
            }
        }

        sharedNodes.sort(function (a, b) { return b.eff - a.eff; });

        // Step 5: cap the total node count.
        var remaining = Math.max(0, state.maxNodes - 1 - nonSharedCount);   // -1 for the centre
        for (i = 0; i < sharedNodes.length && i < remaining; i++) {
            keptIds[sharedNodes[i].node.id] = true;
        }

        var nodes = allNodes.filter(function (n) { return keptIds[n.id]; });

        // Step 4: drop orphaned edges.
        var kept = edges.filter(function (ed) { return keptIds[ed.source] && keptIds[ed.target]; });

        return { nodes: nodes, edges: kept };
    }

    /* ------------------------------------------------------------------ */
    /*  Renderer hand-off                                                  */
    /* ------------------------------------------------------------------ */

    /**
     * Translate the payload's vocabulary ("symbolSize", "isShared", IDF) into the
     * renderer's neutral one ("size", "weak", width/alpha). ForceGraph never has
     * to learn what an IDF weight is; this is the only place the two meet.
     */
    function toNodeSpecs(nodes, siteBase) {
        return nodes.map(function (nd) {
            return {
                id: nd.id, name: nd.name, category: nd.category,
                size: nd.symbolSize || 22, isCenter: !!nd.isCenter, community: nd.community,
                url: (nd.itemId && siteBase) ? (siteBase + '/item/' + nd.itemId) : null,
                data: nd
            };
        });
    }

    function toLinkSpecs(edges, maxStrength) {
        return edges.map(function (e) {
            return {
                source: e.source, target: e.target, name: e.name,
                weak: !!e.isShared,
                width: edgeWidth(e, maxStrength),
                alpha: edgeOpacity(e, maxStrength),
                data: e
            };
        });
    }

    /** Layout overrides: distinctive shared links (high IDF) pull closer. */
    function buildForces(maxStrength) {
        var base = ns.ForceGraph.DEFAULT_FORCES;
        return {
            distance: function (link, deg, scale) {
                if (!link.weak) return base.distance(link, deg, scale);
                var w = maxStrength ? Math.min((link.data.idf || 0) / maxStrength, 1) : 0;
                var hub = Math.max(deg[link.source.id] || 1, deg[link.target.id] || 1);
                return (152 - 58 * w + Math.min(64, 3.4 * Math.sqrt(hub))) * scale;
            }
        };
    }

    ns.kgData = {
        load: load,
        buildFromApi: buildFromApi,
        getCategory: getCat,
        edgeWidth: edgeWidth,
        edgeOpacity: edgeOpacity,
        hasFilterData: hasFilterData,
        hasSharedNodes: hasSharedNodes,
        filterGraph: filterGraph,
        toNodeSpecs: toNodeSpecs,
        toLinkSpecs: toLinkSpecs,
        buildForces: buildForces
    };
})();
