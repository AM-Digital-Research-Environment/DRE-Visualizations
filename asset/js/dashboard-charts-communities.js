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
 * When nodes carry an `affiliation` ('cluster' | 'partner', set by the
 * precompute for the Publications network), a "Colour by" switch recolours the
 * same layout by where each person stands towards the Africa Multiple cluster.
 *
 * Data: { nodes: [{ name, value, itemId, community, rank, matched, role, affiliation? }],
 *         links: [{ source, target, value, relation? }],   // endpoints are NAMES
 *         communities: [{ id, size, anchor, merged? }] }   // merged = the smaller groups
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
            showMessage(container, 'rv-error', t('visualizationLoadError', 'The visualisation could not be loaded.'));
            return;
        }

        var nodes = data.nodes;
        var hasRel = data.links.some(function (l) { return !!l.relation; });
        // An "external" name is a contributor string that never resolved to a Person
        // record. Only worth marking when the data actually mixes the two — the
        // speaker networks match everything, and a ring on every node says nothing.
        var mixedMatch = nodes.some(function (n) { return n.matched; })
            && nodes.some(function (n) { return !n.matched; });
        // What a node's `value` and a link's weight count: co-authored publications
        // when the links carry a relationship, otherwise shared items.
        function countLabel(n) {
            return hasRel ? ns.plural(n, 'publication', 'publication', 'publications', true)
                : ns.plural(n, 'item', 'item', 'items', true);
        }
        function sharedLabel(n) {
            return hasRel ? ns.plural(n, 'sharedPublication', 'shared publication', 'shared publications', true)
                : ns.plural(n, 'sharedItem', 'shared item', 'shared items', true);
        }

        /* -- categories: one per Louvain community ------------------------- */

        var communities = (data.communities && data.communities.length)
            ? data.communities
            : [{ id: 0, size: nodes.length, anchor: null }];
        var catIndex = {};
        var groupCategories = communities.map(function (c, i) {
            catIndex[c.id] = i;
            // The precompute folds the groups past the palette into one.
            var label = c.merged ? (t('smallerGroups', 'Smaller groups') + ' (' + c.size + ')')
                : c.anchor ? (c.anchor + ' (' + c.size + ')')
                    : (t('community', 'Group') + ' ' + (c.id + 1));
            return { name: truncateLabel(label, 28), community: c.id, merged: !!c.merged };
        });
        function groupOf(node) {
            var i = catIndex[node.community];
            return i == null ? 0 : i;
        }
        // Keyed by the community ID, not the legend position, so the colours are the
        // ones the ECharts version produced and a community keeps its hue even if a
        // regeneration reorders the list. The merged smaller groups stay neutral.
        function groupColour(i) {
            var c = groupCategories[i];
            if (c && c.merged) return ns.THEME.muted;
            var id = c ? c.community : 0;
            return ns.COLORS[id % ns.COLORS.length];
        }

        /* -- categories: affiliation, when the precompute recorded it ------ */

        var AFFILIATIONS = ['cluster', 'partner', ''];
        var hasAffiliation = nodes.some(function (n) { return !!n.affiliation; });
        function affiliationOf(node) {
            var i = AFFILIATIONS.indexOf(node.affiliation || '');
            return i < 0 ? 2 : i;
        }
        var affiliationCount = [0, 0, 0];
        nodes.forEach(function (n) { affiliationCount[affiliationOf(n)]++; });
        var affiliationCategories = [
            t('affiliationCluster', 'Africa Multiple cluster'),
            t('affiliationPartner', 'Partner institution'),
            t('affiliationNone', 'No cluster affiliation recorded')
        ].map(function (label, i) { return { name: label + ' (' + affiliationCount[i] + ')' }; });
        function affiliationColour(i) {
            return i === 2 ? ns.THEME.muted : ns.COLORS[i];
        }

        // The colouring the reader picked; every caller below reads these.
        var mode = 'group';
        var categories = groupCategories;
        function categoryOf(node) { return mode === 'group' ? groupOf(node) : affiliationOf(node); }
        function colorOf(i) { return mode === 'group' ? groupColour(i) : affiliationColour(i); }

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
                url: (n.itemId && siteBase) ? (ns.itemUrl(siteBase, n.itemId)) : null,
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
            ariaLabel: t('communitiesCanvasLabel', 'Co-occurrence network. Use the arrow keys to move between connected people and Enter to select one.'),
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
                    d.value ? countLabel(d.value) : null,
                    node.deg ? ns.plural(node.deg, 'kgConnection', 'connection shown', 'connections shown', true) : null,
                    roleLabel(d),
                    node.pinned ? t('kgPinnedHint', 'Held in place. Alt-click to let it go') : null
                ];
            },
            url: function (node) { return node.url; },
            openLabel: t('kgOpenRecord', 'Open this record')
        });
        // Inside the stage, so it follows the graph into a fullscreen panel.
        container.appendChild(card.el);
        graph.onSelect(card.show);

        var legend = chrome.buildLegend(graph, categories, colorOf);
        var modeSwitch = hasAffiliation ? buildModeSwitch() : null;
        var lineLegend = hasRel
            ? chrome.buildLineLegend(['coauthor', 'mixed', 'coeditor']
                .filter(function (k) { return present[k]; })
                .map(function (k) { return rel[k]; }))
            : null;
        chrome.mountBelow(container, [
            modeSwitch,
            legend.el,
            lineLegend,
            chrome.buildHint(t('communitiesHint', 'Click a person to focus their collaborators; the panel that opens links to their record. Toggle a cluster in the legend to isolate it. Drag to rearrange — a dragged node stays where you put it (Alt-click to release). Double-click the background or Ctrl + scroll to zoom.'))
        ]);
        graph.onTheme(function () { legend.recolour(); });

        /* -- helpers ------------------------------------------------------ */

        /** "Colour by" — collaboration group or affiliation, on the same layout. */
        function buildModeSwitch() {
            var group = el('div', 'rv-colour-mode');
            group.setAttribute('role', 'group');
            group.setAttribute('aria-label', t('colourBy', 'Colour by'));
            var label = el('span', 'rv-colour-mode-label', t('colourBy', 'Colour by'));
            label.setAttribute('aria-hidden', 'true');   // the group's own name says it
            group.appendChild(label);
            [['group', t('colourByGroup', 'Collaboration group')],
                ['affiliation', t('colourByAffiliation', 'Affiliation')]].forEach(function (option) {
                var button = el('button', 'rv-colour-mode-btn', option[1]);
                button.type = 'button';
                button.setAttribute('aria-pressed', String(option[0] === mode));
                button.addEventListener('click', function () {
                    if (mode === option[0]) return;
                    mode = option[0];
                    categories = mode === 'group' ? groupCategories : affiliationCategories;
                    group.querySelectorAll('button').forEach(function (other) {
                        other.setAttribute('aria-pressed', String(other === button));
                    });
                    graph.setCategories(categories, colorOf, function (node) { return categoryOf(node.data || {}); });
                    var next = chrome.buildLegend(graph, categories, colorOf);
                    legend.el.replaceWith(next.el);
                    legend = next;
                    var selected = graph.selected();
                    if (selected) card.show(selected);
                });
                group.appendChild(button);
            });
            return group;
        }

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
                if (d.value) rows.push(el('span', 'rv-kg-tip-meta', countLabel(d.value)));
                if (node.deg) {
                    rows.push(el('span', 'rv-kg-tip-meta',
                        ns.plural(node.deg, 'kgConnection', 'connection shown', 'connections shown', true)));
                }
                var role = roleLabel(d);
                if (role) rows.push(el('span', 'rv-kg-tip-meta', role));
                rows.push(el('span', 'rv-kg-tip-meta', t('kgClickToFocus', 'Click for details')));
                return rows;
            }
            if (link) {
                var e = link.data || {};
                rows.push(el('strong', null, link.source.name + ' ↔ ' + link.target.name));
                rows.push(el('span', 'rv-kg-tip-meta', sharedLabel(e.value || 1)));
                if (link.name) rows.push(el('span', 'rv-kg-tip-meta', link.name));
                return rows;
            }
            return null;
        }

        function announce(node) {
            var cat = categories[node.category];
            return node.name + (cat ? ', ' + cat.name : '')
                + ', ' + ns.plural(node.deg || 0, 'kgConnection', 'connection shown', 'connections shown', true)
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
                    var cat = groupCategories[groupOf(s)];
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
