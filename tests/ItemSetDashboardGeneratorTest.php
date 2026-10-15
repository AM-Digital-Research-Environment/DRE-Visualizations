<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

use DreVisualizations\Precompute\CorpusSnapshot;
use DreVisualizations\Precompute\ItemSetDashboardGenerator;
use DreVisualizations\Precompute\JsonArtifactWriter;
use DreVisualizations\Precompute\ProjectCollections;

$failures = 0;
function itemSetCheck(bool $condition, string $message): void
{
    global $failures;
    if ($condition) {
        echo "ok: $message\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $message\n");
}

$items = [
    1 => ['title' => 'A project', 'template_id' => 5, 'class_term' => 'foaf:Project', 'public' => true],
    2 => ['title' => 'Recording', 'template_id' => 10, 'class_term' => 'dctype:Sound', 'public' => true],
    3 => ['title' => 'Photograph', 'template_id' => 10, 'class_term' => 'dctype:StillImage', 'public' => true],
];
$corpus = CorpusSnapshot::fromArray([
    'items' => $items, 'links' => [], 'reverseLinks' => [], 'childrenOf' => [], 'itemYear' => [2 => '2020', 3 => '2021'],
    'itemDate' => [], 'temporal' => [], 'geo' => [], 'templateLabels' => [],
    'literals' => [1 => ['dre:id' => ['UBT_A']]], 'primaryMedia' => [],
    // 40: linked to the project; 41: matched by dre:id; 42: an authority-style set.
    'itemSets' => [40 => [2], 41 => [3], 42 => [2, 3]],
    'itemSetRecords' => [
        40 => ['title' => 'Linked set', 'dreId' => null, 'partOf' => [1]],
        41 => ['title' => 'Same dre:id', 'dreId' => 'UBT_A', 'partOf' => []],
        42 => ['title' => 'Publications', 'dreId' => null, 'partOf' => []],
    ],
    'scope' => ['type' => 'canonical-site', 'siteId' => 1, 'itemCount' => 3],
]);
$dir = sys_get_temp_dir() . '/dre-item-set-dashboards-' . bin2hex(random_bytes(6));
try {
    $skip = ProjectCollections::setIds(ProjectCollections::resolve($corpus->items, $corpus->literals,
        $corpus->itemSets, $corpus->itemSetRecords, 5));
    itemSetCheck(array_keys($skip) === [40], 'the project collection is its linked set (an explicit link suppresses the dre:id fallback)');

    $written = (new ItemSetDashboardGenerator(new JsonArtifactWriter(), $dir, null, $skip))->generate($corpus);
    itemSetCheck($written === 2 && !is_file($dir . '/40.json'), 'no dashboard is written for a project collection');
    itemSetCheck(is_file($dir . '/41.json') && is_file($dir . '/42.json'), 'every other item set keeps its dashboard');
    $dashboard = json_decode((string) file_get_contents($dir . '/42.json'), true);
    itemSetCheck(($dashboard['totalItems'] ?? null) === 2 && ($dashboard['resourceType'] ?? null) === 'researchItem',
        'a kept dashboard is unchanged');

    $all = (new ItemSetDashboardGenerator(new JsonArtifactWriter(), $dir . '-all'))->generate($corpus);
    itemSetCheck($all === 3, 'without project collections, every item set gets a dashboard');
} finally {
    foreach ([$dir, $dir . '-all'] as $directory) {
        foreach (glob($directory . '/*') ?: [] as $file) unlink($file);
        if (is_dir($directory)) rmdir($directory);
    }
}

echo $failures ? "\n$failures FAILURE(S)\n" : "\nALL ITEM-SET DASHBOARD TESTS PASS\n";
exit($failures ? 1 : 0);
