<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute\Aggregators;

/**
 * Publication-specific aggregations: top journals, series, publishers and
 * funders (linked records, plus the literals not yet reconciled), stat-card
 * counts, the countries the publications appeared in, and the top-authors
 * union of linked persons and literal names.
 *
 * The ranked lists are whole by default ($topN null): the bar chart pages
 * through them twenty at a time, and its CSV and data table carry them all.
 *
 * Composed into {@see \DreVisualizations\Precompute\Aggregators}; its methods
 * reach shared constants and helpers on that class through `self::`.
 */
trait PublicationChartsTrait
{
    // Provided by SupportTrait / Aggregators (or another trait); declared so
    // this trait states what it relies on and PHP checks the signatures.
    abstract private function sortByValueDesc(array $rows): array;

    /**
     * Top values of a property that holds both links and literals — e.g.
     * dcterms:publisher, an Organisation link once the publisher reconciles and
     * the publisher's name as text until then. Each linked record counts under
     * its title with a click-through itemId; a literal that spells a linked
     * title (case-insensitive) joins that row, the rest count as text. A value
     * repeated on one item counts once. Feeds buildBarChart.
     *
     * @return list<array{name:string,value:int,itemId?:int}>|null
     */
    public function buildTopValues(array $itemIds, array $links, array $literals, array $items, string $term, ?int $topN = null): ?array
    {
        $rows = $this->tallyValues($itemIds, $links, $literals, $items, $term);
        return $rows ? array_slice($this->sortByValueDesc($rows), 0, $topN) : null;
    }

    /**
     * Distinct values of a property across items, links and literals together
     * (the same grouping as buildTopValues) — e.g. how many publishers a
     * bibliography spans. Feeds stat cards.
     */
    public function countDistinctValues(array $itemIds, array $links, array $literals, array $items, string $term): int
    {
        return count($this->tallyValues($itemIds, $links, $literals, $items, $term));
    }

    /** @return list<array{name:string,value:int,itemId?:int}> */
    private function tallyValues(array $itemIds, array $links, array $literals, array $items, string $term): array
    {
        $rows = [];      // key => row; 'i<id>' for a linked record, 't<lower>' for text
        $byTitle = [];   // lower-cased linked title => row key
        foreach ($itemIds as $iid) {
            foreach ($links[$iid] ?? [] as [$t, , $vrid]) {
                $title = trim((string) ($items[$vrid]['title'] ?? ''));
                if ($t === $term && $title !== '') {
                    $byTitle[mb_strtolower($title)] ??= 'i' . $vrid;
                }
            }
        }
        foreach ($itemIds as $iid) {
            $seen = [];
            foreach ($links[$iid] ?? [] as [$t, , $vrid]) {
                $title = trim((string) ($items[$vrid]['title'] ?? ''));
                if ($t !== $term || $title === '' || isset($seen['i' . $vrid])) {
                    continue;
                }
                $seen['i' . $vrid] = true;
                $rows['i' . $vrid] ??= ['name' => $title, 'value' => 0, 'itemId' => $vrid];
                $rows['i' . $vrid]['value']++;
            }
            foreach ($literals[$iid][$term] ?? [] as $val) {
                $val = trim((string) $val);
                if ($val === '') {
                    continue;
                }
                $key = $byTitle[mb_strtolower($val)] ?? ('t' . mb_strtolower($val));
                if (isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $rows[$key] ??= ['name' => $val, 'value' => 0];
                $rows[$key]['value']++;
            }
        }
        return array_values($rows);
    }

    /**
     * Top linked entities of a property across items (e.g. frapo:isFundedBy
     * funders), resolved to their titles with click-through itemIds. A value
     * repeated on the same item counts once. Feeds buildBarChart.
     *
     * @return list<array{name:string,value:int,itemId:int}>|null
     */
    public function buildTopLinked(array $itemIds, array $links, array $items, string $term, ?int $topN = null): ?array
    {
        return $this->buildTopLinkedOfClass($itemIds, $links, $items, [$term], [], $topN);
    }

    /**
     * Top linked records reached through any of $terms, kept to those whose
     * resource class is one of $classes (all classes when empty) — e.g. the
     * Journal records articles link to through dcterms:isPartOf, or the Series
     * records reached through dcterms:isPartOf and dre:series. A record linked
     * twice from one item counts once. Feeds buildBarChart.
     *
     * @param list<string> $terms
     * @param list<string> $classes
     * @return list<array{name:string,value:int,itemId:int}>|null
     */
    public function buildTopLinkedOfClass(array $itemIds, array $links, array $items, array $terms, array $classes = [], ?int $topN = null): ?array
    {
        $counts = $this->tallyLinkedOfClass($itemIds, $links, $items, $terms, $classes);
        return $counts ? array_slice($this->sortByValueDesc(array_values($counts)), 0, $topN) : null;
    }

    /** Distinct linked records reached through $terms and of one of $classes. Feeds stat cards. */
    public function countLinkedOfClass(array $itemIds, array $links, array $items, array $terms, array $classes = []): int
    {
        return count($this->tallyLinkedOfClass($itemIds, $links, $items, $terms, $classes));
    }

    /** @return array<int,array{name:string,value:int,itemId:int}> */
    private function tallyLinkedOfClass(array $itemIds, array $links, array $items, array $terms, array $classes): array
    {
        $terms = array_flip($terms);
        $classes = array_flip($classes);
        $counts = [];
        foreach ($itemIds as $iid) {
            $seen = [];
            foreach ($links[$iid] ?? [] as [$t, , $vrid]) {
                if (!isset($terms[$t]) || isset($seen[$vrid])
                    || ($classes && !isset($classes[$items[$vrid]['class_term'] ?? '']))) {
                    continue;
                }
                $seen[$vrid] = true;
                $title = trim((string) ($items[$vrid]['title'] ?? ''));
                if ($title === '') {
                    continue;
                }
                $counts[$vrid] ??= ['name' => $title, 'value' => 0, 'itemId' => $vrid];
                $counts[$vrid]['value']++;
            }
        }
        return $counts;
    }

    /**
     * How many items carry a link on $term whose target's title equals $title
     * (trimmed, case-insensitive) — e.g. publications whose bibo:status links
     * to the "Peer reviewed" authority record. Each item counts once. Feeds
     * stat cards.
     */
    public function countItemsLinkedTo(array $itemIds, array $links, array $items, string $term, string $title): int
    {
        $n = 0;
        foreach ($itemIds as $iid) {
            foreach ($links[$iid] ?? [] as [$t, , $vrid]) {
                if ($t === $term
                    && strcasecmp(trim((string) ($items[$vrid]['title'] ?? '')), $title) === 0
                ) {
                    $n++;
                    break;
                }
            }
        }
        return $n;
    }

    /**
     * Top authors across publications, unioning literal bibo:authorList names
     * with Person-linked authors (resolved to their titles). Each row carries a
     * `matched` flag (true = a linked Person entity) and, when matched, an
     * itemId. Feeds buildBarChart.
     *
     * @return list<array{name:string,value:int,matched:bool,itemId?:int}>|null
     */
    public function buildTopAuthors(array $itemIds, array $links, array $literals, array $items, ?int $topN = null): ?array
    {
        $counts = [];
        $matched = [];
        $itemIdOf = [];
        foreach ($itemIds as $iid) {
            $seen = [];
            foreach ($links[$iid] ?? [] as [$term, $label, $vrid]) {
                if ($term !== 'bibo:authorList') {
                    continue;
                }
                $title = trim((string) ($items[$vrid]['title'] ?? ''));
                if ($title === '' || isset($seen[$title])) {
                    continue;
                }
                $seen[$title] = true;
                $counts[$title] = ($counts[$title] ?? 0) + 1;
                $matched[$title] = true;
                $itemIdOf[$title] = $vrid;
            }
            foreach ($literals[$iid]['bibo:authorList'] ?? [] as $name) {
                $name = trim((string) $name);
                if ($name === '' || isset($seen[$name])) {
                    continue;
                }
                $seen[$name] = true;
                $counts[$name] = ($counts[$name] ?? 0) + 1;
                $matched[$name] ??= false;
            }
        }
        if (!$counts) {
            return null;
        }
        $out = [];
        foreach ($counts as $name => $c) {
            $name = (string) $name;
            $row = ['name' => $name, 'value' => $c, 'matched' => $matched[$name] ?? false];
            if (!empty($matched[$name]) && isset($itemIdOf[$name])) {
                $row['itemId'] = $itemIdOf[$name];
            }
            $out[] = $row;
        }
        return array_slice($this->sortByValueDesc($out), 0, $topN);
    }
}
