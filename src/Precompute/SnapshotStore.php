<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;

use RuntimeException;

/** Private publication state. The short policy lock never waits for aggregation. */
final class SnapshotStore
{
    public function __construct(public readonly string $directory) {}

    public static function defaultDirectory(): string
    {
        $root = defined('OMEKA_PATH') ? OMEKA_PATH : dirname(__DIR__, 2);
        $path = getenv('DRE_VISUALIZATIONS_DATA_DIR') ?: sys_get_temp_dir()
            . '/omeka-dre-visualizations-' . substr(hash('sha256', $root), 0, 20);
        if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) {
            throw new RuntimeException('Cannot create private visualization storage.');
        }
        $resolved = realpath($path);
        $publicRoot = realpath($root);
        if ($resolved === false || $publicRoot === false || is_link($path)
            || str_starts_with(strtolower($resolved) . DIRECTORY_SEPARATOR,
                strtolower($publicRoot) . DIRECTORY_SEPARATOR)) {
            throw new RuntimeException('Visualization storage must be outside the Omeka document root.');
        }
        return $resolved;
    }

    public function locked(callable $operation): mixed
    {
        (new JsonArtifactWriter())->ensureDirectory($this->directory);
        $lock = fopen($this->directory . '/.policy.lock', 'c');
        if (!$lock || !flock($lock, LOCK_EX)) {
            throw new RuntimeException('Cannot lock visualization publication state.');
        }
        try { return $operation(); }
        finally { flock($lock, LOCK_UN); fclose($lock); }
    }

    /** Acquire before an API write; PHP also releases this handle if the request fails. */
    public function beginWrite()
    {
        (new JsonArtifactWriter())->ensureDirectory($this->directory);
        $lock = fopen($this->directory . '/.source-write.lock', 'c');
        if (!$lock || !flock($lock, LOCK_SH)) throw new RuntimeException('Cannot protect a source write.');
        try { $this->withdraw(); }
        catch (\Throwable $e) { fclose($lock); throw $e; }
        return $lock;
    }

    public function endWrite($lock): void
    {
        try { $this->withdraw(); }
        finally { flock($lock, LOCK_UN); fclose($lock); }
    }

    /** Capture a revision or commit only when no API writer is active. */
    public function quiescent(callable $operation): mixed
    {
        (new JsonArtifactWriter())->ensureDirectory($this->directory);
        $lock = fopen($this->directory . '/.source-write.lock', 'c');
        if (!$lock) throw new RuntimeException('Cannot open the source write guard.');
        if (!flock($lock, LOCK_EX | LOCK_NB)) {
            fclose($lock);
            throw new RuntimeException('A source write is still in progress; regenerate after edits finish.');
        }
        try { return $this->locked($operation); }
        finally { flock($lock, LOCK_UN); fclose($lock); }
    }

    /** Caller holds the policy lock. */
    public function revision(): string
    {
        $path = $this->directory . '/revision.json';
        if (!is_file($path)) {
            (new JsonArtifactWriter())->write($path, ['revision' => bin2hex(random_bytes(16))]);
        }
        $state = json_decode((string) file_get_contents($path), true);
        if (!is_string($state['revision'] ?? null)) throw new RuntimeException('Invalid publication revision.');
        return $state['revision'];
    }

    public function withdraw(): void
    {
        $this->locked(function (): void {
            // Changing the revision also revokes the old manifest if the tombstone write fails.
            $writer = new JsonArtifactWriter();
            $writer->write($this->directory . '/revision.json', ['revision' => bin2hex(random_bytes(16))]);
            $writer->write($this->directory . '/current.json', ['withdrawn' => true]);
        });
    }

    /** Caller holds the policy lock. */
    public function manifest(): ?array
    {
        $path = $this->directory . '/current.json';
        $data = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        return is_array($data) && ($data['revision'] ?? null) === $this->revision()
            && preg_match('/^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/', (string) ($data['generationId'] ?? ''))
            ? $data : null;
    }
}
