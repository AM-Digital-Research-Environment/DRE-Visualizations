<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

require dirname(__DIR__) . '/src/Precompute/OverviewDashboardGenerator.php';
require dirname(__DIR__) . '/src/Precompute/Aggregators.php';

$reflection = new ReflectionClass(\DreVisualizations\Precompute\OverviewDashboardGenerator::class);
$runner = $reflection->newInstanceWithoutConstructor();
$reflection->getProperty('aggregators')->setValue($runner, new \DreVisualizations\Precompute\Aggregators());
$reflection->getProperty('corpusStats')->setValue($runner, [
    ['k' => 'locations', 'l' => 'Locations', 'n' => 205, 's' => ''],
]);
$stats = $reflection->getMethod('buildOverviewStats')->invoke($runner, 999, 12);
if (($stats[0]['value'] ?? null) !== 205 || !empty($stats[0]['subtitle'])) {
    fwrite(STDERR, "Canonical counts must replace linked-only totals and country subtitles.\n");
    exit(1);
}
echo "Canonical overview counts passed.\n";
