/**
 * Project Explorer: one selector retunes the full project dashboard beneath it.
 *
 * Loads projects-index.json, renders a section-grouped selector, and on change
 * lazy-loads item-dashboards/{id}.json and renders it via ns.renderInto (the
 * shared item-page render loop). Deep-links via ?project=ID.
 *
 * Depends on:
 *   - dashboard-core.js     (helpers, basePath)
 *   - dashboard-registry.js (CHART_MAP, labels, descriptions)
 *   - dashboard.js          (ns.renderInto — the shared render loop)
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) return;

    function truncate(str, max) {
        return str && str.length > max ? str.substring(0, max) + '…' : (str || '');
    }

    var esc = ns.escapeHtml;

    // Render a project's dcterms:abstract as escaped paragraphs, preserving the
    // blank-line breaks curators entered. Treated as plain text (project
    // abstracts are literals), so any stray markup shows verbatim rather than
    // executing.
    function abstractHtml(text) {
        if (!text) return '';
        return text.trim().split(/\n{2,}/).map(function (p) {
            return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>';
        }).join('');
    }

    // A collapsible "Show abstract" disclosure for the selected project's
    // abstract. Collapsed by default; the toggle swaps its own label. Renders
    // nothing when the project has no abstract.
    function renderAbstract(host, html) {
        host.innerHTML = '';
        if (!html) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'explorer-abstract-toggle';
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = ns.t('showAbstract', 'Show abstract');
        var body = document.createElement('div');
        body.className = 'explorer-abstract-body';
        body.hidden = true;
        // eslint-disable-next-line no-unsanitized/property -- paragraphs built with esc() in formatAbstract
        body.innerHTML = html;
        btn.addEventListener('click', function () {
            var show = body.hidden;
            body.hidden = !show;
            btn.setAttribute('aria-expanded', String(show));
            btn.textContent = show ? ns.t('hideAbstract', 'Hide abstract') : ns.t('showAbstract', 'Show abstract');
        });
        host.appendChild(btn);
        host.appendChild(body);
    }

    function buildSelector(projects, selectedId, onChange) {
        var wrap = document.createElement('div');
        wrap.className = 'explorer-selector';

        var label = document.createElement('label');
        label.className = 'explorer-selector-label';
        label.textContent = ns.t('explorerProject', 'Project');

        var select = document.createElement('select');
        select.className = 'compare-select explorer-select';

        var placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = ns.t('explorerChooseProject', 'Choose a project…');
        placeholder.disabled = true;
        if (!selectedId) placeholder.selected = true;
        select.appendChild(placeholder);

        // Group by research section (falls back to "Other").
        var sections = {};
        projects.forEach(function (p) {
            var sec = (p.sections && p.sections[0]) || ns.t('otherSection', 'Other');
            (sections[sec] = sections[sec] || []).push(p);
        });
        Object.keys(sections).sort().forEach(function (sec) {
            var group = document.createElement('optgroup');
            group.label = sec;
            sections[sec].forEach(function (p) {
                var opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = truncate(p.name, 70) + ' (' + ns.plural(p.items, 'item', 'item', 'items', true) + ')';
                opt.title = p.name;
                if (String(p.id) === String(selectedId)) opt.selected = true;
                group.appendChild(opt);
            });
            select.appendChild(group);
        });

        label.appendChild(select);
        select.addEventListener('change', function () { onChange(select.value); });
        wrap.appendChild(label);
        return wrap;
    }

    function initExplorer(container) {
        var basePath = container.dataset.basePath || '';
        var siteBase = container.dataset.siteBase || '';
        ns.basePath = basePath; // expose for builders that load module assets
        function readParam() {
            try { return new URLSearchParams(window.location.search).get('project'); }
            catch (e) { return null; }
        }
        function writeParam(id) {
            try {
                var u = new URL(window.location.href);
                if (id) { u.searchParams.set('project', id); } else { u.searchParams.delete('project'); }
                history.replaceState(null, '', u.toString());
            } catch (e) { /* no-op */ }
        }

        var selectedId = readParam();
        // The block's one live region and busy state (core/async.js); project
        // swaps report through it too, so the content area is not a second one.
        var state = ns.asyncState(container);

        function run() {
        state.loading();
        ns.fetchDataJson('item-dashboards/projects-index.json').then(function (projects) {
            container.innerHTML = '';
            state.ready();

            var header = document.createElement('div');
            header.className = 'dashboard-header';
            header.innerHTML = '<h2>' + ns.escapeHtml(ns.t('explorerTitle', 'Project explorer')) + '</h2>';
            container.appendChild(header);

            var controls = document.createElement('div');
            controls.className = 'explorer-controls';
            controls.appendChild(buildSelector(projects, selectedId, function (id) {
                selectedId = id;
                writeParam(id);
                loadAbstract(id);
                load(id);
            }));
            container.appendChild(controls);

            // Persistent abstract slot between the selector and the dashboard, so
            // the content rebuild on each render leaves it untouched.
            var abstractEl = document.createElement('div');
            abstractEl.className = 'explorer-abstract';
            container.appendChild(abstractEl);

            var content = document.createElement('div');
            content.className = 'explorer-content';
            // Dashboard swaps are announced through the block's status node
            // (state.announce), with aria-busy on this area while one loads.
            container.appendChild(content);
            var abstractController = null;
            var dashboardController = null;
            var abstractRequestId = 0;
            var dashboardRequestId = 0;

            // Fetch the selected project's dcterms:abstract from the public REST
            // API and show it as a collapsible disclosure. Same-origin, optional,
            // and independent of the precomputed dashboard fetch below.
            function loadAbstract(id) {
                if (abstractController) abstractController.abort();
                abstractController = typeof AbortController !== 'undefined' ? new AbortController() : null;
                var requestId = ++abstractRequestId;
                renderAbstract(abstractEl, '');
                if (!id) return;
                ns.fetchDataJson('item-contexts/' + encodeURIComponent(id) + '.json',
                    abstractController ? { signal: abstractController.signal } : {}).then(function (item) {
                    if (requestId !== abstractRequestId) return;
                    renderAbstract(abstractEl, item ? abstractHtml(item.abstract) : '');
                }).catch(function (error) {
                    if (error && error.name === 'AbortError') return;
                    /* abstract is optional */
                });
            }

            function load(id) {
                if (dashboardController) dashboardController.abort();
                dashboardController = typeof AbortController !== 'undefined' ? new AbortController() : null;
                var requestId = ++dashboardRequestId;
                if (ns.disposeWithin) ns.disposeWithin(content);
                if (!id) { ns.setChildren(content); content.setAttribute('aria-busy', 'false'); return; }
                content.setAttribute('aria-busy', 'true');
                ns.setChildren(content, [ns.loadingIndicator()]);
                state.announce(ns.t('loading', 'Loading…'));
                ns.fetchDataJson('item-dashboards/' + encodeURIComponent(id) + '.json',
                    dashboardController ? { signal: dashboardController.signal } : {}).then(function (data) {
                    return ns.ensureLibs(ns.chartLibraries(data)).then(function () { return data; });
                }).then(function (data) {
                    if (requestId !== dashboardRequestId) return;
                    content.innerHTML = '';
                    content.setAttribute('aria-busy', 'false');
                    if (!data || !data.totalItems) {
                        var none = ns.t('noProjectData', 'This project has nothing to visualise yet.');
                        ns.setChildren(content, [ns.el('p', 'rv-no-data', none)]);
                        state.announce(none);
                        return;
                    }
                    ns.renderInto(content, data, siteBase);
                    state.announce(ns.t('visualizationReady', 'Visualization ready.'));
                }).catch(function (error) {
                    if (error && error.name === 'AbortError') return;
                    if (requestId !== dashboardRequestId) return;
                    console.error('DreVisualizations project-explorer:', error);
                    content.setAttribute('aria-busy', 'false');
                    var failed = ns.t('projectLoadError', 'This project could not be loaded.');
                    ns.setChildren(content, [ns.errorNotice(failed, function () { load(id); })]);
                    state.announce(failed);
                });
            }

            var exists = selectedId && projects.some(function (p) {
                return String(p.id) === String(selectedId);
            });
            if (exists) {
                loadAbstract(selectedId);
                load(selectedId);
            } else {
                content.innerHTML = '<div class="rv-no-data">'
                    + ns.escapeHtml(ns.t('explorerPrompt', 'Choose a project above to see its visualisations.')) + '</div>';
            }
        }).catch(function (error) {
            console.error('DreVisualizations project-explorer:', error);
            state.error(ns.t('explorerListError', 'The list of projects could not be loaded.'), run);
        });
        }
        run();
    }

    function init() {
        var containers = document.querySelectorAll('.dashboard-explorer-container');
        for (var i = 0; i < containers.length; i++) initExplorer(containers[i]);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
