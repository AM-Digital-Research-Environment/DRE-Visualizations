<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

/**
 * Dependency-free regression test for the PHP precompute aggregators
 * (src/Precompute/Aggregators.php).
 *
 * No PHPUnit/Composer needed — run it in a throwaway PHP container from the
 * module root:
 *
 *   docker run --rm -v "$PWD:/m" php:8.4-cli php /m/tests/AggregatorsTest.php
 *
 * Covers: aggregateItems, buildRoles / buildRolesFor (person-scoped), the
 * choropleth point-in-polygon against the real GeoJSON, the radar profile, and
 * the Louvain community split.
 */

require dirname(__DIR__) . '/src/Precompute/Aggregators.php';
require dirname(__DIR__) . '/src/Precompute/KnowledgeGraphs.php';

use DreVisualizations\Precompute\Aggregators as A;
use DreVisualizations\Precompute\KnowledgeGraphs as KG;

$aggregators = new A(4, 5, [
    'University of Bayreuth' => 'University of Bayreuth',
    'University of Lagos African Cluster Centre (LACC)' => 'University of Lagos',
    'University Joseph Ki-Zerbo' => 'Université Joseph Ki-Zerbo',
    'Universidade Federal da Bahia' => 'Federal University of Bahia',
    'CEAO Centro de Estudos Afro-Orientais' => 'Federal University of Bahia',
    'Rhodes University' => 'Rhodes University',
]);

$failures = 0;
function check(bool $cond, string $msg): void
{
    global $failures;
    if ($cond) {
        echo "ok: $msg\n";
    } else {
        $failures++;
        fwrite(STDERR, "FAIL: $msg\n");
    }
}

// --- aggregateItems ---
$items = [
    10 => ['title' => 'Book', 'template_id' => null],
    11 => ['title' => 'English', 'template_id' => null],
    12 => ['title' => 'Islam', 'template_id' => null],
    13 => ['title' => 'Jane', 'template_id' => 4],
];
$links = [
    1 => [['dcterms:type', 'Type', 10], ['dcterms:language', 'Lang', 11], ['dcterms:subject', 'Subj', 12], ['marcrel:aut', 'Author', 13]],
    2 => [['dcterms:type', 'Type', 10], ['dcterms:subject', 'Subj', 12]],
];
$agg = $aggregators->aggregateItems([1, 2], $items, $links, [1 => '2018', 2 => '2020'], []);
check($agg['totalItems'] === 2, 'aggregateItems totalItems=2');
check($agg['types'][0] === ['name' => 'Book', 'value' => 2, 'itemId' => 10], 'types Book=2');
check($agg['subjects'][0]['name'] === 'Islam' && $agg['subjects'][0]['value'] === 2, 'subjects Islam=2');
check($agg['timeline'] == ['2018' => 1, '2020' => 1], 'timeline by year');

// --- aggregateItems folds a synthetic resource type (publications) into the pie ---
$synItems = [10 => ['title' => 'Book'], 30 => ['title' => 'English']];
$synLinks = [
    1 => [['dcterms:type', 'T', 10]],     // research item: real type Book
    2 => [['dcterms:language', 'L', 30]],  // publication: no dcterms:type of its own
];
$synAgg = $aggregators->aggregateItems([1, 2], $synItems, $synLinks, [], [], [2 => 'Publication']);
$synByName = [];
foreach ($synAgg['types'] as $t) { $synByName[$t['name']] = $t; }
check(($synByName['Book']['value'] ?? 0) === 1, 'aggregateItems keeps real linked type Book=1');
check(($synByName['Publication']['value'] ?? 0) === 1, 'aggregateItems counts synthetic Publication=1');
check(!isset($synByName['Publication']['itemId']), 'synthetic type carries no itemId (not click-through)');

// A synthetic type REPLACES the item's own dcterms:type (no double count): a
// publication that carries a real type still shows only as one "Publication" slice.
$ovItems = [10 => ['title' => 'Book'], 40 => ['title' => 'Article']];
$ovLinks = [
    1 => [['dcterms:type', 'T', 10]],   // research item -> Book
    2 => [['dcterms:type', 'T', 40]],   // publication with a real type Article, overridden
];
$ovAgg = $aggregators->aggregateItems([1, 2], $ovItems, $ovLinks, [], [], [2 => 'Publication']);
$ovByName = [];
foreach ($ovAgg['types'] as $t) { $ovByName[$t['name']] = $t['value']; }
check(($ovByName['Publication'] ?? 0) === 1, 'aggregateItems: synthetic type replaces real type (Publication=1)');
check(!isset($ovByName['Article']), 'aggregateItems: real type suppressed when synthetic present (no Article)');
check(($ovByName['Book'] ?? 0) === 1, 'aggregateItems: non-synthetic item keeps its real type (Book=1)');

// --- aggregateItems splits origin (dcterms:spatial) vs current (dcterms:provenance) ---
// $geo is template-agnostic, so an Institution used as a Current Location is
// geocoded just like a Location item.
$geoItems = [
    50 => ['title' => 'Bayreuth', 'class_term' => 'dcterms:Location'],
    51 => ['title' => 'University of Bayreuth', 'class_term' => 'foaf:Organization'],
];
$geoLinks = [
    1 => [['dcterms:spatial', 'Origin', 50], ['dcterms:provenance', 'Current', 51]],
];
$geo = [
    50 => ['name' => 'Bayreuth', 'lat' => 49.95, 'lon' => 11.58, 'itemId' => 50],
    51 => ['name' => 'University of Bayreuth', 'lat' => 49.92885, 'lon' => 11.5859, 'itemId' => 51],
];
$geoAgg = $aggregators->aggregateItems([1], $geoItems, $geoLinks, [], $geo);
check(count($geoAgg['locations']) === 1 && $geoAgg['locations'][0]['name'] === 'Bayreuth',
    'aggregateItems origin location = Bayreuth');
check(count($geoAgg['currentLocations']) === 1 && $geoAgg['currentLocations'][0]['name'] === 'University of Bayreuth',
    'aggregateItems current location resolves an institution');
check($geoAgg['currentLocations'][0]['value'] === 1, 'aggregateItems current location count = 1');

// --- placesForItems: per-place [origin, current] counts ---
$spGeo = [
    50 => ['name' => 'Bayreuth', 'lat' => 49.95, 'lon' => 11.58, 'itemId' => 50],
    80 => ['name' => 'Lagos', 'lat' => 6.45, 'lon' => 3.39, 'itemId' => 80],
];
$spLinks = [
    1 => [['dcterms:spatial', 'Origin', 50], ['dcterms:provenance', 'Current', 50]], // 50 is both origin & current
    2 => [['dcterms:spatial', 'Origin', 80]],
    3 => [['dcterms:spatial', 'Origin', 50], ['dcterms:subject', 'S', 999]],          // 999 not geocoded → ignored
];
$spPlaces = $aggregators->placesForItems([1, 2, 3], $spLinks, $spGeo);
check(($spPlaces[50] ?? null) === [2, 1], 'placesForItems splits roles: place 50 = [2 origin, 1 current]');
check(($spPlaces[80] ?? null) === [1, 0], 'placesForItems: place 80 = [1 origin, 0 current]');
check(!isset($spPlaces[999]), 'placesForItems ignores non-geocoded references');

// --- buildSpatialPlaces: global bubbles split into origin/current + country index ---
$spRev = [
    50 => ['dcterms:spatial' => [1, 3], 'dcterms:provenance' => [1]], // origin items {1,3}=2, current {1}=1
    80 => ['dcterms:spatial' => [2]],                                  // origin 1, current 0
];
$spCountryIndex = [50 => 'Germany', 80 => 'Nigeria'];
$sp = $aggregators->buildSpatialPlaces($spGeo, $spRev, $spCountryIndex);
check(count($sp['locations']) === 2, 'buildSpatialPlaces emits both referenced locations');
check($sp['locations'][0][0] === 50 && $sp['locations'][0][4] === 2 && $sp['locations'][0][5] === 1,
    'buildSpatialPlaces: densest first, row = [id,name,lat,lng,origin=2,current=1,countryIdx]');
check($sp['locations'][1][0] === 80 && $sp['locations'][1][4] === 1 && $sp['locations'][1][5] === 0,
    'buildSpatialPlaces: place 80 origin=1, current=0');
check($sp['countries'][0][0] === 'Germany' && $sp['countries'][0][1] === 3,
    'buildSpatialPlaces: country count sums origin+current (Germany=3), ordered desc');
check($sp['countries'][$sp['locations'][0][6]][0] === 'Germany',
    'buildSpatialPlaces: location carries its country index at row[6]');
check($sp['countries'][$sp['locations'][1][6]][2] === [3.39, 6.45, 3.39, 6.45],
    'buildSpatialPlaces: single-point country bounds = the point [w,s,e,n]');
check($aggregators->buildSpatialPlaces($spGeo, [], $spCountryIndex)['locations'] === [],
    'buildSpatialPlaces: drops unreferenced locations');

// --- buildAffiliationMap: a person's geocoded institution affiliations ---
$afItems = [
    60 => ['title' => 'Jane Doe', 'template_id' => 4, 'class_term' => 'foaf:Person'],
    51 => ['title' => 'University of Bayreuth', 'template_id' => 2, 'class_term' => 'foaf:Organization'],
    52 => ['title' => 'Uncharted Institute', 'template_id' => 2, 'class_term' => 'foaf:Organization'],
];
$afLinks = [
    60 => [['dcterms:isPartOf', 'Affiliation', 51], ['dcterms:isPartOf', 'Affiliation', 52]],
];
$afMap = $aggregators->buildAffiliationMap(60, $afLinks, $afItems, $geo); // only 51 is in $geo
check($afMap !== null && count($afMap) === 1, 'buildAffiliationMap keeps only geocoded affiliations');
check($afMap[0]['name'] === 'University of Bayreuth' && $afMap[0]['itemId'] === 51,
    'buildAffiliationMap marker is the geocoded org');
check($aggregators->buildAffiliationMap(999, $afLinks, $afItems, $geo) === null,
    'buildAffiliationMap null when the person has no affiliations');
check($aggregators->buildAffiliationMap(60, $afLinks, $afItems, []) === null,
    'buildAffiliationMap null when no affiliation is geocoded');

// --- buildProjectAffiliationMap: a project's members' geocoded affiliations ---
$pafItems = $afItems + [70 => ['title' => 'ArtWorld', 'template_id' => 5, 'class_term' => 'frapo:Project']];
$pafLinks = $afLinks + [
    // Jane Doe (60) is both PI and a team member — counted once.
    70 => [['dcterms:creator', 'PI', 60], ['foaf:member', 'Member', 60]],
];
$pafMap = $aggregators->buildProjectAffiliationMap(70, $pafLinks, $pafItems, $geo); // only 51 is in $geo
check($pafMap !== null && count($pafMap) === 1, 'buildProjectAffiliationMap keeps only geocoded member affiliations');
check($pafMap[0]['itemId'] === 51 && $pafMap[0]['members'] === ['Jane Doe'],
    'buildProjectAffiliationMap marker lists the affiliated member once');
check($aggregators->buildProjectAffiliationMap(70, $pafLinks, $pafItems, []) === null,
    'buildProjectAffiliationMap null when no member affiliation is geocoded');
check($aggregators->buildProjectAffiliationMap(999, $pafLinks, $pafItems, $geo) === null,
    'buildProjectAffiliationMap null when the project has no members');

// --- buildHeatmap synthetic types collapse an item's real type to one row ---
$synItems = [10 => ['title' => 'Article'], 11 => ['title' => 'English'], 12 => ['title' => 'Book chapter']];
$synLinks = [
    1 => [['dcterms:type', 'T', 10], ['dcterms:language', 'L', 11]], // real type Article × English
    2 => [['dcterms:type', 'T', 12], ['dcterms:language', 'L', 11]], // real type Book chapter × English
];
$synHm = $aggregators->buildHeatmap([1, 2], $synLinks, $synItems, [1 => 'Publication', 2 => 'Publication']);
check($synHm !== null && $synHm['rows'] === ['Publication'],
    'buildHeatmap folds synthetic-typed items into one row');
check($synHm['cols'] === ['English'] && $synHm['values'][0][2] === 2,
    'buildHeatmap counts both synthetic-typed items in the one cell');

// --- buildHeatmap drops a resource type that never co-occurs with a language ---
$hmItems = [10 => ['title' => 'Book'], 11 => ['title' => 'English'], 14 => ['title' => 'Map']];
$hmLinks = [
    1 => [['dcterms:type', 'T', 10], ['dcterms:language', 'L', 11]], // Book × English
    2 => [['dcterms:type', 'T', 14]],                                // Map: no language
];
$hm = $aggregators->buildHeatmap([1, 2], $hmLinks, $hmItems);
check($hm['rows'] === ['Book'], 'buildHeatmap drops a type with no language (Map excluded)');
check($hm['cols'] === ['English'], 'buildHeatmap keeps only languages paired with a type');
check($hm['values'] === [[0, 0, 1]], 'buildHeatmap Book × English = 1');

// --- buildStackedTimeline: publications stack under their synthetic type, else "No type" ---
$stItems = [10 => ['title' => 'Book']];
$stLinks = [
    1 => [['dcterms:type', 'T', 10]], // 2018, Book
    2 => [],                          // 2018, no type, marked publication
    3 => [],                          // 2019, no type, no synthetic -> "No type"
];
$st = $aggregators->buildStackedTimeline([1, 2, 3], $stLinks, $stItems, [1 => '2018', 2 => '2018', 3 => '2019'], [2 => 'Publication']);
// Years come back as ints (PHP coerces the numeric-string year keys of $yearType).
check($st['years'] === [2018, 2019], 'buildStackedTimeline years sorted');
$stSeries = [];
foreach ($st['series'] as $s) { $stSeries[$s['name']] = $s['data']; }
check(($stSeries['Book'] ?? null) === [1, 0], 'buildStackedTimeline keeps real linked types');
check(($stSeries['Publication'] ?? null) === [1, 0], 'buildStackedTimeline stacks a publication under "Publication"');
check(($stSeries['No type'] ?? null) === [0, 1], 'buildStackedTimeline still falls back to "No type" without a synthetic label');

// buildStackedTimeline: a synthetic type overrides the item's own dcterms:type
$stOvLinks = [
    1 => [['dcterms:type', 'T', 10]],   // Book (research item)
    2 => [['dcterms:type', 'T', 40]],   // Article, but synthetic "Publication" overrides
];
$stOvItems = [10 => ['title' => 'Book'], 40 => ['title' => 'Article']];
$stOv = $aggregators->buildStackedTimeline([1, 2], $stOvLinks, $stOvItems, [1 => '2020', 2 => '2020'], [2 => 'Publication']);
$stOvSeries = [];
foreach ($stOv['series'] as $s) { $stOvSeries[$s['name']] = array_sum($s['data']); }
check(($stOvSeries['Publication'] ?? 0) === 1, 'buildStackedTimeline: synthetic overrides real type (Publication=1)');
check(!isset($stOvSeries['Article']), 'buildStackedTimeline: real type suppressed under synthetic (no Article series)');
check(($stOvSeries['Book'] ?? 0) === 1, 'buildStackedTimeline: research item keeps real type (Book=1)');

// --- person-scoped roles ---
$rlinks = [
    1 => [['marcrel:aut', 'Author', 100], ['marcrel:aut', 'Author', 200]],
    2 => [['marcrel:pht', 'Photographer', 100]],
];
check($aggregators->buildRolesFor(100, [1, 2], $rlinks) === [['name' => 'Author', 'value' => 1], ['name' => 'Photographer', 'value' => 1]], 'buildRolesFor scopes to entity 100');
$allMap = [];
foreach ($aggregators->buildRoles([1, 2], $rlinks, []) as $r) { $allMap[$r['name']] = $r['value']; }
check(($allMap['Author'] ?? 0) === 2, 'buildRoles counts all contributors (Author=2)');

// --- choropleth point-in-polygon against the real GeoJSON ---
$features = $aggregators->loadCountryFeatures(dirname(__DIR__) . '/asset/data/geo/countries.geojson');
check(count($features) === 177, 'loaded 177 country features');
$geo = [
    500 => ['name' => 'Paris', 'lat' => 48.85, 'lon' => 2.35, 'itemId' => 500],
    501 => ['name' => 'Lagos', 'lat' => 6.45, 'lon' => 3.39, 'itemId' => 501],
    502 => ['name' => 'Ouaga', 'lat' => 12.37, 'lon' => -1.53, 'itemId' => 502],
];
$idx = $aggregators->buildCountryIndex($geo, $features);
check(($idx[500] ?? '') === 'France', 'Paris -> France');
check(($idx[501] ?? '') === 'Nigeria', 'Lagos -> Nigeria');
check(str_contains($idx[502] ?? '', 'Burkina'), 'Ouaga -> Burkina Faso');
$chl = $aggregators->buildChoropleth([1, 2, 3], [1 => [['dcterms:spatial', 'O', 500]], 2 => [['dcterms:spatial', 'O', 500]], 3 => [['dcterms:spatial', 'O', 501]]], $idx);
check($chl === [['country' => 'France', 'count' => 2], ['country' => 'Nigeria', 'count' => 1]], 'buildChoropleth counts by country');

// --- radar ---
$pA = $aggregators->profileFromItems([1, 2], [
    1 => [['dcterms:language', 'L', 10], ['dcterms:subject', 'S', 20], ['dcterms:type', 'T', 30], ['marcrel:aut', 'A', 40]],
    2 => [['dcterms:language', 'L', 11], ['dcterms:subject', 'S', 20]],
], [1 => '2010', 2 => '2018']);
check($pA === ['items' => 2, 'languages' => 2, 'subjects' => 1, 'contributors' => 1, 'types' => 1, 'span' => 8], 'profileFromItems');
$radar = $aggregators->buildRadar($pA, $aggregators->profileMaxima([$pA, ['items' => 1, 'languages' => 1, 'subjects' => 1, 'contributors' => 1, 'types' => 1, 'span' => 0]]));
check(count($radar['indicator']) === 6 && $radar['series'][0]['value'] === [2, 2, 1, 1, 1, 8], 'buildRadar values');

// --- buildTemplates (resource-template breakdown) ---
$tplItems = [
    1 => ['title' => 'A', 'template_id' => 10],
    2 => ['title' => 'B', 'template_id' => 10],
    3 => ['title' => 'C', 'template_id' => 11],
];
$tplLabels = [10 => 'Research Items', 11 => 'Article'];
check($aggregators->buildTemplates([1, 2, 3], $tplItems, $tplLabels) === [['name' => 'Research Items', 'value' => 2], ['name' => 'Article', 'value' => 1]], 'buildTemplates groups by template label');
check($aggregators->buildTemplates([1, 2], $tplItems, $tplLabels) === null, 'buildTemplates null when single template (monotone)');

// --- buildTopValues (publishers: Organisation links + names not yet reconciled) ---
$pubItems = [700 => ['title' => 'Brill'], 701 => ['title' => 'Routledge'], 702 => ['title' => '']];
$pubLinks = [
    1 => [['dcterms:publisher', 'P', 700]],
    2 => [['dcterms:publisher', 'P', 700], ['dcterms:publisher', 'P', 700]], // repeat on one item counts once
    3 => [['dcterms:publisher', 'P', 701], ['dcterms:publisher', 'P', 702]], // untitled link skipped
];
$pubLits = [
    2 => ['dcterms:publisher' => ['brill']],        // spells a linked title: no second count on item 2
    4 => ['dcterms:publisher' => [' BRILL ']],      // joins the linked Brill row
    5 => ['dcterms:publisher' => ['Karthala', '']], // unreconciled name counts as text; empty ignored
];
check($aggregators->buildTopValues([1, 2, 3, 4, 5], $pubLinks, $pubLits, $pubItems, 'dcterms:publisher') === [
    ['name' => 'Brill', 'value' => 3, 'itemId' => 700],
    ['name' => 'Karthala', 'value' => 1],
    ['name' => 'Routledge', 'value' => 1, 'itemId' => 701],
], 'buildTopValues counts links by record and folds matching literals into them');
check($aggregators->buildTopValues([1, 2, 3], $pubLinks, $pubLits, $pubItems, 'dcterms:isPartOf') === null, 'buildTopValues null when term absent');
check($aggregators->countDistinctValues([1, 2, 3, 4, 5], $pubLinks, $pubLits, $pubItems, 'dcterms:publisher') === 3, 'countDistinctValues counts linked and literal publishers once each');

// --- buildTopLinkedOfClass (journals and book series through the records they link) ---
$venueItems = [
    710 => ['title' => 'Africa Spectrum', 'class_term' => 'bibo:Journal'],
    711 => ['title' => 'Afrika und Übersee', 'class_term' => 'bibo:Journal'],
    720 => ['title' => 'Bayreuth African Studies', 'class_term' => 'bibo:Series'],
    730 => ['title' => 'Edited Volume', 'class_term' => 'fabio:Book'],
    740 => ['title' => 'Project', 'class_term' => 'foaf:Project'],
];
$venueLinks = [
    1 => [['dcterms:isPartOf', 'P', 710]],
    2 => [['dcterms:isPartOf', 'P', 710], ['dcterms:isPartOf', 'P', 740]], // a project is not a venue
    3 => [['dcterms:isPartOf', 'P', 711]],
    4 => [['dcterms:isPartOf', 'P', 730], ['dre:series', 'S', 720]],      // chapter: book container, series statement
    5 => [['dcterms:isPartOf', 'P', 720], ['dre:series', 'S', 720]],      // monograph: the series twice counts once
];
check($aggregators->buildTopLinkedOfClass([1, 2, 3, 4, 5], $venueLinks, $venueItems, ['dcterms:isPartOf'], ['bibo:Journal']) === [
    ['name' => 'Africa Spectrum', 'value' => 2, 'itemId' => 710],
    ['name' => 'Afrika und Übersee', 'value' => 1, 'itemId' => 711],
], 'buildTopLinkedOfClass ranks the Journal records articles link to');
check($aggregators->buildTopLinkedOfClass([1, 2, 3, 4, 5], $venueLinks, $venueItems, ['dcterms:isPartOf', 'dre:series'], ['bibo:Series']) === [
    ['name' => 'Bayreuth African Studies', 'value' => 2, 'itemId' => 720],
], 'buildTopLinkedOfClass reaches a series through isPartOf and dre:series, once per item');
check($aggregators->countLinkedOfClass([1, 2, 3, 4, 5], $venueLinks, $venueItems, ['dcterms:isPartOf'], ['bibo:Journal']) === 2, 'countLinkedOfClass counts distinct journals');
check($aggregators->buildTopLinkedOfClass([1], $venueLinks, $venueItems, ['dcterms:isPartOf'], ['bibo:Series']) === null, 'buildTopLinkedOfClass null when no record of the class');

// --- buildTopLinked (funders with click-through, per-item dedupe) ---
$fundItems = [900 => ['title' => 'DFG'], 901 => ['title' => 'EXC 2052'], 902 => ['title' => '']];
$fundLinks = [
    1 => [['frapo:isFundedBy', 'F', 900], ['frapo:isFundedBy', 'F', 901]],
    2 => [['frapo:isFundedBy', 'F', 900], ['frapo:isFundedBy', 'F', 900]],  // repeat on one item counts once
    3 => [['frapo:isFundedBy', 'F', 902], ['dcterms:publisher', 'P', 900]], // untitled + other term skipped
];
check($aggregators->buildTopLinked([1, 2, 3], $fundLinks, $fundItems, 'frapo:isFundedBy') === [
    ['name' => 'DFG', 'value' => 2, 'itemId' => 900],
    ['name' => 'EXC 2052', 'value' => 1, 'itemId' => 901],
], 'buildTopLinked counts linked funders (deduped per item, untitled skipped)');
check($aggregators->buildTopLinked([3], $fundLinks, $fundItems, 'marcrel:pup') === null, 'buildTopLinked null when term absent');

// --- countItemsLinkedTo (peer-review flag: bibo:status links to an authority item) ---
$statusItems = [800 => ['title' => ' Peer reviewed '], 801 => ['title' => 'Not peer reviewed']];
$statusLinks = [
    1 => [['bibo:status', 'S', 800]],
    2 => [['bibo:status', 'S', 801]],                          // exact title only — no substring hit
    3 => [['bibo:status', 'S', 800], ['bibo:status', 'S', 800]], // repeat on one item counts once
    4 => [['dcterms:publisher', 'P', 800]],                    // other term ignored
];
check($aggregators->countItemsLinkedTo([1, 2, 3, 4], $statusLinks, $statusItems, 'bibo:status', 'Peer reviewed') === 2, 'countItemsLinkedTo counts items linked to the exact title (trimmed, once per item)');
check($aggregators->countItemsLinkedTo([1, 2], $statusLinks, $statusItems, 'bibo:status', 'PEER REVIEWED') === 1, 'countItemsLinkedTo matches case-insensitively');
check($aggregators->countItemsLinkedTo([2], $statusLinks, $statusItems, 'bibo:status', 'Peer reviewed') === 0, 'countItemsLinkedTo 0 when nothing matches');

// --- buildLinkedPlacesMap (places of publication via marcrel:pup) ---
$pupItems = [
    1 => ['title' => 'Border Markets'], 2 => ['title' => 'Imaginaries'], 3 => ['title' => 'Untitled Pub'],
    500 => ['title' => 'London'], 501 => ['title' => 'New York'], 502 => ['title' => 'Ungeocoded Town'],
];
$pupLinks = [
    1 => [['marcrel:pup', 'Place of publication', 500]],
    2 => [['marcrel:pup', 'Place of publication', 500], ['marcrel:pup', 'Place of publication', 501]],
    3 => [['marcrel:pup', 'Place of publication', 502], ['dcterms:spatial', 'Spatial', 501]],
];
$pupGeo = [
    500 => ['name' => 'London', 'lat' => 51.5, 'lon' => -0.13, 'itemId' => 500],
    501 => ['name' => 'New York', 'lat' => 40.7, 'lon' => -74.0, 'itemId' => 501],
];
$pupMap = $aggregators->buildLinkedPlacesMap([1, 2, 3], $pupLinks, $pupItems, $pupGeo, 'marcrel:pup');
check(count($pupMap) === 2, 'buildLinkedPlacesMap keeps only geocoded places (ungeocoded town dropped)');
check($pupMap[0]['name'] === 'London' && $pupMap[0]['value'] === 2, 'buildLinkedPlacesMap sorts by publication count');
check($pupMap[0]['items'] === [['id' => 1, 'title' => 'Border Markets'], ['id' => 2, 'title' => 'Imaginaries']], 'buildLinkedPlacesMap carries per-place publication lists');
check($pupMap[1]['lat'] === 40.7 && $pupMap[1]['lon'] === -74.0 && $pupMap[1]['itemId'] === 501, 'buildLinkedPlacesMap keeps coordinates + location itemId');
check($aggregators->buildLinkedPlacesMap([3], $pupLinks, $pupItems, $pupGeo, 'marcrel:pup') === null, 'buildLinkedPlacesMap null when nothing mappable (dcterms:spatial not counted)');

// --- buildPublicationCountries (place of publication's country + journal's country) ---
$pcItems = [
    1 => ['title' => 'Chapter in London'], 2 => ['title' => 'Article in a UK journal'],
    3 => ['title' => 'Book in Singapore'], 4 => ['title' => 'Article in a two-country journal'],
    5 => ['title' => 'Talk'], 6 => ['title' => 'Chapter in Dar es Salaam'],
    600 => ['title' => 'London', 'class_term' => 'dcterms:Location'],
    601 => ['title' => 'United Kingdom', 'class_term' => 'dcterms:Location'],
    602 => ['title' => 'Singapore', 'class_term' => 'dcterms:Location'],
    603 => ['title' => 'United States of America', 'class_term' => 'dcterms:Location'],
    604 => ['title' => 'Dar es Salaam', 'class_term' => 'dcterms:Location'],
    605 => ['title' => 'Tanzania', 'class_term' => 'dcterms:Location'],
    610 => ['title' => 'Journal of the UK', 'class_term' => 'bibo:Journal'],
    611 => ['title' => 'Transatlantic Journal', 'class_term' => 'bibo:Journal'],
];
$pcGeo = [
    600 => ['name' => 'London', 'lat' => 51.5, 'lon' => -0.13, 'itemId' => 600],
    601 => ['name' => 'United Kingdom', 'lat' => 54.6, 'lon' => -2.0, 'itemId' => 601],
    602 => ['name' => 'Singapore', 'lat' => 1.3, 'lon' => 103.8, 'itemId' => 602],
    603 => ['name' => 'United States of America', 'lat' => 39.8, 'lon' => -98.6, 'itemId' => 603],
    604 => ['name' => 'Dar es Salaam', 'lat' => -6.8, 'lon' => 39.28, 'itemId' => 604],
];
check(($aggregators->buildCountryIndex($pcGeo, $features)[602] ?? '') === 'Malaysia',
    'at 1:110m Singapore falls inside Malaysia\'s outline (why countries come from the place hierarchy)');
$pcNames = $aggregators->loadCountryNames(dirname(__DIR__) . '/asset/data/geo/countries.geojson');
check(($pcNames['tanzania'] ?? '') === 'United Republic of Tanzania' && ($pcNames['czech republic'] ?? '') === 'Czechia',
    'loadCountryNames maps NAME / NAME_LONG spellings to the ADMIN outline name');
$pcLinks = [
    1 => [['marcrel:pup', 'Place of publication', 600]],
    2 => [['dcterms:isPartOf', 'Is part of', 610]],
    3 => [['marcrel:pup', 'Place of publication', 602]],
    4 => [['dcterms:isPartOf', 'Is part of', 611], ['marcrel:pup', 'Place of publication', 600]],
    5 => [['bibo:status', 'Status', 600]],
    6 => [['marcrel:pup', 'Place of publication', 604]],
    600 => [['dcterms:isPartOf', 'Is part of', 601]],
    604 => [['dcterms:isPartOf', 'Is part of', 605]],
    610 => [['dcterms:spatial', 'Country of origin', 601]],
    611 => [['dcterms:spatial', 'Country of origin', 601], ['dcterms:spatial', 'Country of origin', 603]],
];
$pc = $aggregators->buildPublicationCountries([1, 2, 3, 4, 5, 6], $pcLinks, $pcItems, $pcGeo, $pcNames);
$pcBy = array_column($pc ?? [], null, 'country');
check(array_keys($pcBy) === ['United Kingdom', 'Singapore', 'Tanzania', 'United States of America'], 'buildPublicationCountries sorts countries by count');
check($pcBy['United Kingdom']['count'] === 3 && $pcBy['United Kingdom']['outline'] === 'United Kingdom',
    'a place of publication and a journal country add up, once per publication');
check(array_column($pcBy['United Kingdom']['items'], 'id') === [1, 2, 4], 'buildPublicationCountries lists each country\'s publications');
check($pcBy['United States of America']['count'] === 1, 'a journal with two countries counts in both');
check($pcBy['Tanzania']['outline'] === 'United Republic of Tanzania', 'a city takes the country it is part of, joined to its outline by name');
check($pcBy['Singapore']['outline'] === null && $pcBy['Singapore']['lat'] === 1.3,
    'a city-state without an outline keeps its own name and coordinates, not Malaysia');
check($aggregators->buildPublicationCountries([5], $pcLinks, $pcItems, $pcGeo, $pcNames) === null, 'buildPublicationCountries null when nothing places a publication');

// --- publicationsByPlace (the place pages' "Published here" panel) ---
$pbp = $aggregators->publicationsByPlace([1, 2, 3, 4, 5, 6], $pcLinks, $pcItems);
check(($pbp[600] ?? null) === [1, 4], 'publicationsByPlace: a city holds the publications naming it as their place of publication');
check(($pbp[601] ?? null) === [1, 2, 4], 'publicationsByPlace: a country adds its cities\' publications and its journals\' articles, once each');
check(($pbp[603] ?? null) === [4], 'publicationsByPlace: an article counts for both countries of a two-country journal');
check(($pbp[604] ?? null) === [6] && ($pbp[605] ?? null) === [6], 'publicationsByPlace: a chapter published in Dar es Salaam also counts for Tanzania');
check(($pbp[602] ?? null) === [3], 'publicationsByPlace: a place with no parent keeps its own publications');
check(!isset($pbp[610]) && !isset($pbp[611]), 'publicationsByPlace: a journal record is not a place');
check($aggregators->publicationsByPlace([5], $pcLinks, $pcItems) === [], 'publicationsByPlace: empty when nothing places a publication');
$chainItems = [
    1 => ['title' => 'Book in Bayreuth'], 2 => ['title' => 'Book in a loop'],
    620 => ['title' => 'Bayreuth', 'class_term' => 'dcterms:Location'],
    621 => ['title' => 'Bavaria', 'class_term' => 'dcterms:Location'],
    622 => ['title' => 'Germany', 'class_term' => 'dcterms:Location'],
    623 => ['title' => 'University of Bayreuth', 'class_term' => 'foaf:Organization'],
    630 => ['title' => 'Loop A', 'class_term' => 'dcterms:Location'],
    631 => ['title' => 'Loop B', 'class_term' => 'dcterms:Location'],
];
$chainLinks = [
    1 => [['marcrel:pup', 'Place of publication', 620]],
    2 => [['marcrel:pup', 'Place of publication', 630]],
    620 => [['dcterms:isPartOf', 'Is part of', 623], ['dcterms:isPartOf', 'Is part of', 621]],
    621 => [['dcterms:isPartOf', 'Is part of', 622]],
    630 => [['dcterms:isPartOf', 'Is part of', 631]],
    631 => [['dcterms:isPartOf', 'Is part of', 630]],
];
$chain = $aggregators->publicationsByPlace([1, 2], $chainLinks, $chainItems);
check(($chain[620] ?? null) === [1] && ($chain[621] ?? null) === [1] && ($chain[622] ?? null) === [1],
    'publicationsByPlace: a publication counts at every level of its place hierarchy (city, region, country)');
check(!isset($chain[623]), 'publicationsByPlace: only a Location is a parent place (not an organisation)');
check(($chain[630] ?? null) === [2] && ($chain[631] ?? null) === [2], 'publicationsByPlace: a loop in the place hierarchy ends the chain');
$chainCountries = $aggregators->buildPublicationCountries([1], $chainLinks, $chainItems, [], []);
check(($chainCountries[0]['country'] ?? '') === 'Germany', 'buildPublicationCountries: a city two levels down takes the top of its hierarchy');

// --- ranked lists: whole for the bar chart's pager, capped per entity ---
$rankItems = [];
$rankLinks = [];
for ($k = 0; $k < 130; $k++) {
    $rankItems[3000 + $k] = ['title' => sprintf('Author %03d', $k)];
    $rankLinks[$k + 1] = [['bibo:authorList', 'list of authors', 3000 + $k]];
}
check(count($aggregators->buildTopAuthors(range(1, 130), $rankLinks, [], $rankItems) ?? []) === 130,
    'buildTopAuthors keeps the whole list by default (the bar chart pages it)');
check(count($aggregators->buildTopLinked(range(1, 130), $rankLinks, $rankItems, 'bibo:authorList') ?? []) === 130,
    'buildTopLinked keeps the whole list by default');
check(count($aggregators->buildTopLinked(range(1, 130), $rankLinks, $rankItems, 'bibo:authorList', 5) ?? []) === 5,
    'buildTopLinked still honours an explicit cap');
check(count($aggregators->aggregateItems(range(1, 130), $rankItems, $rankLinks, [], [])['contributors']) === A::RANKED_LIST_CAP,
    'a dashboard keeps RANKED_LIST_CAP contributors (five pages)');

// --- places of publication are not contributors (marcrel:pup is a place) ---
$roleItems = [13 => ['title' => 'Jane', 'template_id' => 4], 600 => ['title' => 'London'], 700 => ['title' => 'Brill']];
$roleLinks = [
    1 => [['bibo:authorList', 'list of authors', 13], ['marcrel:pup', 'Publication place', 600], ['dcterms:publisher', 'Publisher', 700]],
    2 => [['marcrel:aut', 'author', 13]],
];
$roleAgg = $aggregators->aggregateItems([1, 2], $roleItems, $roleLinks, [], []);
check(array_column($roleAgg['contributors'] ?? [], 'value', 'name') === ['Jane' => 2], 'contributors count publication authors and leave out the place of publication');
check(array_column($aggregators->buildRoles([1, 2], $roleLinks, $roleItems) ?? [], 'value', 'name') === ['author' => 2], 'roles: a publication author is an author, a place is no role');
check(array_column($aggregators->buildRolesFor(600, [1], $roleLinks) ?? [], 'value', 'name') === [], 'roles: a place of publication holds no role');

// --- buildSankey follows dcterms:isPartOf to a project only, not to a journal ---
$skItems = [13 => ['title' => 'Jane', 'template_id' => 4], 30 => ['title' => 'Project X', 'template_id' => 5],
    31 => ['title' => 'A Journal', 'class_term' => 'bibo:Journal'], 40 => ['title' => 'Article']];
$skLinks = [
    1 => [['marcrel:aut', 'author', 13], ['dcterms:isPartOf', 'P', 30], ['dcterms:type', 'T', 40]],
    2 => [['bibo:authorList', 'list of authors', 13], ['dcterms:isPartOf', 'P', 31], ['dcterms:type', 'T', 40]],
];
$sk = $aggregators->buildSankey([1, 2], $skLinks, $skItems);
check(array_column($sk['nodes'] ?? [], 'name') === ['Jane', 'Project X', 'Article'] && ($sk['links'][0]['value'] ?? 0) === 1,
    'buildSankey: the journal of an article is not drawn as its project');

// --- buildTopAuthors (literal + matched person union) ---
$authItems = [100 => ['title' => 'Daley, Patricia', 'template_id' => 4]];
$authLinks = [
    1 => [['bibo:authorList', 'Author', 100]],
    2 => [['bibo:authorList', 'Author', 100]],
];
$authLits = [
    1 => ['bibo:authorList' => ['Kimari, Wangui']],
    2 => ['bibo:authorList' => ['Kimari, Wangui']],
];
check($aggregators->buildTopAuthors([1, 2], $authLinks, $authLits, $authItems) === [
    ['name' => 'Daley, Patricia', 'value' => 2, 'matched' => true, 'itemId' => 100],
    ['name' => 'Kimari, Wangui', 'value' => 2, 'matched' => false],
], 'buildTopAuthors unions matched persons + literal names');

// --- buildCoAuthorNetwork (2-cluster split, literal authors unmatched) ---
$coLits = [];
$pid = 200;
for ($k = 0; $k < 5; $k++) { $coLits[$pid++] = ['bibo:authorList' => ['A', 'B', 'C']]; }
for ($k = 0; $k < 5; $k++) { $coLits[$pid++] = ['bibo:authorList' => ['D', 'E', 'F']]; }
for ($k = 0; $k < 2; $k++) { $coLits[$pid++] = ['bibo:authorList' => ['C', 'D']]; }
$coNet = $aggregators->buildCoAuthorNetwork(array_keys($coLits), [], $coLits, []);
check($coNet !== null && count($coNet['nodes']) === 6, 'coAuthorNetwork: 6 author nodes');
check($coNet !== null && count($coNet['communities']) === 2, 'coAuthorNetwork: 2 communities split');
$coAllUnmatched = true;
foreach (($coNet['nodes'] ?? []) as $nd) { if (!empty($nd['matched'])) { $coAllUnmatched = false; } }
check($coAllUnmatched, 'coAuthorNetwork: literal authors are unmatched');

// --- buildCoAuthorNetwork (matched person carries itemId) ---
$mLinks = [
    300 => [['bibo:authorList', 'Author', 100]],
    301 => [['bibo:authorList', 'Author', 100]],
    302 => [['bibo:authorList', 'Author', 100]],
];
$mLits = [
    300 => ['bibo:authorList' => ['X', 'Y']],
    301 => ['bibo:authorList' => ['X', 'Y']],
    302 => ['bibo:authorList' => ['X', 'Y']],
];
$mItems = [100 => ['title' => 'Linked Person', 'template_id' => 4]];
$mNet = $aggregators->buildCoAuthorNetwork([300, 301, 302], $mLinks, $mLits, $mItems);
$lp = null;
foreach (($mNet['nodes'] ?? []) as $nd) { if ($nd['name'] === 'Linked Person') { $lp = $nd; } }
check($lp !== null && $lp['matched'] === true && ($lp['itemId'] ?? null) === 100, 'coAuthorNetwork: linked author marked matched with itemId');

// --- buildCoAuthorNetwork distinguishes author / editor relationships ---
$relLits = [];
for ($k = 0; $k < 3; $k++) { $relLits[400 + $k] = ['bibo:authorList' => ['A', 'B']]; }              // A–B co-authorship
for ($k = 0; $k < 3; $k++) { $relLits[410 + $k] = ['bibo:editorList' => ['C', 'D']]; }              // C–D co-editorship
for ($k = 0; $k < 3; $k++) { $relLits[420 + $k] = ['bibo:authorList' => ['A'], 'bibo:editorList' => ['C']]; } // A–C author–editor
$relLits[430] = ['bibo:authorList' => ['C', 'D']];  // C & D also co-author once → role 'both'; C–D still dominant co-editorship (3 vs 1)
$relNet = $aggregators->buildCoAuthorNetwork(array_keys($relLits), [], $relLits, []);
$relOf = [];
foreach (($relNet['links'] ?? []) as $l) { $p = [$l['source'], $l['target']]; sort($p); $relOf[implode('-', $p)] = $l['relation']; }
check(($relOf['A-B'] ?? null) === 'coauthor', 'coAuthorNetwork: A–B edge is co-authorship');
check(($relOf['C-D'] ?? null) === 'coeditor', 'coAuthorNetwork: C–D edge is co-editorship (dominant)');
check(($relOf['A-C'] ?? null) === 'mixed', 'coAuthorNetwork: A–C edge is author–editor');
$roleOf = [];
foreach (($relNet['nodes'] ?? []) as $nd) { $roleOf[$nd['name']] = $nd['role']; }
check(($roleOf['A'] ?? null) === 'author', 'coAuthorNetwork: A role is author');
check(($roleOf['C'] ?? null) === 'both', 'coAuthorNetwork: C role is both (author and editor)');

// --- buildCoAuthorNetwork counts only linked Person records ---
$orgItems = [
    100 => ['title' => 'Linked Person', 'template_id' => 4],
    101 => ['title' => 'Institute of African Studies', 'template_id' => 2],
];
$orgLinks = [];
for ($k = 0; $k < 3; $k++) { $orgLinks[600 + $k] = [['bibo:authorList', 'Author', 100], ['bibo:authorList', 'Author', 101]]; }
$orgLits = [600 => ['bibo:authorList' => ['Y']], 601 => ['bibo:authorList' => ['Y', 'Z']], 602 => ['bibo:authorList' => ['Z']]];
$orgNet = $aggregators->buildCoAuthorNetwork([600, 601, 602], $orgLinks, $orgLits, $orgItems);
$orgNames = array_column($orgNet['nodes'] ?? [], 'name');
check(in_array('Linked Person', $orgNames, true) && !in_array('Institute of African Studies', $orgNames, true), 'coAuthorNetwork: a linked institution is not an author node');

// --- buildCoAuthorNetwork keeps a connected selection under the cap ---
// Hubs A and B are joined only through X; C and D share five papers and no one
// else. By PageRank the top four are A, B, X and one of C/D, so a plain top-N cut
// would draw that one with no tie. The connected selection walks A → X → B and
// spends the last slot on a hub's co-author.
$cnLits = [];
$pid = 500;
foreach (['A', 'B'] as $hub) {
    for ($k = 1; $k <= 5; $k++) { $cnLits[$pid++] = ['bibo:authorList' => [$hub, $hub . $k]]; }
}
$cnLits[$pid++] = ['bibo:authorList' => ['A', 'X']];
$cnLits[$pid++] = ['bibo:authorList' => ['X', 'B']];
for ($k = 0; $k < 5; $k++) { $cnLits[$pid++] = ['bibo:authorList' => ['C', 'D']]; }
$cnNet = $aggregators->buildCoAuthorNetwork(array_keys($cnLits), [], $cnLits, [], 1, 4);
$cnNames = array_column($cnNet['nodes'] ?? [], 'name');
$cnTied = [];
foreach (($cnNet['links'] ?? []) as $l) { $cnTied[$l['source']] = true; $cnTied[$l['target']] = true; }
check(count($cnNames) === 4 && !array_diff(['A', 'X', 'B'], $cnNames), 'coAuthorNetwork: the cap keeps both hubs and the person who links them');
check(!in_array('C', $cnNames, true) && !in_array('D', $cnNames, true), 'coAuthorNetwork: a separate pair does not take a slot');
check(count($cnTied) === count($cnNames), 'coAuthorNetwork: no node is drawn without a tie');
$cnComm = array_values(array_unique(array_column($cnNet['nodes'] ?? [], 'community')));
sort($cnComm);
check($cnComm === range(0, count($cnNet['communities'] ?? []) - 1), 'coAuthorNetwork: communities are numbered over the nodes shown');

// --- buildCoAuthorNetwork returns a graph within the cap whole ---
$allNet = $aggregators->buildCoAuthorNetwork(array_keys($cnLits), [], $cnLits, []);
check(count($allNet['nodes'] ?? []) === 15, 'coAuthorNetwork: every component is shown when the graph fits the cap');

// --- buildCoAuthorNetwork folds the groups past the palette into one ---
// Fourteen separate pairs are fourteen communities: the eleven largest keep
// their colour, the other three share the merged remainder, listed last.
$mgLits = [];
for ($k = 0; $k < 14; $k++) {
    for ($r = 0; $r <= ($k < 11 ? 1 : 0); $r++) { $mgLits[700 + $k * 2 + $r] = ['bibo:authorList' => ['P' . $k, 'Q' . $k]]; }
}
$mgNet = $aggregators->buildCoAuthorNetwork(array_keys($mgLits), [], $mgLits, [], 1, PHP_INT_MAX);
$mgComms = $mgNet['communities'] ?? [];
check(count($mgComms) === A::COMMUNITY_COLOURS, 'coAuthorNetwork: no more communities than the palette has colours');
$mgLast = end($mgComms);
check(!empty($mgLast['merged']) && $mgLast['size'] === 6 && $mgLast['anchor'] === null, 'coAuthorNetwork: the smallest groups share the merged community, listed last');

// --- personAffiliations: research centres and memberships are the cluster ---
$afItems = [
    1 => ['title' => 'Africa Multiple Research Centres', 'template_id' => 6],
    2 => ['title' => 'Cooperation partners', 'template_id' => 6],
    10 => ['title' => 'Rhodes University', 'template_id' => 2],
    11 => ['title' => 'Institute at Rhodes', 'template_id' => 2],
    12 => ['title' => 'Partner university', 'template_id' => 2],
    13 => ['title' => 'Elsewhere', 'template_id' => 2],
    20 => ['title' => 'Centre person', 'template_id' => 4],
    21 => ['title' => 'Partner person', 'template_id' => 4],
    22 => ['title' => 'Project member', 'template_id' => 4],
    23 => ['title' => 'Unaffiliated', 'template_id' => 4],
    24 => ['title' => 'Partner and centre', 'template_id' => 4],
    30 => ['title' => 'Project', 'template_id' => 5],
];
$afLinks = [
    10 => [['dcterms:isPartOf', 'Part of', 1]],
    11 => [['dcterms:isPartOf', 'Part of', 10]],
    12 => [['dcterms:isPartOf', 'Part of', 2]],
    20 => [['dcterms:isPartOf', 'Part of', 11]],
    21 => [['dcterms:isPartOf', 'Part of', 12]],
    23 => [['dcterms:isPartOf', 'Part of', 13]],
    24 => [['dcterms:isPartOf', 'Part of', 12], ['dcterms:isPartOf', 'Part of', 10]],
    30 => [['foaf:member', 'Member', 22], ['foaf:member', 'Member', 21]],
];
$af = $aggregators->personAffiliations($afItems, $afLinks, [1 => 'amrc', 2 => 'cooperation'], [5]);
check($af === [20 => 'cluster', 21 => 'cluster', 22 => 'cluster', 24 => 'cluster'], 'personAffiliations: centre (through a parent institute) and project members are the cluster');
$af2 = $aggregators->personAffiliations($afItems, $afLinks, [1 => 'amrc', 2 => 'cooperation'], []);
check(($af2[21] ?? null) === 'partner' && !isset($af2[22]) && !isset($af2[23]), 'personAffiliations: a partner affiliation alone is a partner; no record, no affiliation');
$afNet = $aggregators->buildCoAuthorNetwork([800, 801], [800 => [['bibo:authorList', 'A', 20], ['bibo:authorList', 'A', 23]], 801 => [['bibo:authorList', 'A', 20], ['bibo:authorList', 'A', 22]]], [], $afItems, 1, 120, $af);
$afOf = array_column($afNet['nodes'] ?? [], 'affiliation', 'name');
check(($afOf['Centre person'] ?? null) === 'cluster' && !isset($afOf['Unaffiliated']), 'coAuthorNetwork: nodes carry the affiliation they have');

// --- louvainMultiLevel merges what one local-moving pass leaves apart ---
// A ring of 12 triangles: one pass stops at the triangles, but pairing
// neighbouring triangles scores higher modularity, and only the collapse step
// can reach it. Triangles are never split.
$ringAdj = [];
$ringDeg = [];
$tie = function (int $a, int $b) use (&$ringAdj, &$ringDeg): void {
    $ringAdj[$a][$b] = 1;
    $ringAdj[$b][$a] = 1;
    $ringDeg[$a] = ($ringDeg[$a] ?? 0) + 1;
    $ringDeg[$b] = ($ringDeg[$b] ?? 0) + 1;
};
for ($t = 0; $t < 12; $t++) {
    $tie(3 * $t, 3 * $t + 1);
    $tie(3 * $t + 1, 3 * $t + 2);
    $tie(3 * $t, 3 * $t + 2);
    $tie(3 * $t + 2, 3 * (($t + 1) % 12));
}
$ringM = array_sum($ringDeg) / 2.0;
$onePass = (new ReflectionMethod($aggregators, 'louvain'))->invoke($aggregators, $ringAdj, $ringDeg, $ringM);
$multi = (new ReflectionMethod($aggregators, 'louvainMultiLevel'))->invoke($aggregators, $ringAdj, $ringDeg, $ringM);
$wholeTriangles = true;
for ($t = 0; $t < 12; $t++) {
    if ($multi[3 * $t] !== $multi[3 * $t + 1] || $multi[3 * $t] !== $multi[3 * $t + 2]) { $wholeTriangles = false; }
}
check(count(array_unique($onePass)) === 12, 'louvain: one pass on a ring of triangles stops at the triangles');
check(count(array_unique($multi)) < 12 && count(array_unique($multi)) >= 2, 'louvainMultiLevel: merges neighbouring triangles');
check($wholeTriangles, 'louvainMultiLevel: never splits a triangle');

// --- media charts: duration bands + curated PHP word-form fallback ---
$duration = $aggregators->buildDurationHistogram([0, 15 * 60, 25 * 60, 65 * 60]);
check($duration === [
    ['name' => 'Under 20 min', 'value' => 1],
    ['name' => '20–30 min', 'value' => 1],
    ['name' => '60 min +', 'value' => 1],
], 'duration histogram drops invalid/empty bands and preserves natural order');
$fallbackCloud = $aggregators->buildTranscriptWordCloud([
    '[music] Speaker 1: Studies studying study. Work working works.',
    'Études étude. Travaux travail. Communities community.',
]);
$fallbackCounts = [];
foreach ($fallbackCloud ?? [] as $entry) {
    $fallbackCounts[$entry['name']] = $entry['value'];
}
check(($fallbackCounts['study'] ?? null) === 3
    && ($fallbackCounts['work'] ?? null) === 3
    && ($fallbackCounts['étude'] ?? null) === 2
    && ($fallbackCounts['travail'] ?? null) === 2
    && ($fallbackCounts['community'] ?? null) === 2,
    'transcript fallback merges curated English/French word forms into readable lemmas');
check(!isset($fallbackCounts['speaker'], $fallbackCounts['music']),
    'transcript fallback strips diarisation labels and audio cues');
$abstractCloud = $aggregators->buildMultilingualWordCloud([
    'The memory of the city is the subject of this archive, and of its memory.',
    'The archive of the city and the memory of its people in the colonial archive.',
    'Die Erinnerung an die Stadt und das Archiv der Stadt, mit der Erinnerung, war ein Thema.',
    'La mémoire de la ville et les archives de la ville dans les récits.',
    'Ekiwandiiko kino kilagira ddala bulungi.',
]);
$cloudWords = static fn (string $lang): array => array_column($abstractCloud['byLang'][$lang] ?? [], 'value', 'name');
check(($abstractCloud['languages'] ?? null) === ['en', 'fr', 'de'],
    'abstract cloud buckets each text by language, the most-used language first');
check(($cloudWords('en')['memory'] ?? null) === 3 && ($cloudWords('en')['archive'] ?? null) === 3
    && ($cloudWords('de')['erinnerung'] ?? null) === 2 && ($cloudWords('fr')['ville'] ?? null) === 2,
    'abstract cloud counts each language\'s words in its own bucket');
check(array_intersect(['und', 'die', 'der', 'das', 'mit', 'war'], array_keys($cloudWords('de'))) === []
    && !isset($cloudWords('en')['und']),
    'abstract cloud stops German function words, and German "war" only in German');
check(!array_filter($abstractCloud['byLang']['en'], static fn (array $e): bool => isset($e['generic'])),
    'abstract cloud flags no academic words unless asked to');
$academicCloud = $aggregators->buildMultilingualWordCloud([
    'This article is a study of the archive, and the study of the archive of the city.',
    'The paper and the article examine the memory of the city in the archive.',
], 1, true);
$academicFlags = array_column($academicCloud['byLang']['en'] ?? [], 'generic', 'name');
check(($academicFlags['article'] ?? null) === true && ($academicFlags['study'] ?? null) === true
    && !isset($academicFlags['archive']) && array_key_exists('archive', array_column($academicCloud['byLang']['en'], 'value', 'name')),
    'abstract cloud flags academic words, and keeps $topN words besides them');
check($aggregators->buildMultilingualWordCloud(['archive memory archive memory']) === [
    ['name' => 'archive', 'value' => 2], ['name' => 'memory', 'value' => 2],
], 'abstract cloud falls back to one mixed cloud when no language can be told');

// --- knowledge graph (IDF-ranked shared-item discovery) ---
$kgItems = [
    1 => ['title' => 'Center', 'class_label' => 'Article', 'class_term' => 'fabio:JournalArticle', 'template_id' => 11],
    2 => ['title' => 'Sibling', 'class_label' => 'Article', 'class_term' => 'fabio:JournalArticle', 'template_id' => 11],
    10 => ['title' => 'Subject A', 'class_label' => 'Subject', 'class_term' => '', 'template_id' => 6],
    11 => ['title' => 'Subject B', 'class_label' => 'Subject', 'class_term' => '', 'template_id' => 6],
];
$kgLinks = [
    1 => [['dcterms:subject', 'Subject', 10], ['dcterms:subject', 'Subject', 11]],
    2 => [['dcterms:subject', 'Subject', 10]],
];
$kgReverseLinks = [10 => ['dcterms:subject' => [1, 2]], 11 => ['dcterms:subject' => [1]]];
$kgReverse = KG::buildShareableReverse($kgReverseLinks);
[$kgIdf, $kgFreq] = KG::computeResourceStats($kgLinks, 4);
check(abs(($kgFreq[10] ?? 0) - 50.0) < 0.01, 'KG computeResourceStats: subject shared by 2/4 items = 50%');
$g = KG::buildGraph(1, $kgItems, $kgLinks, $kgReverseLinks, $kgReverse, $kgIdf, $kgFreq);
check($g !== null, 'KG buildGraph returns a graph');
$kgIds = array_map(static fn ($n) => $n['id'], $g['nodes'] ?? []);
check(in_array('item_1', $kgIds, true) && in_array('resource_10', $kgIds, true) && in_array('resource_11', $kgIds, true), 'KG: center + direct subject nodes');
check(in_array('item_2', $kgIds, true), 'KG: discovers shared item via co-occurring subject');
$kgShared = false;
foreach ($g['edges'] ?? [] as $e) { if (!empty($e['isShared'])) { $kgShared = true; } }
check($kgShared, 'KG: shared edge carries isShared/idf metadata');
check(isset($g['stats']['maxStrength'], $g['stats']['maxFreqPct']), 'KG: stats present');
check(KG::buildItemMap(1, $kgLinks, []) === null, 'KG buildItemMap null without geo');

// --- assignCommunities: co-occurring neighbours (via shared items) form a cluster ---
$cgNodes = [
    ['id' => 'item_1', 'isCenter' => true],
    ['id' => 'resource_10'], ['id' => 'resource_11'], ['id' => 'resource_12'],
    ['id' => 'item_2'], ['id' => 'item_3'],
];
$cgEdges = [
    ['source' => 'item_1', 'target' => 'resource_10'],
    ['source' => 'item_1', 'target' => 'resource_11'],
    ['source' => 'item_1', 'target' => 'resource_12'], // lone attribute (centre only)
    ['source' => 'item_2', 'target' => 'resource_10', 'isShared' => true],
    ['source' => 'item_2', 'target' => 'resource_11', 'isShared' => true],
    ['source' => 'item_3', 'target' => 'resource_10', 'isShared' => true],
    ['source' => 'item_3', 'target' => 'resource_11', 'isShared' => true],
];
[$cgOut, $cgCount] = KG::assignCommunities($cgNodes, $cgEdges);
$cgCommunity = [];
foreach ($cgOut as $cgN) { $cgCommunity[$cgN['id']] = $cgN['community']; }
check($cgCount === 1, 'assignCommunities finds one cluster among shared neighbours');
check($cgCommunity['item_1'] === -1, 'assignCommunities leaves the centre uncoloured');
check($cgCommunity['resource_12'] === -1, 'assignCommunities leaves a centre-only leaf uncoloured');
check($cgCommunity['resource_10'] === 0 && $cgCommunity['resource_11'] === 0
    && $cgCommunity['item_2'] === 0 && $cgCommunity['item_3'] === 0,
    'assignCommunities groups co-occurring entities + their shared items together');

// --- buildBoxplot (items-per-project per section; <2 boxes => null) ---
$bpSections = [10 => ['title' => 'Sec A'], 20 => ['title' => 'Sec B']];
$bpChildren = [10 => [100, 101], 20 => [200], 100 => [1, 2, 3], 101 => [4, 5], 200 => [6]];
check($aggregators->buildBoxplot($bpSections, $bpChildren) === [['name' => 'Sec A', 'values' => [3, 2]], ['name' => 'Sec B', 'values' => [1]]], 'buildBoxplot one box per section');
check($aggregators->buildBoxplot([10 => ['title' => 'Sec A']], $bpChildren) === null, 'buildBoxplot null with <2 boxes');

// --- buildTimeChord (per-year subject co-occurrence) ---
$tcItems = [
    1 => ['title' => 'I1'], 2 => ['title' => 'I2'], 3 => ['title' => 'I3'], 4 => ['title' => 'I4'],
    10 => ['title' => 'S1'], 11 => ['title' => 'S2'], 12 => ['title' => 'S3'],
];
$tcLinks = [
    1 => [['dcterms:subject', 'S', 10], ['dcterms:subject', 'S', 11]],
    2 => [['dcterms:subject', 'S', 10], ['dcterms:subject', 'S', 11]],
    3 => [['dcterms:subject', 'S', 11], ['dcterms:subject', 'S', 12]],
    4 => [['dcterms:subject', 'S', 11], ['dcterms:subject', 'S', 12]],
];
$tcYear = [1 => '2019', 2 => '2019', 3 => '2020', 4 => '2020'];
$tc = $aggregators->buildTimeChord([1, 2, 3, 4], $tcLinks, $tcItems, $tcYear);
check($tc !== null && count($tc['buckets']) === 2 && $tc['years'] === ['2019', '2020'], 'buildTimeChord 2 year buckets');
check($tc !== null && $tc['buckets'][0]['year'] === '2019' && count($tc['buckets'][0]['links']) >= 1, 'buildTimeChord bucket carries chord links');

// --- buildWhatsNew (windows off max-created + top projects) ---
$wnItems = [
    1 => ['title' => 'New1', 'created' => '2024-12-01', 'template_id' => 10],
    2 => ['title' => 'New2', 'created' => '2024-11-15', 'template_id' => 10],
    3 => ['title' => 'Old',  'created' => '2023-01-01', 'template_id' => 10],
    50 => ['title' => 'Proj', 'created' => '2020-01-01', 'template_id' => 5],
];
$wn = $aggregators->buildWhatsNew($wnItems, [50 => [1, 2, 3]]);
check($wn !== null && $wn['reference'] === '2024-12-01', 'buildWhatsNew reference = max created');
$w3 = $wn['windows'][0];
check($w3['months'] === 3 && $w3['count'] === 2, 'buildWhatsNew 3-month window has 2 recent items');
check(count($w3['topProjects']) === 1 && $w3['topProjects'][0]['itemId'] === 50 && $w3['topProjects'][0]['value'] === 2, 'buildWhatsNew top project counts recent items');

// --- buildStatCards (reusable stat-card assembler) ---
check($aggregators->buildStatCards([
    ['key' => 'researchItems', 'label' => 'Research Items', 'value' => 3975],
    ['key' => 'projects', 'label' => 'Projects', 'value' => 92],
]) === [
    ['key' => 'researchItems', 'label' => 'Research Items', 'value' => 3975],
    ['key' => 'projects', 'label' => 'Projects', 'value' => 92],
], 'buildStatCards passes well-formed cards through in order');
check($aggregators->buildStatCards([
    ['key' => 'a', 'label' => 'A', 'value' => 5],
    ['key' => 'b', 'label' => 'B', 'value' => 0],
    ['key' => 'c', 'label' => 'C', 'value' => -3],
]) === [['key' => 'a', 'label' => 'A', 'value' => 5]], 'buildStatCards drops zero / negative cards');
check($aggregators->buildStatCards([['key' => 'x', 'label' => 'X', 'value' => '12']]) === [['key' => 'x', 'label' => 'X', 'value' => 12]], 'buildStatCards casts value to int');
check($aggregators->buildStatCards([['key' => 'loc', 'label' => 'Locations', 'value' => 142, 'subtitle' => 'in 57 countries']]) === [['key' => 'loc', 'label' => 'Locations', 'value' => 142, 'subtitle' => 'in 57 countries']], 'buildStatCards keeps a non-empty subtitle');
check($aggregators->buildStatCards([['key' => 'loc', 'label' => 'Locations', 'value' => 1, 'subtitle' => null]]) === [['key' => 'loc', 'label' => 'Locations', 'value' => 1]], 'buildStatCards strips a null subtitle');
check($aggregators->buildStatCards([['label' => 'No key', 'value' => 9], ['key' => 'k', 'value' => 9]]) === [], 'buildStatCards drops cards missing key or label');
check($aggregators->buildStatCards([]) === [], 'buildStatCards empty input -> empty list');

// --- clusterPartners (data-driven from isPartOf -> category authority) ---
$cpItems = [
    37685 => ['title' => 'Africa Multiple Research Centres', 'class_term' => ''],
    39072 => ['title' => 'Cooperation partners', 'class_term' => ''],
    39071 => ['title' => 'Global partner Centres of African Studies', 'class_term' => ''],
    100 => ['title' => 'University of Bayreuth', 'class_term' => 'foaf:Organization'],
    101 => ['title' => 'University of Dar es Salaam', 'class_term' => 'foaf:Organization'],
    102 => ['title' => 'No-geo Institute', 'class_term' => 'foaf:Organization'],
    103 => ['title' => 'Uncategorised Org', 'class_term' => 'foaf:Organization'],
    104 => ['title' => 'A Person', 'class_term' => 'foaf:Person'],
];
$cpLinks = [
    100 => [['dcterms:isPartOf', 'Is Part Of', 37685]],
    101 => [['dcterms:isPartOf', 'Is Part Of', 39072]],
    102 => [['dcterms:isPartOf', 'Is Part Of', 37685]],   // categorised but no geo -> excluded
    103 => [['dcterms:isPartOf', 'Is Part Of', 999]],      // isPartOf a non-category -> excluded
    104 => [['dcterms:isPartOf', 'Is Part Of', 37685]],    // not an Organization -> excluded
];
$cpGeo = [
    100 => ['name' => 'University of Bayreuth', 'lat' => 49.92885, 'lon' => 11.5859],
    101 => ['name' => 'University of Dar es Salaam', 'lat' => -6.7816, 'lon' => 39.2057],
    104 => ['name' => 'A Person', 'lat' => 1.0, 'lon' => 2.0],
];
$cpAuth = [37685 => 'amrc', 39072 => 'cooperation', 39071 => 'global']; // ordered
$cp = $aggregators->clusterPartners($cpItems, $cpLinks, $cpGeo, $cpAuth);
check(count($cp['points']) === 2, 'clusterPartners: only geocoded, categorised Organizations (2)');
check($cp['points'][0]['category'] === 'amrc' && $cp['points'][0]['label'] === 'University of Bayreuth', 'clusterPartners: AMRC sorts first, label from geo name');
check($cp['points'][0]['sublabel'] === 'Africa Multiple Research Centres' && $cp['points'][0]['itemId'] === 100, 'clusterPartners: sublabel = authority title, itemId set');
check($cp['categories'] === [['key' => 'amrc', 'label' => 'Africa Multiple Research Centres'], ['key' => 'cooperation', 'label' => 'Cooperation partners']], 'clusterPartners: ordered categories labelled from authorities, empty "global" dropped');
check($aggregators->clusterPartners([], [], [], $cpAuth) === [], 'clusterPartners: empty when no partners');

// --- buildEntityGraph (multi-entity co-occurrence; affiliations; LCSH/Tag; Louvain) ---
// Entity ids (10,11,12,20,100,101,200) are kept disjoint from the research-item
// ids (1000+) so the two namespaces never collide, as in the real data.
$egItems = [
    100 => ['title' => 'Jane', 'template_id' => 4, 'class_term' => 'foaf:Person'],
    101 => ['title' => 'John', 'template_id' => 4, 'class_term' => 'foaf:Person'],
    200 => ['title' => 'University X', 'template_id' => 2, 'class_term' => 'foaf:Organization'],
    10 => ['title' => 'Islam', 'class_term' => ''],
    11 => ['title' => 'Politics', 'class_term' => ''],
    12 => ['title' => 'Fieldwork', 'class_term' => ''],
    20 => ['title' => 'Lagos', 'class_term' => ''],
];
$egLinks = [
    100 => [['dcterms:isPartOf', 'Affiliation', 200]], // Jane is affiliated with University X
];
$rid = 1000;
$egAdd = function (array $rels) use (&$egLinks, &$rid) { $egLinks[$rid++] = $rels; };
for ($k = 0; $k < 5; $k++) { $egAdd([['dcterms:creator', 'Creator', 100], ['dcterms:subject', 'Subject', 10], ['dcterms:spatial', 'Origin', 20]]); }
for ($k = 0; $k < 5; $k++) { $egAdd([['dcterms:creator', 'Creator', 101], ['dcterms:subject', 'Subject', 11], ['dcterms:subject', 'Tag', 12]]); }
for ($k = 0; $k < 2; $k++) { $egAdd([['dcterms:subject', 'Subject', 10], ['dcterms:subject', 'Subject', 11]]); } // bridge
$eg = $aggregators->buildEntityGraph(range(1000, $rid - 1), $egLinks, $egItems, [10, 11], 2);
check($eg !== null, 'buildEntityGraph returns a graph');
check($eg['types'] === ['Person', 'Organisation', 'Location', 'Subject', 'Tag'], 'buildEntityGraph emits the five entity types');
$egById = [];
foreach ($eg['nodes'] as $nd) { $egById[$nd[0]] = $nd; } // row: [id, label, type, count, degree, community, section, lng, lat, rank]
check(count($eg['nodes']) === 7, 'buildEntityGraph: 7 entity nodes (incl. affiliated org)');
check(($egById[200][2] ?? null) === 1, 'buildEntityGraph: organization surfaced via author affiliation');
check(($egById[10][2] ?? null) === 3 && ($egById[12][2] ?? null) === 4, 'buildEntityGraph: LCSH subject (3) vs free tag (4) split');
check(($egById[20][2] ?? null) === 2, 'buildEntityGraph: location typed from dcterms:spatial');
check(count($eg['edges']) === 10 && $eg['meta']['edgeCount'] === 10, 'buildEntityGraph: 10 co-occurrence edges');
check(($eg['meta']['communityCount'] ?? 0) === 2, 'buildEntityGraph: two Louvain communities');
$egCa = $egById[100][5];
$egCb = $egById[101][5];
check($egCa !== -1 && $egCb !== -1 && $egCa !== $egCb, 'buildEntityGraph: the two author clusters land in distinct communities');
check($egById[200][5] === $egCa && $egById[20][5] === $egCa, 'buildEntityGraph: org + location share their author\'s community');
// A place of publication is not a person, and an organisation credited as a
// sponsor is an organisation, not a person.
$egPlaceItems = $egItems + [
    300 => ['title' => 'Bayreuth', 'class_term' => 'dcterms:Location'],
    201 => ['title' => 'Sponsor Y', 'template_id' => 2, 'class_term' => 'foaf:Organization'],
];
$egPlaceLinks = $egLinks;
for ($k = 0; $k < 3; $k++) {
    $egPlaceLinks[2000 + $k] = [['bibo:authorList', 'Author', 100], ['marcrel:pup', 'Place', 300], ['marcrel:spn', 'Sponsor', 201]];
}
$egPlace = $aggregators->buildEntityGraph(array_merge(range(1000, $rid - 1), [2000, 2001, 2002]), $egPlaceLinks, $egPlaceItems, [10, 11], 2);
$egPlaceById = [];
foreach ($egPlace['nodes'] as $nd) { $egPlaceById[$nd[0]] = $nd; }
check(!isset($egPlaceById[300]), 'buildEntityGraph: a place of publication is not an entity');
check(($egPlaceById[201][2] ?? null) === 1, 'buildEntityGraph: an organisation credited as sponsor is typed Organisation');

// Baked ForceAtlas2 positions (pseudo lng/lat) + label rank + bounds envelope.
check(($eg['meta']['columns']['nodes'] ?? []) === ['id', 'label', 'type', 'count', 'degree', 'community', 'section', 'lng', 'lat', 'rank'],
    'buildEntityGraph: node columns advertise baked lng/lat/rank');
check(count($eg['nodes'][0]) === 10, 'buildEntityGraph: each node row carries 10 fields');
$egFinite = true;
$egLngs = [];
foreach ($eg['nodes'] as $nd) {
    if (!is_finite($nd[7]) || !is_finite($nd[8]) || abs($nd[7]) > 140.001 || abs($nd[8]) > 86) { $egFinite = false; }
    $egLngs[(string) round($nd[7], 3)] = true;
}
check($egFinite, 'buildEntityGraph: every node has a finite lng/lat inside the layout plane');
check(count($egLngs) > 1, 'buildEntityGraph: ForceAtlas2 spreads the nodes (not collapsed to one point)');
$egBounds = $eg['meta']['bounds'] ?? null;
check(is_array($egBounds) && count($egBounds) === 4 && $egBounds[0] <= $egBounds[2] && $egBounds[1] <= $egBounds[3],
    'buildEntityGraph: meta.bounds is a valid [w,s,e,n] envelope');
$egRanks = array_map(static function ($nd) { return $nd[9]; }, $eg['nodes']);
sort($egRanks);
check($egRanks === range(0, count($eg['nodes']) - 1), 'buildEntityGraph: label ranks are a 0..n-1 permutation');
check(($egById[10][9] ?? null) === 0, 'buildEntityGraph: the top hub (Islam) gets label rank 0');
// With no $itemSection map, the section overlay is inert: no section labels, every node -1.
check(($eg['sections'] ?? null) === [], 'buildEntityGraph: sections empty without an itemSection map');
check(($egById[10][6] ?? null) === -1, 'buildEntityGraph: section defaults to -1 (no sectioned work)');
check($aggregators->buildEntityGraph(range(1000, $rid - 1), $egLinks, $egItems, [10, 11], 99) === null, 'buildEntityGraph: null when the weight threshold prunes every edge');

// --- buildEntityGraph: research-section overlay (dominant section + bridge) ---
// Section each work so Jane's items are all Knowledges (a clean majority), while
// John's five items split Learning/Mobilities/Knowledges 2:2:1 (no majority => bridge).
$egSectionMap = [];
foreach ([1000, 1001, 1002, 1003, 1004] as $iid) { $egSectionMap[$iid] = 'Knowledges'; }
$egSectionMap[1005] = 'Learning';   $egSectionMap[1006] = 'Learning';
$egSectionMap[1007] = 'Mobilities'; $egSectionMap[1008] = 'Mobilities';
$egSectionMap[1009] = 'Knowledges';
$egS = $aggregators->buildEntityGraph(range(1000, $rid - 1), $egLinks, $egItems, [10, 11], 2, 1200, $egSectionMap);
$egSById = [];
foreach ($egS['nodes'] as $nd) { $egSById[$nd[0]] = $nd; }
check(($egS['sections'] ?? []) === ['Knowledges', 'Learning', 'Mobilities'],
    'buildEntityGraph: sections ordered by weight (Knowledges), then name (Learning<Mobilities)');
check(($egS['meta']['sectionCount'] ?? null) === 3, 'buildEntityGraph: meta.sectionCount counts the sections');
check(($egS['sections'][$egSById[100][6]] ?? null) === 'Knowledges',
    'buildEntityGraph: Jane resolves to her majority section (Knowledges)');
check(($egSById[200][6] ?? null) === $egSById[100][6],
    'buildEntityGraph: the affiliated org inherits its author\'s section');
check(($egSById[101][6] ?? null) === -2, 'buildEntityGraph: John, split evenly across sections, is a bridge (-2)');

// --- Homonyms: graph series join links to nodes by NAME, so two people who
// share a title must not collapse into one node (person 900 and 901 below).
$hItems = [
    900 => ['title' => 'Smith, John', 'template_id' => 4],
    901 => ['title' => 'Smith, John', 'template_id' => 4],
    910 => ['title' => 'Project X', 'template_id' => 5],
    920 => ['title' => 'Item 920'], 921 => ['title' => 'Item 921'],
];
$hLinks = [
    // 920 lists person 900 twice (two roles): it must still count once.
    920 => [['dcterms:creator', 'Creator', 900], ['marcrel:aut', 'Author', 900], ['dcterms:isPartOf', 'Is part of', 910]],
    921 => [['dcterms:creator', 'Creator', 901], ['dcterms:isPartOf', 'Is part of', 910]],
];
$hNet = $aggregators->buildGlobalContributorNetwork([920, 921], $hItems, $hLinks);
$hNames = array_column($hNet['nodes'] ?? [], 'name', 'itemId');
check(count($hNet['nodes'] ?? []) === 3 && $hNames[900] !== $hNames[901],
    'contributor network: homonymous people stay two nodes');
check(($hNames[900] ?? '') === 'Smith, John (#900)', 'contributor network: a homonym is suffixed with its id');
check(count(array_unique(array_merge(array_column($hNet['links'], 'source'), array_column($hNet['links'], 'target'))))
    === 3, 'contributor network: every link endpoint names exactly one node');
$hPerson = $aggregators->buildContributorNetwork(910, 'Project X', [920, 921], $hItems, $hLinks, []);
$hValues = array_column($hPerson['nodes'] ?? [], 'value', 'itemId');
check(($hValues[900] ?? null) === 1, 'contributor network: two roles on one item count once');

echo $failures ? "\n$failures FAILURE(S)\n" : "\nALL PHP AGGREGATOR TESTS PASS\n";
exit($failures ? 1 : 0);
