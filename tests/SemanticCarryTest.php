<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

use DreVisualizations\Precompute\EmbeddingInputs;
use DreVisualizations\Precompute\ScopedInput;
use DreVisualizations\Precompute\SemanticCarry;
use DreVisualizations\Precompute\SnapshotStore;

$root = sys_get_temp_dir() . '/dre-semantic-carry-' . bin2hex(random_bytes(4));

// ── The revision history ────────────────────────────────────────────────────
$store = new SnapshotStore($root);
$r0 = $store->locked(fn (): string => $store->revision());
check($store->hiddenSince($r0) === [], 'nothing is hidden since the current revision');
$store->withdraw(automatic: true, hidden: [5]);
$r1 = $store->readRevision();
$store->withdraw(automatic: true, hidden: [6, 5]);
$r2 = $store->readRevision();
check($store->hiddenSince($r0) === [5, 6], 'the records hidden by every withdrawal since are collected');
check($store->hiddenSince((string) $r1) === [5, 6], 'from a later revision, only the later withdrawals count');
check($store->hiddenSince('not-a-revision') === null, 'an unknown revision cannot be carried');
$store->withdraw(automatic: true);
check($store->hiddenSince($r0) === null && $store->hiddenSince((string) $r2) === null,
    'a withdrawal that does not say what it hid stops the carry');
$r3 = (string) $store->readRevision();
$store->withdraw(automatic: true, hidden: [7]);
check($store->hiddenSince($r3) === [7], 'a later carry works again from after that withdrawal');
$r4 = (string) $store->readRevision();
$store->withdraw(hidden: [8]);
check($store->hiddenSince($r4) === null, 'a manual withdrawal never carries, whatever it names');

// ── Carrying a build ─────────────────────────────────────────────────────────
$scopeFor = static fn (string $revision): array => ['siteId' => 1, 'revision' => $revision, 'profile' => 'p'];
$installed = $root . '/embedding-inputs/semantic-inputs-1';
@mkdir($installed, 0775, true);
$write = static function (string $name, array $payload) use ($installed): void {
    file_put_contents($installed . '/' . $name . '.php', ScopedInput::PREFIX . json_encode($payload));
};
$built = $scopeFor('old');
$row = static fn (int $id, string $type): array => ['id' => $id, 'x' => 0.1, 'y' => 0.2, 'type' => $type, 'typeLabel' => $type,
    'cluster' => 0, 'lowSignal' => false, 'title' => 'Title ' . $id];
$write('map', ['scope' => $built, 'generatedAt' => 'then', 'types' => ['podcasts' => 1, 'publications' => 3],
    'items' => [$row(10, 'publications'), $row(11, 'publications'), $row(12, 'publications'), $row(20, 'podcasts')],
    'corpusLayouts' => ['publications' => [[10, 1, 1], [11, 2, 2], [12, 3, 3]]]]);
$write('similar', ['scope' => $built, 'catalog' => ['10' => ['title' => 'Title 10'], '11' => ['title' => 'Title 11'], '12' => ['title' => 'Title 12'], '20' => ['title' => 'Title 20']],
    'items' => ['10' => [['id' => 11, 'score' => 0.9], ['id' => 20, 'score' => 0.8]], '11' => [['id' => 10, 'score' => 0.9]], '20' => [['id' => 12, 'score' => 0.5]]]]);
$write('report', ['scope' => $built, 'recommendations' => ['crossLanguageExamples' => [
    ['source' => 10, 'target' => 20], ['source' => 11, 'target' => 10]]]]);

// 11 was made private since the build; 12 left the public corpus (deleted, or taken off the site).
$public = static fn (int $id): bool => $id !== 12;
$hidden = static fn (string $revision): ?array => $revision === 'old' ? [11] : null;
$carriedDir = $root . '/embedding-inputs/carried';
$now = $scopeFor('new');

$result = SemanticCarry::resolve($installed, $carriedDir, $now, $hidden, $public);
check($result === ['dir' => $carriedDir, 'state' => 'carried'], 'a build for an earlier revision is carried');
$map = ScopedInput::read($carriedDir . '/map.php', $now);
check($map !== null && $map['carriedFrom'] === 'old', 'the carried copy is scoped to the current revision and says where it comes from');
check(array_column($map['items'], 'id') === [10, 20], 'the map drops the hidden record and the one outside the corpus');
check($map['types'] === ['podcasts' => 1, 'publications' => 1], 'the per-type counts follow');
check($map['corpusLayouts']['publications'] === [[10, 1, 1]], 'the corpus layouts drop them too');
check(!str_contains((string) file_get_contents($carriedDir . '/map.php'), 'Title 11'), 'no title of a hidden record is left');
$similar = ScopedInput::read($carriedDir . '/similar.php', $now);
check(array_keys($similar['catalog']) === [10, 20], 'the similar catalog keeps only shown records');
check($similar['items'][10] === [['id' => 20, 'score' => 0.8]] && $similar['items'][20] === [] && !isset($similar['items'][11]),
    'neighbour lists drop hidden neighbours and hidden sources');
$report = ScopedInput::read($carriedDir . '/report.php', $now);
check($report['recommendations']['crossLanguageExamples'] === [['source' => 10, 'target' => 20]], 'report examples drop them too');

check(SemanticCarry::resolve($installed, $carriedDir, $built, $hidden, $public) === ['dir' => $installed, 'state' => 'current'],
    'a build for the current revision is read as it is');
check(SemanticCarry::resolve($installed, $carriedDir, $now, static fn (): ?array => null, $public) === ['dir' => $installed, 'state' => 'none'],
    'without a known history the build is not carried (its readers then ignore it)');
check(SemanticCarry::resolve($installed, $carriedDir, ['profile' => 'other'] + $now, $hidden, $public)['state'] === 'none',
    'a build for another profile is never carried');
check(SemanticCarry::resolve(null, $carriedDir, $now, $hidden, $public) === ['dir' => null, 'state' => 'none'],
    'nothing installed, nothing to carry');

// ── What the admin pages report ──────────────────────────────────────────────
file_put_contents($root . '/embedding-inputs/state.json', json_encode(['tag' => 'semantic-inputs-1', 'installedAt' => 5]));
$inputs = EmbeddingInputs::forStore($root, static fn (): ?string => null);
$status = $inputs->status($now, $hidden);
check(!$status['matches'] && $status['carried'], 'the status tells a carried build from a hidden one');
check(!$inputs->status($now, static fn (): ?array => null)['carried'], 'and reports a build that cannot be carried as hidden');
check($inputs->claimBuildRequest('new') && !$inputs->claimBuildRequest('new') && $inputs->claimBuildRequest('newer'),
    'a build is requested once per revision');

finish('Semantic carry passed.');
