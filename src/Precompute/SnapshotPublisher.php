<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

use FilesystemIterator;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;

/**
 * Publishes one complete, immutable precompute generation.
 *
 * A per-site lock prevents overlapping jobs. The generator writes only inside
 * a staging directory; every JSON artifact is decoded and required outputs are
 * checked before the directory is renamed and current.json is replaced. Thus
 * readers see either the previous complete generation or the new one.
 */
final class SnapshotPublisher
{
    public const SCHEMA_VERSION = 1;
    private const RETAINED_GENERATIONS = 2;

    private JsonArtifactWriter $artifacts;

    public function __construct(
        private readonly string $dataDir,
        private readonly int $siteId,
        private readonly string $moduleVersion,
    ) {
        if ($siteId < 1) {
            throw new \InvalidArgumentException('A positive site id is required for snapshot publication.');
        }
        if ($moduleVersion === '') {
            throw new \InvalidArgumentException('A module version is required for snapshot publication.');
        }
        $this->artifacts = new JsonArtifactWriter();
    }

    /**
     * @param callable(string):array $generate Receives the staging directory.
     * @return array<string,mixed> Published current.json manifest.
     */
    public function publish(callable $generate): array
    {
        $this->artifacts->ensureDirectory($this->dataDir);
        $generationsDir = $this->dataDir . '/generations';
        $this->artifacts->ensureDirectory($generationsDir);

        $lockPath = $this->dataDir . '/.generate-site-' . $this->siteId . '.lock';
        $lock = fopen($lockPath, 'c');
        if ($lock === false) {
            throw new RuntimeException('Unable to open the precompute generation lock.');
        }
        if (!flock($lock, LOCK_EX | LOCK_NB)) {
            fclose($lock);
            throw new RuntimeException(sprintf(
                'A dashboard generation is already running for site %d.',
                $this->siteId
            ));
        }

        $generationId = $this->generationId();
        $stagingDir = $generationsDir . '/.staging-' . $generationId;
        $publishedDir = $generationsDir . '/' . $generationId;

        try {
            $this->artifacts->ensureDirectory($stagingDir);
            $stats = $generate($stagingDir);
            $sourceCounts = is_array($stats['sourceCounts'] ?? null) ? $stats['sourceCounts'] : [];
            if (!is_int($sourceCounts['items'] ?? null) || $sourceCounts['items'] < 1) {
                throw new RuntimeException('Snapshot source counts must report at least one scoped item.');
            }
            $artifactCounts = $this->validate($stagingDir);

            if (!rename($stagingDir, $publishedDir)) {
                throw new RuntimeException('Unable to promote the validated snapshot generation.');
            }

            $manifest = [
                'schemaVersion' => self::SCHEMA_VERSION,
                'generationId' => $generationId,
                'basePath' => 'generations/' . $generationId,
                'moduleVersion' => $this->moduleVersion,
                'scope' => [
                    'type' => 'canonical-site',
                    'siteId' => $this->siteId,
                    'itemCount' => $sourceCounts['items'],
                ],
                'sourceCounts' => $sourceCounts,
                'artifactCounts' => $artifactCounts,
                'createdAt' => gmdate('Y-m-d\TH:i:s\Z'),
                'warnings' => array_values(is_array($stats['warnings'] ?? null) ? $stats['warnings'] : []),
            ];
            // Direct legacy paths bypass the manifest and may contain records
            // that are now private or out of scope. Remove only known generated
            // roots; static geo/ and wordclouds/ inputs are deliberately kept.
            $this->removeLegacyOutputs();
            $this->artifacts->write($this->dataDir . '/current.json', $manifest);
            $this->prune($generationsDir, $generationId);
            return $manifest;
        } catch (\Throwable $e) {
            if (is_dir($stagingDir)) {
                $this->removeTree($stagingDir, $generationsDir, '.staging-');
            }
            throw $e;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /** @return array{total:int,groups:array<string,int>} */
    private function validate(string $stagingDir): array
    {
        $required = [
            'item-dashboards/projects-index.json',
            'item-dashboards/collection-overview.json',
            'network-explorer.json',
        ];
        foreach ($required as $relativePath) {
            if (!is_file($stagingDir . '/' . $relativePath)) {
                throw new RuntimeException('Required snapshot artifact is missing: ' . $relativePath);
            }
        }

        $total = 0;
        $groups = [];
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($stagingDir, FilesystemIterator::SKIP_DOTS)
        );
        foreach ($iterator as $file) {
            if (!$file->isFile()) {
                continue;
            }
            $relative = str_replace('\\', '/', substr($file->getPathname(), strlen($stagingDir) + 1));
            if (!str_ends_with($relative, '.json')) {
                throw new RuntimeException('Unexpected non-JSON snapshot artifact: ' . $relative);
            }
            $raw = file_get_contents($file->getPathname());
            if ($raw === false) {
                throw new RuntimeException('Unable to read staged artifact: ' . $relative);
            }
            $payload = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            $this->validateArtifact($relative, $payload, str_starts_with(ltrim($raw), '{'));
            $group = str_contains($relative, '/') ? strstr($relative, '/', true) : 'root';
            $groups[$group] = ($groups[$group] ?? 0) + 1;
            $total++;
        }
        if ($total === 0) {
            throw new RuntimeException('Snapshot generation produced no JSON artifacts.');
        }
        ksort($groups, SORT_STRING);
        return ['total' => $total, 'groups' => $groups];
    }

    private function validateArtifact(string $relative, mixed $payload, bool $isObject): void
    {
        if (!is_array($payload)) {
            throw new RuntimeException('Snapshot artifact must contain a JSON object or array: ' . $relative);
        }
        $parts = explode('/', $relative);
        $group = count($parts) > 1 ? $parts[0] : 'root';
        $file = end($parts);
        $allowed = [
            'item-dashboards', 'communities', 'knowledge-graphs',
            'photo-galleries', 'featured-collections', 'item-set-dashboards',
            'root',
        ];
        if (!in_array($group, $allowed, true)
            || ($group === 'root' && $relative !== 'network-explorer.json')) {
            throw new RuntimeException('Snapshot artifact has no registered schema: ' . $relative);
        }

        if ($group === 'item-dashboards' && str_ends_with((string) $file, '-index.json')) {
            if ($isObject || !array_is_list($payload)) {
                throw new RuntimeException('Dashboard index must be a JSON array: ' . $relative);
            }
            foreach ($payload as $entry) {
                if (!is_array($entry) || !is_int($entry['id'] ?? null)
                    || !is_string($entry['name'] ?? null) || $entry['name'] === '') {
                    throw new RuntimeException('Dashboard index has an invalid entry: ' . $relative);
                }
            }
            return;
        }

        // Section scatter points merged across sections — the one item-dashboards
        // artifact that is a list rather than a dashboard object.
        if ($group === 'item-dashboards' && $file === 'beeswarm-all-sections.json') {
            if ($isObject || !array_is_list($payload) || !$payload) {
                throw new RuntimeException('Beeswarm artifact must be a non-empty JSON array: ' . $relative);
            }
            foreach ($payload as $point) {
                if (!is_array($point)
                    || !is_string($point['category'] ?? null) || $point['category'] === ''
                    || !is_string($point['label'] ?? null) || $point['label'] === ''
                    || !is_int($point['value'] ?? null)
                    || !is_int($point['size'] ?? null)
                    || !is_int($point['itemId'] ?? null)) {
                    throw new RuntimeException('Beeswarm artifact has an invalid point: ' . $relative);
                }
            }
            return;
        }

        if ($group === 'item-dashboards') {
            if (!$isObject || !$payload) {
                throw new RuntimeException('Dashboard artifact must be a non-empty JSON object: ' . $relative);
            }
            if ($file === 'collection-overview.json'
                && (!is_int($payload['totalItems'] ?? null) || $payload['totalItems'] < 0)) {
                throw new RuntimeException('Collection overview has no valid totalItems: ' . $relative);
            }
            return;
        }

        if ($group === 'knowledge-graphs' || $group === 'communities') {
            if (!$isObject || !is_array($payload['nodes'] ?? null)
                || !is_array($payload['edges'] ?? null)) {
                throw new RuntimeException('Graph artifact must contain nodes and edges arrays: ' . $relative);
            }
            return;
        }

        if ($group === 'photo-galleries') {
            if (!$isObject || !is_int($payload['total'] ?? null)
                || $payload['total'] < 0 || !is_array($payload['photos'] ?? null)
                || !array_is_list($payload['photos'])) {
                throw new RuntimeException('Photo gallery has an invalid total or photos list: ' . $relative);
            }
            return;
        }

        if ($group === 'item-set-dashboards') {
            if (!$isObject || !is_int($payload['totalItems'] ?? null) || $payload['totalItems'] < 1) {
                throw new RuntimeException('Item-set dashboard has no valid totalItems: ' . $relative);
            }
            return;
        }

        // Keyed by slug, so a populated index is an object; an index with no
        // qualifying collection is an empty PHP array and encodes as [].
        if ($group === 'featured-collections' && !$isObject && $payload !== []) {
            throw new RuntimeException('Featured collection index must be a JSON object: ' . $relative);
        }
        // network-explorer.json may intentionally be [] when no graph qualifies.
    }

    private function prune(string $generationsDir, string $currentId): void
    {
        $generations = [];
        foreach (new FilesystemIterator($generationsDir, FilesystemIterator::SKIP_DOTS) as $entry) {
            if (!$entry->isDir() || str_starts_with($entry->getFilename(), '.staging-')) {
                continue;
            }
            $generations[] = ['id' => $entry->getFilename(), 'mtime' => $entry->getMTime()];
        }
        usort($generations, static function (array $a, array $b) use ($currentId): int {
            if ($a['id'] === $currentId) return -1;
            if ($b['id'] === $currentId) return 1;
            return ($b['mtime'] <=> $a['mtime']) ?: strcmp($b['id'], $a['id']);
        });
        foreach (array_slice($generations, self::RETAINED_GENERATIONS) as $generation) {
            $this->removeTree($generationsDir . '/' . $generation['id'], $generationsDir);
        }
    }

    private function removeLegacyOutputs(): void
    {
        foreach ([
            'item-dashboards',
            'communities',
            'knowledge-graphs',
            'photo-galleries',
            'featured-collections',
            'item-set-dashboards',
        ] as $directory) {
            $path = $this->dataDir . '/' . $directory;
            if (is_dir($path)) $this->removeTree($path, $this->dataDir);
        }
        $rootArtifact = $this->dataDir . '/network-explorer.json';
        if (is_file($rootArtifact)) {
            $resolvedDataDir = realpath($this->dataDir);
            $resolvedArtifact = realpath($rootArtifact);
            if ($resolvedDataDir === false || $resolvedArtifact === false
                || dirname($resolvedArtifact) !== $resolvedDataDir || !unlink($resolvedArtifact)) {
                throw new RuntimeException('Unable to remove the legacy network explorer artifact.');
            }
        }
    }

    private function removeTree(string $path, string $parent, ?string $requiredPrefix = null): void
    {
        $resolvedParent = realpath($parent);
        $resolvedPath = realpath($path);
        if ($resolvedParent === false || $resolvedPath === false
            || !str_starts_with($resolvedPath . DIRECTORY_SEPARATOR, $resolvedParent . DIRECTORY_SEPARATOR)
            || ($requiredPrefix !== null && !str_starts_with(basename($resolvedPath), $requiredPrefix))) {
            throw new RuntimeException('Refusing to remove an unsafe snapshot path.');
        }
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($resolvedPath, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($iterator as $entry) {
            $ok = $entry->isDir() ? rmdir($entry->getPathname()) : unlink($entry->getPathname());
            if (!$ok) {
                throw new RuntimeException('Unable to prune snapshot path: ' . $entry->getPathname());
            }
        }
        if (!rmdir($resolvedPath)) {
            throw new RuntimeException('Unable to prune snapshot generation: ' . $resolvedPath);
        }
    }

    private function generationId(): string
    {
        return gmdate('Ymd\THis\Z') . '-' . bin2hex(random_bytes(6));
    }
}
