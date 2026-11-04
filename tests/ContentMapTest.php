<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

/**
 * The committed full-text maps load, and the gallery payload keeps only the
 * records of the public gallery: a record missing from the snapshot (made
 * private or deleted since the export) leaves the points and every neighbour
 * list. Dependency-free.
 */

use DreVisualizations\FeaturedCollections\ContentMap;
use DreVisualizations\FeaturedCollections\Registry;

$failures = 0;
function contentMapCheck(bool $condition, string $message): void
{
    global $failures;
    if ($condition) {
        echo "ok: $message\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $message\n");
}

// Every committed map belongs to a featured collection and carries no text.
$slugs = array_column(Registry::all(), 'slug');
foreach (glob(dirname(__DIR__) . '/config/fulltext-maps/*.json') as $path) {
    $slug = basename($path, '.json');
    $map = ContentMap::load($slug);
    contentMapCheck($map !== null, "$slug: the committed map loads");
    contentMapCheck(in_array($slug, $slugs, true), "$slug: names a featured collection");
    if ($map === null) continue;
    contentMapCheck(array_keys($map) === ['schemaVersion', 'itemSetId', 'generatedAt', 'model', 'counts', 'groups', 'items', 'neighbours'],
        "$slug: only the exported keys (no titles, passages or keywords)");
    $rowsOk = true;
    foreach ($map['items'] as $row) {
        $rowsOk = $rowsOk && is_array($row) && count($row) === 4 && is_int($row[0]) && is_int($row[3]);
    }
    contentMapCheck($rowsOk, "$slug: every point is [id, x, y, group]");
}

contentMapCheck(ContentMap::load('../amira-profile') === null, 'a slug cannot leave the maps directory');
contentMapCheck(ContentMap::load('no-such-collection') === null, 'a collection without a map has none');

$map = [
    'schemaVersion' => 1,
    'counts' => ['excluded' => ['sharedText' => 3, 'furniture' => 2, 'bad' => 'x']],
    'items' => array_map(static fn (int $id): array => [$id, 0.5, 0.25, $id % 3], range(1, 30)),
    'neighbours' => ['1' => [[2, 0.95], [99, 0.94], [3, 0.93]], '2' => [[1, 0.95]], '99' => [[1, 0.9]]],
];
$public = array_fill_keys(range(1, 25), true);
$payload = ContentMap::forGallery($map, $public);
contentMapCheck($payload !== null && count($payload['items']) === 25, 'only the public records are placed');
contentMapCheck(($payload['neighbours']['1'] ?? null) === [2, 3], 'neighbours keep their order and drop records not on the map');
contentMapCheck(!isset($payload['neighbours']['99']), 'a record not on the map has no neighbour list');
contentMapCheck(($payload['groups'] ?? null) === 2, 'groups counts the groups of the placed records (0 is none)');
contentMapCheck(($payload['excluded'] ?? null) === ['sharedText' => 3, 'furniture' => 2], 'only integer exclusion counts pass');
contentMapCheck(ContentMap::forGallery($map, array_fill_keys(range(1, ContentMap::MIN_RECORDS - 1), true)) === null,
    'too few public records: no map');

if ($failures) {
    fwrite(STDERR, "$failures failure(s)\n");
    exit(1);
}
echo "ContentMapTest: all checks passed\n";
