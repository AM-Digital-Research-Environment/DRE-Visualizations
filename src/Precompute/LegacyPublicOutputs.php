<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

use RuntimeException;

/**
 * Generated JSON that module versions before 2.29.0 wrote under the public
 * `asset/data` directory, where it bypassed the manifest and could expose
 * records that have since become private. Static inputs (`geo/`) stay.
 */
final class LegacyPublicOutputs
{
    private const DIRECTORIES = [
        'item-dashboards', 'communities', 'knowledge-graphs', 'photo-galleries',
        'featured-collections', 'item-set-dashboards', 'generations', 'wordclouds', 'embeddings',
    ];
    private const FILES = ['network-explorer.json', 'current.json'];

    public static function purge(string $publicDataDir): void
    {
        if (!is_dir($publicDataDir)) return;
        foreach (self::DIRECTORIES as $directory) {
            $path = $publicDataDir . '/' . $directory;
            if (is_dir($path)) SafeFilesystem::removeTree($path, $publicDataDir);
        }
        $root = realpath($publicDataDir);
        foreach (self::FILES as $file) {
            $path = $publicDataDir . '/' . $file;
            if (!is_file($path)) continue;
            $resolved = realpath($path);
            if ($root === false || $resolved === false || dirname($resolved) !== $root || !unlink($resolved)) {
                throw new RuntimeException('Unable to remove the legacy public artifact ' . $file . '.');
            }
        }
    }
}
