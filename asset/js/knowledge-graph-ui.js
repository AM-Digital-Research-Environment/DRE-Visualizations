/**
 * Knowledge-graph chrome — the filter panel, the toolbar, the text alternative,
 * the tooltip and the detail card's contents. Everything a reader touches that is
 * NOT the canvas and is specific to the knowledge graph; the legend, the detail
 * card itself and the hint are the shared graphChrome pieces (graph-chrome.js).
 *
 * Split out from the graph itself so the renderer (graph-force.js) stays a
 * renderer: this file only ever talks to a ForceGraph controller through its
 * public methods (toggleLabels, toggleHalos, setGraph, …), never to its internals.
 *
 * Depends on: dashboard-core.js (ns.el, ns.iconButton, ns.iconSvg, ns.t) and
 * graph-chrome.js (ns.graphChrome), both loaded before it.
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
        reset: ns.ICONS.reset,
        save: ns.ICONS.save
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
            t('kgMaxCommonality', 'Hide the most common links'),
            t('kgMaxCommonalityHelp', 'Leave out subjects, places and the like that almost every record shares, since they say little about this one'),
            1, Math.ceil(maxFreq), state.maxCommonality, '%');

        if (hasShared) {
            // Round up so the whole range stays reachable.
            addSlider('minStrength',
                t('kgMinStrength', 'Keep only the strongest links'),
                t('kgMinStrengthHelp', 'Show only the records that have a distinctive amount in common with this one'),
                0, Math.max(1, Math.ceil(maxStr)), 0, '');
        }

        if (data.nodes.length > 10) {
            addSlider('maxNodes',
                t('kgMaxNeighbours', 'Number of connections shown'),
                t('kgMaxNeighboursHelp', 'Limit how much the graph draws at once'),
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
        summary.textContent = t('kgListToggle', 'See these connections as a list');
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
                                ' — ' + ns.plural(sharedCount, 'kgShared', 'thing in common', 'things in common', true)));
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
     * What the graph knows about a node beyond its name and type, one line each:
     * the connections in view, how common it is, what it shares with the item,
     * and whether it is pinned. The tooltip and the detail card list the same.
     */
    function metaLines(node) {
        var d = node.data || {};
        var lines = [];
        if (node.deg) lines.push(ns.plural(node.deg, 'kgConnection', 'connection shown', 'connections shown', true));
        if (d.freqPct !== undefined && d.freqPct !== null) {
            lines.push(t('kgSharedBy', 'Also on') + ' ' + d.freqPct + '% ' + t('kgOfItems', 'of all records'));
        }
        if (d.strength !== undefined) {
            lines.push(ns.plural(d.sharedCount, 'kgShared', 'thing in common', 'things in common', true));
        }
        if (node.pinned) lines.push(t('kgPinnedHint', 'Held in place. Alt-click to let it go'));
        return lines;
    }

    /**
     * The panel that appears when a reader selects an entity — the shared
     * graphChrome card (graph-chrome.js), filled with the knowledge graph's own
     * type, meta lines and record link.
     *
     * This is what lets a click *select* instead of navigate. Clicking a node used
     * to jump straight to its Omeka page, which fought exploration — the obvious
     * gesture for "tell me more" threw away the graph — and on touch, with no hover,
     * there was no way to read a node without leaving. Now the click anchors the
     * neighbourhood and the jump lives in the card as a real `<a>`.
     */
    function buildDetailCard(graph, categories, colorOf) {
        return ns.graphChrome.buildDetailCard(graph, {
            typeLabel: function (node) {
                var cat = categories[node.category];
                return cat ? cat.name : '';
            },
            typeColor: function (node) { return colorOf(node.category); },
            metaRows: metaLines,
            url: function (node) { return node.url; },
            openLabel: t('kgOpenRecord', 'Open this record')
        });
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
                rows.push(el('strong', null, node.name));
                var cat = categories[node.category];
                if (cat) {
                    var cs = el('span', 'rv-kg-tip-cat', cat.name);
                    cs.style.color = colorOf(node.category);
                    rows.push(cs);
                }
                metaLines(node).forEach(function (line) {
                    rows.push(el('span', 'rv-kg-tip-meta', line));
                });
                // A click no longer navigates, so say what it actually does. The
                // link to the record lives in the detail card the click opens.
                rows.push(el('span', 'rv-kg-tip-meta', t('kgClickToFocus', 'Click for details')));
                return rows;
            }
            if (link) {
                var e = link.data || {};
                rows.push(el('strong', null, link.name || ''));
                if (link.weak && e.freqPct !== undefined) {
                    rows.push(el('span', 'rv-kg-tip-meta', t('kgResourceSharedBy', 'Also on')
                        + ' ' + e.freqPct + '% ' + t('kgOfItems', 'of all records')));
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
                + ', ' + ns.plural(node.deg || 0, 'kgConnection', 'connection shown', 'connections shown', true)
                + '. ' + t('kgEnterToOpen', 'Press Enter to select.');
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
            t('kgLabelsTitle', 'Name everything on the graph. Otherwise names appear only where they fit'));
        labelBtn.setAttribute('aria-pressed', 'false');
        labelBtn.addEventListener('click', function () {
            var on = graph.toggleLabels();
            labelBtn.classList.toggle('rv-btn-active', on);
            labelBtn.setAttribute('aria-pressed', String(on));
        });
        add(labelBtn);

        /* -- edge labels -- */
        var edgeBtn = ns.iconButton(ICON.edgeLabel, t('kgEdgeLabelsLabel', 'Name every connection'),
            t('kgEdgeLabelsTitle', 'Name every connection. Otherwise only the connections of the entity you select are named'));
        edgeBtn.setAttribute('aria-pressed', 'false');
        edgeBtn.addEventListener('click', function () {
            var on = graph.toggleEdgeLabels();
            edgeBtn.classList.toggle('rv-btn-active', on);
            edgeBtn.setAttribute('aria-pressed', String(on));
        });
        add(edgeBtn);

        /* -- community halos -- */
        if ((data.stats || {}).communityCount > 0) {
            var haloBtn = ns.iconButton(ICON.halo, t('kgHalosLabel', 'Show groups in colour'),
                t('kgHalosTitle', 'Colour the rings to group entities that keep appearing together'));
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
                t('kgFreezeTitle', 'Stop the graph moving and leave everything where it is'));
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
        var unpinBtn = ns.iconButton(ICON.unpin, t('kgUnpinLabel', 'Let go of everything'),
            t('kgUnpinTitle', 'Let go of everything you have dragged into place'));
        unpinBtn.hidden = true;
        unpinBtn.addEventListener('click', function () { graph.unpinAll(); });
        add(unpinBtn);
        graph.onPinChange(function (count) { unpinBtn.hidden = count === 0; });

        /* -- reset view -- */
        var resetBtn = ns.iconButton(ICON.reset, t('resetView', 'Reset view'), t('resetView', 'Reset view'));
        resetBtn.addEventListener('click', function () { graph.resetView(); });
        add(resetBtn);

        /* -- save as PNG -- */
        var saveBtn = ns.iconButton(ICON.save, t('saveGraphImage', 'Save this graph as an image'), t('saveGraphImage', 'Save this graph as an image'));
        saveBtn.addEventListener('click', function () {
            var a = document.createElement('a');
            a.href = graph.toDataURL();
            a.download = 'knowledge-graph.png';
            a.click();
        });
        add(saveBtn);

        /* -- fullscreen: the shared control (core/fullscreen.js), last in the row -- */
        toolbar.appendChild(ns.fullscreenButton(block, {
            onChange: function () { setTimeout(function () { graph.resize(); }, 50); }
        }));
    }

    /** The gesture hint that sits under the graph (graphChrome's, with the graph's own words). */
    function buildHint() {
        return ns.graphChrome.buildHint(t('kgHint', 'Click an entity to see what it is connected to; the panel that opens links to its record. Drag an entity to move it, and it stays where you put it (Alt-click to let it go). Double-click the background, or hold Ctrl and scroll, to zoom.'));
    }

    ns.kgUI = {
        buildListPanel: buildListPanel,
        buildDetailCard: buildDetailCard,
        buildHint: buildHint,
        tooltipRows: tooltipRows,
        announcer: announcer,
        mountToolbar: mountToolbar
    };
})();
