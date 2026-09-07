<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/Precompute/Runner.php';
require dirname(__DIR__) . '/src/Precompute/Aggregators.php';

$reflection = new ReflectionClass(\DreVisualizations\Precompute\Runner::class);
$runner = $reflection->newInstanceWithoutConstructor();
$reflection->getProperty('corpusStats')->setValue($runner, [
    ['k' => 'locations', 'l' => 'Locations', 'n' => 205, 's' => ''],
]);
$stats = $reflection->getMethod('buildOverviewStats')->invoke($runner, 999, 12);
if (($stats[0]['value'] ?? null) !== 205 || !empty($stats[0]['subtitle'])) {
    fwrite(STDERR, "Canonical counts must replace linked-only totals and country subtitles.\n");
    exit(1);
}
echo "Canonical overview counts passed.\n";
