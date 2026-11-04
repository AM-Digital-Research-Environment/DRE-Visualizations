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
 * ECharts (lazy, ns.ensureLibs) draws the Words chart. Places is a MapLibre
 * map built like every other country map of the module: ns.initMap on the
 * self-hosted basemap, shaded through ns.countryShading (core/maps.js).
 * item-set-photo-views.js calls ns.buildContentWords / ns.buildContentPlaces
 * the first time each view opens.
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};
    var MAX_WORDS = 6;
    var SMOOTH_YEARS = 5;

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

    /** A unique element id, for the label, combobox and listbox wiring. */
    var idCount = 0;
    function nextId(prefix) {
        idCount += 1;
        return 'rv-' + prefix + '-' + idCount;
    }

    /* ------------------------------------------------------------------ */
    /*  Words                                                              */
    /* ------------------------------------------------------------------ */

    // Words most readers would try first, kept when the counts have them.
    var DEFAULT_WORDS = ['mbira', 'guitar', 'church', 'jazz', 'women'];
    var SHOWN_SUGGESTIONS = 16;
    var MAX_OPTIONS = 8;

    /** The words typed or pasted, split on commas, semicolons and spaces: the counts hold single words. */
    function splitWords(value) {
        return String(value || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
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

    /**
     * The words to compare are chips in one field, each in its line's colour,
     * so the field doubles as the chart's legend. Typing offers the counted
     * words that start with the text, most frequent first (an ARIA combobox);
     * Enter or a comma adds, Backspace in the empty field removes the last
     * chip. Under the field, the collection's most frequent words (the
     * export's `suggested`, function words left out) add with one click.
     */
    ns.buildContentWords = function (slot, url, stage) {
        var view = shell(slot, stage, 'photo-content-words');
        var intro = node('p', 'semantic-map-intro', ns.t('contentWordsIntro',
            'How often words occur in the articles of each year, per 10,000 words. Compare up to six: type a word and press Enter, or add one of the frequent words.'));
        var method = node('p', 'semantic-map-intro photo-content-method');

        var inputId = nextId('words-input');
        var listId = nextId('words-options');
        var suggestId = nextId('words-suggest');
        var picker = node('div', 'photo-content-words__picker');
        var head = node('div', 'photo-content-words__head');
        var label = node('label', 'photo-content-words__label', ns.t('contentWordsLabel', 'Words to compare'));
        label.htmlFor = inputId;
        var smoothLabel = node('label', 'photo-content-words__smooth');
        var smooth = node('input');
        smooth.type = 'checkbox';
        smooth.checked = true;
        smoothLabel.appendChild(smooth);
        smoothLabel.appendChild(document.createTextNode(ns.fill(ns.t('contentWordsSmooth', 'Average over {years} years'), { years: SMOOTH_YEARS })));
        head.appendChild(label);
        head.appendChild(smoothLabel);

        var field = node('div', 'photo-content-words__field');
        var chips = node('ul', 'photo-content-words__chips');
        var input = node('input', 'photo-content-words__input');
        input.id = inputId;
        input.type = 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('autocapitalize', 'none');
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-controls', listId);
        field.appendChild(chips);
        field.appendChild(input);
        var options = node('ul', 'photo-content-words__options');
        options.id = listId;
        options.setAttribute('role', 'listbox');
        options.setAttribute('aria-label', ns.t('contentWordsOptions', 'Counted words'));
        options.hidden = true;
        var missing = node('p', 'photo-content-words__missing');
        missing.setAttribute('aria-live', 'polite');
        picker.appendChild(head);
        picker.appendChild(field);
        picker.appendChild(options);
        picker.appendChild(missing);

        var suggest = node('div', 'photo-content-words__suggest');
        var suggestLabel = node('span', 'photo-content-words__suggest-label', ns.t('contentWordsFrequent', 'Frequent words'));
        suggestLabel.id = suggestId;
        var suggestList = node('div', 'photo-content-words__suggestions');
        suggestList.setAttribute('role', 'group');
        suggestList.setAttribute('aria-labelledby', suggestId);
        suggest.appendChild(suggestLabel);
        suggest.appendChild(suggestList);
        suggest.hidden = true;

        var panel = node('section', 'chart-panel chart-panel-wide');
        var heading = node('h3', '', ns.t('contentWordsHeading', 'Words over time, per 10,000 words'));
        var chartEl = node('div', 'chart-container photo-content-words-chart');
        chartEl.setAttribute('role', 'img');
        panel.appendChild(heading);
        panel.appendChild(chartEl);
        ns.setChildren(view, [intro, method, picker, suggest, panel]);

        var data = null;
        var chart = null;
        var ranked = [];     // [word, occurrences], most frequent first
        var shown = [];
        var slots = {};      // word -> its palette index, kept while it is shown
        var active = -1;     // the highlighted option

        // The field looks like one input: a click on its padding focuses it.
        field.addEventListener('click', function (event) {
            if (event.target === field || event.target === chips) input.focus();
        });

        function colourOf(word) {
            return ns.COLORS[slots[word] % ns.COLORS.length];
        }

        function placeholder() {
            input.placeholder = shown.length >= MAX_WORDS
                ? ns.t('contentWordsFull', 'Six words at most: remove one to add another.')
                : (shown.length ? ns.t('contentWordsMore', 'Add a word…') : ns.t('contentWordsType', 'Type a word…'));
        }

        function renderChips() {
            ns.setChildren(chips, shown.map(function (word) {
                var chip = node('li', 'photo-content-words__chip');
                var swatch = node('span', 'photo-content-words__swatch');
                swatch.style.background = colourOf(word);
                chip.appendChild(swatch);
                chip.appendChild(node('span', 'photo-content-words__word', word));
                var remove = node('button', 'photo-content-words__remove');
                remove.type = 'button';
                remove.setAttribute('aria-label', ns.fill(ns.t('contentWordsRemove', 'Remove {word}'), { word: word }));
                remove.title = remove.getAttribute('aria-label');
                remove.appendChild(ns.iconSvg(ns.ICONS.close, 12));
                remove.addEventListener('click', function () {
                    removeWord(word);
                    input.focus();
                });
                chip.appendChild(remove);
                return chip;
            }));
            placeholder();
        }

        function renderSuggestions() {
            var words = (data && Array.isArray(data.suggested) ? data.suggested : []).filter(function (word) {
                return data.words[word] && shown.indexOf(word) === -1;
            }).slice(0, SHOWN_SUGGESTIONS);
            suggest.hidden = !words.length;
            var full = shown.length >= MAX_WORDS;
            ns.setChildren(suggestList, words.map(function (word) {
                var button = node('button', 'photo-content-words__suggestion');
                button.type = 'button';
                button.disabled = full;
                button.setAttribute('aria-label', ns.fill(ns.t('contentWordsAdd', 'Add {word}'), { word: word }));
                button.appendChild(ns.iconSvg(ns.ICONS.plus, 12));
                button.appendChild(node('span', '', word));
                button.addEventListener('click', function () {
                    addWords([word]);
                    // The button is gone: keep the keyboard in the group.
                    var next = suggestList.querySelector('button:not(:disabled)');
                    (next || input).focus();
                });
                return button;
            }));
        }

        function closeOptions() {
            options.hidden = true;
            active = -1;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
        }

        /** The counted words that start with the typed text, most frequent first. */
        function matches() {
            var query = input.value.trim().toLowerCase();
            if (!query || /[\s,;]/.test(query)) return [];
            var found = [];
            for (var i = 0; i < ranked.length && found.length < MAX_OPTIONS; i++) {
                if (ranked[i][0].lastIndexOf(query, 0) === 0 && shown.indexOf(ranked[i][0]) === -1) found.push(ranked[i]);
            }
            return found;
        }

        function renderOptions() {
            var found = data ? matches() : [];
            if (!found.length) {
                closeOptions();
                return;
            }
            active = Math.min(active, found.length - 1);
            ns.setChildren(options, found.map(function (entry, k) {
                var option = node('li', 'photo-content-words__option' + (k === active ? ' is-active' : ''));
                option.id = listId + '-' + k;
                option.setAttribute('role', 'option');
                option.setAttribute('aria-selected', k === active ? 'true' : 'false');
                option.setAttribute('data-word', entry[0]);
                option.setAttribute('aria-label', ns.fill(ns.t('contentWordsOption', '{word}, {count} occurrences'),
                    { word: entry[0], count: ns.formatNumber(entry[1]) }));
                option.appendChild(node('span', 'photo-content-words__option-word', entry[0]));
                option.appendChild(node('span', 'photo-content-words__option-count', ns.formatNumber(entry[1])));
                // mousedown, not click: the input keeps its focus.
                option.addEventListener('mousedown', function (event) {
                    event.preventDefault();
                    input.value = '';
                    addWords([entry[0]]);
                });
                return option;
            }));
            options.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            if (active >= 0) input.setAttribute('aria-activedescendant', listId + '-' + active);
            else input.removeAttribute('aria-activedescendant');
        }

        /** Add the words that are counted, and say which could not be added and why. */
        function addWords(words) {
            if (!data) return;
            var absent = [];
            var refused = false;
            words.forEach(function (word) {
                if (shown.indexOf(word) !== -1) return;
                if (!data.words[word]) {
                    if (absent.indexOf(word) === -1) absent.push(word);
                    return;
                }
                if (shown.length >= MAX_WORDS) {
                    refused = true;
                    return;
                }
                // The first colour no shown word has, so a line keeps its colour when another goes.
                var used = shown.map(function (other) { return slots[other]; });
                var free = 0;
                while (used.indexOf(free) !== -1) free++;
                slots[word] = free;
                shown.push(word);
            });
            var notes = [];
            if (absent.length) {
                notes.push(ns.fill(ns.t('contentWordsMissing',
                    'Not counted: {words}. A word is counted only when it occurs in at least {min} articles.'), {
                    words: absent.join(', '), min: ns.formatNumber(data.minArticles)
                }));
            }
            if (refused) notes.push(ns.t('contentWordsFull', 'Six words at most: remove one to add another.'));
            missing.textContent = notes.join(' ');
            closeOptions();
            update();
        }

        function removeWord(word) {
            shown = shown.filter(function (other) { return other !== word; });
            delete slots[word];
            missing.textContent = '';
            update();
        }

        function update() {
            renderChips();
            renderSuggestions();
            draw();
        }

        input.addEventListener('input', function () {
            // A pasted or typed list: add every word before the last separator.
            if (/[,;]/.test(input.value)) {
                var parts = input.value.split(/[,;]/);
                var rest = parts.pop();
                addWords(splitWords(parts.join(',')));
                input.value = rest.replace(/^\s+/, '');
            }
            active = -1;
            renderOptions();
        });

        input.addEventListener('keydown', function (event) {
            var open = !options.hidden;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                if (!open) renderOptions();
                var count = options.hidden ? 0 : options.children.length;
                if (!count) return;
                event.preventDefault();
                active = event.key === 'ArrowDown'
                    ? (active + 1) % count
                    : (active <= 0 ? count - 1 : active - 1);
                renderOptions();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                var pick = open && active >= 0 ? options.children[active].getAttribute('data-word') : null;
                var words = pick ? [pick] : splitWords(input.value);
                if (!words.length) return;
                input.value = '';
                addWords(words);
            } else if (event.key === 'Escape' && open) {
                // Close the list only; a second Escape reaches the fullscreen surface.
                event.preventDefault();
                event.stopPropagation();
                closeOptions();
            } else if (event.key === 'Backspace' && !input.value && shown.length) {
                removeWord(shown[shown.length - 1]);
            }
        });

        input.addEventListener('blur', closeOptions);

        function draw() {
            if (!data || !chart) return;
            chartEl.setAttribute('aria-label', shown.length ? ns.fill(ns.t('contentWordsAria',
                'Line chart of how often these words occur per 10,000 words, by year: {words}.'), { words: shown.join(', ') })
                : ns.t('contentWordsNone', 'No word to show.'));
            chart.setOption({
                animation: !ns.prefersReducedMotion(),
                aria: { enabled: false },
                tooltip: {
                    trigger: 'axis',
                    confine: true,
                    valueFormatter: function (value) {
                        return new Intl.NumberFormat(ns.locale, { maximumFractionDigits: 2 }).format(value || 0);
                    }
                },
                // Kept for the saved image, which the chips above do not reach.
                legend: { bottom: 0, textStyle: { color: ns.THEME.text, fontFamily: ns.THEME.fontFamily } },
                grid: { left: 8, right: 24, top: 24, bottom: 40, containLabel: true },
                xAxis: { type: 'value', min: data.years[0], max: data.years[data.years.length - 1],
                    axisLabel: { formatter: function (value) { return String(value); }, color: ns.THEME.textMuted } },
                // The unit is in the panel heading: an axis name clips at this height.
                yAxis: { type: 'value', axisLabel: { color: ns.THEME.textMuted } },
                series: shown.map(function (word) {
                    var values = series(data.words[word], data.totals, data.years, smooth.checked);
                    var colour = colourOf(word);
                    return {
                        name: word,
                        type: 'line',
                        showSymbol: false,
                        smooth: false,
                        itemStyle: { color: colour },
                        lineStyle: { color: colour },
                        data: data.years.map(function (year, k) { return [year, values[k]]; })
                    };
                })
            }, true);
        }

        smooth.addEventListener('change', draw);
        ns.attachDataTable(panel, function () {
            if (!data) return [];
            var columns = shown.map(function (word) { return series(data.words[word], data.totals, data.years, false); });
            return [[ns.t('year', 'Year')].concat(shown)].concat(data.years.map(function (year, k) {
                return [String(year)].concat(columns.map(function (values) { return Math.round(values[k] * 100) / 100; }));
            }));
        }, ns.t('contentWordsTitle', 'Words over time'));
        renderChips();

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
                ranked = Object.keys(data.words).map(function (word) {
                    var counts = data.words[word];
                    var total = 0;
                    for (var i = 1; i < counts.length; i += 2) total += counts[i];
                    return [word, total];
                }).sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
                chart = ns.initChart(chartEl);
                chart._noDecal = true;
                chart._noDataTable = true;   // the year-by-word table below
                // A light/dark switch rebuilds the palette: recolour the chips with the lines.
                chart._rvRebuild = function () { renderChips(); draw(); };
                slot._charts = [chart];
                addWords(DEFAULT_WORDS.filter(function (word) { return data.words[word]; }));
            }).catch(function (error) {
                ns.setChildren(chartEl, [failed('words', load)(error)]);
            });
        }
        load();
    };

    /* ------------------------------------------------------------------ */
    /*  Places                                                             */
    /* ------------------------------------------------------------------ */

    var PLACES_SOURCE = 'content-places';

    /**
     * The countries the articles write about, on the module's MapLibre
     * basemap with the shading every country map shares (ns.countryShading:
     * outlines, accent ramp, log-spaced breaks), so it reads as the
     * choropleth does. A decade repaints the same map without moving it, so
     * the eye can compare decades on one frame.
     */
    ns.buildContentPlaces = function (slot, photos, data, stage) {
        // ns.moduleAsset needs the Omeka base path, which no dashboard set on this page.
        if (!ns.basePath && stage.getAttribute('data-base-path')) ns.basePath = stage.getAttribute('data-base-path');
        var shading = ns.countryShading;
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
        var mapEl = node('div', 'chart-container photo-content-places-map');
        var status = node('p', 'semantic-map-status');
        var detail = node('div', 'photo-content-detail');
        detail.setAttribute('aria-live', 'polite');
        panel.appendChild(heading);
        panel.appendChild(mapEl);
        panel.appendChild(status);
        ns.setChildren(view, [intro, method, toolbar, panel, detail]);

        var decade = null;   // null = every decade
        var map = null;
        var geo = null;
        var names = {};      // ADMIN -> display name (NAME_EN)
        var selected = null;

        /** Articles per country (ADMIN name), for one decade or (null) all of them. */
        function counted(only) {
            var counts = {};
            records.forEach(function (record) {
                if (only !== null && record.decade !== only) return;
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

        /** The outlines with the decade's article count on each country, for the fill expression. */
        function collection(counts) {
            return {
                type: 'FeatureCollection',
                features: geo.features.map(function (feature) {
                    var props = feature.properties || {};
                    var copy = {};
                    for (var key in props) copy[key] = props[key];
                    copy.count = counts[props.ADMIN] || 0;
                    return { type: 'Feature', geometry: feature.geometry, properties: copy };
                })
            };
        }

        /** Repaint the map for the decade and the selection; the camera stays where it is. */
        function paint() {
            if (!map || !map.getSource(PLACES_SOURCE)) return;
            var counts = counted(decade);
            var max = 1;
            Object.keys(counts).forEach(function (country) { max = Math.max(max, counts[country]); });
            var ramp = shading.ramp();
            map.getSource(PLACES_SOURCE).setData(collection(counts));
            map.setPaintProperty('content-places-fill', 'fill-color', shading.fill(ramp, shading.breaks(max)));
            map.setFilter('content-places-selected', ['==', ['get', 'ADMIN'], selected || '']);
            var swatches = ramp.stops.map(function (colour) {
                return '<span class="rv-map-legend-swatch" style="background:' + ns.escapeHtml(colour) + '"></span>';
            }).join('');
            var legend = ns.mountMapLegend(mapEl,
                '<div class="rv-map-legend-row"><span>1</span>' + swatches + '<span>' + ns.escapeHtml(ns.formatNumber(max)) + '</span></div>'
                    + '<div class="rv-map-legend-caption">' + ns.escapeHtml(ns.t('contentPlacesLegend', 'Articles per country')) + '</div>',
                'rv-choropleth-legend');
            // Right under the map, above the status line and the country list.
            mapEl.insertAdjacentElement('afterend', legend);
        }

        function draw() {
            var counts = counted(decade);
            var articleCount = records.filter(function (record) { return decade === null || record.decade === decade; }).length;
            status.textContent = ns.plural(articleCount, 'contentArticle', 'article', 'articles', true) + ' · '
                + ns.plural(Object.keys(counts).length, 'contentCountry', 'country', 'countries', true);
            renderDetail();
            paint();
        }

        function select(country) {
            selected = country;
            draw();
        }

        /** Build the map; ns.trackMap calls this again to rebuild it on a light/dark switch. */
        function create() {
            map = ns.initMap(mapEl, { center: [10, 2], zoom: 2 });
            if (!map) return;
            var popup = null;
            var hovered = null;   // the popup's HTML is rebuilt only when this changes
            map.on('load', function () {
                map.addSource(PLACES_SOURCE, { type: 'geojson', data: collection(counted(decade)) });
                map.addLayer({
                    id: 'content-places-fill', type: 'fill', source: PLACES_SOURCE,
                    paint: { 'fill-color': shading.ramp().empty, 'fill-opacity': 0.9 }
                });
                map.addLayer({
                    id: 'content-places-line', type: 'line', source: PLACES_SOURCE,
                    paint: { 'line-color': ns.THEME.border, 'line-width': 0.5 }
                });
                map.addLayer({
                    id: 'content-places-selected', type: 'line', source: PLACES_SOURCE,
                    filter: ['==', ['get', 'ADMIN'], ''],
                    paint: { 'line-color': ns.THEME.heading, 'line-width': 2 }
                });
                // Every country any decade names stays in view, so decades compare on one frame.
                var bounds = new maplibregl.LngLatBounds();
                var all = counted(null);
                geo.features.forEach(function (feature) {
                    if (all[(feature.properties || {}).ADMIN]) shading.extendBounds(bounds, feature.geometry);
                });
                if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 32, maxZoom: 4, duration: 0 });
                paint();
            });
            map.on('mousemove', 'content-places-fill', function (event) {
                var props = event.features && event.features[0] && event.features[0].properties;
                if (!props) return;
                var count = Number(props.count || 0);
                map.getCanvas().style.cursor = count > 0 ? 'pointer' : '';
                if (!popup) popup = ns.mapPopup({ closeButton: false, closeOnClick: false, offset: 8, className: 'rv-map-popup' });
                popup.setLngLat(event.lngLat);
                if (props.ADMIN === hovered && popup.isOpen()) return;
                hovered = props.ADMIN;
                popup.setHTML('<div class="rv-popup-content"><strong>' + ns.escapeHtml(nameOf(props.ADMIN)) + '</strong><br>'
                    + (count > 0
                        ? '<span class="rv-popup-count">' + ns.escapeHtml(ns.plural(count, 'contentArticle', 'article', 'articles', true)) + '</span>'
                        : '<em>' + ns.escapeHtml(ns.t('contentPlacesNone', 'No article')) + '</em>')
                    + '</div>').addTo(map);
            });
            map.on('mouseleave', 'content-places-fill', function () {
                map.getCanvas().style.cursor = '';
                hovered = null;
                if (popup) { popup.remove(); popup = null; }
            });
            map.on('click', 'content-places-fill', function (event) {
                var props = event.features && event.features[0] && event.features[0].properties;
                if (props && Number(props.count) > 0) select(props.ADMIN);
            });
            ns.trackMap(map, create);
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
            var counts = counted(decade);
            var list = node('ul', 'semantic-map-list__items');
            Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || nameOf(a).localeCompare(nameOf(b), ns.locale); })
                .forEach(function (country) {
                    var li = node('li', '');
                    var button = node('button', 'photo-content-search__pick',
                        nameOf(country) + ' (' + ns.formatNumber(counts[country]) + ')');
                    button.type = 'button';
                    button.addEventListener('click', function () { select(country); });
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
        // Shown again after being hidden, the map refits its canvas.
        slot._charts = [{ resize: function () { if (map) map.resize(); } }];
        draw();

        function load() {
            Promise.all([ns.ensureLibs({ maplibre: true }), shading.load()]).then(function (values) {
                geo = values[1];
                (geo.features || []).forEach(function (feature) {
                    var props = feature.properties || {};
                    if (props.ADMIN) names[props.ADMIN] = props.NAME_EN || props.ADMIN;
                });
                ns.setChildren(mapEl);
                create();
                draw();
            }).catch(function (error) {
                ns.setChildren(mapEl, [failed('places', load)(error)]);
            });
        }
        load();
    };
})();
