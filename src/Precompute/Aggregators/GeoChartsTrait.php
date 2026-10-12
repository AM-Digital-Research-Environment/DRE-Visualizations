<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute\Aggregators;

use DreVisualizations\Precompute\Roles;

/**
 * Geography: country point-in-polygon indexing, the per-country
 * choropleth, the countries publications appeared in, the publications
 * issued in each place, and the origin→current geographic flow arcs.
 *
 * Composed into {@see \DreVisualizations\Precompute\Aggregators}; its methods
 * reach shared constants and helpers on that class through `self::`.
 */
trait GeoChartsTrait
{
    // Provided by SupportTrait / Aggregators (or another trait); declared so
    // this trait states what it relies on and PHP checks the signatures.
    abstract private function sortByValueDesc(array $rows): array;
    abstract private function sortCounts(array &$counts): void;

    /** Build geographic flow data: origin -> current location arcs. */
    public function buildGeoFlows(array $itemIds, array $links, array $items, array $geo): ?array
    {
        $flows = [];
        foreach ($itemIds as $iid) {
            $origins = [];
            $currents = [];
            foreach ($links[$iid] ?? [] as [$term, $label, $vrid]) {
                if ($term === 'dcterms:spatial' && isset($geo[$vrid])) {
                    $origins[] = $vrid;
                } elseif ($term === 'dcterms:provenance' && isset($geo[$vrid])) {
                    $currents[] = $vrid;
                }
            }
            foreach ($origins as $o) {
                foreach ($currents as $c) {
                    if ($o !== $c) {
                        $flows[$o . ',' . $c] = ($flows[$o . ',' . $c] ?? 0) + 1;
                    }
                }
            }
        }
        if (!$flows) {
            return null;
        }

        $nodeIds = [];
        foreach (array_keys($flows) as $key) {
            [$o, $c] = array_map('intval', explode(',', $key));
            $nodeIds[$o] = true;
            $nodeIds[$c] = true;
        }
        $nodes = [];
        foreach (array_keys($nodeIds) as $nid) {
            $nodes[] = ['name' => $geo[$nid]['name'], 'lat' => $geo[$nid]['lat'], 'lon' => $geo[$nid]['lon'], 'itemId' => $nid];
        }

        $this->sortCounts($flows);
        $flowLinks = [];
        foreach ($flows as $key => $count) {
            [$o, $c] = array_map('intval', explode(',', $key));
            $og = $geo[$o];
            $cg = $geo[$c];
            $flowLinks[] = [
                'from' => $og['name'], 'fromLat' => $og['lat'], 'fromLon' => $og['lon'],
                'to' => $cg['name'], 'toLat' => $cg['lat'], 'toLon' => $cg['lon'],
                'value' => $count,
            ];
        }
        return $flowLinks ? ['nodes' => $nodes, 'links' => $flowLinks] : null;
    }

    /**
     * Geocoded places linked from the items through an arbitrary property, in
     * the same shape aggregateItems builds `locations` from dcterms:spatial —
     * {name, lat, lon, itemId, value, items[]}, sorted by count — so the shared
     * map builder (bubbles, clustering, per-place popup item lists) renders it
     * unchanged. First consumer: the Publications dashboard's places of
     * publication (marcrel:pup → geocoded Location items). Non-geocoded and
     * literal-only values are skipped; null when nothing is mappable.
     *
     * @param list<int> $itemIds
     * @return list<array{name:string,lat:float,lon:float,itemId:int,value:int,items:list<array{id:int,title:string}>}>|null
     */
    public function buildLinkedPlacesMap(array $itemIds, array $links, array $items, array $geo, string $term): ?array
    {
        $places = [];
        foreach ($itemIds as $iid) {
            foreach ($links[$iid] ?? [] as [$t, , $vrid]) {
                if ($t !== $term || !isset($geo[$vrid])) {
                    continue;
                }
                if (!isset($places[$vrid])) {
                    $g = $geo[$vrid];
                    $places[$vrid] = [
                        'name' => $g['name'], 'lat' => $g['lat'], 'lon' => $g['lon'],
                        'itemId' => $g['itemId'], 'value' => 0, 'items' => [],
                    ];
                }
                $places[$vrid]['value']++;
                $places[$vrid]['items'][] = ['id' => $iid, 'title' => $items[$iid]['title'] ?? ('Item ' . $iid)];
            }
        }
        return $places ? $this->sortByValueDesc(array_values($places)) : null;
    }

    /**
     * The countries publications appeared in, each publication counted once
     * per country. A place of publication (marcrel:pup → a city) gives the
     * country the city is part of; a journal (dcterms:isPartOf → a bibo:Journal
     * record) gives the journal's country of origin, its dcterms:spatial. The
     * two cover different works — books and chapters name a place, articles a
     * journal — so together they place nearly the whole bibliography.
     *
     * A place's country is the top of its Location hierarchy (city → country
     * through dcterms:isPartOf), not the outline its coordinates fall in: at
     * 1:110m Singapore lies inside Malaysia's outline. Rows group on the
     * outline name a country's title matches ($countryNames, from
     * loadCountryNames) and carry that name as `outline` for the map to shade;
     * a country without an outline keeps its title and coordinates so the map
     * can still mark it.
     *
     * @param array<string,string> $countryNames lower-cased country name or alias => outline name
     * @return list<array{country:string,outline:?string,count:int,lat:?float,lon:?float,items:list<array{id:int,title:string}>}>|null
     */
    public function buildPublicationCountries(array $itemIds, array $links, array $items, array $geo, array $countryNames): ?array
    {
        $rows = [];
        foreach ($itemIds as $iid) {
            $seen = [];
            foreach ($this->publicationPlaces($iid, $links, $items) as $locId) {
                $countryId = $this->topPlace($locId, $links, $items);
                $title = trim((string) ($items[$countryId]['title'] ?? ''));
                if ($title === '') {
                    continue;
                }
                $outline = $countryNames[mb_strtolower($title)] ?? null;
                $key = $outline ?? $title;
                if (isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $point = $geo[$countryId] ?? $geo[$locId] ?? null;
                $rows[$key] ??= [
                    'country' => $title, 'outline' => $outline, 'count' => 0,
                    'lat' => $point['lat'] ?? null, 'lon' => $point['lon'] ?? null, 'items' => [],
                ];
                $rows[$key]['count']++;
                $rows[$key]['items'][] = ['id' => $iid, 'title' => $items[$iid]['title'] ?? ('Item ' . $iid)];
            }
        }
        if (!$rows) {
            return null;
        }
        $rows = array_values($rows);
        usort($rows, static fn ($a, $b) => ($b['count'] <=> $a['count']) ?: strnatcasecmp($a['country'], $b['country']));
        return $rows;
    }

    /**
     * The publications issued in each place, for the place pages: a city holds
     * the publications that name it as their place of publication, and every
     * place it is part of (a region, its country) holds them too; a country
     * also holds the articles of the journals that come from it. The same two
     * routes as buildPublicationCountries, kept at every level of the place
     * hierarchy rather than only its top. Each place lists a publication once,
     * in $itemIds order.
     *
     * @param list<int> $itemIds
     * @return array<int,list<int>> place id => publication ids
     */
    public function publicationsByPlace(array $itemIds, array $links, array $items): array
    {
        $byPlace = [];
        foreach ($itemIds as $iid) {
            foreach ($this->publicationPlaces($iid, $links, $items) as $locId) {
                foreach ($this->placeChain($locId, $links, $items) as $placeId) {
                    $byPlace[$placeId][$iid] = true;
                }
            }
        }
        return array_map('array_keys', $byPlace);
    }

    /**
     * Where a publication was issued, as its record names it: the place of
     * publication (marcrel:pup → a city) and, for an article, the country of
     * origin of its journal (dcterms:isPartOf → a bibo:Journal record's
     * dcterms:spatial).
     *
     * @return list<int>
     */
    private function publicationPlaces(int $iid, array $links, array $items): array
    {
        $places = [];
        foreach ($links[$iid] ?? [] as [$term, , $vrid]) {
            if (Roles::isPlaceRole($term)) {
                $places[] = $vrid;
            } elseif ($term === 'dcterms:isPartOf' && ($items[$vrid]['class_term'] ?? '') === 'bibo:Journal') {
                foreach ($links[$vrid] ?? [] as [$journalTerm, , $country]) {
                    if ($journalTerm === 'dcterms:spatial') {
                        $places[] = $country;
                    }
                }
            }
        }
        return $places;
    }

    /** The top of a Location's dcterms:isPartOf chain (a city's country); the place itself when it has no parent. */
    private function topPlace(int $locId, array $links, array $items): int
    {
        $chain = $this->placeChain($locId, $links, $items);
        return $chain[count($chain) - 1];
    }

    /**
     * A Location and the places it is part of, nearest first — city, region,
     * country — following the first dcterms:isPartOf link to a Location at
     * each step. A loop in the hierarchy ends the chain.
     *
     * @return non-empty-list<int>
     */
    private function placeChain(int $locId, array $links, array $items): array
    {
        $chain = [$locId];
        $visited = [$locId => true];
        $id = $locId;
        while (true) {
            $parent = null;
            foreach ($links[$id] ?? [] as [$term, , $vrid]) {
                if ($term === 'dcterms:isPartOf' && ($items[$vrid]['class_term'] ?? '') === 'dcterms:Location' && !isset($visited[$vrid])) {
                    $parent = $vrid;
                    break;
                }
            }
            if ($parent === null) {
                return $chain;
            }
            $visited[$parent] = true;
            $chain[] = $parent;
            $id = $parent;
        }
    }

    /**
     * A person's affiliated organisations (dcterms:isPartOf → foaf:Organization)
     * that carry coordinates, as map markers. Returns null when no affiliation is
     * geocoded, so the orchestrator hides the panel.
     */
    public function buildAffiliationMap(int $personId, array $links, array $items, array $geo): ?array
    {
        $markers = [];
        $seen = [];
        foreach ($links[$personId] ?? [] as [$term, $label, $vrid]) {
            if ($term !== 'dcterms:isPartOf' || isset($seen[$vrid]) || !isset($geo[$vrid])) {
                continue;
            }
            // Only map institution affiliations (not, e.g., a linked place).
            if (($items[$vrid]['class_term'] ?? '') !== 'foaf:Organization') {
                continue;
            }
            $seen[$vrid] = true;
            $g = $geo[$vrid];
            $markers[] = ['name' => $g['name'], 'lat' => $g['lat'], 'lon' => $g['lon'], 'itemId' => $g['itemId']];
        }
        return $markers ?: null;
    }

    /**
     * Affiliation map for a research project: the geocoded institutions that the
     * project's members are affiliated with. Members are the persons linked from
     * the project item via dcterms:creator (PI) and foaf:member (team); each
     * member's affiliations are its dcterms:isPartOf → foaf:Organization targets
     * that carry coordinates. Institutions are de-duplicated and each marker lists
     * the affiliated members. Returns null when no member affiliation is geocoded,
     * so the orchestrator hides the panel.
     */
    public function buildProjectAffiliationMap(int $projectId, array $links, array $items, array $geo): ?array
    {
        // Project members: PI (dcterms:creator) + team (foaf:member).
        $memberIds = [];
        foreach ($links[$projectId] ?? [] as [$term, $label, $vrid]) {
            if ($term === 'dcterms:creator' || $term === 'foaf:member') {
                $memberIds[$vrid] = true;
            }
        }

        $markers = []; // institution id => marker (accumulating member names)
        foreach (array_keys($memberIds) as $pid) {
            foreach ($links[$pid] ?? [] as [$term, $label, $vrid]) {
                if ($term !== 'dcterms:isPartOf' || !isset($geo[$vrid])) {
                    continue;
                }
                // Only institutions, not, e.g., a person's linked place.
                if (($items[$vrid]['class_term'] ?? '') !== 'foaf:Organization') {
                    continue;
                }
                if (!isset($markers[$vrid])) {
                    $g = $geo[$vrid];
                    $markers[$vrid] = [
                        'name' => $g['name'], 'lat' => $g['lat'], 'lon' => $g['lon'],
                        'itemId' => $g['itemId'], 'members' => [],
                    ];
                }
                $mname = $items[$pid]['title'] ?? null;
                if ($mname !== null && !in_array($mname, $markers[$vrid]['members'], true)) {
                    $markers[$vrid]['members'][] = $mname;
                }
            }
        }
        return $markers ? array_values($markers) : null;
    }

    /** Even-odd ray-casting test across all rings of a polygon (handles holes). */
    private function pointInPolygon(float $x, float $y, array $rings): bool
    {
        $inside = false;
        foreach ($rings as $ring) {
            $n = count($ring);
            $j = $n - 1;
            for ($i = 0; $i < $n; $i++) {
                $xi = $ring[$i][0];
                $yi = $ring[$i][1];
                $xj = $ring[$j][0];
                $yj = $ring[$j][1];
                if ((($yi > $y) !== ($yj > $y)) && ($x < ($xj - $xi) * ($y - $yi) / ($yj - $yi) + $xi)) {
                    $inside = !$inside;
                }
                $j = $i;
            }
        }
        return $inside;
    }

    private function countryForPoint(float $lon, float $lat, array $features): ?string
    {
        foreach ($features as [$name, $geom]) {
            $type = $geom['type'] ?? '';
            $coords = $geom['coordinates'] ?? [];
            if ($type === 'Polygon') {
                if ($this->pointInPolygon($lon, $lat, $coords)) {
                    return $name;
                }
            } elseif ($type === 'MultiPolygon') {
                foreach ($coords as $poly) {
                    if ($this->pointInPolygon($lon, $lat, $poly)) {
                        return $name;
                    }
                }
            }
        }
        return null;
    }

    /** Parse the countries GeoJSON into [[name, geometry], ...]. */
    public function loadCountryFeatures(string $geojsonPath): array
    {
        $features = [];
        if (!is_readable($geojsonPath)) {
            return $features;
        }
        $gj = json_decode((string) file_get_contents($geojsonPath), true);
        foreach ($gj['features'] ?? [] as $ft) {
            $props = $ft['properties'] ?? [];
            $name = $props['ADMIN'] ?? $props['NAME'] ?? $props['NAME_EN'] ?? $props['NAME_LONG'] ?? null;
            $geom = $ft['geometry'] ?? null;
            if ($name && $geom) {
                $features[] = [$name, $geom];
            }
        }
        return $features;
    }

    /**
     * Every name a country outline answers to — ADMIN, NAME, NAME_EN and
     * NAME_LONG, lower-cased — mapped to its ADMIN name, the one the choropleth
     * joins on. "Tanzania", "Czech Republic" and "Serbia" are Omeka titles that
     * differ from ADMIN.
     *
     * @return array<string,string>
     */
    public function loadCountryNames(string $geojsonPath): array
    {
        $names = [];
        if (!is_readable($geojsonPath)) {
            return $names;
        }
        $gj = json_decode((string) file_get_contents($geojsonPath), true);
        foreach ($gj['features'] ?? [] as $ft) {
            $props = $ft['properties'] ?? [];
            $admin = $props['ADMIN'] ?? $props['NAME'] ?? null;
            if (!is_string($admin) || $admin === '') {
                continue;
            }
            foreach (['ADMIN', 'NAME', 'NAME_EN', 'NAME_LONG'] as $key) {
                if (is_string($props[$key] ?? null) && $props[$key] !== '') {
                    $names[mb_strtolower($props[$key])] ??= $admin;
                }
            }
        }
        return $names;
    }

    /** Map each location id to its country name via point-in-polygon. */
    public function buildCountryIndex(array $geo, array $features): array
    {
        $index = [];
        if (!$features) {
            return $index;
        }
        foreach ($geo as $locId => $g) {
            $lon = $g['lon'] ?? null;
            $lat = $g['lat'] ?? null;
            if ($lon === null || $lat === null) {
                continue;
            }
            $name = $this->countryForPoint((float) $lon, (float) $lat, $features);
            if ($name !== null) {
                $index[$locId] = $name;
            }
        }
        return $index;
    }

    /** Aggregate item origins (dcterms:spatial) to per-country counts. */
    public function buildChoropleth(array $itemIds, array $links, array $countryIndex): ?array
    {
        if (!$countryIndex) {
            return null;
        }
        $counts = [];
        foreach ($itemIds as $iid) {
            $seen = [];
            foreach ($links[$iid] ?? [] as [$term, $label, $vrid]) {
                if ($term === 'dcterms:spatial' && isset($countryIndex[$vrid])) {
                    $country = $countryIndex[$vrid];
                    if (!isset($seen[$country])) {
                        $counts[$country] = ($counts[$country] ?? 0) + 1;
                        $seen[$country] = true;
                    }
                }
            }
        }
        if (!$counts) {
            return null;
        }
        $this->sortCounts($counts);
        $out = [];
        foreach ($counts as $c => $n) {
            $out[] = ['country' => $c, 'count' => $n];
        }
        return $out;
    }
}
