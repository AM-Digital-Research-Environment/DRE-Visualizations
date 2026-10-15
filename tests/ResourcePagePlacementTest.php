<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

use DreVisualizations\Site\ResourcePagePlacement as Placement;

$failures = 0;
function placementCheck(bool $condition, string $message): void
{
    global $failures;
    if ($condition) {
        echo "ok: $message\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $message\n");
}

$main = static fn (?array $blocks): ?array => $blocks === null ? null : array_values($blocks['items']['main']);

// The DRE theme's defaults, as an administrator saves them.
$saved = [
    'items' => [
        'left' => [],
        'main' => ['mediaEmbeds', 'values', 'itemSets', 'sitePages', 'mediaList', 'linkedResources'],
        'right' => ['citation'],
    ],
    'item_sets' => ['main' => ['values']],
    'media' => ['main' => ['mediaRender', 'values']],
];
$placed = Placement::place($saved);
placementCheck($main($placed) === ['mediaEmbeds', 'values', 'itemSets', 'sitePages', 'mediaList',
    'dreLinkedItemsDashboard', 'linkedResources'], 'the block follows the last record block, before Linked resources');
placementCheck($placed['items']['left'] === [] && $placed['items']['right'] === ['citation']
    && $placed['item_sets'] === $saved['item_sets'] && $placed['media'] === $saved['media'],
    'every other region and resource keeps what the administrator chose');
placementCheck(Placement::place($placed) === null, 'placing twice changes nothing');
placementCheck(Placement::state($placed) === Placement::STATE_PRESENT && Placement::state($saved) === Placement::STATE_MISSING,
    'state() tells a configuration with the block from one without');

foreach ([null, [], ''] as $unset) {
    placementCheck(Placement::place($unset) === null && Placement::state($unset) === Placement::STATE_DEFAULT,
        'no saved configuration (' . json_encode($unset) . ') is left to the defaults');
}

$elsewhere = $saved;
$elsewhere['items']['right'][] = 'dreLinkedItemsDashboard';
placementCheck(Placement::place($elsewhere) === null, 'a block already in another region is not duplicated');
$alias = $saved;
$alias['items']['main'][] = 'linkedItemsDashboard';
placementCheck(Placement::place($alias) === null, 'the config alias counts as the block');

$noRecord = ['items' => ['main' => ['sitePages', 'linkedResources', 'mediaLinks']]];
placementCheck($main(Placement::place($noRecord)) === ['sitePages', 'dreLinkedItemsDashboard', 'linkedResources', 'mediaLinks'],
    'without a record block the block goes before Linked resources');
$recordAfter = ['items' => ['main' => ['linkedResources', 'values', 'mirador', 'sitePages']]];
placementCheck($main(Placement::place($recordAfter)) === ['linkedResources', 'values', 'mirador', 'dreLinkedItemsDashboard', 'sitePages'],
    'admin order is kept: the block follows the last record block even after Linked resources');
$plain = ['items' => ['main' => ['sitePages']]];
placementCheck($main(Placement::place($plain)) === ['sitePages', 'dreLinkedItemsDashboard'],
    'with neither anchor the block goes last');
$noItems = ['media' => ['main' => ['mediaRender']]];
$placedNoItems = Placement::place($noItems);
placementCheck($main($placedNoItems) === ['dreLinkedItemsDashboard'] && $placedNoItems['media']['main'] === ['mediaRender'],
    'a configuration without an item page gets a main region holding the block');
$messy = ['items' => ['main' => ['values', '', 'mediaList'], 'side' => 'not a list']];
$placedMessy = Placement::place($messy);
placementCheck($main($placedMessy) === ['values', 'mediaList', 'dreLinkedItemsDashboard'] && $placedMessy['items']['side'] === [],
    'malformed input is standardised as core does before placing');

echo $failures ? "\n$failures FAILURE(S)\n" : "\nALL RESOURCE PAGE PLACEMENT TESTS PASS\n";
exit($failures ? 1 : 0);
