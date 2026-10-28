<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;


final class MediaDashboardGenerator extends DashboardGenerator
{
    public function generate(): int
    {
        $this->generatePublications();
        $this->generateYouTube();
        $this->generatePodcasts();
        return $this->fileCount;
    }

    protected function generatePublications(): void
    {
        $pubs = $this->publicationIds();
        $this->log('=== Publications (' . count($pubs) . ' items in set ' . $this->profile->itemSet('publications') . ') ===');
        if (count($pubs) < 3) {
            return;
        }
        $dashboard = $this->aggregators->aggregateItems($pubs, $this->items, $this->links, $this->itemYear, $this->geo);
        // Places of publication (marcrel:pup → geocoded Location items) as the
        // standard locations map. Publications carry no dcterms:spatial, so
        // aggregateItems left `locations` empty; overriding it here reuses the
        // shared map builder — bubbles sized by publication count, per-place
        // popup lists — with the labels retitled below. Literal-only places
        // (unreconciled, e.g. "München") stay off the map by design.
        if ($v = $this->aggregators->buildLinkedPlacesMap($pubs, $this->links, $this->items, $this->geo, 'marcrel:pup')) {
            $dashboard['locations'] = $v;
        }
        // The countries the publications appeared in — the place of publication's
        // country for books and chapters, the journal's country of origin for
        // articles — shaded under those city bubbles. An overlay key the map
        // reads from the whole dashboard, like geoFlows, not a panel of its own.
        $countryNames = $this->aggregators->loadCountryNames($this->countriesGeojson);
        if ($v = $this->aggregators->buildPublicationCountries($pubs, $this->links, $this->items, $this->geo, $countryNames)) {
            $dashboard['publicationCountries'] = $v;
        }
        // Venues through the records the sync links them to: the Journal an
        // article appeared in (dcterms:isPartOf) and the book series a work
        // belongs to (dcterms:isPartOf for a monograph, dre:series for a book's
        // or chapter's series statement). Unreconciled containers stay literals
        // — mostly edited volumes held nowhere else here — and are not ranked.
        if ($v = $this->aggregators->buildTopLinkedOfClass($pubs, $this->links, $this->items, ['dcterms:isPartOf'], ['bibo:Journal'])) {
            $dashboard['topJournals'] = $v;
        }
        if ($v = $this->aggregators->buildTopLinkedOfClass($pubs, $this->links, $this->items, ['dcterms:isPartOf', 'dre:series'], ['bibo:Series'])) {
            $dashboard['topSeries'] = $v;
        }
        // Publishers: Organisation links, plus any name not yet reconciled.
        if ($v = $this->aggregators->buildTopValues($pubs, $this->links, $this->literals, $this->items, 'dcterms:publisher')) {
            $dashboard['topPublishers'] = $v;
        }
        if ($v = $this->aggregators->buildTopAuthors($pubs, $this->links, $this->literals, $this->items)) {
            $dashboard['topAuthors'] = $v;
        }
        // Funding bodies (frapo:isFundedBy → linked Institution / grant
        // authority items — the DFG, the EXC 2052 grant, partner foundations).
        if ($v = $this->aggregators->buildTopLinked($pubs, $this->links, $this->items, 'frapo:isFundedBy')) {
            $dashboard['funders'] = $v;
        }
        // The whole network, not a top slice: every author or editor with at
        // least one collaborator here, each tagged cluster / partner where the
        // records say so.
        $affiliations = $this->aggregators->personAffiliations($this->items, $this->links,
            $this->profile->clusterCategoryAuthorities(),
            [$this->profile->template('projects'), $this->profile->template('sections')]);
        if ($v = $this->aggregators->buildCoAuthorNetwork($pubs, $this->links, $this->literals, $this->items, 1, PHP_INT_MAX, $affiliations)) {
            $dashboard['coAuthorNetwork'] = $v;
        }
        if ($v = $this->aggregators->buildChord($pubs, $this->links, $this->items)) {
            $dashboard['chord'] = $v;
        }
        if ($v = $this->aggregators->buildStackedTimeline($pubs, $this->links, $this->items, $this->itemYear)) {
            $dashboard['stackedTimeline'] = $v;
        }
        // Abstract word cloud — lemmatised frequencies from the wordclouds Action
        // (asset/data/wordclouds/publications.json), or an in-PHP fallback over the
        // raw bibo:abstract text when that committed input is absent, split by
        // the language each abstract is written in, the words of scholarly prose
        // ("article", "study") flagged for the viewer to hide.
        $absWc = $this->wordCloudInput('publications')
            ?? $this->aggregators->buildMultilingualWordCloud($this->loadTextValues($pubs, 'bibo:abstract'), markAcademic: true);
        if ($absWc) {
            $dashboard['abstractWordcloud'] = $absWc;
        }
        // The publications' place in the shared semantic map, from the offline
        // embeddings build; absent until a build matches this site's revision.
        $typeOf = fn (int $id): ?string => $this->firstLinkedTitle($id, 'dcterms:type')
            ?? ($this->templateLabels[$this->items[$id]['template_id'] ?? 0] ?? null);
        if ($v = $this->similarityPoints($pubs, 'publications', $typeOf, 'Other')) {
            $dashboard['similarity'] = $v;
        }

        // Summary stat cards: total publications, distinct publication types
        // (dcterms:type), languages, and the people credited as authors or editors
        // — distinct linked Person records across bibo:authorList + bibo:editorList.
        $peopleIds = [];
        foreach ($pubs as $iid) {
            foreach ($this->links[$iid] ?? [] as [$term, , $vrid]) {
                if ($term === 'bibo:authorList' || $term === 'bibo:editorList') {
                    $peopleIds[$vrid] = true;
                }
            }
        }
        // Bibliographic breadth cards: distinct journals and book series (the
        // linked records the charts above rank), publishers (links and names
        // alike), and the countries and cities the map shows. The peer-review
        // flag is a link too — the sync links bibo:status to a "Peer reviewed" /
        // "Not peer reviewed" authority item — counted on the exact title (no
        // substring hit for "Not peer reviewed").
        $journalCount = $this->aggregators->countLinkedOfClass($pubs, $this->links, $this->items, ['dcterms:isPartOf'], ['bibo:Journal']);
        $seriesCount = $this->aggregators->countLinkedOfClass($pubs, $this->links, $this->items, ['dcterms:isPartOf', 'dre:series'], ['bibo:Series']);
        $publisherCount = $this->aggregators->countDistinctValues($pubs, $this->links, $this->literals, $this->items, 'dcterms:publisher');
        $cityCount = count($dashboard['locations'] ?? []);
        $peerReviewed = $this->aggregators->countItemsLinkedTo($pubs, $this->links, $this->items, 'bibo:status', 'Peer reviewed');
        // EPub deposits carry their open-access PDF as attached media (ERef
        // records are metadata-only), so "has media" = full text available.
        $fullTexts = $this->countItemsWithMedia($pubs);
        $dashboard['stats'] = $this->aggregators->buildStatCards([
            ['key' => 'publications', 'label' => 'Publications', 'value' => count($pubs)],
            ['key' => 'peerReviewed', 'label' => 'Peer-reviewed', 'value' => $peerReviewed,
                'subtitle' => 'of ' . count($pubs) . ' publications'],
            ['key' => 'fullText', 'label' => 'Full texts', 'value' => $fullTexts,
                'subtitle' => 'open-access PDFs you can read here'],
            ['key' => 'types', 'label' => 'Publication types', 'value' => count($dashboard['types'] ?? [])],
            ['key' => 'languages', 'label' => 'Languages', 'value' => count($dashboard['languages'] ?? [])],
            ['key' => 'people', 'label' => 'Authors and editors', 'value' => count($peopleIds)],
            ['key' => 'journals', 'label' => 'Journals', 'value' => $journalCount,
                'subtitle' => $seriesCount > 0 ? 'and ' . $seriesCount . ' book series' : null],
            ['key' => 'publishers', 'label' => 'Publishers', 'value' => $publisherCount],
            ['key' => 'countries', 'label' => 'Countries of publication', 'value' => count($dashboard['publicationCountries'] ?? []),
                'subtitle' => $cityCount > 0 ? $cityCount . ($cityCount === 1 ? ' city' : ' cities') . ' named as places of publication' : null],
        ]);

        // Publications-specific chart wording, plus the Languages pie. The shared
        // registry renders Languages as a bar chart and titles charts for research
        // items; these per-dashboard overrides retitle them for the bibliography
        // and swap Languages to a pie. Read by renderDashboard() in dashboard.js.
        $dashboard['builders'] = ['languages' => 'buildPieChart'];
        $dashboard['labels'] = [
            'types' => 'Publication types',
            'stackedTimeline' => 'Publications by year and type',
            'locations' => 'Where the publications appeared',
            'topJournals' => 'Journals',
            'topSeries' => 'Book series',
            'topPublishers' => 'Publishers',
            'funders' => 'Funders',
            'coAuthorNetwork' => 'Collaboration network',
            'chord' => 'Keywords that appear together',
            'subjects' => 'Keywords',
            'abstractWordcloud' => 'Words in the abstracts',
            'similarity' => 'Publications by similarity',
        ];
        $dashboard['descriptions'] = [
            'types' => 'The mix of publication types: article, book, chapter, thesis, and so on.',
            'languages' => 'The languages the publications are written in.',
            'stackedTimeline' => 'Publications issued each year, split by type.',
            'locations' => 'Countries are shaded by the number of publications that appeared there: an article counts for the country its journal comes from, a book or chapter for the country of its place of publication. The bubbles mark those places of publication, sized by the number of publications issued there. Click a country or a bubble to list its publications.',
            'topJournals' => 'The journals these publications appear in most often. Click a bar to open the journal\'s page. On a touch screen, the first tap shows the count and a second tap opens the page.',
            'topSeries' => 'The book and working-paper series these publications belong to most often.',
            'topPublishers' => 'The publishers that issued the most of these publications.',
            'funders' => 'The funding bodies credited on these publications. Click a bar to open a funder\'s page. On a touch screen, the first tap shows the count and a second tap opens the page.',
            'topAuthors' => 'The authors credited on the most publications.',
            'coAuthorNetwork' => 'Authors and editors are linked when they appear on the same publication. The chart shows everyone with at least one collaborator. Circle size follows how well connected a person is across the network. Circle colour marks groups who publish together more often than with others, or, if you switch the colouring, whether a person belongs to the Africa Multiple cluster or a partner institution. The colour of a line shows the relationship: co-authorship, author and editor, or co-editorship.',
            'chord' => 'Keywords that are often assigned to the same publication.',
            'subjects' => 'The keywords assigned to these publications most often.',
            'abstractWordcloud' => 'The words that come up most often across the publication abstracts. Words are reduced to their base form, and everyday words such as "the" and "of" are left out.',
            'similarity' => 'Each dot is a publication. Publications about similar topics appear close to each other, even when they are in different languages. Colours show the type of publication. Pale dots are publications with little or no abstract, so their position is less reliable. Click a dot to open the publication. To zoom, use the buttons above the chart or hold Ctrl and scroll. Drag to move around.',
        ];

        $dashboard['resourceType'] = 'publications';
        $this->save('publications', $dashboard);
        $this->log('  publications dashboard written (' . count($pubs) . ' items)');
    }

    protected function generateYouTube(): void
    {
        $videos = $this->youtubeIds();
        $this->log('=== YouTube (' . count($videos) . ' videos in set ' . $this->profile->itemSet('youtube') . ') ===');
        if (count($videos) < 3) {
            return;
        }
        $dashboard = $this->aggregators->aggregateItems($videos, $this->items, $this->links, $this->itemYear, $this->geo);
        if ($v = $this->buildYoutubePlaylists($videos)) {
            $dashboard['playlists'] = $v;
        }
        if ($v = $this->aggregators->buildLanguageTimeline($videos, $this->links, $this->items, $this->itemYear)) {
            $dashboard['languageTimeline'] = $v;
        }
        // Transcript word cloud — lemmatised frequencies from the wordclouds
        // Action (asset/data/wordclouds/youtube.json) when present, else the
        // in-PHP tokeniser over the raw bibo:content captions. Mirrors the
        // Podcasts headline chart.
        $wc = $this->wordCloudInput('youtube')
            ?? $this->aggregators->buildTranscriptWordCloud($this->loadTextValues($videos, 'bibo:content'));
        if ($wc) {
            $dashboard['transcriptWordcloud'] = $wc;
        }
        // Who appears together — speakers (marcrel:spk) featuring on the same
        // video. Speaker credits are manually curated and often sparse, so the
        // panel auto-hides until curation catches up (empty = hidden).
        if ($v = $this->aggregators->buildPersonCollaborationNetwork($videos, $this->items, $this->links, 1)) {
            $dashboard['speakerNetwork'] = $v;
        }
        // The videos' place in the semantic space, coloured by playlist.
        $playlists = array_flip($this->itemSets[$this->profile->itemSet('youtubePlaylists')] ?? []);
        $playlistOf = fn (int $id): ?string => $this->firstLinkedTitle($id, 'dcterms:isPartOf', $playlists);
        if ($v = $this->similarityPoints($videos, 'youtube', $playlistOf, 'Not in a playlist')) {
            $dashboard['similarity'] = $v;
        }

        // Summary stat cards: videos, playlists, languages, and the people
        // credited as speakers (marcrel:spk — manually curated, so often empty).
        $speakerIds = [];
        foreach ($videos as $iid) {
            foreach ($this->links[$iid] ?? [] as [$term, , $vrid]) {
                if ($term === 'marcrel:spk') {
                    $speakerIds[$vrid] = true;
                }
            }
        }
        $dashboard['stats'] = $this->aggregators->buildStatCards([
            ['key' => 'youtube', 'label' => 'Videos', 'value' => count($videos)],
            ['key' => 'playlists', 'label' => 'Playlists', 'value' => count($dashboard['playlists'] ?? [])],
            ['key' => 'languages', 'label' => 'Languages', 'value' => count($dashboard['languages'] ?? [])],
            ['key' => 'people', 'label' => 'Speakers', 'value' => count($speakerIds)],
        ]);

        // YouTube-specific chart wording. The shared registry titles charts for
        // research items; these retitle them for the channel. Read by
        // renderDashboard() in dashboard.js.
        $dashboard['labels'] = [
            'timeline' => 'Videos by year',
            'contributors' => 'Speakers',
            'similarity' => 'Videos by similarity',
        ];
        $dashboard['descriptions'] = [
            'timeline' => 'Videos uploaded each year.',
            'languages' => 'The languages spoken across the channel\'s videos.',
            'languageTimeline' => 'How the mix of languages in the uploads shifts over time.',
            'contributors' => 'The people credited as speakers in the videos.',
            'transcriptWordcloud' => 'The words that come up most often in the video captions. Everyday words and filler such as "um" are left out.',
            'speakerNetwork' => 'People are linked when they appear in the same video, and colour marks groups who appear together often. The picture fills out as more speaker credits are added.',
            'similarity' => 'Each dot is a video. Videos about similar topics appear close to each other, even when they are in different languages. Colours show the playlist. Pale dots are videos with little or no description, so their position is less reliable. Click a dot to open the video. To zoom, use the buttons above the chart or hold Ctrl and scroll. Drag to move around.',
        ];

        $dashboard['resourceType'] = 'youtube';
        $this->save('youtube', $dashboard);
        $this->log('  youtube dashboard written (' . count($videos) . ' videos)');
    }

    protected function generatePodcasts(): void
    {
        $ids = $this->podcastIds();
        $this->log('=== Podcasts (' . count($ids) . ' episodes in set ' . $this->profile->itemSet('podcasts') . ') ===');
        if (count($ids) < 3) {
            return;
        }
        $dashboard = $this->aggregators->aggregateItems($ids, $this->items, $this->links, $this->itemYear, $this->geo);

        // Series (dcterms:isPartOf → series authority items) as a ranked bar.
        if ($v = $this->buildPodcastSeries($ids)) {
            $dashboard['series'] = $v;
        }

        // Durations (dcterms:extent, ISO-8601) and transcripts (bibo:content) for
        // just these episodes, from DataLoader's literal map.
        [$durations, $transcripts] = $this->loadPodcastExtras($ids);
        $totalSeconds = array_sum($durations);
        if ($v = $this->aggregators->buildDurationHistogram($durations)) {
            $dashboard['duration'] = $v;
        }
        // Prefer the lemmatised frequencies from the wordclouds Action
        // (asset/data/wordclouds/podcasts.json); fall back to the in-PHP tokeniser
        // over the raw transcripts when that committed input is absent.
        if ($v = ($this->wordCloudInput('podcasts') ?? $this->aggregators->buildTranscriptWordCloud($transcripts))) {
            $dashboard['transcriptWordcloud'] = $v;
        }

        // The generic item aggregation already supplies the subject frequency
        // cloud and location points. These richer derived views are cheap to
        // build here and remain auto-hidden until the corresponding episode
        // metadata has actually been curated.
        if ($v = $this->aggregators->buildChord($ids, $this->links, $this->items)) {
            $dashboard['chord'] = $v;
        }
        if ($v = $this->aggregators->buildSubjectTrends($ids, $this->links, $this->items, $this->itemYear)) {
            $dashboard['subjectTrends'] = $v;
        }
        if ($v = $this->aggregators->buildChoropleth($ids, $this->links, $this->countryIndex)) {
            $dashboard['choropleth'] = $v;
        }

        // Co-appearance network — people (speakers / hosts / moderators) linked
        // when they feature on the same episode, clustered into communities.
        // Reuses the shared person-collaboration builder; minCooccurrence=1
        // because podcast line-ups are small, so a single shared episode is a
        // meaningful tie (a recurring host becomes a hub to its guests).
        if ($v = $this->aggregators->buildPersonCollaborationNetwork($ids, $this->items, $this->links, 1)) {
            $dashboard['speakerNetwork'] = $v;
        }
        // The episodes' place in the semantic space, coloured by series.
        $seriesOf = fn (int $id): ?string => $this->firstLinkedTitle($id, 'dcterms:isPartOf');
        if ($v = $this->similarityPoints($ids, 'podcasts', $seriesOf, 'No series')) {
            $dashboard['similarity'] = $v;
        }

        // Summary stat cards: episodes, distinct series, distinct speakers
        // (marcrel:spk), total listening time (avg length in the subtitle) and
        // the languages spoken (their names in the subtitle).
        $seriesIds = [];
        $speakerIds = [];
        foreach ($ids as $iid) {
            foreach ($this->links[$iid] ?? [] as [$term, , $vrid]) {
                if ($term === 'dcterms:isPartOf') {
                    $seriesIds[$vrid] = true;
                } elseif ($term === 'marcrel:spk') {
                    $speakerIds[$vrid] = true;
                }
            }
        }
        $langNames = array_map(static fn ($l) => $l['name'], $dashboard['languages'] ?? []);
        $cards = [
            ['key' => 'podcasts', 'label' => 'Episodes', 'value' => count($ids)],
            ['key' => 'series', 'label' => 'Series', 'value' => count($seriesIds)],
            ['key' => 'people', 'label' => 'Speakers', 'value' => count($speakerIds)],
        ];
        if ($totalSeconds > 0 && $durations) {
            $cards[] = [
                'key' => 'duration', 'label' => 'Hours of audio',
                'value' => (int) round($totalSeconds / 3600),
                'subtitle' => (int) round($totalSeconds / count($durations) / 60) . ' minutes per episode on average',
            ];
        }
        $cards[] = [
            'key' => 'languages', 'label' => 'Languages',
            'value' => count($langNames),
            'subtitle' => $langNames ? implode(', ', $langNames) : null,
        ];
        $dashboard['stats'] = $this->aggregators->buildStatCards($cards);

        // Podcast-specific chart wording (the shared registry titles charts for
        // research items). Read by renderDashboard() in dashboard.js.
        $dashboard['labels'] = [
            'transcriptWordcloud' => 'Words in the transcripts',
            'contributors' => 'Speakers and hosts',
            'duration' => 'Episode length',
            'timeline' => 'Episodes by year',
            'series' => 'Episodes by series',
            'speakerNetwork' => 'Who appears together',
            'subjects' => 'Subjects',
            'chord' => 'Subjects that appear together',
            'subjectTrends' => 'Subjects over time',
            'locations' => 'Places the episodes are about',
            'choropleth' => 'Episodes by country',
            'similarity' => 'Episodes by similarity',
        ];
        $dashboard['descriptions'] = [
            'transcriptWordcloud' => 'The words that come up most often across the episode transcripts, which are generated automatically from the audio. Audio cues, speaker names and everyday English and French words are left out.',
            'contributors' => 'The people credited as speakers, hosts or moderators across the episodes.',
            'duration' => 'How long the episodes run, grouped into length bands.',
            'timeline' => 'Podcast episodes published each year.',
            'series' => 'Episodes counted by the series they belong to.',
            'speakerNetwork' => 'People are linked when they feature on the same episode, and colour marks groups who appear together often. A recurring host or guest sits at the centre of many links.',
            'subjects' => 'The subjects assigned to the podcast episodes by the editors.',
            'chord' => 'Subjects that are often assigned to the same episode.',
            'subjectTrends' => 'How the most frequent subjects change from one year of episodes to the next.',
            'locations' => 'The places the episodes are associated with.',
            'choropleth' => 'Episodes counted by the country of the places they are associated with.',
            'similarity' => 'Each dot is an episode. Episodes about similar topics appear close to each other, even when they are in different languages. Colours show the series. Pale dots are episodes with little or no summary, so their position is less reliable. Click a dot to open the episode. To zoom, use the buttons above the chart or hold Ctrl and scroll. Drag to move around.',
        ];

        $dashboard['resourceType'] = 'podcasts';
        $this->save('podcasts', $dashboard);
        $this->log('  podcasts dashboard written (' . count($ids) . ' episodes)');
    }

    protected function buildPodcastSeries(array $ids): ?array
    {
        $counts = [];
        foreach ($ids as $iid) {
            foreach ($this->links[$iid] ?? [] as [$term, , $vrid]) {
                if ($term !== 'dcterms:isPartOf') {
                    continue;
                }
                $title = $this->items[$vrid]['title'] ?? '';
                if ($title === '') {
                    continue;
                }
                $counts[$vrid] ??= ['name' => $title, 'value' => 0, 'itemId' => $vrid];
                $counts[$vrid]['value']++;
            }
        }
        if (!$counts) {
            return null;
        }
        $rows = array_values($counts);
        usort($rows, static fn ($a, $b) => ($b['value'] <=> $a['value'])
            ?: strcmp((string) $a['name'], (string) $b['name'])
            ?: ((int) $a['itemId'] <=> (int) $b['itemId']));
        return $rows;
    }

    protected function countItemsWithMedia(array $ids): int
    {
        return count(array_intersect_key($this->mediaItems, array_fill_keys($ids, true)));
    }

    protected function loadPodcastExtras(array $ids): array
    {
        $durations = [];
        $transcripts = [];
        foreach ($this->loadValueRows($ids, ['dcterms:extent', 'bibo:content']) as $r) {
            $term = (string) $r[1];
            $value = (string) $r[2];
            if ($term === 'dcterms:extent') {
                $secs = self::parseIso8601Duration($value);
                if ($secs > 0) {
                    $durations[] = $secs;
                }
            } elseif ($term === 'bibo:content') {
                $transcripts[] = $value;
            }
        }
        return [$durations, $transcripts];
    }

    protected static function parseIso8601Duration(string $iso): int
    {
        if (!preg_match('/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i', trim($iso), $m)) {
            return 0;
        }
        return ((int) ($m[1] ?? 0)) * 3600 + ((int) ($m[2] ?? 0)) * 60 + ((int) ($m[3] ?? 0));
    }

    protected function wordCloudInput(string $corpus): ?array
    {
        $path = $this->wordcloudsDir . '/' . $corpus . '.php';
        if (!is_file($path)) {
            return null;
        }
        $json = ScopedInput::read($path, $this->sourceScope);
        $byLang = is_array($json) ? ($json['byLang'] ?? null) : null;
        if (!is_array($byLang) || !$byLang) {
            return null;
        }
        $languages = $json['languages'] ?? array_keys($byLang);
        return ['languages' => array_values($languages), 'byLang' => $byLang];
    }

    /** Colours a "by similarity" panel keeps before folding the rest into "Other". */
    protected const SIMILARITY_GROUPS = 8;

    /**
     * One corpus's records for the dashboard's "by similarity" panel, grouped by
     * $groupOf (a record's type, series or playlist; null for none, shown as
     * $ungrouped). The largest SIMILARITY_GROUPS groups keep their own colour,
     * the rest share "Other". Reads the offline map input, which counts only
     * when it was built for this site, profile and revision. Points are
     * [id, x, y, group, faint, title].
     *
     * @param callable(int): ?string $groupOf
     */
    protected function similarityPoints(array $ids, string $corpus, callable $groupOf, string $ungrouped): ?array
    {
        $map = ScopedInput::read($this->paths->embeddingsInputDir() . '/map.php', $this->sourceScope);
        $rows = is_array($map) && is_array($map['items'] ?? null) ? $map['items'] : [];
        // The corpus's own layout, projected from its vectors alone, spreads the
        // records over the panel; the shared map squeezes them into one patch.
        // Builds without one fall back to the shared coordinates.
        $own = [];
        foreach ((is_array($map) ? $map['corpusLayouts'][$corpus] ?? [] : []) as $row) {
            if (is_array($row) && is_int($row[0] ?? null) && is_numeric($row[1] ?? null) && is_numeric($row[2] ?? null)) {
                $own[$row[0]] = [$row[1], $row[2]];
            }
        }
        $wanted = array_flip($ids);
        $records = [];
        $sizes = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $id = $row['id'] ?? null;
            if (($row['type'] ?? null) !== $corpus || !is_int($id) || !isset($wanted[$id])
                || !is_numeric($row['x'] ?? null) || !is_numeric($row['y'] ?? null)) {
                continue;
            }
            [$x, $y] = $own ? ($own[$id] ?? [null, null]) : [$row['x'], $row['y']];
            if ($x === null) {
                continue;
            }
            $group = $groupOf($id) ?? $ungrouped;
            $sizes[$group] = ($sizes[$group] ?? 0) + 1;
            $records[] = [$id, round((float) $x, 4), round((float) $y, 4), $group,
                !empty($row['lowSignal']) ? 1 : 0, (string) ($this->items[$id]['title'] ?? $row['title'] ?? '')];
        }
        if (count($records) < 3) {
            return null;
        }
        // Largest group first, so it takes the first palette colour; "Other"
        // and the ungrouped records come last whatever their size.
        $names = array_keys($sizes);
        usort($names, fn ($a, $b) => (int) ($a === $ungrouped) <=> (int) ($b === $ungrouped)
            ?: $sizes[$b] <=> $sizes[$a] ?: strcmp((string) $a, (string) $b));
        $kept = array_slice(array_values(array_filter($names, fn ($n) => $n !== $ungrouped)), 0, self::SIMILARITY_GROUPS);
        $groups = $kept;
        if (count($kept) < count($names) - (int) isset($sizes[$ungrouped])) {
            $groups[] = 'Other';
        }
        if (isset($sizes[$ungrouped])) {
            $groups[] = $ungrouped;
        }
        // A corpus whose ungrouped records are themselves called "Other" shares one entry.
        $groups = array_values(array_unique($groups));
        $index = array_flip($groups);
        foreach ($records as &$record) {
            $record[3] = $index[$record[3]] ?? $index['Other'];
        }
        unset($record);
        return ['groups' => $groups, 'points' => $records];
    }

    /** A record's first linked item title under $term, optionally only targets in $among. */
    protected function firstLinkedTitle(int $id, string $term, ?array $among = null): ?string
    {
        foreach ($this->links[$id] ?? [] as [$linkTerm, , $target]) {
            if ($linkTerm === $term && ($among === null || isset($among[$target]))
                && ($this->items[$target]['title'] ?? '') !== '') {
                return (string) $this->items[$target]['title'];
            }
        }
        return null;
    }

    protected function loadTextValues(array $ids, string $term): array
    {
        $values = [];
        foreach ($this->loadValueRows($ids, [$term]) as $r) {
            $values[] = (string) $r[2];
        }
        return $values;
    }

    protected function buildYoutubePlaylists(array $videoIds): array
    {
        $videoSet = array_flip($videoIds);
        $out = [];
        foreach ($this->itemSets[$this->profile->itemSet('youtubePlaylists')] ?? [] as $plId) {
            $title = $this->items[$plId]['title'] ?? '';
            if ($title === '') {
                continue;
            }
            $n = 0;
            foreach ($this->childrenOf[$plId] ?? [] as $childId) {
                if (isset($videoSet[$childId])) {
                    $n++;
                }
            }
            if ($n > 0) {
                $out[] = ['name' => $title, 'value' => $n, 'itemId' => (int) $plId];
            }
        }
        usort($out, static fn ($a, $b) => ($b['value'] <=> $a['value']) ?: strcmp((string) $a['name'], (string) $b['name']));
        return $out;
    }
}
