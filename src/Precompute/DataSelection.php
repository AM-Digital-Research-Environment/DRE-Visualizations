<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

/** Pure deterministic selectors for ambiguous multi-value Omeka metadata. */
final class DataSelection
{
    private const DATE_PRIORITY = [
        'dcterms:issued' => 1,
        'dcterms:created' => 2,
        'dcterms:date' => 3,
        'fabio:hasDateCollected' => 4,
    ];

    /**
     * @param list<array{0:mixed,1:mixed,2:mixed,3:mixed}> $rows
     * @return array{itemYear:array<int,string>,itemDate:array<int,string>}
     */
    public static function preferredDates(array $rows): array
    {
        $candidates = [];
        foreach ($rows as $row) {
            $itemId = (int) $row[0];
            $raw = trim((string) $row[1]);
            $term = (string) $row[2];
            if ($itemId < 1 || $raw === '' || !isset(self::DATE_PRIORITY[$term])
                || !preg_match('/(\d{4})/', $raw, $match)) {
                continue;
            }
            $rank = self::DATE_PRIORITY[$term];
            $valueId = (int) $row[3];
            $current = $candidates[$itemId] ?? null;
            if ($current === null || $rank < $current['rank']
                || ($rank === $current['rank'] && $valueId < $current['valueId'])) {
                $candidates[$itemId] = [
                    'rank' => $rank,
                    'valueId' => $valueId,
                    'year' => $match[1],
                    'date' => $raw,
                ];
            }
        }
        ksort($candidates, SORT_NUMERIC);
        $years = [];
        $dates = [];
        foreach ($candidates as $itemId => $candidate) {
            $years[$itemId] = $candidate['year'];
            $dates[$itemId] = $candidate['date'];
        }
        return ['itemYear' => $years, 'itemDate' => $dates];
    }

    /**
     * Pair the nth latitude and longitude in value-id order and keep the first
     * numeric pair inside WGS84 ranges.
     *
     * @param list<array{0:mixed,1:mixed,2:mixed,3:mixed,4:mixed}> $rows
     * @return array<int,array{name:string,lat:float,lon:float,itemId:int}>
     */
    public static function coherentCoordinates(array $rows): array
    {
        usort($rows, static fn (array $a, array $b): int => ((int) $a[0] <=> (int) $b[0])
            ?: ((int) $a[4] <=> (int) $b[4]));
        $candidates = [];
        foreach ($rows as $row) {
            $itemId = (int) $row[0];
            if ($itemId < 1) continue;
            $candidates[$itemId]['title'] = ($row[1] !== null && $row[1] !== '')
                ? (string) $row[1]
                : ('Location ' . $itemId);
            $axis = (string) $row[2] === 'geo:lat' ? 'lat'
                : ((string) $row[2] === 'geo:long' ? 'lon' : null);
            if ($axis !== null) {
                $candidates[$itemId][$axis][] = $row[3];
            }
        }

        $geo = [];
        foreach ($candidates as $itemId => $candidate) {
            $latitudes = $candidate['lat'] ?? [];
            $longitudes = $candidate['lon'] ?? [];
            for ($i = 0, $pairs = min(count($latitudes), count($longitudes)); $i < $pairs; $i++) {
                if (!is_numeric($latitudes[$i]) || !is_numeric($longitudes[$i])) continue;
                $lat = (float) $latitudes[$i];
                $lon = (float) $longitudes[$i];
                if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) continue;
                $geo[$itemId] = [
                    'name' => $candidate['title'],
                    'lat' => $lat,
                    'lon' => $lon,
                    'itemId' => $itemId,
                ];
                break;
            }
        }
        ksort($geo, SORT_NUMERIC);
        return $geo;
    }
}
