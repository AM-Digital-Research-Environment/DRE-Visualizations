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
        return $store->locked(function () use ($store, $relativePath): ?string {
            $manifest = $store->manifest();
            return $manifest ? self::artifactPath($store->directory, $manifest, $relativePath) : null;
        });
    }

    public static function readJson(string $dataDir, string $relativePath): ?array
    {
        $store = new SnapshotStore($dataDir);
        return $store->locked(function () use ($store, $relativePath): ?array {
            $manifest = $store->manifest();
            $path = $manifest ? self::artifactPath($store->directory, $manifest, $relativePath) : null;
            $data = $path ? json_decode((string) file_get_contents($path), true) : null;
            return is_array($data) ? $data : null;
        });
    }
}
