<?php
declare(strict_types=1);

namespace DreVisualizations\Listener;

use Doctrine\DBAL\Connection;

/**
 * What of a resource the public could see: its visibility flag, its public
 * values, how many values are private and (for an item) which media are public.
 * Comparing the state before and after a write tells whether the write hid
 * something a stale snapshot could still show.
 *
 * The state before comes from the database, the state after from the hydrated
 * entities, which are right even when the caller defers the flush.
 *
 * @phpstan-type State array{public:bool,values:array<string,true>,private:int,media:array<int,bool>}
 */
final class VisibilityState
{
    /** API resources whose writes can privatise something. */
    public const RESOURCES = ['items', 'media', 'item_sets'];

    private const CHUNK = 500;

    /**
     * @param list<int|string> $ids
     * @return array<int,State>
     */
    public static function load(Connection $connection, array $ids): array
    {
        $states = [];
        foreach (array_chunk(array_values(array_unique(array_map('intval', $ids))), self::CHUNK) as $chunk) {
            $in = implode(',', $chunk);
            foreach ($connection->executeQuery("SELECT id, is_public FROM resource WHERE id IN ($in)")->fetchAllNumeric() as [$id, $public]) {
                $states[(int) $id] = ['public' => (bool) $public, 'values' => [], 'private' => 0, 'media' => []];
            }
            $rows = $connection->executeQuery('SELECT resource_id, property_id, type, lang, value, uri, value_resource_id, is_public'
                . " FROM value WHERE resource_id IN ($in)")->fetchAllNumeric();
            foreach ($rows as [$resource, $property, $type, $lang, $value, $uri, $target, $public]) {
                if (!isset($states[(int) $resource])) continue;
                if ($public) {
                    $states[(int) $resource]['values'][self::fingerprint($property, $type, $lang, $value, $uri, $target)] = true;
                } else {
                    $states[(int) $resource]['private']++;
                }
            }
            $rows = $connection->executeQuery('SELECT m.item_id, m.id, r.is_public FROM media m JOIN resource r ON r.id = m.id'
                . " WHERE m.item_id IN ($in)")->fetchAllNumeric();
            foreach ($rows as [$item, $media, $public]) {
                if (isset($states[(int) $item])) $states[(int) $item]['media'][(int) $media] = (bool) $public;
            }
        }
        return $states;
    }

    /**
     * The state of hydrated entities (an API response's content), keyed by id.
     * Anything without an id or values is skipped.
     *
     * @return array<int,State>
     */
    public static function fromEntities(mixed $content): array
    {
        $states = [];
        foreach (is_array($content) ? $content : [$content] as $resource) {
            if (!is_object($resource) || !method_exists($resource, 'getValues') || !method_exists($resource, 'isPublic')) continue;
            $id = $resource->getId();
            if ($id === null) continue;
            $state = ['public' => (bool) $resource->isPublic(), 'values' => [], 'private' => 0, 'media' => []];
            foreach ($resource->getValues() as $value) {
                if ($value->isPublic()) {
                    $state['values'][self::fingerprint($value->getProperty()->getId(), $value->getType(), $value->getLang(),
                        $value->getValue(), $value->getUri(), $value->getValueResource()?->getId())] = true;
                } else {
                    $state['private']++;
                }
            }
            if (method_exists($resource, 'getMedia')) {
                foreach ($resource->getMedia() as $media) {
                    if ($media->getId() !== null) $state['media'][(int) $media->getId()] = (bool) $media->isPublic();
                }
            }
            $states[(int) $id] = $state;
        }
        return $states;
    }

    /**
     * Whether a write hid something that was public: a public resource or one
     * of an item's media turned private, or a public value turned private. A
     * value counts as privatised when a public one went missing while the
     * private count grew; that also catches a value edited and hidden at once.
     * Deleting a resource, a medium or a value is not privatising, nor is
     * anything on a resource that was already private.
     *
     * @param array<int,State> $before
     * @param array<int,State> $after
     */
    public static function privatised(array $before, array $after): bool
    {
        return self::privatisedIds($before, $after) !== [];
    }

    /**
     * The resources privatised() holds the write responsible for: each one
     * that turned private, lost a public value, or (for an item) a public medium.
     *
     * @param array<int,State> $before
     * @param array<int,State> $after
     * @return list<int>
     */
    public static function privatisedIds(array $before, array $after): array
    {
        $ids = [];
        foreach ($after as $id => $now) {
            $was = $before[$id] ?? null;
            if ($was === null || !$was['public']) continue;
            $hidMedia = false;
            foreach ($was['media'] as $media => $public) {
                if ($public && ($now['media'][$media] ?? null) === false) $hidMedia = true;
            }
            if (!$now['public'] || $hidMedia
                || ($now['private'] > $was['private'] && array_diff_key($was['values'], $now['values']))) {
                $ids[] = (int) $id;
            }
        }
        return $ids;
    }

    private static function fingerprint(mixed ...$parts): string
    {
        return hash('sha256', implode("\x1F", array_map(static fn ($part): string => (string) $part, $parts)));
    }
}
