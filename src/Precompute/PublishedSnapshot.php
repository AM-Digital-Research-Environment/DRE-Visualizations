<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;

/** Fail-closed reader; legacy public paths are never a fallback. */
final class PublishedSnapshot
{
    public static function artifactPath(string $dataDir, array $manifest, string $relativePath): ?string
    {
        if (!preg_match('~^(?:[a-z-]+/)?[a-zA-Z0-9_-]+\\.json$~D', $relativePath)) return null;
        $base = realpath($dataDir . '/generations/' . $manifest['generationId']);
        $path = $base ? realpath($base . '/' . $relativePath) : false;
        return $path && str_starts_with($path, $base . DIRECTORY_SEPARATOR) && is_file($path) ? $path : null;
    }

    public static function path(string $dataDir, string $relativePath): ?string
    {
        $store = new SnapshotStore($dataDir);
        return $store->reading(function () use ($store, $relativePath): ?string {
            $manifest = $store->manifest();
            return $manifest ? self::artifactPath($store->directory, $manifest, $relativePath) : null;
        });
    }

    /**
     * Open the current artifact under the shared lock and return the handle.
     * The handle outlives a later prune (POSIX keeps an unlinked file readable
     * while it is open), so callers read and decode without holding the lock.
     *
     * @return resource|null
     */
    public static function open(string $dataDir, string $relativePath)
    {
        $store = new SnapshotStore($dataDir);
        return $store->reading(function () use ($store, $relativePath) {
            $manifest = $store->manifest();
            $path = $manifest ? self::artifactPath($store->directory, $manifest, $relativePath) : null;
            return $path !== null ? (fopen($path, 'rb') ?: null) : null;
        });
    }

    public static function readJson(string $dataDir, string $relativePath): ?array
    {
        $handle = self::open($dataDir, $relativePath);
        if ($handle === null) return null;
        try {
            $data = json_decode((string) stream_get_contents($handle), true);
        } finally {
            fclose($handle);
        }
        return is_array($data) ? $data : null;
    }
}
