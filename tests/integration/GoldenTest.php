<?php
declare(strict_types=1);
/**
 * Golden-file regression test for the complete precompute output.
 *
 *   php tests/integration/GoldenTest.php /path/to/omeka-s
 *   UPDATE_GOLDEN=1 php tests/integration/GoldenTest.php /path/to/omeka-s
 *
 * Builds the deterministic synthetic corpus of fixtures/GoldenCorpus.php in an
 * in-memory SQLite database (the DataLoader-facing slice of Omeka's schema, as
 * in DatabaseTest.php), runs the real Runner through SnapshotPublisher, and
 * compares every JSON artifact of the published generation with the committed
 * expectation under tests/golden/. It exists so refactors of src/Precompute
 * (aggregator traits, the *DashboardGenerator classes, ...) can prove they
 * change nothing they did not mean to change.
 *
 * Canonical form (what is compared and committed): objects have their keys
 * sorted recursively (lists keep their order — order is output), floats are
 * rounded to 6 decimals, and the result is printed with 2-space indents,
 * unescaped slashes and Unicode, and each leaf record (a list or object of
 * scalars) on one line. `{}` and `[]` stay distinct.
 *
 * Golden layout: tests/golden/<artifact path> mirrors the generation tree,
 * except
 *   - AGGREGATED_GROUPS (item-contexts): one tests/golden/<group>.json object
 *     mapping file name => artifact, instead of hundreds of tiny files;
 *   - DIGEST_GROUPS (knowledge-graphs): tests/golden/<group>.sha256.json pins
 *     every artifact by the sha256 of its canonical form, and a fixed sample
 *     is also committed in full under tests/golden/<group>/ for readable diffs
 *     (committing all ~360 graphs would be >5 MB).
 * Mismatches are always reported per artifact path.
 *
 * Nothing in the artifacts depends on the wall clock: What's New counts back
 * from the newest item `created` date, not from today; the only volatile
 * inputs are the publication revision (pinned by seeding revision.json, since
 * scoped inputs are echoed into embeddings/*.json) and the generation id /
 * createdAt, which live in current.json — not an artifact, so never compared.
 *
 * Also checked: two cold runs in fresh stores are byte-identical (catches a
 * nondeterministic builder), a warm run that reuses the ForceAtlas2 layout
 * cache matches the cold output, and no artifact contains the PRIVATE marker
 * carried by every non-public record of the corpus.
 *
 * On mismatch it prints the differing paths and a short line diff, then exits
 * 1. Set GOLDEN_ACTUAL_DIR=<dir> to also write every actual canonical artifact
 * there for inspection (in Docker, e.g. -e GOLDEN_ACTUAL_DIR=/app/.cache/golden-actual;
 * /.cache/ is git-ignored). UPDATE_GOLDEN=1 rewrites tests/golden/ (deleting
 * stale files) — review the resulting git diff like any other output change.
 *
 * Run without a local PHP (from PowerShell or node, not Git Bash, which
 * mangles the -v paths):
 *   docker run --rm -v "<module>:/app" -v "<omeka-s core>:/omeka-s:ro" -w /app \
 *     php:8.5-cli php tests/integration/GoldenTest.php /omeka-s
 */

require rtrim($argv[1] ?? (string) getenv('OMEKA_ROOT'), '/\\') . '/vendor/autoload.php';
require dirname(__DIR__) . '/bootstrap.php';
require __DIR__ . '/fixtures/GoldenCorpus.php';

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\DriverManager;
use DreVisualizations\Precompute\AmiraProfile;
use DreVisualizations\Precompute\Runner;
use DreVisualizations\Precompute\ScopedInput;
use DreVisualizations\Precompute\SnapshotPublisher;
use DreVisualizations\Tests\Integration\GoldenCorpus;

// strtotime()/date() in What's New use the default zone; pin it.
date_default_timezone_set('UTC');
// Shortest round-trip float encoding (PHP's default, but make it explicit).
ini_set('serialize_precision', '-1');

const GOLDEN_REVISION = 'golden-revision-0001';
const GOLDEN_PROFILE_SCOPE = 'golden-profile';
/** Per-item artifact groups stored as one aggregated golden file each. */
const AGGREGATED_GROUPS = ['item-contexts'];
/**
 * Per-item groups too large to commit in full (360 knowledge graphs are ~5 MB
 * even as compact JSON): every artifact is pinned by the sha256 of its
 * canonical form, and these samples — one or more per kind of centre item —
 * are also committed in full so a change can be read as a diff.
 */
const DIGEST_GROUPS = [
    'knowledge-graphs' => [
        '200.json',  // research section
        '300.json',  // project (reverse isPartOf items)
        '304.json',  // project in two sections
        '400.json',  // person
        '424.json',  // person whose name is private ("Item 424")
        '501.json',  // organisation
        '600.json',  // location
        '700.json',  // LCSH subject
        '715.json',  // free tag
        '805.json',  // resource type
        '840.json',  // podcast series
        '1000.json', // research item (duplicate subject statements collapse)
        '1001.json', // research item with a related item
        '1020.json', // the densest research item
        '2100.json', // publication (linked + literal authors)
        '2200.json', // podcast episode
        '2300.json', // YouTube video
        '2400.json', // photograph
        '2500.json', // ILAM article
        '2600.json', // gramophone side (producer)
    ],
];
const DIFF_LINES = 20;
const MAX_REPORTED_PATHS = 15;

$module = dirname(__DIR__, 2);
$goldenDir = $module . '/tests/golden';
$update = getenv('UPDATE_GOLDEN') === '1';

function verify(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo "ok: $message\n";
}

function removeTree(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $file) {
        $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname());
    }
    rmdir($dir);
}

/** @return array<string,string> relative path (forward slashes) => file contents */
function readTree(string $dir): array
{
    $out = [];
    if (!is_dir($dir)) {
        return $out;
    }
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)) as $file) {
        if ($file->isFile()) {
            $relative = str_replace('\\', '/', substr($file->getPathname(), strlen($dir) + 1));
            $out[$relative] = (string) file_get_contents($file->getPathname());
        }
    }
    ksort($out, SORT_NATURAL);
    return $out;
}

// ── Canonical form ─────────────────────────────────────────────────────────

/** Recursively sort object keys (not list order) and round floats. */
function canonicalValue(mixed $value): mixed
{
    if ($value instanceof stdClass) {
        $fields = get_object_vars($value);
        ksort($fields, SORT_STRING);
        foreach ($fields as $key => $field) {
            $fields[$key] = canonicalValue($field);
        }
        return (object) $fields;
    }
    if (is_array($value)) {
        return array_map('canonicalValue', $value);
    }
    if (is_float($value)) {
        $value = round($value, 6);
        return $value == 0.0 ? 0.0 : $value; // fold -0.0
    }
    return $value;
}

/**
 * Pretty-print with 2-space indents, but keep "leaf" containers — a list or
 * object whose members are all scalars, e.g. one chart row or one graph node —
 * on a single line: one record per line keeps diffs readable and the golden
 * tree a third of JSON_PRETTY_PRINT's size.
 */
function encodeCanonical(mixed $value): string
{
    return encodeNode($value, '') . "\n";
}

function encodeNode(mixed $value, string $indent): string
{
    $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR;
    $isObject = $value instanceof stdClass;
    if (!$isObject && !is_array($value)) {
        return json_encode($value, $flags);
    }
    $members = $isObject ? get_object_vars($value) : $value;
    $leaf = true;
    foreach ($members as $member) {
        if (is_array($member) || $member instanceof stdClass) {
            $leaf = false;
            break;
        }
    }
    // The root is always expanded, so a flat map (the sha256 manifest) still
    // diffs one entry per line.
    if ($leaf && ($indent !== '' || !$members)) {
        return json_encode($value, $flags);
    }
    $inner = $indent . '  ';
    $lines = [];
    foreach ($members as $key => $member) {
        $lines[] = $inner . ($isObject ? json_encode((string) $key, $flags) . ': ' : '') . encodeNode($member, $inner);
    }
    return ($isObject ? '{' : '[') . "\n" . implode(",\n", $lines) . "\n" . $indent . ($isObject ? '}' : ']');
}

/** Decode JSON keeping objects as stdClass so `{}` and `[]` survive the round trip. */
function canonical(string $json): string
{
    return encodeCanonical(canonicalValue(json_decode($json, false, 512, JSON_THROW_ON_ERROR)));
}

/** The per-item group ('item-contexts', ...) of a top-level-in-group artifact path. */
function groupOf(string $path): ?string
{
    return substr_count($path, '/') === 1 ? strstr($path, '/', true) : null;
}

function digest(string $canonical): string
{
    return hash('sha256', $canonical);
}

/**
 * Map canonical artifacts to golden files:
 *   - AGGREGATED_GROUPS: one `<group>.json` object, file name => artifact;
 *   - DIGEST_GROUPS: one `<group>.sha256.json` object, file name => sha256 of
 *     the canonical artifact, plus the full artifact for the listed samples;
 *   - everything else: the canonical artifact at its own path.
 *
 * @param array<string,string> $artifacts
 * @return array<string,string>
 */
function packGolden(array $artifacts): array
{
    $files = $aggregated = $digests = [];
    foreach ($artifacts as $path => $content) {
        $group = groupOf($path);
        $name = $group === null ? $path : substr($path, strlen($group) + 1);
        if (in_array($group, AGGREGATED_GROUPS, true)) {
            $aggregated[$group][$name] = json_decode($content, false, 512, JSON_THROW_ON_ERROR);
        } elseif ($group !== null && isset(DIGEST_GROUPS[$group])) {
            $digests[$group][$name] = digest($content);
            if (in_array($name, DIGEST_GROUPS[$group], true)) {
                $files[$path] = $content;
            }
        } else {
            $files[$path] = $content;
        }
    }
    foreach ($aggregated as $group => $members) {
        ksort($members, SORT_NATURAL);
        $files[$group . '.json'] = encodeCanonical((object) $members);
    }
    foreach ($digests as $group => $hashes) {
        ksort($hashes, SORT_NATURAL);
        $files[$group . '.sha256.json'] = encodeCanonical((object) $hashes);
    }
    ksort($files, SORT_NATURAL);
    return $files;
}

/**
 * Inverse of packGolden(): golden files back to the expectation per artifact,
 * as [full canonical contents by path, sha256 digests by path].
 *
 * @param array<string,string> $files
 * @return array{0:array<string,string>,1:array<string,string>}
 */
function unpackGolden(array $files): array
{
    $full = $digests = [];
    foreach ($files as $path => $content) {
        $content = str_replace("\r\n", "\n", $content); // Windows checkouts (text=auto)
        if (in_array(substr($path, 0, -strlen('.json')), AGGREGATED_GROUPS, true)) {
            $group = substr($path, 0, -strlen('.json'));
            foreach (get_object_vars(json_decode($content, false, 512, JSON_THROW_ON_ERROR)) as $name => $member) {
                $full[$group . '/' . $name] = encodeCanonical(canonicalValue($member));
            }
        } elseif (isset(DIGEST_GROUPS[substr($path, 0, -strlen('.sha256.json'))]) && str_ends_with($path, '.sha256.json')) {
            $group = substr($path, 0, -strlen('.sha256.json'));
            foreach (get_object_vars(json_decode($content, false, 512, JSON_THROW_ON_ERROR)) as $name => $hash) {
                $digests[$group . '/' . $name] = (string) $hash;
            }
        } else {
            $full[$path] = $content;
        }
    }
    ksort($full, SORT_NATURAL);
    ksort($digests, SORT_NATURAL);
    return [$full, $digests];
}

/** A short unified-ish diff: the changed middle between common prefix and suffix. */
function shortDiff(string $expected, string $actual): string
{
    $a = explode("\n", rtrim($expected, "\n"));
    $b = explode("\n", rtrim($actual, "\n"));
    $prefix = 0;
    while ($prefix < count($a) && $prefix < count($b) && $a[$prefix] === $b[$prefix]) {
        $prefix++;
    }
    $suffix = 0;
    while ($suffix < count($a) - $prefix && $suffix < count($b) - $prefix
        && $a[count($a) - 1 - $suffix] === $b[count($b) - 1 - $suffix]) {
        $suffix++;
    }
    $lines = [sprintf('    @@ golden line %d (%d removed, %d added) @@', $prefix + 1, count($a) - $prefix - $suffix, count($b) - $prefix - $suffix)];
    for ($i = max(0, $prefix - 2); $i < $prefix; $i++) {
        $lines[] = '      ' . $a[$i];
    }
    $changes = [];
    for ($i = $prefix; $i < count($a) - $suffix; $i++) {
        $changes[] = '    - ' . $a[$i];
    }
    for ($i = $prefix; $i < count($b) - $suffix; $i++) {
        $changes[] = '    + ' . $b[$i];
    }
    $shown = array_slice($changes, 0, DIFF_LINES);
    if (count($changes) > DIFF_LINES) {
        $shown[] = sprintf('    ... %d more changed lines', count($changes) - DIFF_LINES);
    }
    return implode("\n", array_merge($lines, $shown));
}

// ── Generation ─────────────────────────────────────────────────────────────

/**
 * Offline inputs the Runner reads through ScopedInput: a lemmatised YouTube
 * word cloud (so that corpus skips the PHP tokeniser the other two exercise)
 * and an embeddings map, which is copied through to embeddings/map.json.
 */
function writeScopedInputs(string $dir): array
{
    $scope = ['siteId' => GoldenCorpus::SITE_ID, 'revision' => GOLDEN_REVISION, 'profile' => GOLDEN_PROFILE_SCOPE];
    $inputs = [
        'wordclouds/youtube.php' => [
            'corpus' => 'youtube', 'generated_utc' => '2026-10-01T00:00:00Z', 'scope' => $scope,
            'languages' => ['en', 'fr'],
            'byLang' => [
                'en' => [['name' => 'knowledge', 'value' => 14], ['name' => 'archive', 'value' => 9], ['name' => 'sound', 'value' => 4]],
                'fr' => [['name' => 'savoir', 'value' => 5], ['name' => 'archive', 'value' => 3]],
            ],
        ],
        'embeddings/map.php' => [
            'generated_utc' => '2026-10-01T00:00:00Z', 'scope' => $scope,
            'corpora' => ['publications', 'research-items'],
            'points' => [[2100, 0.125, -0.5, 0], [2101, -0.75, 0.3333333, 0], [1000, 0.0, 0.9999999, 1]],
        ],
    ];
    foreach ($inputs as $path => $payload) {
        @mkdir(dirname($dir . '/' . $path), 0775, true);
        file_put_contents($dir . '/' . $path, ScopedInput::PREFIX . json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }
    return $scope;
}

/**
 * Run the Runner through SnapshotPublisher into $root and return the published
 * generation's artifacts, canonicalised, keyed by relative path.
 *
 * @return array<string,string>
 */
function generate(Connection $conn, AmiraProfile $profile, string $module, string $root, string $inputs, array $scope): array
{
    // Pin the publication revision (scoped inputs must match it, and it is
    // echoed into embeddings/*.json). Kept across warm runs of one store.
    if (!is_file($root . '/revision.json')) {
        @mkdir($root, 0775, true);
        file_put_contents($root . '/revision.json', json_encode(['revision' => GOLDEN_REVISION]));
    }
    $manifest = (new SnapshotPublisher($root, GoldenCorpus::SITE_ID, 'golden'))->publish(
        static function (string $dir) use ($conn, $profile, $module, $inputs, $scope): array {
            return (new Runner(
                $conn, GoldenCorpus::SITE_ID, $profile,
                $dir . '/item-dashboards', $dir . '/communities',
                $module . '/asset/data/geo/countries.geojson',
                $dir . '/knowledge-graphs', $dir . '/photo-galleries', $dir . '/featured-collections',
                $dir . '/item-set-dashboards', $inputs . '/wordclouds',
                null, null, null, $scope,
            ))->run();
        }
    );
    $raw = readTree($root . '/' . $manifest['basePath']);
    if (!$raw) {
        throw new RuntimeException('The published generation is empty.');
    }
    $artifacts = [];
    foreach ($raw as $path => $json) {
        if (str_contains($json, 'PRIVATE')) {
            throw new RuntimeException('Private marker leaked into ' . $path);
        }
        $artifacts[$path] = canonical($json);
    }
    return $artifacts;
}

/** @return list<string> paths whose content differs, or that exist on one side only */
function differingPaths(array $expected, array $actual): array
{
    $paths = array_keys($expected + $actual);
    sort($paths, SORT_NATURAL);
    return array_values(array_filter($paths, static fn (string $p): bool => ($expected[$p] ?? null) !== ($actual[$p] ?? null)));
}

// ── Main ───────────────────────────────────────────────────────────────────

$conn = DriverManager::getConnection(['driver' => 'pdo_sqlite', 'memory' => true]);
$counts = GoldenCorpus::build($conn);
ksort($counts);
echo 'Corpus: ' . array_sum($counts) . ' items (' . implode(', ', array_map(static fn ($k, $v) => "$k $v", array_keys($counts), $counts)) . ")\n";

$profile = AmiraProfile::fromFile($module . '/config/amira-profile.json');
$tmp = sys_get_temp_dir() . '/dre-golden-' . bin2hex(random_bytes(6));
$exit = 0;
try {
    $inputs = $tmp . '/inputs';
    $scope = writeScopedInputs($inputs);

    // 1. Cold run in a fresh store: the output under test.
    $actual = generate($conn, $profile, $module, $tmp . '/cold-a', $inputs, $scope);
    $groups = [];
    foreach (array_keys($actual) as $path) {
        $group = str_contains($path, '/') ? strstr($path, '/', true) : '(root)';
        $groups[$group] = ($groups[$group] ?? 0) + 1;
    }
    ksort($groups);
    echo 'Artifacts: ' . count($actual) . ' (' . implode(', ', array_map(static fn ($k, $v) => "$k $v", array_keys($groups), $groups)) . ")\n";
    verify(true, 'No artifact contains the PRIVATE marker');
    verify(count(glob($tmp . '/cold-a/layout-cache/*.json') ?: []) > 0, 'The entity graph computed (and cached) a ForceAtlas2 layout');

    // 2. Determinism: a second cold run in another fresh store is identical.
    $second = generate($conn, $profile, $module, $tmp . '/cold-b', $inputs, $scope);
    $drift = differingPaths($actual, $second);
    verify($drift === [], 'Two cold runs are byte-identical' . ($drift ? ' — differing: ' . implode(', ', array_slice($drift, 0, MAX_REPORTED_PATHS)) : ''));

    // 3. A warm run reusing the layout cache matches the cold output.
    $warm = generate($conn, $profile, $module, $tmp . '/cold-b', $inputs, $scope);
    $drift = differingPaths($actual, $warm);
    verify($drift === [], 'A warm run (cached layout) matches the cold run' . ($drift ? ' — differing: ' . implode(', ', array_slice($drift, 0, MAX_REPORTED_PATHS)) : ''));

    // 4. The corpus keeps exercising every generator: these artifacts must exist
    //    whatever the golden files say, so UPDATE_GOLDEN cannot silently bless a
    //    corpus or generator change that drops one.
    $required = [
        'network-explorer.json', 'communities/entity-graph.json', 'featured-collections/index.json',
        'embeddings/map.json',
        'item-dashboards/collection-overview.json', 'item-dashboards/publications.json',
        'item-dashboards/podcasts.json', 'item-dashboards/youtube.json',
        'item-dashboards/spatial-exploration.json', 'item-dashboards/whats-new.json',
        'item-dashboards/beeswarm-all-sections.json', 'item-dashboards/projects-index.json',
        'item-dashboards/people-index.json', 'item-dashboards/institutions-index.json',
        'item-dashboards/subjects-index.json', 'item-dashboards/languages-index.json',
        'item-dashboards/genres-index.json',
        // Category overviews (profile overviewItems).
        'item-dashboards/22198.json', 'item-dashboards/2039.json', 'item-dashboards/22203.json',
        'item-dashboards/22479.json', 'item-dashboards/22200.json', 'item-dashboards/22202.json',
        'item-dashboards/22536.json', 'item-dashboards/3167.json', 'item-dashboards/22199.json',
        'item-dashboards/3346.json',
        // Entity dashboards: section, project, person, organisation, location,
        // subject, resource type, language, genre.
        'item-dashboards/201.json', 'item-dashboards/300.json', 'item-dashboards/400.json',
        'item-dashboards/501.json', 'item-dashboards/600.json', 'item-dashboards/700.json',
        'item-dashboards/800.json', 'item-dashboards/810.json', 'item-dashboards/820.json',
        // Galleries: plain item set, ILAM issues, the Museu Afro-Digital split.
        'photo-galleries/50000.json', 'photo-galleries/collection-international-library-of-african-music-ilam.json',
        'photo-galleries/collection-memorias-perifericas-capoeira-angola-salvador.json',
        'photo-galleries/collection-trabalhadores-na-da-bahia.json',
        'photo-galleries/collection-orixas-fundacao-gregorio-de-mattos.json',
        'item-set-dashboards/29918.json', 'item-contexts/1000.json', 'knowledge-graphs/1000.json',
    ];
    $missing = array_values(array_diff($required, array_keys($actual)));
    verify($missing === [], 'Every generator produced its artifacts' . ($missing ? ' — missing: ' . implode(', ', $missing) : ''));
    $decode = static fn (string $path): array => json_decode($actual[$path], true, 512, JSON_THROW_ON_ERROR);
    $overview = $decode('item-dashboards/collection-overview.json');
    $absent = array_values(array_diff(['clusterPartners', 'sectionUniversity', 'sectionsBar', 'boxplot', 'choropleth', 'geoFlows', 'timeChord', 'sankey', 'sunburst', 'chord', 'heatmap', 'stats'], array_keys($overview)));
    verify($absent === [], 'Collection overview carries every curated chart' . ($absent ? ' — missing: ' . implode(', ', $absent) : ''));
    $explorer = array_keys($decode('network-explorer.json')); // canonical: keys sorted
    verify($explorer === ['affiliations', 'collaboration', 'contributors', 'institutions'], 'Network explorer carries all four graphs (has: ' . implode(', ', $explorer) . ')');
    $publications = $decode('item-dashboards/publications.json');
    verify(isset($publications['coAuthorNetwork'], $publications['topAuthors'], $publications['topVenues'], $publications['funders'], $publications['abstractWordcloud'], $publications['locations']), 'Publications dashboard carries its bibliography charts');

    // 5. Compare with (or rewrite) the golden files.
    $packed = packGolden($actual);
    if ($update) {
        $stale = array_diff(array_keys(readTree($goldenDir)), array_keys($packed));
        foreach ($stale as $path) {
            unlink($goldenDir . '/' . $path);
        }
        // Drop directories emptied by the stale-file sweep.
        if (is_dir($goldenDir)) {
            foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($goldenDir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $entry) {
                if ($entry->isDir() && !(new FilesystemIterator($entry->getPathname()))->valid()) {
                    rmdir($entry->getPathname());
                }
            }
        }
        $bytes = 0;
        foreach ($packed as $path => $content) {
            @mkdir(dirname($goldenDir . '/' . $path), 0775, true);
            file_put_contents($goldenDir . '/' . $path, $content);
            $bytes += strlen($content);
        }
        echo sprintf("Golden files rewritten: %d files, %.1f KiB, %d stale removed.\n", count($packed), $bytes / 1024, count($stale));
    } else {
        [$golden, $digests] = unpackGolden(readTree($goldenDir));
        $expected = array_keys($golden + $digests);
        $missingGolden = array_values(array_diff(array_keys($actual), $expected));
        $staleGolden = array_values(array_diff($expected, array_keys($actual)));
        sort($staleGolden, SORT_NATURAL);
        // path => true when the committed full content differs (a diff can be
        // shown), false when only the sha256 manifest entry disagrees.
        $changed = [];
        foreach ($actual as $path => $content) {
            if (isset($golden[$path]) && $golden[$path] !== $content) {
                $changed[$path] = true;
            } elseif (isset($digests[$path]) && $digests[$path] !== digest($content)) {
                $changed[$path] = false;
            }
        }
        // Readable diffs first: content changes before digest-only ones.
        uksort($changed, static fn ($a, $b) => ($changed[$b] <=> $changed[$a]) ?: strnatcmp($a, $b));
        $diffable = array_keys(array_filter($changed));
        $changed = array_keys($changed);
        if ($missingGolden || $staleGolden || $changed) {
            echo "FAIL: precompute output differs from tests/golden/\n";
            foreach (['Artifacts without a golden file' => $missingGolden, 'Golden files no artifact matches' => $staleGolden, 'Changed artifacts' => $changed] as $label => $paths) {
                if ($paths) {
                    echo "  $label (" . count($paths) . "):\n";
                    foreach (array_slice($paths, 0, MAX_REPORTED_PATHS) as $path) {
                        $digestOnly = $label === 'Changed artifacts' && !in_array($path, $diffable, true);
                        echo "    $path" . ($digestOnly ? ' (sha256 differs; full content: GOLDEN_ACTUAL_DIR)' : '') . "\n";
                    }
                    if (count($paths) > MAX_REPORTED_PATHS) {
                        echo '    ... ' . (count($paths) - MAX_REPORTED_PATHS) . " more\n";
                    }
                }
            }
            foreach (array_slice($diffable, 0, 3) as $path) {
                echo "  --- golden/$path\n  +++ actual/$path\n" . shortDiff($golden[$path], $actual[$path]) . "\n";
            }
            $actualDir = getenv('GOLDEN_ACTUAL_DIR');
            if (is_string($actualDir) && $actualDir !== '') {
                // Every artifact in full (digest groups included), for inspection.
                foreach ($actual as $path => $content) {
                    @mkdir(dirname($actualDir . '/' . $path), 0775, true);
                    file_put_contents($actualDir . '/' . $path, $content);
                }
                echo "  Actual canonical output written to $actualDir\n";
            }
            echo "  If the change is intended, regenerate with UPDATE_GOLDEN=1 and review the diff.\n";
            $exit = 1;
        } else {
            verify(true, 'All ' . count($actual) . ' artifacts match tests/golden/ (' . count($packed) . ' golden files)');
        }
    }
} finally {
    removeTree($tmp);
}
if ($exit === 0) {
    echo "Golden integration passed.\n";
}
exit($exit);
