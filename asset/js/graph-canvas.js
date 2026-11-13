/**
 * GraphCanvas — the view transform, the painter and the hit tests for a node-link
 * canvas. Everything that turns graph coordinates into pixels, and pixels back
 * into a node.
 *
 * Deliberately knows nothing about d3, simulations, filters or Omeka: hand it a
 * *scene* (visible nodes and links, plus the focus/label flags) and it draws. That
 * boundary is what lets one painter serve the live canvas AND the 2× PNG export,
 * and lets graph-force.js stay a controller.
 *
 * Coordinates: nodes carry world-space `x`/`y`; screen = world · k + (x, y). The
 * transform lives here and the simulation never sees it, so panning and zooming
 * cannot move a node, and a re-settle cannot yank the viewport.
 *
 * Depends on: dashboard-core.js (ns.THEME, ns.truncateLabel, ns.exportBg).
 *
 * The hit-testing geometry — screen projection, node and link hit tests — is
 * pure maths over a { x, y, k } view and is published separately as
 * ns.graphGeometry, so tests/js/graph-geometry.test.mjs can exercise it with
 * no DOM at all.
 *
 * A scene is:
 *   { nodes, links,                              // already visibility-filtered
 *     categories, colorOf, haloOf, linkColorOf,  // style hooks
 *     hoverId, focusId, hoverLink, focusSet,
 *     showHalos, labelsAll }
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) { console.warn('DreVisualizations: dashboard-core.js must load before graph-canvas.js'); return; }

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    var MIN_ZOOM = 0.2;
    var MAX_ZOOM = 6;
    var LABEL_BUDGET = 46;      // labels drawn before the painter stops trying

    /* ------------------------------------------------------------------ */
    /*  Hit-testing geometry — pure: no DOM, no canvas                     */
    /* ------------------------------------------------------------------ */

    var HIT_SLOP = 3;           // px added to a node's radius when hit testing
    var MIN_HIT_RADIUS = 6;     // px: a node zoomed out to a speck stays clickable
    var LINK_HIT = 36;          // 6px, squared

    /** Screen x / y of a world-space point under the view { x, y, k }. */
    function screenXIn(view, n) { return n.x * view.k + view.x; }
    function screenYIn(view, n) { return n.y * view.k + view.y; }

    /** A node's clickable radius on screen: its drawn radius, floored, plus slop. */
    function hitRadius(r, k) { return Math.max(MIN_HIT_RADIUS, r * k) + HIT_SLOP; }

    /**
     * The node under a screen point, or null. Where hit areas overlap the
     * nearest centre wins, and on a tie the node painted last (on top).
     */
    function nodeAt(nodes, view, px, py) {
        var best = null, bestD = Infinity;
        for (var i = nodes.length - 1; i >= 0; i--) {
            var n = nodes[i];
            var r = hitRadius(n.r, view.k);
            var dx = screenXIn(view, n) - px, dy = screenYIn(view, n) - py;
            var d = dx * dx + dy * dy;
            if (d <= r * r && d < bestD) { best = n; bestD = d; }
        }
        return best;
    }

    /** The link nearest a screen point within LINK_HIT (squared px), or null. */
    function linkAt(links, view, px, py) {
        var best = null, bestD = LINK_HIT;
        for (var i = 0; i < links.length; i++) {
            var l = links[i];
            var d = distToSegment(px, py, screenXIn(view, l.source), screenYIn(view, l.source),
                screenXIn(view, l.target), screenYIn(view, l.target));
            if (d < bestD) { bestD = d; best = l; }
        }
        return best;
    }

    /** Squared distance point→segment — the arc's chord is close enough here. */
    function distToSegment(px, py, x1, y1, x2, y2) {
        var dx = x2 - x1, dy = y2 - y1;
        var len = dx * dx + dy * dy;
        var t = clamp(len ? ((px - x1) * dx + (py - y1) * dy) / len : 0, 0, 1);
        var ex = x1 + t * dx - px, ey = y1 + t * dy - py;
        return ex * ex + ey * ey;
    }

    ns.graphGeometry = {
        HIT_SLOP: HIT_SLOP,
        MIN_HIT_RADIUS: MIN_HIT_RADIUS,
        LINK_HIT: LINK_HIT,
        screenX: screenXIn,
        screenY: screenYIn,
        hitRadius: hitRadius,
        nodeAt: nodeAt,
        linkAt: linkAt,
        distToSegment: distToSegment
    };

    /* ------------------------------------------------------------------ */
    /*  Canvas                                                             */
    /* ------------------------------------------------------------------ */

    function create(host, canvas) {
        var ctx = canvas.getContext('2d');
        var view = { x: 0, y: 0, k: 1 };
        var userAdjusted = false;   // once true, a resize stops re-fitting
        var W = 0, H = 0, dpr = 1;

        /* ---- Transform ------------------------------------------------- */

        function toWorld(sx, sy) {
            return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
        }
        function screenX(n) { return screenXIn(view, n); }
        function screenY(n) { return screenYIn(view, n); }

        function zoomAt(sx, sy, factor) {
            var k = clamp(view.k * factor, MIN_ZOOM, MAX_ZOOM);
            if (k === view.k) return false;
            view.x = sx - (sx - view.x) * (k / view.k);
            view.y = sy - (sy - view.y) * (k / view.k);
            view.k = k;
            userAdjusted = true;
            return true;
        }

        /** Pan by a screen-space delta. */
        function panBy(dx, dy) {
            view.x += dx;
            view.y += dy;
            userAdjusted = true;
        }

        /**
         * Absolute pinch update: scale about `from`, then follow the midpoint's own
         * travel to `to`, so one two-finger gesture pans and zooms together.
         */
        function pinch(k, from, to) {
            k = clamp(k, MIN_ZOOM, MAX_ZOOM);
            view.x = from.x - (from.x - view.x) * (k / view.k) + (to.x - from.x);
            view.y = from.y - (from.y - view.y) * (k / view.k) + (to.y - from.y);
            view.k = k;
            userAdjusted = true;
        }

        /** Fit every given node into the canvas, leaving room for the labels. */
        function fit(nodes) {
            if (!nodes.length || !W || !H) return;
            var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            nodes.forEach(function (n) {
                var r = n.r + 6;
                if (n.x - r < minX) minX = n.x - r;
                if (n.y - r < minY) minY = n.y - r;
                if (n.x + r > maxX) maxX = n.x + r;
                if (n.y + r > maxY) maxY = n.y + r;
            });
            var pad = 26;
            view.k = clamp(Math.min((W - pad * 2 - 90) / Math.max(1, maxX - minX),
                (H - pad * 2) / Math.max(1, maxY - minY)), MIN_ZOOM, 1.6);
            view.x = (W - (minX + maxX) * view.k) / 2;
            view.y = (H - (minY + maxY) * view.k) / 2;
            userAdjusted = false;
        }

        /** Bring a node to the middle without changing the zoom level. */
        function centerOn(node) {
            view.x = W / 2 - node.x * view.k;
            view.y = H / 2 - node.y * view.k;
            userAdjusted = true;
        }

        /**
         * Match the backing store to the host box + pixel ratio. Returns false when
         * nothing changed, which is what stops a ResizeObserver loop: this writes an
         * inline px size onto the canvas, so any layout in which the canvas can
         * influence the host would otherwise ratchet. The CSS keeps the canvas out
         * of flow; this is the second line of defence, and it also means a spurious
         * observer callback costs nothing.
         */
        function resize() {
            var rect = host.getBoundingClientRect();
            if (!rect.width || !rect.height) return false;
            var ratio = Math.min(window.devicePixelRatio || 1, 2);
            var w = Math.round(rect.width);
            var h = Math.round(rect.height);
            if (w === W && h === H && ratio === dpr) return false;
            dpr = ratio;
            W = w;
            H = h;
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            canvas.style.width = W + 'px';
            canvas.style.height = H + 'px';
            return true;
        }

        /* ---- Painting -------------------------------------------------- */

        /**
         * Edges, batched: one path per distinct stroke (colour, width, opacity,
         * dash) instead of one stroke() per edge. The co-author network has ~2,600
         * edges and only a handful of distinct strokes, and per-edge state changes
         * and strokes were most of the cost of a frame. Within one path overlapping
         * edges no longer darken each other, which reads as a calmer hairball.
         * Emphasised strokes are drawn last, so the focus sits on top of the rest.
         *
         * `o.onlyFocus` draws just the emphasised edges — the overlay painted over
         * the cached, dimmed graph (see paint()).
         */
        function drawEdges(c, scene, o) {
            var THEME = ns.THEME;
            var fset = scene.focusSet;
            var k = view.k, vx = view.x, vy = view.y;
            var widthScale = clamp(k, 0.75, 1.6);
            var groups = {};
            var order = [];
            var links = scene.links;
            for (var i = 0; i < links.length; i++) {
                var l = links[i];
                var inFocus = !fset || (fset[l.source.id] && fset[l.target.id]);
                var hovered = (l === scene.hoverLink);
                if (o.onlyFocus && !hovered && !inFocus) continue;
                var alpha = inFocus ? l.alpha : l.alpha * 0.07;
                if (alpha < 0.012) continue;
                // An optional per-link colour carries an edge ATTRIBUTE the reader
                // needs to tell apart — a co-authorship from an author–editor tie,
                // say. Emphasis still wins over it: a hovered or in-focus edge goes
                // accent, because "which edges belong to this node" is the more
                // urgent question the moment there is a focus at all.
                var emphasis = hovered ? 2 : (fset && inFocus ? 1 : 0);
                var own = emphasis ? null : (scene.linkColorOf ? scene.linkColorOf(l) : null);
                var stroke = emphasis ? THEME.accent : (own || (l.weak ? THEME.grid : THEME.textMuted));
                var width = (hovered ? l.width + 1.4 : (emphasis ? l.width + 0.8 : l.width)) * widthScale;
                var key = stroke + '|' + emphasis + '|' + width + '|' + alpha + '|' + (l.weak ? 1 : 0);
                var g = groups[key];
                if (!g) {
                    g = groups[key] = { emphasis: emphasis, stroke: stroke, width: width, alpha: alpha, weak: l.weak, path: new Path2D() };
                    order.push(g);
                }
                var x1 = l.source.x * k + vx, y1 = l.source.y * k + vy;
                var x2 = l.target.x * k + vx, y2 = l.target.y * k + vy;
                // A slight arc separates the several statements that can join one
                // pair, and keeps a dense hub from collapsing into a single blob.
                var dx = x2 - x1, dy = y2 - y1;
                g.path.moveTo(x1, y1);
                g.path.quadraticCurveTo((x1 + x2) / 2 - dy * 0.075, (y1 + y2) / 2 + dx * 0.075, x2, y2);
            }
            order.sort(function (a, b) { return a.emphasis - b.emphasis; });
            c.lineCap = 'round';
            order.forEach(function (g) {
                c.globalAlpha = g.alpha;
                c.strokeStyle = g.stroke;
                c.lineWidth = g.width;
                c.setLineDash(g.weak ? [4 * k, 3 * k] : []);
                c.stroke(g.path);
            });
            c.setLineDash([]);
            c.globalAlpha = 1;
        }

        /**
         * Nodes, batched like the edges: one path per fill/outline/opacity, filled
         * then outlined, so ~950 discs cost a dozen draw calls rather than ~1,900.
         * The collision force keeps discs from overlapping, so painting them by
         * group rather than one by one does not change the picture. The rings that
         * mark a pinned, selected or focused node are few and drawn after, one by one.
         */
        function drawNodes(c, scene, o) {
            var THEME = ns.THEME;
            var fset = scene.focusSet;
            var k = view.k, vx = view.x, vy = view.y;
            var TAU = Math.PI * 2;
            var groups = {};
            var order = [];
            var marked = [];
            var nodes = scene.nodes;
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                if (o.onlyFocus && fset && !fset[n.id]) continue;
                var r = Math.max(1.6, n.r * k);
                var x = n.x * k + vx, y = n.y * k + vy;
                if (x < -r - 40 || y < -r - 40 || x > o.w + r + 40 || y > o.h + r + 40) continue;
                var dim = fset && !fset[n.id];
                // Small nodes sit a touch back from the primary ones.
                var recessive = !n.isCenter && n.size <= 16;
                var alpha = dim ? 0.12 : (recessive ? 0.88 : 1);
                var fill = scene.colorOf(n.category);

                var halo = (n.isCenter || !scene.showHalos) ? null : scene.haloOf(n);
                var stroke, width;
                if (n.isCenter) {
                    stroke = THEME.text;
                    width = Math.max(2, 3 * Math.min(k, 1.4));
                } else if (halo) {
                    stroke = halo;
                    width = Math.max(1.5, 3 * Math.min(k, 1.2));
                } else {
                    stroke = THEME.border;
                    width = 1;
                }
                var key = fill + '|' + stroke + '|' + width + '|' + alpha;
                var g = groups[key];
                if (!g) {
                    g = groups[key] = { fill: fill, stroke: stroke, width: width, alpha: alpha, path: new Path2D() };
                    order.push(g);
                }
                g.path.moveTo(x + r, y);
                g.path.arc(x, y, r, 0, TAU);
                if (n.pinned || n.id === scene.selectedId || n.id === scene.focusId) {
                    marked.push({ n: n, x: x, y: y, r: r, alpha: alpha });
                }
            }
            order.forEach(function (g) {
                c.globalAlpha = g.alpha;
                c.fillStyle = g.fill;
                c.fill(g.path);
                c.strokeStyle = g.stroke;
                c.lineWidth = g.width;
                c.stroke(g.path);
            });
            marked.forEach(function (m) { drawRings(c, scene, m.n, m.x, m.y, m.r, m.alpha); });
            c.globalAlpha = 1;
        }

        function drawRings(c, scene, n, x, y, r, alpha) {
            var THEME = ns.THEME;
            c.globalAlpha = alpha;
            // A pinned node keeps where the reader dragged it; the outer ring is
            // what says so without adding a second glyph to read.
            if (n.pinned) {
                c.beginPath();
                c.arc(x, y, r + 3.5, 0, Math.PI * 2);
                c.strokeStyle = THEME.accent;
                c.lineWidth = 1.25;
                c.stroke();
            }
            // A selected node is the reader's anchor and stays marked while they
            // read its card, so it gets a solid ring — distinct from the dashed
            // keyboard-focus ring, which is transient.
            if (n.id === scene.selectedId) {
                c.beginPath();
                c.arc(x, y, r + 6, 0, Math.PI * 2);
                c.strokeStyle = THEME.accent;
                c.lineWidth = 2.5;
                c.stroke();
            }
            if (n.id === scene.focusId) {
                c.beginPath();
                c.arc(x, y, r + (n.id === scene.selectedId ? 10 : 6), 0, Math.PI * 2);
                c.strokeStyle = THEME.accent;
                c.lineWidth = 2;
                c.setLineDash([3, 2]);
                c.stroke();
                c.setLineDash([]);
            }
        }

        function labelPriority(n, scene) {
            var p = n.deg || 0;
            if (n.isCenter) p += 10000;
            if (n.id === scene.hoverId || n.id === scene.focusId) p += 5000;
            if (scene.focusSet && scene.focusSet[n.id]) p += 2000;
            if (n.pinned) p += 1000;
            return p;
        }

        function overlaps(box, boxes) {
            for (var i = 0; i < boxes.length; i++) {
                var b = boxes[i];
                if (box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]) return true;
            }
            return false;
        }

        /**
         * Greedy collision placement: walk the nodes in priority order and keep a
         * label only while its box is still free. Zooming in frees space, so more
         * labels simply appear — there are no zoom thresholds to tune.
         */
        function drawLabels(c, scene, o) {
            var THEME = ns.THEME;
            var everything = o.allLabels || scene.labelsAll;
            var k = view.k;
            var boxes = [];
            var budget = everything ? scene.nodes.length : LABEL_BUDGET;
            // Priorities computed once per node, not once per comparison.
            var ordered = scene.nodes.slice();
            for (var p = 0; p < ordered.length; p++) ordered[p]._labelRank = labelPriority(ordered[p], scene);
            ordered.sort(function (a, b) { return b._labelRank - a._labelRank; });
            c.textBaseline = 'middle';
            c.lineJoin = 'round';
            var font = null;

            for (var i = 0; i < ordered.length && boxes.length < budget; i++) {
                var n = ordered[i];
                // Only these skip the collision test. Members of the focus set get a
                // priority boost (labelPriority) but are still collision-tested:
                // exempting them would let a hub with fifty neighbours stack fifty
                // labels on top of each other the moment it is hovered.
                var forced = n.isCenter || n.pinned || n.id === scene.focusId
                    || n.id === scene.hoverId || n.id === scene.selectedId;
                if (!everything && !forced && n.deg <= 1 && k < 0.85) continue;
                if (scene.focusSet && !scene.focusSet[n.id] && !o.allLabels) continue;

                var size = n.isCenter ? THEME.fontSizeTitle : THEME.fontSize;
                var nodeFont = (n.isCenter ? '700 ' : '') + size + 'px ' + THEME.fontFamily;
                // Setting a font parses it; only do so when it changes.
                if (nodeFont !== font) { c.font = nodeFont; font = nodeFont; }
                // A label's text and width only change with its font (the theme)
                // and the truncation length, so they are measured once, not on
                // every frame of a settling or dragged graph.
                var maxLen = n.isCenter ? 48 : THEME.labelMaxLen;
                var lbl = n._label;
                if (!lbl || lbl.font !== nodeFont || lbl.name !== n.name || lbl.maxLen !== maxLen) {
                    var t = ns.truncateLabel(n.name, maxLen);
                    lbl = n._label = { font: nodeFont, name: n.name, maxLen: maxLen, text: t, width: c.measureText(t).width };
                }
                var text = lbl.text;
                var lx = screenX(n) + Math.max(1.6, n.r * k) + 5, ly = screenY(n);
                var box = [lx - 2, ly - size * 0.66, lx + lbl.width + 2, ly + size * 0.66];
                if (box[2] < 0 || box[0] > o.w || box[3] < 0 || box[1] > o.h) continue;
                if (!forced && overlaps(box, boxes)) continue;
                boxes.push(box);

                // Stroke the surface colour behind the glyphs so a label stays
                // legible where it crosses an edge.
                c.lineWidth = 3;
                c.strokeStyle = THEME.surface;
                c.strokeText(text, lx, ly);
                c.fillStyle = n.isCenter ? THEME.heading : THEME.text;
                c.fillText(text, lx, ly);
            }
            return boxes;   // handed to drawEdgeLabels so the two never collide
        }

        /**
         * Relationship names along their edges.
         *
         * Property labels repeat hard ("Subject" forty times), so drawing every one
         * is noise: the reader gets them for the node they selected or hovered — the
         * case where "what IS this connection?" is the actual question — and a
         * toolbar toggle (`scene.edgeLabels`) opts into the rest.
         *
         * Shares the caller's `boxes` list, so an edge label never lands on a node
         * label. Runs after them: naming the entities beats naming the wires.
         */
        function drawEdgeLabels(c, scene, o, boxes) {
            var focus = scene.selectedId || scene.hoverId;
            if (!scene.edgeLabels && !focus) return;
            var k = view.k;
            if (k < 0.45) return;                       // illegible; skip the work

            var candidates = scene.links.filter(function (l) {
                if (scene.edgeLabels) return true;
                return l.source.id === focus || l.target.id === focus;
            }).filter(function (l) { return l.name; });
            if (!candidates.length) return;

            // Edges touching the focused node first, then the shortest labels — they
            // fit in the gaps the long ones cannot.
            candidates.sort(function (a, b) {
                var af = (a.source.id === focus || a.target.id === focus) ? 1 : 0;
                var bf = (b.source.id === focus || b.target.id === focus) ? 1 : 0;
                return (bf - af) || (a.name.length - b.name.length);
            });

            var size = Math.max(9, ns.THEME.fontSize - 2);
            c.font = size + 'px ' + ns.THEME.fontFamily;
            c.textBaseline = 'middle';
            c.textAlign = 'center';
            c.lineJoin = 'round';

            var drawn = 0;
            var budget = scene.edgeLabels ? 60 : 24;
            for (var i = 0; i < candidates.length && drawn < budget; i++) {
                var l = candidates[i];
                var x1 = screenX(l.source), y1 = screenY(l.source);
                var x2 = screenX(l.target), y2 = screenY(l.target);
                // Midpoint of the same quadratic the edge was drawn with, so the
                // label sits ON its wire rather than beside the straight chord.
                var dx = x2 - x1, dy = y2 - y1;
                var cx = (x1 + x2) / 2 - dy * 0.075, cy = (y1 + y2) / 2 + dx * 0.075;
                var mx = (x1 + 2 * cx + x2) / 4, my = (y1 + 2 * cy + y2) / 4;
                if (mx < 0 || my < 0 || mx > o.w || my > o.h) continue;

                var text = ns.truncateLabel(l.name, 22);
                var half = c.measureText(text).width / 2 + 3;
                var box = [mx - half, my - size * 0.7, mx + half, my + size * 0.7];
                if (overlaps(box, boxes)) continue;
                boxes.push(box);
                drawn++;

                c.lineWidth = 3;
                c.strokeStyle = ns.THEME.surface;
                c.strokeText(text, mx, my);
                c.fillStyle = ns.THEME.textMuted;
                c.fillText(text, mx, my);
            }
            c.textAlign = 'left';
        }

        /** Category swatches along the bottom — drawn into the PNG export only. */
        function drawLegend(c, scene, o) {
            var THEME = ns.THEME;
            var used = {};
            scene.nodes.forEach(function (n) { used[n.category] = true; });
            var items = [];
            (scene.categories || []).forEach(function (cat, i) {
                if (used[i]) items.push({ name: cat.name, i: i });
            });
            if (!items.length) return;
            c.font = THEME.fontSize + 'px ' + THEME.fontFamily;
            c.textBaseline = 'middle';
            var x = 14, y = o.h - 14, gap = 16;
            items.forEach(function (it) {
                var w = c.measureText(it.name).width + 14 + gap;
                if (x + w > o.w - 14) { x = 14; y -= 18; }
                c.beginPath();
                c.arc(x + 4, y, 4.5, 0, Math.PI * 2);
                c.fillStyle = scene.colorOf(it.i);
                c.fill();
                c.fillStyle = THEME.textMuted;
                c.fillText(it.name, x + 14, y);
                x += w;
            });
        }

        /** One pass over the scene, shared by the live canvas and the export. */
        function render(c, scene, o) {
            c.save();
            c.scale(o.scale, o.scale);
            if (o.bg) { c.fillStyle = o.bg; c.fillRect(0, 0, o.w, o.h); }
            else c.clearRect(0, 0, o.w, o.h);
            drawEdges(c, scene, o);
            drawNodes(c, scene, o);
            drawEdgeLabels(c, scene, o, drawLabels(c, scene, o));
            if (o.legend) drawLegend(c, scene, o);
            c.restore();
        }

        /*
         * The dimmed graph behind a focus, cached. Hovering or selecting a node
         * dims everything but its neighbourhood; redrawing all of it for every
         * hover cost as much as a full frame. A focus frame is therefore two
         * layers: the whole graph dimmed, drawn into an offscreen canvas, then only
         * the neighbourhood and the labels on top. The dimmed layer is kept while
         * the picture under it stays the same (scene version, view and size); the
         * controller bumps scene.version whenever positions, colours, visibility or
         * rings change, so a moving graph redraws it and never reads a stale copy.
         */
        var dimmed = { canvas: null, key: null };
        // The whole frame with no focus, kept the same way, so pointing away from
        // a node is a copy too. Only stored once the same frame is asked for twice
        // running: a graph that is still moving would pay for a copy every frame.
        var plain = { canvas: null, key: null, last: null };

        function stateKey(scene) {
            return [scene.version, view.x, view.y, view.k, W, H, dpr,
                scene.showHalos ? 1 : 0, scene.labelsAll ? 1 : 0, scene.edgeLabels ? 1 : 0].join('|');
        }

        function layer(cache) {
            if (!cache.canvas) cache.canvas = document.createElement('canvas');
            if (cache.canvas.width !== canvas.width || cache.canvas.height !== canvas.height) {
                cache.canvas.width = canvas.width;
                cache.canvas.height = canvas.height;
            }
            return cache.canvas.getContext('2d');
        }

        /** Replace the live canvas with a cached layer, in device pixels. */
        function blit(src) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(src, 0, 0);
            ctx.restore();
        }

        function paint(scene) {
            if (!W || !H) return;
            var o = { w: W, h: H, scale: dpr, bg: null, allLabels: false, legend: false };
            if (scene.version == null) {
                render(ctx, scene, o);
                return;
            }
            var key = stateKey(scene);
            if (!scene.focusSet) {
                if (scene.hoverLink) {
                    render(ctx, scene, o);
                } else if (plain.key === key) {
                    blit(plain.canvas);
                } else {
                    render(ctx, scene, o);
                    if (plain.last === key) {
                        var pc = layer(plain);
                        pc.clearRect(0, 0, plain.canvas.width, plain.canvas.height);
                        pc.drawImage(canvas, 0, 0);
                        plain.key = key;
                    }
                }
                plain.last = key;
                return;
            }
            if (dimmed.key !== key) {
                var dc = layer(dimmed);
                dc.clearRect(0, 0, dimmed.canvas.width, dimmed.canvas.height);
                // An empty focus set dims every node and edge; no labels, no hover.
                var base = Object.assign({}, scene, { focusSet: {}, hoverLink: null, hoverId: null, focusId: null, selectedId: null });
                dc.save();
                dc.scale(dpr, dpr);
                drawEdges(dc, base, o);
                drawNodes(dc, base, o);
                dc.restore();
                dimmed.key = key;
            }
            blit(dimmed.canvas);
            ctx.save();
            ctx.scale(dpr, dpr);
            var overlay = { w: W, h: H, scale: dpr, bg: null, allLabels: false, legend: false, onlyFocus: true };
            drawEdges(ctx, scene, overlay);
            drawNodes(ctx, scene, overlay);
            drawEdgeLabels(ctx, scene, overlay, drawLabels(ctx, scene, overlay));
            ctx.restore();
        }

        /** PNG at 2× on the export background, with every label that fits + legend. */
        function exportPng(scene) {
            var out = document.createElement('canvas');
            out.width = W * 2;
            out.height = H * 2;
            // The export ignores the transient hover/focus emphasis: a saved image
            // should show the whole graph, not whatever the pointer happened to be on.
            var flat = Object.assign({}, scene, { focusSet: null, hoverLink: null, hoverId: null });
            render(out.getContext('2d'), flat, {
                w: W, h: H, scale: 2, bg: ns.exportBg(), allLabels: true, legend: true
            });
            return out.toDataURL('image/png');
        }

        return {
            view: view,
            width: function () { return W; },
            height: function () { return H; },
            isUserAdjusted: function () { return userAdjusted; },
            resize: resize,
            fit: fit,
            centerOn: centerOn,
            zoomAt: zoomAt,
            panBy: panBy,
            pinch: pinch,
            toWorld: toWorld,
            screenX: screenX,
            screenY: screenY,
            nodeAt: function (nodes, px, py) { return nodeAt(nodes, view, px, py); },
            linkAt: function (links, px, py) { return linkAt(links, view, px, py); },
            paint: paint,
            exportPng: exportPng
        };
    }

    ns.GraphCanvas = { create: create };
})();
