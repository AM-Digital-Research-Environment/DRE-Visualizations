<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

use FilesystemIterator;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;

/** Directory removal that refuses anything outside its parent, symlinks included. */
final class SafeFilesystem
{
    public static function removeTree(string $path, string $parent, ?string $requiredPrefix = null): void
    {
        $resolvedParent = realpath($parent);
        $resolvedPath = realpath($path);
        if (is_link($path) || $resolvedParent === false || $resolvedPath === false
            || !str_starts_with($resolvedPath . DIRECTORY_SEPARATOR, $resolvedParent . DIRECTORY_SEPARATOR)
            || ($requiredPrefix !== null && !str_starts_with(basename($resolvedPath), $requiredPrefix))) {
            throw new RuntimeException('Refusing to remove an unsafe snapshot path.');
        }
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($resolvedPath, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($iterator as $entry) {
            $ok = $entry->isDir() && !$entry->isLink() ? rmdir($entry->getPathname()) : unlink($entry->getPathname());
            if (!$ok) {
                throw new RuntimeException('Unable to prune snapshot path: ' . $entry->getPathname());
            }
        }
        if (!rmdir($resolvedPath)) {
            throw new RuntimeException('Unable to prune snapshot generation: ' . $resolvedPath);
        }
    }
}
