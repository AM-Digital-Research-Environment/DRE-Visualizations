<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;


final class EntityDashboardGenerator extends DashboardGenerator
{
    /**
     * Publications a journal or series needs before its collaboration network
     * is drawn: below that the network is a few separate pairs, which the
     * top-authors chart already shows.
     */
    private const VENUE_NETWORK_MIN_PUBLICATIONS = 5;

    public function generate(): int
    {
        $this->generateSections();
        $this->generateProjects();
        $this->generatePeople();
        $this->generateInstitutions();
        $this->generateLocations();
        $this->generateSubjects();
        $this->generateVenues();
        $this->generateByItemSet($this->profile->itemSet('resourceType'), 'dcterms:type', 'Resource Types', 'authority', ['types']);
        $this->generateByItemSet($this->profile->itemSet('language'), 'dcterms:language', 'Languages', 'authority', ['languages'], 'languages-index.json');
        $this->generateByItemSet($this->profile->itemSet('genre'), 'dcterms:format', 'Genres', 'genre', [], 'genres-index.json');
        return $this->fileCount;
    }

    protected function generateSections(): void
    {
        $sections = $this->itemsOfClass(self::CLASS_SECTION);
        $this->log('=== Research Sections (' . count($sections) . ') ===');
        $allBeeswarm = [];

        foreach ($sections as $sid => $sinfo) {
            $projectIds = $this->childrenOf[$sid] ?? [];
            $itemIdSet = [];
            $projectsBreakdown = [];
            $ganttData = [];
            foreach ($projectIds as $pid) {
                $projItems = $this->childrenOf[$pid] ?? [];
                foreach ($projItems as $itemId) {
                    $itemIdSet[(int) $itemId] = true;
                }
                $ptitle = $this->items[$pid]['title'] ?? ('Project ' . $pid);
                if ($projItems) {
                    $projectsBreakdown[] = ['name' => $ptitle, 'value' => count($projItems), 'itemId' => $pid];
                }
                if (isset($this->temporal[$pid])) {
                    [$start, $end] = $this->temporal[$pid];
                    $ganttData[] = ['name' => $ptitle, 'start' => $start, 'end' => $end, 'itemId' => $pid];
                }
            }
            if (!$itemIdSet) {
                continue;
            }
            $itemIds = array_keys($itemIdSet);
            sort($itemIds, SORT_NUMERIC);
            $dashboard = $this->aggregators->aggregateItems($itemIds, $this->items, $this->links, $this->itemYear, $this->geo);
            usort($projectsBreakdown, static fn ($a, $b) => ($b['value'] <=> $a['value'])
                ?: strcmp((string) $a['name'], (string) $b['name'])
                ?: ((int) $a['itemId'] <=> (int) $b['itemId']));
            $dashboard['projects'] = $projectsBreakdown;
            if ($ganttData) {
                usort($ganttData, static fn ($a, $b) => strcmp((string) $a['start'], (string) $b['start'])
                    ?: strcmp((string) $a['name'], (string) $b['name'])
                    ?: ((int) $a['itemId'] <=> (int) $b['itemId']));
                $dashboard['gantt'] = $ganttData;
            }
            $beeswarm = $this->aggregators->buildBeeswarm($sinfo['title'], $projectIds, $this->items, $this->childrenOf, $this->temporal);
            if ($beeswarm) {
                $dashboard['beeswarm'] = $beeswarm;
                $allBeeswarm = array_merge($allBeeswarm, $beeswarm);
            }
            $this->addStandardCharts($dashboard, $sid, $sinfo['title'], $itemIds);
            $dashboard['resourceType'] = $this->profile->templateResourceType($this->items[$sid]['template_id'] ?? null) ?? 'section';
            $this->save($sid, $dashboard);
        }

        if ($allBeeswarm) {
            $this->writeJson($this->outputDir . '/beeswarm-all-sections.json', $allBeeswarm);
        }
    }

    protected function generateProjects(): void
    {
        $projects = $this->itemsWhere(fn ($info) => ($info['template_id'] ?? null) === $this->profile->template('projects'));
        $this->log('=== Projects (' . count($projects) . ') ===');

        // Radar normalisation: per-project breadth maxima.
        $radarProfiles = [];
        foreach ($projects as $pid => $_) {
            $ids = $this->childrenOf[$pid] ?? [];
            if ($ids) {
                $radarProfiles[$pid] = $this->aggregators->profileFromItems($ids, $this->links, $this->itemYear);
            }
        }
        $radarMax = $this->aggregators->profileMaxima(array_values($radarProfiles));
        // The project's own item sets (its collections), shown on the project
        // item page, which their item-set pages redirect to.
        $collections = ProjectCollections::resolve($this->items, $this->literals, $this->itemSets,
            $this->itemSetRecords, $this->profile->template('projects'));

        $projectIndex = [];
        foreach ($projects as $pid => $pinfo) {
            $itemIds = $this->childrenOf[$pid] ?? [];
            if (!$itemIds) {
                continue;
            }
            $sectionNames = [];
            foreach ($this->links[$pid] ?? [] as [$term, $label, $vrid]) {
                if ($term === 'dcterms:isPartOf' && ($this->items[$vrid]['class_term'] ?? '') === self::CLASS_SECTION) {
                    $sectionNames[] = $this->items[$vrid]['title'];
                }
            }
            $projectIndex[] = ['id' => $pid, 'name' => $pinfo['title'], 'items' => count($itemIds), 'sections' => $sectionNames,
                'collections' => $collections[$pid] ?? []];

            $dashboard = $this->aggregators->aggregateItems($itemIds, $this->items, $this->links, $this->itemYear, $this->geo);
            $this->addStandardCharts($dashboard, $pid, $pinfo['title'], $itemIds);
            // Map of the geocoded institutions the project's members (PI + team) are
            // affiliated with — mirrors the per-person affiliation map.
            if ($affMap = $this->aggregators->buildProjectAffiliationMap($pid, $this->links, $this->items, $this->geo)) {
                $dashboard['affiliationMap'] = $affMap;
            }
            if ($radar = $this->aggregators->buildRadar($radarProfiles[$pid] ?? null, $radarMax)) {
                $dashboard['radar'] = $radar;
            }
            if (isset($collections[$pid])) {
                $dashboard['collections'] = $collections[$pid];
            }
            $dashboard['resourceType'] = $this->profile->templateResourceType($this->items[$pid]['template_id'] ?? null) ?? 'project';
            $this->save($pid, $dashboard);
        }

        usort($projectIndex, static fn ($a, $b) => strcmp((string) $a['name'], (string) $b['name'])
            ?: ((int) $a['id'] <=> (int) $b['id']));
        $this->writeJson($this->outputDir . '/projects-index.json', $projectIndex);
        $this->statCounts['projects'] = count($projectIndex);
    }



    protected function generatePeople(): void
    {
        $people = $this->itemsWhere(fn ($info) => ($info['template_id'] ?? null) === $this->profile->template('persons'));
        $this->log('=== People (' . count($people) . ') ===');

        $personTerms = $this->personCreditTerms();

        $radarProfiles = [];
        foreach ($people as $pid => $_) {
            $ids = $this->linkingItems($pid, $personTerms);
            if ($ids) {
                $radarProfiles[$pid] = $this->aggregators->profileFromItems($ids, $this->links, $this->itemYear);
            }
        }
        $radarMax = $this->aggregators->profileMaxima(array_values($radarProfiles));

        $index = [];
        foreach ($people as $pid => $pinfo) {
            $itemIds = $this->linkingItems($pid, $personTerms);
            if (!$itemIds) {
                continue;
            }
            $index[] = ['id' => $pid, 'name' => $pinfo['title'], 'items' => count($itemIds)];
            $dashboard = $this->aggregators->aggregateItems($itemIds, $this->items, $this->links, $this->itemYear, $this->geo);
            if ($v = $this->aggregators->buildTemplates($itemIds, $this->items, $this->templateLabels)) {
                $dashboard['templates'] = $v;
            }
            // Map of the person's geocoded institution affiliations (dcterms:isPartOf).
            if ($affMap = $this->aggregators->buildAffiliationMap($pid, $this->links, $this->items, $this->geo)) {
                $dashboard['affiliationMap'] = $affMap;
            }

            $coauthors = [];
            foreach ($itemIds as $iid) {
                foreach ($this->links[$iid] ?? [] as [$term, $label, $vrid]) {
                    if (($term === 'dcterms:creator' || $term === 'dcterms:contributor' || $term === 'bibo:authorList' || $term === 'bibo:editorList' || str_starts_with($term, 'marcrel:')) && $vrid !== $pid) {
                        if (($this->items[$vrid]['template_id'] ?? null) === $this->profile->template('persons')) {
                            $coauthors[$vrid] ??= ['name' => $this->items[$vrid]['title'], 'value' => 0, 'itemId' => $vrid];
                            $coauthors[$vrid]['value']++;
                        }
                    }
                }
            }
            usort($coauthors, static fn ($a, $b) => ($b['value'] <=> $a['value'])
                ?: strcmp((string) $a['name'], (string) $b['name'])
                ?: ((int) $a['itemId'] <=> (int) $b['itemId']));
            $dashboard['coAuthors'] = array_slice($coauthors, 0, Aggregators::RANKED_LIST_CAP);
            unset($dashboard['contributors']);

            if ($roles = $this->aggregators->buildRolesFor($pid, $itemIds, $this->links)) {
                $dashboard['roles'] = $roles;
            }
            if ($radar = $this->aggregators->buildRadar($radarProfiles[$pid] ?? null, $radarMax)) {
                $dashboard['radar'] = $radar;
            }
            if ($net = $this->aggregators->buildContributorNetwork($pid, $pinfo['title'], $itemIds, $this->items, $this->links, $this->childrenOf)) {
                $dashboard['contributorNetwork'] = $net;
            }
            $dashboard['resourceType'] = $this->profile->templateResourceType($this->items[$pid]['template_id'] ?? null) ?? 'person';
            $this->save($pid, $dashboard);
        }

        $this->saveIndex('people-index.json', $index);
    }

    protected function generateInstitutions(): void
    {
        $institutions = $this->itemsOfClass(self::CLASS_ORGANISATION);
        $this->log('=== Institutions (' . count($institutions) . ') ===');

        $instSet = [];
        foreach ($institutions as $iid => $_) {
            $instSet[$iid] = true;
        }
        $instTerms = $this->institutionCreditTerms();

        $radarProfiles = [];
        foreach ($institutions as $iid => $_) {
            $ids = $this->linkingItems($iid, $instTerms);
            if ($ids) {
                $radarProfiles[$iid] = $this->aggregators->profileFromItems($ids, $this->links, $this->itemYear);
            }
        }
        $radarMax = $this->aggregators->profileMaxima(array_values($radarProfiles));

        $index = [];
        foreach ($institutions as $iid => $iinfo) {
            $itemIds = $this->linkingItems($iid, $instTerms);
            if (!$itemIds) {
                continue;
            }
            $index[] = ['id' => $iid, 'name' => $iinfo['title'], 'items' => count($itemIds)];
            $dashboard = $this->aggregators->aggregateItems($itemIds, $this->items, $this->links, $this->itemYear, $this->geo);
            // The institution's own location (it now carries geo:lat/long like a
            // Location), shown as a self-location mini-map on its page.
            if (isset($this->geo[$iid])) {
                $g = $this->geo[$iid];
                $dashboard['selfLocation'] = ['name' => $g['name'], 'lat' => $g['lat'], 'lon' => $g['lon'], 'itemId' => $iid];
            }
            if ($v = $this->aggregators->buildTemplates($itemIds, $this->items, $this->templateLabels)) {
                $dashboard['templates'] = $v;
            }
            if ($collab = $this->aggregators->buildCollabNetwork($iid, $iinfo['title'], $itemIds, $this->items, $this->links, $this->reverseLinks, $instSet, $instTerms)) {
                $dashboard['collabNetwork'] = $collab;
            }
            if ($affil = $this->aggregators->buildAffiliationNetwork($iid, $iinfo['title'], $this->items, $this->links, $this->reverseLinks)) {
                $dashboard['affiliationNetwork'] = $affil;
            }
            if ($radar = $this->aggregators->buildRadar($radarProfiles[$iid] ?? null, $radarMax)) {
                $dashboard['radar'] = $radar;
            }
            $dashboard['resourceType'] = $this->profile->templateResourceType($this->items[$iid]['template_id'] ?? null) ?? 'organisation';
            $this->save($iid, $dashboard);
        }

        $this->saveIndex('institutions-index.json', $index);
    }

    protected function generateLocations(): void
    {
        $locs = $this->itemsWhere(fn ($info) => ($info['template_id'] ?? null) === $this->profile->template('location'));
        $this->log('=== Locations (' . count($locs) . ') ===');
        // The publications issued at each place: a city's are those naming it as
        // their place of publication; a country adds those of its cities and the
        // articles of the journals that come from it. A work was issued there, it
        // does not come from there, so these stay out of the research-item charts
        // and get a panel of their own.
        $publishedHere = $this->aggregators->publicationsByPlace($this->publicationIds(), $this->links, $this->items);
        $withItems = 0;
        foreach ($locs as $lid => $linfo) {
            $itemIds = array_values(array_filter(
                $this->linkingItems($lid, ['dcterms:spatial', 'dcterms:provenance']),
                fn (int $iid) => ($this->items[$iid]['class_term'] ?? '') !== self::CLASS_JOURNAL
            ));
            $pubIds = $publishedHere[$lid] ?? [];
            $pubTimeline = $pubIds
                ? $this->aggregators->buildStackedTimeline($pubIds, $this->links, $this->items, $this->itemYear)
                : null;
            if (!$itemIds && !$pubTimeline) {
                continue;
            }
            if ($itemIds) {
                $withItems++;
            }
            $dashboard = $this->aggregators->aggregateItems($itemIds, $this->items, $this->links, $this->itemYear, $this->geo);
            if (isset($this->geo[$lid])) {
                $g = $this->geo[$lid];
                $dashboard['selfLocation'] = ['name' => $g['name'], 'lat' => $g['lat'], 'lon' => $g['lon'], 'itemId' => $lid];
            }
            if ($geoFlows = $this->aggregators->buildGeoFlows($itemIds, $this->links, $this->items, $this->geo)) {
                $dashboard['geoFlows'] = $geoFlows;
            }
            if ($pubTimeline) {
                $dashboard['publishedHere'] = $pubTimeline;
                // The page draws nothing when totalItems is 0, so it counts the
                // publications too: a place of publication with no research
                // items of its own still shows its panel.
                $dashboard['totalItems'] = count(array_unique(array_merge($itemIds, $pubIds)));
            }
            $dashboard['resourceType'] = $this->profile->templateResourceType($this->items[$lid]['template_id'] ?? null) ?? 'location';
            $this->save($lid, $dashboard);
        }
        $this->statCounts['locations'] = $withItems;
    }

    protected function generateSubjects(): void
    {
        $subjects = $this->itemsWhere(fn ($info) => ($info['template_id'] ?? null) === $this->profile->template('authority'));
        $this->log('=== Subjects/Authority (' . count($subjects) . ') ===');
        $index = [];
        foreach ($subjects as $sid => $sinfo) {
            $itemIds = $this->linkingItems($sid, ['dcterms:subject']);
            if (!$itemIds) {
                continue;
            }
            $index[] = ['id' => $sid, 'name' => $sinfo['title'], 'items' => count($itemIds)];
            $dashboard = $this->aggregators->aggregateItems($itemIds, $this->items, $this->links, $this->itemYear, $this->geo);
            $cosubs = [];
            foreach ($itemIds as $iid) {
                foreach ($this->links[$iid] ?? [] as [$term, $label, $vrid]) {
                    if ($term === 'dcterms:subject' && $vrid !== $sid) {
                        $cosubs[$vrid] ??= ['name' => $this->items[$vrid]['title'] ?? '', 'value' => 0, 'itemId' => $vrid];
                        $cosubs[$vrid]['value']++;
                    }
                }
            }
            usort($cosubs, static fn ($a, $b) => ($b['value'] <=> $a['value'])
                ?: strcmp((string) $a['name'], (string) $b['name'])
                ?: ((int) $a['itemId'] <=> (int) $b['itemId']));
            $dashboard['coSubjects'] = array_slice($cosubs, 0, Aggregators::RANKED_LIST_CAP);
            unset($dashboard['subjects']);
            $dashboard['resourceType'] = 'authority';
            $this->save($sid, $dashboard);
        }

        $this->saveIndex('subjects-index.json', $index);
    }

    /**
     * Journal and Series records, each from the publications that link to it:
     * an article to its journal and a monograph to its series through
     * dcterms:isPartOf, a book or chapter to its series through its series
     * statement (dre:series). Only publications count: the dashboard is the
     * bibliography's view of the venue.
     */
    protected function generateVenues(): void
    {
        $venues = $this->itemsOfClass(self::CLASS_JOURNAL) + $this->itemsOfClass(self::CLASS_SERIES);
        $this->log('=== Journals and series (' . count($venues) . ') ===');
        $isPublication = array_fill_keys($this->publicationIds(), true);
        foreach ($venues as $vid => $vinfo) {
            $itemIds = array_values(array_filter(
                $this->linkingItems($vid, ['dcterms:isPartOf', 'dre:series']),
                static fn (int $iid) => isset($isPublication[$iid])
            ));
            if (!$itemIds) {
                continue;
            }
            $dashboard = $this->aggregators->aggregateItems($itemIds, $this->items, $this->links, $this->itemYear, $this->geo);
            // Top authors replaces the linked-people ranking: it also counts the
            // author names not reconciled to a Person record.
            unset($dashboard['contributors']);
            if ($v = $this->aggregators->buildStackedTimeline($itemIds, $this->links, $this->items, $this->itemYear)) {
                $dashboard['stackedTimeline'] = $v;
            }
            if ($v = $this->aggregators->buildTopAuthors($itemIds, $this->links, $this->literals, $this->items, Aggregators::RANKED_LIST_CAP)) {
                $dashboard['topAuthors'] = $v;
            }
            if (count($itemIds) >= self::VENUE_NETWORK_MIN_PUBLICATIONS
                && ($v = $this->aggregators->buildCoAuthorNetwork($itemIds, $this->links, $this->literals, $this->items))) {
                $dashboard['coAuthorNetwork'] = $v;
            }
            $where = ($vinfo['class_term'] ?? '') === self::CLASS_JOURNAL
                ? 'appeared in this journal' : 'belong to this series';
            $dashboard['builders'] = ['languages' => 'buildPieChart'];
            $dashboard['labels'] = [
                'stackedTimeline' => 'Publications by year and type',
                'coAuthorNetwork' => 'Collaboration network',
                'subjects' => 'Keywords',
            ];
            $dashboard['descriptions'] = [
                'stackedTimeline' => 'The publications recorded here that ' . $where . ', counted by year and split by type.',
                'languages' => 'The languages these publications are written in.',
                'coAuthorNetwork' => 'Authors and editors are linked when they appear on the same publication. Circle size follows how well connected a person is, and circle colour marks groups who publish together more often than with others. The colour of a line shows the relationship: co-authorship, author and editor, or co-editorship.',
                'subjects' => 'The keywords assigned to these publications most often.',
            ];
            $dashboard['resourceType'] = 'venue';
            $this->save($vid, $dashboard);
        }
    }

    protected function generateByItemSet(int $setId, string $term, string $label, string $resourceType, array $excludeKeys, ?string $indexFile = null): void
    {
        $setItems = $this->itemSets[$setId] ?? [];
        $this->log('=== ' . $label . ' (item set ' . $setId . ', ' . count($setItems) . ') ===');
        $index = [];
        foreach ($setItems as $eid) {
            $itemIds = $this->linkingItems($eid, [$term]);
            if (!$itemIds) {
                continue;
            }
            $index[] = ['id' => $eid, 'name' => $this->items[$eid]['title'] ?? ('Item ' . $eid), 'items' => count($itemIds)];
            $dashboard = $this->aggregators->aggregateItems($itemIds, $this->items, $this->links, $this->itemYear, $this->geo);
            foreach ($excludeKeys as $k) {
                unset($dashboard[$k]);
            }
            $dashboard['resourceType'] = $resourceType;
            $this->save($eid, $dashboard);
        }
        if ($indexFile !== null) {
            $this->saveIndex($indexFile, $index);
        }
    }
}
