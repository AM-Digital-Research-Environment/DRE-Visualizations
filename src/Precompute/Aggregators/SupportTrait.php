<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute\Aggregators;

/**
 * Shared, low-level helpers used across the chart builders: list sorting,
 * reverse-link lookups, and the weighted-PageRank / Louvain primitives the
 * network and community graphs share.
 *
 * Composed into {@see \DreVisualizations\Precompute\Aggregators}; its methods
 * reach shared constants and helpers on that class through `self::`.
 */
trait SupportTrait
{
    /** Sort an associative count map by value descending, then key ascending. */
    private function sortCounts(array &$counts): void
    {
        $snapshot = $counts;
        uksort($counts, function (int|string $a, int|string $b) use ($snapshot): int {
            return (($snapshot[$b] ?? 0) <=> ($snapshot[$a] ?? 0))
                ?: strnatcasecmp((string) $a, (string) $b);
        });
    }

    /**
     * Sort a count map keyed by item id: value descending, then by the items'
     * titles (natural, case-insensitive), then by id — the order sortCounts()
     * gives a map keyed by title, without merging two items that share one.
     *
     * @param array<int,int> $counts
     * @param array<int,string> $titles
     */
    private function sortCountsByName(array &$counts, array $titles): void
    {
        $snapshot = $counts;
        uksort($counts, fn (int|string $a, int|string $b): int => (($snapshot[$b] ?? 0) <=> ($snapshot[$a] ?? 0))
            ?: strnatcasecmp((string) ($titles[$a] ?? ''), (string) ($titles[$b] ?? ''))
            ?: ((int) $a <=> (int) $b));
    }

    /**
     * Item titles for the given ids, with a typed placeholder for an item
     * without one.
     *
     * @param int[] $ids
     * @return array<int,string>
     */
    private function titlesFor(array $ids, array $items, string $placeholder): array
    {
        $titles = [];
        foreach ($ids as $id) {
            $titles[$id] = (string) ($items[$id]['title'] ?? ($placeholder . ' ' . $id));
        }
        return $titles;
    }

    /**
     * Node names unique within one chart. ECharts graph, sankey and chord
     * series join links to nodes by name, so two items with one title (two
     * people called "Smith, John") would merge into a single node; each of
     * them is suffixed with its id instead.
     *
     * @param array<int,string> $titles item id => title
     * @return array<int,string>
     */
    private function uniqueNames(array $titles): array
    {
        $byTitle = [];
        foreach ($titles as $id => $title) {
            $byTitle[$title][] = $id;
        }
        foreach ($byTitle as $title => $ids) {
            if (count($ids) > 1) {
                foreach ($ids as $id) {
                    $titles[$id] = $title . ' (#' . $id . ')';
                }
            }
        }
        return $titles;
    }

    /** Find item IDs that link to $entityId via any of the given terms. */
    public function findItemsLinkingTo(int $entityId, array $reverseLinks, array $terms): array
    {
        $result = [];
        $rev = $reverseLinks[$entityId] ?? [];
        foreach ($terms as $term) {
            foreach ($rev[$term] ?? [] as $id) {
                $result[$id] = true;
            }
        }
        return array_keys($result);
    }

    /** Sort a list of {name,value,...} rows by value descending (stable-ish). */
    private function sortByValueDesc(array $rows): array
    {
        usort($rows, fn ($a, $b) => ($b['value'] <=> $a['value'])
            ?: strnatcasecmp((string) ($a['name'] ?? ''), (string) ($b['name'] ?? '')));
        return $rows;
    }

    /** Pure-PHP weighted PageRank (power iteration), matching the Python. */
    private function weightedPagerank(array $adj, array $deg, float $alpha = 0.85, int $iters = 100, float $tol = 1.0e-6): array
    {
        $nodes = array_keys($adj);
        $n = count($nodes);
        if ($n === 0) {
            return [];
        }
        $pr = [];
        foreach ($nodes as $u) {
            $pr[$u] = 1.0 / $n;
        }
        $base = (1.0 - $alpha) / $n;
        for ($it = 0; $it < $iters; $it++) {
            $prev = $pr;
            $pr = [];
            foreach ($nodes as $u) {
                $pr[$u] = $base;
            }
            foreach ($nodes as $u) {
                $d = $deg[$u] ?: 1;
                $share = $alpha * $prev[$u] / $d;
                foreach ($adj[$u] as $v => $w) {
                    $pr[$v] += $share * $w;
                }
            }
            $err = 0.0;
            foreach ($nodes as $u) {
                $err += abs($pr[$u] - $prev[$u]);
            }
            if ($err < $tol) {
                break;
            }
        }
        $total = array_sum($pr) ?: 1.0;
        foreach ($pr as $u => $v) {
            $pr[$u] = $v / $total;
        }
        return $pr;
    }

    /**
     * Single-level Louvain (modularity-maximising local moving) on a weighted
     * undirected graph. Returns [node => communityRepresentativeId]. Sufficient
     * for well-separated subject co-occurrence graphs; relabelled by the caller.
     */
    private function louvain(array $adj, array $deg, float $m): array
    {
        $comm = [];
        $sigmaTot = [];
        foreach ($adj as $u => $_) {
            $comm[$u] = $u;
            $sigmaTot[$u] = $deg[$u];
        }
        $twoM = 2.0 * $m;
        if ($twoM <= 0) {
            return $comm;
        }
        $nodes = array_keys($adj);
        $improved = true;
        $passes = 0;
        while ($improved && $passes < 50) {
            $improved = false;
            $passes++;
            foreach ($nodes as $u) {
                $ku = $deg[$u];
                $cu = $comm[$u];
                $sigmaTot[$cu] -= $ku;
                $kIn = [];
                foreach ($adj[$u] as $v => $w) {
                    if ($v === $u) {
                        continue;
                    }
                    $cv = $comm[$v];
                    $kIn[$cv] = ($kIn[$cv] ?? 0.0) + $w;
                }
                $best = $cu;
                $bestGain = ($kIn[$cu] ?? 0.0) - $sigmaTot[$cu] * $ku / $twoM;
                foreach ($kIn as $c => $w) {
                    $gain = $w - $sigmaTot[$c] * $ku / $twoM;
                    if ($gain > $bestGain) {
                        $bestGain = $gain;
                        $best = $c;
                    }
                }
                $comm[$u] = $best;
                $sigmaTot[$best] += $ku;
                if ($best !== $cu) {
                    $improved = true;
                }
            }
        }
        return $comm;
    }
}
