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
            label: ns.t('networkTabContributors', 'People and projects'),
            title: ns.t('networkTabContributorsTitle', 'Who contributes to which project'),
            description: ns.t('networkTabContributorsDescription', 'People are linked to the research projects they contributed items to.'),
            builder: function () { return ns.charts && ns.charts.buildContributorNetwork; },
            stats: function (g) {
                return [
                    { key: 'people', label: ns.t('networkStatPeople', 'People'), value: countNodes(g, 'person') },
                    { key: 'projects', label: ns.t('networkStatProjects', 'Projects'), value: countNodes(g, 'project') },
                    { key: 'items', label: ns.t('networkStatContributions', 'Contributions'), value: sumLinks(g) }
                ];
            }
        },
        {
            id: 'collaboration',
            label: ns.t('networkTabCollaboration', 'Co-authorship'),
            title: ns.t('networkTabCollaborationTitle', 'Who works with whom'),
            description: ns.t('networkTabCollaborationDescription', 'People are linked when they appear on the same research item. Colour marks groups who work together often.'),
            builder: function () { return ns.charts && ns.charts.buildCommunities; },
            stats: function (g) {
                return [
                    { key: 'people', label: ns.t('networkStatPeople', 'People'), value: nodeCount(g) },
                    { key: 'contributors', label: ns.t('networkStatLinks', 'Links between them'), value: linkCount(g) },
                    { key: 'subjectsTags', label: ns.t('networkStatGroups', 'Groups'), value: (g.communities || []).length }
                ];
            }
        },
        {
            id: 'affiliations',
            label: ns.t('networkTabAffiliations', 'People and institutions'),
            title: ns.t('networkTabAffiliationsTitle', 'Which institutions each person belongs to'),
            description: ns.t('networkTabAffiliationsDescription', 'People are linked to the institutions recorded as their affiliations.'),
            builder: function () { return ns.charts && ns.charts.buildAffiliationNetwork; },
            stats: function (g) {
                return [
                    { key: 'people', label: ns.t('networkStatPeople', 'People'), value: countNodes(g, 'person') },
                    { key: 'institutions', label: ns.t('networkStatInstitutions', 'Institutions'), value: countNodes(g, 'institution') },
                    { key: 'items', label: ns.t('networkStatAffiliations', 'Affiliations'), value: linkCount(g) }
                ];
            }
        },
        {
            id: 'institutions',
            label: ns.t('networkTabInstitutions', 'Institutions'),
            title: ns.t('networkTabInstitutionsTitle', 'Which institutions work together'),
            description: ns.t('networkTabInstitutionsDescription', 'Institutions are linked when they share research items, contributors or projects.'),
            builder: function () { return ns.charts && ns.charts.buildCollabNetwork; },
            stats: function (g) {
                return [
                    { key: 'institutions', label: ns.t('networkStatInstitutions', 'Institutions'), value: nodeCount(g) },
                    { key: 'projects', label: ns.t('networkStatLinks', 'Links between them'), value: linkCount(g) },
                    { key: 'items', label: ns.t('networkStatShared', 'Things they share'), value: sumLinks(g) }
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

    var uid = 0;

    /**
     * An ARIA tablist with roving focus: only the active tab is in the tab
     * order, arrow keys / Home / End move between the available tabs and
     * activate them, and each tab controls the shared tab panel. Re-rendering
     * replaces the buttons, so the caller restores focus (see render()).
     */
    function renderTabs(activeId, payload, panelId, idPrefix, onSwitch) {
        var wrap = document.createElement('div');
        wrap.className = 'compare-type-switcher network-type-switcher';
        wrap.setAttribute('role', 'tablist');
        wrap.setAttribute('aria-label', ns.t('networkChoose', 'Choose a network'));

        var available = TABS.filter(function (tab) { return payload[tab.id]; });
        TABS.forEach(function (tab) {
            var btn = document.createElement('button');
            var active = tab.id === activeId;
            btn.type = 'button';
            btn.id = idPrefix + tab.id;
            btn.className = 'compare-type-btn' + (active ? ' is-active' : '');
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
            btn.setAttribute('aria-controls', panelId);
            btn.tabIndex = active ? 0 : -1;
            btn.disabled = !payload[tab.id];
            btn.textContent = tab.label;
            btn.addEventListener('click', function () {
                if (!active && payload[tab.id]) onSwitch(tab.id);
            });
            btn.addEventListener('keydown', function (e) {
                var i = available.indexOf(tab);
                var next = null;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = available[(i + 1) % available.length];
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = available[(i - 1 + available.length) % available.length];
                else if (e.key === 'Home') next = available[0];
                else if (e.key === 'End') next = available[available.length - 1];
                if (!next) return;
                e.preventDefault();
                if (next.id !== activeId) onSwitch(next.id);
            });
            wrap.appendChild(btn);
        });

        return wrap;
    }

    function render(container, payload, activeId, siteBase, focusTab) {
        var tab = tabById(activeId);
        var graph = payload[tab.id];
        if (!container._rvNetworkId) container._rvNetworkId = 'rv-network-' + (++uid);
        var idPrefix = container._rvNetworkId + '-tab-';
        var panelId = container._rvNetworkId + '-panel';
        // Disposes the chart, its observers and any canvas renderer it owns.
        if (ns.disposeWithin) ns.disposeWithin(container);
        container._rvNetworkChart = null;

        ns.setChildren(container);

        var header = document.createElement('div');
        header.className = 'dashboard-header';
        header.appendChild(ns.el('h2', '', ns.t('networkExplorer', 'Network explorer')));
        header.appendChild(ns.el('span', 'dashboard-total', tab.label));
        container.appendChild(header);

        container.appendChild(renderTabs(activeId, payload, panelId, idPrefix, function (nextId) {
            render(container, payload, nextId, siteBase, true);
        }));
        // The activated tab was replaced along with everything else; put focus
        // back on its successor rather than letting it fall to <body>.
        if (focusTab) {
            var activeBtn = document.getElementById(idPrefix + tab.id);
            if (activeBtn) activeBtn.focus();
        }

        // Everything below the tabs is the one tab panel the tabs control.
        var tabPanel = document.createElement('div');
        tabPanel.id = panelId;
        tabPanel.setAttribute('role', 'tabpanel');
        tabPanel.setAttribute('aria-labelledby', idPrefix + tab.id);
        container.appendChild(tabPanel);

        if (!graph || !graph.nodes || !graph.links || !graph.links.length) {
            tabPanel.appendChild(ns.el('div', 'rv-no-data',
                ns.t('networkEmpty', 'There is nothing to show in this network yet.')));
            return;
        }

        if (ns.renderStatCards) {
            var statsWrap = document.createElement('div');
            statsWrap.innerHTML = ns.renderStatCards(tab.stats(graph));
            while (statsWrap.firstChild) tabPanel.appendChild(statsWrap.firstChild);
        }

        var charts = document.createElement('div');
        charts.className = 'dashboard-charts';
        var panel = document.createElement('div');
        panel.className = 'chart-panel chart-panel-wide';
        panel.innerHTML = '<h3>' + esc(tab.title) + '</h3>'
            + '<p class="chart-description">' + esc(tab.description) + '</p>'
            + '<div class="chart-container chart-container-tall" data-network-chart="' + esc(tab.id) + '"></div>';
        charts.appendChild(panel);
        tabPanel.appendChild(charts);

        requestAnimationFrame(function () {
            var el = panel.querySelector('[data-network-chart]');
            var builder = tab.builder();
            if (!el) return;
            if (!builder) {
                ns.setChildren(el, [ns.el('div', 'rv-error', ns.t('networkDrawError', 'This network could not be drawn. Please try again.'))]);
                return;
            }
            var chart = ns.buildChart(function () { return builder(el, graph, siteBase); });
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
        Promise.all([
            ns.fetchDataJson('network-explorer.json'),
            // ECharts may still be loading (or have failed to): wait for it, so a
            // failure shows a message instead of a spinner that never ends.
            ns.ensureLibs({ echarts: true, d3: true })
        ]).then(function (values) {
            var payload = values[0];
            if (!payload || typeof payload !== 'object') {
                ns.setChildren(container, [ns.el('div', 'rv-no-data', ns.t('networkNone', 'There are no networks to show yet.'))]);
                return;
            }
            render(container, payload, firstAvailable(payload), siteBase);
        }).catch(function (err) {
            console.error('DreVisualizations network-explorer:', err);
            ns.setChildren(container, [ns.el('div', 'rv-error', ns.t('networkLoadError', 'The network explorer could not be loaded. Please try again.'))]);
        });
    }

    function init() {
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
