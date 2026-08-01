/**
 * Shared multilingual semantic map. Loads the committed public-data UMAP input,
 * draws it as an ECharts scatter, and provides keyboard-accessible title search.
 * Depends on dashboard-core.js; ECharts is lazy-loaded through ns.ensureLibs().
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) return;

    function node(tag, className, text) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function groupItems(items, mode) {
        var groups = {};
        items.forEach(function (item) {
            var key = mode === 'cluster' ? String(item.cluster) : item.type;
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });
        return groups;
    }

    function seriesFor(items, mode) {
        var groups = groupItems(items, mode);
        return Object.keys(groups).sort(function (a, b) {
            return mode === 'cluster' ? Number(a) - Number(b) : a.localeCompare(b);
        }).map(function (key, index) {
            var rows = groups[key];
            return {
                name: mode === 'cluster'
                    ? ns.t('semanticCluster', 'Semantic cluster') + ' ' + (Number(key) + 1)
                    : (rows[0].typeLabel || key),
                type: 'scatter',
                large: true,
                largeThreshold: 800,
                progressive: 1000,
                symbolSize: 8,
                itemStyle: { color: ns.COLORS[index % ns.COLORS.length] },
                emphasis: { focus: 'series', scale: 1.6 },
                data: rows.map(function (item) {
                    return {
                        value: [item.x, item.y],
                        id: item.id,
                        title: item.title,
                        typeLabel: item.typeLabel || item.type,
                        lowSignal: !!item.lowSignal,
                        itemStyle: { opacity: item.lowSignal ? 0.18 : 0.72 }
                    };
                })
            };
        });
    }

    function option(items, mode) {
        return {
            animation: !ns.prefersReducedMotion(),
            animationDuration: 450,
            tooltip: {
                trigger: 'item',
                confine: true,
                formatter: function (params) {
                    var row = params.data || {};
                    return '<strong>' + echarts.format.encodeHTML(row.title || '') + '</strong><br>'
                        + echarts.format.encodeHTML(row.typeLabel || '');
                }
            },
            // The chart container already has a concise, translatable image
            // description. ECharts' generated label enumerates every scatter
            // value and becomes unusable at collection scale.
            aria: { enabled: false },
            legend: {
                type: 'scroll',
                bottom: 0,
                left: 'center',
                textStyle: { color: ns.THEME.text, fontFamily: ns.THEME.fontFamily }
            },
            grid: { left: 18, right: 18, top: 18, bottom: 72, containLabel: false },
            xAxis: { type: 'value', show: false, scale: true },
            yAxis: { type: 'value', show: false, scale: true },
            dataZoom: [
                { type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'ctrl', moveOnMouseMove: true },
                { type: 'inside', yAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'ctrl', moveOnMouseMove: true }
            ],
            series: seriesFor(items, mode)
        };
    }

    function modeControl(chart, items) {
        var group = node('div', 'semantic-map-mode');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', ns.t('semanticColorBy', 'Colour by'));
        var mode = chart._semanticMode || 'type';

        [['type', 'semanticType', 'Resource type'], ['cluster', 'semanticCluster', 'Semantic cluster']]
            .forEach(function (config) {
                var button = node('button', 'semantic-map-mode__button', ns.t(config[1], config[2]));
                button.type = 'button';
                button.setAttribute('aria-pressed', config[0] === mode ? 'true' : 'false');
                if (config[0] === mode) button.classList.add('is-active');
                button.addEventListener('click', function () {
                    if (mode === config[0]) return;
                    mode = config[0];
                    chart._semanticMode = mode;
                    group.querySelectorAll('button').forEach(function (candidate) {
                        candidate.classList.remove('is-active');
                        candidate.setAttribute('aria-pressed', 'false');
                    });
                    button.classList.add('is-active');
                    button.setAttribute('aria-pressed', 'true');
                    chart.setOption({ legend: { selected: {} }, series: [] }, { replaceMerge: ['series'] });
                    chart.setOption(option(items, mode), { replaceMerge: ['series'] });
                    chart._semanticRestoreLabel();
                });
                group.appendChild(button);
            });
        return group;
    }

    function searchControl(items, siteBase) {
        var wrap = node('div', 'semantic-map-search');
        var label = node('label', 'semantic-map-search__label', ns.t('semanticSearch', 'Find a record on the map'));
        var input = node('input', 'semantic-map-search__input');
        input.type = 'search';
        input.placeholder = ns.t('semanticSearchPlaceholder', 'Search titles');
        input.autocomplete = 'off';
        label.appendChild(input);
        wrap.appendChild(label);
        var results = node('ul', 'semantic-map-search__results');
        results.hidden = true;
        wrap.appendChild(results);

        input.addEventListener('input', function () {
            var query = input.value.trim().toLocaleLowerCase();
            ns.setChildren(results);
            if (query.length < 2) {
                results.hidden = true;
                return;
            }
            var matches = items.filter(function (item) {
                return String(item.title || '').toLocaleLowerCase().indexOf(query) !== -1;
            }).slice(0, 8);
            if (!matches.length) {
                results.appendChild(node('li', 'semantic-map-search__empty', ns.t('semanticNoSearchResults', 'No matching records.')));
            } else {
                matches.forEach(function (item) {
                    var li = node('li', 'semantic-map-search__result');
                    var link = node('a', '', item.title || ('Item ' + item.id));
                    link.href = siteBase + '/item/' + item.id;
                    var type = node('span', 'semantic-map-search__type', item.typeLabel || item.type);
                    li.appendChild(link);
                    li.appendChild(type);
                    results.appendChild(li);
                });
            }
            results.hidden = false;
        });
        return wrap;
    }

    function render(container, payload) {
        var items = payload && payload.items;
        if (!Array.isArray(items) || !items.length) throw new Error('Semantic map is empty');

        var heading = node('h2', '', ns.t('semanticMapTitle', 'Semantic map'));
        var intro = node('p', 'semantic-map-intro',
            ns.t('semanticMapIntro', 'Nearby records use similar language, subjects, places, and descriptions. The map joins every resource type in one multilingual space.'));
        var toolbar = node('div', 'semantic-map-toolbar');
        var chartPanel = node('section', 'chart-panel chart-panel-wide semantic-map-panel');
        var chartHeading = node('h3', '', ns.t('semanticSharedSpace', 'Shared semantic space'));
        var chartEl = node('div', 'chart-container semantic-map-chart');
        var chartLabel = ns.t('semanticMapAria', 'Semantic map of public collection records. Nearby points have similar metadata and descriptions.');
        chartEl.setAttribute('role', 'img');
        chartEl.setAttribute('aria-label', chartLabel);
        var status = node('p', 'semantic-map-status');
        var lowSignal = items.filter(function (item) { return item.lowSignal; }).length;
        status.textContent = ns.formatNumber(items.length) + ' ' + ns.t('semanticRecords', 'records')
            + ' · ' + ns.formatNumber(lowSignal) + ' ' + ns.t('semanticLowSignalCount', 'low-signal');
        var note = node('p', 'semantic-map-note', ns.t('semanticLowSignal', 'Faint points have too little descriptive metadata for recommendations.'));

        chartPanel.appendChild(chartHeading);
        chartPanel.appendChild(chartEl);
        chartPanel.appendChild(status);
        chartPanel.appendChild(note);
        ns.setChildren(container, [heading, intro, toolbar, chartPanel]);

        var chart = ns.initChart(chartEl);
        chart._semanticMode = 'type';
        chart._noDecal = true;
        chart._semanticRestoreLabel = function () {
            chartEl.setAttribute('role', 'img');
            chartEl.setAttribute('aria-label', chartLabel);
        };
        chart.setOption(option(items, 'type'));
        chart._semanticRestoreLabel();
        chart.on('click', function (params) {
            var id = Number(params.data && params.data.id);
            if (Number.isInteger(id) && id > 0) {
                window.location.href = (container.getAttribute('data-site-base') || '') + '/item/' + id;
            }
        });
        chart._rvRebuild = function () {
            chart.setOption(option(items, chart._semanticMode || 'type'), true);
            chart._semanticRestoreLabel();
        };
        toolbar.appendChild(modeControl(chart, items));
        toolbar.appendChild(searchControl(items, container.getAttribute('data-site-base') || ''));
        ns.attachToolbar(chartPanel, chart);
        ns.setupBlockEmbedButtons();
    }

    function showError(container) {
        ns.setChildren(container, [node('div', 'rv-no-data', ns.t(
            'semanticLoadError',
            'The semantic map is not available yet. Run the embeddings workflow and try again.'
        ))]);
    }

    function init(container) {
        ns.basePath = container.getAttribute('data-base-path') || '';
        Promise.all([
            ns.ensureLibs({ echarts: true }),
            fetch(ns.moduleAsset('data/embeddings/map.json'), { credentials: 'same-origin' }).then(function (response) {
                if (!response.ok) throw new Error('Semantic map not found');
                return response.json();
            })
        ]).then(function (values) {
            if (!values[1] || values[1].schemaVersion !== 1) throw new Error('Unsupported semantic map schema');
            render(container, values[1]);
        }).catch(function () { showError(container); });
    }

    function mount(container) {
        var run = function () { init(container); };
        if (!('IntersectionObserver' in window)) { run(); return; }
        var observer = new IntersectionObserver(function (entries) {
            if (entries.some(function (entry) { return entry.isIntersecting; })) {
                observer.disconnect();
                run();
            }
        }, { rootMargin: '600px 0px' });
        observer.observe(container);
    }

    function start() {
        var containers = document.querySelectorAll('.semantic-map-container');
        for (var i = 0; i < containers.length; i++) mount(containers[i]);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
