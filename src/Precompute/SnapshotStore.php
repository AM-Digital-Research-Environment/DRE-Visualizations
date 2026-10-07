<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;

use RuntimeException;

/** Private publication state. The short policy lock never waits for aggregation. */
final readonly class SnapshotStore
{
    public function __construct(public string $directory) {}

    /** The configured store path, without creating or validating it. */
    public static function defaultPath(): string
    {
        $root = defined('OMEKA_PATH') ? OMEKA_PATH : dirname(__DIR__, 2);
        return getenv('DRE_VISUALIZATIONS_DATA_DIR') ?: sys_get_temp_dir()
            . '/omeka-dre-visualizations-' . substr(hash('sha256', $root), 0, 20);
    }

    public static function defaultDirectory(): string
    {
        $root = defined('OMEKA_PATH') ? OMEKA_PATH : dirname(__DIR__, 2);
        $path = self::defaultPath();
        if (!is_dir($path) && !@mkdir($path, 0700, true) && !is_dir($path)) {
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

    /**
     * The default store, or null when it is missing, unwritable or misplaced.
     * Render paths use this: a storage fault must hide the visualizations, not
     * turn every item page into a 500.
     */
    public static function tryDefault(): ?self
    {
        try {
            return new self(self::defaultDirectory());
        } catch (RuntimeException) {
            return null;
        }
    }

    /** Whether any (possibly withdrawn) publication exists at the default path. */
    public static function hasPublicationAtDefaultPath(): bool
    {
        return is_file(self::defaultPath() . '/current.json');
    }

    /**
     * Run under the policy lock. Writers take it exclusively; readers pass
     * $exclusive = false and share it, so concurrent page renders and data
     * requests never queue behind one another — only behind a withdrawal or a
     * commit. A shared holder must not write any state (see readRevision()).
     */
    public function locked(callable $operation, bool $exclusive = true): mixed
    {
        (new JsonArtifactWriter())->ensureDirectory($this->directory);
        $lock = fopen($this->directory . '/.policy.lock', 'c');
        if (!$lock || !flock($lock, $exclusive ? LOCK_EX : LOCK_SH)) {
            if ($lock) fclose($lock);
            throw new RuntimeException('Cannot lock visualization publication state.');
        }
        try { return $operation(); }
        finally { flock($lock, LOCK_UN); fclose($lock); }
    }

    /** Run a read-only operation under the shared policy lock. */
    public function reading(callable $operation): mixed
    {
        return $this->locked($operation, false);
    }

    /** Acquire before an API write; PHP also releases this handle if the request fails. */
    public function beginWrite()
    {
        (new JsonArtifactWriter())->ensureDirectory($this->directory);
        $lock = fopen($this->directory . '/.source-write.lock', 'c');
        if (!$lock || !flock($lock, LOCK_SH)) {
            if ($lock) fclose($lock);
            throw new RuntimeException('Cannot protect a source write.');
        }
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

    /** Caller holds the policy lock exclusively: a missing revision is created. */
    public function revision(): string
    {
        if (!is_file($this->directory . '/revision.json')) {
            (new JsonArtifactWriter())->write($this->directory . '/revision.json', ['revision' => bin2hex(random_bytes(16))], durable: true);
        }
        return $this->readRevision() ?? throw new RuntimeException('Invalid publication revision.');
    }

    /** Caller holds the policy lock in either mode. Never writes; null when absent or invalid. */
    public function readRevision(): ?string
    {
        $path = $this->directory . '/revision.json';
        $state = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        return is_string($state['revision'] ?? null) ? $state['revision'] : null;
    }

    public function withdraw(): void
    {
        $this->locked(function (): void {
            // Changing the revision also revokes the old manifest if the tombstone write fails.
            $writer = new JsonArtifactWriter();
            $writer->write($this->directory . '/revision.json', ['revision' => bin2hex(random_bytes(16))], durable: true);
            $writer->write($this->directory . '/current.json', ['withdrawn' => true], durable: true);
        });
    }

    /**
     * The current manifest, or null when withdrawn, stale, or written for an
     * artifact schema this module version does not read. The schema check is
     * what lets an upgrade keep serving a compatible snapshot: a release that
     * changes the artifact contract bumps SnapshotPublisher::SCHEMA_VERSION, and
     * the old generation stops being served until it is regenerated.
     * Caller holds the policy lock in either mode.
     */
    public function manifest(): ?array
    {
        $path = $this->directory . '/current.json';
        $data = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        $revision = $this->readRevision();
        return is_array($data) && $revision !== null && ($data['revision'] ?? null) === $revision
            && ($data['schemaVersion'] ?? null) === SnapshotPublisher::SCHEMA_VERSION
            && preg_match('/^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/', (string) ($data['generationId'] ?? ''))
            ? $data : null;
    }
}
