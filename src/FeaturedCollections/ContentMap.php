<?php
declare(strict_types=1);
namespace DreVisualizations\FeaturedCollections;

/**
 * A featured collection's full-text map: where its articles sit by the words of
 * their full text, the groups they form and each one's closest articles.
 *
 * The full text is private, so the map is built offline
 * (`tools/fulltext/fulltext_map.py export`) and committed as
 * `config/fulltext-maps/<collection slug>.json`: Omeka ids, coordinates, group
 * numbers and neighbour scores, nothing quoted from the texts. A collection
 * without such a file has no "By content" view.
 *
 * {@see self::forGallery()} keeps only the records of the current public
 * gallery snapshot, so a record made private or deleted since the export
 * leaves the map, and the neighbour lists, at the next regeneration.
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
     * The map restricted to $publicIds, as the browser payload:
     * `{items: [[id, x, y, group]], neighbours: {id: [id, …]}, groups: int,
     * excluded: {reason: count}}`, or null below MIN_RECORDS.
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
        return [
            'items' => array_values($items),
            'neighbours' => $neighbours,
            'groups' => count($groups),
            'excluded' => $excluded,
        ];
    }
}
