<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

/** Generates all per-item knowledge-graph artifacts from one scoped snapshot. */
final class KnowledgeGraphGenerator
{
    /** @var callable|null */
    private $logFn;

    public function __construct(
        private readonly JsonArtifactWriter $artifacts,
        private readonly string $outputDir,
        ?callable $logFn = null,
    ) {
        $this->logFn = $logFn;
    }

    public function generate(CorpusSnapshot $corpus): int
    {
        $this->log('=== Knowledge Graphs ===');
        $this->artifacts->ensureDirectory($this->outputDir);
        [$idf, $freqPct] = KnowledgeGraphs::computeResourceStats($corpus->links, count($corpus->items));
        $reverse = KnowledgeGraphs::buildShareableReverse($corpus->reverseLinks);
        $this->log('  ' . count($idf) . ' resources scored');

        $generated = 0;
        $skipped = 0;
        $mapCount = 0;
        foreach ($corpus->items as $itemId => $_item) {
            $graph = KnowledgeGraphs::buildGraph(
                (int) $itemId,
                $corpus->items,
                $corpus->links,
                $corpus->reverseLinks,
                $reverse,
                $idf,
                $freqPct
            );
            if ($graph === null) {
                $skipped++;
                continue;
            }
            $itemMap = KnowledgeGraphs::buildItemMap((int) $itemId, $corpus->links, $corpus->geo);
            if ($itemMap !== null) {
                $graph['itemMap'] = $itemMap;
                $mapCount++;
            }
            $this->artifacts->write($this->outputDir . '/' . (int) $itemId . '.json', $graph);
            $generated++;
            if ($generated % 500 === 0) $this->log('  ' . $generated . ' graphs…');
        }
        $this->log('  ' . $generated . ' graphs (' . $mapCount . ' with location maps), ' . $skipped . ' skipped');
        return $generated;
    }

    private function log(string $message): void
    {
        if ($this->logFn !== null) ($this->logFn)($message);
    }
}
