<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/Precompute/KnowledgeGraphs.php';

use DreVisualizations\Precompute\KnowledgeGraphs;

$failures = 0;
function graphCheck(bool $condition, string $message): void
{
    global $failures;
    if ($condition) {
        echo "ok: $message\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $message\n");
}

/** Find an edge between two node ids, in either direction. */
function findEdge(array $edges, string $a, string $b): ?array
{
    foreach ($edges as $e) {
        if (($e['source'] === $a && $e['target'] === $b)
            || ($e['source'] === $b && $e['target'] === $a)) {
            return $e;
        }
    }
    return null;
}

/* ------------------------------------------------------------------ */
/*  computeResourceStats                                               */
/* ------------------------------------------------------------------ */

// Three items; resource 100 appears in all three, resource 300 in one.
[$idf, $freqPct] = KnowledgeGraphs::computeResourceStats([
    1 => [['dcterms:subject', 'Subject', 100], ['dcterms:subject', 'Subject', 200]],
    2 => [['dcterms:subject', 'Subject', 100], ['dcterms:subject', 'Subject', 100]],
    3 => [['dcterms:subject', 'Subject', 100], ['dcterms:subject', 'Subject', 300]],
], 3);

graphCheck(($freqPct[100] ?? null) === 100.0,
    'a resource on every item is 100% common — and counting it twice on one item still counts once');
graphCheck(($idf[100] ?? null) === 0.0, 'a universal resource carries no distinctiveness');
graphCheck(($freqPct[300] ?? null) === 33.3, 'a resource on one of three items is 33.3% common');
graphCheck(($idf[300] ?? null) === round(log(3), 2),
    'a resource on one item carries the full ln(N/df) weight');
graphCheck(($idf[300] ?? null) > ($idf[100] ?? null),
    'a rare resource outranks a universal one');

/* ------------------------------------------------------------------ */
/*  addCrossEdges — the pass that turns the star into a network         */
/* ------------------------------------------------------------------ */

// Centre item 1 links to person 10, project 20 and subject 30. Person 10 is a
// member of project 20, and project 20 carries subject 30 — statements the star
// never showed.
$nodes = [
    ['id' => 'item_1', 'itemId' => 1, 'isCenter' => true],
    ['id' => 'resource_10', 'itemId' => 10],
    ['id' => 'resource_20', 'itemId' => 20],
    ['id' => 'resource_30', 'itemId' => 30],
];
$starEdges = [
    ['source' => 'item_1', 'target' => 'resource_10', 'name' => 'Creator'],
    ['source' => 'item_1', 'target' => 'resource_20', 'name' => 'Is Part Of'],
    ['source' => 'item_1', 'target' => 'resource_30', 'name' => 'Subject'],
];
$links = [
    1 => [['dcterms:creator', 'Creator', 10], ['dcterms:isPartOf', 'Is Part Of', 20], ['dcterms:subject', 'Subject', 30]],
    10 => [['foaf:member', 'Member Of', 20], ['dcterms:subject', 'Subject', 999]],
    20 => [['dcterms:subject', 'Subject', 30], ['dcterms:isPartOf', 'Is Part Of', 1]],
];

$edges = KnowledgeGraphs::addCrossEdges($nodes, $starEdges, $links, 1);

graphCheck(count($edges) === 5, 'two cross edges are added to the three spokes');
$personProject = findEdge($edges, 'resource_10', 'resource_20');
graphCheck($personProject !== null && ($personProject['kind'] ?? null) === 'cross',
    'the person-to-project statement is drawn and tagged as a cross edge');
graphCheck($personProject !== null && $personProject['name'] === 'Member Of',
    'a cross edge carries the property label from the data');
graphCheck(findEdge($edges, 'resource_20', 'resource_30') !== null,
    'the project-to-subject statement is drawn');
graphCheck(findEdge($edges, 'resource_10', 'resource_30') === null,
    'no edge is invented between neighbours the data does not connect');

// A link out to a resource that is not on this graph must be ignored (999), and
// the spoke back to the centre must not be duplicated (20 -> 1).
$centreDupes = 0;
foreach ($edges as $e) {
    if ($e['source'] === 'item_1' || $e['target'] === 'item_1') {
        $centreDupes++;
    }
}
graphCheck($centreDupes === 3, 'a neighbour linking back to the centre adds no second spoke');

// Idempotence: running the pass again must add nothing, since every statement is
// already drawn in one direction or the other.
graphCheck(count(KnowledgeGraphs::addCrossEdges($nodes, $edges, $links, 1)) === count($edges),
    'the cross pass is idempotent');

// A graph with a single neighbour has no triangles to close.
graphCheck(KnowledgeGraphs::addCrossEdges(
    [['id' => 'item_1', 'itemId' => 1, 'isCenter' => true], ['id' => 'resource_10', 'itemId' => 10]],
    [['source' => 'item_1', 'target' => 'resource_10', 'name' => 'Creator']],
    $links,
    1
) === [['source' => 'item_1', 'target' => 'resource_10', 'name' => 'Creator']],
    'a graph with one neighbour is returned unchanged');

/* ------------------------------------------------------------------ */
/*  buildGraph — the whole pass, end to end                            */
/* ------------------------------------------------------------------ */

$items = [
    1 => ['title' => 'A photograph', 'class_label' => 'Still Image', 'class_term' => 'bibo:Image'],
    10 => ['title' => 'Islam'],
    11 => ['title' => 'A photographer'],
];
// The centre states the same subject twice (Omeka allows it) and names one person
// twice under two different roles. Node 10 also links to node 11.
$graph = KnowledgeGraphs::buildGraph(
    1,
    $items,
    [
        1 => [
            ['dcterms:subject', 'Subject', 10],
            ['dcterms:subject', 'Subject', 10],
            ['dcterms:creator', 'Creator', 11],
            ['marcrel:pht', 'Photographer', 11],
        ],
        10 => [['dcterms:subject', 'Related Subject', 11]],
    ],
    [],   // reverseLinks
    [],   // shareable reverse index
    [],   // idf
    []    // freqPct
);

graphCheck($graph !== null, 'a graph is built for an item with relationships');
graphCheck(count($graph['nodes']) === 3, 'a resource named twice becomes one node');
graphCheck($graph['nodes'][0]['isCenter'] === true && $graph['nodes'][0]['name'] === 'A photograph',
    'the centre is the item itself');
graphCheck(($graph['categories'][0]['name'] ?? null) === 'Still Image',
    'the centre category comes from the resource class label');

$spokes = 0;
foreach ($graph['edges'] as $e) {
    if ($e['source'] === 'item_1' || $e['target'] === 'item_1') {
        $spokes++;
    }
}
graphCheck($spokes === 3,
    'a subject repeated on one property is one spoke, but one person under two roles is two');

$crossEdge = findEdge($graph['edges'], 'resource_10', 'resource_11');
graphCheck($crossEdge !== null && ($crossEdge['kind'] ?? null) === 'cross',
    'buildGraph runs the cross pass, so a statement between two neighbours is drawn');

graphCheck(KnowledgeGraphs::buildGraph(1, $items, [1 => []], [], [], [], []) === null,
    'an item with no relationships yields no graph');
graphCheck(KnowledgeGraphs::buildGraph(999, $items, [], [], [], [], []) === null,
    'an unknown item yields no graph');

// A node carries ONE category, decided by the highest-priority property that
// introduced it: the person above is named as both Creator and Photographer, and
// Person outranks Contributor in CAT_PRIORITY, so no Contributor category is
// created at all. The second role still gets its own edge (checked above).
$cats = array_column($graph['categories'], 'name');
graphCheck(in_array('Person', $cats, true) && !in_array('Contributor', $cats, true),
    'the highest-priority role decides a node category, and unused categories are not created');
$person = null;
foreach ($graph['nodes'] as $n) {
    if (($n['itemId'] ?? null) === 11) {
        $person = $n;
    }
}
graphCheck($person !== null && ($cats[$person['category']] ?? null) === 'Person',
    'the person is filed under Person, not Contributor');
graphCheck($graph['nodes'][0]['symbolSize'] === 45, 'the centre is the largest node');
graphCheck(count($graph['edges']) === 4, 'three spokes plus one cross edge');

/* ------------------------------------------------------------------ */
/*  assignCommunities                                                  */
/* ------------------------------------------------------------------ */

// Two disjoint triangles among the neighbours, plus a leaf reachable only via the
// centre. The triangles must become two communities; the leaf must stay unhaloed.
$commNodes = [
    ['id' => 'item_1', 'isCenter' => true],
    ['id' => 'a1'], ['id' => 'a2'], ['id' => 'a3'],
    ['id' => 'b1'], ['id' => 'b2'], ['id' => 'b3'],
    ['id' => 'leaf'],
];
$commEdges = [
    ['source' => 'item_1', 'target' => 'leaf'],
    ['source' => 'a1', 'target' => 'a2'], ['source' => 'a2', 'target' => 'a3'], ['source' => 'a3', 'target' => 'a1'],
    ['source' => 'b1', 'target' => 'b2'], ['source' => 'b2', 'target' => 'b3'], ['source' => 'b3', 'target' => 'b1'],
];
[$withComms, $count] = KnowledgeGraphs::assignCommunities($commNodes, $commEdges);
$commOf = [];
foreach ($withComms as $n) {
    $commOf[$n['id']] = $n['community'];
}

graphCheck($count === 2, 'two disjoint triangles are found as two communities');
graphCheck($commOf['a1'] === $commOf['a2'] && $commOf['a2'] === $commOf['a3'],
    'a triangle shares one community id');
graphCheck($commOf['a1'] !== $commOf['b1'], 'the two triangles get different community ids');
graphCheck($commOf['item_1'] === -1, 'the centre is excluded from the communities');
graphCheck($commOf['leaf'] === -1, 'a node reachable only through the centre gets no community');

// Determinism: the same input must produce the same labels on a second run.
[$again] = KnowledgeGraphs::assignCommunities($commNodes, $commEdges);
$againOf = [];
foreach ($again as $n) {
    $againOf[$n['id']] = $n['community'];
}
graphCheck($againOf === $commOf, 'community assignment is reproducible');

/* ------------------------------------------------------------------ */
/*  buildItemMap                                                       */
/* ------------------------------------------------------------------ */

$geo = [
    50 => ['name' => 'Ouagadougou', 'lat' => 12.5, 'lon' => -1.5, 'itemId' => 50],
    60 => ['name' => 'Bayreuth', 'lat' => 49.9, 'lon' => 11.6, 'itemId' => 60],
    70 => ['name' => 'Not a place', 'lat' => 0.0, 'lon' => 0.0, 'itemId' => 70],
];
$map = KnowledgeGraphs::buildItemMap(1, [
    1 => [
        ['dcterms:spatial', 'Origin', 50],
        ['dcterms:provenance', 'Held at', 60],
        ['dcterms:spatial', 'Origin', 50],   // duplicate
        ['dcterms:subject', 'Subject', 70],  // not a place property
        ['dcterms:spatial', 'Origin', 80],   // no coordinates on record
    ],
], $geo);

graphCheck($map !== null && count($map['origins']) === 1, 'a repeated origin is listed once');
graphCheck($map !== null && $map['origins'][0]['name'] === 'Ouagadougou', 'the origin carries its name');
graphCheck($map !== null && count($map['current']) === 1, 'provenance becomes the current location');
graphCheck($map !== null && $map['current'][0]['itemId'] === 60, 'the current location links to its own item');
graphCheck($map !== null
    && !in_array(70, array_column($map['origins'], 'itemId'), true)
    && !in_array(70, array_column($map['current'], 'itemId'), true),
    'a non-place property is not mapped even when the target has coordinates');
graphCheck(KnowledgeGraphs::buildItemMap(2, [2 => [['dcterms:subject', 'Subject', 70]]], $geo) === null,
    'an item with no located places yields no map');

echo $failures ? "\n$failures FAILURE(S)\n" : "\nALL KNOWLEDGE GRAPH TESTS PASS\n";
exit($failures ? 1 : 0);
