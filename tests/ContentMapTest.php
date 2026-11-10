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

// Every committed map belongs to a featured collection and carries no text.
$slugs = array_column(Registry::all(), 'slug');
foreach (glob(dirname(__DIR__) . '/config/fulltext-maps/*.json') as $path) {
    $slug = basename($path, '.json');
    $map = ContentMap::load($slug);
    check($map !== null, "$slug: the committed map loads");
    check(in_array($slug, $slugs, true), "$slug: names a featured collection");
    if ($map === null) continue;
    check(array_diff(array_keys($map), ['schemaVersion', 'itemSetId', 'generatedAt', 'model', 'counts', 'groups', 'items', 'neighbours', 'places', 'labels']) === [],
        "$slug: only the exported keys (no titles, passages or keywords)");
    $labelled = array_filter($map['groups'], static fn (array $g): bool => isset($g['label']));
    check(!$labelled || isset($map['labels']['by'], $map['labels']['from']),
        "$slug: labelled groups name who labelled them and from what");
    $rowsOk = true;
    foreach ($map['items'] as $row) {
        $rowsOk = $rowsOk && is_array($row) && count($row) === 4 && is_int($row[0]) && is_int($row[3]);
    }
    check($rowsOk, "$slug: every point is [id, x, y, group]");
    $placesOk = true;
    foreach ((array) ($map['places']['items'] ?? []) as $rows) {
        foreach ($rows as $row) $placesOk = $placesOk && is_string($row[0]) && is_int($row[1]);
    }
    check($placesOk, "$slug: places are [country, mentions] pairs");
    $words = ContentMap::wordsAsset($slug);
    if ($words !== null) {
        $counts = json_decode((string) file_get_contents(dirname(__DIR__) . '/asset/' . $words), true);
        check(array_keys($counts) === ['schemaVersion', 'itemSetId', 'generatedAt', 'minArticles', 'articles', 'years', 'totals', 'words', 'suggested']
            && count($counts['years']) === count($counts['totals']) && $counts['minArticles'] >= 10,
            "$slug: the word counts are aggregates by year of words in at least ten articles");
        // The suggestions only name counted words, so they disclose nothing the counts do not.
        check(is_array($counts['suggested']) && $counts['suggested'] !== []
            && array_diff($counts['suggested'], array_keys($counts['words'])) === [],
            "$slug: the suggested words are counted words");
    }
}
check(ContentMap::wordsAsset('../x') === null && ContentMap::wordsAsset('no-such-collection') === null,
    'no word counts for an unknown or unsafe slug');

check(ContentMap::load('../amira-profile') === null, 'a slug cannot leave the maps directory');
check(ContentMap::load('no-such-collection') === null, 'a collection without a map has none');

$map = [
    'schemaVersion' => 1,
    'counts' => ['excluded' => ['sharedText' => 3, 'furniture' => 2, 'bad' => 'x']],
    'items' => array_map(static fn (int $id): array => [$id, 0.5, 0.25, $id % 3], range(1, 30)),
    'neighbours' => ['1' => [[2, 0.95], [99, 0.94], [3, 0.93]], '2' => [[1, 0.95]], '99' => [[1, 0.9]]],
];
$public = array_fill_keys(range(1, 25), true);
$payload = ContentMap::forGallery($map, $public);
check($payload !== null && count($payload['items']) === 25, 'only the public records are placed');
check(($payload['neighbours']['1'] ?? null) === [2, 3], 'neighbours keep their order and drop records not on the map');
check(!isset($payload['neighbours']['99']), 'a record not on the map has no neighbour list');
check(($payload['groups'] ?? null) === 2, 'groups counts the groups of the placed records (0 is none)');
check(($payload['excluded'] ?? null) === ['sharedText' => 3, 'furniture' => 2], 'only integer exclusion counts pass');
check(!isset($payload['labels']), 'no labels in the file: none on the page');
check(ContentMap::neighboursOf($map, 1, $public) === [2, 3], 'an item page lists its public neighbours, closest first');
check(ContentMap::neighboursOf($map, 26, $public) === [], 'a record outside the public gallery lists none');
check(ContentMap::neighboursOf($map, 99, $public + [99 => true]) === [], 'a record not on the map lists none');

$map['places'] = ['minMentions' => 3, 'items' => ['1' => [['Ghana', 5], ['Togo', 'x']], '26' => [['Mali', 4]]]];
$placed = ContentMap::forGallery($map, $public);
check(($placed['places'] ?? null) === ['1' => [['Ghana', 5]]] && $placed['placesMinMentions'] === 3,
    'places keep only public records and well-formed pairs');
unset($map['places']);

$map['groups'] = [['id' => 1, 'size' => 9, 'label' => '  Hymns  '], ['id' => 2, 'size' => 8, 'label' => ''], ['id' => 3, 'size' => 1, 'label' => 'Gone']];
$unsigned = ContentMap::forGallery($map, $public);
check(!isset($unsigned['labels']), 'labels without their author are not shown');
$map['labels'] = ['by' => 'An AI model', 'from' => 'titles'];
$signed = ContentMap::forGallery($map, $public);
check(($signed['labels'] ?? null) === ['1' => 'Hymns'] && $signed['labelledBy'] === 'An AI model',
    'labels are trimmed, empty ones and those of groups not on the map dropped, and their author passed on');
check(ContentMap::forGallery($map, array_fill_keys(range(1, ContentMap::MIN_RECORDS - 1), true)) === null,
    'too few public records: no map');

finish('ContentMapTest: all checks passed');
