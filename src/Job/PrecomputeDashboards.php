<?php
declare(strict_types=1);

namespace DreVisualizations\Job;

use DreVisualizations\Module;
use Omeka\Job\AbstractJob;
use DreVisualizations\Precompute\Runner;
use DreVisualizations\Precompute\SnapshotPublisher;
use DreVisualizations\Precompute\AmiraProfile;
use Throwable;
use DreVisualizations\Precompute\SnapshotStore;
use DreVisualizations\Precompute\GenerationCancelled;
use DreVisualizations\Precompute\PublicationBusy;
use DreVisualizations\Precompute\SourceChanged;

/**
 * Background job: regenerate all precomputed dashboard data.
 *
 * Dispatched from the admin "Regenerate" button (MaintenanceController), and
 * with trigger=edit after Omeka writes (Service\AutomaticRefresh). Runs the
 * pure-PHP {@see Runner} against Omeka's own DBAL connection — no Python, no
 * separate MySQL credentials — and writes the JSON artefacts the front-end
 * charts load. Long-running on a large corpus; progress is visible at
 * /admin/job/{id}/log. Throwing marks the job ERROR.
 */
class PrecomputeDashboards extends AbstractJob
{
    public const TRIGGER_EDIT = 'edit';
    // The maintenance page and docs/ADMINISTRATION.md state both delays in words.
    /** Edits must have been quiet this long before an automatic refresh starts. */
    public const QUIET_SECONDS = 300;
    /** The shorter wait when a privatising write left nothing published. */
    public const QUIET_SECONDS_WITHDRAWN = 60;
    /** How often a manual run retries when an edit lands mid-read. */
    private const MANUAL_ATTEMPTS = 3;

    public function perform(): void
    {
        $services = $this->getServiceLocator();
        $siteId = (int) $services->get('Omeka\Settings')->get(Module::SETTING_SITE_ID, 0);
        if ($siteId < 1) {
            throw new \RuntimeException(
                'No canonical public site is configured. Configure DRE Visualizations before regenerating public data.'
            );
        }
        $logger = $services->get('Omeka\Logger');
        $store = new SnapshotStore(SnapshotStore::defaultDirectory());
        try {
            if ($this->getArg('trigger') === self::TRIGGER_EDIT) {
                $this->refreshAfterEdits($store, $siteId);
            } else {
                $this->regenerateNow($store, $siteId);
            }
        } catch (GenerationCancelled $e) {
            $logger->info($e->getMessage());
        } catch (Throwable $e) {
            $logger->err('DreVisualizations: precompute failed: ' . $e->getMessage());
            // Re-throw so AbstractJob marks the job ERROR.
            throw $e;
        }
    }

    /**
     * Regenerate Now: publish at once, retrying when an edit lands mid-run,
     * but never over a manual withdrawal made since the job started.
     */
    private function regenerateNow(SnapshotStore $store, int $siteId): void
    {
        $revision = $store->reading(fn (): ?string => $store->readRevision());
        for ($attempt = 1; ; $attempt++) {
            try {
                $this->publishOnce($siteId);
                return;
            } catch (SourceChanged $e) {
                $withdrawn = $store->reading(fn (): bool => $store->readRevision() !== $revision && $store->withdrawnByHand());
                if ($withdrawn || $attempt >= self::MANUAL_ATTEMPTS) throw $e;
                $this->getServiceLocator()->get('Omeka\Logger')->info($e->getMessage() . ' Retrying.');
            }
        }
    }

    /**
     * The automatic refresh: wait until edits go quiet, publish, and repeat
     * while edits landed meanwhile. One refresher runs at a time; it holds the
     * refresh lock throughout, so writes that find it taken queue no job of
     * their own. The old snapshot stays served until a new one replaces it.
     */
    private function refreshAfterEdits(SnapshotStore $store, int $siteId): void
    {
        $logger = $this->getServiceLocator()->get('Omeka\Logger');
        while (true) {
            $lock = $store->claimRefresh(2.0);
            if ($lock === null) {
                $logger->info('DreVisualizations: another automatic refresh is already running.');
                return;
            }
            try {
                while ($this->waitForQuiet($store)) {
                    try {
                        $this->publishOnce($siteId);
                    } catch (SourceChanged | PublicationBusy $e) {
                        $logger->info('DreVisualizations: ' . $e->getMessage() . ' The automatic refresh retries shortly.');
                        $this->pause(30);
                    }
                }
            } finally {
                $store->releaseRefresh($lock);
            }
            // A write between the last check and the release saw the lock taken
            // and queued no job: catch up with it here (or leave it to the
            // refresher that has since claimed the lock).
            if (!$this->refreshNeeded($store)) return;
        }
    }

    /**
     * Sleep until the latest edit is old enough. False when there is nothing
     * to do: the snapshot is current, or a manual withdrawal waits for
     * Regenerate now.
     */
    private function waitForQuiet(SnapshotStore $store): bool
    {
        while (true) {
            [$needed, $published, $changedAt] = $store->reading(fn (): array => [
                $store->refreshAllowed() && !$store->isFresh(), $store->manifest() !== null, $store->changes()['changedAt'],
            ]);
            if (!$needed) return false;
            $remaining = $changedAt + ($published ? self::QUIET_SECONDS : self::QUIET_SECONDS_WITHDRAWN) - time();
            if ($remaining <= 0) return true;
            $this->pause(min($remaining, 5));
        }
    }

    private function refreshNeeded(SnapshotStore $store): bool
    {
        return $store->reading(fn (): bool => $store->refreshAllowed() && !$store->isFresh());
    }

    private function pause(int $seconds): void
    {
        if ($this->shouldStop()) throw new GenerationCancelled('Automatic refresh stopped.');
        sleep(max(1, $seconds));
    }

    private function publishOnce(int $siteId): void
    {
        $services = $this->getServiceLocator();
        $logger = $services->get('Omeka\Logger');
        $connection = $services->get('Omeka\Connection');

        // src/Job/PrecomputeDashboards.php → module root is two levels up.
        $moduleRoot = dirname(__DIR__, 2);
        $dataDir = SnapshotStore::defaultDirectory();
        $lastCheck = 0.0;
        $checkpoint = function (bool $force = false) use (&$lastCheck, $siteId, $services): void {
            if (!$force && microtime(true) - $lastCheck < 0.5) return;
            $lastCheck = microtime(true);
            if ($this->shouldStop()) throw new GenerationCancelled('Generation stopped before publication.');
            // Read directly: Settings caches values within a long-running worker.
            $currentSite = (int) $services->get('Omeka\\Connection')->executeQuery(
                'SELECT value FROM setting WHERE id = ?', [Module::SETTING_SITE_ID]
            )->fetchOne();
            $valid = $services->get('Omeka\\Connection')->executeQuery(
                'SELECT 1 FROM site WHERE id = ? AND is_public = 1', [$siteId]
            )->fetchOne();
            if ($currentSite !== $siteId || !$valid) {
                throw new \RuntimeException('The canonical public site changed during generation.');
            }
        };

        $logger->info('DreVisualizations: starting dashboard precompute', [
            'job_id' => $this->job->getId(),
        ]);

        $moduleConfig = parse_ini_file($moduleRoot . '/config/module.ini');
        $moduleVersion = is_array($moduleConfig) ? (string) ($moduleConfig['version'] ?? '') : '';
        $profile = AmiraProfile::fromFile($moduleRoot . '/config/amira-profile.json');
        $countsService = 'DRESearch\Search\CorpusCounts';
        $corpusStats = $services->has($countsService)
            ? $services->get($countsService)->forSite($siteId)
            : null;
        $started = time();
        // The revision is filled in by the publisher once it holds the generation lock.
        $sourceScope = ['siteId' => $siteId, 'profile' => hash('sha256', str_replace("\r\n", "\n", (string) file_get_contents($moduleRoot . '/config/amira-profile.json'))),
            'revision' => ''];
        $publisher = new SnapshotPublisher($dataDir, $siteId, $moduleVersion);
        $manifest = $publisher->publish(static function (string $generationDir, string $revision, callable $loaded) use (
            $connection,
            $siteId,
            $dataDir,
            $logger,
            $profile,
            $corpusStats,
            $moduleRoot,
            $checkpoint,
            $sourceScope
        ): array {
            $sourceScope['revision'] = $revision;
            $runner = new Runner(
                $connection,
                $siteId,
                $profile,
                $generationDir . '/item-dashboards',
                $generationDir . '/communities',
                $moduleRoot . '/asset/data/geo/countries.geojson',
                $generationDir . '/knowledge-graphs',
                $generationDir . '/photo-galleries',
                $generationDir . '/featured-collections',
                $generationDir . '/item-set-dashboards',
                $moduleRoot . '/data/wordclouds',
                static fn (string $message) => $logger->info($message),
                $corpusStats,
                $checkpoint,
                $sourceScope,
                $dataDir . '/layout-cache',
                \Closure::fromCallable($loaded)
            );
            return $runner->run();
        }, static fn () => $checkpoint(true));
        self::pruneLayoutCache($dataDir . '/layout-cache', $started);

        $logger->info('DreVisualizations: precompute complete', [
            'generation_id' => $manifest['generationId'],
            'artifacts' => $manifest['artifactCounts']['total'],
            'source_counts' => $manifest['sourceCounts'],
        ]);
    }

    /**
     * Drop layout-cache entries this run neither wrote nor read (a hit touches
     * its file). Without it every changed graph leaves an orphan behind forever.
     */
    public static function pruneLayoutCache(string $dir, int $since): void
    {
        if (!is_dir($dir)) return;
        foreach (new \FilesystemIterator($dir, \FilesystemIterator::SKIP_DOTS) as $entry) {
            if ($entry->isFile() && !$entry->isLink() && str_ends_with($entry->getFilename(), '.json')
                && $entry->getMTime() < $since) {
                @unlink($entry->getPathname());
            }
        }
    }
}
