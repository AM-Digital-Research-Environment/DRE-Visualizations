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
 * A scene is:
 *   { nodes, links,                  // already visibility-filtered
 *     categories, colorOf, haloOf,   // style hooks
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
    var HIT_SLOP = 3;           // px added to a node's radius when hit testing
    var LINK_HIT = 36;          // 6px, squared

    function create(host, canvas) {
        var ctx = canvas.getContext('2d');
        var view = { x: 0, y: 0, k: 1 };
        var userAdjusted = false;   // once true, a resize stops re-fitting
        var W = 0, H = 0, dpr = 1;

        /* ---- Transform ------------------------------------------------- */

        function toWorld(sx, sy) {
            return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
        }
        function screenX(n) { return n.x * view.k + view.x; }
        function screenY(n) { return n.y * view.k + view.y; }

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

        /** Match the backing store to the host box + pixel ratio. */
        function resize() {
            var rect = host.getBoundingClientRect();
            if (!rect.width || !rect.height) return false;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = Math.round(rect.width);
            H = Math.round(rect.height);
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            canvas.style.width = W + 'px';
            canvas.style.height = H + 'px';
            return true;
        }

        /* ---- Hit testing ----------------------------------------------- */

        function nodeAt(nodes, px, py) {
            var best = null, bestD = Infinity;
            for (var i = nodes.length - 1; i >= 0; i--) {
                var n = nodes[i];
                var r = Math.max(6, n.r * view.k) + HIT_SLOP;
                var dx = screenX(n) - px, dy = screenY(n) - py;
                var d = dx * dx + dy * dy;
                if (d <= r * r && d < bestD) { best = n; bestD = d; }
            }
            return best;
        }

        function linkAt(links, px, py) {
            var best = null, bestD = LINK_HIT;
            for (var i = 0; i < links.length; i++) {
                var l = links[i];
                var d = distToSegment(px, py,
                    screenX(l.source), screenY(l.source), screenX(l.target), screenY(l.target));
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

        /* ---- Painting -------------------------------------------------- */

        function drawEdges(c, scene, o) {
            var THEME = ns.THEME;
            var fset = scene.focusSet;
            var k = view.k;
            c.lineCap = 'round';
            scene.links.forEach(function (l) {
                var inFocus = !fset || (fset[l.source.id] && fset[l.target.id]);
                var hovered = (l === scene.hoverLink);
                var alpha = inFocus ? l.alpha : l.alpha * 0.07;
                if (alpha < 0.012) return;
                var x1 = screenX(l.source), y1 = screenY(l.source);
                var x2 = screenX(l.target), y2 = screenY(l.target);
                // A slight arc separates the several statements that can join one
                // pair, and keeps a dense hub from collapsing into a single blob.
                var dx = x2 - x1, dy = y2 - y1;
                var cx = (x1 + x2) / 2 - dy * 0.075, cy = (y1 + y2) / 2 + dx * 0.075;
                c.globalAlpha = alpha;
                c.strokeStyle = (hovered || (fset && inFocus)) ? THEME.accent
                    : (l.weak ? THEME.grid : THEME.textMuted);
                c.lineWidth = (hovered ? l.width + 1.4 : (fset && inFocus ? l.width + 0.8 : l.width))
                    * clamp(k, 0.75, 1.6);
                if (l.weak) c.setLineDash([4 * k, 3 * k]); else c.setLineDash([]);
                c.beginPath();
                c.moveTo(x1, y1);
                c.quadraticCurveTo(cx, cy, x2, y2);
                c.stroke();
            });
            c.setLineDash([]);
            c.globalAlpha = 1;
        }

        function drawNodes(c, scene, o) {
            var THEME = ns.THEME;
            var fset = scene.focusSet;
            var k = view.k;
            scene.nodes.forEach(function (n) {
                var r = Math.max(1.6, n.r * k);
                var x = screenX(n), y = screenY(n);
                if (x < -r - 40 || y < -r - 40 || x > o.w + r + 40 || y > o.h + r + 40) return;
                var dim = fset && !fset[n.id];
                // Small nodes sit a touch back from the primary ones.
                var recessive = !n.isCenter && n.size <= 16;
                c.globalAlpha = dim ? 0.12 : (recessive ? 0.88 : 1);

                c.beginPath();
                c.arc(x, y, r, 0, Math.PI * 2);
                c.fillStyle = scene.colorOf(n.category);
                c.fill();

                var halo = (n.isCenter || !scene.showHalos) ? null : scene.haloOf(n);
                if (n.isCenter) {
                    c.strokeStyle = THEME.text;
                    c.lineWidth = Math.max(2, 3 * Math.min(k, 1.4));
                } else if (halo) {
                    c.strokeStyle = halo;
                    c.lineWidth = Math.max(1.5, 3 * Math.min(k, 1.2));
                } else {
                    c.strokeStyle = THEME.border;
                    c.lineWidth = 1;
                }
                c.stroke();

                // A pinned node keeps where the reader dragged it; the outer ring is
                // what says so without adding a second glyph to read.
                if (n.pinned) {
                    c.beginPath();
                    c.arc(x, y, r + 3.5, 0, Math.PI * 2);
                    c.strokeStyle = THEME.accent;
                    c.lineWidth = 1.25;
                    c.stroke();
                }
                if (n.id === scene.focusId) {
                    c.beginPath();
                    c.arc(x, y, r + 6, 0, Math.PI * 2);
                    c.strokeStyle = THEME.accent;
                    c.lineWidth = 2;
                    c.setLineDash([3, 2]);
                    c.stroke();
                    c.setLineDash([]);
                }
                c.globalAlpha = 1;
            });
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
            var ordered = scene.nodes.slice().sort(function (a, b) {
                return labelPriority(b, scene) - labelPriority(a, scene);
            });
            c.textBaseline = 'middle';
            c.lineJoin = 'round';

            for (var i = 0; i < ordered.length && boxes.length < budget; i++) {
                var n = ordered[i];
                // Only these four skip the collision test. Members of the focus set
                // get a priority boost (labelPriority) but are still collision-tested:
                // exempting them would let a hub with fifty neighbours stack fifty
                // labels on top of each other the moment it is hovered.
                var forced = n.isCenter || n.pinned || n.id === scene.focusId || n.id === scene.hoverId;
                if (!everything && !forced && n.deg <= 1 && k < 0.85) continue;
                if (scene.focusSet && !scene.focusSet[n.id] && !o.allLabels) continue;

                var size = n.isCenter ? THEME.fontSizeTitle : THEME.fontSize;
                c.font = (n.isCenter ? '700 ' : '') + size + 'px ' + THEME.fontFamily;
                var text = ns.truncateLabel(n.name, n.isCenter ? 48 : THEME.labelMaxLen);
                var lx = screenX(n) + Math.max(1.6, n.r * k) + 5, ly = screenY(n);
                var box = [lx - 2, ly - size * 0.66, lx + c.measureText(text).width + 2, ly + size * 0.66];
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
            drawLabels(c, scene, o);
            if (o.legend) drawLegend(c, scene, o);
            c.restore();
        }

        function paint(scene) {
            if (!W || !H) return;
            render(ctx, scene, { w: W, h: H, scale: dpr, bg: null, allLabels: false, legend: false });
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
            nodeAt: nodeAt,
            linkAt: linkAt,
            paint: paint,
            exportPng: exportPng
        };
    }

    ns.GraphCanvas = { create: create, MIN_ZOOM: MIN_ZOOM, MAX_ZOOM: MAX_ZOOM };
})();
