/**
 * Network Explorer: collection-wide network tabs.
 *
 * Fetches asset/data/network-explorer.json, then renders the four collection
 * networks that complement the dedicated Discursive Communities block.
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) return;

    var TABS = [
        {
            id: 'contributors',
            label: 'People and projects',
            title: 'Who contributes to which project',
            description: 'People are linked to the research projects they contributed items to.',
            builder: function () { return ns.charts && ns.charts.buildContributorNetwork; },
            stats: function (g) {
                return [
                    { key: 'people', label: 'People', value: countNodes(g, 'person') },
                    { key: 'projects', label: 'Projects', value: countNodes(g, 'project') },
                    { key: 'items', label: 'Contributions', value: sumLinks(g) }
                ];
            }
        },
        {
            id: 'collaboration',
            label: 'Co-authorship',
            title: 'Who works with whom',
            description: 'People are linked when they appear on the same research item. Colour marks groups who work together often.',
            builder: function () { return ns.charts && ns.charts.buildCommunities; },
            stats: function (g) {
                return [
                    { key: 'people', label: 'People', value: nodeCount(g) },
                    { key: 'contributors', label: 'Links between them', value: linkCount(g) },
                    { key: 'subjectsTags', label: 'Groups', value: (g.communities || []).length }
                ];
            }
        },
        {
            id: 'affiliations',
            label: 'People and institutions',
            title: 'Which institutions each person belongs to',
            description: 'People are linked to the institutions recorded as their affiliations.',
            builder: function () { return ns.charts && ns.charts.buildAffiliationNetwork; },
            stats: function (g) {
                return [
                    { key: 'people', label: 'People', value: countNodes(g, 'person') },
                    { key: 'institutions', label: 'Institutions', value: countNodes(g, 'institution') },
                    { key: 'items', label: 'Affiliations', value: linkCount(g) }
                ];
            }
        },
        {
            id: 'institutions',
            label: 'Institutions',
            title: 'Which institutions work together',
            description: 'Institutions are linked when they share research items, contributors or projects.',
            builder: function () { return ns.charts && ns.charts.buildCollabNetwork; },
            stats: function (g) {
                return [
                    { key: 'institutions', label: 'Institutions', value: nodeCount(g) },
                    { key: 'projects', label: 'Links between them', value: linkCount(g) },
                    { key: 'items', label: 'Things they share', value: sumLinks(g) }
                ];
            }
        }
    ];

    function nodeCount(graph) {
        return graph && graph.nodes ? graph.nodes.length : 0;
    }

    function linkCount(graph) {
        return graph && graph.links ? graph.links.length : 0;
    }

    function countNodes(graph, category) {
        if (!graph || !graph.nodes) return 0;
        var n = 0;
        graph.nodes.forEach(function (node) {
            if (node.category === category) n++;
        });
        return n;
    }

    function sumLinks(graph) {
        if (!graph || !graph.links) return 0;
        return graph.links.reduce(function (sum, link) {
            return sum + (Number(link.value) || 0);
        }, 0);
    }

    var esc = ns.escapeHtml;

    function tabById(id) {
        for (var i = 0; i < TABS.length; i++) {
            if (TABS[i].id === id) return TABS[i];
        }
        return TABS[0];
    }

    function firstAvailable(payload) {
        for (var i = 0; i < TABS.length; i++) {
            if (payload[TABS[i].id]) return TABS[i].id;
        }
        return TABS[0].id;
    }

    function renderTabs(activeId, payload, onSwitch) {
        var wrap = document.createElement('div');
        wrap.className = 'compare-type-switcher network-type-switcher';
        wrap.setAttribute('role', 'tablist');
        wrap.setAttribute('aria-label', 'Choose a network');

        TABS.forEach(function (tab) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'compare-type-btn' + (tab.id === activeId ? ' is-active' : '');
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', tab.id === activeId ? 'true' : 'false');
            btn.disabled = !payload[tab.id];
            btn.textContent = tab.label;
            btn.addEventListener('click', function () {
                if (tab.id !== activeId && payload[tab.id]) onSwitch(tab.id);
            });
            wrap.appendChild(btn);
        });

        return wrap;
    }

    function render(container, payload, activeId, siteBase) {
        var tab = tabById(activeId);
        var graph = payload[tab.id];
        var currentChart = container._rvNetworkChart;
        if (currentChart && currentChart.dispose) {
            try { currentChart.dispose(); } catch (err) {}
        }
        container._rvNetworkChart = null;

        container.innerHTML = '';

        var header = document.createElement('div');
        header.className = 'dashboard-header';
        header.innerHTML = '<h2>Network explorer</h2>'
            + '<span class="dashboard-total">' + esc(tab.label) + '</span>';
        container.appendChild(header);

        container.appendChild(renderTabs(activeId, payload, function (nextId) {
            render(container, payload, nextId, siteBase);
        }));

        if (!graph || !graph.nodes || !graph.links || !graph.links.length) {
            var empty = document.createElement('div');
            empty.className = 'rv-no-data';
            empty.textContent = 'There is nothing to show in this network yet.';
            container.appendChild(empty);
            return;
        }

        if (ns.renderStatCards) {
            var statsWrap = document.createElement('div');
            statsWrap.innerHTML = ns.renderStatCards(tab.stats(graph));
            while (statsWrap.firstChild) container.appendChild(statsWrap.firstChild);
        }

        var charts = document.createElement('div');
        charts.className = 'dashboard-charts';
        var panel = document.createElement('div');
        panel.className = 'chart-panel chart-panel-wide';
        panel.innerHTML = '<h3>' + esc(tab.title) + '</h3>'
            + '<p class="chart-description">' + esc(tab.description) + '</p>'
            + '<div class="chart-container chart-container-tall" data-network-chart="' + esc(tab.id) + '"></div>';
        charts.appendChild(panel);
        container.appendChild(charts);

        requestAnimationFrame(function () {
            var el = panel.querySelector('[data-network-chart]');
            var builder = tab.builder();
            if (!el) return;
            if (!builder) {
                el.innerHTML = '<div class="rv-error">This network could not be drawn. Please try again.</div>';
                return;
            }
            var chart = builder(el, graph, siteBase);
            if (chart) {
                container._rvNetworkChart = chart;
                ns.attachToolbar(panel, chart);
            }
        });
    }

    function initContainer(container) {
        var basePath = container.dataset.basePath || '';
        var siteBase = container.dataset.siteBase || '';
        ns.basePath = basePath;
        ns.fetchDataJson('network-explorer.json').then(function (payload) {
            if (!payload || typeof payload !== 'object') {
                container.innerHTML = '<div class="rv-no-data">There are no networks to show yet.</div>';
                return;
            }
            render(container, payload, firstAvailable(payload), siteBase);
        }).catch(function (err) {
            console.error('DreVisualizations network-explorer:', err);
            container.innerHTML = '<div class="rv-error">The network explorer could not be loaded. Please try again.</div>';
        });
    }

    function init() {
        if (typeof echarts === 'undefined') return;
        var containers = document.querySelectorAll('.network-explorer-container');
        for (var i = 0; i < containers.length; i++) {
            initContainer(containers[i]);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
