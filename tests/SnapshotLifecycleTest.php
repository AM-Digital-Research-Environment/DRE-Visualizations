<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
use DreVisualizations\Precompute\{GenerationCancelled, JsonArtifactWriter, PublishedSnapshot, SnapshotPublisher, SnapshotStore};

$root = sys_get_temp_dir() . '/dre-lifecycle-' . bin2hex(random_bytes(6));
$writer = new JsonArtifactWriter();
$store = new SnapshotStore($root);
$publisher = new SnapshotPublisher($root, 1, 'test');
$generate = static function (string $dir) use ($writer): array {
    $writer->write($dir . '/item-dashboards/projects-index.json', []);
    $writer->write($dir . '/item-dashboards/collection-overview.json', ['totalItems' => 1]);
    $writer->write($dir . '/network-explorer.json', []);
    return ['sourceCounts' => ['items' => 1]];
};
$check = static function (bool $pass, string $message): void {
    if (!$pass) throw new RuntimeException($message);
    echo "ok: $message\n";
};
try {
    $first = $publisher->publish($generate);
    try {
        $publisher->publish($generate, static function (): void { throw new GenerationCancelled(); });
        throw new RuntimeException('Cancelled publication was accepted');
    } catch (GenerationCancelled $e) {}
    $check($store->locked(fn () => $store->manifest()) === $first, 'Cancellation preserves a still-valid previous generation');
    $check(count(glob($root . '/generations/*')) === 1, 'Cancellation removes the unpublished generation');
    try {
        $publisher->publish(function ($dir) use ($generate, $store): array {
            $result = $generate($dir);
            $store->withdraw();
            return $result;
        });
        throw new RuntimeException('Stale publication was accepted');
    } catch (RuntimeException $e) {
        $check(str_contains($e->getMessage(), 'changed during generation'), 'An edit during aggregation rejects publication');
    }
    $check(PublishedSnapshot::readJson($root, 'item-dashboards/collection-overview.json') === null, 'Withdrawal prevents reads of the retained generation');
    $second = $publisher->publish(function ($dir) use ($root, $generate, $check): array {
        try {
            (new SnapshotPublisher($root, 2, 'test'))->publish($generate);
            throw new RuntimeException('Cross-site publisher was accepted');
        } catch (RuntimeException $e) {
            $check(str_contains($e->getMessage(), 'already running'), 'One destination lock covers different canonical sites');
        }
        return $generate($dir);
    });
    $check($second['revision'] !== $first['revision'], 'Regeneration publishes against the new revision');
    $check(PublishedSnapshot::path($root, '../revision.json') === null, 'Artifact traversal is rejected');
    $check(PublishedSnapshot::path($root, 'item-dashboards/collection-overview.json') !== null, 'Current valid artifact is readable');
    $writer->write($root . '/current.json', ['generationId' => $second['generationId']]);
    $check(PublishedSnapshot::path($root, 'item-dashboards/collection-overview.json') === null, 'Missing revision fails closed');
} finally {
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $entry) {
        $entry->isDir() ? rmdir($entry->getPathname()) : unlink($entry->getPathname());
    }
    rmdir($root);
}
echo "Snapshot lifecycle passed.\n";
