<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/Precompute/DataSelection.php';

use DreVisualizations\Precompute\DataSelection;

$failures = 0;
function selectionCheck(bool $condition, string $message): void
{
    global $failures;
    if ($condition) {
        echo "ok: $message\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $message\n");
}

$dates = DataSelection::preferredDates([
    [1, '2022-04-05', 'dcterms:created', 30],
    [1, '2024', 'dcterms:issued', 40],
    [1, '2023', 'dcterms:issued', 20],
    [2, 'not a date', 'dcterms:issued', 1],
    [2, '2019/2020', 'dcterms:date', 2],
    [3, '2018', 'fabio:hasDateCollected', 9],
]);
selectionCheck(($dates['itemYear'][1] ?? null) === '2023'
    && ($dates['itemDate'][1] ?? null) === '2023',
    'issued wins over created and lower value id breaks same-term ties');
selectionCheck(($dates['itemYear'][2] ?? null) === '2019',
    'an invalid higher-priority value falls through to the next valid date');
selectionCheck(($dates['itemYear'][3] ?? null) === '2018', 'collected date is used as the final fallback');

$geo = DataSelection::coherentCoordinates([
    [10, 'Equator', 'geo:long', '12.5', 6],
    [10, 'Equator', 'geo:lat', '0', 5],
    [11, 'Multiple', 'geo:lat', '95', 1],
    [11, 'Multiple', 'geo:long', '20', 2],
    [11, 'Multiple', 'geo:long', '30', 4],
    [11, 'Multiple', 'geo:lat', '10', 3],
    [12, 'Incomplete', 'geo:lat', '4', 1],
    [13, 'Bad longitude', 'geo:lat', '4', 1],
    [13, 'Bad longitude', 'geo:long', '181', 2],
]);
selectionCheck(isset($geo[10]) && $geo[10]['lat'] === 0.0 && $geo[10]['lon'] === 12.5,
    'zero latitude is a valid coherent pair');
selectionCheck(isset($geo[11]) && $geo[11]['lat'] === 10.0 && $geo[11]['lon'] === 30.0,
    'invalid first pair is skipped without mixing it with the second pair');
selectionCheck(!isset($geo[12], $geo[13]), 'incomplete and out-of-range coordinates are rejected');

echo $failures ? "\n$failures FAILURE(S)\n" : "\nALL DATA SELECTION TESTS PASS\n";
exit($failures ? 1 : 0);
