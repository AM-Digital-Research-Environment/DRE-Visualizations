<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

use InvalidArgumentException;

/**
 * Immutable, site-scoped input shared by precompute generators.
 *
 * Construction validates the corpus boundary once so downstream services can
 * rely on every item-keyed structure, relationship, membership, and coordinate
 * referring only to public items in the canonical site.
 */
final class CorpusSnapshot
{
    public function __construct(
        public readonly array $items,
        public readonly array $links,
        public readonly array $reverseLinks,
        public readonly array $childrenOf,
        public readonly array $itemYear,
        public readonly array $itemDate,
        public readonly array $temporal,
        public readonly array $geo,
        public readonly array $itemSets,
        public readonly array $templateLabels,
        public readonly array $literals,
        public readonly array $primaryMedia,
        public readonly array $scope,
    ) {
        $this->validate();
    }

    /** @param array<string,array> $data */
    public static function fromArray(array $data): self
    {
        $required = [
            'items', 'links', 'reverseLinks', 'childrenOf', 'itemYear',
            'itemDate', 'temporal', 'geo', 'itemSets', 'templateLabels',
            'literals', 'primaryMedia', 'scope',
        ];
        foreach ($required as $key) {
            if (!isset($data[$key]) || !is_array($data[$key])) {
                throw new InvalidArgumentException('Corpus snapshot array is missing: ' . $key);
            }
        }
        return new self(
            $data['items'],
            $data['links'],
            $data['reverseLinks'],
            $data['childrenOf'],
            $data['itemYear'],
            $data['itemDate'],
            $data['temporal'],
            $data['geo'],
            $data['itemSets'],
            $data['templateLabels'],
            $data['literals'],
            $data['primaryMedia'],
            $data['scope'],
        );
    }

    /** @return array{items:int,relationships:int,itemSets:int,primaryMedia:int} */
    public function sourceCounts(): array
    {
        $relationships = 0;
        foreach ($this->links as $relations) $relationships += count($relations);
        return [
            'items' => count($this->items),
            'relationships' => $relationships,
            'itemSets' => count($this->itemSets),
            'primaryMedia' => count($this->primaryMedia),
        ];
    }

    private function validate(): void
    {
        if (!$this->items
            || ($this->scope['type'] ?? null) !== 'canonical-site'
            || !is_int($this->scope['siteId'] ?? null) || $this->scope['siteId'] < 1
            || ($this->scope['itemCount'] ?? null) !== count($this->items)) {
            throw new InvalidArgumentException('Corpus snapshot has an invalid canonical-site scope.');
        }
        $allowed = array_fill_keys(array_map('intval', array_keys($this->items)), true);
        foreach ($this->items as $item) {
            if (($item['public'] ?? null) !== true) {
                throw new InvalidArgumentException('Corpus snapshot contains a non-public item.');
            }
        }
        foreach (['itemYear', 'itemDate', 'temporal', 'geo', 'literals', 'primaryMedia'] as $name) {
            foreach (array_keys($this->{$name}) as $itemId) {
                if (!isset($allowed[(int) $itemId])) {
                    throw new InvalidArgumentException($name . ' contains an out-of-scope item.');
                }
            }
        }
        foreach ($this->links as $sourceId => $relations) {
            if (!isset($allowed[(int) $sourceId])) {
                throw new InvalidArgumentException('Links contain an out-of-scope source.');
            }
            foreach ($relations as $relation) {
                if (!is_array($relation) || count($relation) < 3 || !isset($allowed[(int) $relation[2]])) {
                    throw new InvalidArgumentException('Links contain an invalid or out-of-scope target.');
                }
            }
        }
        foreach ([$this->reverseLinks, $this->childrenOf] as $index) {
            foreach ($index as $targetId => $sources) {
                if (!isset($allowed[(int) $targetId])) {
                    throw new InvalidArgumentException('Relationship index contains an out-of-scope target.');
                }
                $sourceLists = is_array($sources) && array_is_list($sources) ? [$sources] : $sources;
                foreach ($sourceLists as $sourceIds) {
                    foreach ((array) $sourceIds as $sourceId) {
                        if (!isset($allowed[(int) $sourceId])) {
                            throw new InvalidArgumentException('Relationship index contains an out-of-scope source.');
                        }
                    }
                }
            }
        }
        foreach ($this->itemSets as $itemIds) {
            foreach ($itemIds as $itemId) {
                if (!isset($allowed[(int) $itemId])) {
                    throw new InvalidArgumentException('Item-set membership contains an out-of-scope item.');
                }
            }
        }
        foreach ($this->geo as $coordinate) {
            $lat = $coordinate['lat'] ?? null;
            $lon = $coordinate['lon'] ?? null;
            if (!is_numeric($lat) || !is_numeric($lon)
                || (float) $lat < -90 || (float) $lat > 90
                || (float) $lon < -180 || (float) $lon > 180) {
                throw new InvalidArgumentException('Corpus snapshot contains invalid coordinates.');
            }
        }
    }
}
