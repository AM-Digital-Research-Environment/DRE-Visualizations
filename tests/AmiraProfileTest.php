<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/Precompute/AmiraProfile.php';
require dirname(__DIR__) . '/src/FeaturedCollections/Registry.php';

use DreVisualizations\FeaturedCollections\Registry;
use DreVisualizations\Precompute\AmiraProfile;

$failures = 0;
function profileCheck(bool $condition, string $message): void
{
    global $failures;
    if ($condition) {
        echo "ok: $message\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $message\n");
}

$profilePath = dirname(__DIR__) . '/config/amira-profile.json';
$profile = AmiraProfile::fromFile($profilePath);
profileCheck($profile->template('projects') === 5, 'template identifiers resolve by semantic key');
profileCheck($profile->itemSet('youtube') === 39192, 'item-set identifiers resolve by semantic key');
profileCheck($profile->templateResourceType(4) === 'person'
    && $profile->templateResourceType(999999) === null,
    'template resource types resolve without an implicit fallback');
$corpora = $profile->wordcloudCorpora();
profileCheck(($corpora[0] ?? null) === [
    'id' => 'podcasts',
    'itemSet' => $profile->itemSet('podcasts'),
    'field' => 'bibo:content',
], 'word-cloud corpora resolve the shared item-set key');
$embeddingCorpora = $profile->embeddingCorpora();
profileCheck(count($embeddingCorpora) === 6
    && ($embeddingCorpora[0] ?? null) === [
        'id' => 'podcasts',
        'label' => 'Podcast',
        'selector' => 'itemSet',
        'selectorId' => $profile->itemSet('podcasts'),
        'textFields' => ['dcterms:abstract', 'bibo:content'],
    ]
    && ($embeddingCorpora[5]['selector'] ?? null) === 'template'
    && ($embeddingCorpora[5]['selectorId'] ?? null) === $profile->template('researchItems'),
    'six embedding corpora resolve item-set and resource-template selectors');
profileCheck(count($profile->featuredCollections()) === 6,
    'featured collections are loaded from the validated installation profile');
profileCheck(($profile->universityLabels()['University Joseph Ki-Zerbo'] ?? null) === 'Université Joseph Ki-Zerbo',
    'university display labels are loaded from the installation profile');
$featured = $profile->featuredCollections();
profileCheck(($featured[4]['producerId'] ?? null) === 1219
    && ($featured[4]['externalUrl'] ?? null) === '/item?property[0][property]=568&property[0][type]=res&property[0][text]=1219',
    'featured collection filters resolve property and authority keys');
$registry = Registry::all();
profileCheck(($registry[4]['itemSetId'] ?? null) === $profile->itemSet('beyondDigitalReturn')
    && ($registry[4]['producerId'] ?? null) === 1219,
    'featured registry normalizes resolved profile entries');

$raw = json_decode((string) file_get_contents($profilePath), true, 512, JSON_THROW_ON_ERROR);
$invalidCases = [
    'unsupported schema version' => static function (array &$data): void { $data['schemaVersion'] = 99; },
    'non-positive required id' => static function (array &$data): void { $data['itemSets']['youtube'] = 0; },
    'unknown corpus item-set key' => static function (array &$data): void { $data['wordcloudCorpora'][0]['itemSetKey'] = 'missing'; },
    'duplicate corpus id' => static function (array &$data): void { $data['wordcloudCorpora'][1]['id'] = $data['wordcloudCorpora'][0]['id']; },
    'embedding corpus with both selectors' => static function (array &$data): void { $data['embeddingCorpora'][0]['templateKey'] = 'projects'; },
    'embedding corpus with no text fields' => static function (array &$data): void { $data['embeddingCorpora'][0]['textFields'] = []; },
    'duplicate embedding corpus id' => static function (array &$data): void { $data['embeddingCorpora'][1]['id'] = $data['embeddingCorpora'][0]['id']; },
    'duplicate featured collection slug' => static function (array &$data): void { $data['featuredCollections'][1]['slug'] = $data['featuredCollections'][0]['slug']; },
    'unknown featured item-set key' => static function (array &$data): void { $data['featuredCollections'][0]['itemSetKey'] = 'missing'; },
];
foreach ($invalidCases as $label => $mutate) {
    $case = $raw;
    $mutate($case);
    $tmp = tempnam(sys_get_temp_dir(), 'dre-profile-');
    if ($tmp === false) {
        throw new RuntimeException('Unable to create temporary profile fixture.');
    }
    file_put_contents($tmp, json_encode($case, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    try {
        AmiraProfile::fromFile($tmp);
        profileCheck(false, $label . ' is rejected');
    } catch (RuntimeException) {
        profileCheck(true, $label . ' is rejected');
    } finally {
        unlink($tmp);
    }
}

echo $failures ? "\n$failures FAILURE(S)\n" : "\nALL AMIRA PROFILE TESTS PASS\n";
exit($failures ? 1 : 0);
