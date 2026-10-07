<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;


final class OverviewDashboardGenerator extends DashboardGenerator
{
    public function generate(): int
    {
        $this->generateCategoryOverviews();
        $this->generateCollectionOverview();
        $this->generateEntityGraph();
        $this->generateNetworkExplorer();
        $this->generateSpatialExploration();
        $this->generateWhatsNew();
        return $this->fileCount;
    }

    protected function generateOverview(int $parentId, string $label, array $setItems, array $terms, string $resourceType, string $distributionKey, ?callable $filterFn = null, array $extra = []): void
    {
        $members = [];
        foreach ($setItems as $sid) {
            if ($filterFn === null || $filterFn($sid)) {
                $members[] = $sid;
            }
        }
        if (!$members) {
            return;
        }
        $allItems = [];
        $memberCounts = [];
        foreach ($members as $mid) {
            $linked = $this->linkingItems($mid, $terms);
            foreach ($linked as $iid) {
                $allItems[$iid] = true;
            }
            if ($linked) {
                $mtitle = $this->items[$mid]['title'] ?? ('Item ' . $mid);
                $memberCounts[] = ['name' => $mtitle, 'value' => count($linked), 'itemId' => $mid];
            }
        }
        $allItems = array_keys($allItems);
        if (!$allItems) {
            return;
        }

        $dashboard = $this->aggregators->aggregateItems($allItems, $this->items, $this->links, $this->itemYear, $this->geo);
        usort($memberCounts, static fn ($a, $b) => ($b['value'] <=> $a['value'])
            ?: strcmp((string) $a['name'], (string) $b['name'])
            ?: ((int) $a['itemId'] <=> (int) $b['itemId']));
        $dashboard[$distributionKey] = $memberCounts;

        if ($v = $this->aggregators->buildStackedTimeline($allItems, $this->links, $this->items, $this->itemYear)) {
            $dashboard['stackedTimeline'] = $v;
        }
        if ($v = $this->aggregators->buildHeatmap($allItems, $this->links, $this->items)) {
            $dashboard['heatmap'] = $v;
        }
        if ($v = $this->aggregators->buildRoles($allItems, $this->links, $this->items)) {
            $dashboard['roles'] = $v;
        }
        if ($v = $this->aggregators->buildSubjectTrends($allItems, $this->links, $this->items, $this->itemYear)) {
            $dashboard['subjectTrends'] = $v;
        }
        if ($v = $this->aggregators->buildLanguageTimeline($allItems, $this->links, $this->items, $this->itemYear)) {
            $dashboard['languageTimeline'] = $v;
        }
        if ($v = $this->aggregators->buildChoropleth($allItems, $this->links, $this->countryIndex)) {
            $dashboard['choropleth'] = $v;
        }
        if ($v = $this->aggregators->buildTemplates($allItems, $this->items, $this->templateLabels)) {
            $dashboard['templates'] = $v;
        }
        foreach ($extra as $k => $v) {
            $dashboard[$k] = $v;
        }
        $dashboard['resourceType'] = $resourceType;
        $this->save($parentId, $dashboard);
    }

    protected function generateCategoryOverviews(): void
    {
        $this->log('=== Category Overviews ===');
        // Unlike the per-person dashboards, the person overview leaves out
        // foaf:member (membership is not an item credit).
        $personTerms = $this->personCreditTerms(withMembership: false);
        $instTerms = $this->institutionCreditTerms();

        $isLcsh = function (int $sid): bool {
            foreach ($this->links[$sid] ?? [] as [$term, $label, $vrid]) {
                if ($term === 'dcterms:type' && $vrid === $this->profile->overview('lcsh')) {
                    return true;
                }
            }
            return false;
        };

        $this->generateOverview($this->profile->overview('genre'), 'Genre', $this->itemSets[$this->profile->itemSet('genre')] ?? [], ['dcterms:format'], 'genreOverview', 'genres');
        $this->generateOverview($this->profile->overview('language'), 'Language', $this->itemSets[$this->profile->itemSet('language')] ?? [], ['dcterms:language'], 'languageOverview', 'topLanguages');
        $this->generateOverview($this->profile->overview('resourceType'), 'Resource Type', $this->itemSets[$this->profile->itemSet('resourceType')] ?? [], ['dcterms:type'], 'resourceTypeOverview', 'topResourceTypes');
        $this->generateOverview($this->profile->overview('targetAudience'), 'Target Audience', $this->itemSets[$this->profile->itemSet('targetAudience')] ?? [], ['dcterms:audience'], 'targetAudienceOverview', 'topAudiences');
        $this->generateOverview($this->profile->overview('person'), 'Person', $this->itemSets[$this->profile->itemSet('person')] ?? [], $personTerms, 'personOverview', 'topPersons');
        $this->generateOverview($this->profile->overview('institution'), 'Institution', $this->itemSets[$this->profile->itemSet('institution')] ?? [], $instTerms, 'institutionOverview', 'topInstitutions', fn (int $iid) => ($this->items[$iid]['class_term'] ?? '') === self::CLASS_ORGANISATION);
        $this->generateOverview($this->profile->overview('group'), 'Group', $this->itemSets[$this->profile->itemSet('institution')] ?? [], $instTerms, 'groupOverview', 'topGroups', fn (int $iid) => ($this->items[$iid]['class_term'] ?? '') !== self::CLASS_ORGANISATION);
        $this->generateOverview($this->profile->overview('lcsh'), 'LCSH Subject', $this->itemSets[$this->profile->itemSet('subject')] ?? [], ['dcterms:subject'], 'lcshOverview', 'topSubjects', $isLcsh);
        $this->generateOverview($this->profile->overview('tag'), 'Tag', $this->itemSets[$this->profile->itemSet('subject')] ?? [], ['dcterms:subject'], 'tagOverview', 'topTags', fn (int $sid) => !$isLcsh($sid));

        $projMembers = $this->itemSets[$this->profile->itemSet('project')] ?? [];
        $projExtra = $this->buildProjectsTimelineCharts($projMembers);
        $this->generateOverview($this->profile->overview('project'), 'Research Project', $projMembers, ['dcterms:isPartOf'], 'projectOverview', 'topProjects', null, $projExtra);
    }

    protected function buildProjectsTimelineCharts(array $projectIds): array
    {
        $extra = [];
        $projSet = array_flip($projectIds);

        $gantt = [];
        foreach ($projectIds as $pid) {
            if (isset($this->temporal[$pid])) {
                [$start, $end] = $this->temporal[$pid];
                $gantt[] = ['name' => $this->items[$pid]['title'] ?? ('Project ' . $pid), 'start' => $start, 'end' => $end, 'itemId' => $pid];
            }
        }
        if ($gantt) {
            usort($gantt, static fn ($a, $b) => strcmp((string) $a['start'], (string) $b['start'])
                ?: strcmp((string) $a['name'], (string) $b['name'])
                ?: ((int) $a['itemId'] <=> (int) $b['itemId']));
            $extra['gantt'] = $gantt;
        }

        $beeswarm = [];
        $grouped = [];
        $sections = $this->itemsOfClass(self::CLASS_SECTION);
        foreach ($sections as $sid => $sinfo) {
            $secProjects = [];
            foreach ($this->childrenOf[$sid] ?? [] as $pid) {
                if (isset($projSet[$pid])) {
                    $secProjects[] = $pid;
                }
            }
            $pts = $this->aggregators->buildBeeswarm($sinfo['title'], $secProjects, $this->items, $this->childrenOf, $this->temporal);
            if ($pts) {
                $beeswarm = array_merge($beeswarm, $pts);
                foreach ($secProjects as $pid) {
                    $grouped[$pid] = true;
                }
            }
        }
        $leftover = [];
        foreach ($projectIds as $pid) {
            if (!isset($grouped[$pid])) {
                $leftover[] = $pid;
            }
        }
        if ($leftover) {
            $pts = $this->aggregators->buildBeeswarm('Other', $leftover, $this->items, $this->childrenOf, $this->temporal);
            if ($pts) {
                $beeswarm = array_merge($beeswarm, $pts);
            }
        }
        if ($beeswarm) {
            $extra['beeswarm'] = $beeswarm;
        }
        if ($bx = $this->aggregators->buildBoxplot($sections, $this->childrenOf)) {
            $extra['boxplot'] = $bx;
        }
        $allProjItems = [];
        foreach ($projectIds as $pid) {
            foreach ($this->childrenOf[$pid] ?? [] as $iid) {
                $allProjItems[$iid] = true;
            }
        }
        $allProjItems = array_keys($allProjItems);
        if ($tc = $this->aggregators->buildTimeChord($allProjItems, $this->links, $this->items, $this->itemYear)) {
            $extra['timeChord'] = $tc;
        }
        return $extra;
    }

    protected function generateCollectionOverview(): void
    {
        $researchItems = array_keys($this->itemsWhere(fn ($info) => ($info['template_id'] ?? null) === $this->profile->template('researchItems')));
        // "Items" in the Collection Overview regroups research items AND cluster
        // publications: the curated Publications item set (same corpus as the
        // Publications block — see publicationIds()) is folded into the same
        // charts, with each publication bucketed under a synthetic "Publication"
        // resource type that overrides its bibliographic type, so it shows as one
        // "Publication" category in the resource-type pie and the year×type
        // timeline. (A `fabio:` class filter is NOT used here: FaBiO classes are
        // also carried by research items and authority records, which would inflate
        // the "Publication" slice ~12× — see publicationIds().)
        $publications = $this->publicationIds();
        $podcasts = $this->podcastIds();
        $youtube = $this->youtubeIds();
        $this->log('=== Collection Overview (' . count($researchItems) . ' research items + ' . count($publications) . ' publications + ' . count($podcasts) . ' podcasts + ' . count($youtube) . ' YouTube videos) ===');

        // Combined corpus, de-duplicated. Research items are template 10,
        // publications templates 11-20 and 24-32 (a non-contiguous range that
        // grows with each new EP3 type, which is why publicationIds() selects
        // by item set, never by template), podcasts template 21 and YouTube
        // videos template 22 (disjoint item sets), but flatten through
        // array_flip to guard against overlap anyway.
        $overviewItems = array_keys(array_flip(array_merge($researchItems, $publications, $podcasts, $youtube)));
        // Each publication / podcast / YouTube video is folded under one synthetic
        // resource type (overriding its own dcterms:type, if any) so it appears as a
        // single "Publication" / "Podcast" / "YouTube video" category in the
        // resource-type pie, the year×type timeline AND the type×language heatmap —
        // keeping the high-level overview readable. The fine-grained publication
        // types stay in the dedicated Publications block.
        $syntheticTypes = [];
        foreach ($publications as $pid) {
            $syntheticTypes[$pid] = $this->profile->syntheticType('publication');
        }
        foreach ($podcasts as $pid) {
            $syntheticTypes[$pid] = $this->profile->syntheticType('podcast');
        }
        foreach ($youtube as $pid) {
            $syntheticTypes[$pid] = $this->profile->syntheticType('youtube');
        }

        $dashboard = $this->aggregators->aggregateItems($overviewItems, $this->items, $this->links, $this->itemYear, $this->geo, $syntheticTypes);
        if ($v = $this->aggregators->buildStackedTimeline($overviewItems, $this->links, $this->items, $this->itemYear, $syntheticTypes)) {
            $dashboard['stackedTimeline'] = $v;
        }
        if ($v = $this->aggregators->buildHeatmap($overviewItems, $this->links, $this->items, $syntheticTypes)) {
            $dashboard['heatmap'] = $v;
        }
        if ($v = $this->aggregators->buildRoles($overviewItems, $this->links, $this->items)) {
            $dashboard['roles'] = $v;
        }
        if ($v = $this->aggregators->buildSubjectTrends($overviewItems, $this->links, $this->items, $this->itemYear)) {
            $dashboard['subjectTrends'] = $v;
        }
        if ($v = $this->aggregators->buildLanguageTimeline($overviewItems, $this->links, $this->items, $this->itemYear)) {
            $dashboard['languageTimeline'] = $v;
        }
        if ($v = $this->aggregators->buildChord($overviewItems, $this->links, $this->items)) {
            $dashboard['chord'] = $v;
        }
        if ($v = $this->aggregators->buildSankey($overviewItems, $this->links, $this->items)) {
            $dashboard['sankey'] = $v;
        }
        if ($v = $this->aggregators->buildSunburst($overviewItems, $this->links, $this->items)) {
            $dashboard['sunburst'] = $v;
        }
        if ($v = $this->aggregators->buildGeoFlows($overviewItems, $this->links, $this->items, $this->geo)) {
            $dashboard['geoFlows'] = $v;
        }
        if ($v = $this->aggregators->buildChoropleth($overviewItems, $this->links, $this->countryIndex)) {
            $dashboard['choropleth'] = $v;
        }
        if ($v = $this->aggregators->buildTimeChord($overviewItems, $this->links, $this->items, $this->itemYear)) {
            $dashboard['timeChord'] = $v;
        }
        $sections = $this->itemsOfClass(self::CLASS_SECTION);
        if ($v = $this->aggregators->buildBoxplot($sections, $this->childrenOf)) {
            $dashboard['boxplot'] = $v;
        }
        // Curated home-overview charts (amira homepage parity): projects per
        // research section, research items by section × funding university, and
        // the static cluster-partner geography. The full "Collection Dashboard"
        // (section) layout ignores these keys; the curated "Collection Overview"
        // layout renders them — see dashboard-layouts.js.
        if ($v = $this->aggregators->buildSectionsBar($sections, $this->childrenOf, $this->items)) {
            $dashboard['sectionsBar'] = $v;
        }
        // External partner collections are folded onto a partner-university column
        // (ILAM → Rhodes University, BayGlo → University of Bayreuth) under an
        // "External" row; their items sit outside the section→project hierarchy.
        $externalBuckets = [];
        foreach ($this->profile->externalCollections() as $setId => $route) {
            $externalBuckets[] = [
                'itemIds' => $this->itemSets[$setId] ?? [],
                'section' => $route['section'],
                'university' => $route['university'],
            ];
        }
        if ($v = $this->aggregators->buildSectionUniversity($sections, $this->childrenOf, $this->items, $this->links, $externalBuckets)) {
            $dashboard['sectionUniversity'] = $v;
        }
        if ($cp = $this->aggregators->clusterPartners($this->items, $this->links, $this->geo, $this->profile->clusterCategoryAuthorities())) {
            $dashboard['clusterPartners'] = $cp;
        }
        // amira-style summary stat cards. Country count comes from the choropleth
        // just built above (one entry per distinct country of origin).
        $countries = is_array($dashboard['choropleth'] ?? null) ? count($dashboard['choropleth']) : 0;
        $dashboard['stats'] = $this->buildOverviewStats(count($researchItems), $countries);
        $dashboard['resourceType'] = 'section';
        $this->save('collection-overview', $dashboard);
    }

    protected function buildOverviewStats(int $researchItemCount, int $countries): array
    {
        if ($this->corpusStats !== null) {
            return $this->aggregators->buildStatCards(array_map(
                static fn (array $stat): array => [
                    'key' => $stat['k'], 'label' => $stat['l'], 'value' => $stat['n'],
                ],
                $this->corpusStats
            ));
        }

        // People, Organisations, Languages, Subjects & Tags, Research projects
        // and Publications are the sizes of their authority item sets — the full
        // curated count, not just entities linked to a research item. Locations
        // stays as the "present in the collection" count gathered by its index
        // pass.
        $setCount = fn (int $setId): int => count($this->itemSets[$setId] ?? []);

        // Assemble via the reusable component — it casts values, drops empty
        // cards (Research Items aside, always > 0) and clears null subtitles.
        return $this->aggregators->buildStatCards([
            ['key' => 'researchItems', 'label' => 'Research items', 'value' => $researchItemCount],
            ['key' => 'projects', 'label' => 'Research projects', 'value' => $setCount($this->profile->itemSet('project'))],
            ['key' => 'people', 'label' => 'People', 'value' => $setCount($this->profile->itemSet('person'))],
            ['key' => 'organisations', 'label' => 'Organisations', 'value' => $setCount($this->profile->itemSet('institution'))],
            ['key' => 'locations', 'label' => 'Locations', 'value' => $this->statCounts['locations'] ?? 0,
                'subtitle' => $countries > 0 ? ('in ' . $countries . ' ' . ($countries === 1 ? 'country' : 'countries')) : null],
            ['key' => 'languages', 'label' => 'Languages', 'value' => $setCount($this->profile->itemSet('language'))],
            ['key' => 'subjectsTags', 'label' => 'Subjects and tags', 'value' => $setCount($this->profile->itemSet('subject'))],
            ['key' => 'publications', 'label' => 'Publications', 'value' => $setCount($this->profile->itemSet('publications'))],
            ['key' => 'podcasts', 'label' => 'Podcast episodes', 'value' => $setCount($this->profile->itemSet('podcasts'))],
            ['key' => 'youtube', 'label' => 'YouTube videos', 'value' => $setCount($this->profile->itemSet('youtube'))],
        ]);
    }

    protected function generateEntityGraph(): void
    {
        $this->log('=== Entity Network ===');
        $lcshIds = [];
        foreach ($this->links as $sid => $slinks) {
            foreach ($slinks as [$term, $label, $vrid]) {
                if ($term === 'dcterms:type' && $vrid === $this->profile->overview('lcsh')) {
                    $lcshIds[] = $sid;
                    break;
                }
            }
        }
        $researchItems = array_keys($this->itemsWhere(fn ($info) => ($info['template_id'] ?? null) === $this->profile->template('researchItems')));
        // Fold the curated Publications, Podcasts and YouTube item sets in too, so
        // their authors (bibo:authorList/editorList), subjects and places join the
        // network alongside the research items.
        $scanItems = array_values(array_unique(array_merge(
            $researchItems,
            $this->publicationIds(),
            $this->podcastIds(),
            $this->youtubeIds()
        )));
        // Tag each work with its research section (item ← project ← section, via the
        // childrenOf hierarchy) so the front end can offer a "colour by section"
        // overlay. External partner collections sit outside that hierarchy, so route
        // their item sets onto the synthetic "External" section by membership.
        $itemSection = [];
        foreach ($this->itemsOfClass(self::CLASS_SECTION) as $sid => $sinfo) {
            $name = $sinfo['title'] ?? '';
            if ($name === '') {
                continue;
            }
            foreach ($this->childrenOf[$sid] ?? [] as $pid) {
                foreach ($this->childrenOf[$pid] ?? [] as $iid) {
                    $itemSection[$iid] = $name;
                }
            }
        }
        foreach ($this->profile->externalCollections() as $setId => $meta) {
            foreach ($this->itemSets[$setId] ?? [] as $iid) {
                $itemSection[$iid] = $meta['section'];
            }
        }
        // Strong core, uncapped: keep the "share >=2 items" edge rule but lift the
        // node cap from 1200 so the full connected core shows.
        $graph = $this->aggregators->buildEntityGraph($scanItems, $this->links, $this->items, $lcshIds, 2, 4000, $itemSection);
        if ($graph) {
            $this->writeJson($this->communitiesDir . '/entity-graph.json', $graph);
            $this->log('  ' . count($graph['nodes']) . ' entities, ' . count($graph['edges']) . ' links, ' . ($graph['meta']['communityCount'] ?? 0) . ' communities, ' . ($graph['meta']['sectionCount'] ?? 0) . ' sections');
        }
    }

    protected function generateNetworkExplorer(): void
    {
        $researchItems = array_keys($this->itemsWhere(fn ($info) => ($info['template_id'] ?? null) === $this->profile->template('researchItems')));
        $this->log('=== Network Explorer (' . count($researchItems) . ' research items) ===');
        $payload = $researchItems ? [
            'contributors' => $this->aggregators->buildGlobalContributorNetwork($researchItems, $this->items, $this->links),
            'collaboration' => $this->aggregators->buildPersonCollaborationNetwork($researchItems, $this->items, $this->links),
            'affiliations' => $this->aggregators->buildGlobalAffiliationNetwork($this->items, $this->links),
            'institutions' => $this->aggregators->buildGlobalInstitutionCollaborationNetwork($researchItems, $this->items, $this->links),
        ] : [];
        $payload = array_filter($payload, static fn ($v) => $v !== null);
        if (!$payload) {
            $this->log('  no network explorer graphs had enough data');
        }

        $path = dirname($this->outputDir) . '/network-explorer.json';
        $this->writeJson($path, $payload);
        $this->fileCount++;

        $summary = [];
        foreach ($payload as $key => $graph) {
            $summary[] = $key . ': ' . count($graph['nodes'] ?? []) . ' nodes / ' . count($graph['links'] ?? []) . ' links';
        }
        $this->log('  network-explorer.json: ' . implode('; ', $summary));
    }

    protected function generateSpatialExploration(): void
    {
        $this->log('=== Spatial Exploration ===');
        $spatial = $this->aggregators->buildSpatialPlaces($this->geo, $this->reverseLinks, $this->countryIndex);
        if (!$spatial['locations']) {
            $this->log('  no geocoded, item-referenced locations — skipped');
            return;
        }

        // The same credits as the per-person and per-organisation dashboards.
        $personTerms = $this->personCreditTerms();
        $instTerms = $this->institutionCreditTerms();

        $entityPlaces = [];

        // Build a type's picker rows ([id, label, placeCount], densest first) and
        // populate $entityPlaces[id] = [[locId, origin, current], ...]. High-cardinality
        // types are capped to the top SPATIAL_PICKER_CAP by mapped-place count.
        $buildType = function (array $entities, bool $cap) use (&$entityPlaces): array {
            $rows = [];
            foreach ($entities as $eid => $info) {
                $places = $this->aggregators->placesForItems($info['itemIds'], $this->links, $this->geo);
                if (!$places) {
                    continue;
                }
                // Densest places (origin + current) first.
                uksort($places, static fn ($a, $b) => (($places[$b][0] + $places[$b][1]) <=> ($places[$a][0] + $places[$a][1]))
                    ?: ((int) $a <=> (int) $b));
                $adj = [];
                foreach ($places as $locId => $rc) {
                    $adj[] = [(int) $locId, $rc[0], $rc[1]];
                }
                $rows[] = ['id' => (int) $eid, 'label' => $info['label'], 'adj' => $adj];
            }
            usort($rows, static fn ($a, $b) => (count($b['adj']) <=> count($a['adj']))
                ?: strcmp((string) $a['label'], (string) $b['label'])
                ?: ((int) $a['id'] <=> (int) $b['id']));
            if ($cap && count($rows) > self::SPATIAL_PICKER_CAP) {
                $rows = array_slice($rows, 0, self::SPATIAL_PICKER_CAP);
            }
            $picker = [];
            foreach ($rows as $r) {
                $picker[] = [$r['id'], $r['label'], count($r['adj'])];
                $entityPlaces[$r['id']] = $r['adj'];
            }
            return $picker;
        };

        // Projects (uncapped — ~40): their member research items.
        $projects = [];
        foreach ($this->itemsWhere(fn ($i) => ($i['template_id'] ?? null) === $this->profile->template('projects')) as $pid => $pinfo) {
            $projects[$pid] = ['label' => $pinfo['title'], 'itemIds' => $this->childrenOf[$pid] ?? []];
        }

        // Research sections (uncapped — ~6): items unioned over their child projects.
        $sections = [];
        foreach ($this->itemsOfClass(self::CLASS_SECTION) as $sid => $sinfo) {
            $itemIds = [];
            foreach ($this->childrenOf[$sid] ?? [] as $pid) {
                foreach ($this->childrenOf[$pid] ?? [] as $iid) {
                    $itemIds[] = $iid;
                }
            }
            $sections[$sid] = ['label' => $sinfo['title'], 'itemIds' => $itemIds];
        }

        // People (capped): the items they are credited on.
        $people = [];
        foreach ($this->itemsWhere(fn ($i) => ($i['template_id'] ?? null) === $this->profile->template('persons')) as $pid => $pinfo) {
            $people[$pid] = ['label' => $pinfo['title'], 'itemIds' => $this->linkingItems($pid, $personTerms)];
        }

        // Organisations (capped): items funded by / held by / credited to them.
        $orgs = [];
        foreach ($this->itemsOfClass(self::CLASS_ORGANISATION) as $oid => $oinfo) {
            $orgs[$oid] = ['label' => $oinfo['title'], 'itemIds' => $this->linkingItems($oid, $instTerms)];
        }

        // Subjects (capped): the items they classify (dcterms:subject).
        $subjects = [];
        foreach ($this->itemsWhere(fn ($i) => ($i['template_id'] ?? null) === $this->profile->template('authority')) as $sid => $sinfo) {
            $subjects[$sid] = ['label' => $sinfo['title'], 'itemIds' => $this->linkingItems($sid, ['dcterms:subject'])];
        }

        $pickers = [
            'Project' => $buildType($projects, false),
            'Section' => $buildType($sections, false),
            'Person' => $buildType($people, true),
            'Organisation' => $buildType($orgs, true),
            'Subject' => $buildType($subjects, true),
        ];

        $payload = [
            'meta' => ['locations' => count($spatial['locations'])],
            'types' => ['Project', 'Section', 'Person', 'Organisation', 'Subject'],
            'locations' => $spatial['locations'],
            'countries' => $spatial['countries'],
            'pickers' => $pickers,
            // Force a JSON object even when empty (an empty PHP array encodes as []).
            'entityPlaces' => $entityPlaces ?: new \stdClass(),
        ];
        $this->writeJson($this->outputDir . '/spatial-exploration.json', $payload);
        $this->fileCount++;
        $pickerSummary = [];
        foreach ($pickers as $type => $rows) {
            $pickerSummary[] = $type . '=' . count($rows);
        }
        $this->log('  ' . count($spatial['locations']) . ' locations, ' . count($spatial['countries'])
            . ' countries; pickers: ' . implode(', ', $pickerSummary));
    }

    protected function generateWhatsNew(): void
    {
        $this->log('=== What\'s New ===');
        $projects = $this->itemsWhere(fn ($info) => ($info['template_id'] ?? null) === $this->profile->template('projects'));
        $projectChildren = [];
        foreach ($projects as $pid => $_) {
            $kids = $this->childrenOf[$pid] ?? [];
            if ($kids) {
                $projectChildren[$pid] = $kids;
            }
        }
        $whatsNew = $this->aggregators->buildWhatsNew($this->items, $projectChildren);
        if ($whatsNew) {
            $this->writeJson($this->outputDir . '/whats-new.json', $whatsNew);
            $this->log('  whats-new.json: reference ' . $whatsNew['reference'] . ', ' . count($whatsNew['windows']) . ' windows');
        }
    }
}
