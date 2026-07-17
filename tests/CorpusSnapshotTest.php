<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/Precompute/CorpusSnapshot.php';

use DreVisualizations\Precompute\CorpusSnapshot;

$failures = 0;
function snapshotCheck(bool $condition, string $message): void
{
    global $failures;
    if ($condition) {
        echo "ok: $message\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $message\n");
}

$valid = [
    'items' => [1 => ['public' => true], 2 => ['public' => true]],
    'links' => [1 => [['dcterms:isPartOf', 'Is Part Of', 2]]],
    'reverseLinks' => [2 => ['dcterms:isPartOf' => [1]]],
    'childrenOf' => [2 => [1]],
    'itemYear' => [1 => '2026'],
    'itemDate' => [1 => '2026-01-01'],
    'temporal' => [],
    'geo' => [2 => ['lat' => 0.0, 'lon' => 12.5, 'name' => 'Equator']],
    'itemSets' => [10 => [1, 2]],
    'templateLabels' => [5 => 'Project'],
    'literals' => [1 => ['dcterms:spatial' => ['Equator']]],
    'primaryMedia' => [1 => ['storage' => 'abc', 'ext' => 'jpg']],
    'scope' => ['type' => 'canonical-site', 'siteId' => 3, 'itemCount' => 2],
];
$snapshot = CorpusSnapshot::fromArray($valid);
snapshotCheck($snapshot->scope['siteId'] === 3, 'canonical site scope is retained');
snapshotCheck($snapshot->sourceCounts() === [
    'items' => 2,
    'relationships' => 1,
    'itemSets' => 1,
    'primaryMedia' => 1,
], 'source counts come from the immutable snapshot');

$invalidCases = [
    'scope count mismatch' => static function (array &$data): void { $data['scope']['itemCount'] = 3; },
    'non-public item' => static function (array &$data): void { $data['items'][1]['public'] = false; },
    'private relationship target leak' => static function (array &$data): void { $data['links'][1][0][2] = 99; },
    'cross-scope item-set membership' => static function (array &$data): void { $data['itemSets'][10][] = 99; },
    'out-of-range coordinate' => static function (array &$data): void { $data['geo'][2]['lat'] = 91; },
];
foreach ($invalidCases as $label => $mutate) {
    $case = $valid;
    $mutate($case);
    try {
        CorpusSnapshot::fromArray($case);
        snapshotCheck(false, $label . ' is rejected');
    } catch (InvalidArgumentException) {
        snapshotCheck(true, $label . ' is rejected');
    }
}

echo $failures ? "\n$failures FAILURE(S)\n" : "\nALL CORPUS SNAPSHOT TESTS PASS\n";
exit($failures ? 1 : 0);
