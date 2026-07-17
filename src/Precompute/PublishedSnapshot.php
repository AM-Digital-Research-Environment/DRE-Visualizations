<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

/** Resolves server-side reads through the same current.json pointer as JS. */
final class PublishedSnapshot
{
    public static function path(string $dataDir, string $relativePath): ?string
    {
        $relativePath = ltrim(str_replace('\\', '/', $relativePath), '/');
        if ($relativePath === '' || in_array('..', explode('/', $relativePath), true)) {
            return null;
        }

        $manifestPath = rtrim($dataDir, '/\\') . '/current.json';
        if (is_readable($manifestPath)) {
            $manifest = json_decode((string) file_get_contents($manifestPath), true);
            $generationId = is_array($manifest) ? (string) ($manifest['generationId'] ?? '') : '';
            if (preg_match('/^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/', $generationId)) {
                $published = rtrim($dataDir, '/\\') . '/generations/' . $generationId . '/' . $relativePath;
                return is_readable($published) ? $published : null;
            }
        }

        // Upgrade compatibility before the first manifest-based regeneration.
        $legacy = rtrim($dataDir, '/\\') . '/' . $relativePath;
        return is_readable($legacy) ? $legacy : null;
    }

    /** @return array<mixed>|null */
    public static function readJson(string $dataDir, string $relativePath): ?array
    {
        $path = self::path($dataDir, $relativePath);
        if ($path === null) {
            return null;
        }
        $data = json_decode((string) file_get_contents($path), true);
        return is_array($data) ? $data : null;
    }
}
