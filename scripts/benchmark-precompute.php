<?php
declare(strict_types=1);
require dirname(__DIR__) . '/tests/bootstrap.php';
use DreVisualizations\Precompute\{ForceLayout, KnowledgeGraphs};

foreach ([400, 800, 1600] as $n) {
    $items = $links = $reverse = [];
    $items[$n + 1] = ['title' => 'Common subject'];
    for ($id = 1; $id <= $n; $id++) {
        $items[$id] = ['title' => 'Item ' . $id];
        $links[$id] = [['dcterms:subject', 'Subject', $n + 1]];
        $reverse[$n + 1]['dcterms:subject'][] = $id;
    }
    [$idf, $pct] = KnowledgeGraphs::computeResourceStats($links, count($items));
    $posting = KnowledgeGraphs::buildShareableReverse($reverse);
    $adjacency = KnowledgeGraphs::shareableAdjacency($links);
    $start = hrtime(true);
    for ($id = 1; $id <= $n; $id++) KnowledgeGraphs::buildGraph($id, $items, $links, $reverse, $posting, $idf, $pct, $adjacency);
    printf("%d common-subject graphs: %.3f s\n", $n, (hrtime(true) - $start) / 1e9);
}
$edges = [];
for ($id = 1; $id < 4000; $id++) $edges[] = [$id - 1, $id, 1];
$start = hrtime(true);
ForceLayout::layout(4000, $edges);
printf("4000-node layout, 260 iterations: %.3f s, peak %.1f MiB\n", (hrtime(true) - $start) / 1e9, memory_get_peak_usage(true) / 1048576);
