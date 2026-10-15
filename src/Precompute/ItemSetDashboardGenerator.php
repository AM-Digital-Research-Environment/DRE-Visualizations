<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

/**
 * Generates resource-page dashboards for every scoped item set, except a
 * research project's own collections: their item-set pages redirect to the
 * project item, whose Visualisations block shows the project dashboard.
 */
final class ItemSetDashboardGenerator
{
    /** @var callable|null */
    private $logFn;

    /**
     * @param array<int,true> $projectSetIds Item sets that belong to a project
     *        (ProjectCollections::setIds()); no dashboard is written for them.
     */
    public function __construct(
        private readonly JsonArtifactWriter $artifacts,
        private readonly string $outputDir,
        ?callable $logFn = null,
        private readonly array $projectSetIds = [],
    ) {
        $this->logFn = $logFn;
    }

    public function generate(CorpusSnapshot $corpus): int
    {
        $this->log('=== Item Set Dashboards ===');
        $this->artifacts->ensureDirectory($this->outputDir);
        $generated = $skipped = 0;
        foreach ($corpus->itemSets as $setId => $itemIds) {
            if (isset($this->projectSetIds[(int) $setId])) {
                $skipped++;
                continue;
            }
            $this->log('  item set ' . $setId);
            $itemIds = array_values(array_unique(array_map('intval', $itemIds)));
            sort($itemIds, SORT_NUMERIC);
            if (!$itemIds) continue;
            $dashboard = (new Aggregators())->aggregateItems(
                $itemIds,
                $corpus->items,
                $corpus->links,
                $corpus->itemYear,
                $corpus->geo
            );
            if (empty($dashboard['totalItems'])) continue;
            $dashboard['resourceType'] = 'researchItem';
            $this->artifacts->write($this->outputDir . '/' . (int) $setId . '.json', $dashboard);
            $generated++;
        }
        $this->log('  ' . $generated . ' item-set dashboards written; ' . $skipped . ' project collections left to their project');
        return $generated;
    }

    private function log(string $message): void
    {
        if ($this->logFn !== null) ($this->logFn)($message);
    }
}
