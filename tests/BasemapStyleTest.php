<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

use DreVisualizations\Site\BasemapStyle;

/**
 * The basemap contract (DESIGN-INTEGRATION.md "Maps"): window.RV_MAP_CONFIG's
 * lightStyle / darkStyle are a non-empty URL or absent — never '' — and with no
 * basemap configured they name this module's self-hosted default by URL.
 */
function fail(string $message): never
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function assertSame(mixed $expected, mixed $actual, string $what): void
{
    if ($expected !== $actual) {
        fail($what . ': expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

$defaults = ['light' => '/s/main/dre-basemap/light', 'dark' => '/s/main/dre-basemap/dark'];

// Nothing configured: the self-hosted default, by URL, flagged as such.
assertSame(
    ['lightStyle' => '/s/main/dre-basemap/light', 'darkStyle' => '/s/main/dre-basemap/dark', 'selfHosted' => true],
    BasemapStyle::mapConfig('', '  ', '', '', $defaults),
    'unconfigured basemap'
);

// Nothing configured and no site to serve the default from: no keys at all.
assertSame([], BasemapStyle::mapConfig('', '', '', '', null), 'unconfigured basemap without a site');

// One mode configured stands in for the other; glyphs and attribution pass through.
assertSame(
    ['lightStyle' => 'https://tiles.example/light.json', 'darkStyle' => 'https://tiles.example/light.json',
        'glyphs' => 'https://glyphs.example/{fontstack}/{range}.pbf', 'attribution' => '© Example'],
    BasemapStyle::mapConfig('https://tiles.example/light.json', '', 'https://glyphs.example/{fontstack}/{range}.pbf', '© Example', $defaults),
    'light-only basemap'
);
assertSame(
    ['lightStyle' => 'https://a.example/l.json', 'darkStyle' => 'https://a.example/d.json'],
    BasemapStyle::mapConfig('https://a.example/l.json', 'https://a.example/d.json', '', '', $defaults),
    'both modes configured'
);

// No combination may ever emit an empty string.
foreach ([['', ''], ['x', ''], ['', 'y'], [' ', ' ']] as [$light, $dark]) {
    foreach ([$defaults, null] as $d) {
        foreach (BasemapStyle::mapConfig($light, $dark, ' ', '', $d) as $key => $value) {
            if ($value === '') fail("mapConfig emitted an empty $key");
        }
    }
}

// The served style mirrors ns.selfHostedBasemapStyle: one source, four layers,
// labels in the fontstack the module ships, the theme's fallback colours.
foreach (BasemapStyle::MODES as $mode) {
    $style = BasemapStyle::style($mode, '/modules/DreVisualizations/asset/data/geo/countries.geojson', '/g/{fontstack}/{range}.pbf');
    assertSame(8, $style['version'], "$mode style version");
    assertSame('/g/{fontstack}/{range}.pbf', $style['glyphs'], "$mode glyphs");
    assertSame(['background', 'dre-country-fill', 'dre-country-line', 'dre-country-label'],
        array_column($style['layers'], 'id'), "$mode layers");
    assertSame(['Noto Sans Regular'], $style['layers'][3]['layout']['text-font'], "$mode label font");
    foreach ($style['layers'] as $layer) {
        foreach ($layer['paint'] ?? [] as $value) {
            if (is_string($value) && !preg_match('/^#[0-9a-f]{6}$/', $value)) fail("$mode paint value is not a hex colour: $value");
        }
    }
}
assertSame('#fdfcf9', BasemapStyle::style('light', 'c', 'g')['layers'][1]['paint']['fill-color'], 'light land is --surface');
assertSame('#0e1612', BasemapStyle::style('dark', 'c', 'g')['layers'][1]['paint']['fill-color'], 'dark land is --surface');
try {
    BasemapStyle::style('sepia', 'c', 'g');
    fail('an unknown mode must be rejected');
} catch (InvalidArgumentException) {
}

echo "Basemap contract passed.\n";
