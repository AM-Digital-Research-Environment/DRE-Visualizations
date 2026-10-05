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

/**
 * Background job: regenerate all precomputed dashboard data.
 *
 * Dispatched from the admin "Regenerate" button (MaintenanceController). Runs
 * the pure-PHP {@see Runner} against Omeka's own DBAL connection — no Python,
 * no separate MySQL credentials — and writes the JSON artefacts the front-end
 * charts load. Long-running on a large corpus; progress is visible at
 * /admin/job/{id}/log. Throwing marks the job ERROR.
 */
class PrecomputeDashboards extends AbstractJob
{
    public function perform(): void
    {
        $services = $this->getServiceLocator();
        $logger = $services->get('Omeka\Logger');
        $connection = $services->get('Omeka\Connection');
        $siteId = (int) $services->get('Omeka\Settings')->get(Module::SETTING_SITE_ID, 0);
        if ($siteId < 1) {
            throw new \RuntimeException(
                'No canonical public site is configured. Configure DRE Visualizations before regenerating public data.'
            );
        }

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

        try {
            $moduleConfig = parse_ini_file($moduleRoot . '/config/module.ini');
            $moduleVersion = is_array($moduleConfig) ? (string) ($moduleConfig['version'] ?? '') : '';
            $profile = AmiraProfile::fromFile($moduleRoot . '/config/amira-profile.json');
            $countsService = 'DRESearch\Search\CorpusCounts';
            $corpusStats = $services->has($countsService)
                ? $services->get($countsService)->forSite($siteId)
                : null;
            $store = new SnapshotStore($dataDir);
            $sourceScope = ['siteId' => $siteId, 'profile' => hash('sha256', str_replace("\r\n", "\n", (string) file_get_contents($moduleRoot . '/config/amira-profile.json'))),
                'revision' => $store->locked(fn () => $store->revision())];
            $publisher = new SnapshotPublisher($dataDir, $siteId, $moduleVersion);
            $manifest = $publisher->publish(static function (string $generationDir, string $revision) use (
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
                    $sourceScope
                );
                return $runner->run();
            }, static fn () => $checkpoint(true));
            $stats = [
                'generation_id' => $manifest['generationId'],
                'artifacts' => $manifest['artifactCounts']['total'],
                'source_counts' => $manifest['sourceCounts'],
            ];
        } catch (GenerationCancelled $e) {
            $logger->info($e->getMessage());
            return;
        } catch (Throwable $e) {
            $logger->err('DreVisualizations: precompute failed: ' . $e->getMessage());
            // Re-throw so AbstractJob marks the job as ERROR.
            throw $e;
        }

        $logger->info('DreVisualizations: precompute complete', $stats);
    }
}
