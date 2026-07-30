<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

/**
 * Dependency-free per-item knowledge-graph builder. Produces one graph per
 * Omeka item: its direct relationships, items that link back to it, and
 * IDF-ranked "shared" items that co-occur through rare (distinctive) resources.
 *
 * Output matches the shape asset/js/knowledge-graph.js consumes exactly:
 *   { nodes:[{id,name,category,symbolSize,itemId,isCenter?,freqPct?,strength?,sharedCount?}],
 *     edges:[{source,target,name,isShared?,idf?,freqPct?}],
 *     categories:[{name}], stats:{maxStrength,maxFreqPct}, itemMap?:{origins,current} }
 *
 * Reuses the structures {@see DataLoader} already loads (items, links,
 * reverseLinks, geo), so no extra DB work beyond the dashboard precompute.
 */
final class KnowledgeGraphs
{
    /** Property term => node category. */
    private const PROP_CAT = [
        'dcterms:creator' => 'Person', 'dcterms:contributor' => 'Person', 'foaf:member' => 'Person',
        // Publications credit their people through bibo: rather than dcterms:, so
        // without these two a publication's graph showed no authors at all and a
        // person's graph never reached the work they wrote. Both stay 'Person' — the
        // edge already carries the property label ("Author", "Editor"), which is
        // where that distinction belongs; a separate category would only split the
        // legend and give editors a non-person colour.
        'bibo:authorList' => 'Person', 'bibo:editorList' => 'Person',
        'dcterms:subject' => 'Subject',
        'dcterms:spatial' => 'Location', 'dcterms:provenance' => 'Location',
        'dcterms:isPartOf' => 'Project',
        'dcterms:format' => 'Genre',
        'frapo:isFundedBy' => 'Institution',
        'dcterms:relation' => 'Related Item', 'dcterms:hasPart' => 'Related Item',
        'dcterms:replaces' => 'Related Item', 'dcterms:isReplacedBy' => 'Related Item',
        'dcterms:hasVersion' => 'Related Item', 'dcterms:isVersionOf' => 'Related Item',
        'dcterms:hasFormat' => 'Related Item',
    ];

    /**
     * Terms whose links are "shareable" — used to discover co-occurring items.
     *
     * The bibo: author/editor terms belong here for the same reason as the dcterms:
     * ones: two publications by one author are exactly the kind of co-occurrence
     * this pass exists to surface, and without them a person's own works never
     * showed up alongside each other.
     */
    private const SHAREABLE = [
        'dcterms:subject', 'dcterms:isPartOf', 'dcterms:spatial',
        'dcterms:creator', 'dcterms:contributor',
        'bibo:authorList', 'bibo:editorList',
    ];

    /** Priority order for direct relationships when capping. */
    private const CAT_PRIORITY = ['Person', 'Contributor', 'Subject', 'Project', 'Location', 'Institution', 'Genre', 'Related Item'];

    // Node budgets. Raised in v2.22 when the front end moved off the ECharts graph
    // series onto the d3-force canvas renderer: it lays out with Barnes–Hut plus a
    // collision pass and places labels by collision test, so a few hundred nodes
    // stay readable where the old renderer turned to soup well before 150. Readers
    // who want fewer still have the "Max. neighbours" slider.
    private const MAX_DIRECT_NODES = 220;
    private const MAX_REVERSE_NODES = 40;
    private const MAX_SHARED_NODES = 90;
    private const MAX_REVERSE_ITEMS = 60;

    // Budget for the cross pass (see addCrossEdges). Bounds both the work done per
    // item and the size of the emitted JSON; the scan cap keeps the cost linear in
    // the node budget rather than in the corpus.
    private const MAX_CROSS_EDGES = 400;
    private const MAX_CROSS_SCAN = 250;

    private static function getCategory(string $term): ?string
    {
        if (isset(self::PROP_CAT[$term])) {
            return self::PROP_CAT[$term];
        }
        if (str_starts_with($term, 'marcrel:')) {
            return 'Contributor';
        }
        return null;
    }

    private static function isShareable(string $term): bool
    {
        return in_array($term, self::SHAREABLE, true) || str_starts_with($term, 'marcrel:');
    }

    /**
     * IDF + frequency-percentage for every resource that appears as a link
     * target. idf(r) = ln(N / df(r)); freqPct(r) = df(r) / N * 100.
     *
     * @return array{0:array<int,float>,1:array<int,float>} [idf, freqPct]
     */
    public static function computeResourceStats(array $links, int $totalItems): array
    {
        $docFreq = [];
        foreach ($links as $rels) {
            $seen = [];
            foreach ($rels as [$term, $label, $vrid]) {
                if (!isset($seen[$vrid])) {
                    $seen[$vrid] = true;
                    $docFreq[$vrid] = ($docFreq[$vrid] ?? 0) + 1;
                }
            }
        }
        $idf = [];
        $freqPct = [];
        if ($totalItems > 0) {
            foreach ($docFreq as $vrid => $df) {
                $idf[$vrid] = $df > 0 ? round(log($totalItems / $df), 2) : 0.0;
                $freqPct[$vrid] = round($df / $totalItems * 100, 1);
            }
        }
        return [$idf, $freqPct];
    }

    /**
     * Shareable reverse index: resourceId => [sourceItemId => true], limited to
     * SHAREABLE / marcrel: terms. Derived from DataLoader's reverseLinks. Powers
     * the IDF-ranked shared-item discovery.
     *
     * @return array<int,array<int,bool>>
     */
    public static function buildShareableReverse(array $reverseLinks): array
    {
        $reverse = [];
        foreach ($reverseLinks as $vrid => $byTerm) {
            foreach ($byTerm as $term => $rids) {
                if (!self::isShareable((string) $term)) {
                    continue;
                }
                foreach ($rids as $rid) {
                    $reverse[$vrid][$rid] = true;
                }
            }
        }
        return $reverse;
    }

    /** Origin (dcterms:spatial) + current (dcterms:provenance) locations with coordinates. */
    public static function buildItemMap(int $itemId, array $links, array $geo): ?array
    {
        $origins = [];
        $current = [];
        $seen = [];
        foreach ($links[$itemId] ?? [] as [$term, $label, $vrid]) {
            if ($term !== 'dcterms:spatial' && $term !== 'dcterms:provenance') {
                continue;
            }
            if (isset($seen[$vrid]) || !isset($geo[$vrid])) {
                continue;
            }
            $seen[$vrid] = true;
            $loc = $geo[$vrid];
            $entry = ['name' => $loc['name'], 'lat' => $loc['lat'], 'lon' => $loc['lon'], 'itemId' => $loc['itemId']];
            if ($term === 'dcterms:spatial') {
                $origins[] = $entry;
            } else {
                $current[] = $entry;
            }
        }
        if (!$origins && !$current) {
            return null;
        }
        return ['origins' => $origins, 'current' => $current];
    }

    /**
     * Build the knowledge graph centred on $itemId. Returns null when the item
     * has fewer than two nodes (nothing worth rendering).
     *
     * @param array $reverse       shareable reverse index (see buildShareableReverse)
     * @param array $idf           resourceId => IDF score
     * @param array $freqPct       resourceId => frequency percentage (0–100)
     */
    public static function buildGraph(int $itemId, array $items, array $links, array $reverseLinks, array $reverse, array $idf, array $freqPct): ?array
    {
        if (!isset($items[$itemId])) {
            return null;
        }
        $item = $items[$itemId];
        $centerCat = ($item['class_label'] ?? '') !== '' ? (string) $item['class_label'] : 'Item';

        $nodes = [];
        $edges = [];
        $categories = [['name' => $centerCat]];
        $catMap = [$centerCat => 0];
        $seen = [];
        $centerLinked = []; // vrid => node-id for shareable direct resources

        $ensureCat = function (string $name) use (&$catMap, &$categories): int {
            if (!isset($catMap[$name])) {
                $catMap[$name] = count($categories);
                $categories[] = ['name' => $name];
            }
            return $catMap[$name];
        };

        $nodes[] = [
            'id' => 'item_' . $itemId, 'name' => $item['title'] ?? ('Item ' . $itemId),
            'category' => 0, 'symbolSize' => 45, 'isCenter' => true, 'itemId' => $itemId,
        ];

        // ── Direct relationships, prioritised by category ──────────────
        $directRels = [];
        foreach ($links[$itemId] ?? [] as [$term, $label, $vrid]) {
            $cat = self::getCategory($term);
            if ($cat === null) {
                continue;
            }
            $pri = array_search($cat, self::CAT_PRIORITY, true);
            $directRels[] = [$pri === false ? count(self::CAT_PRIORITY) : $pri, $term, $label, $vrid, $cat];
        }
        usort($directRels, static fn ($a, $b) => ($a[0] <=> $b[0])
            ?: ((int) $a[3] <=> (int) $b[3])
            ?: strcmp((string) $a[1], (string) $b[1]));

        // Omeka happily stores the same linked resource twice on one property. That
        // is one statement, and emitting it twice would double the node's degree —
        // which the front end now uses for hub sizing and the connection count.
        // Keyed by property as well, so the same resource under two DIFFERENT
        // properties stays two statements; only exact repeats collapse.
        $edgeSeen = [];

        $directCount = 0;
        foreach ($directRels as [$pri, $term, $label, $vrid, $cat]) {
            $nid = 'resource_' . $vrid;
            if (!isset($seen[$nid])) {
                if ($directCount >= self::MAX_DIRECT_NODES) {
                    continue;
                }
                $seen[$nid] = true;
                $node = [
                    'id' => $nid, 'name' => $items[$vrid]['title'] ?? ('Resource ' . $vrid),
                    'category' => $ensureCat($cat), 'symbolSize' => 22, 'itemId' => $vrid,
                ];
                if (isset($freqPct[$vrid])) {
                    $node['freqPct'] = $freqPct[$vrid];
                }
                $nodes[] = $node;
                $directCount++;
            }
            $ekey = $nid . "\0" . $term;
            if (!isset($edgeSeen[$ekey])) {
                $edgeSeen[$ekey] = true;
                $edges[] = ['source' => 'item_' . $itemId, 'target' => $nid, 'name' => $label];
            }
            if (self::isShareable($term)) {
                $centerLinked[$vrid] = $nid;
            }
        }

        // ── Reverse lookups: items linking TO this via isPartOf ─────────
        $isSection = ($item['class_term'] ?? '') === 'frapo:ResearchGroup';
        $reverseCount = 0;
        foreach ($reverseLinks[$itemId]['dcterms:isPartOf'] ?? [] as $rid) {
            if ($reverseCount >= self::MAX_REVERSE_NODES) {
                break;
            }
            if ($rid === $itemId) {
                continue;
            }
            $rnid = 'item_' . $rid;
            if (!isset($seen[$rnid])) {
                $seen[$rnid] = true;
                $nodes[] = [
                    'id' => $rnid, 'name' => $items[$rid]['title'] ?? ('Item ' . $rid),
                    'category' => $ensureCat($isSection ? 'Project' : 'Linked Item'),
                    'symbolSize' => 22, 'itemId' => $rid,
                ];
                $reverseCount++;
            }
            $ekey = $rnid . "\0dcterms:isPartOf";
            if (!isset($edgeSeen[$ekey])) {
                $edgeSeen[$ekey] = true;
                $edges[] = ['source' => $rnid, 'target' => 'item_' . $itemId, 'name' => 'Is Part Of'];
            }
        }

        // ── Low-connectivity fallback: items that reference this entity ─
        if ($directCount < 5) {
            $referencing = [];
            foreach ($reverseLinks[$itemId] ?? [] as $rids) {
                foreach ($rids as $rid) {
                    $referencing[$rid] = true;
                }
            }
            if ($referencing) {
                $refCat = $ensureCat('Research Item');
                $refCount = 0;
                foreach (array_keys($referencing) as $rid) {
                    if ($refCount >= self::MAX_REVERSE_ITEMS) {
                        break;
                    }
                    $rnid = 'item_' . $rid;
                    if (isset($seen[$rnid])) {
                        continue;
                    }
                    $seen[$rnid] = true;
                    $nodes[] = [
                        'id' => $rnid, 'name' => $items[$rid]['title'] ?? ('Item ' . $rid),
                        'category' => $refCat, 'symbolSize' => 16, 'itemId' => $rid,
                    ];
                    $edges[] = ['source' => $rnid, 'target' => 'item_' . $itemId, 'name' => 'references'];
                    $refCount++;
                }
            }
        }

        // ── Shared items — IDF-ranked co-occurrence discovery ──────────
        $sharedCandidates = []; // sid => list of edge dicts
        $strengths = [];        // sid => sum of shared IDF
        $discovered = [];
        foreach ($centerLinked as $vrid => $centerNid) {
            foreach (array_keys($reverse[$vrid] ?? []) as $sid) {
                if ($sid === $itemId || isset($discovered[$sid])) {
                    continue;
                }
                $discovered[$sid] = true;
                $snid = 'item_' . $sid;
                $matched = [];
                $matchedKeys = [];
                foreach ($links[$sid] ?? [] as [$st, $sl, $sv]) {
                    if (!isset($centerLinked[$sv])) {
                        continue;
                    }
                    $ek = $snid . '>' . $centerLinked[$sv];
                    if (isset($matchedKeys[$ek])) {
                        continue;
                    }
                    $matchedKeys[$ek] = true;
                    $matched[] = [
                        'source' => $snid, 'target' => $centerLinked[$sv], 'name' => $sl,
                        'isShared' => true, 'idf' => round($idf[$sv] ?? 0, 2), 'freqPct' => round($freqPct[$sv] ?? 0, 1),
                    ];
                }
                if ($matched) {
                    $sharedCandidates[$sid] = $matched;
                    $s = 0.0;
                    foreach ($matched as $m) {
                        $s += $m['idf'];
                    }
                    $strengths[$sid] = $s;
                }
            }
        }
        $strengthSnapshot = $strengths;
        uksort($strengths, static fn ($a, $b) => (($strengthSnapshot[$b] ?? 0) <=> ($strengthSnapshot[$a] ?? 0))
            ?: ((int) $a <=> (int) $b));
        $topSids = array_slice(array_keys($strengths), 0, self::MAX_SHARED_NODES);

        $siCat = null;
        $maxStrength = 0.0;
        foreach ($topSids as $sid) {
            $matched = $sharedCandidates[$sid];
            $snid = 'item_' . $sid;
            $strength = round($strengths[$sid], 2);
            if ($strength > $maxStrength) {
                $maxStrength = $strength;
            }
            if (!isset($seen[$snid])) {
                $seen[$snid] = true;
                if ($siCat === null) {
                    $siCat = $ensureCat('Shared Item');
                }
                $nodes[] = [
                    'id' => $snid, 'name' => $items[$sid]['title'] ?? ('Item ' . $sid),
                    'category' => $siCat, 'symbolSize' => 16, 'itemId' => $sid,
                    'strength' => $strength, 'sharedCount' => count($matched),
                ];
            }
            foreach ($matched as $m) {
                $edges[] = $m;
            }
        }

        if (count($nodes) <= 1) {
            return null;
        }

        // Close the triangles among everything gathered above.
        $edges = self::addCrossEdges($nodes, $edges, $links, $itemId);

        $maxFreq = 0.0;
        foreach ($edges as $e) {
            if (!empty($e['isShared']) && ($e['freqPct'] ?? 0) > $maxFreq) {
                $maxFreq = $e['freqPct'];
            }
        }

        [$nodes, $communityCount] = self::assignCommunities($nodes, $edges);

        return [
            'nodes' => $nodes,
            'edges' => $edges,
            'categories' => $categories,
            'stats' => [
                'maxStrength' => round($maxStrength, 2),
                'maxFreqPct' => round($maxFreq, 1),
                'communityCount' => $communityCount,
            ],
        ];
    }

    /**
     * Close the triangles: draw the statements that exist BETWEEN the nodes already
     * gathered, not only from the centre out to each of them.
     *
     * Everything above builds a star. The centre links to its subjects, its people,
     * its project; items link back to it — but the graph never showed that one of
     * those people is a member of that project, that a location is part of another,
     * or that a project's items carry the project's own subjects. Those statements
     * are all present in $links; this pass reads them back and draws them. It is
     * what turns the picture from a hub-and-spokes diagram into a network, and it is
     * also what gives the community detection real structure to find — label
     * propagation over a star can only ever return one cluster per spoke.
     *
     * Bounded twice over: MAX_CROSS_SCAN nodes are scanned (in node order, so the
     * centre's own highest-priority relationships come first) and at most
     * MAX_CROSS_EDGES edges are added. Edges already drawn are skipped in both
     * directions, so the shared-item pass is never duplicated.
     *
     * Cross edges carry `kind => 'cross'`; the front end draws them thinner and
     * fainter than the centre's own spokes, so the item's own statements still read
     * as the primary structure.
     *
     * @param array $nodes  the graph's nodes (each non-centre one carrying itemId)
     * @param array $edges  the edges built so far
     * @param array $links  DataLoader's itemId => [[term, label, valueResourceId], …]
     * @return array the edges, with the cross edges appended
     */
    public static function addCrossEdges(array $nodes, array $edges, array $links, int $centerItemId): array
    {
        // Resource/item id => node id, for every non-centre node in the graph.
        $nodeByRid = [];
        foreach ($nodes as $n) {
            if (!empty($n['isCenter']) || !isset($n['itemId'])) {
                continue;
            }
            $nodeByRid[(int) $n['itemId']] = (string) $n['id'];
        }
        if (count($nodeByRid) < 2) {
            return $edges;
        }

        // Seed the dedupe set with what is already drawn, both directions.
        $seen = [];
        foreach ($edges as $e) {
            $seen[$e['source'] . "\0" . $e['target']] = true;
            $seen[$e['target'] . "\0" . $e['source']] = true;
        }

        $added = 0;
        $scanned = 0;
        foreach ($nodeByRid as $rid => $nid) {
            if ($scanned >= self::MAX_CROSS_SCAN || $added >= self::MAX_CROSS_EDGES) {
                break;
            }
            $scanned++;
            foreach ($links[$rid] ?? [] as [$term, $label, $vrid]) {
                $vrid = (int) $vrid;
                if ($vrid === $centerItemId || $vrid === $rid) {
                    continue;   // the spoke to the centre is already drawn
                }
                if (!isset($nodeByRid[$vrid])) {
                    continue;   // the other end is not on this graph
                }
                $target = $nodeByRid[$vrid];
                $key = $nid . "\0" . $target;
                if (isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $seen[$target . "\0" . $nid] = true;
                $edges[] = [
                    'source' => $nid,
                    'target' => $target,
                    'name' => $label,
                    'kind' => 'cross',
                ];
                if (++$added >= self::MAX_CROSS_EDGES) {
                    break;
                }
            }
        }

        return $edges;
    }

    /**
     * Assign each non-centre node a community id via label propagation, so that
     * entities tied together by the items they share (e.g. a subject and a person
     * that co-occur in the same shared items) read as one coloured cluster.
     *
     * The centre is a universal hub — it links to every direct neighbour — so it
     * is excluded from the propagation graph; leaf nodes reachable only through
     * the centre therefore stay isolated and get community = -1 (no halo).
     * Communities are relabelled by size (largest = 0) and singletons dropped, so
     * the colour indices are stable and only meaningful clusters are highlighted.
     *
     * Deterministic (sorted-id processing order + lowest-label tie-break +
     * in-place/asynchronous updates), so the precompute output is reproducible.
     *
     * @return array{0:array,1:int} [nodes each carrying 'community', community count]
     */
    public static function assignCommunities(array $nodes, array $edges): array
    {
        // Centre id(s) — excluded from the propagation graph.
        $centerIds = [];
        foreach ($nodes as $n) {
            if (!empty($n['isCenter'])) {
                $centerIds[$n['id']] = true;
            }
        }

        // Undirected adjacency over non-centre nodes only.
        $adj = [];
        foreach ($edges as $e) {
            $a = $e['source'];
            $b = $e['target'];
            if ($a === $b || isset($centerIds[$a]) || isset($centerIds[$b])) {
                continue;
            }
            $adj[$a][$b] = true;
            $adj[$b][$a] = true;
        }

        // Non-centre node ids, sorted for deterministic propagation.
        $ids = [];
        foreach ($nodes as $n) {
            if (!isset($centerIds[$n['id']])) {
                $ids[] = (string) $n['id'];
            }
        }
        sort($ids);

        // Each node starts in its own community.
        $label = [];
        foreach ($ids as $id) {
            $label[$id] = $id;
        }

        // Asynchronous label propagation: each node adopts the most frequent label
        // among its neighbours (lowest label breaks ties). Converges quickly on
        // these small ego graphs; capped to stay bounded.
        for ($iter = 0; $iter < 20; $iter++) {
            $changed = false;
            foreach ($ids as $id) {
                $nbrs = $adj[$id] ?? [];
                if (!$nbrs) {
                    continue;
                }
                $counts = [];
                foreach (array_keys($nbrs) as $nb) {
                    $l = $label[$nb];
                    $counts[$l] = ($counts[$l] ?? 0) + 1;
                }
                $best = null;
                $bestCount = -1;
                foreach ($counts as $l => $c) {
                    if ($c > $bestCount || ($c === $bestCount && strcmp((string) $l, (string) $best) < 0)) {
                        $best = (string) $l;
                        $bestCount = $c;
                    }
                }
                if ($best !== null && $best !== $label[$id]) {
                    $label[$id] = $best;
                    $changed = true;
                }
            }
            if (!$changed) {
                break;
            }
        }

        // Group connected nodes by final label; keep only multi-node communities.
        $groups = [];
        foreach ($ids as $id) {
            if (isset($adj[$id])) {
                $groups[$label[$id]][] = $id;
            }
        }
        $multi = [];
        foreach ($groups as $members) {
            if (count($members) >= 2) {
                $multi[] = $members;
            }
        }
        usort($multi, static function (array $a, array $b): int {
            sort($a, SORT_STRING);
            sort($b, SORT_STRING);
            return (count($b) <=> count($a)) ?: strcmp((string) ($a[0] ?? ''), (string) ($b[0] ?? ''));
        }); // largest first

        $communityOf = [];
        foreach ($multi as $cidx => $members) {
            foreach ($members as $id) {
                $communityOf[$id] = $cidx;
            }
        }

        foreach ($nodes as &$n) {
            $n['community'] = $communityOf[(string) $n['id']] ?? -1;
        }
        unset($n);

        return [$nodes, count($multi)];
    }
}
