<?php
declare(strict_types=1);
namespace DreVisualizations\FeaturedCollections;

use DreVisualizations\Precompute\PublishedSnapshot;
use DreVisualizations\Precompute\SnapshotStore;

/**
 * A featured collection's full-text map: where its articles sit by the words of
 * their full text, the groups they form and each one's closest articles.
 *
 * The full text is private, so the map is built offline
 * (`tools/fulltext/fulltext_map.py export`) and committed as
 * `config/fulltext-maps/<collection slug>.json`: Omeka ids, coordinates, group
 * numbers and neighbour scores, nothing quoted from the texts. A collection
 * without such a file has no "By content" view. Group labels, when the file
 * has them, are an experiment made by an AI model from the articles' public
 * titles (`fulltext_map.py label`); the page names the model.
 *
 * The file may also list, per article, the countries its text names
 * (`fulltext_map.py features`), and a sibling word-count file
 * (`asset/data/fulltext/<slug>-words.json`, {@see self::wordsAsset()}) feeds
 * the gallery's Words view.
 *
 * {@see self::forGallery()} keeps only the records of the current public
 * gallery snapshot, so a record made private or deleted since the export
 * leaves the map, the neighbour lists and the places at the next
 * regeneration. The word counts are aggregates of every article the export
 * placed, with no record to filter: re-export after withdrawing one.
 */
final class ContentMap
{
    public const SCHEMA_VERSION = 1;
    /** Fewer placed records than this and a similarity map says nothing. */
    public const MIN_RECORDS = 20;
    private const MAX_BYTES = 4 * 1024 * 1024;

    /** The committed file for $slug, or null (no map, unreadable, other schema). */
    public static function load(string $slug, ?string $directory = null): ?array
    {
        if (!preg_match('/^[a-z0-9-]{1,100}$/', $slug)) return null;
        $path = ($directory ?? dirname(__DIR__, 2) . '/config/fulltext-maps') . '/' . $slug . '.json';
        if (!is_file($path) || filesize($path) > self::MAX_BYTES) return null;
        $data = json_decode((string) file_get_contents($path), true);
        return is_array($data) && ($data['schemaVersion'] ?? null) === self::SCHEMA_VERSION
            && is_array($data['items'] ?? null) && is_array($data['neighbours'] ?? null) ? $data : null;
    }

    /**
     * The collection's word counts as a module asset path ('data/fulltext/…'),
     * or null when it has none.
     */
    public static function wordsAsset(string $slug, ?string $assetDirectory = null): ?string
    {
        if (!preg_match('/^[a-z0-9-]{1,100}$/', $slug)) return null;
        $relative = 'data/fulltext/' . $slug . '-words.json';
        return is_file(($assetDirectory ?? dirname(__DIR__, 2) . '/asset') . '/' . $relative) ? $relative : null;
    }

    /**
     * A published gallery (photo-galleries/<key>.json: collection-<slug>,
     * project-<item id> or an item-set id): the public records with their
     * titles, years and journal issues, or null when publication is
     * unavailable. $dataDir overrides the default store (tests).
     *
     * @return array{total:int,photos:array<int,array<string,mixed>>}|null
     */
    public static function gallery(string $key, ?string $dataDir = null): ?array
    {
        if (!preg_match('/^[a-z0-9-]{1,120}$/', $key)) return null;
        $dataDir ??= SnapshotStore::tryDefault()?->directory;
        $data = $dataDir === null ? null : PublishedSnapshot::readJson($dataDir, 'photo-galleries/' . $key . '.json');
        return (is_array($data) && isset($data['photos']) && is_array($data['photos'])) ? $data : null;
    }

    /**
     * The closest articles to $id that are in $publicIds, closest first, or []
     * when $id is not on the map.
     *
     * @param array<int,mixed> $publicIds record id => anything
     * @return list<int>
     */
    public static function neighboursOf(array $map, int $id, array $publicIds): array
    {
        $onMap = false;
        foreach ($map['items'] as $row) {
            if (is_array($row) && ($row[0] ?? null) === $id) {
                $onMap = true;
                break;
            }
        }
        if (!$onMap || !isset($publicIds[$id])) return [];
        $out = [];
        foreach ((array) ($map['neighbours'][(string) $id] ?? []) as $pair) {
            $other = is_array($pair) ? ($pair[0] ?? null) : null;
            if (is_int($other) && $other !== $id && isset($publicIds[$other])) $out[] = $other;
        }
        return $out;
    }

    /**
     * The map restricted to $publicIds, as the browser payload:
     * `{items: [[id, x, y, group]], neighbours: {id: [id, …]}, groups: int,
     * excluded: {reason: count}, model: string, labels?: {group: label},
     * labelledBy?: string, places?: {id: [[country, mentions]]},
     * placesMinMentions?: int}`, or null below MIN_RECORDS.
     *
     * Neighbours keep their order (closest first) but lose their scores: raw
     * cosines bunch between 0.93 and 0.97 and would read as precision they
     * do not have.
     *
     * @param array<int,mixed> $publicIds record id => anything
     */
    public static function forGallery(array $map, array $publicIds): ?array
    {
        $items = [];
        $groups = [];
        foreach ($map['items'] as $row) {
            if (!is_array($row) || count($row) !== 4) continue;
            [$id, $x, $y, $group] = $row;
            if (!is_int($id) || !isset($publicIds[$id]) || !is_numeric($x) || !is_numeric($y) || !is_int($group)) continue;
            $items[$id] = [$id, (float) $x, (float) $y, max(0, $group)];
            if ($group > 0) $groups[$group] = true;
        }
        if (count($items) < self::MIN_RECORDS) return null;

        $neighbours = [];
        foreach ($items as $id => $_) {
            $list = [];
            foreach ((array) ($map['neighbours'][(string) $id] ?? []) as $pair) {
                $other = is_array($pair) ? ($pair[0] ?? null) : null;
                if (is_int($other) && $other !== $id && isset($items[$other])) $list[] = $other;
            }
            if ($list) $neighbours[(string) $id] = $list;
        }

        $excluded = [];
        foreach ((array) ($map['counts']['excluded'] ?? []) as $reason => $count) {
            if (is_string($reason) && is_int($count)) $excluded[$reason] = $count;
        }
        $payload = [
            'items' => array_values($items),
            'neighbours' => $neighbours,
            'groups' => count($groups),
            'excluded' => $excluded,
            'model' => self::text($map['model']['name'] ?? null, 120) ?? '',
        ];
        $labels = [];
        foreach ((array) ($map['groups'] ?? []) as $group) {
            $id = is_array($group) ? ($group['id'] ?? null) : null;
            $label = is_array($group) ? self::text($group['label'] ?? null, 80) : null;
            if (is_int($id) && isset($groups[$id]) && $label !== null) $labels[(string) $id] = $label;
        }
        $by = self::text($map['labels']['by'] ?? null, 120);
        // Labels without the name of who made them would pass for editorial ones.
        if ($labels && $by !== null) {
            $payload['labels'] = $labels;
            $payload['labelledBy'] = $by;
        }
        $places = [];
        foreach ((array) ($map['places']['items'] ?? []) as $id => $rows) {
            if (!isset($items[(int) $id]) || !is_array($rows)) continue;
            $list = [];
            foreach ($rows as $row) {
                $country = is_array($row) ? self::text($row[0] ?? null, 60) : null;
                if ($country !== null && is_int($row[1] ?? null)) $list[] = [$country, $row[1]];
            }
            if ($list) $places[(string) (int) $id] = $list;
        }
        if ($places) {
            $payload['places'] = $places;
            $payload['placesMinMentions'] = is_int($map['places']['minMentions'] ?? null) ? $map['places']['minMentions'] : 1;
        }
        return $payload;
    }

    /** A trimmed non-empty string of at most $max characters, or null. */
    private static function text(mixed $value, int $max): ?string
    {
        if (!is_string($value)) return null;
        $value = trim($value);
        return $value === '' ? null : mb_substr($value, 0, $max);
    }
}
