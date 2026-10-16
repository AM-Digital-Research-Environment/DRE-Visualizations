<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

use RuntimeException;

/**
 * The semantic-map inputs (map, similar, report), downloaded from this
 * repository's GitHub Releases instead of shipping inside the module zip.
 *
 * The embeddings workflow publishes each build as a `semantic-inputs-<n>`
 * release. Before a regeneration, and when that workflow pings the site, the
 * newest such release is downloaded into the private snapshot store, but only
 * when all three files were built for this site, profile and revision
 * (ScopedInput's scope). A build for an older revision is left on GitHub, so
 * a record made private since never comes back through it.
 *
 * Each build lives in its own directory named after its tag; state.json names
 * the installed one, so a generation never reads files from two builds.
 */
final class EmbeddingInputs
{
    public const REPOSITORY = 'AM-Digital-Research-Environment/DRE-Visualizations';
    public const TAG_PREFIX = 'semantic-inputs-';
    public const FILES = ['map', 'similar', 'report'];
    /** Seconds between two looks at GitHub before a regeneration (60 anonymous API calls an hour per IP). */
    public const CHECK_EVERY = 600;
    /** The shortest interval, for Regenerate now and the workflow's ping. */
    public const CHECK_AT_MOST_EVERY = 60;
    private const MAX_BYTES = 64 * 1024 * 1024;
    private const TAG_PATTERN = '/^semantic-inputs-[A-Za-z0-9.-]{1,64}$/';

    /** @var callable(string):?string */
    private $fetch;
    /** @var callable():int */
    private $now;

    /**
     * @param callable(string):?string $fetch GET a URL; the body, or null on any failure
     * @param (callable():int)|null $now
     */
    public function __construct(public readonly string $directory, callable $fetch, ?callable $now = null)
    {
        $this->fetch = $fetch;
        $this->now = $now ?? static fn (): int => time();
    }

    public static function forStore(string $storeDirectory, callable $fetch): self
    {
        return new self($storeDirectory . '/embedding-inputs', $fetch);
    }

    /** A fetcher over Omeka's configured HTTP client (proxy and TLS settings included). */
    public static function httpFetcher(\Laminas\Http\Client $client): \Closure
    {
        return static function (string $url) use ($client): ?string {
            try {
                // A fresh Request rather than resetParameters(), which re-applies
                // the shared client's empty URI and trips a null-scheme deprecation.
                $request = clone $client;
                $request->setRequest(new \Laminas\Http\Request());
                $request->clearCookies();
                $request->clearAuth();
                $request->setOptions(['timeout' => 30, 'maxredirects' => 5]);
                $request->setUri($url);
                $request->setMethod('GET');
                $request->setHeaders([
                    'User-Agent' => 'DRE-Visualizations (Omeka S module)',
                    'Accept' => str_contains($url, '//api.github.com/') ? 'application/vnd.github+json' : 'application/octet-stream',
                ]);
                $response = $request->send();
                return $response->isSuccess() ? $response->getBody() : null;
            } catch (\Throwable) {
                return null;
            }
        };
    }

    /** The installed build's directory, or null before the first download. */
    public function currentDirectory(): ?string
    {
        $tag = $this->state()['tag'] ?? null;
        return is_string($tag) && preg_match(self::TAG_PATTERN, $tag) && is_dir($this->directory . '/' . $tag)
            ? $this->directory . '/' . $tag : null;
    }

    /**
     * What the maintenance page reports: the installed build, whether it was
     * made for $scope, and the last look at GitHub.
     *
     * @return array{tag:?string,matches:bool,checkedAt:int,error:?string}
     */
    public function status(array $scope): array
    {
        $state = $this->state();
        $dir = $this->currentDirectory();
        return [
            'tag' => $dir === null ? null : basename($dir),
            'matches' => $dir !== null && ScopedInput::read($dir . '/report.php', $scope) !== null,
            'checkedAt' => (int) ($state['checkedAt'] ?? 0),
            'error' => is_string($state['error'] ?? null) ? $state['error'] : null,
        ];
    }

    /**
     * Install the newest release when it was built for $scope.
     *
     * Returns 'installed', 'current' (already installed), 'none' (no release
     * for this scope yet), 'throttled' (looked less than $minInterval seconds
     * ago, or another check is running) or 'error' (recorded in the state).
     */
    public function refresh(array $scope, int $minInterval = self::CHECK_EVERY): string
    {
        (new JsonArtifactWriter())->ensureDirectory($this->directory);
        $lock = fopen($this->directory . '/.lock', 'c');
        if ($lock === false) throw new RuntimeException('Unable to open the semantic-input lock.');
        try {
            if (!flock($lock, LOCK_EX | LOCK_NB)) return 'throttled';
            $state = $this->state();
            $now = ($this->now)();
            if ($now - (int) ($state['checkedAt'] ?? 0) < $minInterval) return 'throttled';
            $state['checkedAt'] = $now;
            try {
                $result = $this->install($scope, $state);
                unset($state['error']);
            } catch (RuntimeException $e) {
                $result = 'error';
                $state['error'] = $e->getMessage();
            }
            (new JsonArtifactWriter())->write($this->directory . '/state.json', $state, durable: true);
            return $result;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /** Caller holds the lock; updates $state['tag'] on install. */
    private function install(array $scope, array &$state): string
    {
        $release = $this->newestRelease();
        if ($release === null) return 'none';
        [$tag, $assets] = $release;
        if ($tag === ($state['tag'] ?? null) && $this->currentDirectory() !== null) return 'current';

        $payloads = [];
        // The report first: it is small, and a scope mismatch stops there.
        foreach (['report', 'map', 'similar'] as $name) {
            $raw = ($this->fetch)($assets[$name]);
            if ($raw === null) throw new RuntimeException(sprintf('Could not download %s.php from %s.', $name, $tag));
            if (strlen($raw) > self::MAX_BYTES) throw new RuntimeException(sprintf('%s.php in %s is too large.', $name, $tag));
            $raw = str_replace("\r\n", "\n", $raw);
            if (!str_starts_with($raw, ScopedInput::PREFIX) || !is_array(json_decode(substr($raw, strlen(ScopedInput::PREFIX)), true))) {
                throw new RuntimeException(sprintf('%s.php in %s is not a scoped input.', $name, $tag));
            }
            // Built for another revision: wait for a build of this one.
            if (ScopedInput::parse($raw, $scope) === null) return 'none';
            $payloads[$name] = $raw;
        }

        $tmp = $this->directory . '/.tmp-' . bin2hex(random_bytes(6));
        (new JsonArtifactWriter())->ensureDirectory($tmp);
        foreach ($payloads as $name => $raw) {
            if (file_put_contents($tmp . '/' . $name . '.php', $raw) !== strlen($raw)) {
                SafeFilesystem::removeTree($tmp, $this->directory, '.tmp-');
                throw new RuntimeException('Unable to write the semantic inputs.');
            }
        }
        $target = $this->directory . '/' . $tag;
        if (is_dir($target)) SafeFilesystem::removeTree($target, $this->directory, self::TAG_PREFIX);
        if (!rename($tmp, $target)) {
            SafeFilesystem::removeTree($tmp, $this->directory, '.tmp-');
            throw new RuntimeException('Unable to install the semantic inputs.');
        }
        $previous = $state['tag'] ?? null;
        $state['tag'] = $tag;
        $state['installedAt'] = ($this->now)();
        (new JsonArtifactWriter())->write($this->directory . '/state.json', $state, durable: true);
        $this->prune([$tag, $previous]);
        return 'installed';
    }

    /**
     * The newest non-draft `semantic-inputs-*` release carrying all three
     * files, as [tag, name => download URL]; null when there is none.
     *
     * @return array{0:string,1:array<string,string>}|null
     */
    private function newestRelease(): ?array
    {
        $body = ($this->fetch)('https://api.github.com/repos/' . self::REPOSITORY . '/releases?per_page=100');
        $releases = $body === null ? null : json_decode($body, true);
        if (!is_array($releases) || !array_is_list($releases)) {
            throw new RuntimeException('GitHub did not list the releases.');
        }
        $best = null;
        $bestAt = '';
        $downloads = 'https://github.com/' . self::REPOSITORY . '/releases/download/';
        foreach ($releases as $release) {
            $tag = is_array($release) ? ($release['tag_name'] ?? null) : null;
            if (!is_string($tag) || !preg_match(self::TAG_PATTERN, $tag) || !empty($release['draft'])) continue;
            $assets = [];
            foreach ((array) ($release['assets'] ?? []) as $asset) {
                $name = is_array($asset) ? ($asset['name'] ?? null) : null;
                $url = is_array($asset) ? ($asset['browser_download_url'] ?? null) : null;
                if (is_string($name) && is_string($url) && str_starts_with($url, $downloads . $tag . '/')
                    && in_array(substr($name, 0, -4), self::FILES, true) && str_ends_with($name, '.php')) {
                    $assets[substr($name, 0, -4)] = $url;
                }
            }
            $at = (string) ($release['created_at'] ?? '');
            if (count($assets) === count(self::FILES) && ($best === null || strcmp($at, $bestAt) > 0)) {
                $best = [$tag, $assets];
                $bestAt = $at;
            }
        }
        return $best;
    }

    /** Remove every build but $keep (the installed one and the one a running generation may still read). */
    private function prune(array $keep): void
    {
        foreach (new \FilesystemIterator($this->directory, \FilesystemIterator::SKIP_DOTS) as $entry) {
            $name = $entry->getFilename();
            if ($entry->isDir() && !$entry->isLink() && preg_match(self::TAG_PATTERN, $name) && !in_array($name, $keep, true)) {
                SafeFilesystem::removeTree($entry->getPathname(), $this->directory, self::TAG_PREFIX);
            }
        }
    }

    private function state(): array
    {
        $path = $this->directory . '/state.json';
        $state = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        return is_array($state) ? $state : [];
    }
}
