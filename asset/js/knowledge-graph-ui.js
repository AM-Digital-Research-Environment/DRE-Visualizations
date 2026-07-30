/**
 * Knowledge-graph chrome — the filter panel, the legend, the toolbar and the text
 * alternative. Everything a reader touches that is NOT the canvas.
 *
 * Split out from the graph itself so the renderer (graph-force.js) stays a
 * renderer: this file only ever talks to a ForceGraph controller through its
 * public methods (toggleLabels, toggleHalos, setGraph, …), never to its internals.
 *
 * Depends on: dashboard-core.js (ns.el, ns.iconButton, ns.iconSvg, ns.t).
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) { console.warn('DreVisualizations: dashboard-core.js must load before knowledge-graph-ui.js'); return; }

    var el = ns.el;
    function t(key, fallback) { return ns.t(key, fallback); }

    var ICON = {
        filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
        halo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/>',
        label: '<path d="M4 7V5h16v2"/><path d="M9 19h6"/><path d="M12 5v14"/>',
        edgeLabel: '<line x1="4" y1="18" x2="20" y2="6"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="6" r="2"/><path d="M9 8h7"/>',
        freeze: '<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>',
        play: '<polygon points="7 4 20 12 7 20 7 4"/>',
        unpin: '<path d="M12 17v5"/><path d="M9 10.76V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5.76l2 3.24H7z"/><line x1="3" y1="3" x2="21" y2="21"/>',
        reset: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
        save: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'
    };

    /* ------------------------------------------------------------------ */
    /*  Range slider                                                       */
    /* ------------------------------------------------------------------ */

    /** One labelled range slider. Returns {el, onInput, reset}. */
    function makeSlider(label, description, min, max, value, suffix) {
        var row = el('div', 'rv-kg-slider');
        var lbl = document.createElement('label');

        // Top row: label text + current value, side by side.
        var topRow = el('span', 'rv-kg-slider-label');
        topRow.appendChild(el('span', null, label));
        var val = el('span', 'rv-kg-slider-value', value + suffix);
        topRow.appendChild(val);
        lbl.appendChild(topRow);

        // Second row: full-width slider.
        var input = document.createElement('input');
        input.type = 'range';
        input.min = min;
        input.max = max;
        input.value = value;
        lbl.appendChild(input);
        row.appendChild(lbl);

        // Third row: description.
        if (description) row.appendChild(el('div', 'rv-kg-slider-desc', description));

        var cbs = [];
        input.addEventListener('input', function () {
            var v = Number(input.value);
            val.textContent = v + suffix;
            for (var i = 0; i < cbs.length; i++) cbs[i](v);
        });

        return {
            el: row,
            onInput: function (cb) { cbs.push(cb); },
            // Restore the initial value + label WITHOUT firing callbacks — the
            // caller batches one re-render after resetting every slider.
            reset: function () { input.value = value; val.textContent = value + suffix; }
        };
    }

    /* ------------------------------------------------------------------ */
    /*  Filter panel                                                       */
    /* ------------------------------------------------------------------ */

    /** The collapsible slider panel. Returns {el, onChange, state}. */
    function buildFilterPanel(data) {
        var stats = data.stats || {};
        var maxFreq = stats.maxFreqPct || 100;
        var maxStr = stats.maxStrength || 10;
        var hasShared = ns.kgData.hasSharedNodes(data);

        var wrap = el('div', 'rv-kg-filters');
        var btn = ns.iconButton(ICON.filter, t('kgFilters', 'Toggle graph filters'), t('kgFiltersTitle', 'Filters'));
        btn.classList.add('rv-kg-filters-toggle');
        btn.setAttribute('aria-expanded', 'false');
        wrap.appendChild(btn);

        var panel = el('div', 'rv-kg-filters-panel');
        panel.hidden = true;
        wrap.appendChild(panel);

        btn.addEventListener('click', function () {
            var open = panel.hidden;
            panel.hidden = !open;
            btn.setAttribute('aria-expanded', String(open));
            btn.classList.toggle('rv-btn-active', open);
        });

        var state = {
            maxCommonality: Math.ceil(maxFreq),
            minStrength: 0,
            maxNodes: data.nodes.length
        };
        // Snapshot of the unfiltered defaults, so "Reset" can restore them and the
        // reset button can grey out while the graph is still at full extent.
        var defaults = {
            maxCommonality: state.maxCommonality,
            minStrength: state.minStrength,
            maxNodes: state.maxNodes
        };
        var callbacks = [];
        var sliders = [];
        var resetBtn;

        function filtersActive() {
            return state.maxCommonality !== defaults.maxCommonality
                || state.minStrength !== defaults.minStrength
                || state.maxNodes !== defaults.maxNodes;
        }
        function fireChange() {
            for (var i = 0; i < callbacks.length; i++) callbacks[i](state);
            if (resetBtn) resetBtn.disabled = !filtersActive();
        }

        function addSlider(key, label, description, min, max, value, suffix) {
            var s = makeSlider(label, description, min, max, value, suffix);
            panel.appendChild(s.el);
            s.onInput(function (v) { state[key] = v; fireChange(); });
            sliders.push(s);
        }

        addSlider('maxCommonality',
            t('kgMaxCommonality', 'Max. commonality'),
            t('kgMaxCommonalityHelp', 'Hide connections through resources shared by too many items'),
            1, Math.ceil(maxFreq), state.maxCommonality, '%');

        if (hasShared) {
            // Round up so the whole range stays reachable.
            addSlider('minStrength',
                t('kgMinStrength', 'Min. connection strength'),
                t('kgMinStrengthHelp', 'Only show shared items with strong distinctive links'),
                0, Math.max(1, Math.ceil(maxStr)), 0, '');
        }

        if (data.nodes.length > 10) {
            addSlider('maxNodes',
                t('kgMaxNeighbours', 'Max. neighbours'),
                t('kgMaxNeighboursHelp', 'Limit the number of visible nodes'),
                5, data.nodes.length, data.nodes.length, '');
        }

        // One click back to the unfiltered graph. Disabled until a slider moves.
        var actions = el('div', 'rv-kg-filters-actions');
        resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'rv-kg-filters-reset';
        resetBtn.textContent = t('kgResetFilters', 'Reset filters');
        resetBtn.disabled = true;
        resetBtn.addEventListener('click', function () {
            state.maxCommonality = defaults.maxCommonality;
            state.minStrength = defaults.minStrength;
            state.maxNodes = defaults.maxNodes;
            sliders.forEach(function (s) { s.reset(); });
            fireChange();
        });
        actions.appendChild(resetBtn);
        panel.appendChild(actions);

        return { el: wrap, onChange: function (cb) { callbacks.push(cb); }, state: state };
    }

    /* ------------------------------------------------------------------ */
    /*  Legend                                                             */
    /* ------------------------------------------------------------------ */

    /**
     * Clickable category swatches, BELOW the stage rather than over it — the same
     * rule the module's map legends follow, so a legend never covers the data.
     * Toggling a chip hides that entity type.
     */
    function buildLegend(graph, categories, colorOf) {
        var wrap = el('div', 'rv-kg-legend');
        var used = graph.categoriesInUse();
        var chips = [];

        categories.forEach(function (cat, i) {
            if (!used[i]) return;
            var chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'rv-kg-legend-chip';
            chip.setAttribute('aria-pressed', 'true');
            var swatch = el('span', 'rv-kg-legend-swatch');
            swatch.style.background = colorOf(i);
            chip.appendChild(swatch);
            chip.appendChild(el('span', null, cat.name));
            chip.addEventListener('click', function () {
                var on = chip.getAttribute('aria-pressed') !== 'true';
                chip.setAttribute('aria-pressed', String(on));
                chip.classList.toggle('rv-kg-legend-off', !on);
                graph.toggleCategory(i, on);
            });
            chips.push({ swatch: swatch, i: i });
            wrap.appendChild(chip);
        });

        return {
            el: wrap,
            recolour: function () {
                chips.forEach(function (c) { c.swatch.style.background = colorOf(c.i); });
            }
        };
    }

    /* ------------------------------------------------------------------ */
    /*  Text alternative                                                   */
    /* ------------------------------------------------------------------ */

    /**
     * The canvas's text alternative: every visible relationship as real links,
     * grouped by entity type. A canvas is opaque to a screen reader, and this also
     * gives everyone a Ctrl+F-able list — including the co-occurring "shared items"
     * that the item's own metadata block never shows. Built on demand, on open.
     */
    function buildListPanel(graph, categories) {
        var details = document.createElement('details');
        details.className = 'rv-kg-list';
        var summary = document.createElement('summary');
        summary.textContent = t('kgListToggle', 'Relationships as a list');
        details.appendChild(summary);

        function rebuild() {
            while (details.childNodes.length > 1) details.removeChild(details.lastChild);
            var groups = {};
            graph.visibleNodes().forEach(function (n) {
                if (n.isCenter) return;
                (groups[n.category] || (groups[n.category] = [])).push(n);
            });
            Object.keys(groups).sort(function (a, b) { return a - b; }).forEach(function (ci) {
                var cat = categories[ci];
                details.appendChild(el('h4', 'rv-kg-list-head', cat ? cat.name : ''));
                var ul = el('ul', 'rv-kg-list-items');
                groups[ci].sort(function (a, b) { return (b.deg || 0) - (a.deg || 0); })
                    .forEach(function (n) {
                        var li = document.createElement('li');
                        if (n.url) {
                            var a = el('a', null, n.name);
                            a.href = n.url;
                            li.appendChild(a);
                        } else {
                            li.appendChild(el('span', null, n.name));
                        }
                        var sharedCount = n.data && n.data.sharedCount;
                        if (sharedCount) {
                            li.appendChild(el('span', 'rv-kg-list-meta',
                                ' — ' + sharedCount + ' ' + t('kgSharedLinks', 'shared links')));
                        }
                        ul.appendChild(li);
                    });
                details.appendChild(ul);
            });
        }

        details.addEventListener('toggle', function () { if (details.open) rebuild(); });
        return details;
    }

    /* ------------------------------------------------------------------ */
    /*  Detail card                                                        */
    /* ------------------------------------------------------------------ */

    /**
     * The panel that appears when a reader selects an entity.
     *
     * This is what lets a click *select* instead of navigate. Clicking a node used
     * to jump straight to its Omeka page, which fought exploration — the obvious
     * gesture for "tell me more" threw away the graph — and on touch, with no hover,
     * there was no way to read a node without leaving. Now the click anchors the
     * neighbourhood and the jump lives here as a real `<a>`: keyboard-reachable,
     * long-pressable, openable in a new tab.
     *
     * Mounted inside the stage so it travels into fullscreen with the graph.
     */
    function buildDetailCard(graph, categories, colorOf) {
        var card = el('div', 'rv-kg-card');
        card.hidden = true;

        var close = ns.iconButton('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
            t('close', 'Close'), t('close', 'Close'));
        close.classList.add('rv-kg-card-close');
        close.addEventListener('click', function () { graph.select(null); });

        var title = el('h4', 'rv-kg-card-title');
        var type = el('p', 'rv-kg-card-type');
        var meta = el('ul', 'rv-kg-card-meta');
        var link = el('a', 'rv-kg-card-link');
        var rels = el('p', 'rv-kg-card-rels');

        card.appendChild(close);
        card.appendChild(title);
        card.appendChild(type);
        card.appendChild(meta);
        card.appendChild(rels);
        card.appendChild(link);

        /** Render (or hide, on null) — called by graph.onSelect. */
        function show(node) {
            if (!node) {
                card.hidden = true;
                return;
            }
            var d = node.data || {};
            title.textContent = node.name;

            var cat = categories[node.category];
            type.textContent = cat ? cat.name : '';
            type.style.color = colorOf(node.category);

            ns.setChildren(meta);
            function addMeta(text) {
                if (text) meta.appendChild(el('li', null, text));
            }
            addMeta(node.deg
                ? node.deg + ' ' + (node.deg === 1 ? t('kgConnection', 'connection in view')
                    : t('kgConnections', 'connections in view'))
                : null);
            if (d.freqPct !== undefined && d.freqPct !== null) {
                addMeta(t('kgSharedBy', 'Shared by') + ' ' + d.freqPct + '% ' + t('kgOfItems', 'of items'));
            }
            if (d.strength !== undefined) {
                addMeta(d.sharedCount + ' '
                    + (d.sharedCount > 1 ? t('kgSharedLinks', 'shared links') : t('kgSharedLink', 'shared link'))
                    + ' (' + t('kgStrength', 'strength') + ' ' + d.strength + ')');
            }
            if (node.pinned) addMeta(t('kgPinnedHint', 'Pinned — Alt-click to release'));

            // Name the relationships this entity actually participates in, so the
            // reader gets the *kind* of connection without chasing each edge label.
            var adj = graph.adjacency()[node.id] || {};
            var seen = {}, names = [];
            Object.keys(adj).forEach(function (other) {
                var name = adj[other] && adj[other].name;
                if (name && !seen[name]) { seen[name] = true; names.push(name); }
            });
            rels.textContent = names.length
                ? t('kgVia', 'Connected via') + ': ' + names.slice(0, 6).join(', ')
                    + (names.length > 6 ? '…' : '')
                : '';

            if (node.url) {
                link.href = node.url;
                link.textContent = t('kgOpenRecord', 'Open this record') + ' →';
                link.hidden = false;
            } else {
                link.hidden = true;
                link.removeAttribute('href');
            }
            card.hidden = false;
        }

        return { el: card, show: show };
    }

    /* ------------------------------------------------------------------ */
    /*  Tooltip rows                                                       */
    /* ------------------------------------------------------------------ */

    /**
     * The ForceGraph `tooltip` hook: DOM rows, never markup, so curator metadata
     * can never become HTML.
     */
    function tooltipRows(categories, colorOf) {
        return function (node, link, opts) {
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
                if (node.deg) {
                    rows.push(el('span', 'rv-kg-tip-meta', node.deg + ' ' + (node.deg === 1
                        ? t('kgConnection', 'connection in view')
                        : t('kgConnections', 'connections in view'))));
                }
                if (d.freqPct !== undefined && d.freqPct !== null) {
                    rows.push(el('span', 'rv-kg-tip-meta',
                        t('kgSharedBy', 'Shared by') + ' ' + d.freqPct + '% ' + t('kgOfItems', 'of items')));
                }
                if (d.strength !== undefined) {
                    rows.push(el('span', 'rv-kg-tip-meta', d.sharedCount + ' '
                        + (d.sharedCount > 1 ? t('kgSharedLinks', 'shared links') : t('kgSharedLink', 'shared link'))
                        + ' (' + t('kgStrength', 'strength') + ' ' + d.strength + ')'));
                }
                if (node.pinned) {
                    rows.push(el('span', 'rv-kg-tip-meta', t('kgPinnedHint', 'Pinned — Alt-click to release')));
                }
                // A click no longer navigates, so say what it actually does. The
                // link to the record lives in the detail card the click opens.
                rows.push(el('span', 'rv-kg-tip-meta', t('kgClickToFocus', 'Click to focus')));
                return rows;
            }
            if (link) {
                var e = link.data || {};
                rows.push(el('strong', null, link.name || ''));
                if (link.weak && e.freqPct !== undefined) {
                    rows.push(el('span', 'rv-kg-tip-meta', t('kgResourceSharedBy', 'Resource shared by')
                        + ' ' + e.freqPct + '% ' + t('kgOfItems', 'of items')));
                }
                return rows;
            }
            return null;
        };
    }

    /** The ForceGraph `announce` hook — what a screen reader hears on arrow keys. */
    function announcer(categories) {
        return function (node) {
            var cat = categories[node.category];
            return node.name + (cat ? ', ' + cat.name : '')
                + ', ' + (node.deg || 0) + ' ' + t('kgConnections', 'connections in view')
                + '. ' + t('kgEnterToOpen', 'Press Enter to open.');
        };
    }

    /* ------------------------------------------------------------------ */
    /*  Toolbar                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * Wire the floating toolbar. Controls are inserted BEFORE the fullscreen button
     * the template already rendered, so reading order matches visual order.
     *
     * @param {HTMLElement} block   the .knowledge-graph-block <details>
     * @param {Object} graph        a ForceGraph controller
     * @param {Object} data         the raw payload (for the filter panel)
     * @param {Function} onFilter   called with the slider state, debounced
     */
    function mountToolbar(block, graph, data, onFilter) {
        var toolbar = block.querySelector('.knowledge-graph-toolbar');
        if (!toolbar) return;
        var anchor = toolbar.firstChild;
        function add(node) { toolbar.insertBefore(node, anchor); }

        /* -- filters -- */
        if (ns.kgData.hasFilterData(data)) {
            var filters = buildFilterPanel(data);
            add(filters.el);
            var timer;
            filters.onChange(function (state) {
                clearTimeout(timer);
                timer = setTimeout(function () { onFilter(state); }, 80);
            });
        }

        /* -- labels -- */
        var labelBtn = ns.iconButton(ICON.label, t('kgLabelsLabel', 'Show every label'),
            t('kgLabelsTitle', 'Show every label — otherwise labels are placed where they fit'));
        labelBtn.setAttribute('aria-pressed', 'false');
        labelBtn.addEventListener('click', function () {
            var on = graph.toggleLabels();
            labelBtn.classList.toggle('rv-btn-active', on);
            labelBtn.setAttribute('aria-pressed', String(on));
        });
        add(labelBtn);

        /* -- edge labels -- */
        var edgeBtn = ns.iconButton(ICON.edgeLabel, t('kgEdgeLabelsLabel', 'Name every connection'),
            t('kgEdgeLabelsTitle', 'Name every connection — otherwise only the selected entity’s are named'));
        edgeBtn.setAttribute('aria-pressed', 'false');
        edgeBtn.addEventListener('click', function () {
            var on = graph.toggleEdgeLabels();
            edgeBtn.classList.toggle('rv-btn-active', on);
            edgeBtn.setAttribute('aria-pressed', String(on));
        });
        add(edgeBtn);

        /* -- community halos -- */
        if ((data.stats || {}).communityCount > 0) {
            var haloBtn = ns.iconButton(ICON.halo, t('kgHalosLabel', 'Toggle community colours'),
                t('kgHalosTitle', 'Community colours — rings group entities that co-occur'));
            haloBtn.classList.add('rv-btn-active');
            haloBtn.setAttribute('aria-pressed', 'true');
            haloBtn.addEventListener('click', function () {
                var on = graph.toggleHalos();
                haloBtn.classList.toggle('rv-btn-active', on);
                haloBtn.setAttribute('aria-pressed', String(on));
            });
            add(haloBtn);
        }

        /* -- freeze / resume the layout -- */
        if (!graph.reducedMotion) {
            var freezeBtn = ns.iconButton(ICON.freeze, t('kgFreezeLabel', 'Freeze the layout'),
                t('kgFreezeTitle', 'Freeze the layout — stops the nodes settling'));
            freezeBtn.setAttribute('aria-pressed', 'false');
            freezeBtn.addEventListener('click', function () {
                var frozen = graph.toggleFrozen();
                freezeBtn.classList.toggle('rv-btn-active', frozen);
                freezeBtn.setAttribute('aria-pressed', String(frozen));
                ns.setChildren(freezeBtn, [ns.iconSvg(frozen ? ICON.play : ICON.freeze)]);
                freezeBtn.setAttribute('aria-label', frozen
                    ? t('kgResumeLabel', 'Resume the layout') : t('kgFreezeLabel', 'Freeze the layout'));
                freezeBtn.title = freezeBtn.getAttribute('aria-label');
            });
            add(freezeBtn);
        }

        /* -- release the dragged nodes (appears once something is pinned) -- */
        var unpinBtn = ns.iconButton(ICON.unpin, t('kgUnpinLabel', 'Release all pinned nodes'),
            t('kgUnpinTitle', 'Release every node you dragged'));
        unpinBtn.hidden = true;
        unpinBtn.addEventListener('click', function () { graph.unpinAll(); });
        add(unpinBtn);
        graph.onPinChange(function (count) { unpinBtn.hidden = count === 0; });

        /* -- reset view -- */
        var resetBtn = ns.iconButton(ICON.reset, t('resetView', 'Reset view'), t('resetView', 'Reset view'));
        resetBtn.addEventListener('click', function () { graph.resetView(); });
        add(resetBtn);

        /* -- save as PNG -- */
        var saveBtn = ns.iconButton(ICON.save, t('saveImage', 'Save as image'), t('saveImage', 'Save as image'));
        saveBtn.addEventListener('click', function () {
            var a = document.createElement('a');
            a.href = graph.toDataURL();
            a.download = 'knowledge-graph.png';
            a.click();
        });
        add(saveBtn);

        /* -- fullscreen (the button itself is in the template) -- */
        var toggle = block.querySelector('.rv-fullscreen-toggle');
        function refit() { setTimeout(function () { graph.resize(); }, 50); }
        if (toggle) {
            toggle.addEventListener('click', function () {
                block.classList.toggle('rv-fullscreen');
                refit();
            });
        }
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && block.classList.contains('rv-fullscreen')) {
                block.classList.remove('rv-fullscreen');
                refit();
            }
        });
    }

    /** The gesture hint that sits under the graph. */
    function buildHint() {
        return el('p', 'rv-kg-hint', t('kgHint',
            'Click an entity to focus it and name its connections; the panel that opens links to '
            + 'its record. Drag to rearrange — a dragged node stays where you put it (Alt-click to '
            + 'release). Double-click the background or Ctrl + scroll to zoom.'));
    }

    ns.kgUI = {
        ICON: ICON,
        makeSlider: makeSlider,
        buildFilterPanel: buildFilterPanel,
        buildLegend: buildLegend,
        buildListPanel: buildListPanel,
        buildDetailCard: buildDetailCard,
        buildHint: buildHint,
        tooltipRows: tooltipRows,
        announcer: announcer,
        mountToolbar: mountToolbar
    };
})();
