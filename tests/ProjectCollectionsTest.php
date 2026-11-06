<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

use DreVisualizations\Precompute\ProjectCollections;

$failures = 0;
function collectionsCheck(bool $condition, string $message): void
{
    global $failures;
    if ($condition) {
        echo "ok: $message\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $message\n");
}

const PROJECT_TEMPLATE = 5;
// Projects 1–4; 9 is a research item that happens to carry a dre:id.
$items = [
    1 => ['template_id' => PROJECT_TEMPLATE], 2 => ['template_id' => PROJECT_TEMPLATE],
    3 => ['template_id' => PROJECT_TEMPLATE], 4 => ['template_id' => PROJECT_TEMPLATE],
    9 => ['template_id' => 10], 20 => ['template_id' => 10], 21 => ['template_id' => 10],
];
$literals = [
    1 => ['dre:id' => ['UBT_One']], 2 => ['dre:id' => ['UBT_Two']],
    3 => ['dre:id' => [' UBT_Three ']], 4 => ['dre:id' => ['UBT_Four']], 9 => ['dre:id' => ['UBT_Nine']],
];
$itemSets = [
    100 => [20, 21, 21], 101 => [20], 102 => [21], 103 => [20, 21], 104 => [20], 105 => [21], 106 => [20],
];
$records = [
    // Explicit link to project 1, and a second explicit collection for it.
    100 => ['title' => 'Zeta recordings', 'dreId' => 'UBT_Two', 'partOf' => [1]],
    101 => ['title' => 'Alpha photographs', 'dreId' => null, 'partOf' => [1, 9]],
    // Fallback by dre:id for project 2 (the set naming UBT_Two above is taken).
    102 => ['title' => 'Two collection', 'dreId' => 'UBT_Two', 'partOf' => []],
    // Fallback ignores surrounding blanks; a link to a non-project is no link.
    103 => ['title' => 'Three collection', 'dreId' => 'UBT_Three', 'partOf' => [9]],
    // Project 4 links nothing and nobody shares its dre:id.
    104 => ['title' => 'Authority set', 'dreId' => 'UBT_Nine', 'partOf' => []],
    // Explicit link wins over a dre:id that names another project.
    105 => ['title' => 'Four by link', 'dreId' => 'UBT_One', 'partOf' => [4]],
    106 => ['title' => 'Unlinked', 'dreId' => null, 'partOf' => []],
];

$result = ProjectCollections::resolve($items, $literals, $itemSets, $records, PROJECT_TEMPLATE);
collectionsCheck(array_keys($result) === [1, 2, 3, 4], 'every project with a collection is listed, in id order');
collectionsCheck(($result[1] ?? null) === [
    ['id' => 101, 'title' => 'Alpha photographs', 'items' => 1],
    ['id' => 100, 'title' => 'Zeta recordings', 'items' => 2],
], 'dcterms:isPartOf collections are sorted by title and count distinct items');
collectionsCheck(array_column($result[2] ?? [], 'id') === [102], 'a project with no linked set falls back to its dre:id');
collectionsCheck(array_column($result[3] ?? [], 'id') === [103], 'dre:id matching ignores surrounding whitespace');
collectionsCheck(array_column($result[4] ?? [], 'id') === [105], 'an explicit link is used, and its set is not matched again by dre:id');
collectionsCheck(!in_array(104, array_merge(...array_map(fn ($l) => array_column($l, 'id'), $result)), true),
    'a set whose dre:id names a non-project item belongs to no project');

$ids = ProjectCollections::setIds($result);
ksort($ids);
collectionsCheck(array_keys($ids) === [100, 101, 102, 103, 105], 'setIds() lists every project collection once');

$records[107] = ['title' => 'Empty', 'dreId' => 'UBT_Four', 'partOf' => []];
$withEmpty = ProjectCollections::resolve($items, $literals, $itemSets, $records, PROJECT_TEMPLATE);
collectionsCheck(array_column($withEmpty[4] ?? [], 'id') === [105], 'a set with no scoped items is not a collection');
collectionsCheck(ProjectCollections::resolve($items, $literals, $itemSets, $records, 99) === [],
    'no project template, no collections');
collectionsCheck(ProjectCollections::resolve($items, $literals, $itemSets, [], PROJECT_TEMPLATE) === [],
    'no item-set records, no collections');

// members(): a project's records are its dcterms:isPartOf children plus the
// items of its collections, so they outlive a set made private.
$childrenOf = [1 => [30, 20, 1], 3 => [31], 9 => [32]];
$members = ProjectCollections::members($items, $childrenOf, $itemSets, $result, PROJECT_TEMPLATE);
collectionsCheck(array_keys($members) === [1, 2, 3, 4], 'every project with records has members, in id order');
collectionsCheck(($members[1] ?? null) === [20, 21, 30], 'children and collection items merge once, ascending, without the project itself');
collectionsCheck(($members[3] ?? null) === [20, 21, 31], 'a dre:id collection adds to the children');
collectionsCheck(!isset($members[9]), 'a non-project item has no members, even with children');
$noSets = ProjectCollections::members($items, $childrenOf, [], [], PROJECT_TEMPLATE);
collectionsCheck(($noSets[1] ?? null) === [20, 30] && ($noSets[3] ?? null) === [31] && !isset($noSets[2]),
    'with every set private, the dcterms:isPartOf children remain');

// byDreId(): how the profile names a project.
$byDreId = ProjectCollections::byDreId($items + [5 => ['template_id' => PROJECT_TEMPLATE]],
    $literals + [5 => ['dre:id' => ['UBT_One']]], PROJECT_TEMPLATE);
collectionsCheck(($byDreId['UBT_One'] ?? null) === 1, 'a shared dre:id resolves to the lower project id');
collectionsCheck(($byDreId['UBT_Three'] ?? null) === 3, 'dre:id lookup ignores surrounding whitespace');
collectionsCheck(!isset($byDreId['UBT_Nine']), 'a non-project item is never named by its dre:id');

echo $failures ? "\n$failures FAILURE(S)\n" : "\nALL PROJECT COLLECTION TESTS PASS\n";
exit($failures ? 1 : 0);
