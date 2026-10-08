/**
 * Dashboard core: the shared MapLibre layer — map construction and controls,
 * the self-hosted basemap and its glyphs, attribution, legends, PNG export,
 * and the small hover / fit helpers the map surfaces have in common.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    /* ------------------------------------------------------------------ */
    /*  Construction and tracking                                          */
    /* ------------------------------------------------------------------ */

    /**
     * Construct a MapLibre map, or return null after showing a notice in its
     * container. Since MapLibre 6.7 the constructor THROWS (GPUInitializationError)
     * when WebGL2 is unavailable — blocked GPU, old device, some VMs — instead of
     * firing an `error` event, so every surface creates its maps through here
     * and simply returns on null.
     */
    ns.createMap = function (options) {
        // Every map speaks the page language: MapLibre's own control names,
        // tooltips and gesture hints come from the module's translated strings.
        options = Object.assign({ locale: ns.mapLocale() }, options);
        try {
            return new maplibregl.Map(options);
        } catch (error) {
            console.warn('DreVisualizations: map unavailable', error);
            var container = typeof options.container === 'string'
                ? document.getElementById(options.container) : options.container;
            if (container) {
                ns.setChildren(container, [ns.el('div', 'rv-no-data rv-map-unavailable', ns.t('mapUnavailable',
                    'This map needs WebGL, which this browser or device cannot provide.'))]);
            }
            return null;
        }
    };

    /**
     * MapLibre's interface strings, translated. The keys are MapLibre's own
     * (its default `locale` table); the values go through RV_I18N like every
     * other string the module shows, so a French page gets French zoom buttons
     * and gesture hints (DESIGN-INTEGRATION.md "Maps").
     */
    ns.mapLocale = function () {
        return {
            'AttributionControl.ToggleAttribution': ns.t('mapToggleAttribution', 'Toggle attribution'),
            'FullscreenControl.Enter': ns.t('fullscreen', 'Fullscreen'),
            'FullscreenControl.Exit': ns.t('exitFullscreen', 'Exit fullscreen'),
            'GlobeControl.Enable': ns.t('mapGlobeEnable', 'Show as a globe'),
            'GlobeControl.Disable': ns.t('mapGlobeDisable', 'Show as a flat map'),
            'Map.Title': ns.t('mapTitle', 'Map'),
            'Marker.Title': ns.t('mapMarker', 'Map marker'),
            'NavigationControl.ResetBearing': ns.t('mapResetBearing', 'Reset the map to north'),
            'NavigationControl.ZoomIn': ns.t('mapZoomIn', 'Zoom in'),
            'NavigationControl.ZoomOut': ns.t('mapZoomOut', 'Zoom out'),
            'Popup.Close': ns.t('mapClosePopup', 'Close popup'),
            'CooperativeGesturesHandler.WindowsHelpText': ns.t('mapGestureWindows', 'Use Ctrl + scroll to zoom the map'),
            'CooperativeGesturesHandler.MacHelpText': ns.t('mapGestureMac', 'Use ⌘ + scroll to zoom the map'),
            'CooperativeGesturesHandler.MobileHelpText': ns.t('mapGestureMobile', 'Use two fingers to move the map')
        };
    };

    /**
     * The one navigation-control preset every map uses: zoom in / out, no
     * compass. The maps are north-up overviews that never rotate on purpose,
     * so a compass is a control with nothing to do.
     */
    ns.navControl = function () {
        return new maplibregl.NavigationControl({ showCompass: false });
    };

    /**
     * The shared fullscreen button (core/fullscreen.js) as a MapLibre control,
     * in place of MapLibre's FullscreenControl: it expands `target` — the map's
     * chart panel, legend included — rather than the bare canvas, and it is the
     * same button, label and Escape behaviour as the graphs'.
     */
    ns.mapFullscreenControl = function (target) {
        var box = null;
        var button = null;
        return {
            onAdd: function (map) {
                box = document.createElement('div');
                box.className = 'maplibregl-ctrl maplibregl-ctrl-group';
                button = ns.fullscreenButton(target || map.getContainer(), {
                    className: 'rv-map-fullscreen',
                    onChange: function () {
                        requestAnimationFrame(function () {
                            try { map.resize(); } catch (e) { /* removed */ }
                        });
                    }
                });
                box.appendChild(button);
                return box;
            },
            onRemove: function () {
                if (button && button.rvDispose) button.rvDispose();
                if (box && box.parentNode) box.parentNode.removeChild(box);
            }
        };
    };

    /**
     * Standard MapLibre map bootstrap shared by the map chart builders: themed
     * basemap, visible source attribution, cooperative gestures, and the common
     * control set. Options:
     *   center, zoom  — initial camera (default [0, 15] / 1.5);
     *   nav           — false to skip the navigation control (ns.navControl);
     *   globe         — false to skip the GlobeControl (default on when the
     *                   vendored MapLibre provides it).
     * Callers still wire theme rebuilds themselves via ns.trackMap(map, rebuild),
     * and must return when it gives null (no WebGL; see ns.createMap).
     */
    ns.initMap = function (el, opts) {
        opts = opts || {};
        var map = ns.createMap({
            container: el,
            style: ns.getBasemapStyle(),
            center: opts.center || [0, 15],
            zoom: opts.zoom != null ? opts.zoom : 1.5,
            attributionControl: ns.getMapAttributionOptions(),
            cooperativeGestures: true
        });
        if (!map) return null;
        if (opts.nav !== false) map.addControl(ns.navControl(), 'top-right');
        map.addControl(ns.mapFullscreenControl(el.closest('.chart-panel') || el.parentNode), 'top-right');
        if (opts.globe !== false && maplibregl.GlobeControl) {
            map.addControl(new maplibregl.GlobeControl(), 'top-right');
        }
        return map;
    };

    /**
     * Track a MapLibre map for re-theming. `rebuild` is a zero-arg closure that
     * re-creates the map (with the current basemap + theme colours) into the
     * same container; it is invoked on theme change.
     */
    ns.trackMap = function (map, rebuild) {
        ns._allMaps.push({ map: map, rebuild: rebuild, el: map.getContainer() });
        map.on('remove', function () {
            ns._allMaps = ns._allMaps.filter(function (entry) { return entry.map !== map; });
        });
        ns.attachMapAttribution(map);
        return map;
    };

    /* ------------------------------------------------------------------ */
    /*  Legend and export                                                  */
    /* ------------------------------------------------------------------ */

    /**
     * Mount a map legend BELOW the map — appended to the enclosing .chart-panel,
     * not absolutely positioned over the basemap — so it never covers countries,
     * markers or their labels. One placement shared by every map chart
     * (choropleth, geographic origins, …) for consistency; the cluster-partner
     * map builds its own toggleable legend the same way. Any stale legend (e.g.
     * from the rebuild a light/dark theme toggle triggers) is removed first so
     * duplicates never stack.
     *
     * @param {HTMLElement} el          the container the map was rendered into
     * @param {string}      innerHtml   legend markup
     * @param {string}     [extraClass] extra class, e.g. 'rv-choropleth-legend'
     * @returns {HTMLElement} the legend element
     */
    ns.mountMapLegend = function (el, innerHtml, extraClass) {
        var panel = el.closest('.chart-panel') || el.parentNode || el;
        var stale = panel.querySelector('.rv-map-legend');
        if (stale) stale.remove();
        var legend = document.createElement('div');
        legend.className = 'rv-map-legend' + (extraClass ? ' ' + extraClass : '');
        // eslint-disable-next-line no-unsanitized/property -- callers pass legend markup built with ns.escapeHtml
        legend.innerHTML = innerHtml;
        panel.appendChild(legend);
        return legend;
    };

    /**
     * A MapLibre map as a PNG data URL, or null when it cannot be read.
     *
     * The map MUST have been created with
     * `canvasContextAttributes: { preserveDrawingBuffer: true }`; without it
     * WebGL is free to discard the buffer after each frame and the canvas reads back
     * blank. Labels come along for free — MapLibre draws them into the same canvas —
     * but DOM overlays (popups, controls, a legend) do not, which matches how the
     * ECharts exports behave.
     */
    ns.mapPng = function (map) {
        try {
            // Force one more frame first: after a filter change the last painted
            // frame can predate it, and the buffer is what we are about to read.
            if (typeof map.redraw === 'function') map.redraw();
            else if (typeof map.triggerRepaint === 'function') map.triggerRepaint();
            return map.getCanvas().toDataURL('image/png');
        } catch (e) {
            console.warn('DreVisualizations: map PNG export failed', e);
            return null;
        }
    };

    /* ------------------------------------------------------------------ */
    /*  Basemap and attribution                                            */
    /* ------------------------------------------------------------------ */

    /**
     * Glyph endpoint for MapLibre text layers. Falls back to the Noto Sans
     * ranges this module ships, so labels render with no third-party request.
     * Every symbol layer must name ns.MAP_LABEL_FONT: a layer without `text-font`
     * asks for MapLibre's default "Open Sans Regular,Arial Unicode MS Regular"
     * stack, which this endpoint does not serve, so its labels silently vanish.
     * The fontstack name is the one the common hosts also serve, so a
     * configured endpoint resolves the same `text-font`.
     */
    ns.MAP_LABEL_FONT = ['Noto Sans Regular'];

    ns.mapGlyphs = function () {
        return String((window.RV_MAP_CONFIG || {}).glyphs || '')
            || ns.moduleAsset('fonts/{fontstack}/{range}.pbf');
    };

    /**
     * Basemap assembled from the country outlines already shipped for the
     * choropleth: land, coastlines and borders with no tile server and no
     * third-party call. This is the default, so maps read as maps out of the
     * box; an administrator can still point the basemap settings at any
     * MapLibre style. Colours resolve from DRE theme tokens, so it follows
     * light/dark like every other surface.
     */
    ns.selfHostedBasemapStyle = function () {
        var dark = ns._darkMode;
        return {
            version: 8,
            name: 'DRE self-hosted basemap',
            glyphs: ns.mapGlyphs(),
            sources: {
                'dre-countries': {
                    type: 'geojson',
                    data: ns.moduleAsset('data/geo/countries.geojson'),
                    attribution: 'Natural Earth'
                }
            },
            layers: [
                {
                    id: 'background', type: 'background',
                    paint: { 'background-color': (dark ? ns.cssColor('--surface-sunken', '#070d0a') : ns.cssColor('--surface-sunken', '#f3f0eb')) }
                },
                {
                    id: 'dre-country-fill', type: 'fill', source: 'dre-countries',
                    paint: { 'fill-color': (dark ? ns.cssColor('--surface', '#0e1612') : ns.cssColor('--surface', '#fdfcf9')) }
                },
                {
                    id: 'dre-country-line', type: 'line', source: 'dre-countries',
                    paint: {
                        'line-color': (dark ? ns.cssColor('--border-strong', '#49534e') : ns.cssColor('--border-strong', '#bfbab3')),
                        'line-width': 0.6
                    }
                },
                {
                    // Placed at each polygon's pole of inaccessibility by MapLibre.
                    // Natural Earth carries no importance rank, so which labels
                    // survive at low zoom is decided by collision alone.
                    id: 'dre-country-label', type: 'symbol', source: 'dre-countries',
                    layout: {
                        'text-field': ['coalesce', ['get', 'NAME_EN'], ['get', 'NAME'], ['get', 'ADMIN']],
                        'text-font': ns.MAP_LABEL_FONT,
                        'text-size': ['interpolate', ['linear'], ['zoom'], 1, 9, 4, 12, 7, 15],
                        'text-max-width': 8,
                        'text-padding': 6
                    },
                    paint: {
                        'text-color': (dark ? ns.cssColor('--ink-light', '#b0aea7') : ns.cssColor('--ink-light', '#5f5650')),
                        'text-halo-color': (dark ? ns.cssColor('--surface', '#0e1612') : ns.cssColor('--surface', '#fdfcf9')),
                        'text-halo-width': 1.2
                    }
                }
            ]
        };
    };

    /**
     * Get the configured basemap style. RV_MAP_CONFIG (DashboardAssets, via
     * Site\BasemapStyle::mapConfig) names a style URL per mode, or none; read
     * with `||`, never `??`, so an empty string can never become a style URL.
     * When the URL is this module's own self-hosted default (`selfHosted`), or
     * there is none, build that basemap here from the LIVE tokens instead —
     * the served document can only carry the theme's fallback colours. Either
     * way maps stay privacy-safe by default: no tile, style or glyph request
     * leaves the Omeka origin.
     */
    ns.getBasemapStyle = function () {
        var config = window.RV_MAP_CONFIG || {};
        if (config.selfHosted) return ns.selfHostedBasemapStyle();
        var configured = ns._darkMode
            ? (config.darkStyle || config.lightStyle)
            : (config.lightStyle || config.darkStyle);
        return configured || ns.selfHostedBasemapStyle();
    };

    /**
     * Suppress MapLibre's construction-time attribution control. A style credits
     * its own sources and MapLibre renders that automatically, so passing the
     * configured text as well printed the same tiles twice in different words
     * ("© OpenStreetMap contributors © CARTO | © CARTO, © OpenStreetMap
     * contributors"). Whether a style credits itself is only knowable once it has
     * loaded, so ns.trackMap() attaches the control then.
     */
    ns.getMapAttributionOptions = function () {
        return false;
    };

    /**
     * Attach exactly one attribution control once the style is loaded. The
     * style's own source credits win; the configured text is the fallback for a
     * style that declares none, which is what makes it a safety net rather than
     * a duplicate. A map with nothing to credit gets no control.
     */
    ns.attachMapAttribution = function (map) {
        var apply = function () {
            if (map._rvAttributionAdded) return; // one control per map, never two
            var sources;
            try {
                sources = (map.getStyle() || {}).sources || {};
            } catch (e) {
                return;
            }
            map._rvAttributionAdded = true;
            var options = { compact: true };
            var credited = Object.keys(sources).some(function (id) {
                return sources[id] && sources[id].attribution;
            });
            if (!credited) {
                var text = String((window.RV_MAP_CONFIG || {}).attribution || '');
                if (!text) return; // nothing to credit — no empty control
                options.customAttribution = ns.escapeHtml(text);
            }
            map.addControl(new maplibregl.AttributionControl(options));
        };
        if (map.isStyleLoaded && map.isStyleLoaded()) {
            apply();
        } else {
            map.once('load', apply);
        }
        return map;
    };

    /* ------------------------------------------------------------------ */
    /*  Interaction helpers                                                */
    /* ------------------------------------------------------------------ */

    /**
     * Move the `hover` feature-state from one feature of `source` to another,
     * so exactly one feature reads as hovered. Either id may be null (null
     * `next` clears the hover). Returns `next`, to store as the new current id:
     *   hoverId = ns.moveHover(map, SRC, hoverId, f.id);
     */
    ns.moveHover = function (map, source, prev, next) {
        if (prev !== null && prev !== next) map.setFeatureState({ source: source, id: prev }, { hover: false });
        if (next !== null) map.setFeatureState({ source: source, id: next }, { hover: true });
        return next;
    };

    /**
     * Fit a map to a set of points: [lng, lat] pairs or { lon, lat } objects,
     * or anything else through `lngLat(point)` → [lng, lat]. Nothing happens
     * for an empty set, so callers need no guard of their own.
     */
    ns.fitToPoints = function (map, points, options, lngLat) {
        var bounds = new maplibregl.LngLatBounds();
        (points || []).forEach(function (p) {
            bounds.extend(lngLat ? lngLat(p) : (Array.isArray(p) ? p : [p.lon, p.lat]));
        });
        if (!bounds.isEmpty()) map.fitBounds(bounds, options);
        return bounds;
    };
})();
