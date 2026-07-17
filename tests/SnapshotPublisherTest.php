<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/Precompute/JsonArtifactWriter.php';
require dirname(__DIR__) . '/src/Precompute/SnapshotPublisher.php';

use DreVisualizations\Precompute\JsonArtifactWriter;
use DreVisualizations\Precompute\SnapshotPublisher;

$failures = 0;
function snapshotCheck(bool $condition, string $message): void
{
    global $failures;
    if ($condition) {
        echo "ok: $message\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $message\n");
}

function snapshotFixture(string $dir, int $marker): array
{
    $writer = new JsonArtifactWriter();
    $writer->write($dir . '/item-dashboards/projects-index.json', [[
        'id' => $marker,
        'name' => 'Project ' . $marker,
        'items' => 1,
    ]]);
    $writer->write($dir . '/item-dashboards/collection-overview.json', ['totalItems' => $marker]);
    $writer->write($dir . '/network-explorer.json', ['contributors' => []]);
    $writer->write($dir . '/knowledge-graphs/' . $marker . '.json', ['nodes' => [], 'edges' => []]);
    return [
        'sourceCounts' => ['items' => $marker],
        'warnings' => $marker === 1 ? ['fixture warning'] : [],
    ];
}

function removeFixtureTree(string $path): void
{
    if (!is_dir($path)) return;
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($it as $entry) {
        $entry->isDir() ? rmdir($entry->getPathname()) : unlink($entry->getPathname());
    }
    rmdir($path);
}

$root = sys_get_temp_dir() . '/dre-snapshot-' . bin2hex(random_bytes(6));
$publisher = new SnapshotPublisher($root, 7, '2.21.0');

try {
    $fixtureWriter = new JsonArtifactWriter();
    $fixtureWriter->write($root . '/item-dashboards/private-legacy.json', ['title' => 'must disappear']);
    $fixtureWriter->write($root . '/network-explorer.json', ['legacy' => true]);
    $fixtureWriter->write($root . '/wordclouds/input.json', ['static' => true]);
    $first = $publisher->publish(static fn (string $dir): array => snapshotFixture($dir, 1));
    snapshotCheck(($first['scope']['siteId'] ?? null) === 7, 'manifest declares the site scope');
    snapshotCheck(($first['scope']['itemCount'] ?? null) === 1, 'manifest declares the scoped item count');
    snapshotCheck(($first['sourceCounts']['items'] ?? null) === 1, 'manifest carries source counts');
    snapshotCheck(($first['artifactCounts']['total'] ?? null) === 4, 'all staged JSON is counted');
    snapshotCheck(is_file($root . '/' . $first['basePath'] . '/knowledge-graphs/1.json'),
        'validated generation is published under an immutable path');
    snapshotCheck(!is_dir($root . '/item-dashboards') && !is_file($root . '/network-explorer.json'),
        'direct legacy generated paths are removed after validation');
    snapshotCheck(is_file($root . '/wordclouds/input.json'), 'static data inputs are preserved');

    $currentBeforeFailure = (string) file_get_contents($root . '/current.json');
    try {
        $publisher->publish(static function (string $dir): array {
            snapshotFixture($dir, 99);
            throw new RuntimeException('simulated generator failure');
        });
        snapshotCheck(false, 'generation failure is propagated');
    } catch (RuntimeException $e) {
        snapshotCheck($e->getMessage() === 'simulated generator failure', 'generation failure is propagated');
    }
    snapshotCheck(file_get_contents($root . '/current.json') === $currentBeforeFailure,
        'failed generation leaves the current manifest unchanged');
    snapshotCheck(count(glob($root . '/generations/.staging-*') ?: []) === 0,
        'failed staging directory is removed');

    try {
        $publisher->publish(static function (string $dir): array {
            $stats = snapshotFixture($dir, 98);
            (new JsonArtifactWriter())->write($dir . '/photo-galleries/10.json', [
                'total' => 1,
                'photos' => 'not-a-list',
            ]);
            return $stats;
        });
        snapshotCheck(false, 'invalid artifact schema is rejected');
    } catch (RuntimeException $e) {
        snapshotCheck(str_contains($e->getMessage(), 'Photo gallery'), 'invalid artifact schema is rejected');
    }
    snapshotCheck(file_get_contents($root . '/current.json') === $currentBeforeFailure,
        'schema failure leaves the current manifest unchanged');

    $nestedLocked = false;
    $publisher->publish(static function (string $dir) use ($publisher, &$nestedLocked): array {
        try {
            $publisher->publish(static fn (string $nested): array => snapshotFixture($nested, 50));
        } catch (RuntimeException $e) {
            $nestedLocked = str_contains($e->getMessage(), 'already running');
        }
        return snapshotFixture($dir, 2);
    });
    snapshotCheck($nestedLocked, 'overlapping generation is rejected by the site lock');

    $latest = $publisher->publish(static fn (string $dir): array => snapshotFixture($dir, 3));
    $generationDirs = array_filter(glob($root . '/generations/*') ?: [], 'is_dir');
    snapshotCheck(count($generationDirs) === 2, 'only current and previous generations are retained');
    snapshotCheck(is_dir($root . '/' . $latest['basePath']), 'pruning never removes the current generation');
} finally {
    removeFixtureTree($root);
}

echo $failures ? "\n$failures FAILURE(S)\n" : "\nALL SNAPSHOT PUBLISHER TESTS PASS\n";
exit($failures ? 1 : 0);
