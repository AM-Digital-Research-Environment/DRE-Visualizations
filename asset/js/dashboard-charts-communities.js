/**
 * Community force-graph builder: a co-occurrence network with nodes coloured by
 * Louvain community and sized by PageRank. Shared by the Publications co-author
 * network (coAuthorNetwork), the Podcasts / YouTube speaker networks
 * (speakerNetwork) and the Network Explorer's co-authorship tab.
 *
 * Renders with the module's own d3-force canvas renderer (graph-force.js +
 * graph-canvas.js + graph-chrome.js) — the same stack the item-page knowledge
 * graph uses — instead of an ECharts `graph`/`force` series. The ECharts series ran
 * its layout to a frozen state with no collision pass, so nodes overlapped, only
 * the largest could carry a label, and dragging one moved it through a static
 * picture. Now a drag makes the neighbourhood relax and the node keeps the position
 * the reader gave it.
 *
 * Kept from the ECharts version: PageRank sizing, Louvain colouring, the
 * co-author edge-relationship palette and its key, and click-through to a matched
 * person's record. Gained with the renderer: labels placed by collision test, a
 * clickable community legend (which the co-author network never had — colour there
 * was spent on the edges), a detail card, deterministic layout, keyboard and
 * screen-reader access, and a PNG export that draws every label.
 *
 * The payload contract is unchanged, so no regeneration is needed.
 *
 * Data: { nodes: [{ name, value, itemId, community, rank, matched, role }],
 *         links: [{ source, target, value, relation? }],   // endpoints are NAMES
 *         communities: [{ id, size, anchor }] }
 *
 * Registers into window.RV.charts.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var el = ns.el, truncateLabel = ns.truncateLabel;

    ns.charts = ns.charts || {};

    function t(key, fallback) { return ns.t(key, fallback); }

    /**
     * Edge-relationship palette for the co-author network (used only when links
     * carry a `relation`). Pulled from the active cluster palette at render time so
     * it follows the light / dark theme; the key and the edges read it from the same
     * place, so they stay in sync. This axis is the edge relationship, not an entity
     * type, so it legitimately indexes the palette rather than ns.entityColor.
     */
    function relStyles() {
        var P = ns.COLORS;
        return {
            coauthor: { label: t('relCoauthor', 'Co-authorship'), color: P[4 % P.length] },
            mixed:    { label: t('relMixed', 'Author–editor'), color: P[1 % P.length] },
            coeditor: { label: t('relCoeditor', 'Co-editorship'), color: P[9 % P.length] }
        };
    }

    /**
     * Deterministic seed from the node names, so the same network lays out
     * identically on every load — the graph a reader shares is the graph a reader
     * returns to — while two different networks on one page still differ.
     */
    function seedFrom(nodes) {
        var h = 2166136261;
        for (var i = 0; i < nodes.length; i++) {
            var name = String(nodes[i].name || '');
            for (var j = 0; j < name.length; j++) {
                h = Math.imul(h ^ name.charCodeAt(j), 16777619);
            }
        }
        return (h >>> 0) || 1;
    }

    function showMessage(container, cls, text) {
        ns.setChildren(container, [el('p', cls, text)]);
    }

    ns.charts.buildCommunities = function (container, data, siteBase) {
        if (!data || !data.nodes || !data.nodes.length || !data.links) return;
        if (!ns.ForceGraph || !ns.graphChrome || typeof d3 === 'undefined' || !d3.forceSimulation) {
            showMessage(container, 'rv-error', t('kgNoEngine', 'Graph library failed to load.'));
            return;
        }

        var nodes = data.nodes;
        var hasRel = data.links.some(function (l) { return !!l.relation; });
        // An "external" name is a contributor string that never resolved to a Person
        // record. Only worth marking when the data actually mixes the two — the
        // speaker networks match everything, and a ring on every node says nothing.
        var mixedMatch = nodes.some(function (n) { return n.matched; })
            && nodes.some(function (n) { return !n.matched; });
        var unit = hasRel ? t('publications', 'publications') : t('items', 'items');

        /* -- categories: one per Louvain community ------------------------- */

        var communities = (data.communities && data.communities.length)
            ? data.communities
            : [{ id: 0, size: nodes.length, anchor: null }];
        var catIndex = {};
        var categories = communities.map(function (c, i) {
            catIndex[c.id] = i;
            var label = c.anchor
                ? (c.anchor + ' (' + c.size + ')')
                : (t('community', 'Group') + ' ' + (c.id + 1));
            return { name: truncateLabel(label, 28), community: c.id };
        });
        function categoryOf(node) {
            var i = catIndex[node.community];
            return i == null ? 0 : i;
        }
        // Keyed by the community ID, not the legend position, so the colours are the
        // ones the ECharts version produced and a community keeps its hue even if a
        // regeneration reorders the list.
        function colorOf(i) {
            var c = categories[i];
            var id = c ? c.community : 0;
            return ns.COLORS[id % ns.COLORS.length];
        }

        /* -- node + link specs -------------------------------------------- */

        var maxRank = nodes.reduce(function (m, n) { return Math.max(m, n.rank || 0); }, 0) || 1;
        var byName = {};
        nodes.forEach(function (n) { byName[n.name] = n; });

        var nodeSpecs = nodes.map(function (n) {
            return {
                id: n.name,
                name: n.name,
                category: categoryOf(n),
                // Sized by PageRank, as before. The renderer grows well-connected
                // nodes a little further on top, so hubs read as hubs at any zoom.
                size: 9 + Math.sqrt((n.rank || 0) / maxRank) * 26,
                community: n.community,
                url: (n.itemId && siteBase) ? (siteBase + '/item/' + n.itemId) : null,
                data: n
            };
        });

        var rel = relStyles();
        var present = {};
        var linkSpecs = [];
        data.links.forEach(function (l) {
            if (!byName[l.source] || !byName[l.target]) return;
            var r = l.relation && rel[l.relation];
            if (r) present[l.relation] = true;
            linkSpecs.push({
                source: l.source,
                target: l.target,
                // The relationship names the edge, so it reaches the edge labels and
                // the detail card's "Connected via" for free.
                name: r ? r.label : '',
                width: Math.max(0.5, Math.min(4, Math.sqrt(l.value || 1))),
                alpha: hasRel ? 0.55 : 0.32,
                data: l
            });
        });
        if (!linkSpecs.length) return;

        /* -- graph -------------------------------------------------------- */

        var graph = ns.ForceGraph.create(container, {
            nodes: nodeSpecs,
            categories: categories,
            seed: seedFrom(nodes),
            colorOf: colorOf,
            // The node outline marks a contributor who resolved to a real record —
            // the ones whose card can offer a link. Suppressed when every node
            // matched, so the ring only ever appears where it discriminates.
            haloOf: function (node) {
                return (mixedMatch && node.data && node.data.matched) ? ns.THEME.accent : null;
            },
            linkColorOf: function (link) {
                var r = link.data && link.data.relation;
                return (r && rel[r]) ? rel[r].color : null;
            },
            tooltip: tooltipRows,
            announce: announce,
            ariaLabel: t('communitiesCanvasLabel', 'Co-occurrence network. Use the arrow keys to '
                + 'move between connected people and Enter to select one.'),
            forces: {
                // Heavier co-occurrence pulls a pair closer, so the strength of a
                // tie reads as distance and not only as line width; hubs still get
                // room so their neighbours do not pile up on one rim.
                distance: function (link, deg, scale) {
                    var hub = Math.max(deg[link.source.id] || 1, deg[link.target.id] || 1);
                    var w = Math.max(1, (link.data && link.data.value) || 1);
                    return (95 - Math.min(40, 18 * Math.log(w))
                        + Math.min(60, 3.4 * Math.sqrt(hub))) * scale;
                }
            }
        });

        graph.setGraph({ nodes: nodeSpecs, links: linkSpecs }, false);
        graph.resize();

        /* -- chrome ------------------------------------------------------- */

        var chrome = ns.graphChrome;
        var card = chrome.buildDetailCard(graph, {
            typeLabel: function (node) {
                var c = categories[node.category];
                return c ? c.name : '';
            },
            typeColor: function (node) { return colorOf(node.category); },
            metaRows: function (node) {
                var d = node.data || {};
                return [
                    d.value ? (d.value + ' ' + unit) : null,
                    node.deg ? (node.deg + ' ' + (node.deg === 1
                        ? t('kgConnection', 'connection shown')
                        : t('kgConnections', 'connections shown'))) : null,
                    roleLabel(d),
                    node.pinned ? t('kgPinnedHint', 'Pinned — Alt-click to release') : null
                ];
            },
            url: function (node) { return node.url; },
            openLabel: t('kgOpenRecord', 'Open this record')
        });
        // Inside the stage, so it follows the graph into a fullscreen panel.
        container.appendChild(card.el);
        graph.onSelect(card.show);

        var legend = chrome.buildLegend(graph, categories, colorOf);
        var lineLegend = hasRel
            ? chrome.buildLineLegend(['coauthor', 'mixed', 'coeditor']
                .filter(function (k) { return present[k]; })
                .map(function (k) { return rel[k]; }))
            : null;
        chrome.mountBelow(container, [
            legend.el,
            lineLegend,
            chrome.buildHint(t('communitiesHint', 'Click a person to focus their collaborators; '
                + 'the panel that opens links to their record. Toggle a cluster in the legend to '
                + 'isolate it. Drag to rearrange — a dragged node stays where you put it '
                + '(Alt-click to release). Double-click the background or Ctrl + scroll to zoom.'))
        ]);
        graph.onTheme(legend.recolour);

        /* -- helpers ------------------------------------------------------ */

        function roleLabel(d) {
            if (!d) return null;
            var role = d.role === 'both' ? t('roleBoth', 'author & editor')
                : d.role === 'editor' ? t('roleEditor', 'editor')
                    : d.role === 'author' ? t('roleAuthor', 'author') : null;
            if (!mixedMatch) return role;
            var external = d.matched ? null : t('externalName', 'external name');
            return [role, external].filter(Boolean).join(', ') || null;
        }

        /** DOM rows, never markup, so a curated name can never become HTML. */
        function tooltipRows(node, link) {
            var rows = [];
            if (node) {
                var d = node.data || {};
                rows.push(el('strong', null, node.name));
                var cat = categories[node.category];
                if (cat) {
                    var cs = el('span', 'rv-kg-tip-cat', cat.name);
                    cs.style.color = colorOf(node.category);
                    rows.push(cs);
                }
                if (d.value) rows.push(el('span', 'rv-kg-tip-meta', d.value + ' ' + unit));
                if (node.deg) {
                    rows.push(el('span', 'rv-kg-tip-meta', node.deg + ' ' + (node.deg === 1
                        ? t('kgConnection', 'connection shown')
                        : t('kgConnections', 'connections shown'))));
                }
                var role = roleLabel(d);
                if (role) rows.push(el('span', 'rv-kg-tip-meta', role));
                rows.push(el('span', 'rv-kg-tip-meta', t('kgClickToFocus', 'Click for details')));
                return rows;
            }
            if (link) {
                var e = link.data || {};
                rows.push(el('strong', null, link.source.name + ' ↔ ' + link.target.name));
                rows.push(el('span', 'rv-kg-tip-meta', (e.value || 1) + ' ' + t('shared', 'shared') + ' ' + unit));
                if (link.name) rows.push(el('span', 'rv-kg-tip-meta', link.name));
                return rows;
            }
            return null;
        }

        function announce(node) {
            var cat = categories[node.category];
            return node.name + (cat ? ', ' + cat.name : '')
                + ', ' + (node.deg || 0) + ' ' + t('kgConnections', 'connections shown')
                + '. ' + t('kgEnterToOpen', 'Press Enter to select.');
        }

        /**
         * The panel toolbar's adapter. ns.attachToolbar needs only getDataURL (and
         * csvRows for the CSV button); dispose() is what the Network Explorer calls
         * when it swaps one network for another in the same panel.
         */
        return {
            // Decal patterns separate filled AREAS; on small graph nodes they read
            // as noise, so this chart opts out as chord/sankey/radar already do.
            _noDecal: true,
            getDataURL: function () { return graph.toDataURL(); },
            csvRows: function () {
                var rows = [[
                    t('source', 'Source'), t('target', 'Target'),
                    t('value', 'Value'), t('community', 'Group')
                ].concat(hasRel ? [t('relationship', 'Relationship')] : [])];
                data.links.forEach(function (l) {
                    var s = byName[l.source];
                    if (!s || !byName[l.target]) return;
                    var cat = categories[categoryOf(s)];
                    var row = [l.source, l.target, l.value || 1, cat ? cat.name : ''];
                    if (hasRel) row.push((rel[l.relation] || {}).label || '');
                    rows.push(row);
                });
                return rows;
            },
            resize: function () { graph.resize(); },
            dispose: function () { graph.destroy(); },
            graph: graph
        };
    };
})();
