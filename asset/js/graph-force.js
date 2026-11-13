/**
 * ForceGraph — an interactive force-directed graph a reader can actually handle:
 * drag a node and its neighbourhood relaxes around it, and the node keeps the
 * position you gave it.
 *
 * This file is the controller: the d3-force simulation, the pointer/keyboard
 * interaction, and the public surface the chrome drives. It draws nothing itself —
 * graph-canvas.js owns the view transform, the painter and the hit tests, so the
 * two concerns can change independently.
 *
 * Replaces the ECharts `graph`/`force` series, which ran its layout to a frozen
 * state with no collision pass: nodes overlapped, labels could not be placed, and
 * a drag moved one node through a static picture.
 *
 * Layout: d3-force (Barnes–Hut many-body + collision + link springs), seeded via
 * `randomSource` so a given graph lays out identically on every load.
 *
 * Large graphs simulate in a Web Worker. The Publications co-author network
 * (~950 people, ~2,600 links) cost about 7 ms a tick on a fast laptop and four
 * times that on a mid-range phone: the warm-up blocked the page for seconds and
 * every animated frame and drag frame was a long task. From WORKER_MIN_NODES the
 * same simulation runs in a worker started from THIS file (see workerMain), so
 * there is one copy of the physics; the page keeps only the painting and the
 * input. Smaller graphs (the item-page knowledge graph) stay on the page, where a
 * tick costs nothing and the first picture is synchronous. A worker that cannot
 * start or load d3 falls back to the page.
 *
 * Knows nothing about Omeka, knowledge graphs or research items — it takes nodes,
 * links and a few style/behaviour hooks. knowledge-graph.js is its first caller;
 * the co-occurrence networks can adopt it without changes here.
 *
 * Depends on: dashboard-core.js, graph-canvas.js, and d3-force 3 — which the
 * CALLER must have loaded (ns.ensureLibs({ d3: true })).
 *
 * Usage:
 *   var graph = ns.ForceGraph.create(container, {
 *       nodes: [{ id, name, category, size, isCenter?, community?, url?, data? }],
 *       categories: [{ name }],
 *       seed: 1234,
 *       colorOf: function (categoryIndex) { return '#009260'; },
 *       haloOf: function (node) { return '#8e2a4c' || null; },
 *       linkColorOf: function (link) { return '#f59c08' || null; },
 *       tooltip: function (node, link, opts) { return [Element, …]; },
 *       announce: function (node) { return 'spoken description'; },
 *       onActivate: function (node) { window.location.href = node.url; },
 *       forces: { distance, linkStrength, chargeOf }   // all optional
 *   });
 *   graph.setGraph({ nodes: [{id}, …], links: [{ source: id, target: id, name,
 *                                                width?, alpha?, weak?, data? }] });
 *   graph.resize();
 *   graph.destroy();   // when the container is about to be torn down
 */
(function () {
    'use strict';

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    /**
     * Deterministic PRNG (mulberry32). d3-force seats nodes by phyllotaxis, which
     * is already deterministic, but forceCollide/forceLink `jiggle()` coincident
     * nodes through randomSource — seed that and the same data lays out identically
     * on every load, so the graph a reader shares is the graph a reader returns to.
     */
    function makeRng(seed) {
        var a = (seed | 0) || 1;
        return function () {
            a = a + 0x6D2B79F5 | 0;
            var x = Math.imul(a ^ a >>> 15, 1 | a);
            x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
            return ((x ^ x >>> 14) >>> 0) / 4294967296;
        };
    }

    /* ------------------------------------------------------------------ */
    /*  The simulation — shared by the page and the worker                 */
    /* ------------------------------------------------------------------ */

    /**
     * One pass of the layout. Every per-node and per-link quantity arrives
     * precomputed — `charge` and `r` on the nodes, rest length `d` and strength
     * `k` on the links — because the caller's force hooks are functions, which a
     * worker cannot receive. d3 reads these accessors once, when a force
     * initialises, so precomputing them changes nothing about the layout.
     *
     * Returned stopped: whoever owns it drives the ticks.
     */
    function buildSim(d3, nodes, links, rng, distanceMax) {
        return d3.forceSimulation(nodes)
            .randomSource(rng)
            .velocityDecay(0.42)
            .alphaDecay(0.028)
            .force('link', d3.forceLink(links)
                .distance(function (l) { return l.d; })
                .strength(function (l) { return l.k; }))
            .force('charge', d3.forceManyBody()
                .strength(function (n) { return n.charge; })
                .distanceMax(distanceMax))
            .force('collide', d3.forceCollide()
                .radius(function (n) { return n.r + 4; })
                .iterations(2))
            .force('x', d3.forceX(0).strength(0.018))
            .force('y', d3.forceY(0).strength(0.032))
            .stop();
    }

    /* ------------------------------------------------------------------ */
    /*  Worker side                                                        */
    /* ------------------------------------------------------------------ */

    /**
     * The worker started from this very file. It loads the vendored d3 the page
     * names in `init`, builds each pass it is sent, and paces the ticks itself
     * (one per ~16 ms) instead of d3's timer, posting the positions after each.
     * Messages are tagged with the pass, so the page drops a frame from a pass it
     * has already replaced.
     */
    function workerMain(scope) {
        var lib = null, rng = null, sim = null, nodes = [], pass = 0;
        var running = false, timer = null;

        function post() {
            var buf = new Float64Array(nodes.length * 4);
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                buf[4 * i] = n.x; buf[4 * i + 1] = n.y; buf[4 * i + 2] = n.vx; buf[4 * i + 3] = n.vy;
            }
            scope.postMessage({ type: 'pos', pass: pass, buf: buf, running: running }, [buf.buffer]);
        }
        function loop() {
            timer = null;
            if (!sim || !running) return;
            var started = Date.now();
            sim.tick();
            // d3's own timer stops below alphaMin unless a target holds it up.
            if (sim.alpha() < sim.alphaMin()) running = false;
            post();
            if (running) timer = setTimeout(loop, Math.max(0, 16 - (Date.now() - started)));
        }
        function restart() {
            running = true;
            if (!timer) timer = setTimeout(loop, 0);
        }
        function stop() {
            running = false;
            if (timer) { clearTimeout(timer); timer = null; }
        }

        scope.onmessage = function (ev) {
            var m = ev.data || {};
            try {
                if (m.type === 'init') {
                    scope.importScripts.apply(scope, m.urls);
                    lib = scope.d3;
                    if (!lib || !lib.forceSimulation) throw new Error('d3-force did not load');
                    rng = makeRng(m.seed);
                    return;
                }
                if (!lib) return;
                if (m.type === 'build') {
                    stop();
                    pass = m.pass;
                    nodes = m.nodes;
                    sim = buildSim(lib, nodes, m.links, rng, m.distanceMax);
                    for (var i = 0; i < m.warmup; i++) sim.tick();
                    if (m.animate && m.warm) sim.alpha(0.32);
                    if (m.animate) running = true;
                    post();                  // the first, already organised picture
                    if (m.animate) restart();
                    return;
                }
                if (!sim) return;
                if (m.type === 'fix') {
                    var n = nodes[m.i];
                    if (!n) return;
                    n.fx = m.fx; n.fy = m.fy;
                    if (m.fx != null) { n.x = m.fx; n.y = m.fy; }
                } else if (m.type === 'alphaTarget') {
                    sim.alphaTarget(m.v);
                    if (m.restart) restart();
                } else if (m.type === 'alpha') {
                    sim.alpha(m.v);
                    if (m.restart) restart();
                } else if (m.type === 'tick') {
                    if (m.atLeast) sim.alpha(Math.max(sim.alpha(), m.atLeast));
                    for (var t = 0; t < m.n; t++) sim.tick();
                    post();
                } else if (m.type === 'stop') {
                    stop();
                }
            } catch (e) {
                stop();
                scope.postMessage({ type: 'error', message: String((e && e.message) || e) });
            }
        };
    }

    /* global WorkerGlobalScope */
    if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
        workerMain(self);
        return;
    }

    /* ------------------------------------------------------------------ */
    /*  Page side                                                          */
    /* ------------------------------------------------------------------ */

    var ns = window.RV;
    if (!ns) { console.warn('DreVisualizations: dashboard-core.js must load before graph-force.js'); return; }

    /** Graphs this large simulate in a worker; smaller ones on the page. */
    var WORKER_MIN_NODES = 120;

    // The worker is this file: remember where it was loaded from, while
    // document.currentScript still says so.
    var SELF_URL = (document.currentScript && document.currentScript.src) || null;

    /**
     * The vendored d3 scripts, in their load order (it is load-bearing, see
     * libs.d3 in config/asset-plans.json): from the published library URLs when
     * the page has them, else from the script tags that loaded d3 here.
     */
    function d3Urls() {
        var abs = function (u) { return new URL(u, document.baseURI).href; };
        var libs = window.RV_LIBS && window.RV_LIBS.d3;
        if (Array.isArray(libs) && libs.length) return libs.map(abs);
        var order = ['d3-quadtree', 'd3-dispatch', 'd3-timer', 'd3-force'];
        var found = {};
        Array.prototype.forEach.call(document.scripts, function (s) {
            var m = /\/(d3-(?:quadtree|dispatch|timer|force))(?:\.min)?\.js(?:[?#]|$)/.exec(s.src || '');
            if (m && !found[m[1]]) found[m[1]] = s.src;
        });
        var urls = order.map(function (name) { return found[name]; });
        return urls.every(Boolean) ? urls.map(abs) : null;
    }

    /* ------------------------------------------------------------------ */
    /*  Engines: the same simulation, on the page or in the worker         */
    /* ------------------------------------------------------------------ */

    /**
     * On the page. Works on the controller's own node objects, so positions
     * need no copying; `onFrame` fires after every tick.
     */
    function localEngine(rng, onFrame) {
        var sim = null;
        return {
            build: function (nodes, links, o) {
                if (sim) sim.stop();
                nodes.forEach(function (n) { n.charge = o.charge(n); });
                links.forEach(function (l) { l.d = o.distance(l); l.k = o.strength(l); });
                sim = buildSim(d3, nodes, links, rng, o.distanceMax);
                sim.on('tick', function () { onFrame(); });
                for (var i = 0; i < o.warmup; i++) sim.tick();
                if (o.animate) {
                    if (o.warm) sim.alpha(0.32);
                    sim.restart();
                }
                onFrame();
            },
            fix: function () { /* shares the node objects */ },
            alphaTarget: function (v, restart) { sim.alphaTarget(v); if (restart) sim.restart(); },
            alpha: function (v, restart) { sim.alpha(v); if (restart) sim.restart(); },
            tick: function (n, atLeast) {
                if (atLeast) sim.alpha(Math.max(sim.alpha(), atLeast));
                for (var i = 0; i < n; i++) sim.tick();
                onFrame();
            },
            stop: function () { if (sim) sim.stop(); },
            destroy: function () { if (sim) sim.stop(); }
        };
    }

    /**
     * In a worker. Sends plain copies of the pass and writes the positions it
     * gets back onto the controller's node objects. A node the reader holds keeps
     * the position the page gave it: the worker's copy can be a frame behind the
     * pointer. Returns null when no worker can be started; `onFail` is called if
     * one starts but cannot run, so the controller can fall back to the page.
     */
    function workerEngine(seed, onFrame, onFail) {
        var urls = d3Urls();
        if (!SELF_URL || !urls || typeof Worker !== 'function') return null;
        var worker;
        try { worker = new Worker(SELF_URL); } catch (e) { return null; }
        var pass = 0, nodes = [], dead = false;

        function fail() {
            if (dead) return;
            dead = true;
            worker.terminate();
            onFail();
        }
        worker.onmessage = function (ev) {
            var m = ev.data || {};
            if (m.type === 'error') { fail(); return; }
            if (m.type !== 'pos' || m.pass !== pass || dead) return;
            var b = m.buf;
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                if (n.fx != null) { n.x = n.fx; n.y = n.fy; } else { n.x = b[4 * i]; n.y = b[4 * i + 1]; }
                n.vx = b[4 * i + 2]; n.vy = b[4 * i + 3];
            }
            onFrame();
        };
        worker.onerror = function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); fail(); };
        worker.postMessage({ type: 'init', urls: urls, seed: seed });

        function send(msg) { if (!dead) worker.postMessage(msg); }
        function num(v) { return (v == null || !isFinite(v)) ? NaN : v; }

        return {
            async: true,
            build: function (passNodes, links, o) {
                nodes = passNodes;
                pass++;
                var index = {};
                passNodes.forEach(function (n, i) { index[n.id] = i; n._pass = i; });
                send({
                    type: 'build', pass: pass, distanceMax: o.distanceMax,
                    warmup: o.warmup, warm: o.warm, animate: o.animate,
                    // NaN, not null: d3 seats a node whose x is NaN, but reads null as 0.
                    nodes: passNodes.map(function (n) {
                        return {
                            x: num(n.x), y: num(n.y), vx: n.vx || 0, vy: n.vy || 0,
                            fx: n.fx == null ? null : n.fx, fy: n.fy == null ? null : n.fy,
                            r: n.r, charge: o.charge(n)
                        };
                    }),
                    links: links.map(function (l) {
                        return { source: index[l.source.id], target: index[l.target.id], d: o.distance(l), k: o.strength(l) };
                    })
                });
            },
            fix: function (n) {
                if (n._pass == null || nodes[n._pass] !== n) return;
                send({ type: 'fix', i: n._pass, fx: n.fx == null ? null : n.fx, fy: n.fy == null ? null : n.fy });
            },
            alphaTarget: function (v, restart) { send({ type: 'alphaTarget', v: v, restart: !!restart }); },
            alpha: function (v, restart) { send({ type: 'alpha', v: v, restart: !!restart }); },
            tick: function (n, atLeast) { send({ type: 'tick', n: n, atLeast: atLeast || 0 }); },
            stop: function () { send({ type: 'stop' }); },
            destroy: function () { dead = true; worker.terminate(); }
        };
    }

    /* ------------------------------------------------------------------ */
    /*  Default physics                                                    */
    /* ------------------------------------------------------------------ */

    var DEFAULT_FORCES = {
        /** Rest length of a link. Weak links sit further out; hubs get room. */
        distance: function (link, deg, scale) {
            var hub = Math.max(deg[link.source.id] || 1, deg[link.target.id] || 1);
            return ((link.weak ? 140 : 80) + Math.min(64, 3.4 * Math.sqrt(hub))) * scale;
        },
        /** d3's own 1/min(degree) damping, weakened for the softer links. */
        linkStrength: function (link, deg) {
            var m = Math.max(1, Math.min(deg[link.source.id] || 1, deg[link.target.id] || 1));
            return clamp((link.weak ? 0.45 : 1) / m, 0.008, 1);
        },
        /** Repulsion scaled by the node's own radius. */
        chargeOf: function (node, scale) {
            return -(30 + 9 * node.r) * scale;
        }
    };

    /** The node's own size, grown for well-connected hubs. */
    function radiusOf(n) {
        var size = n.isCenter
            ? n.size
            : Math.min(n.size * 2, n.size * (1 + 0.22 * Math.sqrt(Math.max(0, n.deg - 1))));
        return size / 2;
    }

    /* ------------------------------------------------------------------ */
    /*  Factory                                                            */
    /* ------------------------------------------------------------------ */

    function create(container, spec) {
        var categories = spec.categories || [];
        var forces = Object.assign({}, DEFAULT_FORCES, spec.forces || {});
        var colorOf = spec.colorOf || function () { return ns.COLORS[0]; };
        var haloOf = spec.haloOf || function () { return null; };
        var linkColorOf = spec.linkColorOf || null;
        var reduced = !!(ns.prefersReducedMotion && ns.prefersReducedMotion());
        var seed = spec.seed || 1;

        // Node objects are created ONCE and reused across every setGraph call, so a
        // node that a filter hides and then reveals returns to where it was rather
        // than being flung in from a fresh phyllotaxis seat.
        var allNodes = (spec.nodes || []).map(function (n) {
            return {
                id: n.id, name: n.name || '', category: n.category || 0,
                size: n.size || 22, isCenter: !!n.isCenter, community: n.community,
                url: n.url || null, data: n.data || n,
                r: (n.size || 22) / 2, deg: 0, pinned: false
            };
        });
        var byId = {};
        allNodes.forEach(function (n) { byId[n.id] = n; });

        /* ---- DOM + canvas --------------------------------------------- */

        ns.setChildren(container);
        container.classList.add('rv-graph-stage');

        var canvas = document.createElement('canvas');
        canvas.className = 'rv-graph-canvas';
        canvas.tabIndex = 0;
        canvas.setAttribute('role', 'application');
        canvas.setAttribute('aria-label', spec.ariaLabel || ns.t('graphCanvasLabel',
            'Network graph. Use the arrow keys to move between connected entities and Enter to open one.'));
        container.appendChild(canvas);

        var tooltip = ns.el('div', 'rv-graph-tooltip');
        tooltip.hidden = true;
        container.appendChild(tooltip);

        var status = ns.el('p', 'rv-graph-status');
        status.setAttribute('aria-live', 'polite');
        container.appendChild(status);

        // The wheel hint: a plain scroll over the graph scrolls the page, so say
        // once, over the canvas, how to zoom instead — MapLibre's cooperative
        // gestures on the module's maps do the same. aria-hidden: it answers a
        // mouse gesture, and the canvas label already gives the keyboard route.
        var mac = /Mac|iPhone|iPad/.test((navigator.userAgentData && navigator.userAgentData.platform)
            || navigator.platform || '');
        var wheelHint = ns.el('div', 'rv-graph-wheel-hint');
        wheelHint.appendChild(ns.el('span', null, mac
            ? ns.t('graphGestureMac', 'Use ⌘ + scroll to zoom the graph')
            : ns.t('graphGestureWindows', 'Use Ctrl + scroll to zoom the graph')));
        wheelHint.setAttribute('aria-hidden', 'true');
        container.appendChild(wheelHint);
        var wheelHintTimer = 0;

        var gc = ns.GraphCanvas.create(container, canvas);

        /* ---- State ---------------------------------------------------- */

        var pass = { nodes: [], links: [], deg: {}, adj: {} };
        var engine = null;
        var lastBuild = null;     // the pass the engine holds, to rebuild on a fallback
        var placed = false;       // the nodes have positions (the worker answers later)
        var loadingEl = null;     // shown over the stage until they do
        var hoverId = null;       // node under the pointer (transient, desktop only)
        var hoverLink = null;     // link under the pointer (only when no node is)
        var focusId = null;       // keyboard focus
        var selectedId = null;    // the reader's anchor — persists until they clear it
        var showHalos = true;
        var labelsAll = false;
        var edgeLabels = false;
        var frozen = false;
        var hiddenCats = {};      // category index → true when toggled off
        var onPinChangeCb = null;
        var onThemeCb = null;
        var onSelectCb = null;
        // Bumped whenever the picture under the focus changes (positions, colours,
        // visibility, rings). graph-canvas.js caches the dimmed graph against it, so
        // hovering and selecting redraw only the neighbourhood.
        var version = 0;

        function isVisible(n) { return !hiddenCats[n.category]; }
        // The visible sets are read on every pointer move and every paint; they
        // only change with the pass, the category toggles and the categories.
        var visCache = null;
        function visible() {
            if (!visCache) {
                visCache = {
                    nodes: pass.nodes.filter(isVisible),
                    links: pass.links.filter(function (l) { return isVisible(l.source) && isVisible(l.target); })
                };
            }
            return visCache;
        }
        function visibleNodes() { return visible().nodes; }
        function visibleLinks() { return visible().links; }

        function pinnedCount() {
            var c = 0;
            for (var i = 0; i < allNodes.length; i++) if (allNodes[i].pinned) c++;
            return c;
        }
        function firePinChange() { if (onPinChangeCb) onPinChangeCb(pinnedCount()); }

        /**
         * The focus set: the anchor node plus its neighbours, everything else dimmed.
         *
         * A selection outranks a hover, so moving the pointer away does not throw
         * away the neighbourhood the reader deliberately picked — that is the whole
         * point of selecting rather than hovering.
         */
        function focusSet() {
            var id = selectedId || hoverId || focusId;
            if (!id) return null;
            var set = {};
            set[id] = true;
            var nb = pass.adj[id] || {};
            for (var k in nb) set[k] = true;
            return set;
        }

        /** The snapshot graph-canvas.js paints from. */
        function scene() {
            var vis = placed ? visible() : { nodes: [], links: [] };
            return {
                nodes: vis.nodes, links: vis.links, categories: categories,
                colorOf: colorOf, haloOf: haloOf, linkColorOf: linkColorOf,
                hoverId: hoverId, focusId: focusId, selectedId: selectedId,
                hoverLink: hoverLink, focusSet: focusSet(),
                showHalos: showHalos, labelsAll: labelsAll, edgeLabels: edgeLabels,
                version: version
            };
        }

        /**
         * Make a node the reader's anchor (or clear it with null). Highlights its
         * neighbourhood, labels its edges, and hands it to the chrome so a detail
         * card can offer an explicit link — instead of a click silently navigating
         * away, which fought exploration and had no touch story.
         */
        function select(node) {
            var id = node ? node.id : null;
            if (id === selectedId) return;
            selectedId = id;
            hideTooltip();
            if (onSelectCb) onSelectCb(node || null);
            requestPaint();
        }

        var paintQueued = false;
        var destroyed = false;
        function requestPaint() {
            if (paintQueued || destroyed) return;
            paintQueued = true;
            requestAnimationFrame(function () {
                paintQueued = false;
                if (!destroyed) gc.paint(scene());
            });
        }
        /** Repaint after a change to the picture itself, not just the emphasis. */
        function invalidate() {
            version++;
            requestPaint();
        }

        function resize() {
            if (destroyed) return;
            var changed = gc.resize();
            if (!gc.width() || !gc.height()) return;    // collapsed <details>, not laid out yet
            if (changed && placed && !gc.isUserAdjusted()) gc.fit(visibleNodes());
            invalidate();
        }

        /* ---- Simulation ----------------------------------------------- */

        /** A frame from the engine: the positions moved. */
        function onFrame() {
            if (destroyed) return;
            if (!placed) {
                placed = true;
                if (loadingEl) { loadingEl.remove(); loadingEl = null; }
                if (gc.width() && gc.height() && !gc.isUserAdjusted()) gc.fit(visibleNodes());
            }
            invalidate();
        }

        /** The worker could not run this graph: simulate it on the page instead. */
        function fallBack() {
            if (destroyed) return;
            engine = localEngine(makeRng(seed), onFrame);
            if (lastBuild) engine.build(lastBuild.nodes, lastBuild.links, lastBuild.opts);
        }

        function engineFor() {
            if (engine) return engine;
            if (allNodes.length >= WORKER_MIN_NODES) engine = workerEngine(seed, onFrame, fallBack);
            if (!engine) engine = localEngine(makeRng(seed), onFrame);
            return engine;
        }

        /**
         * Swap in a new visible node/link set. Positions carry over, so a filter
         * change is a gentle re-settle rather than a fresh layout.
         *
         * @param {Object} graph {nodes: [{id}], links: [{source, target, …}]}
         * @param {boolean} warm true for an update, false for the first build
         */
        function setGraph(graph, warm) {
            var nodes = (graph.nodes || [])
                .map(function (n) { return byId[n && n.id ? n.id : n]; })
                .filter(Boolean);
            var present = {};
            nodes.forEach(function (n) { present[n.id] = true; });

            var deg = {};
            var links = [];
            (graph.links || []).forEach(function (l) {
                if (!present[l.source] || !present[l.target]) return;
                deg[l.source] = (deg[l.source] || 0) + 1;
                deg[l.target] = (deg[l.target] || 0) + 1;
                // Endpoints are resolved to node objects HERE: d3's forceLink only
                // runs its id lookup when an endpoint is not already an object, so
                // pre-resolving keeps the two sides in step with the filter.
                links.push({
                    source: byId[l.source], target: byId[l.target], name: l.name || '',
                    weak: !!l.weak, width: l.width || 1.5, alpha: l.alpha || 0.6,
                    data: l.data || l
                });
            });

            var adj = {};
            links.forEach(function (l) {
                (adj[l.source.id] || (adj[l.source.id] = {}))[l.target.id] = l;
                (adj[l.target.id] || (adj[l.target.id] = {}))[l.source.id] = l;
            });

            nodes.forEach(function (n) {
                n.deg = deg[n.id] || 0;
                n.r = radiusOf(n);
                // The centre anchors the layout at the origin until the reader drags
                // it somewhere better.
                if (n.isCenter && n.fx === undefined && !n.pinned) { n.fx = 0; n.fy = 0; }
            });

            pass = { nodes: nodes, links: links, deg: deg, adj: adj };
            visCache = null;

            // Hover state points at objects from the OLD pass — a link that a filter
            // just dropped would otherwise keep a tooltip open over a line that is no
            // longer drawn.
            hoverId = null;
            hoverLink = null;
            if (focusId && !present[focusId]) { focusId = null; announce(null); }
            if (selectedId && !present[selectedId]) select(null);
            hideTooltip();

            buildSimulation(nodes, links, deg, warm);
        }

        function buildSimulation(nodes, links, deg, warm) {
            var count = nodes.length;
            var dScale = count > 150 ? 0.78 : count > 80 ? 0.88 : 1;
            var cScale = count > 150 ? 0.7 : count > 80 ? 0.85 : 1;

            // Warm start: step without painting so the graph appears already
            // organised rather than exploding out of one point. Under
            // prefers-reduced-motion, settle it fully and never animate.
            var opts = {
                distanceMax: count > 120 ? 700 : 1400,
                warmup: reduced ? 400 : (warm ? 34 : 78),
                warm: !!warm,
                animate: !reduced && !frozen,
                charge: function (n) { return forces.chargeOf(n, cScale); },
                distance: function (l) { return forces.distance(l, deg, dScale); },
                strength: function (l) { return forces.linkStrength(l, deg); }
            };
            lastBuild = { nodes: nodes, links: links, opts: opts };
            var eng = engineFor();
            if (!placed && !loadingEl && eng.async) {
                // The worker answers in a moment; say so rather than show a blank.
                loadingEl = ns.loadingIndicator
                    ? ns.loadingIndicator(ns.t('loading', 'Loading…'))
                    : ns.el('div', 'rv-loading', ns.t('loading', 'Loading…'));
                loadingEl.classList.add('rv-graph-loading');
                container.appendChild(loadingEl);
            }
            eng.build(nodes, links, opts);
        }

        /* ---- Tooltip -------------------------------------------------- */

        var tipFor = null;        // the node or link the tooltip currently shows
        var tipW = 0, tipH = 0;   // its size, measured once per content change

        function hideTooltip() {
            tooltip.hidden = true;
            tipFor = null;
            ns.setChildren(tooltip);
        }

        function showTooltip(px, py, node, link) {
            var target = node || link;
            if (target !== tipFor || tooltip.hidden) {
                var rows = spec.tooltip ? spec.tooltip(node, link, {}) : null;
                if (!rows || !rows.length) { hideTooltip(); return; }
                ns.setChildren(tooltip, rows);
                tooltip.hidden = false;
                tipFor = target;
                // One layout read per new content, not one per pointer move.
                tipW = tooltip.offsetWidth;
                tipH = tooltip.offsetHeight;
            }
            // Confine to the stage, flipping side when the pointer nears an edge.
            var W = gc.width(), H = gc.height();
            var left = px + 14, top = py + 14;
            if (left + tipW > W - 6) left = Math.max(6, px - tipW - 14);
            if (top + tipH > H - 6) top = Math.max(6, py - tipH - 14);
            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
        }

        /* ---- Pointer interaction -------------------------------------- */

        var pointers = {};        // active pointerId → {x, y}
        var dragNode = null;
        var dragHot = false;      // the held node has moved: the layout is reheated
        var panning = false;
        var pressStart = null;    // {x, y, time, alt}
        var pinchStart = null;    // {dist, k, cx, cy}

        function localPos(ev) {
            var rect = canvas.getBoundingClientRect();
            return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
        }

        function pointerPair() {
            var ids = Object.keys(pointers);
            return ids.length === 2 ? [pointers[ids[0]], pointers[ids[1]]] : null;
        }

        canvas.addEventListener('pointerdown', function (ev) {
            canvas.focus({ preventScroll: true });
            var p = localPos(ev);
            pointers[ev.pointerId] = p;

            var pair = pointerPair();
            if (pair) {
                // Second finger: switch from pan/drag to pinch-zoom.
                pinchStart = {
                    dist: Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) || 1,
                    k: gc.view.k,
                    cx: (pair[0].x + pair[1].x) / 2, cy: (pair[0].y + pair[1].y) / 2
                };
                releaseDrag(false);
                panning = false;
                return;
            }

            var hit = placed ? gc.nodeAt(visibleNodes(), p.x, p.y) : null;
            pressStart = { x: p.x, y: p.y, time: performance.now(), alt: ev.altKey };
            if (hit) {
                // Held, but the layout is only reheated once the pointer actually
                // travels (pointermove): a click that selects a node used to set the
                // whole graph moving for a second or two.
                dragNode = hit;
                dragHot = false;
                hit.fx = hit.x; hit.fy = hit.y;
                engine.fix(hit);
            } else {
                panning = true;
                hideTooltip();
            }
            try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
            ev.preventDefault();
        });

        canvas.addEventListener('pointermove', function (ev) {
            var p = localPos(ev);
            var known = pointers[ev.pointerId];
            if (known) { known.x = p.x; known.y = p.y; }

            var pair = pinchStart && pointerPair();
            if (pair) {
                var dist = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) || 1;
                var mid = { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 };
                gc.pinch(pinchStart.k * (dist / pinchStart.dist),
                    { x: pinchStart.cx, y: pinchStart.cy }, mid);
                pinchStart.cx = mid.x; pinchStart.cy = mid.y;
                pinchStart.k = gc.view.k; pinchStart.dist = dist;
                requestPaint();
                return;
            }

            if (dragNode) {
                if (!dragHot) {
                    if (!pressStart || Math.hypot(p.x - pressStart.x, p.y - pressStart.y) < 3) return;
                    dragHot = true;
                    if (!frozen && !reduced) engine.alphaTarget(0.22, true);
                }
                var w = gc.toWorld(p.x, p.y);
                // The held node follows the pointer at once; the engine relaxes the
                // rest around it (a worker answers a frame later).
                dragNode.fx = w.x; dragNode.fy = w.y;
                dragNode.x = w.x; dragNode.y = w.y;
                engine.fix(dragNode);
                if (frozen) {
                    engine.tick(1);                    // frozen means frozen
                } else if (reduced) {
                    // No animation loop under prefers-reduced-motion, so relax the
                    // neighbourhood synchronously — direct manipulation still has to
                    // respond, it just never animates on its own.
                    engine.tick(2, 0.12);
                }
                invalidate();
                return;
            }
            if (panning && pressStart) {
                gc.panBy(p.x - pressStart.x, p.y - pressStart.y);
                pressStart.x = p.x; pressStart.y = p.y;
                requestPaint();
                return;
            }
            if (!placed) return;

            var hit = gc.nodeAt(visibleNodes(), p.x, p.y);
            var lnk = hit ? null : gc.linkAt(visibleLinks(), p.x, p.y);
            var changed = (hit ? hit.id : null) !== hoverId || lnk !== hoverLink;
            hoverId = hit ? hit.id : null;
            hoverLink = lnk;
            canvas.style.cursor = hit ? 'pointer' : (lnk ? 'help' : 'grab');
            if (hit || lnk) showTooltip(p.x, p.y, hit, lnk); else if (!tooltip.hidden) hideTooltip();
            if (changed) requestPaint();
        });

        function releaseDrag(keepPin) {
            if (!dragNode) return;
            if (keepPin) {
                dragNode.pinned = true;
            } else if (!dragNode.isCenter) {
                dragNode.fx = null; dragNode.fy = null;
            }
            engine.fix(dragNode);
            dragNode = null;
            if (dragHot && !frozen && !reduced) engine.alphaTarget(0, false);
            dragHot = false;
            firePinChange();
        }

        function endPointer(ev) {
            delete pointers[ev.pointerId];
            if (Object.keys(pointers).length < 2) pinchStart = null;

            var wasDrag = dragNode;
            var start = pressStart;
            if (wasDrag && start) {
                var p = localPos(ev);
                if (Math.hypot(p.x - start.x, p.y - start.y) < 5 && performance.now() - start.time < 500) {
                    releaseDrag(false);                          // a click, not a drag
                    activate(wasDrag, start.alt);
                } else {
                    releaseDrag(true);                           // deliberate drag: it stays
                }
            } else {
                releaseDrag(false);
                // A click on empty canvas — not a pan — clears the anchor, the same
                // way Escape does. Distinguished by travel, like the node click above.
                if (start && Math.hypot(localPos(ev).x - start.x, localPos(ev).y - start.y) < 5) {
                    select(null);
                }
            }
            panning = false;
            pressStart = null;
            // A drag may have pinned a node (its ring belongs to the picture).
            if (wasDrag) invalidate(); else requestPaint();
        }

        canvas.addEventListener('pointerup', endPointer);
        canvas.addEventListener('pointercancel', endPointer);
        canvas.addEventListener('pointerleave', function () {
            if (!dragNode && !panning) { hoverId = null; hoverLink = null; hideTooltip(); requestPaint(); }
        });

        /**
         * Click / tap / Enter on a node. Alt-click releases a pin; otherwise the node
         * becomes the selection. It deliberately does NOT navigate: opening the record
         * is a second, explicit act on the real link in the detail card, which works
         * the same on a mouse and a finger and can be copied or opened in a new tab.
         */
        function activate(node, alt) {
            if (alt) {
                node.pinned = false;
                if (node.isCenter) { node.fx = 0; node.fy = 0; } else { node.fx = null; node.fy = null; }
                engine.fix(node);
                firePinChange();
                if (!frozen && !reduced) engine.alpha(0.2, true);
                invalidate();
                return;
            }
            select(node.id === selectedId ? null : node);   // clicking it again clears
        }

        // Double-click the background to zoom (Alt to zoom out) — the gesture that
        // spares readers the Ctrl+scroll discovery problem on a desktop.
        canvas.addEventListener('dblclick', function (ev) {
            var p = localPos(ev);
            if (gc.nodeAt(visibleNodes(), p.x, p.y)) return;
            if (gc.zoomAt(p.x, p.y, ev.altKey ? 1 / 1.5 : 1.5)) requestPaint();
            ev.preventDefault();
        });

        // Plain wheel keeps scrolling the page — the graph sits mid-article and
        // hijacking the wheel there is the classic embedded-map trap. Ctrl/⌘+wheel
        // zooms, and in fullscreen there is no page to scroll so the wheel is ours.
        canvas.addEventListener('wheel', function (ev) {
            if (!container.closest('.rv-fullscreen') && !ev.ctrlKey && !ev.metaKey) {
                // A horizontal trackpad swipe is not an attempt to zoom.
                if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) showWheelHint();
                return;
            }
            hideWheelHint();
            ev.preventDefault();
            var p = localPos(ev);
            if (gc.zoomAt(p.x, p.y, ev.deltaY < 0 ? 1.12 : 1 / 1.12)) requestPaint();
        }, { passive: false });

        function showWheelHint() {
            wheelHint.classList.add('rv-graph-wheel-hint-on');
            clearTimeout(wheelHintTimer);
            wheelHintTimer = setTimeout(hideWheelHint, 1400);
        }
        function hideWheelHint() {
            clearTimeout(wheelHintTimer);
            wheelHint.classList.remove('rv-graph-wheel-hint-on');
        }

        /** Zoom about the centre of the stage — the buttons' and the keys' zoom. */
        function zoomBy(factor) {
            if (gc.zoomAt(gc.width() / 2, gc.height() / 2, factor)) requestPaint();
        }

        /* ---- Keyboard ------------------------------------------------- */

        /** Nodes in a stable reading order: centre first, then by degree. */
        function keyboardOrder() {
            return visibleNodes().slice().sort(function (a, b) {
                if (a.isCenter !== b.isCenter) return a.isCenter ? -1 : 1;
                return (b.deg || 0) - (a.deg || 0) || a.name.localeCompare(b.name);
            });
        }

        function announce(node) {
            status.textContent = (node && spec.announce) ? spec.announce(node) : '';
        }

        // Tab is deliberately NOT handled: it must always take the reader out of the
        // canvas. The arrows follow the hub-and-neighbours model every graph on the
        // site shares (ns.graphStep, dashboard-core); this keeps its walk state.
        var walk = { hub: null, cursor: -1 };

        function visibleNeighbours(id) {
            return Object.keys(pass.adj[id] || {}).filter(function (other) {
                return byId[other] && isVisible(byId[other]);
            });
        }

        canvas.addEventListener('keydown', function (ev) {
            if (!placed) return;
            var order = keyboardOrder().map(function (n) { return n.id; });
            if (!order.length) return;
            var nextId = ns.graphStep(ev.key, order, focusId, walk, visibleNeighbours);
            var next = nextId == null ? null : byId[nextId];
            if (next) {
                focusId = next.id;
                gc.centerOn(next);
                announce(next);
                requestPaint();
                ev.preventDefault();
                return;
            }

            if (ev.key === 'Enter' || ev.key === ' ') {
                if (focusId && byId[focusId]) { activate(byId[focusId], ev.altKey); ev.preventDefault(); }
                return;
            } else if (ev.key === '+' || ev.key === '=') {
                zoomBy(1.25); ev.preventDefault(); return;
            } else if (ev.key === '-' || ev.key === '_') {
                zoomBy(1 / 1.25); ev.preventDefault(); return;
            } else if (ev.key === '0') {
                gc.fit(visibleNodes()); requestPaint(); ev.preventDefault(); return;
            } else if (ev.key === 'Escape') {
                // Selection first, then keyboard focus: two Escapes to leave the
                // graph entirely, and neither one reaches the fullscreen handler
                // while there is still something in the graph to clear.
                if (selectedId) { select(null); ev.stopPropagation(); return; }
                if (focusId) { focusId = null; announce(null); requestPaint(); ev.stopPropagation(); }
            }
        });

        canvas.addEventListener('blur', function () {
            focusId = null;
            walk.hub = null;
            walk.cursor = -1;
            announce(null);
            requestPaint();
        });

        /* ---- Resize + theme ------------------------------------------- */

        var observer = null;
        if (window.ResizeObserver) {
            observer = new ResizeObserver(function () { resize(); });
            observer.observe(container);
        } else {
            window.addEventListener('resize', resize);
        }

        // A pixel-ratio change (window dragged to another screen, browser zoom)
        // leaves the box size alone, so the observer never fires; listen for the
        // current ratio to stop matching instead, then re-arm for the new one.
        var ratioQuery = null;
        function onRatioChange() {
            if (ratioQuery) ratioQuery.removeEventListener('change', onRatioChange);
            ratioQuery = null;
            if (destroyed) return;
            resize();
            watchRatio();
        }
        function watchRatio() {
            if (!window.matchMedia) return;
            ratioQuery = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
            if (ratioQuery.addEventListener) ratioQuery.addEventListener('change', onRatioChange);
            else ratioQuery = null;
        }
        watchRatio();

        /**
         * Tear the graph down. Needed wherever a container is REPLACED rather than
         * navigated away from — the Network Explorer swaps one network for another
         * in the same panel, and a simulation left running would keep ticking (and
         * repainting into a detached canvas) for the life of the page. A worker is
         * terminated with it.
         */
        function destroy() {
            if (destroyed) return;
            destroyed = true;
            if (untrack) untrack();
            if (engine) engine.destroy();
            clearTimeout(wheelHintTimer);
            if (observer) observer.disconnect();
            else window.removeEventListener('resize', resize);
            if (ratioQuery) ratioQuery.removeEventListener('change', onRatioChange);
            hideTooltip();
        }

        // A light/dark toggle only needs a repaint with the freshly read tokens —
        // the layout must survive it, so this deliberately does not re-simulate.
        var untrack = ns.trackRenderer(container, function () {
            version++;
            gc.paint(scene());
            if (onThemeCb) onThemeCb();
        }, destroy);

        /* ---- Public surface ------------------------------------------- */

        return {
            setGraph: function (graph, warm) { setGraph(graph, warm); invalidate(); },
            resize: resize,
            destroy: destroy,
            repaint: invalidate,
            resetView: function () { gc.fit(visibleNodes()); requestPaint(); },
            zoomBy: zoomBy,
            categoriesInUse: function () {
                var used = {};
                pass.nodes.forEach(function (n) { used[n.category] = true; });
                return used;
            },
            toggleCategory: function (i, visible) {
                if (visible) delete hiddenCats[i]; else hiddenCats[i] = true;
                visCache = null;
                hideTooltip();
                invalidate();
            },
            /**
             * Recolour by another grouping without touching the layout: new
             * categories, their colours, and each node's category (`categoryOf`
             * is called with the node). Every category is shown again.
             */
            setCategories: function (cats, colours, categoryOf) {
                categories = cats || [];
                colorOf = colours;
                hiddenCats = {};
                allNodes.forEach(function (n) { n.category = categoryOf(n); });
                visCache = null;
                hideTooltip();
                invalidate();
            },
            toggleHalos: function () { showHalos = !showHalos; invalidate(); return showHalos; },
            toggleLabels: function () { labelsAll = !labelsAll; requestPaint(); return labelsAll; },
            toggleFrozen: function () {
                frozen = !frozen;
                if (!engine) return frozen;
                if (frozen) engine.stop(); else if (!reduced) engine.alpha(0.2, true);
                return frozen;
            },
            unpinAll: function () {
                allNodes.forEach(function (n) {
                    n.pinned = false;
                    if (n.isCenter) { n.fx = 0; n.fy = 0; } else { n.fx = null; n.fy = null; }
                    if (engine) engine.fix(n);
                });
                firePinChange();
                if (engine && !frozen && !reduced) engine.alpha(0.3, true);
                invalidate();
            },
            toggleEdgeLabels: function () { edgeLabels = !edgeLabels; requestPaint(); return edgeLabels; },
            select: function (id) { select(id ? byId[id] || null : null); },
            selected: function () { return selectedId ? byId[selectedId] : null; },
            onSelect: function (cb) { onSelectCb = cb; },
            onPinChange: function (cb) { onPinChangeCb = cb; },
            onTheme: function (cb) { onThemeCb = cb; },
            pinnedCount: pinnedCount,
            reducedMotion: reduced,
            visibleNodes: function () { return visibleNodes().slice(); },
            adjacency: function () { return pass.adj; },
            toDataURL: function () { return gc.exportPng(scene()); }
        };
    }

    ns.ForceGraph = { create: create, DEFAULT_FORCES: DEFAULT_FORCES, WORKER_MIN_NODES: WORKER_MIN_NODES };
})();
