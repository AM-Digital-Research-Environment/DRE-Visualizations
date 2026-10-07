<?php
declare(strict_types=1);

namespace DreVisualizations\Site;

use DreVisualizations\Module;
use DreVisualizations\Precompute\PublishedSnapshot;
use DreVisualizations\Precompute\SnapshotStore;
use Laminas\View\Renderer\PhpRenderer;

/**
 * The checks every block makes before mounting a loader: the page belongs to
 * the canonical public site (the only one the data endpoint answers for), and
 * the artifact the block will request exists in the published snapshot. A
 * block that fails either renders nothing instead of a spinner that ends in
 * an error.
 */
final class PublishedData
{
    public static function onCanonicalSite(PhpRenderer $view): bool
    {
        $site = $view->currentSite();
        return $site && $site->isPublic()
            && $site->id() === (int) $view->setting(Module::SETTING_SITE_ID, 0);
    }

    /** Whether the current snapshot holds this artifact; false when the store is unavailable. */
    public static function has(string $relativePath, ?string $dataDir = null): bool
    {
        $dataDir ??= SnapshotStore::tryDefault()?->directory;
        return $dataDir !== null && PublishedSnapshot::path($dataDir, $relativePath) !== null;
    }

    /** Both checks: the block may mount a loader for this artifact. */
    public static function available(PhpRenderer $view, string $relativePath, ?string $dataDir = null): bool
    {
        return self::onCanonicalSite($view) && self::has($relativePath, $dataDir);
    }
}
