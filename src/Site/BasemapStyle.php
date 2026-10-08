<?php
declare(strict_types=1);
namespace DreVisualizations\Site;

/**
 * The module's self-hosted basemap as a MapLibre style document, and the
 * shared `window.RV_MAP_CONFIG` the page hands every map on it.
 *
 * WHY A URL. DESIGN-INTEGRATION.md ("Maps") makes RV_MAP_CONFIG the one basemap
 * configuration for both modules: `lightStyle` / `darkStyle` are a non-empty URL
 * or absent, and DRE Visualizations writes its self-hosted default there, so a
 * DRE Search map on the same page draws the same basemap. That default used to
 * exist only as an object built in the browser (core/maps.js
 * ns.selfHostedBasemapStyle), which nothing outside this module could reach, so
 * the helper emitted empty strings instead — and an empty string is one `??`
 * away from becoming a style URL. The same style is now also served from
 * /s/{site}/dre-basemap/{light|dark} (Controller\Site\BasemapController).
 *
 * The served document carries the theme's generated fallback colours for each
 * mode (scripts/lib/dre-tokens-fallback.json). This module's own maps still
 * build the style in the browser from the LIVE tokens — an administrator's
 * brand override included — and RV_MAP_CONFIG.selfHosted tells them the URL is
 * that same basemap, so they never trade live colours for fixed ones.
 */
final class BasemapStyle
{
    public const MODES = ['light', 'dark'];

    /** Theme fallbacks (dre-tokens-fallback.json) for the four basemap roles. */
    private const COLOURS = [
        'light' => [
            'background' => '#f3f0eb', // --surface-sunken
            'land' => '#fdfcf9',       // --surface
            'border' => '#bfbab3',     // --border-strong
            'label' => '#5f5650',      // --ink-light
        ],
        'dark' => [
            'background' => '#070d0a',
            'land' => '#0e1612',
            'border' => '#49534e',
            'label' => '#b0aea7',
        ],
    ];

    /** The fontstack every symbol layer names (ns.MAP_LABEL_FONT). */
    public const LABEL_FONT = ['Noto Sans Regular'];

    /**
     * The style document for one mode. Mirrors ns.selfHostedBasemapStyle():
     * land, borders and country labels from the shipped Natural Earth outlines,
     * with no tile server and no third-party request.
     *
     * @param string $countriesUrl the module's data/geo/countries.geojson
     * @param string $glyphsUrl    a {fontstack}/{range} glyph template
     * @return array<string, mixed>
     */
    public static function style(string $mode, string $countriesUrl, string $glyphsUrl): array
    {
        if (!in_array($mode, self::MODES, true)) {
            throw new \InvalidArgumentException('Unknown basemap mode: ' . $mode);
        }
        $c = self::COLOURS[$mode];
        return [
            'version' => 8,
            'name' => 'DRE self-hosted basemap (' . $mode . ')',
            'glyphs' => $glyphsUrl,
            'sources' => [
                'dre-countries' => [
                    'type' => 'geojson',
                    'data' => $countriesUrl,
                    'attribution' => 'Natural Earth',
                ],
            ],
            'layers' => [
                ['id' => 'background', 'type' => 'background', 'paint' => ['background-color' => $c['background']]],
                ['id' => 'dre-country-fill', 'type' => 'fill', 'source' => 'dre-countries', 'paint' => ['fill-color' => $c['land']]],
                [
                    'id' => 'dre-country-line', 'type' => 'line', 'source' => 'dre-countries',
                    'paint' => ['line-color' => $c['border'], 'line-width' => 0.6],
                ],
                [
                    'id' => 'dre-country-label', 'type' => 'symbol', 'source' => 'dre-countries',
                    'layout' => [
                        'text-field' => ['coalesce', ['get', 'NAME_EN'], ['get', 'NAME'], ['get', 'ADMIN']],
                        'text-font' => self::LABEL_FONT,
                        'text-size' => ['interpolate', ['linear'], ['zoom'], 1, 9, 4, 12, 7, 15],
                        'text-max-width' => 8,
                        'text-padding' => 6,
                    ],
                    'paint' => [
                        'text-color' => $c['label'],
                        'text-halo-color' => $c['land'],
                        'text-halo-width' => 1.2,
                    ],
                ],
            ],
        ];
    }

    /**
     * window.RV_MAP_CONFIG. Never an empty style string: a configured URL wins
     * (one mode standing in for the other, as before), else the self-hosted
     * default's URLs with `selfHosted: true`, else — no site to serve the
     * default from — the keys are left out. Empty glyph and attribution
     * settings are left out the same way.
     *
     * @param array{light?: string, dark?: string}|null $defaults self-hosted style URLs
     * @return array<string, string|bool>
     */
    public static function mapConfig(string $light, string $dark, string $glyphs, string $attribution, ?array $defaults): array
    {
        $light = trim($light);
        $dark = trim($dark);
        $config = [];
        if ($light !== '' || $dark !== '') {
            $config['lightStyle'] = $light !== '' ? $light : $dark;
            $config['darkStyle'] = $dark !== '' ? $dark : $light;
        } elseif (!empty($defaults['light']) && !empty($defaults['dark'])) {
            $config['lightStyle'] = $defaults['light'];
            $config['darkStyle'] = $defaults['dark'];
            $config['selfHosted'] = true;
        }
        if (trim($glyphs) !== '') $config['glyphs'] = trim($glyphs);
        if (trim($attribution) !== '') $config['attribution'] = trim($attribution);
        return $config;
    }
}
