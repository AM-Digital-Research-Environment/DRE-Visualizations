<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

use DreVisualizations\Site\ResourcePagePlacement as Placement;

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
check($main($placed) === ['mediaEmbeds', 'values', 'itemSets', 'sitePages', 'mediaList',
    'dreLinkedItemsDashboard', 'linkedResources'], 'the block follows the last record block, before Linked resources');
check($placed['items']['left'] === [] && $placed['items']['right'] === ['citation']
    && $placed['item_sets'] === $saved['item_sets'] && $placed['media'] === $saved['media'],
    'every other region and resource keeps what the administrator chose');
check(Placement::place($placed) === null, 'placing twice changes nothing');
check(Placement::state($placed) === Placement::STATE_PRESENT && Placement::state($saved) === Placement::STATE_MISSING,
    'state() tells a configuration with the block from one without');

foreach ([null, [], ''] as $unset) {
    check(Placement::place($unset) === null && Placement::state($unset) === Placement::STATE_DEFAULT,
        'no saved configuration (' . json_encode($unset) . ') is left to the defaults');
}

$elsewhere = $saved;
$elsewhere['items']['right'][] = 'dreLinkedItemsDashboard';
check(Placement::place($elsewhere) === null, 'a block already in another region is not duplicated');
$alias = $saved;
$alias['items']['main'][] = 'linkedItemsDashboard';
check(Placement::place($alias) === null, 'the config alias counts as the block');

$noRecord = ['items' => ['main' => ['sitePages', 'linkedResources', 'mediaLinks']]];
check($main(Placement::place($noRecord)) === ['sitePages', 'dreLinkedItemsDashboard', 'linkedResources', 'mediaLinks'],
    'without a record block the block goes before Linked resources');
$recordAfter = ['items' => ['main' => ['linkedResources', 'values', 'mirador', 'sitePages']]];
check($main(Placement::place($recordAfter)) === ['linkedResources', 'values', 'mirador', 'dreLinkedItemsDashboard', 'sitePages'],
    'admin order is kept: the block follows the last record block even after Linked resources');
$plain = ['items' => ['main' => ['sitePages']]];
check($main(Placement::place($plain)) === ['sitePages', 'dreLinkedItemsDashboard'],
    'with neither anchor the block goes last');
$noItems = ['media' => ['main' => ['mediaRender']]];
$placedNoItems = Placement::place($noItems);
check($main($placedNoItems) === ['dreLinkedItemsDashboard'] && $placedNoItems['media']['main'] === ['mediaRender'],
    'a configuration without an item page gets a main region holding the block');
$messy = ['items' => ['main' => ['values', '', 'mediaList'], 'side' => 'not a list']];
$placedMessy = Placement::place($messy);
check($main($placedMessy) === ['values', 'mediaList', 'dreLinkedItemsDashboard'] && $placedMessy['items']['side'] === [],
    'malformed input is standardised as core does before placing');

finish('ALL RESOURCE PAGE PLACEMENT TESTS PASS');
