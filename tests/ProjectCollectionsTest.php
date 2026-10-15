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

echo $failures ? "\n$failures FAILURE(S)\n" : "\nALL PROJECT COLLECTION TESTS PASS\n";
exit($failures ? 1 : 0);
