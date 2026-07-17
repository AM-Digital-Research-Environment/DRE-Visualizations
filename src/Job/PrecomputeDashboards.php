<?php
declare(strict_types=1);

namespace DreVisualizations\Job;

use DreVisualizations\Module;
use Omeka\Job\AbstractJob;
use DreVisualizations\Precompute\Runner;
use DreVisualizations\Precompute\SnapshotPublisher;
use DreVisualizations\Precompute\AmiraProfile;
use Throwable;

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
        $dataDir = $moduleRoot . '/asset/data';

        $logger->info('DreVisualizations: starting dashboard precompute', [
            'job_id' => $this->job->getId(),
        ]);

        try {
            $moduleConfig = parse_ini_file($moduleRoot . '/config/module.ini');
            $moduleVersion = is_array($moduleConfig) ? (string) ($moduleConfig['version'] ?? '') : '';
            $profile = AmiraProfile::fromFile($moduleRoot . '/config/amira-profile.json');
            $publisher = new SnapshotPublisher($dataDir, $siteId, $moduleVersion);
            $manifest = $publisher->publish(static function (string $generationDir) use (
                $connection,
                $siteId,
                $dataDir,
                $logger,
                $profile
            ): array {
                $runner = new Runner(
                    $connection,
                    $siteId,
                    $profile,
                    $generationDir . '/item-dashboards',
                    $generationDir . '/communities',
                    $dataDir . '/geo/countries.geojson',
                    $generationDir . '/knowledge-graphs',
                    $generationDir . '/photo-galleries',
                    $generationDir . '/featured-collections',
                    $generationDir . '/item-set-dashboards',
                    $dataDir . '/wordclouds',
                    static fn (string $message) => $logger->info($message)
                );
                return $runner->run();
            });
            $stats = [
                'generation_id' => $manifest['generationId'],
                'artifacts' => $manifest['artifactCounts']['total'],
                'source_counts' => $manifest['sourceCounts'],
            ];
        } catch (Throwable $e) {
            $logger->err('DreVisualizations: precompute failed: ' . $e->getMessage());
            // Re-throw so AbstractJob marks the job as ERROR.
            throw $e;
        }

        $logger->info('DreVisualizations: precompute complete', $stats);
    }
}
