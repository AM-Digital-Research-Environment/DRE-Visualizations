<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
use DreVisualizations\Precompute\{GenerationCancelled, JsonArtifactWriter, PublicationBusy, PublishedSnapshot, SnapshotPublisher, SnapshotStore, SourceChanged};

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
    $fresh = static fn (): bool => $store->reading(fn () => $store->isFresh());
    $served = static fn (): bool => PublishedSnapshot::path($root, 'item-dashboards/collection-overview.json') !== null;
    $check($fresh(), 'A new generation is current');

    // An ordinary edit leaves the snapshot served but stale.
    $lock = $store->beginWrite();
    $check($served() && !$fresh(), 'A write in progress keeps serving the stale snapshot');
    try {
        (new SnapshotPublisher($root, 1, 'test', 0.2))->publish($generate);
        throw new RuntimeException('Published during a source write');
    } catch (PublicationBusy $e) {
        $check(str_contains($e->getMessage(), 'source write'), 'A write in progress blocks publication once the wait runs out');
    }
    $store->endWrite($lock);
    $check($served() && !$fresh(), 'A finished ordinary write still serves the stale snapshot');
    $check($store->locked(fn () => $store->revision()) === $second['revision'], 'An ordinary write keeps the revision, so offline inputs stay valid');
    $third = $publisher->publish($generate);
    $check($fresh() && $third['sourceChange'] === $store->changes()['token'], 'Regeneration records the source change it read');

    // A write while the corpus is read discards the run; one after it only makes the result stale.
    try {
        $publisher->publish(function ($dir, $revision, $loaded) use ($generate, $store): array {
            $store->markChanged();
            $loaded();
            return $generate($dir);
        });
        throw new RuntimeException('A mixed corpus was published');
    } catch (SourceChanged $e) {
        $check($store->locked(fn () => $store->manifest())['generationId'] === $third['generationId'], 'A write during the corpus read discards the run and keeps the old snapshot');
    }
    try {
        $publisher->publish(function ($dir) use ($generate, $store): array {
            $store->markChanged();
            return $generate($dir);
        });
        throw new RuntimeException('An unconfirmed read was published');
    } catch (SourceChanged $e) {
        $check(true, 'A generator that never confirms its read is rejected by any write');
    }
    $fourth = $publisher->publish(function ($dir, $revision, $loaded) use ($generate, $store): array {
        $loaded();
        $store->markChanged();
        return $generate($dir);
    });
    $check($store->locked(fn () => $store->manifest())['generationId'] === $fourth['generationId'] && !$fresh(), 'A write after the corpus read publishes a stale but consistent snapshot');

    // Withdrawals: a privatising write may be republished automatically, a manual one may not.
    $check($store->reading(fn () => $store->refreshAllowed() && !$store->withdrawnByHand()), 'A published snapshot may be refreshed automatically');
    $lock = $store->beginWrite();
    $store->endWrite($lock, privatised: true);
    $check(!$served(), 'A privatising write withdraws publication');
    $check($store->reading(fn () => $store->refreshAllowed() && !$store->withdrawnByHand()), 'The automatic refresh may republish after a privatising write');
    $publisher->publish($generate);
    $store->withdraw();
    $check($store->reading(fn () => !$store->refreshAllowed() && $store->withdrawnByHand()), 'A manual withdrawal waits for Regenerate now');
    $before = $store->locked(fn () => $store->revision());
    $store->withdraw(automatic: true);
    $check($store->reading(fn () => $store->withdrawnByHand()) && $store->locked(fn () => $store->revision()) !== $before,
        'A privatising write after a manual withdrawal keeps it manual, but still rotates the revision');

    // One automatic refresher at a time.
    $refresher = $store->claimRefresh();
    $check($refresher !== null && $store->claimRefresh() === null && !$store->refreshIdle(), 'A running refresher holds the refresh lock');
    $store->releaseRefresh($refresher);
    $check($store->refreshIdle(), 'The refresh lock is free once the refresher ends');
    $empty = new SnapshotStore($root . '-empty');
    $check(!$empty->reading(fn () => $empty->refreshAllowed()), 'Nothing is refreshed automatically before a first publication');
    $lock = $empty->beginWrite();
    $empty->endWrite($lock, privatised: true);
    $check(!$empty->reading(fn () => $empty->refreshAllowed()) && !is_file($root . '-empty/current.json'),
        'A privatising write before any publication cannot start a first one');

    $last = $publisher->publish($generate);
    $writer->write($root . '/current.json', ['generationId' => $last['generationId']]);
    $check(PublishedSnapshot::path($root, 'item-dashboards/collection-overview.json') === null, 'Missing revision fails closed');
} finally {
    foreach ([$root, $root . '-empty'] as $dir) {
        if (!is_dir($dir)) continue;
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $entry) {
            $entry->isDir() ? rmdir($entry->getPathname()) : unlink($entry->getPathname());
        }
        rmdir($dir);
    }
}
echo "Snapshot lifecycle passed.\n";
