<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

use DreVisualizations\Precompute\{AmiraProfile, CorpusSnapshot, GeneratorPaths, OverviewDashboardGenerator};

$data = array_fill_keys([
    'links', 'reverseLinks', 'childrenOf', 'itemYear', 'itemDate', 'temporal',
    'geo', 'itemSets', 'templateLabels', 'literals', 'primaryMedia',
], []);
$data['items'] = [1 => ['public' => true]];
$data['scope'] = ['type' => 'canonical-site', 'siteId' => 1, 'itemCount' => 1];

// Exercise normal construction rather than reflection on the child class.
$runner = new OverviewDashboardGenerator(
    CorpusSnapshot::fromArray($data),
    AmiraProfile::fromFile(dirname(__DIR__) . '/config/amira-profile.json'),
    new GeneratorPaths(...array_fill(0, 8, sys_get_temp_dir() . '/dre-overview-test/generations/test/item-dashboards')),
    corpusStats: [['k' => 'locations', 'l' => 'Locations', 'n' => 205, 's' => '']],
);
$stats = (new ReflectionMethod($runner, 'buildOverviewStats'))->invoke($runner, 999, 12);
if (($stats[0]['value'] ?? null) !== 205 || !empty($stats[0]['subtitle'])) {
    fwrite(STDERR, "Canonical counts must replace linked-only totals and country subtitles.\n");
    exit(1);
}
echo "Canonical overview counts passed.\n";
