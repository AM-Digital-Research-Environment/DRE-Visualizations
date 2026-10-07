<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute\Aggregators;

/**
 * Hierarchical breakdowns: the type→language→subject sunburst and the
 * project→type treemap.
 *
 * Composed into {@see \DreVisualizations\Precompute\Aggregators}; its methods
 * reach shared constants and helpers on that class through `self::`.
 */
trait HierarchyChartsTrait
{
    // Provided by SupportTrait / Aggregators (or another trait); declared so
    // this trait states what it relies on and PHP checks the signatures.
    abstract private function projectTemplateId(): int;
    abstract private function sortCounts(array &$counts): void;

    /** Build type -> language -> subject sunburst hierarchy. */
    public function buildSunburst(array $itemIds, array $links, array $items): ?array
    {
        $tree = [];
        foreach ($itemIds as $iid) {
            $itemTypes = [];
            $itemLangs = [];
            $itemSubjects = [];
            foreach ($links[$iid] ?? [] as [$term, $label, $vrid]) {
                $title = $items[$vrid]['title'] ?? '';
                if ($title === '') {
                    continue;
                }
                if ($term === 'dcterms:type') {
                    $itemTypes[] = $title;
                } elseif ($term === 'dcterms:language') {
                    $itemLangs[] = $title;
                } elseif ($term === 'dcterms:subject') {
                    $itemSubjects[] = $title;
                }
            }
            foreach ($itemTypes as $t) {
                foreach ($itemLangs as $l) {
                    $tree[$t][$l] ??= [];
                    if ($itemSubjects) {
                        foreach (array_slice($itemSubjects, 0, 5) as $s) {
                            $tree[$t][$l][$s] = ($tree[$t][$l][$s] ?? 0) + 1;
                        }
                    } else {
                        $tree[$t][$l]['(no subject)'] = ($tree[$t][$l]['(no subject)'] ?? 0) + 1;
                    }
                }
            }
        }
        if (!$tree) {
            return null;
        }

        $result = [];
        foreach ($tree as $typeName => $langs) {
            $typeNode = ['name' => $typeName, 'children' => []];
            foreach ($langs as $langName => $subjects) {
                $langNode = ['name' => $langName, 'children' => []];
                $this->sortCounts($subjects);
                foreach (array_slice($subjects, 0, 8, true) as $subName => $count) {
                    $langNode['children'][] = ['name' => $subName, 'value' => $count];
                }
                $typeNode['children'][] = $langNode;
            }
            $result[] = $typeNode;
        }
        return $result;
    }

    /** Build Project -> Type treemap hierarchy. */
    public function buildTreemap(array $itemIds, array $links, array $items, array $childrenOf, string $parentTitle): ?array
    {
        $projectItems = [];
        $unassigned = [];
        foreach ($itemIds as $iid) {
            $assigned = false;
            foreach ($links[$iid] ?? [] as [$term, $label, $vrid]) {
                if ($term === 'dcterms:isPartOf' && ($items[$vrid]['template_id'] ?? null) === $this->projectTemplateId()) {
                    $projectItems[$vrid][] = $iid;
                    $assigned = true;
                    break;
                }
            }
            if (!$assigned) {
                $unassigned[] = $iid;
            }
        }
        if (!$projectItems && !$unassigned) {
            return null;
        }

        $typeChildren = function (array $iids) use ($links, $items): array {
            $types = [];
            foreach ($iids as $iid) {
                foreach ($links[$iid] ?? [] as [$term, $label, $vrid]) {
                    if ($term === 'dcterms:type') {
                        $title = $items[$vrid]['title'] ?? '';
                        if ($title !== '') {
                            $types[$title] = ($types[$title] ?? 0) + 1;
                        }
                    }
                }
            }
            $this->sortCounts($types);
            $children = [];
            foreach ($types as $t => $c) {
                $children[] = ['name' => $t, 'value' => $c];
            }
            return $children;
        };

        // Sort projects by descending item count.
        uksort($projectItems, fn ($a, $b) => count($projectItems[$b]) <=> count($projectItems[$a]));

        $result = [];
        foreach ($projectItems as $pid => $iids) {
            $ptitle = $items[$pid]['title'] ?? ('Project ' . $pid);
            $children = $typeChildren($iids);
            if ($children) {
                $result[] = ['name' => $ptitle, 'value' => count($iids), 'children' => $children];
            }
        }
        if ($unassigned) {
            $children = $typeChildren($unassigned);
            if ($children) {
                $result[] = ['name' => '(unassigned)', 'value' => count($unassigned), 'children' => $children];
            }
        }
        return $result ?: null;
    }
}
