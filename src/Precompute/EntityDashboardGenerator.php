<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;


final class EntityDashboardGenerator extends DashboardGenerator
{
    public function generate(): int
    {
        $this->generateSections();
        $this->generateProjects();
        $this->generatePeople();
        $this->generateInstitutions();
        $this->generateLocations();
        $this->generateSubjects();
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
            $projectIndex[] = ['id' => $pid, 'name' => $pinfo['title'], 'items' => count($itemIds), 'sections' => $sectionNames];

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
            $dashboard['coAuthors'] = array_slice(array_values($coauthors), 0, 20);
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
        $withItems = 0;
        foreach ($locs as $lid => $linfo) {
            $itemIds = $this->linkingItems($lid, ['dcterms:spatial', 'dcterms:provenance']);
            if (!$itemIds) {
                continue;
            }
            $withItems++;
            $dashboard = $this->aggregators->aggregateItems($itemIds, $this->items, $this->links, $this->itemYear, $this->geo);
            if (isset($this->geo[$lid])) {
                $g = $this->geo[$lid];
                $dashboard['selfLocation'] = ['name' => $g['name'], 'lat' => $g['lat'], 'lon' => $g['lon'], 'itemId' => $lid];
            }
            if ($geoFlows = $this->aggregators->buildGeoFlows($itemIds, $this->links, $this->items, $this->geo)) {
                $dashboard['geoFlows'] = $geoFlows;
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
            $dashboard['coSubjects'] = array_slice(array_values($cosubs), 0, 30);
            unset($dashboard['subjects']);
            $dashboard['resourceType'] = 'authority';
            $this->save($sid, $dashboard);
        }

        $this->saveIndex('subjects-index.json', $index);
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
