<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

use DreVisualizations\Precompute\Aggregators\SupportTrait;
use DreVisualizations\Precompute\Aggregators\BasicChartsTrait;
use DreVisualizations\Precompute\Aggregators\TemporalChartsTrait;
use DreVisualizations\Precompute\Aggregators\NetworkChartsTrait;
use DreVisualizations\Precompute\Aggregators\GeoChartsTrait;
use DreVisualizations\Precompute\Aggregators\SpatialTrait;
use DreVisualizations\Precompute\Aggregators\HierarchyChartsTrait;
use DreVisualizations\Precompute\Aggregators\EntityGraphTrait;
use DreVisualizations\Precompute\Aggregators\PublicationChartsTrait;
use DreVisualizations\Precompute\Aggregators\OverviewChartsTrait;
use DreVisualizations\Precompute\Aggregators\MediaChartsTrait;

// The builders are split into focused traits under Aggregators/. They are
// required explicitly (not just autoloaded) so this class works both under
// Omeka's PSR-4 autoloader and from the dependency-free test harness
// (tests/AggregatorsTest.php), which requires this file directly.
require_once __DIR__ . '/Aggregators/SupportTrait.php';
require_once __DIR__ . '/Aggregators/BasicChartsTrait.php';
require_once __DIR__ . '/Aggregators/TemporalChartsTrait.php';
require_once __DIR__ . '/Aggregators/NetworkChartsTrait.php';
require_once __DIR__ . '/Aggregators/GeoChartsTrait.php';
require_once __DIR__ . '/Aggregators/SpatialTrait.php';
require_once __DIR__ . '/Aggregators/HierarchyChartsTrait.php';
require_once __DIR__ . '/Aggregators/EntityGraphTrait.php';
require_once __DIR__ . '/Aggregators/PublicationChartsTrait.php';
require_once __DIR__ . '/Aggregators/OverviewChartsTrait.php';
require_once __DIR__ . '/Aggregators/MediaChartsTrait.php';
// ForceAtlas2 layout helper that EntityGraphTrait uses to bake node positions.
require_once __DIR__ . '/ForceLayout.php';

/**
 * Pure aggregation + chart-data builders for the dashboard precompute.
 *
 * Every method is static and operates on plain arrays (no Omeka or DB
 * dependencies), so the logic can be unit-tested in isolation. The in-memory
 * shapes are:
 *   - items:        [id => ['title'=>, 'template_id'=>, 'class_term'=>, 'class_label'=>]]
 *   - links:        [id => [[term, label, valueResourceId], ...]]
 *   - reverseLinks: [valueResourceId => [term => [ids]]]
 *   - childrenOf:   [parentId => [childIds]]
 *   - itemYear:     [id => 'YYYY']
 *   - temporal:     [id => [start, end]]
 *   - geo:          [id => ['name'=>, 'lat'=>, 'lon'=>, 'itemId'=>]]
 *
 * Builders return null when there is no data, so callers can skip empty keys
 * exactly as the JS orchestrator expects.
 *
 * The builders themselves live in focused traits under the Aggregators/
 * subdirectory (one concern each); this class composes them. Installation-local
 * rules are configured from the validated AMIRA profile before aggregation.
 * The public API is unchanged:
 * every method is still reached as `Aggregators::buildX(...)`.
 */
final class Aggregators
{
    use SupportTrait;
    use BasicChartsTrait;
    use TemporalChartsTrait;
    use NetworkChartsTrait;
    use GeoChartsTrait;
    use SpatialTrait;
    use HierarchyChartsTrait;
    use EntityGraphTrait;
    use PublicationChartsTrait;
    use OverviewChartsTrait;
    use MediaChartsTrait;

    private static ?int $personTemplateId = null;
    private static ?int $projectTemplateId = null;
    /** @var array<string,string> */
    private static array $universityLabels = [];

    /** Configure installation-local rules once per precompute/test process. */
    public static function configureInstallation(
        int $personTemplateId,
        int $projectTemplateId,
        array $universityLabels
    ): void {
        if ($personTemplateId < 1 || $projectTemplateId < 1) {
            throw new \InvalidArgumentException('Aggregator template ids must be positive.');
        }
        self::$personTemplateId = $personTemplateId;
        self::$projectTemplateId = $projectTemplateId;
        self::$universityLabels = $universityLabels;
    }

    private static function personTemplateId(): int
    {
        return self::$personTemplateId
            ?? throw new \LogicException('Aggregators installation rules are not configured.');
    }

    private static function projectTemplateId(): int
    {
        return self::$projectTemplateId
            ?? throw new \LogicException('Aggregators installation rules are not configured.');
    }

    private static function universityLabel(string $title): string
    {
        return self::$universityLabels[$title] ?? $title;
    }

    public const RADAR_AXES = [
        ['items', 'Items'],
        ['languages', 'Languages'],
        ['subjects', 'Subjects'],
        ['contributors', 'People'],
        ['types', 'Types'],
        ['span', 'Year span'],
    ];

}
