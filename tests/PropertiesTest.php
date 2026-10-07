<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

/**
 * Property tests: invariants checked over many seeded random inputs rather
 * than one hand-written fixture. Seeds are fixed, so a failure reproduces;
 * the failing seed is printed.
 */

use DreVisualizations\Precompute\Aggregators;
use DreVisualizations\Precompute\PublishedSnapshot;

$aggregators = new Aggregators(4, 5);
$failures = 0;
$check = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) {
        $failures++;
        fwrite(STDERR, "FAIL: $message\n");
    }
};

/** A random research corpus: persons (template 4) credited on items, linked to projects (5). */
$corpus = static function (int $seed): array {
    mt_srand($seed);
    $items = $links = [];
    $persons = range(1000, 1000 + mt_rand(3, 25));
    $projects = range(2000, 2000 + mt_rand(1, 4));
    foreach ($persons as $p) $items[$p] = ['title' => 'Person ' . mt_rand(1, 8), 'template_id' => 4];  // homonyms likely
    foreach ($projects as $p) $items[$p] = ['title' => 'Project ' . $p, 'template_id' => 5];
    $itemIds = range(1, mt_rand(5, 80));
    foreach ($itemIds as $iid) {
        $items[$iid] = ['title' => 'Item ' . $iid, 'template_id' => 10, 'class_term' => '', 'class_label' => ''];
        $links[$iid] = [['dcterms:isPartOf', 'Is part of', $projects[array_rand($projects)]]];
        foreach ((array) array_rand(array_flip($persons), mt_rand(1, min(4, count($persons)))) as $p) {
            $links[$iid][] = [mt_rand(0, 1) ? 'dcterms:creator' : 'marcrel:ctb', 'Credit', (int) $p];
        }
    }
    return [$itemIds, $items, $links];
};

for ($seed = 1; $seed <= 200; $seed++) {
    [$itemIds, $items, $links] = $corpus($seed);

    // Duplicated ids never inflate the total.
    $dup = array_merge($itemIds, array_slice($itemIds, 0, mt_rand(0, count($itemIds))));
    $agg = $aggregators->aggregateItems($dup, $items, $links, [], []);
    $check(($agg['totalItems'] ?? null) === count($itemIds), "seed $seed: aggregateItems counts distinct items");

    // Community detection partitions the drawn nodes exactly once.
    $net = $aggregators->buildPersonCollaborationNetwork($itemIds, $items, $links, 1);
    if ($net !== null) {
        $sizes = array_sum(array_column($net['communities'], 'size'));
        $check($sizes === count($net['nodes']), "seed $seed: community sizes sum to the node count");
        $ids = array_column($net['communities'], 'id');
        foreach ($net['nodes'] as $node) {
            $check(in_array($node['community'], $ids, true), "seed $seed: every node's community is listed");
        }
    }

    // Every graph link names exactly one drawn node at each end, homonyms included.
    foreach (['buildGlobalContributorNetwork' => [$itemIds, $items, $links],
              'buildPersonCollaborationNetwork' => [$itemIds, $items, $links, 1]] as $builder => $args) {
        $graph = $aggregators->$builder(...$args);
        if ($graph === null) continue;
        $names = array_count_values(array_column($graph['nodes'], 'name'));
        $check(max($names) === 1, "seed $seed: $builder node names are unique");
        foreach ($graph['links'] as $link) {
            $check(isset($names[$link['source']], $names[$link['target']]), "seed $seed: $builder link endpoints are nodes");
        }
    }

    // Stat cards never show an empty or negative count.
    $cards = [];
    for ($i = 0; $i < 6; $i++) {
        $cards[] = ['key' => 'k' . $i, 'label' => 'L' . $i, 'value' => mt_rand(-3, 3), 'subtitle' => mt_rand(0, 1) ? 'sub' : ''];
    }
    foreach ($aggregators->buildStatCards($cards) as $card) {
        $check(is_int($card['value']) && $card['value'] > 0, "seed $seed: stat card values are positive integers");
    }
}

// Artifact paths: anything but "<group>/<name>.json" or "<name>.json" is refused
// before the filesystem is touched.
$root = sys_get_temp_dir() . '/dre-properties-' . bin2hex(random_bytes(4));
mkdir($root . '/generations/20260101T000000Z-aaaaaaaaaaaa/item-dashboards', 0777, true);
$manifest = ['generationId' => '20260101T000000Z-aaaaaaaaaaaa'];
mt_srand(7);
// Fragments of the real artifact name mixed with separators and escapes, so
// some random paths do resolve and the containment check is exercised.
$alphabet = ['a', 'item-dashboards', '-', '_', '.', '/', '\\', '..', '%2e', ' ', "\0", '.json', 'json', ':'];
$real = $root . '/generations/20260101T000000Z-aaaaaaaaaaaa/item-dashboards/a.json';
file_put_contents($real, '{}');
file_put_contents($root . '/revision.json', '{}'); // a file beside, never inside, the generation
try {
    $check(PublishedSnapshot::artifactPath($root, $manifest, 'item-dashboards/a.json') === realpath($real), 'a real artifact resolves');
    foreach (['../revision.json', '../../revision.json', 'item-dashboards/../a.json', '/item-dashboards/a.json',
        'item-dashboards\a.json', 'item-dashboards/a.json/', 'ITEM-dashboards/a.json', 'item-dashboards/a.json.php',
        "item-dashboards/a.json\0", 'item-dashboards//a.json', './item-dashboards/a.json'] as $hostile) {
        $check(PublishedSnapshot::artifactPath($root, $manifest, $hostile) === null, 'refused: ' . json_encode($hostile));
    }
    for ($i = 0; $i < 2000; $i++) {
        $path = '';
        for ($n = mt_rand(1, 8); $n > 0; $n--) $path .= $alphabet[array_rand($alphabet)];
        $resolved = PublishedSnapshot::artifactPath($root, $manifest, $path);
        $check($resolved === null || (preg_match('~^(?:[a-z-]+/)?[a-zA-Z0-9_-]+\.json$~D', $path) === 1
            && str_starts_with($resolved, realpath($root) . DIRECTORY_SEPARATOR)), 'artifact path ' . json_encode($path) . ' is refused or contained');
    }
} finally {
    unlink($real);
    unlink($root . '/revision.json');
    rmdir($root . '/generations/20260101T000000Z-aaaaaaaaaaaa/item-dashboards');
    rmdir($root . '/generations/20260101T000000Z-aaaaaaaaaaaa');
    rmdir($root . '/generations');
    rmdir($root);
}

echo $failures ? "\n$failures FAILURE(S)\n" : "\nALL PROPERTY TESTS PASS\n";
exit($failures ? 1 : 0);
