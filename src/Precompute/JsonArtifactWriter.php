<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

use RuntimeException;

/**
 * Writes precomputed JSON artifacts with one encoding policy and a best-effort
 * atomic replace. Temp files live beside their targets so the final rename stays
 * on the same filesystem.
 */
final class JsonArtifactWriter
{
    private const JSON_FLAGS = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

    public function ensureDirectory(string $dir): void
    {
        if (is_dir($dir)) {
            return;
        }
        // Private: everything written here lives in the snapshot store and is
        // served only through DataController, never directly by the web server.
        if (!mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new RuntimeException(sprintf('Unable to create directory "%s".', $dir));
        }
    }

    /**
     * Atomically replace $path with the JSON encoding of $payload. A $durable
     * write is flushed to disk before the rename, so the file survives a crash
     * or power loss — for the publication state (current.json, revision.json),
     * not for each of the thousands of artifacts in a generation, which are
     * only reachable once the durable manifest names them.
     */
    public function write(string $path, array $payload, bool $durable = false): void
    {
        $dir = dirname($path);
        $this->ensureDirectory($dir);

        $json = json_encode($payload, self::JSON_FLAGS);
        if ($json === false) {
            throw new RuntimeException(sprintf(
                'Unable to encode JSON artifact "%s": %s',
                $path,
                json_last_error_msg()
            ));
        }

        // The temporary name is unique to this process, so no lock is needed.
        $tmp = $this->temporaryPath($path);
        $handle = fopen($tmp, 'xb');
        $ok = $handle !== false && fwrite($handle, $json) === strlen($json)
            && (!$durable || (fflush($handle) && fsync($handle)));
        if ($handle !== false) fclose($handle);
        if (!$ok) {
            @unlink($tmp);
            throw new RuntimeException(sprintf('Unable to write temporary JSON artifact "%s".', $tmp));
        }

        $this->replace($tmp, $path);
    }

    private function temporaryPath(string $path): string
    {
        return sprintf(
            '%s.tmp.%s.%s',
            $path,
            getmypid() ?: 'process',
            str_replace('.', '', uniqid('', true))
        );
    }

    private function replace(string $tmp, string $path): void
    {
        if (@rename($tmp, $path)) {
            return;
        }

        // Windows cannot reliably rename over an existing file. Production Omeka
        // is Linux, but this keeps local regeneration usable from the shared repo.
        if (PHP_OS_FAMILY === 'Windows' && is_file($path)) {
            @unlink($path);
            if (@rename($tmp, $path)) {
                return;
            }
        }

        @unlink($tmp);
        throw new RuntimeException(sprintf('Unable to replace JSON artifact "%s".', $path));
    }
}
