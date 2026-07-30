/**
 * Generated chart-builder bundle. Do not edit directly.
 * Source order: DashboardAssets::CHART_SCRIPTS.
 * Rebuild: npm run build
 */
/* ---- js/dashboard-layouts.js ---- */
/**
 * Per-resource-type dashboard layout configurations.
 *
 * Each layout defines:
 *   order — chart keys in render order
 *   wide  — keys that span the full grid width
 *   tall  — keys that use the taller container (420px)
 *
 * Half-width charts are paired left-to-right; place them consecutively
 * so the 2-column CSS grid fills both columns without gaps.
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    ns.LAYOUTS = {
        // Curated home-page overview (amira homepage parity). Reads the same
        // collection-overview.json as the full `section` layout but shows only
        // this trimmed, ordered subset. Summary stat cards render above the grid
        // automatically (data.stats), so they are not listed here.
        collectionOverview: {
            order: ['clusterPartners', 'sectionsBar', 'sectionUniversity',
                    'stackedTimeline', 'heatmap', 'languages', 'types',
                    'subjects', 'choropleth'],
            wide:  ['clusterPartners', 'sectionsBar', 'sectionUniversity',
                    'stackedTimeline', 'heatmap', 'subjects', 'choropleth'],
            tall:  ['clusterPartners', 'sectionUniversity', 'subjects',
                    'choropleth']
        },
        organisation: {
            order: ['selfLocation', 'timeline', 'types', 'templates', 'languages',
                    'roles', 'radar', 'contributors', 'subjects', 'collabNetwork',
                    'affiliationNetwork', 'locations'],
            wide:  ['selfLocation', 'subjects', 'collabNetwork', 'affiliationNetwork', 'locations'],
            tall:  ['selfLocation', 'subjects', 'collabNetwork', 'affiliationNetwork', 'locations']
        },
        person: {
            order: ['timeline', 'types', 'templates', 'languages', 'roles', 'radar',
                    'coAuthors', 'subjects', 'contributorNetwork', 'locations',
                    'affiliationMap'],
            wide:  ['subjects', 'contributorNetwork', 'locations', 'affiliationMap'],
            tall:  ['subjects', 'contributorNetwork', 'locations', 'affiliationMap']
        },
        section: {
            order: ['selfLocation', 'stackedTimeline', 'languageTimeline',
                    'timeline', 'gantt', 'beeswarm', 'boxplot',
                    'types', 'languages', 'roles', 'heatmap', 'subjects',
                    'subjectTrends', 'sunburst', 'treemap', 'locations',
                    'choropleth', 'chord', 'timeChord', 'contributorNetwork',
                    'contributors', 'projects', 'sankey'],
            wide:  ['selfLocation', 'stackedTimeline', 'languageTimeline',
                    'gantt', 'beeswarm', 'boxplot', 'heatmap',
                    'sankey', 'sunburst', 'treemap', 'subjects', 'subjectTrends',
                    'locations', 'choropleth', 'chord', 'timeChord',
                    'contributorNetwork', 'projects'],
            tall:  ['selfLocation', 'gantt', 'beeswarm', 'heatmap', 'sankey',
                    'sunburst', 'treemap', 'subjects', 'subjectTrends',
                    'locations', 'choropleth', 'chord', 'timeChord',
                    'contributorNetwork']
        },
        project: {
            order: ['stackedTimeline', 'languageTimeline', 'timeline',
                    'types', 'languages', 'roles', 'radar', 'heatmap',
                    'subjects', 'subjectTrends', 'sunburst', 'treemap', 'locations',
                    'choropleth', 'chord', 'timeChord', 'contributorNetwork',
                    'contributors', 'sankey', 'affiliationMap'],
            wide:  ['stackedTimeline', 'languageTimeline', 'heatmap',
                    'sankey', 'sunburst', 'treemap', 'subjects', 'subjectTrends',
                    'locations', 'choropleth', 'chord', 'timeChord',
                    'contributorNetwork', 'affiliationMap'],
            tall:  ['heatmap', 'sankey', 'sunburst', 'treemap', 'subjects',
                    'subjectTrends', 'locations', 'choropleth', 'chord',
                    'timeChord', 'contributorNetwork', 'affiliationMap']
        },
        location: {
            order: ['selfLocation', 'timeline', 'types', 'languages',
                    'contributors', 'subjects', 'locations'],
            wide:  ['selfLocation', 'subjects', 'locations'],
            tall:  ['selfLocation', 'subjects', 'locations']
        },
        authority: {
            order: ['timeline', 'types', 'languages', 'coSubjects',
                    'contributors', 'locations'],
            wide:  ['coSubjects', 'locations'],
            tall:  ['coSubjects', 'locations']
        },
        genre: {
            order: ['timeline', 'types', 'languages', 'subjects',
                    'contributors', 'locations'],
            wide:  ['subjects', 'locations'],
            tall:  ['subjects', 'locations']
        },
        genreOverview: {
            order: ['genres', 'stackedTimeline', 'timeline', 'types',
                    'languages', 'roles', 'heatmap', 'subjects',
                    'subjectTrends', 'locations', 'contributors'],
            wide:  ['genres', 'stackedTimeline', 'heatmap', 'subjects',
                    'subjectTrends', 'locations'],
            tall:  ['genres', 'heatmap', 'subjects', 'subjectTrends',
                    'locations']
        },
        languageOverview: {
            order: ['topLanguages', 'stackedTimeline', 'languageTimeline',
                    'timeline', 'types', 'roles', 'heatmap', 'subjects',
                    'subjectTrends', 'locations', 'choropleth', 'contributors'],
            wide:  ['topLanguages', 'stackedTimeline', 'languageTimeline',
                    'heatmap', 'subjects', 'subjectTrends', 'locations',
                    'choropleth'],
            tall:  ['topLanguages', 'heatmap', 'subjects', 'subjectTrends',
                    'locations', 'choropleth']
        },
        resourceTypeOverview: {
            order: ['topResourceTypes', 'stackedTimeline', 'timeline',
                    'languages', 'roles', 'heatmap', 'subjects',
                    'subjectTrends', 'locations', 'contributors'],
            wide:  ['topResourceTypes', 'stackedTimeline', 'heatmap',
                    'subjects', 'subjectTrends', 'locations'],
            tall:  ['topResourceTypes', 'heatmap', 'subjects',
                    'subjectTrends', 'locations']
        },
        targetAudienceOverview: {
            order: ['topAudiences', 'stackedTimeline', 'timeline', 'types',
                    'languages', 'roles', 'heatmap', 'subjects',
                    'subjectTrends', 'locations', 'contributors'],
            wide:  ['topAudiences', 'stackedTimeline', 'heatmap', 'subjects',
                    'subjectTrends', 'locations'],
            tall:  ['topAudiences', 'heatmap', 'subjects', 'subjectTrends',
                    'locations']
        },
        personOverview: {
            order: ['topPersons', 'stackedTimeline', 'timeline', 'types',
                    'templates', 'languages', 'roles', 'heatmap', 'subjects',
                    'subjectTrends', 'locations', 'choropleth', 'contributors'],
            wide:  ['topPersons', 'stackedTimeline', 'heatmap', 'subjects',
                    'subjectTrends', 'locations', 'choropleth'],
            tall:  ['topPersons', 'heatmap', 'subjects', 'subjectTrends',
                    'locations', 'choropleth']
        },
        institutionOverview: {
            order: ['topInstitutions', 'stackedTimeline', 'timeline', 'types',
                    'templates', 'languages', 'roles', 'subjects', 'subjectTrends',
                    'locations', 'choropleth', 'contributors'],
            wide:  ['topInstitutions', 'stackedTimeline', 'subjects',
                    'subjectTrends', 'locations', 'choropleth'],
            tall:  ['topInstitutions', 'subjects', 'subjectTrends',
                    'locations', 'choropleth']
        },
        groupOverview: {
            order: ['topGroups', 'stackedTimeline', 'timeline', 'types',
                    'languages', 'roles', 'heatmap', 'subjects',
                    'subjectTrends', 'locations', 'contributors'],
            wide:  ['topGroups', 'stackedTimeline', 'heatmap', 'subjects',
                    'subjectTrends', 'locations'],
            tall:  ['topGroups', 'heatmap', 'subjects', 'subjectTrends',
                    'locations']
        },
        lcshOverview: {
            order: ['topSubjects', 'stackedTimeline', 'timeline', 'types',
                    'languages', 'roles', 'heatmap', 'subjects',
                    'subjectTrends', 'locations', 'contributors'],
            wide:  ['topSubjects', 'stackedTimeline', 'heatmap', 'subjects',
                    'subjectTrends', 'locations'],
            tall:  ['topSubjects', 'heatmap', 'subjects', 'subjectTrends',
                    'locations']
        },
        tagOverview: {
            order: ['topTags', 'stackedTimeline', 'timeline', 'types',
                    'languages', 'roles', 'heatmap', 'subjects',
                    'subjectTrends', 'locations', 'contributors'],
            wide:  ['topTags', 'stackedTimeline', 'heatmap', 'subjects',
                    'subjectTrends', 'locations'],
            tall:  ['topTags', 'heatmap', 'subjects', 'subjectTrends',
                    'locations']
        },
        projectOverview: {
            order: ['topProjects', 'stackedTimeline', 'languageTimeline',
                    'gantt', 'beeswarm', 'boxplot', 'timeline',
                    'types', 'languages', 'roles', 'heatmap', 'subjects',
                    'subjectTrends', 'timeChord', 'locations', 'choropleth',
                    'contributors'],
            wide:  ['topProjects', 'stackedTimeline', 'languageTimeline',
                    'gantt', 'beeswarm', 'boxplot', 'heatmap',
                    'subjects', 'subjectTrends', 'timeChord', 'locations',
                    'choropleth'],
            tall:  ['topProjects', 'gantt', 'beeswarm', 'heatmap', 'subjects',
                    'subjectTrends', 'timeChord', 'locations', 'choropleth']
        },
        researchItem: {
            order: ['timeline', 'types', 'languages', 'subjects',
                    'contributors', 'locations'],
            wide:  ['subjects', 'contributors', 'locations'],
            tall:  ['subjects', 'locations']
        },
        // Half-width charts are paired consecutively (types+languages,
        // topVenues+topAuthors) so neither sits alone on a row; every other key is
        // full-width. `templates` and the (empty) `timeline` are intentionally
        // omitted — `types` already breaks publications down by type. `locations`
        // here is the places-of-publication map (marcrel:pup → geocoded
        // Locations), retitled by the dashboard's own labels override.
        publications: {
            order: ['types', 'languages', 'stackedTimeline', 'locations',
                    'topVenues', 'topAuthors', 'funders', 'coAuthorNetwork',
                    'chord', 'subjects', 'subjectTrends', 'abstractWordcloud'],
            wide:  ['stackedTimeline', 'locations', 'funders', 'coAuthorNetwork',
                    'chord', 'subjects', 'subjectTrends', 'abstractWordcloud'],
            tall:  ['locations', 'coAuthorNetwork', 'chord', 'subjects',
                    'subjectTrends', 'abstractWordcloud']
        },
        // Cluster YouTube channel (youtube.json). Videos carry no resource type
        // or geography, so the layout shows uploads over time, the language mix,
        // the playlists, and any credited speakers (contributors, auto-hidden
        // until speakers are curated). timeline + languages pair on one row.
        youtube: {
            order: ['transcriptWordcloud', 'playlists', 'timeline', 'languages',
                    'languageTimeline', 'speakerNetwork', 'contributors'],
            wide:  ['transcriptWordcloud', 'playlists', 'languageTimeline',
                    'speakerNetwork'],
            tall:  ['transcriptWordcloud', 'playlists', 'speakerNetwork']
        },
        // Cluster podcast episodes (podcasts.json). The headline is a word cloud
        // built from the AI-generated transcripts; then the most frequent
        // speakers, the episode-length distribution, the publication timeline and
        // the series breakdown. The word cloud spans full width; the rest pair up.
        podcasts: {
            order: ['transcriptWordcloud', 'speakerNetwork', 'contributors',
                    'duration', 'timeline', 'series'],
            wide:  ['transcriptWordcloud', 'speakerNetwork'],
            tall:  ['transcriptWordcloud', 'speakerNetwork']
        }
    };

    ns.DEFAULT_LAYOUT = {
        order: ['selfLocation', 'stackedTimeline', 'languageTimeline',
                'timeline', 'gantt', 'beeswarm', 'types', 'languages',
                'roles', 'radar', 'genres', 'heatmap', 'subjects', 'subjectTrends', 'sunburst',
                'treemap', 'locations', 'choropleth', 'chord', 'collabNetwork',
                'contributorNetwork', 'affiliationNetwork', 'contributors',
                'coAuthors', 'coSubjects', 'projects', 'sankey'],
        wide:  ['selfLocation', 'stackedTimeline', 'languageTimeline', 'gantt',
                'beeswarm', 'heatmap', 'sankey', 'sunburst', 'treemap',
                'subjects', 'subjectTrends', 'locations', 'choropleth', 'chord',
                'collabNetwork', 'contributorNetwork', 'affiliationNetwork',
                'projects', 'coSubjects'],
        tall:  ['selfLocation', 'gantt', 'beeswarm', 'heatmap', 'sankey',
                'sunburst', 'treemap', 'subjects', 'subjectTrends',
                'locations', 'choropleth', 'chord', 'collabNetwork',
                'contributorNetwork', 'affiliationNetwork']
    };
})();
;

/* ---- js/dashboard-charts-timeline.js ---- */
/**
 * Timeline chart builder: items per year as a bar chart.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var initChart = ns.initChart;
    var buildDataZoom = ns.buildDataZoom;

    ns.charts = ns.charts || {};

    ns.charts.buildTimeline = function (el, data) {
        var raw = (typeof data === 'object' && !Array.isArray(data)) ? data : null;
        if (!raw || !Object.keys(raw).length) return;
        var chart = initChart(el);
        var years = Object.keys(raw).sort();
        var values = years.map(function (y) { return raw[y]; });

        var zoom = buildDataZoom(years.length);
        chart.setOption({
            tooltip: { trigger: 'axis', confine: true },
            aria: { enabled: true },
            dataZoom: zoom,
            grid: { left: 50, right: 20, top: 20, bottom: zoom.length ? 60 : 40 },
            xAxis: {
                type: 'category', data: years,
                axisLabel: { rotate: years.length > 15 ? 45 : 0, fontSize: THEME.fontSize }
            },
            yAxis: { type: 'value', minInterval: 1 },
            series: [{
                type: 'bar', data: values,
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: COLORS[0] }, { offset: 1, color: THEME.gradientEnd }
                    ]),
                    borderRadius: [3, 3, 0, 0]
                },
                barMaxWidth: THEME.barMaxWidthWide
            }]
        });
        return chart;
    };
})();
;

/* ---- js/dashboard-charts-pie.js ---- */
/**
 * Pie chart builder: donut chart for categorical distributions.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var initChart = ns.initChart;
    var toEntries = ns.toEntries, addClickHandler = ns.addClickHandler;

    ns.charts = ns.charts || {};

    ns.charts.buildPieChart = function (el, data, siteBase) {
        var entries = toEntries(data);
        if (!entries.length) return;
        var chart = initChart(el);
        entries.sort(function (a, b) { return b.value - a.value; });

        chart.setOption({
            tooltip: { trigger: 'item', confine: true, formatter: '{b}: {c} ({d}%)' },
            aria: { enabled: true, decal: { show: ns._decalEnabled } },
            // Legend below the chart (horizontal, scrollable) so it never overlaps
            // the donut — long category lists page left/right instead of covering it.
            legend: {
                orient: 'horizontal', bottom: 0, left: 'center',
                type: 'scroll', textStyle: { fontSize: THEME.fontSize }
            },
            series: [{
                // Centred and lifted to leave room for the bottom legend.
                type: 'pie', radius: ['34%', '62%'], center: ['50%', '45%'],
                avoidLabelOverlap: true,
                // borderColor comes from the theme (= --surface) so slice gaps
                // match the panel in light/dark; see dashboard-core buildEchartsTheme.
                itemStyle: { borderRadius: 4, borderWidth: 2 },
                label: { show: false },
                emphasis: { label: { show: true, fontSize: THEME.fontSizeEmphasis, fontWeight: 'bold' } },
                data: entries.map(function (e, i) {
                    return { name: e.name, value: e.value, itemStyle: { color: COLORS[i % COLORS.length] } };
                })
            }]
        });
        addClickHandler(chart, entries, siteBase);
        return chart;
    };
})();
;

/* ---- js/dashboard-charts-bar.js ---- */
/**
 * Bar chart builder: horizontal bars for ranked lists (top 20).
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var initChart = ns.initChart, truncateLabel = ns.truncateLabel;
    var toEntries = ns.toEntries, addClickHandler = ns.addClickHandler;

    ns.charts = ns.charts || {};

    ns.charts.buildBarChart = function (el, data, siteBase) {
        var entries = toEntries(data);
        if (!entries.length) return;
        var chart = initChart(el);
        entries.sort(function (a, b) { return a.value - b.value; });
        if (entries.length > 20) entries = entries.slice(entries.length - 20);

        var names = entries.map(function (e) { return e.name; });
        var values = entries.map(function (e) { return e.value; });

        chart.setOption({
            tooltip: { trigger: 'axis', confine: true, axisPointer: { type: 'shadow' } },
            aria: { enabled: true },
            grid: {
                left: Math.min(220, Math.max(80, names.reduce(function (m, n) {
                    return Math.max(m, n.length);
                }, 0) * 6.5)),
                right: 20, top: 10, bottom: 20
            },
            xAxis: { type: 'value', minInterval: 1 },
            yAxis: {
                type: 'category', data: names,
                axisLabel: {
                    fontSize: THEME.fontSize, width: 200, overflow: 'truncate',
                    formatter: function (v) { return truncateLabel(v, THEME.labelMaxLen); }
                }
            },
            series: [{
                type: 'bar',
                data: values.map(function (v, i) {
                    return { value: v, itemStyle: { color: COLORS[i % COLORS.length], borderRadius: [0, 3, 3, 0] } };
                }),
                barMaxWidth: THEME.barMaxWidth
            }]
        });
        addClickHandler(chart, entries, siteBase);
        return chart;
    };
})();
;

/* ---- js/dashboard-charts-histogram.js ---- */
/**
 * Histogram builder: vertical bars over ordered categorical bands.
 *
 * Unlike buildBarChart (which ranks by value and keeps the top 20), this keeps
 * the input order, so distribution bands — e.g. episode-length buckets — read
 * left → right in their natural order. Expects an ordered `[{name, value}]`
 * array. Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var initChart = ns.initChart;
    var toEntries = ns.toEntries;

    ns.charts = ns.charts || {};

    ns.charts.buildHistogram = function (el, data) {
        var entries = toEntries(data);
        if (!entries.length) return;
        var chart = initChart(el);

        var names = entries.map(function (e) { return e.name; });
        var values = entries.map(function (e) { return e.value; });

        chart.setOption({
            tooltip: { trigger: 'axis', confine: true, axisPointer: { type: 'shadow' } },
            aria: { enabled: true },
            grid: { left: 50, right: 20, top: 20, bottom: 40 },
            xAxis: {
                type: 'category', data: names,
                axisLabel: { fontSize: THEME.fontSize, rotate: names.length > 6 ? 30 : 0 }
            },
            yAxis: { type: 'value', minInterval: 1 },
            series: [{
                type: 'bar', data: values,
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: COLORS[0] }, { offset: 1, color: THEME.gradientEnd }
                    ]),
                    borderRadius: [3, 3, 0, 0]
                },
                barMaxWidth: THEME.barMaxWidthWide
            }]
        });
        return chart;
    };
})();
;

/* ---- js/dashboard-charts-wordcloud.js ---- */
/**
 * Word cloud chart builder with a word-count slider and an optional language
 * toggle.
 *
 * Accepts either shape:
 *   - flat `[{name, value, itemId?}]` — a single cloud (e.g. subjects, or the
 *     in-PHP transcript fallback);
 *   - `{languages: ['en','fr',…], byLang: {en:[…], fr:[…]}}` — a per-language
 *     cloud (the lemmatised word-cloud inputs), rendered with a language toggle.
 *
 * Falls back to a bar chart if the echarts-wordcloud extension is unavailable.
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var COLORS = ns.COLORS;
    var initChart = ns.initChart;
    var toEntries = ns.toEntries, addClickHandler = ns.addClickHandler;

    ns.charts = ns.charts || {};

    var LANG_NAMES = { en: 'English', fr: 'French', de: 'German', pt: 'Portuguese' };

    var _wordCloudOk = null;
    function isWordCloudAvailable() {
        if (_wordCloudOk !== null) return _wordCloudOk;
        try {
            var d = document.createElement('div');
            d.style.cssText = 'width:1px;height:1px;position:absolute;left:-9999px';
            document.body.appendChild(d);
            var c = echarts.init(d);
            c.setOption({ series: [{ type: 'wordCloud', data: [{ name: 'x', value: 1 }] }] });
            c.dispose(); document.body.removeChild(d);
            _wordCloudOk = true;
        } catch (e) { _wordCloudOk = false; }
        return _wordCloudOk;
    }

    ns.charts.buildWordCloud = function (el, data, siteBase) {
        // Multilingual shape carries byLang; anything else is a flat list.
        var multi = !!(data && !Array.isArray(data) && data.byLang);
        var langs = multi
            ? ((data.languages && data.languages.length) ? data.languages.slice() : Object.keys(data.byLang))
            : [];
        var curLang = multi ? langs[0] : null;

        function rawFor() { return multi ? (data.byLang[curLang] || []) : data; }
        var entries = toEntries(rawFor());
        if (!entries.length) return;
        if (!isWordCloudAvailable()) return ns.charts.buildBarChart(el, rawFor(), siteBase);

        var chart = initChart(el);
        chart._noDecal = true;

        function defaultCount() {
            var t = entries.length;
            return Math.min(t, t > 100 ? 80 : 30);
        }

        // Larger fonts fill more of the (wide) panel and read better; the grid
        // scales with them so words still don't collide after the bump.
        function wordCloudOption(count) {
            var slice = entries.slice(0, count);
            var minFont = count > 100 ? 12 : count > 50 ? 14 : 16;
            var maxFont = count > 100 ? 72 : count > 50 ? 84 : (count > 10 ? 96 : 110);
            var grid = count > 100 ? 6 : count > 50 ? 8 : 10;
            return {
                tooltip: {
                    confine: true,
                    formatter: function (p) { return echarts.format.encodeHTML(p.name) + ': ' + p.value; }
                },
                aria: { enabled: true },
                series: [{
                    type: 'wordCloud',
                    shape: function (theta) {
                        var cos = Math.abs(Math.cos(theta));
                        var sin = Math.abs(Math.sin(theta));
                        return 1 / Math.max(cos, sin);
                    },
                    sizeRange: [minFont, maxFont],
                    rotationRange: [-45, 45], rotationStep: 15, gridSize: grid,
                    drawOutOfBound: false, shrinkToFit: true,
                    layoutAnimation: count <= 100 && !ns.prefersReducedMotion(),
                    left: 'center', top: 'center', width: '100%', height: '100%',
                    textStyle: {
                        fontFamily: 'sans-serif',
                        color: function () { return COLORS[Math.floor(Math.random() * COLORS.length)]; }
                    },
                    emphasis: { textStyle: { fontWeight: 'bold', shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } },
                    data: slice.map(function (e) { return { name: e.name, value: e.value }; })
                }]
            };
        }

        // echarts-wordcloud lays out asynchronously; clear() before each relayout
        // so an in-flight pass isn't painted over (the "stacked words" bug).
        function render(count) {
            chart.clear();
            chart.setOption(wordCloudOption(count));
        }

        render(defaultCount());
        // entries is reassigned on a language switch; addClickHandler's closure
        // reads the current value, so it stays correct without re-binding.
        addClickHandler(chart, entries, siteBase);

        var panel = el.closest('.chart-panel');
        if (!panel) return chart;
        var desc = panel.querySelector('.chart-description');
        var anchor = desc ? desc.nextSibling : el;

        var sliderInput = null, sliderValue = null, relayoutTimer = null;

        // Language toggle — only when the data carries more than one language.
        if (multi && langs.length > 1) {
            var langBar = document.createElement('div');
            langBar.className = 'rv-word-langs';
            langs.forEach(function (code) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'rv-word-lang' + (code === curLang ? ' is-active' : '');
                b.textContent = LANG_NAMES[code] || code.toUpperCase();
                b.addEventListener('click', function () {
                    if (code === curLang) return;
                    curLang = code;
                    entries = toEntries(rawFor());
                    langBar.querySelectorAll('.rv-word-lang').forEach(function (x) { x.classList.remove('is-active'); });
                    b.classList.add('is-active');
                    if (sliderInput) {
                        sliderInput.max = String(entries.length);
                        var n = Math.min(parseInt(sliderInput.value, 10), entries.length);
                        sliderInput.value = String(n);
                        sliderValue.textContent = n;
                    }
                    render(sliderInput ? parseInt(sliderInput.value, 10) : defaultCount());
                });
                langBar.appendChild(b);
            });
            panel.insertBefore(langBar, anchor);
            anchor = langBar.nextSibling;
        }

        // Word-count slider.
        if (entries.length > 5) {
            var dc = defaultCount();
            var slider = document.createElement('div');
            slider.className = 'rv-word-slider';
            slider.innerHTML = '<label><span class="rv-word-slider-caption">Words</span>'
                + '<input type="range" min="5" max="' + entries.length + '" value="' + dc + '" step="1">'
                + '<span class="rv-word-slider-value">' + dc + '</span></label>';
            panel.insertBefore(slider, anchor);
            sliderInput = slider.querySelector('input');
            sliderValue = slider.querySelector('.rv-word-slider-value');
            sliderInput.addEventListener('input', function () {
                sliderValue.textContent = this.value;
                var n = parseInt(this.value, 10);
                clearTimeout(relayoutTimer);
                relayoutTimer = setTimeout(function () { render(n); }, 180);
            });
        }

        return chart;
    };
})();
;

/* ---- js/dashboard-charts-gantt.js ---- */
/**
 * Gantt chart builder: project timelines with start/end date bars.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var initChart = ns.initChart, truncateLabel = ns.truncateLabel;

    ns.charts = ns.charts || {};

    ns.charts.buildGantt = function (el, data, siteBase) {
        if (!data || !data.length) return;
        var chart = initChart(el);
        var projects = data.slice().reverse();
        var names = projects.map(function (p) { return p.name; });
        var minYear = 9999, maxYear = 0;

        var barData = projects.map(function (p, i) {
            var start = new Date(p.start).getTime();
            var end = new Date(p.end).getTime();
            var sy = new Date(p.start).getFullYear();
            var ey = new Date(p.end).getFullYear();
            if (sy < minYear) minYear = sy;
            if (ey > maxYear) maxYear = ey;
            return {
                name: p.name, value: [i, start, end, p.itemId],
                itemStyle: { color: COLORS[i % COLORS.length], borderRadius: 3 }
            };
        });

        chart.setOption({
            tooltip: {
                confine: true,
                formatter: function (params) {
                    var v = params.value;
                    var dateOptions = { year: 'numeric', month: 'short' };
                    var s = ns.formatDate(v[1], dateOptions);
                    var e = ns.formatDate(v[2], dateOptions);
                    return '<strong>' + echarts.format.encodeHTML(params.name) + '</strong><br/>' + s + ' \u2192 ' + e;
                }
            },
            aria: { enabled: true },
            grid: { left: 220, right: 30, top: 10, bottom: 30 },
            xAxis: {
                type: 'time',
                min: new Date(minYear, 0, 1).getTime(),
                max: new Date(maxYear + 1, 0, 1).getTime(),
                axisLabel: { fontSize: THEME.fontSize }
            },
            yAxis: {
                type: 'category', data: names,
                axisLabel: {
                    fontSize: THEME.fontSize, width: 200, overflow: 'truncate',
                    formatter: function (v) { return truncateLabel(v, 28); }
                }
            },
            series: [{
                type: 'custom',
                renderItem: function (params, api) {
                    var catIdx = api.value(0);
                    var start = api.coord([api.value(1), catIdx]);
                    var end = api.coord([api.value(2), catIdx]);
                    var height = api.size([0, 1])[1] * 0.6;
                    return {
                        type: 'rect', shape: { x: start[0], y: start[1] - height / 2, width: end[0] - start[0], height: height },
                        style: api.style()
                    };
                },
                encode: { x: [1, 2], y: 0 },
                data: barData
            }]
        });

        chart.on('click', function (p) {
            if (p.value && p.value[3] && siteBase) window.location.href = siteBase + '/item/' + p.value[3];
        });
        return chart;
    };
})();
;

/* ---- js/dashboard-charts-heatmap.js ---- */
/**
 * Heatmap chart builder: cross-tabulation matrix (e.g. type × language).
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME;
    var initChart = ns.initChart, truncateLabel = ns.truncateLabel;

    ns.charts = ns.charts || {};

    ns.charts.buildHeatmap = function (el, data) {
        if (!data || !data.rows || !data.cols || !data.values) return;
        var chart = initChart(el);
        chart._noDecal = true;
        var maxVal = 0;
        data.values.forEach(function (v) { if (v[2] > maxVal) maxVal = v[2]; });

        chart.setOption({
            tooltip: {
                confine: true,
                formatter: function (p) {
                    return echarts.format.encodeHTML(data.rows[p.value[1]]) + ' \u00d7 '
                        + echarts.format.encodeHTML(data.cols[p.value[0]]) + ': ' + p.value[2];
                }
            },
            aria: { enabled: true },
            // Extra right margin keeps the calculable visualMap (the draggable
            // slider) clear of the cells; extra bottom margin gives the angled
            // x-axis labels room so none are clipped.
            grid: { left: 130, right: 92, top: 12, bottom: 104 },
            xAxis: {
                type: 'category', data: data.cols,
                // interval: 0 forces every column label to render (ECharts otherwise
                // drops some when they crowd); a longer truncation keeps them legible.
                axisLabel: {
                    interval: 0, rotate: 35, fontSize: THEME.fontSize,
                    formatter: function (v) { return truncateLabel(v, 22); }
                }
            },
            yAxis: {
                type: 'category', data: data.rows,
                axisLabel: { interval: 0, fontSize: THEME.fontSize, formatter: function (v) { return truncateLabel(v, 22); } }
            },
            visualMap: {
                min: 0, max: maxVal || 1, calculable: true, orient: 'vertical', right: 12, top: 'center',
                inRange: { color: ns.accentRamp() }
            },
            series: [{
                type: 'heatmap', data: data.values,
                label: { show: true, fontSize: 10 },
                emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } }
            }],
            // On narrow (mobile) widths the matrix gets too dense: the per-cell
            // value labels overlap into an unreadable smear and the wide left/right
            // margins starve the cells. So below 560/380px we hide the colour-scale,
            // reclaim the margins, steepen + shrink the axis labels and drop the cell
            // numbers (the colour ramp + tap tooltip still carry the value). ECharts
            // re-evaluates the matching query automatically on every resize.
            media: [
                {
                    query: { maxWidth: 560 },
                    option: {
                        grid: { left: 94, right: 14, top: 8, bottom: 96 },
                        xAxis: { axisLabel: { rotate: 55, fontSize: 9, formatter: function (v) { return truncateLabel(v, 14); } } },
                        yAxis: { axisLabel: { fontSize: 9, formatter: function (v) { return truncateLabel(v, 14); } } },
                        visualMap: { show: false },
                        series: [{ label: { show: false } }]
                    }
                },
                {
                    query: { maxWidth: 380 },
                    option: {
                        grid: { left: 78, right: 8, top: 6, bottom: 88 },
                        xAxis: { axisLabel: { rotate: 90, fontSize: 8, formatter: function (v) { return truncateLabel(v, 10); } } },
                        yAxis: { axisLabel: { fontSize: 8, formatter: function (v) { return truncateLabel(v, 10); } } },
                        visualMap: { show: false },
                        series: [{ label: { show: false } }]
                    }
                }
            ]
        });
        // Re-apply the theme-aware ramp when the light/dark theme toggles.
        chart._rvRebuild = function () {
            chart.setOption({ visualMap: { inRange: { color: ns.accentRamp() } } });
        };
        return chart;
    };
})();
;

/* ---- js/dashboard-charts-chord.js ---- */
/**
 * Chord diagram builder: circular graph for co-occurrence relationships.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var initChart = ns.initChart, truncateLabel = ns.truncateLabel;

    ns.charts = ns.charts || {};

    ns.charts.buildChord = function (el, data, siteBase) {
        if (!data || !data.nodes || !data.links || data.nodes.length < 2) return;
        var chart = initChart(el);
        chart._noDecal = true;

        chart.setOption({
            tooltip: {
                confine: true,
                formatter: function (p) {
                    if (p.dataType === 'node') return '<strong>' + echarts.format.encodeHTML(p.name) + '</strong>';
                    if (p.dataType === 'edge') {
                        return echarts.format.encodeHTML(p.data.source) + ' \u2194 '
                            + echarts.format.encodeHTML(p.data.target) + ': ' + p.data.value;
                    }
                    return '';
                }
            },
            aria: { enabled: true },
            series: [{
                type: 'graph', layout: 'circular', circular: { rotateLabel: true },
                data: data.nodes.map(function (n, i) {
                    return {
                        name: n.name, symbolSize: Math.max(10, Math.min(40, n.value * 2)),
                        itemStyle: { color: COLORS[i % COLORS.length] },
                        itemId: n.itemId,
                        label: { fontSize: THEME.fontSize - 1, formatter: function (p) { return truncateLabel(p.name, 20); } }
                    };
                }),
                links: data.links.map(function (l) {
                    return {
                        source: l.source, target: l.target, value: l.value,
                        lineStyle: { width: Math.max(1, Math.min(6, l.value)), curveness: 0.3, opacity: 0.5 }
                    };
                }),
                roam: true, label: { show: true, position: 'right' },
                emphasis: { focus: 'adjacency', lineStyle: { width: 4, opacity: 0.9 } }
            }]
        });

        chart.on('click', function (p) {
            if (p.dataType === 'node' && p.data.itemId && siteBase) window.location.href = siteBase + '/item/' + p.data.itemId;
        });
        return chart;
    };
})();
;

/* ---- js/dashboard-charts-sankey.js ---- */
/**
 * Sankey diagram builder: flow from contributors through projects to types.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var initChart = ns.initChart, truncateLabel = ns.truncateLabel;

    ns.charts = ns.charts || {};

    ns.charts.buildSankey = function (el, data) {
        if (!data || !data.nodes || !data.links || data.links.length < 1) return;
        var chart = initChart(el);
        chart._noDecal = true;

        chart.setOption({
            tooltip: { trigger: 'item', confine: true },
            aria: { enabled: true, decal: { show: ns._decalEnabled } },
            series: [{
                type: 'sankey', layout: 'none',
                emphasis: { focus: 'adjacency' },
                nodeAlign: 'left', orient: 'horizontal',
                nodeWidth: 20, nodeGap: 10,
                lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.4 },
                label: {
                    fontSize: THEME.fontSize,
                    formatter: function (p) { return truncateLabel(p.name, 25); }
                },
                data: data.nodes.map(function (n, i) {
                    return { name: n.name, itemStyle: { color: COLORS[i % COLORS.length] } };
                }),
                links: data.links
            }]
        });
        return chart;
    };
})();
;

/* ---- js/dashboard-charts-sunburst.js ---- */
/**
 * Sunburst chart builder: hierarchical radial chart (type > language > subject).
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME;
    var initChart = ns.initChart;

    ns.charts = ns.charts || {};

    ns.charts.buildSunburst = function (el, data) {
        if (!data || !data.length) return;
        var chart = initChart(el);

        chart.setOption({
            tooltip: { confine: true },
            aria: { enabled: true, decal: { show: ns._decalEnabled } },
            series: [{
                type: 'sunburst',
                data: data,
                radius: ['10%', '90%'],
                sort: null,
                emphasis: { focus: 'ancestor' },
                levels: [
                    {},
                    { r0: '10%', r: '40%', label: { fontSize: THEME.fontSize, rotate: 'tangential' }, itemStyle: { borderWidth: 2 } },
                    { r0: '40%', r: '65%', label: { fontSize: THEME.fontSize - 1, rotate: 'tangential' }, itemStyle: { borderWidth: 1 } },
                    { r0: '65%', r: '90%', label: { show: false }, itemStyle: { borderWidth: 0.5 } }
                ]
            }]
        });
        return chart;
    };
})();
;

/* ---- js/dashboard-charts-stacked-timeline.js ---- */
/**
 * Stacked timeline builder: items per year stacked by resource type.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var initChart = ns.initChart;
    var buildDataZoom = ns.buildDataZoom;

    ns.charts = ns.charts || {};

    ns.charts.buildStackedTimeline = function (el, data) {
        if (!data || !data.years || !data.series) return;
        var chart = initChart(el);

        var series = data.series.map(function (s, i) {
            return {
                name: s.name, type: 'bar', stack: 'total',
                data: s.data,
                itemStyle: { color: COLORS[i % COLORS.length] },
                emphasis: { focus: 'series' }
            };
        });

        var zoom = buildDataZoom(data.years.length);
        chart.setOption({
            tooltip: { trigger: 'axis', confine: true },
            aria: { enabled: true, decal: { show: ns._decalEnabled } },
            dataZoom: zoom,
            legend: { bottom: zoom.length ? 50 : 5, textStyle: { fontSize: THEME.fontSize }, type: 'scroll' },
            grid: { left: 50, right: 20, top: 20, bottom: zoom.length ? 110 : 55 },
            xAxis: {
                type: 'category', data: data.years,
                axisLabel: { rotate: data.years.length > 15 ? 45 : 0, fontSize: THEME.fontSize }
            },
            yAxis: { type: 'value', minInterval: 1 },
            series: series
        });
        return chart;
    };
})();
;

/* ---- js/dashboard-charts-beeswarm.js ---- */
/**
 * Beeswarm chart builder: scatter with jitter for categorical × value data.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 *
 * Data format (array of points):
 *   [{ category: string, value: number, label: string, size: number, itemId: number }]
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var initChart = ns.initChart, truncateLabel = ns.truncateLabel;

    ns.charts = ns.charts || {};

    /**
     * Deterministic pseudo-random jitter from a string seed.
     * Returns a value in [-amplitude, +amplitude].
     */
    function jitter(seed, amplitude) {
        var h = 0;
        for (var i = 0; i < seed.length; i++) {
            h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
        }
        // Map hash to [-1, 1] range, then scale
        return (((h & 0x7fffffff) % 1000) / 500 - 1) * amplitude;
    }

    ns.charts.buildBeeswarm = function (el, data, siteBase) {
        if (!data || !data.length) return;
        var chart = initChart(el);

        // Extract unique categories (preserve order from data)
        var catOrder = [];
        var catSet = {};
        data.forEach(function (d) {
            if (!catSet[d.category]) {
                catSet[d.category] = true;
                catOrder.push(d.category);
            }
        });

        // Category index map
        var catIdx = {};
        catOrder.forEach(function (c, i) { catIdx[c] = i; });

        // Compute size range for bubble scaling
        var minSize = Infinity, maxSize = 0;
        data.forEach(function (d) {
            if (d.size < minSize) minSize = d.size;
            if (d.size > maxSize) maxSize = d.size;
        });
        var sizeRange = maxSize - minSize || 1;
        var minSymbol = 10, maxSymbol = 36;

        // Build scatter data: [x, y + jitter, size, label, itemId, category]
        var seriesData = data.map(function (d) {
            var y = catIdx[d.category] + jitter(d.label + d.value, 0.3);
            var normSize = (d.size - minSize) / sizeRange;
            var symbolSize = minSymbol + normSize * (maxSymbol - minSymbol);
            return {
                value: [d.value, y],
                symbolSize: symbolSize,
                // borderColor (= --surface) supplied by the theme so the dot
                // outline matches the panel in light/dark.
                itemStyle: {
                    color: COLORS[catIdx[d.category] % COLORS.length],
                    opacity: 0.85,
                    borderWidth: 1
                },
                _label: d.label,
                _size: d.size,
                _category: d.category,
                _itemId: d.itemId
            };
        });

        // Compute value range for axis
        var values = data.map(function (d) { return d.value; });
        var minVal = Math.min.apply(null, values);
        var maxVal = Math.max.apply(null, values);

        chart.setOption({
            tooltip: {
                confine: true,
                formatter: function (params) {
                    var d = params.data;
                    return '<strong>' + echarts.format.encodeHTML(d._label) + '</strong>'
                        + '<br/>Section: ' + echarts.format.encodeHTML(d._category)
                        + '<br/>Start: ' + d.value[0]
                        + '<br/>Items: ' + d._size;
                }
            },
            aria: { enabled: true },
            grid: { left: 160, right: 30, top: 20, bottom: 40 },
            xAxis: {
                type: 'value',
                name: 'Start Year',
                nameLocation: 'center',
                nameGap: 25,
                min: minVal - 1,
                max: maxVal + 1,
                axisLabel: {
                    fontSize: THEME.fontSize,
                    formatter: function (v) { return String(Math.round(v)); }
                }
            },
            yAxis: {
                type: 'category',
                data: catOrder,
                axisLabel: {
                    fontSize: THEME.fontSize,
                    width: 140,
                    overflow: 'truncate',
                    formatter: function (v) { return truncateLabel(v, 22); }
                },
                axisTick: { show: false },
                splitLine: { show: true, lineStyle: { type: 'dashed', opacity: 0.3 } }
            },
            series: [{
                type: 'scatter',
                data: seriesData,
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowColor: 'rgba(0,0,0,0.3)'
                    }
                }
            }]
        });

        // Click to navigate to project page
        chart.on('click', function (params) {
            if (params.data && params.data._itemId && siteBase) {
                window.location.href = siteBase + '/item/' + params.data._itemId;
            }
        });
        chart.getZr().on('mousemove', function (e) {
            chart.getZr().setCursorStyle(e.target ? 'pointer' : 'default');
        });

        return chart;
    };
})();
;

/* ---- js/dashboard-charts-map.js ---- */
/**
 * Map chart builders: geographic origins map, self-location mini map.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var truncateLabel = ns.truncateLabel, getBasemapStyle = ns.getBasemapStyle;
    var esc = ns.escapeHtml;

    ns.charts = ns.charts || {};

    /* -- Map popup builder -- */

    function buildMapPopup(props, locItems, page, perPage, siteBase) {
        var total = locItems.length;
        var totalPages = Math.ceil(total / perPage);
        var start = page * perPage;
        var pageItems = locItems.slice(start, start + perPage);

        var h = '<div class="rv-popup-content">';
        h += '<strong>' + ns.escapeHtml(props.name || '') + '</strong>';
        h += ' <span class="rv-popup-count">' + ns.formatNumber(props.value) + ' items</span>';

        if (pageItems.length) {
            h += '<ul class="rv-popup-items">';
            pageItems.forEach(function (it) {
                var url = siteBase ? siteBase + '/item/' + it.id : '#';
                var title = truncateLabel(it.title, 55);
                h += '<li><a href="' + esc(url) + '">' + esc(title) + '</a></li>';
            });
            h += '</ul>';
        }

        if (totalPages > 1) {
            h += '<div class="rv-popup-pagination">';
            if (page > 0) h += '<button type="button" data-page="' + (page - 1) + '">\u2190</button>';
            h += '<span>' + (page + 1) + ' / ' + totalPages + '</span>';
            if (page < totalPages - 1) h += '<button type="button" data-page="' + (page + 1) + '">\u2192</button>';
            h += '</div>';
        }

        if (props.itemId && siteBase) {
            h += '<a class="rv-popup-location-link" href="' + esc(siteBase) + '/item/'
                + encodeURIComponent(props.itemId) + '">View location page \u2192</a>';
        }

        h += '</div>';
        return h;
    }

    /* -- Geographic origins map -- */

    ns.charts.buildMap = function (el, data, siteBase, allData) {
        var hasOriginData = data && data.length;
        var hasCurrentData = allData && allData.currentLocations && allData.currentLocations.length;
        if ((!hasOriginData && !hasCurrentData) || typeof maplibregl === 'undefined') return null;
        data = data || [];

        el.style.borderRadius = '6px';

        // Wrapped so the theme engine can rebuild the map (new basemap + theme
        // colours) on a live light/dark toggle — see dashboard-core ns.refresh().
        function create() {
        // Attribution hidden — source info in map tiles. Users can inspect via browser.
        var map = ns.initMap(el, { center: [0, 15], zoom: 1.5 });

        map.on('load', function () {

            var features = data.map(function (loc) {
                return {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [loc.lon, loc.lat] },
                    properties: { name: loc.name, value: loc.value, itemId: loc.itemId }
                };
            });

            map.addSource('locations', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: features },
                cluster: true,
                clusterMaxZoom: 8,
                clusterRadius: 40,
            });

            map.addLayer({
                id: 'clusters', type: 'circle', source: 'locations',
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': ['step', ['get', 'point_count'], COLORS[0], 10, COLORS[1], 30, COLORS[5]],
                    'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 32],
                    'circle-stroke-width': 2, 'circle-stroke-color': THEME.border,
                }
            });

            map.addLayer({
                id: 'cluster-count', type: 'symbol', source: 'locations',
                filter: ['has', 'point_count'],
                layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 },
                // White count with a soft dark halo so it reads on every cluster
                // brand colour (Uni-Grün through Gold) in both themes.
                paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.45)', 'text-halo-width': 1 }
            });

            map.addLayer({
                id: 'points', type: 'circle', source: 'locations',
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': THEME.accent,
                    'circle-radius': ['interpolate', ['linear'], ['get', 'value'], 1, 7, 50, 18, 200, 28],
                    'circle-stroke-width': 2, 'circle-stroke-color': THEME.border, 'circle-opacity': 0.85,
                }
            });

            map.addLayer({
                id: 'point-labels', type: 'symbol', source: 'locations',
                filter: ['!', ['has', 'point_count']],
                layout: { 'text-field': '{name}', 'text-size': 11, 'text-offset': [0, 1.8], 'text-anchor': 'top' },
                paint: { 'text-color': THEME.text, 'text-halo-color': THEME.border, 'text-halo-width': 1.5 }
            });

            var locationItems = {};
            data.forEach(function (loc) {
                if (loc.items && loc.items.length) locationItems[loc.name] = loc.items;
            });

            // --- Current-location layer (orange) ---
            // Where items are *held now* (dcterms:provenance) — Locations AND
            // Institutions, both geocoded. Its own clustered layer, so it shows on
            // every dashboard map, with or without origin→current flows.
            var currentData = (allData && allData.currentLocations) || [];
            var hasCurrent = currentData.length > 0;
            var currentColor = COLORS[2];
            var currentItems = {};

            if (hasCurrent) {
                var curFeatures = currentData.map(function (loc) {
                    if (loc.items && loc.items.length) currentItems[loc.name] = loc.items;
                    return {
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [loc.lon, loc.lat] },
                        properties: { name: loc.name, value: loc.value, itemId: loc.itemId }
                    };
                });

                map.addSource('currentLocations', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: curFeatures },
                    cluster: true, clusterMaxZoom: 8, clusterRadius: 40,
                });

                map.addLayer({
                    id: 'cur-clusters', type: 'circle', source: 'currentLocations',
                    filter: ['has', 'point_count'],
                    paint: {
                        'circle-color': currentColor,
                        'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 30, 30],
                        'circle-stroke-width': 2, 'circle-stroke-color': THEME.border,
                    }
                });

                map.addLayer({
                    id: 'cur-cluster-count', type: 'symbol', source: 'currentLocations',
                    filter: ['has', 'point_count'],
                    layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 },
                    paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.45)', 'text-halo-width': 1 }
                });

                map.addLayer({
                    id: 'cur-points', type: 'circle', source: 'currentLocations',
                    filter: ['!', ['has', 'point_count']],
                    paint: {
                        'circle-color': currentColor,
                        'circle-radius': ['interpolate', ['linear'], ['get', 'value'], 1, 7, 50, 16, 200, 26],
                        'circle-stroke-width': 2, 'circle-stroke-color': THEME.border, 'circle-opacity': 0.85,
                    }
                });

                map.addLayer({
                    id: 'cur-point-labels', type: 'symbol', source: 'currentLocations',
                    filter: ['!', ['has', 'point_count']],
                    layout: { 'text-field': '{name}', 'text-size': 11, 'text-offset': [0, 1.8], 'text-anchor': 'top' },
                    paint: { 'text-color': THEME.text, 'text-halo-color': THEME.border, 'text-halo-width': 1.5 }
                });
            }

            // --- GeoFlows overlay (origin → current location arcs) ---
            var geoFlows = allData && allData.geoFlows;
            var hasFlows = geoFlows && geoFlows.links && geoFlows.links.length > 0;

            if (hasFlows) {
                var flowFeatures = geoFlows.links.map(function (l) {
                    return {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: [[l.fromLon, l.fromLat], [l.toLon, l.toLat]]
                        },
                        properties: {
                            from: l.from, to: l.to, value: l.value,
                            width: Math.max(1, Math.min(6, Math.sqrt(l.value)))
                        }
                    };
                });

                map.addSource('flows', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: flowFeatures }
                });

                // Flow lines rendered below origin points.
                map.addLayer({
                    id: 'flow-lines',
                    type: 'line',
                    source: 'flows',
                    paint: {
                        'line-color': THEME.accent,
                        'line-width': ['get', 'width'],
                        'line-opacity': 0.35
                    }
                }, 'clusters'); // insert before clusters layer

                // Current-location dots — only when there is no standalone current
                // layer (older precomputes without `currentLocations`); otherwise the
                // orange clustered layer above already renders them.
                if (!hasCurrent) {
                var seenCurrents = {};
                var currentFeatures = [];
                geoFlows.links.forEach(function (l) {
                    var key = l.toLat + ',' + l.toLon;
                    if (!seenCurrents[key]) {
                        seenCurrents[key] = true;
                        currentFeatures.push({
                            type: 'Feature',
                            geometry: { type: 'Point', coordinates: [l.toLon, l.toLat] },
                            properties: { name: l.to }
                        });
                    }
                });

                map.addSource('currents', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: currentFeatures }
                });

                map.addLayer({
                    id: 'current-dots',
                    type: 'circle',
                    source: 'currents',
                    paint: {
                        'circle-radius': 7,
                        'circle-color': currentColor,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': THEME.border,
                        'circle-opacity': 0.85
                    }
                });

                map.addLayer({
                    id: 'current-labels',
                    type: 'symbol',
                    source: 'currents',
                    layout: { 'text-field': '{name}', 'text-size': 11, 'text-offset': [0, 1.8], 'text-anchor': 'top' },
                    paint: { 'text-color': THEME.text, 'text-halo-color': THEME.border, 'text-halo-width': 1.5 }
                });
                }
            }

            // --- Popup management (single popup at a time) ---
            var activePopup = null;
            function showPopup(lngLat, html) {
                if (activePopup) activePopup.remove();
                activePopup = new maplibregl.Popup({ offset: 12, maxWidth: '320px', className: 'rv-map-popup' })
                    .setLngLat(lngLat)
                    .setHTML(html)
                    .addTo(map);
                return activePopup;
            }

            map.on('click', 'points', function (e) {
                var props = e.features[0].properties;
                var locItems = locationItems[props.name] || [];
                var perPage = 8;

                showPopup(e.lngLat, buildMapPopup(props, locItems, 0, perPage, siteBase));

                function attachPageHandlers() {
                    var el = activePopup && activePopup.getElement();
                    if (!el) return;
                    el.querySelectorAll('[data-page]').forEach(function (btn) {
                        btn.addEventListener('click', function (evt) {
                            evt.stopPropagation();
                            var page = parseInt(btn.dataset.page, 10);
                            activePopup.setHTML(buildMapPopup(props, locItems, page, perPage, siteBase));
                            attachPageHandlers();
                        });
                    });
                }
                attachPageHandlers();
            });

            if (hasFlows) {
                map.on('click', 'flow-lines', function (e) {
                    var p = e.features[0].properties;
                    showPopup(e.lngLat,
                        '<div class="rv-popup-content"><strong>' + esc(p.from || '')
                        + '</strong> \u2192 <strong>' + esc(p.to || '') + '</strong><br/>'
                        + ns.formatNumber(p.value) + ' items</div>');
                });

                map.on('click', 'current-dots', function (e) {
                    var p = e.features[0].properties;
                    showPopup(e.lngLat,
                        '<div class="rv-popup-content"><strong>' + esc(p.name || '')
                        + '</strong><br/><em>Current location</em></div>');
                });

                ['flow-lines', 'current-dots'].forEach(function (layerId) {
                    map.on('mouseenter', layerId, function () { map.getCanvas().style.cursor = 'pointer'; });
                    map.on('mouseleave', layerId, function () { map.getCanvas().style.cursor = ''; });
                });
            }

            map.on('click', 'clusters', function (e) {
                var clusterId = e.features[0].properties.cluster_id;
                map.getSource('locations').getClusterExpansionZoom(clusterId, function (err, zoom) {
                    if (err) return;
                    map.easeTo({ center: e.lngLat, zoom: zoom });
                });
            });

            map.on('mouseenter', 'points', function () { map.getCanvas().style.cursor = 'pointer'; });
            map.on('mouseleave', 'points', function () { map.getCanvas().style.cursor = ''; });
            map.on('mouseenter', 'clusters', function () { map.getCanvas().style.cursor = 'pointer'; });
            map.on('mouseleave', 'clusters', function () { map.getCanvas().style.cursor = ''; });

            // --- Current-location interactions (item-list popups + cluster zoom) ---
            if (hasCurrent) {
                map.on('click', 'cur-points', function (e) {
                    var props = e.features[0].properties;
                    var locItems = currentItems[props.name] || [];
                    var perPage = 8;
                    showPopup(e.lngLat, buildMapPopup(props, locItems, 0, perPage, siteBase));
                    (function attach() {
                        var pe = activePopup && activePopup.getElement();
                        if (!pe) return;
                        pe.querySelectorAll('[data-page]').forEach(function (btn) {
                            btn.addEventListener('click', function (evt) {
                                evt.stopPropagation();
                                activePopup.setHTML(buildMapPopup(props, locItems, parseInt(btn.dataset.page, 10), perPage, siteBase));
                                attach();
                            });
                        });
                    })();
                });

                map.on('click', 'cur-clusters', function (e) {
                    var clusterId = e.features[0].properties.cluster_id;
                    map.getSource('currentLocations').getClusterExpansionZoom(clusterId, function (err, zoom) {
                        if (err) return;
                        map.easeTo({ center: e.lngLat, zoom: zoom });
                    });
                });

                ['cur-points', 'cur-clusters'].forEach(function (layerId) {
                    map.on('mouseenter', layerId, function () { map.getCanvas().style.cursor = 'pointer'; });
                    map.on('mouseleave', layerId, function () { map.getCanvas().style.cursor = ''; });
                });
            }

            // --- Fit bounds ---
            var bounds = new maplibregl.LngLatBounds();
            if (features.length) {
                features.forEach(function (f) { bounds.extend(f.geometry.coordinates); });
            }
            if (hasFlows) {
                geoFlows.links.forEach(function (l) {
                    bounds.extend([l.toLon, l.toLat]);
                });
            }
            if (hasCurrent) {
                currentData.forEach(function (loc) { bounds.extend([loc.lon, loc.lat]); });
            }
            if (!bounds.isEmpty()) {
                if (features.length === 1 && !hasFlows && !hasCurrent) {
                    map.setCenter(features[0].geometry.coordinates);
                    map.setZoom(4);
                } else {
                    map.fitBounds(bounds, { padding: 40, maxZoom: 6 });
                }
            }

            // --- Legend (rendered below the map; see ns.mountMapLegend) ---
            if (hasCurrent || hasFlows) {
                var legendHtml =
                    '<div class="rv-map-legend-row"><span class="rv-map-legend-dot" style="background:' + THEME.accent + '"></span> Place of Origin</div>' +
                    '<div class="rv-map-legend-row"><span class="rv-map-legend-dot" style="background:' + currentColor + '"></span> Current Location</div>';
                if (hasFlows) {
                    legendHtml += '<div class="rv-map-legend-row"><span class="rv-map-legend-line" style="background:' + THEME.accent + '"></span> Flow</div>';
                }
                ns.mountMapLegend(el, legendHtml);
            }
        });

        ns.trackMap(map, create);
        return { resize: function () { map.resize(); } };
        }
        return create();
    };

    /* -- Self-location mini map -- */

    ns.charts.buildMiniMap = function (el, data) {
        if (!data || !Number.isFinite(Number(data.lat)) || !Number.isFinite(Number(data.lon))
            || typeof maplibregl === 'undefined') return null;
        el.style.borderRadius = '6px';

        function create() {
        var map = new maplibregl.Map({
            container: el,
            style: getBasemapStyle(),
            center: [data.lon, data.lat],
            zoom: 4,
            attributionControl: ns.getMapAttributionOptions(),
            scrollZoom: false,
        });
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
        map.addControl(new maplibregl.FullscreenControl(), 'top-right');
        new maplibregl.Marker({ color: THEME.accent })
            .setLngLat([data.lon, data.lat])
            .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML('<strong>' + esc(data.name || '') + '</strong>'))
            .addTo(map);
        ns.trackMap(map, create);
        return { resize: function () { map.resize(); } };
        }
        return create();
    };
})();
;

/* ---- js/dashboard-charts-cluster-map.js ---- */
/**
 * Cluster-partner map builder: the Africa Multiple Research Centres (AMRCs) and
 * their partners as colour-coded MapLibre markers with a toggleable legend.
 *
 * DATA-DRIVEN from the precompute (Aggregators::clusterPartners): the institutions
 * that `dcterms:isPartOf` one of the four "African Multiple Partners" category
 * authority records, shaped as
 *   { categories: [{ key, label }, …],   // ordered → legend order + colour order
 *     points: [{ category, latitude, longitude, label, sublabel, itemId }, …] }
 * Category labels come straight from the authority records, and colours are
 * assigned here by category order from the theme palette (ns.COLORS) so they track
 * the active light/dark theme — so adding or renaming a category needs no
 * front-end change. (Previously this list, and its 3 categories, were hard-coded.)
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME;

    ns.charts = ns.charts || {};

    // Palette indices into ns.COLORS, applied in category order. Keeps the
    // original AMRC / cooperation / global hues (0 / 7 / 5) and gives further
    // categories distinct ones; wraps if there are more categories than entries.
    var PALETTE = [0, 3, 7, 5, 2, 8, 1, 6];

    var esc = ns.escapeHtml;

    ns.charts.buildClusterMap = function (el, data, siteBase) {
        // Accept the data-driven { categories, points } shape; tolerate a bare
        // points array for safety.
        var categories = (data && data.categories) || [];
        var points = (data && data.points) || (Array.isArray(data) ? data : []);
        if (!points.length || typeof maplibregl === 'undefined') return null;

        // Derive category order/labels from the data. If categories weren't
        // supplied, fall back to the distinct keys present in the points.
        if (!categories.length) {
            var seen = {};
            points.forEach(function (p) {
                if (p.category != null && !seen[p.category]) {
                    seen[p.category] = true;
                    categories.push({ key: p.category, label: String(p.category) });
                }
            });
        }
        var order = categories.map(function (c) { return c.key; });
        var labelFor = {}, colorFor = {};
        categories.forEach(function (c, i) {
            labelFor[c.key] = c.label;
            colorFor[c.key] = ns.COLORS[PALETTE[i % PALETTE.length] % ns.COLORS.length] || ns.COLORS[0];
        });
        var emphasised = order[0]; // the first category (AMRCs) reads larger

        el.style.borderRadius = '6px';
        el.style.position = 'relative';

        // Visibility persists across the map rebuilds a light/dark toggle triggers.
        var visible = {};
        order.forEach(function (k) { visible[k] = true; });

        // Wrapped so the theme engine can rebuild the map (new basemap + marker
        // colours) on a live light/dark toggle — see dashboard-core ns.refresh().
        function create() {
            // The legend renders BELOW the map (in the panel). Drop a stale one
            // from a previous (pre-rebuild) render before building the new map.
            var panel = el.closest('.chart-panel') || el.parentNode || el;
            var staleLegend = panel.querySelector('.rv-cluster-legend');
            if (staleLegend) staleLegend.remove();

            var map = ns.initMap(el, { center: [12, 8], zoom: 1.3 });

            var markers = [];

            function clearMarkers() {
                markers.forEach(function (m) { m.remove(); });
                markers = [];
            }

            function renderMarkers(fit) {
                clearMarkers();
                points.forEach(function (p) {
                    if (!visible[p.category]) return;
                    // The cluster's own centres (first category) stand out among
                    // the partner dots.
                    var size = p.category === emphasised ? 18 : 13;
                    var dot = document.createElement('div');
                    dot.className = 'rv-cluster-marker';
                    dot.style.width = size + 'px';
                    dot.style.height = size + 'px';
                    dot.style.backgroundColor = colorFor[p.category] || ns.COLORS[0];
                    dot.style.borderColor = THEME.border;

                    var marker = new maplibregl.Marker({ element: dot })
                        .setLngLat([p.longitude, p.latitude]);
                    var title = (siteBase && p.itemId)
                        ? '<a href="' + esc(siteBase) + '/item/' + encodeURIComponent(p.itemId) + '">' + esc(p.label) + '</a>'
                        : esc(p.label);
                    var html = '<div class="rv-popup-content"><strong>' + title + '</strong>'
                        + (p.sublabel ? '<div class="rv-popup-sub">' + esc(p.sublabel) + '</div>' : '')
                        + '</div>';
                    marker.setPopup(new maplibregl.Popup({
                        offset: 14, closeButton: false, maxWidth: '280px', className: 'rv-map-popup'
                    }).setHTML(html));
                    marker.addTo(map);
                    markers.push(marker);
                });
                if (fit) fitToVisible();
            }

            function fitToVisible() {
                var pts = points.filter(function (p) { return visible[p.category]; });
                if (!pts.length) return;
                var bounds = new maplibregl.LngLatBounds();
                pts.forEach(function (p) { bounds.extend([p.longitude, p.latitude]); });
                if (!bounds.isEmpty()) {
                    map.fitBounds(bounds, { padding: 48, maxZoom: 4, duration: 0 });
                }
            }

            // Markers are HTML overlays, so — unlike GeoJSON sources/layers — they
            // do NOT need the style to have loaded, so the partner pins still show
            // even if the basemap tiles are slow or unreachable.
            renderMarkers(true);

            // Legend with per-category toggles. Toggling re-renders the marker set
            // but leaves the camera put (no re-fit), matching the amira overview.
            var legend = document.createElement('div');
            legend.className = 'rv-cluster-legend';
            order.forEach(function (k) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'rv-cluster-legend__item';
                btn.setAttribute('aria-pressed', String(visible[k]));
                if (!visible[k]) btn.classList.add('is-off');
                btn.innerHTML = '<span class="rv-cluster-legend__dot" style="background:' + colorFor[k] + '"></span>'
                    + '<span class="rv-cluster-legend__label">' + esc(labelFor[k] || k) + '</span>';
                btn.addEventListener('click', function () {
                    visible[k] = !visible[k];
                    btn.classList.toggle('is-off', !visible[k]);
                    btn.setAttribute('aria-pressed', String(visible[k]));
                    renderMarkers(false);
                });
                legend.appendChild(btn);
            });
            panel.appendChild(legend);

            ns.trackMap(map, create);
            return { resize: function () { map.resize(); } };
        }
        return create();
    };
})();
;

/* ---- js/dashboard-charts-affiliation-map.js ---- */
/**
 * Affiliation map: a person's affiliated organisations (institutions) that carry
 * coordinates, as markers on a MapLibre map. Hidden by the orchestrator when the
 * `affiliationMap` data key is absent (no affiliation is geocoded).
 *
 * Data format: [{ name, lat, lon, itemId }]
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME;
    var esc = ns.escapeHtml;

    ns.charts = ns.charts || {};

    ns.charts.buildAffiliationMap = function (el, data, siteBase) {
        if (!data || !data.length || typeof maplibregl === 'undefined') return null;

        el.style.borderRadius = '6px';

        // Wrapped so the theme engine can rebuild the map (new basemap + marker
        // colours) on a live light/dark toggle — see dashboard-core ns.refresh().
        function create() {
            // globe: false — a handful of affiliation pins reads better flat.
            var map = ns.initMap(el, { center: [data[0].lon, data[0].lat], zoom: 3, globe: false });

            map.on('load', function () {
                data.forEach(function (org) {
                    var html = '<strong>' + esc(org.name || '') + '</strong><br/>'
                        + '<span style="color:' + THEME.accent + '">Affiliation</span>';
                    // Project affiliation maps carry the affiliated members; the
                    // per-person map omits this field, so the block is skipped there.
                    if (org.members && org.members.length) {
                        html += '<br/><span style="font-size:12px;color:var(--muted,#666)">'
                            + (org.members.length === 1 ? 'Member: ' : 'Members: ')
                            + esc(org.members.join(', ')) + '</span>';
                    }
                    if (siteBase && org.itemId) {
                        html += '<br/><a href="' + siteBase + '/item/' + org.itemId + '" style="font-size:12px">View organisation →</a>';
                    }
                    new maplibregl.Marker({ color: THEME.accent })
                        .setLngLat([org.lon, org.lat])
                        .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(html))
                        .addTo(map);
                });

                if (data.length > 1) {
                    var bounds = new maplibregl.LngLatBounds();
                    data.forEach(function (org) { bounds.extend([org.lon, org.lat]); });
                    map.fitBounds(bounds, { padding: 50, maxZoom: 8 });
                } else {
                    map.setCenter([data[0].lon, data[0].lat]);
                    map.setZoom(5);
                }
            });

            ns.trackMap(map, create);
            return { resize: function () { map.resize(); } };
        }
        return create();
    };
})();
;

/* ---- js/dashboard-collab-network.js ---- */
/**
 * Institution collaboration network chart (force-directed graph).
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var initChart = ns.initChart, truncateLabel = ns.truncateLabel;

    ns.charts = ns.charts || {};

    ns.charts.buildCollabNetwork = function (el, data, siteBase) {
        if (!data || !data.nodes || !data.links || data.links.length < 1) return;
        var chart = initChart(el);
        // Decal patterns exist to separate FILLED AREAS without relying on colour.
        // On a node-link graph they land on small circles and read as noise, so this
        // chart opts out of the global toggle (as chord/sankey/radar already do).
        chart._noDecal = true;
        var n = data.nodes.length;

        chart.setOption({
            tooltip: {
                confine: true,
                formatter: function (p) {
                    if (p.dataType === 'node') {
                        return '<strong>' + echarts.format.encodeHTML(p.name) + '</strong><br/>'
                            + p.data.value + (p.data.isSelf ? ' total items' : ' shared items');
                    }
                    if (p.dataType === 'edge') {
                        return echarts.format.encodeHTML(p.data.source) + ' \u2194 '
                            + echarts.format.encodeHTML(p.data.target) + ': ' + p.data.value + ' shared items';
                    }
                    return '';
                }
            },
            aria: { enabled: true },
            series: [{
                type: 'graph', layout: 'force',
                scaleLimit: { min: 0.3, max: 5 },
                data: data.nodes.map(function (nd, i) {
                    var isSelf = !!nd.isSelf;
                    var size = isSelf ? 45 : Math.max(12, Math.min(35, nd.value * 3));
                    return {
                        name: nd.name, symbolSize: size, value: nd.value,
                        isSelf: isSelf, itemId: nd.itemId,
                        itemStyle: isSelf
                            ? { color: THEME.accent, borderColor: THEME.text, borderWidth: 3 }
                            : { color: COLORS[(i - 1) % COLORS.length], borderWidth: 1 },
                        label: {
                            show: isSelf || n <= 10,
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
                        lineStyle: { width: Math.max(1, Math.min(6, l.value)), curveness: 0.15, opacity: 0.5 }
                    };
                }),
                force: {
                    repulsion: n > 15 ? 400 : 250,
                    gravity: n > 15 ? 0.06 : 0.1,
                    edgeLength: [60, 200],
                    friction: 0.85,
                    layoutAnimation: !ns.prefersReducedMotion()
                },
                roam: true, draggable: true,
                emphasis: { focus: 'adjacency', lineStyle: { width: 4, opacity: 0.9 } },
                blur: { itemStyle: { opacity: 0.15 }, lineStyle: { opacity: 0.08 } }
            }]
        });

        chart.on('click', function (p) {
            if (p.dataType === 'node' && p.data.itemId && siteBase) window.location.href = siteBase + '/item/' + p.data.itemId;
        });
        return chart;
    };
})();
;

/* ---- js/dashboard-charts-contributor-network.js ---- */
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

        chart.setOption({
            tooltip: {
                confine: true,
                formatter: tooltipFormatter || function (p) {
                    if (p.dataType === 'node') {
                        return '<strong>' + echarts.format.encodeHTML(p.name) + '</strong>'
                            + '<br/>' + p.data.value + ' items'
                            + (p.data.category ? '<br/><em>' + p.data.category + '</em>' : '');
                    }
                    if (p.dataType === 'edge') {
                        return echarts.format.encodeHTML(p.data.source) + ' \u2194 '
                            + echarts.format.encodeHTML(p.data.target)
                            + ': ' + p.data.value + ' items';
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
            series: [{
                type: 'graph', layout: 'force',
                categories: cats,
                scaleLimit: { min: 0.3, max: 5 },
                data: data.nodes.map(function (nd, i) {
                    var isSelf = !!nd.isSelf;
                    var catIdx = (data.categories || []).indexOf(nd.category);
                    var catColor = categoryColor(nd.category);
                    var size = isSelf ? 45 : Math.max(10, Math.min(35, nd.value * 2.5));
                    return {
                        name: nd.name, symbolSize: size, value: nd.value,
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
                force: {
                    repulsion: n > 20 ? 500 : 300,
                    gravity: n > 20 ? 0.05 : 0.08,
                    edgeLength: [50, 180],
                    friction: 0.85,
                    layoutAnimation: !ns.prefersReducedMotion()
                },
                roam: true, draggable: true,
                emphasis: { focus: 'adjacency', lineStyle: { width: 4, opacity: 0.9 } },
                blur: { itemStyle: { opacity: 0.15 }, lineStyle: { opacity: 0.08 } }
            }]
        });

        chart.on('click', function (p) {
            if (p.dataType === 'node' && p.data.itemId && siteBase) {
                window.location.href = siteBase + '/item/' + p.data.itemId;
            }
        });
        return chart;
    }

    /** Contributor network: person → project. */
    ns.charts.buildContributorNetwork = function (el, data, siteBase) {
        return buildBipartiteNetwork(el, data, siteBase, function (p) {
            if (p.dataType === 'node') {
                var role = p.data.category === 0 ? 'contributor' : 'project';
                return '<strong>' + echarts.format.encodeHTML(p.name) + '</strong>'
                    + '<br/>' + p.data.value + ' items'
                    + '<br/><em>' + role + '</em>';
            }
            if (p.dataType === 'edge') {
                return echarts.format.encodeHTML(p.data.source) + ' \u2192 '
                    + echarts.format.encodeHTML(p.data.target)
                    + ': ' + p.data.value + ' contributions';
            }
            return '';
        });
    };

    /** Affiliation network: person → institution. */
    ns.charts.buildAffiliationNetwork = function (el, data, siteBase) {
        return buildBipartiteNetwork(el, data, siteBase, function (p) {
            if (p.dataType === 'node') {
                var type = p.data.isSelf ? 'this institution' :
                    (p.data.category === 0 ? 'person' : 'institution');
                return '<strong>' + echarts.format.encodeHTML(p.name) + '</strong>'
                    + '<br/>' + p.data.value + ' affiliations'
                    + '<br/><em>' + type + '</em>';
            }
            if (p.dataType === 'edge') {
                return echarts.format.encodeHTML(p.data.source) + ' \u2194 '
                    + echarts.format.encodeHTML(p.data.target);
            }
            return '';
        });
    };
})();
;

/* ---- js/dashboard-charts-stacked-area.js ---- */
/**
 * Stacked area chart builders: subject trends and language timeline.
 *
 * Both use the same stacked area pattern with different data dimensions.
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var initChart = ns.initChart;
    var buildDataZoom = ns.buildDataZoom;

    ns.charts = ns.charts || {};

    /**
     * Shared stacked area builder.
     * Data format: { years: string[], series: [{ name, data: number[] }] }
     */
    function buildStackedArea(el, data, stackKey) {
        if (!data || !data.years || !data.series || data.years.length < 2) return;
        var chart = initChart(el);
        var hasZoom = data.years.length > 15;
        var bottomMargin = hasZoom ? 90 : 50;

        chart.setOption({
            tooltip: {
                trigger: 'axis',
                confine: true,
                axisPointer: { type: 'cross' }
            },
            aria: { enabled: true },
            legend: {
                type: 'scroll',
                bottom: hasZoom ? 35 : 5,
                textStyle: { fontSize: THEME.fontSize }
            },
            grid: { left: 50, right: 30, top: 20, bottom: bottomMargin },
            xAxis: {
                type: 'category',
                data: data.years,
                boundaryGap: false,
                axisLabel: { fontSize: THEME.fontSize }
            },
            yAxis: {
                type: 'value',
                axisLabel: { fontSize: THEME.fontSize }
            },
            dataZoom: buildDataZoom(data.years.length),
            series: data.series.map(function (s, i) {
                return {
                    name: s.name,
                    type: 'line',
                    stack: stackKey,
                    areaStyle: { opacity: 0.4 },
                    emphasis: { focus: 'series' },
                    symbol: 'circle',
                    symbolSize: 4,
                    lineStyle: { width: 2 },
                    itemStyle: { color: COLORS[i % COLORS.length] },
                    data: s.data
                };
            })
        });

        return chart;
    }

    /** Subject Temporal Trends — top subjects by year. */
    ns.charts.buildSubjectTrends = function (el, data) {
        return buildStackedArea(el, data, 'subjects');
    };

    /** Language × Time — language distribution by year. */
    ns.charts.buildLanguageTimeline = function (el, data) {
        return buildStackedArea(el, data, 'languages');
    };
})();
;

/* ---- js/dashboard-charts-treemap.js ---- */
/**
 * Treemap chart builder: hierarchical space-filling visualization.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 *
 * Data format: [{ name, value, children: [{ name, value }] }]
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME;
    var initChart = ns.initChart, truncateLabel = ns.truncateLabel;

    ns.charts = ns.charts || {};

    ns.charts.buildTreemap = function (el, data) {
        if (!data || !data.length) return;
        var chart = initChart(el);

        chart.setOption({
            tooltip: {
                confine: true,
                formatter: function (p) {
                    var path = p.treePathInfo.map(function (n) {
                        return echarts.format.encodeHTML(n.name || '');
                    }).filter(Boolean);
                    return path.join(' \u203a ') + '<br/>' + Number(p.value || 0) + ' items';
                }
            },
            aria: { enabled: true },
            series: [{
                type: 'treemap',
                data: data,
                roam: false,
                nodeClick: false,
                breadcrumb: {
                    show: true,
                    bottom: 5,
                    itemStyle: { textStyle: { fontSize: THEME.fontSize } }
                },
                label: {
                    show: true,
                    fontSize: THEME.fontSize,
                    formatter: function (p) { return truncateLabel(p.name, 20); }
                },
                upperLabel: {
                    show: true,
                    height: 22,
                    fontSize: THEME.fontSize,
                    color: THEME.border,
                    formatter: function (p) { return truncateLabel(p.name, 30); }
                },
                // borderColor (cell gaps) comes from the theme (= --surface).
                itemStyle: {
                    borderWidth: 2,
                    gapWidth: 1
                },
                levels: [
                    {
                        itemStyle: { borderWidth: 3, gapWidth: 3 },
                        upperLabel: { show: true }
                    },
                    {
                        itemStyle: { borderWidth: 1, gapWidth: 1 },
                        colorSaturation: [0.35, 0.6]
                    }
                ]
            }]
        });

        return chart;
    };
})();
;

/* ---- js/dashboard-charts-choropleth.js ---- */
/**
 * Choropleth map builder: country-level item counts on Natural Earth 110m.
 *
 * Data: [{ country, count }] — joined against the GeoJSON ADMIN/NAME property
 * (lower-cased), matching the dashboard's ChoroplethMap so the two render the
 * same country set. MapLibre fill layer with a log-spaced step ramp derived
 * from the DRE --primary accent; theme-aware via ns.getBasemapStyle +
 * ns.trackMap (rebuilds on light/dark toggle). The shared countries.geojson is
 * fetched once and cached on the namespace.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME;

    ns.charts = ns.charts || {};

    var NAME_PROPS = ['ADMIN', 'NAME', 'NAME_EN', 'NAME_LONG'];

    /** Fetch + cache the shared countries GeoJSON (promise reused across charts). */
    function loadCountries() {
        if (ns._countriesGeoJSON) return ns._countriesGeoJSON;
        ns._countriesGeoJSON = fetch(ns.moduleAsset('data/geo/countries.geojson'))
            .then(function (r) {
                if (!r.ok) throw new Error('countries.geojson ' + r.status);
                return r.json();
            });
        return ns._countriesGeoJSON;
    }

    /** Parse an 'rgb(r,g,b)' / 'rgba(...)' string to [r, g, b]. */
    function parseRGB(str) {
        var m = /(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(str || '');
        return m ? [+m[1], +m[2], +m[3]] : [34, 129, 123];
    }

    function mix(a, b, t) {
        return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ','
            + Math.round(a[1] + (b[1] - a[1]) * t) + ','
            + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
    }

    /** Five sequential stops (light tint → accent) + a neutral no-data fill. */
    function buildRamp() {
        var isDark = ns.isDark();
        var accent = parseRGB(THEME.accent);
        var base = parseRGB(ns.cssColor('--surface', isDark ? 'rgb(30,30,30)' : 'rgb(255,255,255)'));
        var ratios = [0.82, 0.62, 0.42, 0.22, 0]; // mix toward base; 0 = full accent
        return {
            stops: ratios.map(function (r) { return mix(accent, base, r); }),
            empty: ns.cssColor('--border-light', isDark ? 'rgb(42,42,42)' : 'rgb(235,235,235)')
        };
    }

    /** Log-spaced breakpoints (5) matching the ramp stops. */
    function buildBreaks(maxCount) {
        var log = Math.log(Math.max(maxCount, 1) + 1);
        return [0, 1, 2, 3, 4].map(function (i) {
            return Math.round(Math.exp(log * i / 4) - 1);
        });
    }

    /** Build a strictly-ascending MapLibre step expression for fill-color. */
    function fillExpression(ramp, breaks) {
        var t = [Math.max(1, breaks[0])];
        for (var i = 1; i < 5; i++) t[i] = Math.max(breaks[i], t[i - 1] + 1);
        return [
            'step', ['get', 'count'],
            ramp.empty,
            t[0], ramp.stops[0],
            t[1], ramp.stops[1],
            t[2], ramp.stops[2],
            t[3], ramp.stops[3],
            t[4], ramp.stops[4]
        ];
    }

    /** Walk Polygon / MultiPolygon rings to extend a LngLatBounds. */
    function extendBounds(bounds, geom) {
        if (!geom) return;
        if (geom.type === 'Polygon') {
            geom.coordinates.forEach(function (ring) {
                ring.forEach(function (c) { bounds.extend([c[0], c[1]]); });
            });
        } else if (geom.type === 'MultiPolygon') {
            geom.coordinates.forEach(function (poly) {
                poly.forEach(function (ring) {
                    ring.forEach(function (c) { bounds.extend([c[0], c[1]]); });
                });
            });
        }
    }

    ns.charts.buildChoropleth = function (el, data, siteBase) {
        if (!data || !data.length || typeof maplibregl === 'undefined') return null;
        el.style.borderRadius = '6px';

        // country (lower-cased) → count, and the running total for shares.
        var counts = {};
        var total = 0;
        data.forEach(function (d) {
            if (!d.country) return;
            var k = String(d.country).toLowerCase();
            counts[k] = (counts[k] || 0) + (d.count || 0);
            total += d.count || 0;
        });
        var maxCount = Math.max.apply(null, data.map(function (d) { return d.count || 0; }).concat(1));

        function lookupCount(props) {
            for (var i = 0; i < NAME_PROPS.length; i++) {
                var v = props[NAME_PROPS[i]];
                if (typeof v === 'string' && counts[v.toLowerCase()] !== undefined) {
                    return counts[v.toLowerCase()];
                }
            }
            return 0;
        }

        function countryName(props) {
            for (var i = 0; i < NAME_PROPS.length; i++) {
                if (typeof props[NAME_PROPS[i]] === 'string') return props[NAME_PROPS[i]];
            }
            return 'Unknown';
        }

        // Wrapped so the theme engine can rebuild the map on a light/dark toggle.
        function create() {
            var map = ns.initMap(el, { center: [10, 18], zoom: 1.3, nav: { showCompass: false } });

            map.on('load', function () {
                loadCountries().then(function (geo) {
                    if (!map || !map.getStyle) return;
                    var ramp = buildRamp();
                    var breaks = buildBreaks(maxCount);

                    // Inject a numeric `count` the fill expression reads against.
                    var merged = {
                        type: 'FeatureCollection',
                        features: geo.features.map(function (f) {
                            var props = f.properties || {};
                            var copy = {};
                            for (var k in props) copy[k] = props[k];
                            copy.count = lookupCount(props);
                            return { type: 'Feature', geometry: f.geometry, properties: copy };
                        })
                    };

                    map.addSource('countries', { type: 'geojson', data: merged });

                    map.addLayer({
                        id: 'country-fill', type: 'fill', source: 'countries',
                        paint: {
                            'fill-color': fillExpression(ramp, breaks),
                            'fill-outline-color': THEME.border,
                            'fill-opacity': 0.9
                        }
                    });
                    map.addLayer({
                        id: 'country-line', type: 'line', source: 'countries',
                        paint: { 'line-color': THEME.border, 'line-width': 0.5 }
                    });

                    // --- Hover popup (country, count, share) ---
                    var activePopup = null;
                    map.on('mousemove', 'country-fill', function (e) {
                        if (!e.features || !e.features.length) return;
                        var props = e.features[0].properties || {};
                        var count = Number(props.count || 0);
                        map.getCanvas().style.cursor = count > 0 ? 'pointer' : '';
                        var share = total > 0 ? (count / total * 100) : 0;
                        var html = '<div class="rv-popup-content"><strong>' + ns.escapeHtml(countryName(props)) + '</strong>'
                            + (count > 0
                                ? '<br/><span class="rv-popup-count">' + ns.formatNumber(count) + ' item' + (count === 1 ? '' : 's')
                                  + ' · ' + share.toFixed(1) + '%</span>'
                                : '<br/><em>No items</em>')
                            + '</div>';
                        if (!activePopup) {
                            activePopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: 'rv-map-popup' });
                        }
                        activePopup.setLngLat(e.lngLat).setHTML(html).addTo(map);
                    });
                    map.on('mouseleave', 'country-fill', function () {
                        map.getCanvas().style.cursor = '';
                        if (activePopup) { activePopup.remove(); activePopup = null; }
                    });

                    // --- Fit to countries that have data ---
                    var bounds = new maplibregl.LngLatBounds();
                    var any = false;
                    merged.features.forEach(function (f) {
                        if ((f.properties.count || 0) > 0) { extendBounds(bounds, f.geometry); any = true; }
                    });
                    if (any && !bounds.isEmpty()) {
                        map.fitBounds(bounds, { padding: 36, maxZoom: 5, duration: 0 });
                    }

                    // --- Legend (rendered below the map; see ns.mountMapLegend) ---
                    var swatches = ramp.stops.map(function (c) {
                        return '<span class="rv-map-legend-swatch" style="background:' + c + '"></span>';
                    }).join('');
                    ns.mountMapLegend(el,
                        '<div class="rv-map-legend-row"><span>1</span>' + swatches
                            + '<span>' + maxCount + '</span></div>'
                            + '<div class="rv-map-legend-caption">Items per country</div>',
                        'rv-choropleth-legend');
                }).catch(function (err) {
                    if (window.console) console.error('Choropleth load failed:', err);
                });
            });

            ns.trackMap(map, create);
            return { resize: function () { map.resize(); } };
        }
        return create();
    };
})();
;

/* ---- js/dashboard-charts-radar.js ---- */
/**
 * Radar chart builder: a normalised "breadth" profile for an entity.
 *
 * Data: { indicator: [{ name, max }], series: [{ value: [...], name? }] }
 * Supports one series (per-entity dashboards) or several overlaid (the Compare
 * view). Axes are pre-normalised in precompute against the per-type maxima.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var initChart = ns.initChart, truncateLabel = ns.truncateLabel;

    ns.charts = ns.charts || {};

    ns.charts.buildRadar = function (el, data, siteBase) {
        if (!data || !data.indicator || !data.indicator.length
            || !data.series || !data.series.length) return;

        var chart = initChart(el);
        chart._noDecal = true; // decal patterns aren't meaningful on a radar

        var multi = data.series.length > 1;

        chart.setOption({
            tooltip: { confine: true, trigger: 'item' },
            aria: { enabled: true },
            legend: multi ? {
                bottom: 0,
                data: data.series.map(function (s, i) { return s.name || ('Series ' + (i + 1)); }),
                textStyle: { color: THEME.text, fontSize: THEME.fontSize }
            } : undefined,
            radar: {
                center: ['50%', multi ? '52%' : '54%'],
                radius: '66%',
                indicator: data.indicator.map(function (ind) {
                    return { name: truncateLabel(ind.name, 16), max: ind.max || 1 };
                }),
                axisName: { color: THEME.textMuted, fontSize: THEME.fontSize },
                splitLine: { lineStyle: { color: THEME.gridLight } },
                splitArea: { areaStyle: { color: ['transparent'] } },
                axisLine: { lineStyle: { color: THEME.grid } }
            },
            series: [{
                type: 'radar',
                emphasis: { focus: 'series' },
                data: data.series.map(function (s, i) {
                    var color = COLORS[i % COLORS.length];
                    return {
                        value: s.value,
                        name: s.name || 'Profile',
                        symbolSize: 4,
                        lineStyle: { color: color, width: 2 },
                        itemStyle: { color: color },
                        areaStyle: { color: color, opacity: multi ? 0.12 : 0.2 }
                    };
                })
            }]
        });

        return chart;
    };
})();
;

/* ---- js/dashboard-charts-communities.js ---- */
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
                : (t('community', 'Community') + ' ' + (c.id + 1));
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
                        ? t('kgConnection', 'connection in view')
                        : t('kgConnections', 'connections in view'))) : null,
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
                        ? t('kgConnection', 'connection in view')
                        : t('kgConnections', 'connections in view'))));
                }
                var role = roleLabel(d);
                if (role) rows.push(el('span', 'rv-kg-tip-meta', role));
                rows.push(el('span', 'rv-kg-tip-meta', t('kgClickToFocus', 'Click to focus')));
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
                + ', ' + (node.deg || 0) + ' ' + t('kgConnections', 'connections in view')
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
                    t('value', 'Value'), t('community', 'Community')
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
;

/* ---- js/dashboard-charts-boxplot.js ---- */
/**
 * Box plot builder: distribution of items-per-project, one box per section.
 *
 * Data: [{ name, values: [int, …] }] — the builder computes the five-number
 * summary (min / Q1 / median / Q3 / max) from the raw values.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME;
    var initChart = ns.initChart, truncateLabel = ns.truncateLabel, cssColor = ns.cssColor;

    ns.charts = ns.charts || {};

    function quantile(sorted, q) {
        var pos = (sorted.length - 1) * q;
        var base = Math.floor(pos), rest = pos - base;
        if (sorted[base + 1] !== undefined) {
            return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
        }
        return sorted[base];
    }

    ns.charts.buildBoxplot = function (el, data, siteBase) {
        if (!data || !data.length) return;
        var chart = initChart(el);

        var names = [], boxes = [];
        data.forEach(function (d) {
            var vals = (d.values || []).slice().sort(function (a, b) { return a - b; });
            names.push(d.name);
            if (!vals.length) { boxes.push([0, 0, 0, 0, 0]); return; }
            boxes.push([
                vals[0],
                quantile(vals, 0.25),
                quantile(vals, 0.5),
                quantile(vals, 0.75),
                vals[vals.length - 1]
            ]);
        });

        function render() {
            chart.setOption({
                tooltip: { confine: true, trigger: 'item' },
                aria: { enabled: true },
                grid: { left: 55, right: 18, bottom: names.length > 4 ? 90 : 50, top: 18 },
                xAxis: {
                    type: 'category', data: names, boundaryGap: true,
                    axisLabel: {
                        color: THEME.textMuted, fontSize: THEME.fontSize, interval: 0,
                        rotate: names.length > 4 ? 30 : 0,
                        formatter: function (v) { return truncateLabel(v, 16); }
                    },
                    axisLine: { lineStyle: { color: THEME.grid } }
                },
                yAxis: {
                    type: 'value', name: 'Items / project', min: 0,
                    nameTextStyle: { color: THEME.textMuted, fontSize: THEME.fontSize },
                    axisLabel: { color: THEME.textMuted, fontSize: THEME.fontSize },
                    splitLine: { lineStyle: { color: THEME.gridLight } }
                },
                series: [{
                    type: 'boxplot', data: boxes,
                    itemStyle: {
                        color: cssColor('--primary-muted', '#b2dfdb'),
                        borderColor: cssColor('--primary', THEME.accent)
                    },
                    tooltip: {
                        formatter: function (p) {
                            var v = p.value;
                            return '<strong>' + echarts.format.encodeHTML(p.name) + '</strong>'
                                + '<br/>max ' + v[5] + '<br/>Q3 ' + v[4] + '<br/>median ' + v[3]
                                + '<br/>Q1 ' + v[2] + '<br/>min ' + v[1];
                        }
                    }
                }]
            });
        }

        render();
        chart._rvRebuild = render;
        return chart;
    };
})();
;

/* ---- js/dashboard-charts-time-chord.js ---- */
/**
 * Time-aware chord builder: subject co-occurrence, year by year.
 *
 * Data: { buckets: [{ year, nodes:[{name,value,itemId}], links:[{source,target,value}] }], years: [] }
 * Uses ECharts' native `timeline` component (slider + play/pause) with one
 * circular-graph chord option per year — the same series shape as buildChord.
 *
 * Registers into window.RV.charts for the dashboard orchestrator.
 */
(function () {
    'use strict';

    var ns = window.RV;
    var THEME = ns.THEME, COLORS = ns.COLORS;
    var initChart = ns.initChart, truncateLabel = ns.truncateLabel;

    ns.charts = ns.charts || {};

    ns.charts.buildTimeChord = function (el, data, siteBase) {
        if (!data || !data.buckets || data.buckets.length < 2) return;
        var chart = initChart(el);
        chart._noDecal = true;

        function chordOption(bucket) {
            return {
                series: [{
                    type: 'graph', layout: 'circular', circular: { rotateLabel: true },
                    roam: true,
                    label: {
                        show: true, position: 'right', fontSize: THEME.fontSize - 1,
                        formatter: function (p) { return truncateLabel(p.name, 18); }
                    },
                    emphasis: { focus: 'adjacency', lineStyle: { width: 4, opacity: 0.9 } },
                    data: bucket.nodes.map(function (n, i) {
                        return {
                            name: n.name,
                            symbolSize: Math.max(10, Math.min(40, n.value * 2)),
                            itemStyle: { color: COLORS[i % COLORS.length] },
                            itemId: n.itemId
                        };
                    }),
                    links: bucket.links.map(function (l) {
                        return {
                            source: l.source, target: l.target, value: l.value,
                            lineStyle: { width: Math.max(1, Math.min(6, l.value)), curveness: 0.3, opacity: 0.5 }
                        };
                    })
                }]
            };
        }

        function render() {
            chart.setOption({
                baseOption: {
                    timeline: {
                        axisType: 'category', data: data.years,
                        autoPlay: false, playInterval: 1600,
                        left: 30, right: 30, bottom: 0,
                        label: { color: THEME.textMuted, fontSize: THEME.fontSize },
                        controlStyle: { color: THEME.accent, borderColor: THEME.accent },
                        checkpointStyle: { color: THEME.accent, borderColor: THEME.accent },
                        lineStyle: { color: THEME.grid },
                        itemStyle: { color: THEME.gridLight }
                    },
                    tooltip: {
                        confine: true,
                        formatter: function (p) {
                            if (p.dataType === 'node') return '<strong>' + echarts.format.encodeHTML(p.name) + '</strong>';
                            if (p.dataType === 'edge') {
                                return echarts.format.encodeHTML(p.data.source) + ' ↔ '
                                    + echarts.format.encodeHTML(p.data.target) + ': ' + p.data.value;
                            }
                            return '';
                        }
                    },
                    aria: { enabled: true }
                },
                options: data.buckets.map(chordOption)
            });
        }

        render();
        chart._rvRebuild = render; // re-resolve theme colours on light/dark toggle

        chart.on('click', function (p) {
            if (p.dataType === 'node' && p.data.itemId && siteBase) {
                window.location.href = siteBase + '/item/' + p.data.itemId;
            }
        });
        return chart;
    };
})();
;

/* ---- js/dashboard-stat-cards.js ---- */
/**
 * Stat cards — a reusable summary-card component.
 *
 * Renders the amira-style "stat card" grid (icon + value + label + optional
 * subtitle) from a precomputed `stats` array. Any dashboard/overview can use it:
 * compute the counts the standard PHP precompute way (see
 * Aggregators::buildStatCards) and emit a `stats` array of
 * `{key, label, value, subtitle?}`; the orchestrator (dashboard.js) renders it
 * whenever a dashboard carries one. Dashboards without `stats` are unaffected.
 *
 * The `key` selects an icon: a canonical lucide icon if one is registered, else
 * a synonym from ALIAS, else a generic fallback — so a brand-new card key always
 * renders a badge. To give a new key its own glyph, add it to ICONS (or map it
 * in ALIAS to an existing one).
 *
 * THEMING — follows the DRE theme. Icons are inline lucide SVGs (lucide.dev, MIT
 * licence) stroked with `currentColor`, and every surface/colour comes from the
 * `--rv-*` aliases in dre-visualizations.css, so the cards follow the active
 * light / dark theme with zero JS.
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) return;

    // Canonical lucide icon inner markup, keyed by stat key (lucide.dev, MIT).
    // Drawn inside an SVG that sets fill:none / stroke:currentColor below.
    var ICONS = {
        researchItems: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
        projects: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
        people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
        organisations: '<path d="M10 12h4"/><path d="M10 8h4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>',
        locations: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
        languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
        subjectsTags: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
        resourceTypes: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
        publications: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
        podcasts: '<path d="M16.85 18.58a9 9 0 1 0-9.7 0"/><path d="M8 14a5 5 0 1 1 8 0"/><circle cx="12" cy="11" r="1"/><path d="M13 17a1 1 0 1 0-2 0l.5 4.5a.5.5 0 0 0 1 0Z"/>',
        youtube: '<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>',
        playlists: '<path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/><path d="m16 12 5 3-5 3v-6Z"/>',
        duration: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
        items: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
        countries: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
        venues: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
        publishers: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
        peerReviewed: '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76"/><path d="m9 12 2 2 4-4"/>',
        fullText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>'
    };
    ns.STAT_ICONS = ICONS;

    // Synonyms → a canonical key, so callers can use natural names on any
    // dashboard without duplicating SVG (e.g. a per-entity dashboard's
    // "Contributors" or the Publications block's "Authors").
    var ALIAS = {
        contributors: 'people',
        authors: 'people',
        coAuthors: 'people',
        groups: 'people',
        institutions: 'organisations',
        subjects: 'subjectsTags',
        tags: 'subjectsTags',
        types: 'resourceTypes',
        genres: 'resourceTypes',
        sections: 'projects',
        series: 'playlists',
        places: 'locations'
    };
    ns.STAT_ICON_ALIAS = ALIAS;

    // Generic fallback (lucide chart-column) for any unmapped key.
    var DEFAULT_ICON = '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>';

    function iconFor(key) {
        return ICONS[key] || ICONS[ALIAS[key]] || DEFAULT_ICON;
    }
    ns.statIconFor = iconFor;

    var SVG_OPEN = '<svg class="rv-stat-icon" xmlns="http://www.w3.org/2000/svg"'
        + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
        + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';

    var esc = ns.escapeHtml;

    // Group digits for legibility (3,975). Falls back to the raw value if it is
    // not a finite number (e.g. an unexpected string).
    function fmt(n) {
        var v = Number(n);
        if (!isFinite(v)) return esc(n);
        return ns.formatNumber ? ns.formatNumber(v) : String(v);
    }

    function cardHtml(s) {
        return '<div class="rv-stat-card">'
            + '<div class="rv-stat-body">'
            + '<p class="rv-stat-label">' + esc(s.label) + '</p>'
            + '<p class="rv-stat-value">' + fmt(s.value) + '</p>'
            + (s.subtitle ? '<p class="rv-stat-sub">' + esc(s.subtitle) + '</p>' : '')
            + '</div>'
            + '<span class="rv-stat-badge">' + SVG_OPEN + iconFor(s.key) + '</svg></span>'
            + '</div>';
    }

    /**
     * Build the stat-card grid HTML from a `stats` array of
     * `{key, label, value, subtitle?}`. Returns '' when there is nothing to show.
     */
    ns.renderStatCards = function (stats) {
        if (!Array.isArray(stats) || !stats.length) return '';
        return '<div class="rv-stat-cards">' + stats.map(cardHtml).join('') + '</div>';
    };
})();
;

/* ---- js/dashboard-registry.js ---- */
/**
 * Chart registry: maps data keys to builder functions, labels, and descriptions.
 *
 * Reads chart builders from window.RV.charts (populated by the chart modules).
 */
(function () {
    'use strict';

    var ns = window.RV;
    var c = ns.charts;

    ns.CHART_MAP = {
        'selfLocation':        c.buildMiniMap,
        'stackedTimeline':     c.buildStackedTimeline,
        'timeline':            c.buildTimeline,
        'gantt':               c.buildGantt,
        'beeswarm':            c.buildBeeswarm,
        'types':               c.buildPieChart,
        'heatmap':             c.buildHeatmap,
        'sankey':              c.buildSankey,
        'sunburst':            c.buildSunburst,
        'treemap':             c.buildTreemap,
        'locations':           c.buildMap,
        'choropleth':          c.buildChoropleth,
        'clusterPartners':     c.buildClusterMap,
        'sectionsBar':         c.buildBarChart,
        'sectionUniversity':   c.buildHeatmap,
        'radar':               c.buildRadar,
        'templates':           c.buildPieChart,
        'topVenues':           c.buildBarChart,
        'topAuthors':          c.buildBarChart,
        'funders':             c.buildBarChart,
        'playlists':           c.buildBarChart,
        'duration':            c.buildHistogram,
        'series':              c.buildBarChart,
        'transcriptWordcloud': c.buildWordCloud,
        'abstractWordcloud':   c.buildWordCloud,
        'coAuthorNetwork':     c.buildCommunities,
        'speakerNetwork':      c.buildCommunities,
        'boxplot':             c.buildBoxplot,
        'timeChord':           c.buildTimeChord,
        'languages':           c.buildBarChart,
        'subjects':            c.buildWordCloud,
        'subjectTrends':       c.buildSubjectTrends,
        'languageTimeline':    c.buildLanguageTimeline,
        'chord':               c.buildChord,
        'collabNetwork':       c.buildCollabNetwork,
        'contributorNetwork':  c.buildContributorNetwork,
        'affiliationNetwork':  c.buildAffiliationNetwork,
        'affiliationMap':      c.buildAffiliationMap,
        'roles':               c.buildBarChart,
        'genres':              c.buildBarChart,
        'topLanguages':        c.buildBarChart,
        'topResourceTypes':    c.buildBarChart,
        'topAudiences':        c.buildBarChart,
        'topPersons':          c.buildBarChart,
        'topInstitutions':     c.buildBarChart,
        'topGroups':           c.buildBarChart,
        'topSubjects':         c.buildBarChart,
        'topTags':             c.buildBarChart,
        'topProjects':         c.buildBarChart,
        'contributors':        c.buildBarChart,
        'coAuthors':           c.buildBarChart,
        'coSubjects':          c.buildBarChart,
        'projects':            c.buildBarChart
    };

    ns.CHART_LABELS = {
        'selfLocation':        'Location',
        'stackedTimeline':     'Items by Year and Type',
        'timeline':            'Timeline',
        'gantt':               'Project Timelines',
        'beeswarm':            'Projects by Year',
        'types':               'Resource Types',
        'heatmap':             'Resource Type \u00d7 Language',
        'languages':           'Languages',
        'subjects':            'Subjects & Tags',
        'subjectTrends':       'Subject Trends over Time',
        'languageTimeline':    'Languages over Time',
        'treemap':             'Project \u00d7 Type Breakdown',
        'chord':               'Subject Co-occurrence',
        'collabNetwork':       'Collaboration Network',
        'contributorNetwork':  'Contributor Network',
        'affiliationNetwork':  'Affiliation Network',
        'affiliationMap':      'Affiliation Locations',
        'roles':               'Contributor Roles',
        'genres':              'Genres',
        'topLanguages':        'Languages',
        'topResourceTypes':    'Resource Types',
        'topAudiences':        'Target Audiences',
        'topPersons':          'Top Persons',
        'topInstitutions':     'Top Institutions',
        'topGroups':           'Top Groups',
        'topSubjects':         'Top LCSH Subjects',
        'topTags':             'Top Tags',
        'topProjects':         'Top Projects',
        'contributors':        'Top Associated Persons',
        'sankey':              'Contributor \u2192 Project \u2192 Type',
        'sunburst':            'Type \u2192 Language \u2192 Subject',
        'locations':           'Geographic Origins & Current Locations',
        'choropleth':          'Items by Country',
        'clusterPartners':     'Africa Multiple Research Centres (AMRCs) and its partners',
        'sectionsBar':         'Research Sections',
        'sectionUniversity':   'Research Section × University',
        'radar':               'Profile',
        'templates':           'By Resource Template',
        'topVenues':           'Top Venues',
        'topAuthors':          'Top Authors',
        'funders':             'Funders',
        'playlists':           'Videos by Playlist',
        'duration':            'Episode Length',
        'series':              'Episodes by Series',
        'transcriptWordcloud': 'Transcript Word Cloud',
        'abstractWordcloud':   'Abstract Word Cloud',
        'coAuthorNetwork':     'Co-author Network',
        'speakerNetwork':      'Who Appears Together',
        'boxplot':             'Items per Project (distribution)',
        'timeChord':           'Subject Co-occurrence over Time',
        'coAuthors':           'Co-authors',
        'coSubjects':          'Co-occurring Subjects',
        'projects':            'Items per Project'
    };

    ns.CHART_DESCRIPTIONS = {
        'timeline':            'Number of research items collected per year.',
        'types':               'Distribution of items by resource type (audio, text, image, etc.).',
        'languages':           'Languages represented across all research items.',
        'subjects':            'Most frequent subjects and tags across all items (dcterms:subject covers both controlled LCSH subjects and free tags).',
        'selfLocation':        '',
        'stackedTimeline':     'Items per year, broken down by resource type.',
        'gantt':               'Duration of each project within this research section.',
        'beeswarm':            'Each dot is a project \u2014 position shows start year, size indicates number of research items.',
        'heatmap':             'Cross-tabulation showing item counts for each type-language combination.',
        'sankey':              'Flow from contributors through projects to resource types.',
        'sunburst':            'Hierarchical view: resource type, then language, then top subjects.',
        'treemap':             'Proportional view of items grouped by project and resource type.',
        'subjectTrends':       'How the top research subjects evolve over time.',
        'languageTimeline':    'How the language distribution of research items changes over years.',
        'locations':           'Geographic origins of research items and their current locations, with flow lines showing movement.',
        'choropleth':          'Number of items by country of origin.',
        'clusterPartners':     'Toggle categories in the legend.',
        'sectionsBar':         'Number of research projects in each thematic research section.',
        'sectionUniversity':   'Research items by research section and university.',
        'radar':               'Breadth profile across items, languages, subjects, people, types and year span, scaled to the largest of its kind.',
        'templates':           'Distribution of items by resource template (Article, Book, Research Item, etc.).',
        'topVenues':           'Journals and book series in which these publications most often appear.',
        'topAuthors':          'Authors credited on the most publications (matched persons and external names).',
        'funders':             'Funding bodies credited on these publications.',
        'playlists':           'Number of videos in each playlist on the channel.',
        'duration':            'Distribution of episode lengths, grouped into bands.',
        'series':              'Number of episodes in each podcast series.',
        'transcriptWordcloud': 'Most frequent words across the episode transcripts.',
        'abstractWordcloud':   'Most frequent words across the publication abstracts.',
        'coAuthorNetwork':     'Authors linked when they appear together on a publication, clustered into collaboration communities.',
        'speakerNetwork':      'People who feature on the same episode, clustered into groups.',
        'boxplot':             'Distribution of items-per-project across research sections (min/quartiles/median/max).',
        'timeChord':           'Subjects that co-occur, year by year — press play or drag the slider.',
        'chord':               'Subjects that frequently appear together across research items.',
        'collabNetwork':       'Institutions connected through shared research items.',
        'contributorNetwork':  'Persons linked to projects they contributed to.',
        'affiliationNetwork':  'Persons connected to the institutions they are affiliated with.',
        'affiliationMap':      'Affiliated institutions that have known coordinates.',
        'roles':               'Distribution of contributor roles (author, collector, photographer, etc.).',
        'genres':              'Most frequent genre classifications across research items.',
        'topLanguages':        'Languages ranked by number of associated research items.',
        'topResourceTypes':    'Resource types ranked by number of associated items.',
        'topAudiences':        'Target audiences ranked by number of associated items.',
        'topPersons':          'Persons ranked by number of associated research items.',
        'topInstitutions':     'Institutions ranked by number of associated research items.',
        'topGroups':           'Groups ranked by number of associated research items.',
        'topSubjects':         'LCSH subjects ranked by number of associated research items.',
        'topTags':             'Tags ranked by number of associated research items.',
        'topProjects':         'Research projects ranked by number of associated items.',
        'contributors':        'Persons most frequently associated with research items.',
        'coAuthors':           'Persons who most frequently appear alongside this person.',
        'coSubjects':          'Subjects that most frequently appear alongside this one.',
        'projects':            'Number of research items collected per project in this section.'
    };
})();
;
