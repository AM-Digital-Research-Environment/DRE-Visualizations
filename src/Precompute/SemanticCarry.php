<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

/**
 * Keeps the semantic map online between a privatising write and the next
 * build: the installed build, made for an earlier revision, is re-scoped to
 * the current one without the records hidden since (SnapshotStore::
 * hiddenSince()) and without anything that left the public corpus.
 *
 * Only what a visitor can read is removed: points, titles, neighbour lists,
 * examples. The remaining positions and neighbours were computed when the
 * hidden records were still public; a new build, which the module requests
 * straight away, replaces them.
 */
final class SemanticCarry
{
    public const FILES = ['map', 'similar', 'report'];

    /**
     * The directory to read the semantic inputs from: $installed itself when
     * its build matches $scope, a directory of carried copies when it can be
     * carried, or $installed unchanged (which the readers then ignore).
     *
     * @param callable(string):?array $hiddenSince revision => hidden resource ids, null when it cannot be carried
     * @param callable(int):bool $isPublic whether a record is in the current public corpus
     * @return array{dir:?string,state:string} state 'current', 'carried' or 'none'
     */
    public static function resolve(?string $installed, string $carriedDir, array $scope, callable $hiddenSince, callable $isPublic): array
    {
        if ($installed === null) return ['dir' => null, 'state' => 'none'];
        if (ScopedInput::read($installed . '/report.php', $scope) !== null) return ['dir' => $installed, 'state' => 'current'];

        $older = [];
        foreach (self::FILES as $name) {
            $older[$name] = self::readOtherRevision($installed . '/' . $name . '.php', $scope);
            if ($older[$name] === null) return ['dir' => $installed, 'state' => 'none'];
        }
        $revision = $older['report']['scope']['revision'];
        if ($older['map']['scope']['revision'] !== $revision || $older['similar']['scope']['revision'] !== $revision) {
            return ['dir' => $installed, 'state' => 'none'];
        }
        $hidden = $hiddenSince($revision);
        if ($hidden === null) return ['dir' => $installed, 'state' => 'none'];

        $hidden = array_flip($hidden);
        $keep = static fn (mixed $id): bool => is_numeric($id) && !isset($hidden[(int) $id]) && $isPublic((int) $id);
        $carried = [
            'map' => self::map($older['map'], $keep),
            'similar' => self::similar($older['similar'], $keep),
            'report' => self::report($older['report'], $keep),
        ];
        (new JsonArtifactWriter())->ensureDirectory($carriedDir);
        foreach ($carried as $name => $payload) {
            $payload['scope'] = $scope;
            $payload['carriedFrom'] = $revision;
            $raw = ScopedInput::PREFIX . json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $tmp = $carriedDir . '/.' . $name . '-' . bin2hex(random_bytes(6));
            if (file_put_contents($tmp, $raw) !== strlen($raw) || !rename($tmp, $carriedDir . '/' . $name . '.php')) {
                @unlink($tmp);
                throw new \RuntimeException('Unable to write the carried semantic inputs.');
            }
        }
        return ['dir' => $carriedDir, 'state' => 'carried'];
    }

    /** An input for $scope's site and profile but another revision; null otherwise. */
    public static function readOtherRevision(string $path, array $scope): ?array
    {
        if (!is_file($path)) return null;
        $raw = str_replace("\r\n", "\n", (string) file_get_contents($path));
        if (!str_starts_with($raw, ScopedInput::PREFIX)) return null;
        $data = json_decode(substr($raw, strlen(ScopedInput::PREFIX)), true);
        $built = is_array($data) && is_array($data['scope'] ?? null) ? $data['scope'] : null;
        if ($built === null || !is_string($built['revision'] ?? null) || $built['revision'] === ($scope['revision'] ?? null)) return null;
        foreach (['siteId', 'profile'] as $key) {
            if (!isset($scope[$key]) || ($built[$key] ?? null) !== $scope[$key]) return null;
        }
        return $data;
    }

    /** @param callable(mixed):bool $keep */
    private static function map(array $map, callable $keep): array
    {
        $items = array_values(array_filter(is_array($map['items'] ?? null) ? $map['items'] : [],
            static fn ($row): bool => is_array($row) && $keep($row['id'] ?? null)));
        $map['items'] = $items;
        if (is_array($map['types'] ?? null)) {
            $types = array_count_values(array_map(static fn (array $row): string => (string) ($row['type'] ?? ''), $items));
            ksort($types);
            $map['types'] = $types;
        }
        if (is_array($map['corpusLayouts'] ?? null)) {
            foreach ($map['corpusLayouts'] as $corpus => $rows) {
                $map['corpusLayouts'][$corpus] = array_values(array_filter(is_array($rows) ? $rows : [],
                    static fn ($row): bool => is_array($row) && $keep($row[0] ?? null)));
            }
        }
        return $map;
    }

    /** @param callable(mixed):bool $keep */
    private static function similar(array $similar, callable $keep): array
    {
        $catalog = [];
        foreach (is_array($similar['catalog'] ?? null) ? $similar['catalog'] : [] as $id => $entry) {
            if ($keep($id)) $catalog[(string) $id] = $entry;
        }
        $items = [];
        foreach (is_array($similar['items'] ?? null) ? $similar['items'] : [] as $id => $neighbours) {
            if (!$keep($id)) continue;
            $items[(string) $id] = array_values(array_filter(is_array($neighbours) ? $neighbours : [],
                static fn ($n): bool => is_array($n) && $keep($n['id'] ?? null)));
        }
        $similar['catalog'] = $catalog;
        $similar['items'] = $items;
        return $similar;
    }

    /** @param callable(mixed):bool $keep */
    private static function report(array $report, callable $keep): array
    {
        $examples = $report['recommendations']['crossLanguageExamples'] ?? null;
        if (is_array($examples)) {
            $report['recommendations']['crossLanguageExamples'] = array_values(array_filter($examples,
                static fn ($e): bool => is_array($e) && $keep($e['source'] ?? null) && $keep($e['target'] ?? null)));
        }
        return $report;
    }
}
