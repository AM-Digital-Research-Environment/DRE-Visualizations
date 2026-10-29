<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

/**
 * The block registry agrees with everything it describes: the config
 * invokables, the BlockLayout classes, the templates, the asset plans and the
 * dashboard layouts. Dependency-free — classes are read as source, not loaded,
 * because they extend Omeka's base classes.
 *
 * Adding a block means a registry row, a one-line class and the config
 * invokable; this harness fails when any of the three is missing or disagrees.
 */

use DreVisualizations\Site\BlockRegistry;
use DreVisualizations\Site\AssetPlans;

$root = dirname(__DIR__);
$failures = 0;
function registryCheck(bool $condition, string $message): void
{
    global $failures;
    if ($condition) {
        echo "ok: $message\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $message\n");
}

$config = require $root . '/config/module.config.php';
$plans = AssetPlans::manifest()['plans'];
$layouts = json_decode((string) file_get_contents($root . '/config/dashboard-layouts.json'), true)['layouts'] ?? [];

$tables = [
    'block_layouts' => [BlockRegistry::BLOCKS, 'BlockLayout', 'AbstractDreBlockLayout', 'view/common/block-layout/'],
    'resource_page_block_layouts' => [BlockRegistry::RESOURCE_BLOCKS, 'ResourcePageBlockLayout',
        'AbstractDreResourcePageBlockLayout', 'view/common/resource-page-block-layout/'],
];
foreach ($tables as $key => [$rows, $dir, $abstract, $templates]) {
    $expected = [];
    foreach ($rows as $slug => $row) $expected[$row['invokable']] = $row['class'];
    $invokables = $config[$key]['invokables'] ?? [];
    ksort($expected);
    ksort($invokables);
    registryCheck($expected === $invokables, "$key: the config invokables are the registry's");
    foreach ($config[$key]['aliases'] ?? [] as $alias => $target) {
        registryCheck(isset($invokables[$target]), "$key: legacy alias $alias names a registered layout");
    }

    $classFiles = array_map('basename', glob("$root/src/Site/$dir/*.php"));
    $registered = [];
    foreach ($rows as $slug => $row) {
        $short = substr($row['class'], strrpos($row['class'], '\\') + 1);
        $registered[] = "$short.php";
        $source = (string) @file_get_contents("$root/src/Site/$dir/$short.php");
        registryCheck(str_contains($source, "extends $abstract")
            && preg_match("/const SLUG = '([a-z-]+)';/", $source, $m) === 1 && $m[1] === $slug,
            "$slug: $short extends $abstract with SLUG '$slug'");
        registryCheck(is_file("$root/$templates$slug.phtml"), "$slug: its template exists");
        registryCheck(isset($plans[$row['plan']]), "$slug: plan {$row['plan']} exists");
        registryCheck(is_string($row['label']) && $row['label'] !== '', "$slug: has a label");
        if ($dir === 'BlockLayout') {
            $ownsForm = str_contains($source, 'public function form(');
            registryCheck($row['description'] === null ? $ownsForm : (is_string($row['description']) && !$ownsForm),
                "$slug: admin text from the registry, or a form of its own — not both, not neither");
        }
    }
    $abstractFile = "$abstract.php";
    $unregistered = array_diff($classFiles, $registered, [$abstractFile]);
    registryCheck($unregistered === [], "$dir: every class is registered" . ($unregistered ? ' (not: ' . implode(', ', $unregistered) . ')' : ''));
}

// Embeds: a dashboard names an artifact and a layout that exists; every
// embeddable template stamps the slug it is given, never a literal.
foreach (BlockRegistry::embeddable() as $slug => $info) {
    registryCheck(in_array($info['kind'], ['dashboard', 'widget'], true), "$slug: embed kind is dashboard or widget");
    if ($info['kind'] === 'dashboard') {
        registryCheck(isset($info['itemId'], $layouts[$info['layout'] ?? '']), "$slug: embeds artifact {$info['itemId']} with a known layout");
    }
    $template = (string) file_get_contents("$root/view/common/block-layout/$slug.phtml");
    registryCheck((bool) preg_match("/'(embed-)?slug'\s*=>\s*\\\$slug\b/", $template), "$slug: template stamps \$slug");
}

// No template restates what the registry holds: no literal embed slug, and every
// block template asks for its assets through \$plan.
foreach (array_merge(glob("$root/view/common/block-layout/*.phtml"), glob("$root/view/common/resource-page-block-layout/*.phtml")) as $path) {
    $source = (string) file_get_contents($path);
    $name = basename(dirname($path)) . '/' . basename($path);
    registryCheck(!preg_match("/'(embed-)?slug'\s*=>\s*'/", $source) && !preg_match('/data-embed-slug="[a-z]/', $source),
        "$name: no literal embed slug");
    if (str_contains($source, 'dashboardAssets(')) {
        registryCheck(!preg_match("/dashboardAssets\(\[(?!'plan' => \\\$plan\])/", $source), "$name: assets through \$plan");
    }
    registryCheck(!preg_match('/headScript\(\)->append(File|Script)|headLink\(\)->appendStylesheet/', $source),
        "$name: no hand-written asset tags");
}

registryCheck(BlockRegistry::viewVars('podcasts') === ['slug' => 'podcasts', 'plan' => 'dashboard'], 'viewVars carries the slug and the plan');
$threw = false;
try { BlockRegistry::get('no-such-block'); } catch (InvalidArgumentException) { $threw = true; }
registryCheck($threw, 'an unknown slug throws');

if ($failures) {
    fwrite(STDERR, "$failures block-registry check(s) failed\n");
    exit(1);
}
echo "Block registry passed.\n";
