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
