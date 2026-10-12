/**
 * Contributor and affiliation network charts (bipartite force-directed graphs).
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 *
 * Data format:
 *   { nodes: [{ name, value, itemId, category: 'person'|'project'|'institution', isSelf? }],
 *     links: [{ source, target, value }],
 *     categories: ['person', 'project'] }
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME;
    var initChart = ns.initChart, truncateLabel = ns.truncateLabel;

    ns.charts = ns.charts || {};

    // Entity-type colours now come from the shared registry in dashboard-core
    // (ns.entityColor), which was seeded from the person/project/institution
    // convention this file used to own — so these three keep exactly the colours
    // they had, and the knowledge graph and Entity Network line up behind them
    // instead of each indexing the palette by their own category order.
    function categoryColor(name) {
        return ns.entityColor(name);
    }

    /**
     * Generic bipartite force graph builder.
     * Used for both contributor networks (person↔project) and
     * affiliation networks (person↔institution).
     */
    function buildBipartiteNetwork(el, data, siteBase, tooltipFormatter) {
        if (!data || !data.nodes || !data.links || data.links.length < 1) return;
        var chart = initChart(el);
        // Decal patterns exist to separate FILLED AREAS without relying on colour.
        // On a node-link graph they land on small circles and read as noise, so this
        // chart opts out of the global toggle (as chord/sankey/radar already do).
        chart._noDecal = true;
        var n = data.nodes.length;

        // Build categories array for legend.
        var cats = (data.categories || []).map(function (c) {
            return { name: c, itemStyle: { color: categoryColor(c) } };
        });

        // A circle's area follows its count, against the largest in this
        // network: a fixed px-per-item scale put nearly everyone in a
        // collection-wide network at the cap, one size of large circle.
        var nodeSize = ns.networkNodeSize(data.nodes, 8, 32);
        // Laid out to fit the panel (ns.layoutNetwork): ECharts' force layout
        // ran a collection-wide network past the frame. Without d3 the series keeps that force
        // layout.
        var layout = ns.layoutNetwork ? ns.layoutNetwork(el, data.nodes.map(function (nd) {
            return { name: nd.name, size: nodeSize(nd), fixed: !!nd.isSelf };
        }), data.links) : null;
        var placement = layout
            ? layout.option
            : {
                layout: 'force',
                force: {
                    repulsion: n > 20 ? 500 : 300,
                    gravity: n > 20 ? 0.05 : 0.08,
                    edgeLength: [50, 180],
                    friction: 0.85,
                    layoutAnimation: !ns.prefersReducedMotion()
                }
            };

        chart.setOption({
            tooltip: {
                confine: true,
                formatter: tooltipFormatter || function (p) {
                    if (p.dataType === 'node') {
                        return '<strong>' + echarts.format.encodeHTML(p.name) + '</strong>'
                            + '<br/>' + echarts.format.encodeHTML(ns.plural(p.data.value, 'item', 'item', 'items', true))
                            + (p.data.category ? '<br/><em>' + echarts.format.encodeHTML(p.data.category) + '</em>' : '');
                    }
                    if (p.dataType === 'edge') {
                        return echarts.format.encodeHTML(p.data.source) + ' \u2194 '
                            + echarts.format.encodeHTML(p.data.target)
                            + ': ' + echarts.format.encodeHTML(ns.plural(p.data.value, 'item', 'item', 'items', true));
                    }
                    return '';
                }
            },
            aria: { enabled: true },
            legend: cats.length > 1 ? [{
                data: cats.map(function (c) { return c.name; }),
                bottom: 5,
                textStyle: { fontSize: THEME.fontSize }
            }] : [],
            series: [Object.assign({
                type: 'graph',
                categories: cats,
                scaleLimit: { min: 0.3, max: 5 },
                data: data.nodes.map(function (nd, i) {
                    var isSelf = !!nd.isSelf;
                    var catIdx = (data.categories || []).indexOf(nd.category);
                    var catColor = categoryColor(nd.category);
                    return {
                        name: nd.name, value: nd.value,
                        symbolSize: Math.round(nodeSize(nd) * (layout ? layout.scale : 1)),
                        x: layout ? layout.positions[i][0] : undefined,
                        y: layout ? layout.positions[i][1] : undefined,
                        category: catIdx >= 0 ? catIdx : 0,
                        itemId: nd.itemId,
                        itemStyle: isSelf
                            ? { color: THEME.accent, borderColor: THEME.text, borderWidth: 3 }
                            : { color: catColor, borderWidth: 1, opacity: 0.9 },
                        label: {
                            show: isSelf || n <= 12,
                            fontSize: isSelf ? THEME.fontSizeEmphasis : THEME.fontSize,
                            fontWeight: isSelf ? 'bold' : 'normal',
                            formatter: function (p) { return truncateLabel(p.name, THEME.labelMaxLen); }
                        },
                        emphasis: { label: { show: true, fontSize: THEME.fontSizeEmphasis, fontWeight: 'bold' } }
                    };
                }),
                links: data.links.map(function (l) {
                    return {
                        source: l.source, target: l.target, value: l.value,
                        lineStyle: { width: Math.max(1, Math.min(5, l.value)), curveness: 0.15, opacity: 0.4 }
                    };
                }),
                roam: true, draggable: true,
                emphasis: { focus: 'adjacency', lineStyle: { width: 4, opacity: 0.9 } },
                blur: { itemStyle: { opacity: 0.15 }, lineStyle: { opacity: 0.08 } }
            }, placement)]
        });

        chart.on('click', function (p) {
            if (p.dataType === 'node' && p.data.itemId && siteBase) {
                window.location.href = ns.itemUrl(siteBase, p.data.itemId);
            }
        });
        return chart;
    }

    /** Contributor network: person → project. */
    ns.charts.buildContributorNetwork = function (el, data, siteBase) {
        return buildBipartiteNetwork(el, data, siteBase, function (p) {
            if (p.dataType === 'node') {
                var role = p.data.category === 0 ? ns.t('roleContributor', 'contributor') : ns.t('roleProject', 'project');
                return '<strong>' + echarts.format.encodeHTML(p.name) + '</strong>'
                    + '<br/>' + echarts.format.encodeHTML(ns.plural(p.data.value, 'item', 'item', 'items', true))
                    + '<br/><em>' + echarts.format.encodeHTML(role) + '</em>';
            }
            if (p.dataType === 'edge') {
                return echarts.format.encodeHTML(p.data.source) + ' \u2192 '
                    + echarts.format.encodeHTML(p.data.target)
                    + ': ' + echarts.format.encodeHTML(ns.plural(p.data.value, 'contribution', 'contribution', 'contributions', true));
            }
            return '';
        });
    };

    /** Affiliation network: person → institution. */
    ns.charts.buildAffiliationNetwork = function (el, data, siteBase) {
        return buildBipartiteNetwork(el, data, siteBase, function (p) {
            if (p.dataType === 'node') {
                var type = p.data.isSelf ? ns.t('roleThisInstitution', 'this institution') :
                    (p.data.category === 0 ? ns.t('rolePerson', 'person') : ns.t('roleInstitution', 'institution'));
                return '<strong>' + echarts.format.encodeHTML(p.name) + '</strong>'
                    + '<br/>' + echarts.format.encodeHTML(ns.plural(p.data.value, 'affiliation', 'affiliation', 'affiliations', true))
                    + '<br/><em>' + echarts.format.encodeHTML(type) + '</em>';
            }
            if (p.dataType === 'edge') {
                return echarts.format.encodeHTML(p.data.source) + ' \u2194 '
                    + echarts.format.encodeHTML(p.data.target);
            }
            return '';
        });
    };
})();
