<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

/** Generates resource-page dashboards for every scoped item set. */
final class ItemSetDashboardGenerator
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
        $this->log('=== Item Set Dashboards ===');
        $this->artifacts->ensureDirectory($this->outputDir);
        $generated = 0;
        foreach ($corpus->itemSets as $setId => $itemIds) {
            $itemIds = array_values(array_unique(array_map('intval', $itemIds)));
            sort($itemIds, SORT_NUMERIC);
            if (!$itemIds) continue;
            $dashboard = Aggregators::aggregateItems(
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
        $this->log('  ' . $generated . ' item-set dashboards written');
        return $generated;
    }

    private function log(string $message): void
    {
        if ($this->logFn !== null) ($this->logFn)($message);
    }
}
