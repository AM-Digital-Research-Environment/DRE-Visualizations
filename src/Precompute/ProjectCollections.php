<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

/**
 * Which item sets are a research project's collections.
 *
 * Each research project is an item (the project template) and usually also an
 * item set holding its records. The project item page is the canonical home of
 * both; the item set's page redirects there (DRE SEO). A set belongs to a
 * project when
 *   1. its dcterms:isPartOf links the project item (the sync writes this), or,
 *      failing any such link for that project,
 *   2. its dre:id equals the project item's dre:id (the identifier both carry
 *      before the sync writes the link). A set that already names a project
 *      in 1. is never matched again here.
 * Only public item sets holding scoped items and public, scoped project items
 * take part (CorpusSnapshot guarantees both). Nothing pins item-set ids.
 *
 * members() and byDreId() give the featured collections and the photo
 * galleries their project: what a project holds, and which project item a
 * profile's dre:id names.
 */
final class ProjectCollections
{
    /**
     * @param array<int,array<string,mixed>> $items
     * @param array<int,array<string,list<string>>> $literals
     * @param array<int,list<int>> $itemSets
     * @param array<int,array{title:string,dreId:?string,partOf:list<int>}> $itemSetRecords
     * @return array<int,list<array{id:int,title:string,items:int}>> project item id => its collections,
     *         sorted by title then id; projects without a collection are absent.
     */
    public static function resolve(array $items, array $literals, array $itemSets, array $itemSetRecords, int $projectTemplateId): array
    {
        $projects = [];
        foreach ($items as $id => $item) {
            if (($item['template_id'] ?? null) === $projectTemplateId) $projects[(int) $id] = true;
        }
        if (!$projects) return [];

        $byProject = $linked = [];
        foreach ($itemSetRecords as $setId => $record) {
            foreach ($record['partOf'] ?? [] as $target) {
                if (isset($projects[(int) $target])) {
                    $byProject[(int) $target][(int) $setId] = true;
                    $linked[(int) $setId] = true;
                }
            }
        }
        $byDreId = [];
        foreach ($itemSetRecords as $setId => $record) {
            $dreId = trim((string) ($record['dreId'] ?? ''));
            if ($dreId !== '' && !isset($linked[(int) $setId])) $byDreId[$dreId][] = (int) $setId;
        }
        foreach (array_keys($projects) as $projectId) {
            if (isset($byProject[$projectId])) continue;
            $dreId = trim((string) ($literals[$projectId]['dre:id'][0] ?? ''));
            foreach ($byDreId[$dreId] ?? [] as $setId) $byProject[$projectId][$setId] = true;
        }

        $collections = [];
        foreach ($byProject as $projectId => $setIds) {
            $list = [];
            foreach (array_keys($setIds) as $setId) {
                $count = count(array_unique($itemSets[$setId] ?? []));
                if ($count === 0) continue;
                $list[] = ['id' => $setId, 'title' => (string) $itemSetRecords[$setId]['title'], 'items' => $count];
            }
            if (!$list) continue;
            usort($list, static fn (array $a, array $b): int => strcmp($a['title'], $b['title']) ?: ($a['id'] <=> $b['id']));
            $collections[$projectId] = $list;
        }
        ksort($collections, SORT_NUMERIC);
        return $collections;
    }

    /**
     * Every project's records: the items whose dcterms:isPartOf links the
     * project item, together with the items of its collections. The link
     * alone keeps a project's records when its item set is private (whose
     * membership the loader never reads); the collections keep the records a
     * set holds before the sync links them.
     *
     * @param array<int,array<string,mixed>> $items
     * @param array<int,list<int>> $childrenOf item id => items whose dcterms:isPartOf links it
     * @param array<int,list<int>> $itemSets
     * @param array<int,list<array{id:int,title:string,items:int}>> $collections resolve()'s result
     * @return array<int,list<int>> project item id => its record ids, ascending; projects without records are absent.
     */
    public static function members(array $items, array $childrenOf, array $itemSets, array $collections, int $projectTemplateId): array
    {
        $members = [];
        foreach ($items as $id => $item) {
            if (($item['template_id'] ?? null) !== $projectTemplateId) continue;
            $ids = array_fill_keys($childrenOf[(int) $id] ?? [], true);
            foreach ($collections[(int) $id] ?? [] as $collection) {
                foreach ($itemSets[(int) $collection['id']] ?? [] as $itemId) $ids[(int) $itemId] = true;
            }
            unset($ids[(int) $id]);
            if (!$ids) continue;
            $ids = array_keys($ids);
            sort($ids, SORT_NUMERIC);
            $members[(int) $id] = $ids;
        }
        ksort($members, SORT_NUMERIC);
        return $members;
    }

    /**
     * Project item ids by their dre:id (the project's collection code, such as
     * UFB_AfroDigital): how the profile names a project without pinning an
     * Omeka id. Two projects sharing a dre:id resolve to the lower id.
     *
     * @param array<int,array<string,mixed>> $items
     * @param array<int,array<string,list<string>>> $literals
     * @return array<string,int>
     */
    public static function byDreId(array $items, array $literals, int $projectTemplateId): array
    {
        $ids = [];
        foreach ($items as $id => $item) {
            if (($item['template_id'] ?? null) !== $projectTemplateId) continue;
            $dreId = trim((string) ($literals[(int) $id]['dre:id'][0] ?? ''));
            if ($dreId !== '' && (!isset($ids[$dreId]) || (int) $id < $ids[$dreId])) $ids[$dreId] = (int) $id;
        }
        return $ids;
    }

    /**
     * The item sets that belong to some project, as a set: their own pages
     * redirect to the project, so they get no item-set dashboard.
     *
     * @param array<int,list<array{id:int,title:string,items:int}>> $collections resolve()'s result
     * @return array<int,true>
     */
    public static function setIds(array $collections): array
    {
        $ids = [];
        foreach ($collections as $list) {
            foreach ($list as $collection) $ids[(int) $collection['id']] = true;
        }
        return $ids;
    }
}
