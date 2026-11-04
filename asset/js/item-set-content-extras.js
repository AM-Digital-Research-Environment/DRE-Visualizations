/**
 * Photo Browsing "Words" and "Places" views: two more readings of a
 * collection's private full text, from the same offline export as the "By
 * content" map (tools/fulltext/fulltext_features.py), carrying counts only.
 *
 *   - Words: how often chosen words occur in each year's articles, per 10,000
 *     words, from word counts by year (asset/data/fulltext/<slug>-words.json,
 *     fetched when the view first opens). Only words found in enough articles
 *     to stay anonymous are counted.
 *   - Places: the countries the articles name, on a map shaded by the number
 *     of articles, for every decade or one; a country opens the list of its
 *     articles. From the per-article places in the inline ContentMap payload,
 *     so only public records count.
 *
 * ECharts (lazy, ns.ensureLibs) draws both; the Places outlines are the
 * module's Natural Earth countries, shared with the choropleth charts.
 * item-set-photo-views.js calls ns.buildContentWords / ns.buildContentPlaces
 * the first time each view opens.
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};
    var MAX_WORDS = 6;
    var SMOOTH_YEARS = 5;
    var PLACES_MAP = 'dre-countries';

    function helpers() { return ns.contentMapHelpers; }
    function node(tag, className, text) { return helpers().node(tag, className, text); }

    /** A view shell (intro + panel), appended to the stage at once. */
    function shell(slot, stage, className) {
        var view = node('div', 'photo-view ' + className);
        slot.el = view;
        slot.built = true;
        stage.appendChild(view);
        return view;
    }

    function failed(where, retry) {
        return function (error) {
            console.error('DreVisualizations content ' + where + ':', error);
            var message = ns.t('visualizationLoadError', 'The visualisation could not be loaded.');
            ns.announce(message);
            return ns.errorNotice(message, retry);
        };
    }

    /* ------------------------------------------------------------------ */
    /*  Words                                                              */
    /* ------------------------------------------------------------------ */

    // Words most readers would try first, kept when the counts have them.
    var DEFAULT_WORDS = ['mbira', 'guitar', 'church', 'jazz', 'women'];

    function parseWords(value) {
        var seen = {};
        return String(value || '').toLowerCase().split(/[,;]+/).map(function (word) {
            return word.trim().replace(/\s+/g, ' ');
        }).filter(function (word) {
            if (!word || seen[word]) return false;
            seen[word] = true;
            return true;
        }).slice(0, MAX_WORDS);
    }

    /** Occurrences per 10,000 words for each year, optionally averaged over SMOOTH_YEARS. */
    function series(counts, totals, years, smooth) {
        var raw = years.map(function () { return 0; });
        for (var i = 0; i < counts.length; i += 2) raw[counts[i]] = counts[i + 1];
        return years.map(function (year, k) {
            if (!smooth) return totals[k] ? raw[k] / totals[k] * 10000 : 0;
            var hits = 0;
            var words = 0;
            years.forEach(function (other, j) {
                if (Math.abs(other - year) <= (SMOOTH_YEARS - 1) / 2) {
                    hits += raw[j];
                    words += totals[j];
                }
            });
            return words ? hits / words * 10000 : 0;
        });
    }

    ns.buildContentWords = function (slot, url, stage) {
        var view = shell(slot, stage, 'photo-content-words');
        var intro = node('p', 'semantic-map-intro', ns.t('contentWordsIntro',
            'How often words occur in the articles of each year, per 10,000 words. Type up to six words, separated by commas, to compare them.'));
        var method = node('p', 'semantic-map-intro photo-content-method');
        var form = node('form', 'photo-content-words__form');
        var label = node('label', 'semantic-map-search__label', ns.t('contentWordsLabel', 'Words to compare'));
        var input = node('input', 'semantic-map-search__input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        label.appendChild(input);
        var submit = node('button', 'semantic-map-mode__button is-active', ns.t('contentWordsShow', 'Show'));
        submit.type = 'submit';
        var smoothLabel = node('label', 'photo-content-words__smooth');
        var smooth = node('input');
        smooth.type = 'checkbox';
        smooth.checked = true;
        smoothLabel.appendChild(smooth);
        smoothLabel.appendChild(document.createTextNode(' ' + ns.fill(ns.t('contentWordsSmooth', 'Average over {years} years'), { years: SMOOTH_YEARS })));
        form.appendChild(label);
        form.appendChild(submit);
        form.appendChild(smoothLabel);
        var missing = node('p', 'photo-content-words__missing');
        missing.setAttribute('aria-live', 'polite');
        var panel = node('section', 'chart-panel chart-panel-wide');
        var heading = node('h3', '', ns.t('contentWordsHeading', 'Words over time, per 10,000 words'));
        var chartEl = node('div', 'chart-container photo-content-words-chart');
        chartEl.setAttribute('role', 'img');
        panel.appendChild(heading);
        panel.appendChild(chartEl);
        ns.setChildren(view, [intro, method, form, missing, panel]);

        var data = null;
        var chart = null;
        var shown = [];

        function draw() {
            if (!data || !chart) return;
            var present = shown.filter(function (word) { return data.words[word]; });
            var absent = shown.filter(function (word) { return !data.words[word]; });
            missing.textContent = absent.length ? ns.fill(ns.t('contentWordsMissing',
                'Not counted: {words}. A word is counted only when it occurs in at least {min} articles.'), {
                words: absent.join(', '), min: ns.formatNumber(data.minArticles)
            }) : '';
            chartEl.setAttribute('aria-label', present.length ? ns.fill(ns.t('contentWordsAria',
                'Line chart of how often these words occur per 10,000 words, by year: {words}.'), { words: present.join(', ') })
                : ns.t('contentWordsNone', 'No word to show.'));
            chart.setOption({
                animation: !ns.prefersReducedMotion(),
                aria: { enabled: false },
                color: ns.COLORS,
                tooltip: {
                    trigger: 'axis',
                    confine: true,
                    valueFormatter: function (value) {
                        return new Intl.NumberFormat(ns.locale, { maximumFractionDigits: 2 }).format(value || 0);
                    }
                },
                legend: { bottom: 0, textStyle: { color: ns.THEME.text, fontFamily: ns.THEME.fontFamily } },
                grid: { left: 8, right: 24, top: 24, bottom: 40, containLabel: true },
                xAxis: { type: 'value', min: data.years[0], max: data.years[data.years.length - 1],
                    axisLabel: { formatter: function (value) { return String(value); }, color: ns.THEME.textMuted } },
                // The unit is in the panel heading: an axis name clips at this height.
                yAxis: { type: 'value', axisLabel: { color: ns.THEME.textMuted } },
                series: present.map(function (word) {
                    var values = series(data.words[word], data.totals, data.years, smooth.checked);
                    return {
                        name: word,
                        type: 'line',
                        showSymbol: false,
                        smooth: false,
                        data: data.years.map(function (year, k) { return [year, values[k]]; })
                    };
                })
            }, true);
        }

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            shown = parseWords(input.value);
            draw();
        });
        smooth.addEventListener('change', draw);
        ns.attachDataTable(panel, function () {
            if (!data) return [];
            var present = shown.filter(function (word) { return data.words[word]; });
            var columns = present.map(function (word) { return series(data.words[word], data.totals, data.years, false); });
            return [[ns.t('year', 'Year')].concat(present)].concat(data.years.map(function (year, k) {
                return [String(year)].concat(columns.map(function (values) { return Math.round(values[k] * 100) / 100; }));
            }));
        }, ns.t('contentWordsTitle', 'Words over time'));

        function load() {
            ns.setChildren(chartEl);
            Promise.all([
                ns.ensureLibs({ echarts: true }),
                fetch(url, { credentials: 'same-origin' }).then(function (response) {
                    if (!response.ok) throw new Error('words ' + response.status);
                    return response.json();
                })
            ]).then(function (values) {
                data = values[1];
                if (!data || data.schemaVersion !== 1 || !Array.isArray(data.years)) throw new Error('Unsupported word counts');
                method.textContent = ns.fill(ns.t('contentWordsMethod',
                    'Counted in the full texts of the {articles} articles on the map, from {first} to {last}. Only words found in at least {min} articles are counted, and the texts themselves stay private: the page receives only the counts. Years with few articles swing widely; the {years}-year average evens them out.'), {
                    articles: ns.formatNumber(data.articles), first: data.years[0], last: data.years[data.years.length - 1],
                    min: ns.formatNumber(data.minArticles), years: SMOOTH_YEARS
                });
                shown = DEFAULT_WORDS.filter(function (word) { return data.words[word]; });
                input.value = shown.join(', ');
                chart = ns.initChart(chartEl);
                chart._noDecal = true;
                chart._noDataTable = true;   // the year-by-word table below
                chart._rvRebuild = draw;
                slot._charts = [chart];
                draw();
            }).catch(function (error) {
                ns.setChildren(chartEl, [failed('words', load)(error)]);
            });
        }
        load();
    };

    /* ------------------------------------------------------------------ */
    /*  Places                                                             */
    /* ------------------------------------------------------------------ */

    /** The module's country outlines, fetched once and shared with the choropleth charts. */
    function countries() {
        if (!ns._countriesGeoJSON) {
            ns._countriesGeoJSON = fetch(ns.moduleAsset('data/geo/countries.geojson')).then(function (response) {
                if (!response.ok) throw new Error('countries.geojson ' + response.status);
                return response.json();
            });
        }
        return ns._countriesGeoJSON;
    }

    ns.buildContentPlaces = function (slot, photos, data, stage) {
        // ns.moduleAsset needs the Omeka base path, which no dashboard set on this page.
        if (!ns.basePath && stage.getAttribute('data-base-path')) ns.basePath = stage.getAttribute('data-base-path');
        var view = shell(slot, stage, 'photo-content-places');
        var byId = {};
        photos.forEach(function (photo) { byId[photo.id] = photo; });
        var records = [];   // {photo, decade, places: [[country, mentions]]}
        Object.keys(data.places || {}).forEach(function (id) {
            var photo = byId[id];
            if (photo) records.push({ photo: photo, decade: helpers().decadeOf(photo.year), places: data.places[id] });
        });
        var decades = {};
        records.forEach(function (record) { if (record.decade !== null) decades[record.decade] = true; });
        var decadeList = Object.keys(decades).map(Number).sort(function (a, b) { return a - b; });

        var intro = node('p', 'semantic-map-intro', ns.t('contentPlacesIntro',
            'The countries the articles write about: the darker a country, the more articles name it. Choose a decade to see how the journal’s attention moved, and select a country to list its articles.'));
        var method = node('p', 'semantic-map-intro photo-content-method', ns.fill(ns.t('contentPlacesMethod',
            'An article counts for a country when its full text names it at least {min} times, by its present name, a colonial name (Gold Coast, Nyasaland, Belgian Congo…), its adjective, or a few regions and cities such as Buganda or Zanzibar. The journal’s own addresses are left out, and a bare “Congo” counts for the Democratic Republic of the Congo. Africa and the African Americas only. Found by matching names, so expect a few mistakes; the texts themselves stay private.'),
            { min: data.placesMinMentions || 1 }));
        var toolbar = node('div', 'semantic-map-toolbar');
        var group = node('div', 'semantic-map-mode');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', ns.t('contentPlacesDecade', 'Decade'));
        toolbar.appendChild(group);
        var panel = node('section', 'chart-panel chart-panel-wide');
        var heading = node('h3', '', ns.t('contentPlacesTitle', 'Countries the articles write about'));
        var chartEl = node('div', 'chart-container semantic-map-chart photo-content-places-chart');
        chartEl.setAttribute('role', 'img');
        var status = node('p', 'semantic-map-status');
        var detail = node('div', 'photo-content-detail');
        detail.setAttribute('aria-live', 'polite');
        panel.appendChild(heading);
        panel.appendChild(chartEl);
        panel.appendChild(status);
        ns.setChildren(view, [intro, method, toolbar, panel, detail]);

        var decade = null;   // null = every decade
        var chart = null;
        var names = {};      // ADMIN -> display name (NAME_EN)
        var selected = null;

        function counted() {
            var counts = {};
            records.forEach(function (record) {
                if (decade !== null && record.decade !== decade) return;
                record.places.forEach(function (place) { counts[place[0]] = (counts[place[0]] || 0) + 1; });
            });
            return counts;
        }

        function nameOf(country) { return names[country] || country; }

        function renderDetail() {
            if (!selected) {
                ns.setChildren(detail, [node('p', 'photo-content-detail__hint', ns.t('contentPlacesHint',
                    'Select a country on the map, or in the table under it, to list the articles that write about it.'))]);
                return;
            }
            var rows = records.filter(function (record) {
                return (decade === null || record.decade === decade)
                    && record.places.some(function (place) { return place[0] === selected; });
            }).map(function (record) {
                var mentions = 0;
                record.places.forEach(function (place) { if (place[0] === selected) mentions = place[1]; });
                return { photo: record.photo, mentions: mentions };
            }).sort(function (a, b) { return b.mentions - a.mentions || (a.photo.year || 0) - (b.photo.year || 0); });
            var title = node('h4', 'photo-content-detail__heading', decade === null
                ? ns.fill(ns.t('contentPlacesArticles', 'Articles that write about {country}'), { country: nameOf(selected) })
                : ns.fill(ns.t('contentPlacesArticlesDecade', 'Articles of the {decade}s that write about {country}'), { country: nameOf(selected), decade: decade }));
            var list = node('ol', 'photo-content-detail__list');
            rows.forEach(function (row) {
                var li = node('li', '');
                var link = node('a', '', row.photo.title || ns.t('untitled', 'Untitled'));
                link.href = row.photo.url;
                li.appendChild(link);
                var meta = [helpers().metaLine(row.photo), ns.fill(ns.t('contentPlacesMentions', 'named {count} times'), { count: ns.formatNumber(row.mentions) })]
                    .filter(Boolean).join(' · ');
                li.appendChild(node('span', 'photo-content-detail__meta', meta));
                list.appendChild(li);
            });
            ns.setChildren(detail, rows.length ? [title, list]
                : [title, node('p', 'photo-content-detail__hint', ns.t('contentPlacesNoArticles', 'No article of this decade writes about it.'))]);
        }

        function select(country) {
            selected = country;
            renderDetail();
        }

        function draw() {
            var counts = counted();
            var countryCount = Object.keys(counts).length;
            var articleCount = records.filter(function (record) { return decade === null || record.decade === decade; }).length;
            status.textContent = ns.plural(articleCount, 'contentArticle', 'article', 'articles', true) + ' · '
                + ns.plural(countryCount, 'contentCountry', 'country', 'countries', true);
            chartEl.setAttribute('aria-label', ns.t('contentPlacesAria', 'Map of the countries the articles write about, shaded by the number of articles.'));
            renderDetail();
            if (!chart) return;
            var max = 1;
            Object.keys(counts).forEach(function (country) { max = Math.max(max, counts[country]); });
            chart.setOption({
                animation: !ns.prefersReducedMotion(),
                aria: { enabled: false },
                tooltip: {
                    trigger: 'item',
                    confine: true,
                    formatter: function (params) {
                        var count = counts[params.name] || 0;
                        return '<strong>' + echarts.format.encodeHTML(nameOf(params.name)) + '</strong><br>'
                            + echarts.format.encodeHTML(count ? ns.plural(count, 'contentArticle', 'article', 'articles', true)
                                : ns.t('contentPlacesNone', 'No article'));
                    }
                },
                visualMap: {
                    type: 'continuous', min: 0, max: max, left: 8, bottom: 8, calculable: false,
                    text: [ns.formatNumber(max), '0'], textStyle: { color: ns.THEME.textMuted },
                    inRange: { color: ns.accentRamp() }
                },
                series: [{
                    type: 'map',
                    map: PLACES_MAP,
                    nameProperty: 'ADMIN',
                    roam: true,
                    // Africa first, with the Atlantic and Brazil's coast in view.
                    center: [10, 2],
                    zoom: 2.4,
                    scaleLimit: { min: 1, max: 12 },
                    itemStyle: { areaColor: ns.cssColor('--border-light', '#eae8e3'), borderColor: ns.THEME.border, borderWidth: 0.5 },
                    emphasis: { label: { show: false }, itemStyle: { areaColor: ns.THEME.accentLight } },
                    select: { label: { show: false }, itemStyle: { areaColor: ns.THEME.accent } },
                    selectedMode: 'single',
                    data: Object.keys(counts).map(function (country) {
                        return { name: country, value: counts[country], selected: country === selected };
                    })
                }]
            }, true);
        }

        [null].concat(decadeList).forEach(function (value) {
            var button = node('button', 'semantic-map-mode__button' + (value === null ? ' is-active' : ''),
                value === null ? ns.t('contentPlacesAll', 'All') : ns.fill(ns.t('contentDecade', '{decade}s'), { decade: value }));
            button.type = 'button';
            button.setAttribute('aria-pressed', value === null ? 'true' : 'false');
            button.addEventListener('click', function () {
                group.querySelectorAll('button').forEach(function (candidate) {
                    candidate.classList.remove('is-active');
                    candidate.setAttribute('aria-pressed', 'false');
                });
                button.classList.add('is-active');
                button.setAttribute('aria-pressed', 'true');
                decade = value;
                draw();
            });
            group.appendChild(button);
        });

        // The text alternative: every country with its count, each a button
        // that lists its articles as the map does.
        var details = node('details', 'rv-data-table semantic-map-list');
        var summary = node('summary', 'rv-data-table-toggle', ns.t('contentPlacesList', 'Countries and their number of articles'));
        details.appendChild(summary);
        details.addEventListener('toggle', function () {
            if (!details.open) return;
            var counts = counted();
            var list = node('ul', 'semantic-map-list__items');
            Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || nameOf(a).localeCompare(nameOf(b), ns.locale); })
                .forEach(function (country) {
                    var li = node('li', '');
                    var button = node('button', 'photo-content-search__pick',
                        nameOf(country) + ' (' + ns.formatNumber(counts[country]) + ')');
                    button.type = 'button';
                    button.addEventListener('click', function () { select(country); draw(); });
                    li.appendChild(button);
                    list.appendChild(li);
                });
            var wrap = node('div', 'rv-data-table-scroll');
            wrap.tabIndex = 0;
            wrap.setAttribute('role', 'region');
            wrap.setAttribute('aria-label', summary.textContent);
            wrap.appendChild(list);
            ns.setChildren(details, [summary, wrap]);
        });
        panel.appendChild(details);
        draw();

        function load() {
            Promise.all([ns.ensureLibs({ echarts: true }), countries()]).then(function (values) {
                var geo = values[1];
                (geo.features || []).forEach(function (feature) {
                    var props = feature.properties || {};
                    if (props.ADMIN) names[props.ADMIN] = props.NAME_EN || props.ADMIN;
                });
                if (!echarts.getMap(PLACES_MAP)) echarts.registerMap(PLACES_MAP, geo);
                chart = ns.initChart(chartEl);
                chart._noDecal = true;
                chart._noDataTable = true;   // the country list below
                chart._zoomable = false;
                chart._rvRebuild = draw;
                chart.on('click', function (params) {
                    if (params.componentType === 'series' && params.name) select(params.name);
                });
                slot._charts = [chart];
                draw();
            }).catch(function (error) {
                ns.setChildren(chartEl, [failed('places', load)(error)]);
            });
        }
        load();
    };
})();
