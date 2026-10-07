/**
 * Compare: side-by-side comparison of two entities of the same type.
 *
 * Generic over entity type (projects, people, institutions, subjects,
 * languages, genres). The block sets `data-entity-type` to lock a type; when absent the
 * controller shows an in-page type switcher (the "Compare (any entity)" block).
 * Fetches the matching {type}-index.json for the dropdowns, loads two dashboard
 * JSONs, and renders paired charts + an overlaid radar headline + overlap stats.
 *
 * Depends on:
 *   - dashboard-core.js        (THEME, COLORS, helpers)
 *   - dashboard-registry.js    (CHART_MAP, CHART_LABELS)
 *   - dashboard-compare-unify.js (ns.unifyForComparison)
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) return;

    /* ------------------------------------------------------------------ */
    /*  Per-entity-type configuration                                      */
    /* ------------------------------------------------------------------ */

    // Interface copy is resolved once, at load, with literal keys so the string
    // extractor (scripts/lib/client-strings.mjs) sees every one of them. Each type
    // carries its noun in the forms the sentences below need, rather than
    // lower-casing a translated label (which would break, e.g., German nouns).
    var t = function (key, fallback) { return ns.t(key, fallback); };
    var CHART = {
        itemsByYearType: t('compareChartItemsByYearType', 'Items by year and type'),
        itemsByYear: t('compareChartItemsByYear', 'Items by year'),
        types: t('compareChartTypes', 'Resource types'),
        languages: t('compareChartLanguages', 'Languages'),
        subjects: t('compareChartSubjects', 'Subjects'),
        coSubjects: t('compareChartCoSubjects', 'Subjects alongside'),
        contributors: t('compareChartContributors', 'People linked most often')
    };
    var SUBJECT_OVERLAP = t('compareSubjectOverlap', 'subject overlap');

    var TYPES = {
        projects: {
            index: 'projects-index.json', label: t('compareTypeProjects', 'Projects'),
            singular: t('compareTypeProject', 'Project'),
            nounPlural: t('compareNounProjects', 'projects'), nounSingular: t('compareNounProject', 'project'),
            charts: [
                { key: 'stackedTimeline', label: CHART.itemsByYearType, tall: false },
                { key: 'types',           label: CHART.types,           tall: false },
                { key: 'languages',       label: CHART.languages,       tall: false },
                { key: 'subjects',        label: CHART.subjects,        tall: true  }
            ],
            unifyKeys: ['types', 'languages', 'subjects'],
            overlapKey: 'subjects', overlapLabel: SUBJECT_OVERLAP, radar: true, grouped: true
        },
        people: {
            index: 'people-index.json', label: t('compareTypePeople', 'People'),
            singular: t('compareTypePerson', 'Person'),
            nounPlural: t('compareNounPeople', 'people'), nounSingular: t('compareNounPerson', 'person'),
            charts: [
                { key: 'timeline',  label: CHART.itemsByYear, tall: false },
                { key: 'types',     label: CHART.types,       tall: false },
                { key: 'languages', label: CHART.languages,   tall: false },
                { key: 'subjects',  label: CHART.subjects,    tall: true  }
            ],
            unifyKeys: ['types', 'languages', 'subjects'],
            overlapKey: 'subjects', overlapLabel: SUBJECT_OVERLAP, radar: true, grouped: false
        },
        institutions: {
            index: 'institutions-index.json', label: t('compareTypeInstitutions', 'Institutions'),
            singular: t('compareTypeInstitution', 'Institution'),
            nounPlural: t('compareNounInstitutions', 'institutions'), nounSingular: t('compareNounInstitution', 'institution'),
            charts: [
                { key: 'timeline',  label: CHART.itemsByYear, tall: false },
                { key: 'types',     label: CHART.types,       tall: false },
                { key: 'languages', label: CHART.languages,   tall: false },
                { key: 'subjects',  label: CHART.subjects,    tall: true  }
            ],
            unifyKeys: ['types', 'languages', 'subjects'],
            overlapKey: 'subjects', overlapLabel: SUBJECT_OVERLAP, radar: true, grouped: false
        },
        subjects: {
            index: 'subjects-index.json', label: t('compareTypeSubjects', 'Subjects'),
            singular: t('compareTypeSubject', 'Subject'),
            nounPlural: t('compareNounSubjects', 'subjects'), nounSingular: t('compareNounSubject', 'subject'),
            charts: [
                { key: 'timeline',   label: CHART.itemsByYear, tall: false },
                { key: 'types',      label: CHART.types,       tall: false },
                { key: 'languages',  label: CHART.languages,   tall: false },
                { key: 'coSubjects', label: CHART.coSubjects,  tall: true  }
            ],
            unifyKeys: ['types', 'languages', 'coSubjects'],
            overlapKey: 'coSubjects', overlapLabel: t('compareSharedSubjectOverlap', 'shared subject overlap'),
            radar: false, grouped: false
        },
        languages: {
            index: 'languages-index.json', label: t('compareTypeLanguages', 'Languages'),
            singular: t('compareTypeLanguage', 'Language'),
            nounPlural: t('compareNounLanguages', 'languages'), nounSingular: t('compareNounLanguage', 'language'),
            charts: [
                { key: 'timeline',     label: CHART.itemsByYear,  tall: false },
                { key: 'types',        label: CHART.types,        tall: false },
                { key: 'subjects',     label: CHART.subjects,     tall: true  },
                { key: 'contributors', label: CHART.contributors, tall: false }
            ],
            unifyKeys: ['types', 'subjects', 'contributors'],
            overlapKey: 'subjects', overlapLabel: SUBJECT_OVERLAP, radar: false, grouped: false
        },
        genres: {
            index: 'genres-index.json', label: t('compareTypeGenres', 'Genres'),
            singular: t('compareTypeGenre', 'Genre'),
            nounPlural: t('compareNounGenres', 'genres'), nounSingular: t('compareNounGenre', 'genre'),
            charts: [
                { key: 'timeline',     label: CHART.itemsByYear,  tall: false },
                { key: 'types',        label: CHART.types,        tall: false },
                { key: 'languages',    label: CHART.languages,    tall: false },
                { key: 'subjects',     label: CHART.subjects,     tall: true  },
                { key: 'contributors', label: CHART.contributors, tall: false }
            ],
            unifyKeys: ['types', 'languages', 'subjects', 'contributors'],
            overlapKey: 'subjects', overlapLabel: SUBJECT_OVERLAP, radar: false, grouped: false
        }
    };
    var TYPE_ORDER = ['projects', 'people', 'institutions', 'subjects', 'languages', 'genres'];

    /* ------------------------------------------------------------------ */
    /*  Overlap computation                                                */
    /* ------------------------------------------------------------------ */

    function computeOverlap(leftData, rightData, key) {
        if (!leftData || !rightData) return null;
        var left = extractNames(leftData[key]);
        var right = extractNames(rightData[key]);
        var intersection = left.filter(function (s) { return right.indexOf(s) >= 0; });
        var union = left.slice();
        right.forEach(function (s) { if (union.indexOf(s) < 0) union.push(s); });
        return {
            percentage: union.length ? Math.round(intersection.length / union.length * 100) : 0,
            shared: intersection.slice(0, 12),
            sharedCount: intersection.length,
            totalCount: union.length
        };
    }

    function extractNames(data) {
        if (!data) return [];
        if (Array.isArray(data)) return data.map(function (d) { return d.name || ''; });
        return Object.keys(data);
    }

    /* ------------------------------------------------------------------ */
    /*  UI builders                                                        */
    /* ------------------------------------------------------------------ */

    function buildSwitcher(activeType, onSwitch) {
        var wrap = document.createElement('div');
        wrap.className = 'compare-type-switcher';
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', t('compareWhat', 'What to compare'));
        TYPE_ORDER.forEach(function (type) {
            var isActive = (type === activeType);
            var btn = document.createElement('button');
            btn.type = 'button';
            // A proper icon + label pill — NOT the fixed 2rem icon-button (.rv-btn),
            // which clipped these text labels into overlapping squares.
            btn.className = 'compare-type-btn' + (isActive ? ' is-active' : '');
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            // Lucide icon — reuses the dashboard stat-card icon set (ns.statIconFor),
            // whose alias map already covers institutions → organisations and
            // subjects → subjectsTags. Omitted gracefully if the helper is absent.
            var icon = ns.statIconFor ? ns.statIconFor(type) : '';
            if (icon) {
                // eslint-disable-next-line no-unsanitized/property -- module-authored stat icon path
                btn.innerHTML = '<svg class="compare-type-icon" xmlns="http://www.w3.org/2000/svg"'
                    + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
                    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
                    + icon + '</svg>';
            }
            var span = document.createElement('span');
            span.textContent = TYPES[type].label;
            btn.appendChild(span);
            btn.addEventListener('click', function () { if (type !== activeType) onSwitch(type); });
            wrap.appendChild(btn);
        });
        return wrap;
    }

    /** Per-page unique id seed for combobox ARIA wiring. */
    var _cbUid = 0;
    /** Cap rendered options so a long index (e.g. ~700 people) stays snappy;
     *  the user narrows by typing. A note shows how many more matched. */
    var COMBO_MAX_VISIBLE = 100;

    /**
     * A type-to-search combobox replacing the old native <select>. Filters the
     * index by name as you type, supports full keyboard navigation, and keeps the
     * project section grouping. Follows the ARIA combobox/listbox pattern.
     * Signature (entries, side, cfg, onChange) and onChange(id, entry) are
     * unchanged, so the caller is untouched.
     */
    function buildSelector(entries, side, cfg, onChange) {
        var wrap = document.createElement('div');
        wrap.className = 'compare-selector';

        var uid = 'rv-cb-' + (++_cbUid);
        var listId = uid + '-list';

        var label = document.createElement('label');
        label.id = uid + '-label';
        label.textContent = ns.fill(side === 'left' ? t('compareSideA', '{type} A') : t('compareSideB', '{type} B'),
            { type: cfg.singular });
        label.className = 'compare-selector-label';
        label.setAttribute('for', uid + '-input');

        var combo = document.createElement('div');
        combo.className = 'rv-combobox';

        var input = document.createElement('input');
        input.type = 'text';
        input.id = uid + '-input';
        input.className = 'rv-combobox-input';
        input.setAttribute('role', 'combobox');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-controls', listId);
        input.setAttribute('aria-labelledby', uid + '-label');
        input.placeholder = ns.fill(t('compareSearchFor', 'Search for a {type}…'), { type: cfg.nounSingular });

        var list = document.createElement('ul');
        list.className = 'rv-combobox-list';
        list.id = listId;
        list.setAttribute('role', 'listbox');
        list.hidden = true;

        combo.appendChild(input);
        combo.appendChild(list);

        var selectedId = null;
        var activeOptions = [];   // option <li>s currently shown (excludes headers)
        var activeIndex = -1;

        function findEntry(id) {
            for (var i = 0; i < entries.length; i++) {
                if (String(entries[i].id) === String(id)) return entries[i];
            }
            return null;
        }

        function optionText(p) {
            return truncate(p.name, 70) + ' (' + ns.plural(p.items, 'item', 'item', 'items', true) + ')';
        }

        function makeOptionEl(p) {
            var li = document.createElement('li');
            li.className = 'rv-combobox-option';
            li.id = uid + '-opt-' + activeOptions.length;
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', String(String(p.id) === String(selectedId)));
            li.dataset.id = p.id;
            li.textContent = optionText(p);
            li.title = p.name;
            // mousedown (not click) so selection runs before the input's blur
            // handler can close the list.
            li.addEventListener('mousedown', function (e) { e.preventDefault(); choose(p); });
            activeOptions.push(li);
            return li;
        }

        function renderList(query) {
            list.innerHTML = '';
            activeOptions = [];
            var q = (query || '').toLowerCase().trim();
            var matched = q
                ? entries.filter(function (p) { return (p.name || '').toLowerCase().indexOf(q) >= 0; })
                : entries.slice();

            if (!matched.length) {
                var none = document.createElement('li');
                none.className = 'rv-combobox-empty';
                none.setAttribute('role', 'presentation');
                none.textContent = t('noSearchMatch', 'Nothing matches that search');
                list.appendChild(none);
                setActive(-1);
                return;
            }

            var shown = matched.slice(0, COMBO_MAX_VISIBLE);
            if (cfg.grouped) {
                var groups = {};
                shown.forEach(function (p) {
                    var sec = (p.sections && p.sections[0]) || t('otherSection', 'Other');
                    (groups[sec] = groups[sec] || []).push(p);
                });
                Object.keys(groups).sort().forEach(function (sec) {
                    var header = document.createElement('li');
                    header.className = 'rv-combobox-group';
                    header.setAttribute('role', 'presentation');
                    header.textContent = sec;
                    list.appendChild(header);
                    groups[sec].forEach(function (p) { list.appendChild(makeOptionEl(p)); });
                });
            } else {
                shown.forEach(function (p) { list.appendChild(makeOptionEl(p)); });
            }

            if (matched.length > shown.length) {
                var more = document.createElement('li');
                more.className = 'rv-combobox-more';
                more.setAttribute('role', 'presentation');
                more.textContent = ns.fill(t('compareMoreMatches', '+{count} more — keep typing to narrow'),
                    { count: ns.formatNumber(matched.length - shown.length) });
                list.appendChild(more);
            }
            setActive(activeOptions.length ? 0 : -1);
        }

        function setActive(i) {
            if (activeIndex >= 0 && activeOptions[activeIndex]) {
                activeOptions[activeIndex].classList.remove('is-active');
            }
            activeIndex = i;
            if (i >= 0 && activeOptions[i]) {
                var el = activeOptions[i];
                el.classList.add('is-active');
                input.setAttribute('aria-activedescendant', el.id);
                var top = el.offsetTop, bottom = top + el.offsetHeight;
                if (top < list.scrollTop) list.scrollTop = top;
                else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
            } else {
                input.removeAttribute('aria-activedescendant');
            }
        }

        function open() {
            if (!list.hidden) return;
            list.hidden = false;
            input.setAttribute('aria-expanded', 'true');
        }
        function close() {
            if (list.hidden) return;
            list.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
        }
        function openAll() { renderList(''); open(); }

        function choose(p) {
            selectedId = p.id;
            input.value = p.name;
            close();
            onChange(p.id, p);
        }

        input.addEventListener('focus', function () { openAll(); input.select(); });
        input.addEventListener('click', function () { if (list.hidden) openAll(); });
        input.addEventListener('input', function () { renderList(input.value); open(); });
        input.addEventListener('blur', function () { setTimeout(close, 120); });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (list.hidden) { openAll(); return; }
                setActive(Math.min(activeIndex + 1, activeOptions.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive(Math.max(activeIndex - 1, 0));
            } else if (e.key === 'Home' && !list.hidden && activeOptions.length) {
                e.preventDefault();
                setActive(0);
            } else if (e.key === 'End' && !list.hidden && activeOptions.length) {
                e.preventDefault();
                setActive(activeOptions.length - 1);
            } else if (e.key === 'Enter') {
                if (!list.hidden && activeIndex >= 0 && activeOptions[activeIndex]) {
                    e.preventDefault();
                    var entry = findEntry(activeOptions[activeIndex].dataset.id);
                    if (entry) choose(entry);
                }
            } else if (e.key === 'Escape') {
                if (!list.hidden) { e.stopPropagation(); close(); }
            }
        });

        wrap.appendChild(label);
        wrap.appendChild(combo);
        return wrap;
    }

    function buildStatsPanel(leftData, rightData, cfg) {
        var overlap = computeOverlap(leftData, rightData, cfg.overlapKey);
        var html = '<div class="compare-stats">';

        // Every value below is either escaped or formatted from Number(): the
        // payload is generated, but nothing here trusts its types.
        var count = function (data) {
            return data && isFinite(Number(data.totalItems)) ? ns.formatNumber(Number(data.totalItems)) : '—';
        };
        html += '<div class="compare-stat-card">'
            + '<span class="compare-stat-value">' + escapeHtml(count(leftData)) + '</span>'
            + '<span class="compare-stat-label">' + escapeHtml(ns.t('compareItemsA', 'Items (A)')) + '</span></div>';

        html += '<div class="compare-stat-card">'
            + '<span class="compare-stat-value">' + escapeHtml(count(rightData)) + '</span>'
            + '<span class="compare-stat-label">' + escapeHtml(ns.t('compareItemsB', 'Items (B)')) + '</span></div>';

        if (overlap) {
            html += '<div class="compare-stat-card compare-stat-accent">'
                + '<span class="compare-stat-value">' + escapeHtml(ns.formatNumber(Number(overlap.percentage))) + '%</span>'
                + '<span class="compare-stat-label">' + escapeHtml(cfg.overlapLabel)
                + '<br><small>' + escapeHtml(ns.formatNumber(Number(overlap.sharedCount)) + ' ' + ns.t('compareInCommonOf', 'in common out of')
                    + ' ' + ns.formatNumber(Number(overlap.totalCount))) + '</small>'
                + '</span></div>';
        }

        html += '</div>';

        if (overlap && overlap.shared.length > 0) {
            html += '<div class="compare-shared">'
                + '<span class="compare-shared-label">' + escapeHtml(ns.t('compareInCommon', 'In common:')) + '</span>';
            overlap.shared.forEach(function (s) {
                html += '<span class="compare-badge">' + escapeHtml(s) + '</span>';
            });
            if (overlap.sharedCount > overlap.shared.length) {
                html += '<span class="compare-badge compare-badge-muted">'
                    + escapeHtml('+' + ns.formatNumber(Number(overlap.sharedCount) - overlap.shared.length) + ' ' + ns.t('more', 'more')) + '</span>';
            }
            html += '</div>';
        }

        return html;
    }

    /** Overlaid A/B radar panel (same-type entities share normalized axes). */
    function buildRadarHeadline(leftData, rightData, leftName, rightName, siteBase) {
        if (!leftData || !rightData || !leftData.radar || !rightData.radar) return null;
        var lr = leftData.radar, rr = rightData.radar;
        if (!lr.indicator || !lr.indicator.length || !lr.series || !lr.series.length
            || !rr.series || !rr.series.length) return null;

        var combined = {
            indicator: lr.indicator,
            series: [
                { value: lr.series[0].value, name: truncate(leftName, 22) + ' (A)' },
                { value: rr.series[0].value, name: truncate(rightName, 22) + ' (B)' }
            ]
        };

        var panel = document.createElement('div');
        panel.className = 'chart-panel chart-panel-wide compare-radar-panel';
        var title = document.createElement('h3');
        title.textContent = t('compareProfile', 'Profile');
        panel.appendChild(title);
        var el = document.createElement('div');
        el.className = 'chart-container chart-container-tall';
        el.setAttribute('data-chart', 'radar');
        panel.appendChild(el);

        pendingCharts.push({ el: el, key: 'radar', data: combined, siteBase: siteBase, panel: panel });
        return panel;
    }

    function buildChartPair(key, label, leftData, rightData, siteBase, tall) {
        var container = document.createElement('div');
        container.className = 'compare-chart-row';
        container.appendChild(buildChartSide(key, label + ' (A)', leftData, siteBase, tall));
        container.appendChild(buildChartSide(key, label + ' (B)', rightData, siteBase, tall));
        return container;
    }

    /** Pending chart inits — deferred until DOM is ready. */
    var pendingCharts = [];

    function buildChartSide(key, label, data, siteBase, tall) {
        var panel = document.createElement('div');
        panel.className = 'chart-panel compare-chart-panel';

        var title = document.createElement('h3');
        title.textContent = label;
        panel.appendChild(title);

        var chartData = data ? data[key] : null;
        // For stacked timeline, fall back to basic timeline.
        if (!chartData && key === 'stackedTimeline' && data) {
            chartData = data.timeline;
            key = 'timeline';
        }
        var hasData = Array.isArray(chartData) ? chartData.length > 0
            : (chartData && typeof chartData === 'object' && Object.keys(chartData).length > 0);

        if (!hasData) {
            var empty = document.createElement('div');
            empty.className = 'rv-no-data';
            empty.textContent = ns.t('noData', 'Nothing to show');
            panel.appendChild(empty);
            return panel;
        }

        var el = document.createElement('div');
        el.className = 'chart-container' + (tall ? ' chart-container-tall' : '');
        el.setAttribute('data-chart', key);
        panel.appendChild(el);

        pendingCharts.push({ el: el, key: key, data: chartData, siteBase: siteBase, panel: panel });
        return panel;
    }

    function flushPendingCharts() {
        var charts = pendingCharts;
        pendingCharts = [];
        requestAnimationFrame(function () {
            charts.forEach(function (p) {
                if (p.el.isConnected && ns.CHART_MAP && ns.CHART_MAP[p.key]) {
                    var chart = ns.buildChart(function () { return ns.CHART_MAP[p.key](p.el, p.data, p.siteBase); });
                    if (chart) ns.attachToolbar(p.panel, chart);
                }
            });
            pendingCharts = [];
        });
    }

    /* ------------------------------------------------------------------ */
    /*  Helpers                                                            */
    /* ------------------------------------------------------------------ */

    function truncate(str, max) {
        return str && str.length > max ? str.substring(0, max) + '…' : (str || '');
    }

    var escapeHtml = ns.escapeHtml;

    /* ------------------------------------------------------------------ */
    /*  Main controller                                                    */
    /* ------------------------------------------------------------------ */

    function initCompare(container) {
        var basePath = container.dataset.basePath || '';
        var siteBase = container.dataset.siteBase || '';
        ns.basePath = basePath; // expose for builders that load module assets
        var fixedType = container.dataset.entityType || '';
        var hasSwitcher = !TYPES[fixedType];
        var activeType = TYPES[fixedType] ? fixedType : 'projects';
        var typeController = null;
        var typeRequestId = 0;
        var disposeType = function () {};

        container.innerHTML = '<div class="rv-loading"><div class="rv-spinner"></div>'
            + '<span>' + escapeHtml(ns.t('loading', 'Loading…')) + '</span></div>';
        loadType(activeType);

        function loadType(type) {
            disposeType();
            if (ns.disposeWithin) ns.disposeWithin(container);
            activeType = type;
            var cfg = TYPES[type];
            if (typeController) typeController.abort();
            typeController = typeof AbortController !== 'undefined' ? new AbortController() : null;
            var requestId = ++typeRequestId;
            container.innerHTML = '<div class="rv-loading"><div class="rv-spinner"></div>'
                + '<span>' + escapeHtml(ns.t('loading', 'Loading…')) + '</span></div>';
            ns.fetchDataJson('item-dashboards/' + cfg.index,
                typeController ? { signal: typeController.signal } : {}).then(function (entries) {
                if (requestId !== typeRequestId) return;
                renderType(cfg, entries);
            }).catch(function (error) {
                if (error && error.name === 'AbortError') return;
                if (requestId !== typeRequestId) return;
                container.innerHTML = '<div class="rv-error">' + escapeHtml(ns.fill(
                    t('compareListError', 'The list of {types} could not be loaded. Please try again.'),
                    { types: cfg.nounPlural })) + '</div>';
            });
        }

        function renderType(cfg, entries) {
            container.innerHTML = '';
            var leftId = null, rightId = null;
            var leftData = null, rightData = null;
            var leftEntry = null, rightEntry = null;
            var dashboardControllers = { left: null, right: null };
            var dashboardRequests = { left: 0, right: 0 };
            var errors = { left: false, right: false };
            var currentTypeRequest = typeRequestId;
            disposeType = function () {
                ['left', 'right'].forEach(function (side) {
                    dashboardRequests[side]++;
                    if (dashboardControllers[side]) dashboardControllers[side].abort();
                });
            };

            var header = document.createElement('div');
            header.className = 'dashboard-header';
            header.innerHTML = '<h2>' + escapeHtml(ns.fill(t('compareTitle', 'Compare {types}'), { types: cfg.nounPlural })) + '</h2>';
            container.appendChild(header);

            if (hasSwitcher) {
                container.appendChild(buildSwitcher(activeType, function (type) { loadType(type); }));
            }

            var selectors = document.createElement('div');
            selectors.className = 'compare-selectors';
            selectors.appendChild(buildSelector(entries, 'left', cfg, function (id, entry) {
                errors.left = false;
                leftId = id; leftEntry = entry; leftData = null;
                renderComparison();
                fetchDashboard('left', id, function (data) { leftData = data; renderComparison(); });
            }));
            var vsSpan = document.createElement('span');
            vsSpan.className = 'compare-vs';
            vsSpan.textContent = t('compareVs', 'vs');
            selectors.appendChild(vsSpan);
            selectors.appendChild(buildSelector(entries, 'right', cfg, function (id, entry) {
                errors.right = false;
                rightId = id; rightEntry = entry; rightData = null;
                renderComparison();
                fetchDashboard('right', id, function (data) { rightData = data; renderComparison(); });
            }));
            container.appendChild(selectors);

            var content = document.createElement('div');
            content.className = 'compare-content';
            content.setAttribute('aria-live', 'polite');
            container.appendChild(content);
            renderComparison();

            function renderComparison() {
                if (currentTypeRequest !== typeRequestId || !container.isConnected) return;
                if (ns.disposeWithin) ns.disposeWithin(content);
                content.innerHTML = '';
                content.setAttribute('aria-busy', 'false');
                if (!leftId && !rightId) {
                    content.innerHTML = '<div class="rv-no-data">' + escapeHtml(ns.fill(
                        t('compareChooseTwo', 'Choose two {types} above to compare them side by side.'),
                        { types: cfg.nounPlural })) + '</div>';
                    return;
                }
                if (!leftId || !rightId) {
                    content.innerHTML = '<div class="rv-no-data">' + escapeHtml(ns.fill(
                        t('compareChooseSecond', 'Now choose a second {type} to compare with.'),
                        { type: cfg.nounSingular })) + '</div>';
                    return;
                }
                if (errors.left || errors.right) {
                    var notice = document.createElement('div');
                    notice.className = 'rv-error';
                    notice.setAttribute('role', 'alert');
                    notice.textContent = ns.t('comparisonLoadError', 'The comparison could not be loaded.');
                    var retry = document.createElement('button');
                    retry.type = 'button';
                    retry.textContent = ns.t('retry', 'Try again');
                    retry.addEventListener('click', function () {
                        var retryLeft = errors.left, retryRight = errors.right;
                        errors.left = errors.right = false;
                        renderComparison();
                        if (retryLeft) fetchDashboard('left', leftId, function (data) { leftData = data; renderComparison(); });
                        if (retryRight) fetchDashboard('right', rightId, function (data) { rightData = data; renderComparison(); });
                    });
                    notice.appendChild(retry);
                    content.appendChild(notice);
                    return;
                }
                if (!leftData || !rightData) {
                    content.setAttribute('aria-busy', 'true');
                    content.innerHTML = '<div class="rv-loading"><div class="rv-spinner"></div>'
                        + '<span>' + escapeHtml(ns.t('loadingComparison', 'Loading the comparison…')) + '</span></div>';
                    return;
                }

                var unify = ns.unifyForComparison;
                var uLeft = leftData ? JSON.parse(JSON.stringify(leftData)) : null;
                var uRight = rightData ? JSON.parse(JSON.stringify(rightData)) : null;
                if (uLeft && uRight && unify) {
                    cfg.unifyKeys.forEach(function (key) {
                        var order = unify.buildUnifiedOrder(uLeft, uRight, key);
                        uLeft = unify.reorderEntries(uLeft, key, order);
                        uRight = unify.reorderEntries(uRight, key, order);
                    });
                    unify.unifyStackedSeries(uLeft, uRight, 'stackedTimeline');
                }

                var statsDiv = document.createElement('div');
                // eslint-disable-next-line no-unsanitized/property -- buildStatsPanel escapes every value it inserts
                statsDiv.innerHTML = buildStatsPanel(leftData, rightData, cfg);
                content.appendChild(statsDiv);

                pendingCharts = [];

                if (cfg.radar) {
                    var radarPanel = buildRadarHeadline(
                        leftData, rightData,
                        leftEntry ? leftEntry.name : 'A',
                        rightEntry ? rightEntry.name : 'B',
                        siteBase
                    );
                    if (radarPanel) {
                        var radarRow = document.createElement('div');
                        radarRow.className = 'compare-radar-row';
                        radarRow.appendChild(radarPanel);
                        content.appendChild(radarRow);
                    }
                }

                cfg.charts.forEach(function (c) {
                    content.appendChild(buildChartPair(c.key, c.label, uLeft, uRight, siteBase, c.tall));
                });

                flushPendingCharts();
            }

            function fetchDashboard(side, id, callback) {
                if (dashboardControllers[side]) dashboardControllers[side].abort();
                ++dashboardRequests[side];
                if (!id) { callback(null); return; }
                var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                dashboardControllers[side] = controller;
                var requestId = ++dashboardRequests[side];
                ns.fetchDataJson('item-dashboards/' + encodeURIComponent(id) + '.json',
                    controller ? { signal: controller.signal } : {}).then(function (data) {
                    var keys = cfg.charts.map(function (c) { return c.key; }).concat(['radar']);
                    return ns.ensureLibs(ns.chartLibraries(data, null, keys)).then(function () { return data; });
                }).then(function (data) {
                    if (requestId === dashboardRequests[side]) callback(data);
                }).catch(function (error) {
                    if (error && error.name === 'AbortError') return;
                    if (requestId === dashboardRequests[side]) { errors[side] = true; callback(null); }
                });
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Init                                                               */
    /* ------------------------------------------------------------------ */

    function init() {
        var containers = document.querySelectorAll('.compare-container');
        for (var i = 0; i < containers.length; i++) {
            initCompare(containers[i]);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
