<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

use InvalidArgumentException;

/**
 * Projects an installation-wide loader snapshot onto one public Omeka site.
 *
 * The allowed item ids come from DataLoader's site_item query. This second,
 * pure boundary is deliberately defensive: an id must also resolve to a public
 * item in the snapshot, and every item-keyed structure and relationship target
 * is filtered through the resulting set before any generator sees the data.
 */
final class PublicCorpus
{
    public function __construct(private readonly int $siteId)
    {
        if ($siteId < 1) {
            throw new InvalidArgumentException('A positive canonical site id is required.');
        }
    }

    /**
     * @param array<string,array> $data
     * @param list<int> $allowedItemIds Public item ids assigned to this site.
     * @return array<string,array>
     */
    public function project(array $data, array $allowedItemIds): array
    {
        $requested = array_fill_keys(array_map('intval', $allowedItemIds), true);
        $allowed = [];
        foreach ($data['items'] ?? [] as $id => $item) {
            $id = (int) $id;
            if (isset($requested[$id]) && ($item['public'] ?? false) === true) {
                $allowed[$id] = true;
            }
        }

        $projected = $data;
        $projected['items'] = $this->filterKeyed($data['items'] ?? [], $allowed);
        foreach (['itemYear', 'itemDate', 'temporal', 'geo', 'literals', 'primaryMedia'] as $key) {
            $projected[$key] = $this->filterKeyed($data[$key] ?? [], $allowed);
        }

        // Rebuild relationship indexes from the filtered forward links. This
        // prevents a public source from naming a private/cross-site target and
        // guarantees the three indexes cannot drift apart.
        $links = [];
        $reverseLinks = [];
        $childrenOf = [];
        foreach ($data['links'] ?? [] as $sourceId => $relations) {
            $sourceId = (int) $sourceId;
            if (!isset($allowed[$sourceId])) {
                continue;
            }
            foreach ($relations as $relation) {
                if (!is_array($relation) || count($relation) < 3) {
                    continue;
                }
                $targetId = (int) $relation[2];
                if (!isset($allowed[$targetId])) {
                    continue;
                }
                $term = (string) $relation[0];
                $links[$sourceId][] = [$term, (string) ($relation[1] ?? ''), $targetId];
                $reverseLinks[$targetId][$term][] = $sourceId;
                if ($term === 'dcterms:isPartOf') {
                    $childrenOf[$targetId][] = $sourceId;
                }
            }
        }
        $projected['links'] = $links;
        $projected['reverseLinks'] = $reverseLinks;
        $projected['childrenOf'] = $childrenOf;

        $itemSets = [];
        foreach ($data['itemSets'] ?? [] as $setId => $itemIds) {
            $members = [];
            foreach ($itemIds as $itemId) {
                $itemId = (int) $itemId;
                if (isset($allowed[$itemId])) {
                    $members[$itemId] = true;
                }
            }
            if ($members) {
                $ids = array_keys($members);
                sort($ids, SORT_NUMERIC);
                $itemSets[(int) $setId] = $ids;
            }
        }
        $projected['itemSets'] = $itemSets;
        $projected['scope'] = [
            'type' => 'canonical-site',
            'siteId' => $this->siteId,
            'itemCount' => count($allowed),
        ];

        return $projected;
    }

    /** @param array<int|string,mixed> $values @param array<int,bool> $allowed */
    private function filterKeyed(array $values, array $allowed): array
    {
        return array_intersect_key($values, $allowed);
    }
}
