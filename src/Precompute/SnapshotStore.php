<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;

use RuntimeException;

/**
 * Private publication state. The short policy lock never waits for aggregation.
 *
 * revision.json changes only on withdrawal and scopes the manifest and the
 * offline inputs; changes.json changes on every Omeka write and tells a stale
 * snapshot from a current one. revisions.json links each revision to the one
 * before and names the records the withdrawal hid, so an input built for an
 * older revision can be served without them (hiddenSince()).
 */
final readonly class SnapshotStore
{
    /** Revision links kept; an input older than that many withdrawals is never carried forward. */
    private const LINKS = 64;
    /** Beyond this many hidden records, stop carrying: a new build is due anyway. */
    private const MAX_HIDDEN = 50_000;

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

    /**
     * Acquire before an API write; PHP also releases this handle if the request
     * fails. The write marks the source changed but leaves the published
     * snapshot served: it stays up, stale, until the automatic refresh.
     */
    public function beginWrite()
    {
        (new JsonArtifactWriter())->ensureDirectory($this->directory);
        $lock = fopen($this->directory . '/.source-write.lock', 'c');
        if (!$lock || !flock($lock, LOCK_SH)) {
            if ($lock) fclose($lock);
            throw new RuntimeException('Cannot protect a source write.');
        }
        try { $this->markChanged(); }
        catch (\Throwable $e) { fclose($lock); throw $e; }
        return $lock;
    }

    /**
     * A write that made something private withdraws: a stale snapshot could
     * still show it. $hidden names the resources it hid; null when unknown.
     *
     * @param list<int>|null $hidden
     */
    public function endWrite($lock, bool $privatised = false, ?array $hidden = null): void
    {
        try { $privatised ? $this->withdraw(automatic: true, hidden: $hidden) : $this->markChanged(); }
        finally { flock($lock, LOCK_UN); fclose($lock); }
    }

    /**
     * Capture a revision or commit only when no API writer is active. A write
     * lasts milliseconds, so wait up to $waitSeconds for one to finish rather
     * than discard a finished generation over it.
     */
    public function quiescent(callable $operation, float $waitSeconds = 0.0): mixed
    {
        (new JsonArtifactWriter())->ensureDirectory($this->directory);
        $lock = fopen($this->directory . '/.source-write.lock', 'c');
        if (!$lock) throw new RuntimeException('Cannot open the source write guard.');
        $deadline = microtime(true) + $waitSeconds;
        while (!flock($lock, LOCK_EX | LOCK_NB)) {
            if (microtime(true) >= $deadline) {
                fclose($lock);
                throw new PublicationBusy('A source write is still in progress; regenerate after edits finish.');
            }
            usleep(200_000);
        }
        try { return $this->locked($operation); }
        finally { flock($lock, LOCK_UN); fclose($lock); }
    }

    /**
     * The latest source change: a token every API write replaces, and when it
     * did. A manifest records the token its corpus was read at, so the two
     * differing means the published snapshot is stale. Null token: no write
     * since the store was created. Readable in either lock mode, or none (the
     * file is replaced atomically).
     *
     * @return array{token:?string,changedAt:int}
     */
    public function changes(): array
    {
        $path = $this->directory . '/changes.json';
        $data = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        return [
            'token' => is_string($data['token'] ?? null) ? $data['token'] : null,
            'changedAt' => is_int($data['changedAt'] ?? null) ? $data['changedAt'] : 0,
        ];
    }

    /** Record a source change; the published snapshot stays served. Not durable: losing one only delays a refresh. */
    public function markChanged(): void
    {
        $this->locked(function (): void {
            (new JsonArtifactWriter())->write($this->directory . '/changes.json',
                ['token' => bin2hex(random_bytes(16)), 'changedAt' => time()]);
        });
    }

    /** Whether the served manifest was read at the latest source change. Caller holds the policy lock. */
    public function isFresh(): bool
    {
        $manifest = $this->manifest();
        return $manifest !== null && ($manifest['sourceChange'] ?? null) === $this->changes()['token'];
    }

    /**
     * Whether an automatic refresh may publish here: something was published
     * once, and any withdrawal was the automatic kind (a privatising write).
     * A manual withdrawal, a site change or an old-version upgrade waits for
     * someone to click Regenerate now. Caller holds the policy lock.
     */
    public function refreshAllowed(): bool
    {
        return is_array($this->current()) && !$this->withdrawnByHand();
    }

    /** Whether publication was withdrawn other than by a privatising write. Caller holds the policy lock. */
    public function withdrawnByHand(): bool
    {
        $data = $this->current();
        return is_array($data) && ($data['withdrawn'] ?? false) && ($data['refresh'] ?? null) !== 'automatic';
    }

    /** current.json as written (a manifest or a tombstone), or null when absent. */
    private function current(): ?array
    {
        $path = $this->directory . '/current.json';
        $data = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        return is_array($data) ? $data : null;
    }

    /**
     * The automatic refresher's lock, held for the job's lifetime, or null when
     * another refresher holds it. One refresher at a time catches up with every
     * write, so a write that finds the lock taken needs no job of its own.
     * $waitSeconds rides out refreshIdle()'s momentary hold.
     *
     * @return resource|null
     */
    public function claimRefresh(float $waitSeconds = 0.0)
    {
        (new JsonArtifactWriter())->ensureDirectory($this->directory);
        $lock = fopen($this->directory . '/.refresh.lock', 'c');
        if (!$lock) throw new RuntimeException('Cannot open the refresh lock.');
        $deadline = microtime(true) + $waitSeconds;
        while (!flock($lock, LOCK_EX | LOCK_NB)) {
            if (microtime(true) >= $deadline) {
                fclose($lock);
                return null;
            }
            usleep(100_000);
        }
        return $lock;
    }

    public function releaseRefresh($lock): void
    {
        flock($lock, LOCK_UN);
        fclose($lock);
    }

    /** Whether no refresher is running; momentarily takes the lock to find out. */
    public function refreshIdle(): bool
    {
        $lock = $this->claimRefresh();
        if ($lock === null) return false;
        $this->releaseRefresh($lock);
        return true;
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

    /**
     * Stop serving the published snapshot. An $automatic withdrawal (a write
     * made something private) is republished by the automatic refresh; any
     * other waits for Regenerate now, and an automatic one never relaxes it.
     * Changing the revision also invalidates offline inputs, which may hold
     * what was just hidden; $hidden (the resources this withdrawal hid, null
     * when unknown, as for any manual withdrawal) lets them be served without
     * those records until a new build arrives.
     *
     * @param list<int>|null $hidden
     */
    public function withdraw(bool $automatic = false, ?array $hidden = null): void
    {
        $this->locked(function () use ($automatic, $hidden): void {
            // Changing the revision also revokes the old manifest if the tombstone write fails.
            $writer = new JsonArtifactWriter();
            $previous = $this->readRevision();
            $revision = bin2hex(random_bytes(16));
            if ($previous !== null) {
                // Before the new revision: a link lost to a crash only stops a carry.
                $links = array_slice([...$this->links(), [
                    'from' => $previous,
                    'to' => $revision,
                    'hidden' => $automatic && $hidden !== null ? array_values(array_unique(array_map('intval', $hidden))) : null,
                ]], -self::LINKS);
                $writer->write($this->directory . '/revisions.json', ['links' => $links], durable: true);
            }
            $writer->write($this->directory . '/revision.json', ['revision' => $revision], durable: true);
            $writer->write($this->directory . '/changes.json',
                ['token' => bin2hex(random_bytes(16)), 'changedAt' => time()]);
            // Nothing ever published, or already withdrawn by hand: an automatic
            // withdrawal leaves that state, so it cannot start a first publication.
            if ($automatic && ($this->current() === null || $this->withdrawnByHand())) return;
            $writer->write($this->directory . '/current.json',
                ['withdrawn' => true] + ($automatic ? ['refresh' => 'automatic'] : []), durable: true);
        });
    }

    /**
     * The resources hidden since $revision, following the links back from the
     * current revision: [] for the current revision itself, null when any
     * withdrawal on the way did not say what it hid (a manual one, or a write
     * whose earlier state was unknown) or $revision is not in the history.
     * Caller holds the policy lock in either mode (or none: files are replaced atomically).
     *
     * @return list<int>|null
     */
    public function hiddenSince(string $revision): ?array
    {
        $current = $this->readRevision();
        if ($current === null) return null;
        $hidden = [];
        $links = $this->links();
        for ($i = count($links) - 1; $current !== $revision; $i--) {
            while ($i >= 0 && $links[$i]['to'] !== $current) $i--;
            if ($i < 0 || !is_array($links[$i]['hidden'])) return null;
            foreach ($links[$i]['hidden'] as $id) $hidden[$id] = true;
            if (count($hidden) > self::MAX_HIDDEN) return null;
            $current = $links[$i]['from'];
        }
        $ids = array_keys($hidden);
        sort($ids);
        return $ids;
    }

    /** @return list<array{from:string,to:string,hidden:?list<int>}> */
    private function links(): array
    {
        $path = $this->directory . '/revisions.json';
        $data = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        $links = [];
        foreach (is_array($data['links'] ?? null) ? $data['links'] : [] as $link) {
            if (!is_array($link) || !is_string($link['from'] ?? null) || !is_string($link['to'] ?? null)) continue;
            $hidden = is_array($link['hidden'] ?? null) ? array_values(array_filter($link['hidden'], 'is_int')) : null;
            $links[] = ['from' => $link['from'], 'to' => $link['to'], 'hidden' => $hidden];
        }
        return $links;
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
