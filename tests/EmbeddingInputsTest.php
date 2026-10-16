<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

use DreVisualizations\Precompute\EmbeddingInputs;
use DreVisualizations\Precompute\ScopedInput;

$failures = 0;
function inputsCheck(bool $condition, string $message): void
{
    global $failures;
    if ($condition) {
        echo "ok: $message\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $message\n");
}

const INPUTS_API = 'https://api.github.com/repos/' . EmbeddingInputs::REPOSITORY . '/releases?per_page=100';
const INPUTS_DOWNLOADS = 'https://github.com/' . EmbeddingInputs::REPOSITORY . '/releases/download/';

function inputsEnvelope(string $revision, string $name): string
{
    return ScopedInput::PREFIX . json_encode(['scope' => ['siteId' => 1, 'revision' => $revision, 'profile' => 'p'], 'name' => $name]);
}

/** A release listing entry plus the downloads it points to. */
function inputsRelease(array &$web, string $tag, string $createdAt, string $revision, ?string $base = null): array
{
    $assets = [];
    foreach (['map', 'similar', 'report', 'source-state'] as $name) {
        $url = ($base ?? INPUTS_DOWNLOADS) . $tag . '/' . $name . ($name === 'source-state' ? '.json' : '.php');
        $web[$url] = $name === 'source-state' ? '{}' : inputsEnvelope($revision, $name . '@' . $tag);
        $assets[] = ['name' => basename($url), 'browser_download_url' => $url];
    }
    return ['tag_name' => $tag, 'draft' => false, 'created_at' => $createdAt, 'assets' => $assets];
}

$root = sys_get_temp_dir() . '/dre-embedding-inputs-' . bin2hex(random_bytes(4));
$web = [];
$clock = 1_000_000;
$fetch = static function (string $url) use (&$web): ?string {
    return $web[$url] ?? null;
};
$inputs = new EmbeddingInputs($root . '/embedding-inputs', $fetch, static function () use (&$clock): int {
    return $clock;
});
$scope = ['siteId' => 1, 'revision' => 'r1', 'profile' => 'p'];

// Listed newest-last on purpose: the newest is chosen by created_at.
$web[INPUTS_API] = json_encode([
    inputsRelease($web, 'semantic-inputs-7', '2026-10-15T00:00:00Z', 'r1'),
    inputsRelease($web, 'semantic-inputs-8', '2026-10-16T00:00:00Z', 'r1'),
    ['tag_name' => 'v2.39.0', 'draft' => false, 'created_at' => '2026-10-17T00:00:00Z', 'assets' => []],
]);
inputsCheck($inputs->currentDirectory() === null, 'nothing is installed before the first look');
inputsCheck($inputs->refresh($scope) === 'installed', 'the newest build for this revision is installed');
$dir = $inputs->currentDirectory();
inputsCheck($dir !== null && basename($dir) === 'semantic-inputs-8', 'the newest release wins whatever the listing order');
inputsCheck(ScopedInput::read($dir . '/similar.php', $scope)['name'] === 'similar@semantic-inputs-8', 'every file comes from that one build');
inputsCheck(!is_file($dir . '/source-state.php') && !is_file($dir . '/source-state.json'), 'only the three inputs are kept');
inputsCheck($inputs->status($scope)['matches'] === true, 'the status reports a build for the current revision');

inputsCheck($inputs->refresh($scope) === 'throttled', 'a second look within the interval is skipped');
$clock += EmbeddingInputs::CHECK_EVERY;
inputsCheck($inputs->refresh($scope) === 'current', 'the installed build is not downloaded again');

// A build for another revision (made before something became private) is never installed.
$web[INPUTS_API] = json_encode([inputsRelease($web, 'semantic-inputs-9', '2026-10-18T00:00:00Z', 'r0')]);
$clock += EmbeddingInputs::CHECK_EVERY;
inputsCheck($inputs->refresh($scope) === 'none', 'a build for another revision is left on GitHub');
inputsCheck(basename((string) $inputs->currentDirectory()) === 'semantic-inputs-8', 'the installed build stays');
$moved = ['siteId' => 1, 'revision' => 'r2', 'profile' => 'p'];
inputsCheck($inputs->status($moved)['matches'] === false, 'the status reports a build for an older revision');

// Assets must come from this repository's own release downloads.
$web[INPUTS_API] = json_encode([inputsRelease($web, 'semantic-inputs-10', '2026-10-19T00:00:00Z', 'r1', 'https://evil.example/')]);
$clock += EmbeddingInputs::CHECK_EVERY;
inputsCheck($inputs->refresh($scope) === 'none', 'assets hosted elsewhere are ignored');

// A failed download records the error and keeps the installed build.
$web[INPUTS_API] = json_encode([inputsRelease($web, 'semantic-inputs-11', '2026-10-20T00:00:00Z', 'r1')]);
unset($web[INPUTS_DOWNLOADS . 'semantic-inputs-11/similar.php']);
$clock += EmbeddingInputs::CHECK_EVERY;
inputsCheck($inputs->refresh($scope) === 'error', 'a failed download is an error');
$status = $inputs->status($scope);
inputsCheck(str_contains((string) $status['error'], 'similar.php') && $status['tag'] === 'semantic-inputs-8', 'the error is recorded and the build kept');
unset($web[INPUTS_API]);
$clock += EmbeddingInputs::CHECK_EVERY;
inputsCheck($inputs->refresh($scope) === 'error', 'an unreachable GitHub is an error, not a crash');

// Installing more builds keeps only the current one and the one before it.
foreach ([12, 13] as $n) {
    $web[INPUTS_API] = json_encode([inputsRelease($web, 'semantic-inputs-' . $n, '2026-10-2' . $n % 10 . 'T00:00:00Z', 'r1')]);
    $clock += EmbeddingInputs::CHECK_EVERY;
    inputsCheck($inputs->refresh($scope) === 'installed', "build $n is installed");
}
$kept = array_values(array_filter(scandir($root . '/embedding-inputs'), static fn (string $name): bool => str_starts_with($name, 'semantic-inputs-')));
sort($kept);
inputsCheck($kept === ['semantic-inputs-12', 'semantic-inputs-13'], 'older builds are pruned');
inputsCheck($inputs->status($scope)['error'] === null, 'a successful look clears the error');

inputsCheck(ScopedInput::parse(str_replace("\n", "\r\n", inputsEnvelope('r1', 'x')), $scope) !== null, 'parse accepts CRLF envelopes');
inputsCheck(ScopedInput::parse('{"scope":{"siteId":1,"revision":"r1","profile":"p"}}', $scope) === null, 'parse rejects plain JSON');
inputsCheck(preg_match('/^[a-f0-9]{64}$/', ScopedInput::profileHash()) === 1, 'the profile hash is a sha256');

exit($failures === 0 ? 0 : 1);
