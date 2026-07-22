<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/Precompute/PublicCorpus.php';

use DreVisualizations\Precompute\PublicCorpus;

$failures = 0;
function corpusCheck(bool $condition, string $message): void
{
    global $failures;
    if ($condition) {
        echo "ok: $message\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $message\n");
}

$snapshot = [
    'items' => [
        1 => ['title' => 'Public source', 'public' => true],
        2 => ['title' => 'Public target', 'public' => true],
        3 => ['title' => 'Private source', 'public' => false],
        4 => ['title' => 'Private target', 'public' => false],
        5 => ['title' => 'Other-site item', 'public' => true],
        // Id 6 is requested below but absent here: deleted after the id query.
    ],
    'links' => [
        1 => [
            ['dcterms:isPartOf', 'Is Part Of', 2],
            ['dcterms:relation', 'Related', 4],
            ['dcterms:relation', 'Related', 5],
        ],
        3 => [['dcterms:relation', 'Related', 2]],
    ],
    'reverseLinks' => [2 => ['dcterms:isPartOf' => [1], 'dcterms:relation' => [3]]],
    'childrenOf' => [2 => [1]],
    'itemYear' => [1 => '2024', 3 => '2025', 5 => '2026'],
    'itemDate' => [1 => '2024-01-01', 3 => '2025-01-01'],
    'temporal' => [1 => ['2020', '2024'], 5 => ['2020', '2026']],
    'geo' => [2 => ['name' => '<img src=x onerror=alert(1)>'], 4 => ['name' => 'Secret']],
    'itemSets' => [10 => [1, 1, 3, 5], 11 => [3, 5]],
    'templateLabels' => [1 => 'Template'],
    'literals' => [1 => ['dcterms:spatial' => ['Safe']], 3 => ['dcterms:spatial' => ['Secret']]],
    'primaryMedia' => [1 => ['storage' => 'public'], 3 => ['storage' => 'private']],
];

$corpus = (new PublicCorpus(7))->project($snapshot, [1, 2, 3, 6]);
corpusCheck(array_keys($corpus['items']) === [1, 2], 'private and deleted records are absent');
corpusCheck(count($corpus['links'][1] ?? []) === 1 && $corpus['links'][1][0][2] === 2,
    'private and cross-site relationship targets are absent');
corpusCheck(!isset($corpus['links'][3]), 'private relationship sources are absent');
corpusCheck(($corpus['reverseLinks'][2]['dcterms:isPartOf'] ?? []) === [1],
    'reverse links are rebuilt from scoped relationships');
corpusCheck(($corpus['childrenOf'][2] ?? []) === [1], 'hierarchy is rebuilt from scoped relationships');
corpusCheck(($corpus['itemSets'][10] ?? []) === [1], 'memberships are scoped and deduplicated');
corpusCheck(!isset($corpus['itemSets'][11]), 'empty cross-site item sets are absent');
corpusCheck(array_keys($corpus['itemYear']) === [1] && array_keys($corpus['primaryMedia']) === [1],
    'item-keyed values and media are scoped');
corpusCheck(($corpus['scope']['siteId'] ?? null) === 7 && ($corpus['scope']['itemCount'] ?? null) === 2,
    'scope metadata declares the canonical site and count');

// Public-to-private transition: an id still present in the earlier site query
// is rejected by the current item visibility flag.
$transition = $snapshot;
$transition['items'][1]['public'] = false;
$afterPrivacyChange = (new PublicCorpus(7))->project($transition, [1, 2]);
corpusCheck(array_keys($afterPrivacyChange['items']) === [2], 'public-to-private transition fails closed');

echo $failures ? "\n$failures FAILURE(S)\n" : "\nALL PUBLIC CORPUS TESTS PASS\n";
exit($failures ? 1 : 0);
